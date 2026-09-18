// main.js — the game loop.

import { callLLM, parseJSONResponse, ApiError } from './api.js';
import { loadSettings, hasApiKey } from './settings.js';
import { tileAt } from './island-gen.js';
import {
  genesisPrompts, midGenesisPrompts,
  arrivalBeatPrompts, actionBeatPrompts,
} from './prompts.js';
import { buildPacingBlock } from './pacing.js';
import { weatherData } from './weather.js';
import { worldBible } from './world.js';
import {
  defaultState, loadState, saveState, clearState,
  revealAround, markVisited, setTileInCache,
  getLocation, setLocation, computeConditionHash,
  advanceTicks, getDay, getHour, getTimeOfDay, formatClock,
  pushGameHistory, pushRecentTile, addTileEvent,
  markHistorySeen,
  START_TICKS,
} from './state.js';
import {
  getHistory, appendUser, appendAssistant, formatForPrompt, clearAll as clearHistory,
} from './history.js';
import {
  movePlayer, applyBeat, checkMidGenesis, tileForDisplay, isAdjacent,
  ensureLocation, isNewLocation, shouldRegenerateChoices,
  filterChoices, markChoiceTaken, rollShallowOceanEntry,
  currentWeather, currentWeatherTomorrow, ensureWeatherForToday,
  applyWeatherToFires,
  gatherOptionsForTile, gatherYield,
  restBonus,
  recipeById, resourceById, canCraft, craftRecipe,
  consumeFromInventory, suppliesSummary, applyStarvationDamage, autoConsume,
  buildingsOnTile,
} from './engine.js';
import { showBanner, hideBanner, showLoading, hideLoading } from './net.js';

let state = loadState();
let busy = false;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------
// GLOBAL MODAL CLOSE
// ---------------------------------------------------------------

const MODAL_TARGETS = {
  weather:   'weather-popover',
  gather:    'gather-modal',
  craft:     'craft-modal',
  inventory: 'inventory-modal',
  history:   'history-modal',
  numpad:    'numpad-modal',
  settings:  'settings-modal',
};

function closeModal(name) {
  const id = MODAL_TARGETS[name] || name;
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function wireGlobalClose() {
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', (e) => {
      const name = el.dataset.close;
      if (!name) return;
      e.stopPropagation();
      closeModal(name);
    });
  });
}

// ---------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------

function renderStats() {
  $('stat-health').textContent = Math.round(state.stats.health);
  $('stat-food').textContent   = Math.round(state.stats.food);
  $('stat-water').textContent  = Math.round(state.stats.water);
  $('stat-morale').textContent = Math.round(state.stats.morale);
}

function renderClock() {
  const tod = getTimeOfDay(state);
  $('clock-day').textContent  = `Day ${getDay(state)}`;
  $('clock-time').textContent = formatClock(state);

  const todLabel = tod === 'dawn' ? '🌅 Dawn'
                  : tod === 'day'  ? '☀ Day'
                  : tod === 'dusk' ? '🌇 Dusk'
                  : '🌙 Night';
  $('clock-tod').textContent = todLabel;

  const scene = $('scene');
  if (scene) {
    scene.dataset.tod = tod;
    scene.dataset.weather = state.weather?.today || 'clear';
  }
}

function renderWeatherIcon() {
  const wx = currentWeather(state);
  $('btn-weather').textContent = wx.icon;
  $('btn-weather').title = wx.name;
}

function renderWeatherPopover() {
  ensureWeatherForToday(state);
  const wx = currentWeather(state);
  const tw = currentWeatherTomorrow(state);

  $('weather-icon').textContent = wx.icon;
  $('weather-name').textContent = wx.name;
  $('weather-sub').textContent  = `Day ${getDay(state)}`;

  const effects = $('weather-effects');
  effects.innerHTML = '';
  for (const e of wx.effects) {
    const p = document.createElement('p');
    p.className = e.className || '';
    p.textContent = e.text;
    effects.appendChild(p);
  }

  $('weather-forecast').textContent = `${tw.icon} ${tw.name}`;
}

function setNarration(title, text) {
  $('narration-title').textContent = title || state.currentLocationName || 'The Island';
  $('narration-text').textContent  = text  || '';
}

function renderViewport() {
  const vp = $('viewport');
  vp.innerHTML = '';

  const cx = state.player.x;
  const cy = state.player.y;
  const fog = state.weather?.today === 'fog';

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;

      const tile = document.createElement('button');
      tile.className = 'vp-tile';
      tile.dataset.x = x;
      tile.dataset.y = y;

      const isCurrent = dx === 0 && dy === 0;
      const orth = Math.abs(dx) + Math.abs(dy) <= 1;
      const revealed = fog ? orth : state.revealed.includes(`${x},${y}`);
      const display = tileForDisplay(state, x, y);

      tile.dataset.revealed = revealed ? 'true' : 'false';
      tile.dataset.biome = display.biome;
      if (isCurrent) tile.dataset.current = 'true';

      const reachable = isAdjacent(cx, cy, x, y) && tileAt(x, y, state.worldSeed).passable;
      tile.dataset.reachable = reachable ? 'true' : 'false';

      if (revealed) {
        const buildings = (state.buildingsByTile?.[`${x},${y}`] || []).map(b => b.id);
        if (buildings.length > 0) {
          const wrap = document.createElement('span');
          wrap.className = 'vp-buildings';
          const seen = new Set();
          for (const bid of buildings) {
            if (seen.has(bid)) continue;
            seen.add(bid);
            const r = recipeById(bid);
            if (r?.glyph) {
              const g = document.createElement('span');
              g.textContent = r.glyph;
              wrap.appendChild(g);
            }
          }
          tile.appendChild(wrap);
        }

        const cached = state.tiles[`${x},${y}`];
        if (cached?.name) {
          const nameEl = document.createElement('span');
          nameEl.className = 'vp-name';
          nameEl.textContent = cached.name;
          tile.appendChild(nameEl);
        }
      }

      if (reachable && !isCurrent) {
        tile.addEventListener('click', () => onTileTap(x, y));
      }

      vp.appendChild(tile);
    }
  }
}

function renderCampLine() {
  const line = $('camp-line');
  const txt = $('camp-line-text');
  const key = `${state.player.x},${state.player.y}`;
  const here = buildingsOnTile(state, state.player.x, state.player.y);

  if (here.length === 0) {
    line.classList.add('hidden');
    return;
  }

  const bonus = restBonus(state, state.player.x, state.player.y);
  const icons = here.map(id => recipeById(id)?.glyph || '').join(' ');
  const tileName = state.tiles[key]?.name || state.currentLocationName || 'Camp';
  const parts = [`${icons} ${tileName}`];
  if (bonus.hpPerHour > 0) parts.push(`+${bonus.hpPerHour} HP/h`);
  if (bonus.moralePerHour > 0) parts.push(`+${bonus.moralePerHour} morale/h`);
  if (bonus.waterPerHour > 0) parts.push(`+${bonus.waterPerHour} water/h`);

  txt.textContent = parts.join('  ·  ');
  line.classList.remove('hidden');
}

function renderSuppliesLine() {
  const line = $('supplies-line');
  const txt = $('supplies-line-text');

  const foodLow = state.stats.food < 50;
  const waterLow = state.stats.water < 50;
  if (!foodLow && !waterLow) {
    line.classList.add('hidden');
    return;
  }

  const summary = suppliesSummary(state);
  const parts = [];
  if (foodLow) {
    if (summary.foods.length === 0) {
      parts.push('🍖 No food');
    } else {
      parts.push('🍖 ' + summary.foods.map(f => `${f.glyph} ${f.count}`).join(' · '));
    }
  }
  if (waterLow) {
    if (summary.waters.length === 0) {
      parts.push('💧 No water');
    } else {
      parts.push('💧 ' + summary.waters.map(w => `${w.glyph} ${w.count}`).join(' · '));
    }
  }

  txt.textContent = parts.join('   ·   ');
  line.classList.remove('hidden');
}

function renderChoices(choices) {
  const el = $('choices');
  el.innerHTML = '';
  if (!Array.isArray(choices)) return;

  for (const c of choices.slice(0, 3)) {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.dataset.risk = c.risk || 'none';
    btn.dataset.choiceId = c.id;
    if (c.tombstone) btn.classList.add('tombstone');

    const label = document.createElement('span');
    label.className = 'choice-label';
    label.textContent = c.label || '…';
    btn.appendChild(label);

    const metaBits = [];
    if (c.costTicks > 0) metaBits.push(`${c.costTicks}h`);
    if (c.variableTicks) metaBits.push('choose hours');
    if (c.hint) metaBits.push(c.hint);
    if (metaBits.length) {
      const meta = document.createElement('span');
      meta.className = 'choice-meta';
      meta.textContent = metaBits.join(' · ');
      btn.appendChild(meta);
    }

    if (c.tombstone) {
      btn.addEventListener('click', () => onTombstoneTap(c));
    } else if (c.variableTicks) {
      btn.addEventListener('click', () => onVariableChoiceTap(c));
    } else {
      btn.addEventListener('click', () => onChoiceTap(c));
    }

    el.appendChild(btn);
  }
}

// ---------------------------------------------------------------
// GENESIS
// ---------------------------------------------------------------

async function runGenesis() {
  showLoading('The island takes shape…');

  const worldSeedStr = `island-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state = defaultState();
  state.worldSeed = worldSeedStr;
  state.totalTicks = START_TICKS;
  ensureWeatherForToday(state);

  const { system, user } = genesisPrompts();

  try {
    const { text } = await callLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      jsonMode: true, jsonFallback: true,
      maxTokens: 30000, temperature: 0.9,
    });

    const island = parseJSONResponse(text);
    state.islandSeed = island;
    state.started = true;

    state.player.x = 0;
    state.player.y = 0;
    state.day = 1;
    state.lastBeatDay = 1;
    markVisited(state, 0, 0);
    revealAround(state, 0, 0, 1);

    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const t = tileAt(x, y, state.worldSeed);
        setTileInCache(state, x, y, { biome: t.biome });
      }
    }

    const campLoc = ensureLocation(state, 0, 0);
    if (island.camp?.name) {
      state.currentLocationName = island.camp.name;
      campLoc.name = island.camp.name;
      const t = state.tiles['0,0'] || {};
      t.name = island.camp.name;
      state.tiles['0,0'] = t;
    }

    pushRecentTile(state, 0, 0, state.currentLocationName);
    pushGameHistory(state, 'gm', island.opening_scene || 'You are alone.');
    markHistorySeen(state);

    saveState(state);
    hideLoading();

    setNarration(island.island_name || 'The Island', island.opening_scene || 'You are alone.');
    renderStats();
    renderClock();
    renderWeatherIcon();
    renderViewport();
    renderCampLine();
    renderSuppliesLine();

    renderChoices([
      { id: 'look',     label: 'Look around the beach',    risk: 'none', costTicks: 0 },
      { id: 'wreck',    label: 'Search the wreck',         risk: 'low',  costTicks: 2, hint: 'The tide is rising.' },
      { id: 'treeline', label: 'Walk toward the treeline', risk: 'low',  costTicks: 1 },
    ]);

    appendUser(`(Opening) I wake on the beach. The island is ${island.island_name}.`);
    appendAssistant(island.opening_scene || 'You are alone.');
  } catch (err) {
    hideLoading();
    handleError(err);
    throw err;
  }
}

// ---------------------------------------------------------------
// BEAT
// ---------------------------------------------------------------

async function runBeat(action, opts = {}) {
  if (busy) return;
  if (!state.islandSeed) return;

  busy = true;
  showLoading(opts.loadingText || '…');

  appendUser(formatAction(action));

  const pacing = buildPacingBlock({
    radius: state.maxRadius,
    daysSinceBeat: getDay(state) - state.lastBeatDay,
    seed: state.islandSeed,
    threadsProgressed: state.threadsProgressed,
  });

  const loc = getLocation(state, state.player.x, state.player.y);
  const wx = currentWeather(state);
  const tw = currentWeatherTomorrow(state);

  const locationContext = {
    name: state.currentLocationName,
    biome: loc?.biome || 'unknown',
    isNew: opts.isNewLocation || false,
    cachedChoices: opts.cachedChoices || null,
    permanentFacts: loc?.permanentFacts || [],
    log: (loc?.log || []).slice(-6),
    recentTiles: state.recentTiles || [],
    weatherInfo: {
      today: wx.name,
      todayId: wx.id,
      effects: wx.effects.map(e => e.text),
      tomorrow: tw.name,
    },
  };

  const historyStr = formatForPrompt(getHistory());

  const promptBuilder = opts.mode === 'action' ? actionBeatPrompts : arrivalBeatPrompts;

  const { system, user } = promptBuilder({
    worldSeed: state.islandSeed,
    state: {
      day: getDay(state),
      hour: getHour(state),
      timeOfDay: getTimeOfDay(state),
      weather: state.weather?.today,
      stats: state.stats,
      inventory: state.inventory,
      tools: state.tools,
      position: { x: state.player.x, y: state.player.y },
      currentLocationName: state.currentLocationName,
      threadsProgressed: state.threadsProgressed,
      flags: state.flags,
      maxRadius: state.maxRadius,
      buildingsHere: buildingsOnTile(state, state.player.x, state.player.y),
    },
    history: historyStr,
    action,
    pacing,
    locationContext,
  });

  try {
    const { text } = await callLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      jsonMode: true, jsonFallback: true,
      maxTokens: opts.mode === 'action' ? 600 : 2000,
      temperature: 0.85,
    });

    const beat = parseJSONResponse(text);
    applyBeat(state, beat);
    appendAssistant(JSON.stringify(beat));
    pushGameHistory(state, 'gm', beat.narration || '');
    markHistorySeen(state);

    if (Array.isArray(beat.choices) && opts.mode !== 'action') {
      const curLoc = ensureLocation(state, state.player.x, state.player.y);
      curLoc.choices = beat.choices.slice(0, 3);
      curLoc.generatedAtTick = state.totalTicks;
      curLoc.conditionHash = computeConditionHash(state, state.player.x, state.player.y);
    }

    saveState(state);

    setNarration(beat.location?.name || state.currentLocationName, beat.narration || '');
    renderStats();
    renderClock();
    renderWeatherIcon();
    renderViewport();
    renderCampLine();
    renderSuppliesLine();

    const curLoc = getLocation(state, state.player.x, state.player.y);
    renderChoices(filterChoices(state, curLoc));

    hideLoading();

    const band = checkMidGenesis(state);
    if (band) {
      runMidGenesis(band).catch(err => console.warn('mid-genesis failed', err));
    }
  } catch (err) {
    appendUser('(call failed)');
    hideLoading();
    handleError(err);
  } finally {
    busy = false;
  }
}

function formatAction(action) {
  if (typeof action === 'string') return action;
  if (action.type === 'move')    return `I move to (${action.x}, ${action.y}).`;
  if (action.type === 'arrive')  return `I arrive at (${action.x}, ${action.y}). What do I see?`;
  if (action.type === 'choice')  return `I choose: ${action.label}${action.hours ? ` (${action.hours} hours)` : ''}.`;
  if (action.type === 'bar')     return `I ${action.action}${action.hours ? ` for ${action.hours} hours` : ''}.`;
  return JSON.stringify(action);
}

// ---------------------------------------------------------------
// MID-GENESIS
// ---------------------------------------------------------------

async function runMidGenesis(band) {
  if (!state.islandSeed) return;
  const existingIds = (state.islandSeed.early_locations || []).map(l => l.id);
  const recentNarration = getHistory().slice(-3).map(h => h.content).join(' / ');

  const { system, user } = midGenesisPrompts({
    worldSeed: state.islandSeed,
    currentRadius: state.maxRadius,
    targetRadius: band,
    recentNarration,
    existingLocationIds: existingIds,
  });

  try {
    const { text } = await callLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      jsonMode: true, jsonFallback: true,
      maxTokens: 8000, temperature: 0.85,
    });

    const result = parseJSONResponse(text);
    if (Array.isArray(result.new_locations)) {
      state.islandSeed.early_locations = [
        ...(state.islandSeed.early_locations || []),
        ...result.new_locations,
      ];
      for (const loc of result.new_locations) {
        if (loc.position && typeof loc.position.x === 'number') {
          const key = `${loc.position.x},${loc.position.y}`;
          const t = state.tiles[key] || {};
          t.name = loc.name;
          state.tiles[key] = t;
        }
      }
      saveState(state);
    }
  } catch (e) {
    console.warn('mid-genesis error', e);
  }
}

// ---------------------------------------------------------------
// TILE TAP
// ---------------------------------------------------------------

async function onTileTap(x, y) {
  if (busy) return;

  const tile = tileAt(x, y, state.worldSeed);
  if (!tile.passable) {
    setNarration(state.currentLocationName, 'The way is blocked.');
    return;
  }

  const beforeDay = getDay(state);
  const move = movePlayer(state, x, y);
  if (!move.ok) return;

  const afterDay = getDay(state);
  if (afterDay !== beforeDay) {
    ensureWeatherForToday(state);
    const removed = applyWeatherToFires(state);
    if (removed.length) {
      console.log('[weather] fires went out:', removed);
    }
  }

  // Starvation damage from any tick advance that skipped a beat
  applyStarvationDamage(state, 1);

  pushRecentTile(state, x, y, null);
  pushGameHistory(state, 'player', `Moved to (${x}, ${y})`);

  renderStats();
  renderClock();
  renderWeatherIcon();
  renderViewport();
  renderCampLine();
  renderSuppliesLine();
  saveState(state);

  if (move.biome === 'ocean_shallow') {
    const roll = rollShallowOceanEntry(state, x, y);
    applyBeat(state, { state_delta: roll.delta, beat_type: 'flavour' });
    setNarration(state.currentLocationName, roll.text);
    pushGameHistory(state, 'gm', roll.text);
    renderStats();
    renderSuppliesLine();
    saveState(state);
  }

  const loc = ensureLocation(state, x, y);
  const isNew = isNewLocation(state, x, y);
  const needsRegen = isNew || shouldRegenerateChoices(state, x, y);

  if (needsRegen) {
    await runBeat(
      { type: 'arrive', x, y },
      { isNewLocation: isNew, cachedChoices: loc.choices || null, mode: 'arrival' }
    );
  } else {
    renderChoices(filterChoices(state, loc));
    setNarration(loc.name || state.currentLocationName, 'You return.');
    saveState(state);
  }
}

// ---------------------------------------------------------------
// CHOICE TAPS
// ---------------------------------------------------------------

async function onChoiceTap(choice) {
  if (busy) return;

  pushGameHistory(state, 'player', `Chose: ${choice.label}`);

  if (choice.moves_to && typeof choice.moves_to.x === 'number') {
    const nx = choice.moves_to.x;
    const ny = choice.moves_to.y;
    if (isAdjacent(state.player.x, state.player.y, nx, ny)) {
      const m = movePlayer(state, nx, ny);
      if (m.ok) {
        pushRecentTile(state, nx, ny, null);
        pushGameHistory(state, 'player', `Moved to (${nx}, ${ny})`);
        renderViewport();
        renderClock();
        const afterDay = getDay(state);
        if (afterDay !== state.weatherDay) ensureWeatherForToday(state);
      }
    }
  } else if (choice.costTicks > 0) {
    advanceTicks(state, choice.costTicks);
    autoConsume(state);
    applyStarvationDamage(state, choice.costTicks);
    renderClock();
  }

  if (choice.permanent) {
    const loc = getLocation(state, state.player.x, state.player.y);
    if (loc) markChoiceTaken(state, loc, choice.id, true);
  }

  renderStats();
  renderSuppliesLine();
  saveState(state);
  await runBeat({ type: 'choice', id: choice.id, label: choice.label }, { mode: 'action' });
}

function onTombstoneTap(choice) {
  const loc = getLocation(state, state.player.x, state.player.y);
  if (!loc || !Array.isArray(loc.choices)) return;
  loc.choices = loc.choices.filter(c => c.id !== choice.id);
  pushGameHistory(state, 'player', `Dismissed: ${choice.label}`);
  saveState(state);
  renderChoices(filterChoices(state, loc));
}

async function onVariableChoiceTap(choice) {
  if (busy) return;
  openNumpad(choice.label, async (hours) => {
    if (!hours || hours <= 0) return;
    advanceTicks(state, hours);
    autoConsume(state);
    applyStarvationDamage(state, hours);
    renderClock();
    renderStats();
    renderSuppliesLine();
    saveState(state);
    await runBeat({ type: 'choice', id: choice.id, label: choice.label, hours }, { mode: 'action' });
  });
}

// ---------------------------------------------------------------
// NUMPAD
// ---------------------------------------------------------------

let numpadValue = '';
let numpadConfirm = null;

function openNumpad(subtitle, onConfirm) {
  numpadValue = '';
  numpadConfirm = onConfirm;
  $('numpad-sub').textContent = subtitle;
  $('numpad-display').textContent = '0';
  $('numpad-modal').classList.remove('hidden');
}

function closeNumpad() {
  $('numpad-modal').classList.add('hidden');
  numpadValue = '';
  numpadConfirm = null;
}

function wireNumpad() {
  document.querySelectorAll('.np-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      if (k === 'C') numpadValue = '';
      else if (k === '←') numpadValue = numpadValue.slice(0, -1);
      else if (numpadValue.length < 2) numpadValue += k;
      $('numpad-display').textContent = numpadValue || '0';
    });
  });

  $('btn-numpad-cancel').addEventListener('click', closeNumpad);
  $('btn-numpad-confirm').addEventListener('click', async () => {
    const hours = parseInt(numpadValue || '0', 10);
    const fn = numpadConfirm;
    closeNumpad();
    if (fn && hours > 0) await fn(hours);
  });
}

// ---------------------------------------------------------------
// WEATHER POPOVER
// ---------------------------------------------------------------

function wireWeatherPopover() {
  $('btn-weather').addEventListener('click', () => {
    renderWeatherPopover();
    $('weather-popover').classList.remove('hidden');
  });
}

// ---------------------------------------------------------------
// GATHER MODAL
// ---------------------------------------------------------------

function openGatherModal() {
  const body = $('gather-body');
  body.innerHTML = '';
  const options = gatherOptionsForTile(state);

  if (options.length === 0) {
    const p = document.createElement('p');
    p.className = 'inv-empty';
    p.textContent = 'There is nothing to gather here.';
    body.appendChild(p);
    $('gather-modal').classList.remove('hidden');
    return;
  }

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.className = 'menu-item' + (opt.hasTool || !opt.tool ? '' : ' locked');
    btn.disabled = !!opt.tool && !opt.hasTool;

    const icon = document.createElement('span');
    icon.className = 'menu-item-icon';
    icon.textContent = opt.icon;
    btn.appendChild(icon);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'menu-item-body';

    const name = document.createElement('div');
    name.className = 'menu-item-name';
    name.textContent = opt.name;
    bodyEl.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'menu-item-desc';
    desc.textContent = opt.desc;
    bodyEl.appendChild(desc);

    if (opt.tool && !opt.hasTool) {
      const meta = document.createElement('div');
      meta.className = 'menu-item-meta';
      const t = document.createElement('span');
      t.className = 'm-cost missing';
      t.textContent = `requires ${opt.tool}`;
      meta.appendChild(t);
      bodyEl.appendChild(meta);
    }

    btn.appendChild(bodyEl);

    if (opt.hasTool || !opt.tool) {
      btn.addEventListener('click', () => {
        $('gather-modal').classList.add('hidden');
        openNumpad(`How many hours gathering ${opt.name}?`, async (hours) => {
          await doGather(opt, hours);
        });
      });
    }

    body.appendChild(btn);
  }

  $('gather-modal').classList.remove('hidden');
}

async function doGather(opt, hours) {
  if (busy) return;
  busy = true;

  const result = gatherYield(state, opt.id, hours);
  advanceTicks(state, hours);
  autoConsume(state);
  applyStarvationDamage(state, hours);

  if (result.qty > 0) {
    state.inventory[opt.id] = (state.inventory[opt.id] || 0) + result.qty;
    if (opt.id === 'berries' || opt.id === 'fish' || opt.id === 'meat') {
      addTileEvent(state, state.player.x, state.player.y, `${opt.id}_gathered`);
    }
  }

  pushGameHistory(state, 'player',
    `Gathered ${opt.name} for ${hours}h. Found ${result.qty}.`);

  renderStats();
  renderClock();
  renderSuppliesLine();
  saveState(state);

  busy = false;

  await runBeat(
    {
      type: 'bar',
      action: 'gather',
      resource: opt.id,
      resourceName: opt.name,
      hours,
      qty: result.qty,
    },
    { mode: 'action', loadingText: 'Gathering…' }
  );
}

// ---------------------------------------------------------------
// CRAFT MODAL
// ---------------------------------------------------------------

function openCraftModal() {
  const body = $('craft-body');
  body.innerHTML = '';

  const kinds = [
    { key: 'camp',  title: 'Camp Structures' },
    { key: 'tool',  title: 'Tools' },
    { key: 'item',  title: 'Items' },
  ];

  for (const k of kinds) {
    const recipes = (worldBible.recipes || []).filter(r => r.kind === k.key);
    if (recipes.length === 0) continue;

    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = k.title;
    body.appendChild(title);

    for (const r of recipes) {
      const check = canCraft(state, r.id);
      const btn = document.createElement('button');
      btn.className = 'menu-item' + (check.ok ? '' : ' locked');
      btn.disabled = !check.ok;

      const icon = document.createElement('span');
      icon.className = 'menu-item-icon';
      icon.textContent = r.glyph || '·';
      btn.appendChild(icon);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'menu-item-body';

      const name = document.createElement('div');
      name.className = 'menu-item-name';
      name.textContent = r.name;
      bodyEl.appendChild(name);

      const desc = document.createElement('div');
      desc.className = 'menu-item-desc';
      desc.textContent = r.desc || '';
      bodyEl.appendChild(desc);

      const meta = document.createElement('div');
      meta.className = 'menu-item-meta';

      const costParts = Object.entries(r.cost || {}).map(([k2, v]) => {
        const have = state.inventory[k2] || 0;
        const cls = have >= v ? 'm-cost afford' : 'm-cost missing';
        return `<span class="${cls}">${v} ${k2}</span>`;
      });
      meta.innerHTML = costParts.join(' · ');

      const time = document.createElement('span');
      time.className = 'm-time';
      time.textContent = ` · ${r.costTicks || 1}h`;
      meta.appendChild(time);

      bodyEl.appendChild(meta);

      if (!check.ok && check.reason) {
        const why = document.createElement('div');
        why.className = 'menu-item-meta';
        why.innerHTML = `<span class="m-cost missing">${check.reason}</span>`;
        bodyEl.appendChild(why);
      }

      btn.appendChild(bodyEl);

      if (check.ok) {
        btn.addEventListener('click', () => {
          $('craft-modal').classList.add('hidden');
          const result = craftRecipe(state, r.id);
          if (result.ok) {
            renderStats();
            renderClock();
            renderViewport();
            renderCampLine();
            renderSuppliesLine();
            saveState(state);
            setNarration(state.currentLocationName, `You made a ${r.name}.`);
          }
        });
      }

      body.appendChild(btn);
    }
  }

  $('craft-modal').classList.remove('hidden');
}

// ---------------------------------------------------------------
// INVENTORY MODAL
// ---------------------------------------------------------------

function openInventoryModal() {
  const body = $('inventory-body');
  body.innerHTML = '';

  // Edible resources (food/water)
  const edibleResources = (worldBible.resources || []).filter(r =>
    r.edible && (state.inventory[r.id] || 0) > 0
  );
  if (edibleResources.length > 0) {
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Food & Drink';
    body.appendChild(title);

    for (const r of edibleResources) {
      const row = document.createElement('button');
      row.className = 'menu-item consumable';
      const kindLabel = r.edible.food && r.edible.water ? 'food & water'
                      : r.edible.food ? `+${r.edible.food} food`
                      : `+${r.edible.water} water`;
      const risky = r.edible.sickChance ? ' · raw, risky' : '';
      row.innerHTML = `
        <span class="menu-item-icon">${r.glyph}</span>
        <div class="menu-item-body">
          <div class="menu-item-name">${r.name}</div>
          <div class="menu-item-desc">${kindLabel}${risky}</div>
        </div>
        <span class="inv-count">${state.inventory[r.id]}</span>
        <span class="menu-item-right">use</span>
      `;
      row.addEventListener('click', () => {
        const res = consumeFromInventory(state, 'resource', r.id);
        if (res.ok) {
          renderStats();
          renderSuppliesLine();
          saveState(state);
          openInventoryModal();
        }
      });
      body.appendChild(row);
    }
  }

  // Crafted items
  const crafted = Object.entries(state.craftedItems || {}).filter(([_, n]) => n > 0);
  if (crafted.length > 0) {
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Items';
    body.appendChild(title);
    for (const [iid, count] of crafted) {
      const r = recipeById(iid);
      const isConsumable = r?.effects?.consumable;
      const row = document.createElement(isConsumable ? 'button' : 'div');
      row.className = 'menu-item' + (isConsumable ? ' consumable' : '');
      row.innerHTML = `
        <span class="menu-item-icon">${r?.glyph || '·'}</span>
        <div class="menu-item-body">
          <div class="menu-item-name">${r?.name || iid}</div>
          <div class="menu-item-desc">${r?.desc || ''}</div>
        </div>
        <span class="inv-count">${count}</span>
        ${isConsumable ? '<span class="menu-item-right">use</span>' : ''}
      `;
      if (isConsumable) {
        row.addEventListener('click', () => {
          const res = consumeFromInventory(state, 'item', iid);
          if (res.ok) {
            renderStats();
            renderSuppliesLine();
            saveState(state);
            openInventoryModal();
          }
        });
      }
      body.appendChild(row);
    }
  }

  // Raw resources (non-edible)
  const resources = worldBible.resources.filter(r =>
    !r.edible && (state.inventory[r.id] || 0) > 0
  );
  if (resources.length > 0) {
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Materials';
    body.appendChild(title);
    for (const r of resources) {
      const row = document.createElement('div');
      row.className = 'menu-item';
      row.innerHTML = `
        <span class="menu-item-icon">${r.glyph}</span>
        <div class="menu-item-body">
          <div class="menu-item-name">${r.name}</div>
        </div>
        <span class="inv-count">${state.inventory[r.id]}</span>
      `;
      body.appendChild(row);
    }
  }

  // Tools
  if (state.tools.length > 0) {
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Tools';
    body.appendChild(title);
    for (const tid of state.tools) {
      const r = recipeById(tid);
      if (!r) continue;
      const row = document.createElement('div');
      row.className = 'menu-item';
      row.innerHTML = `
        <span class="menu-item-icon">${r.glyph}</span>
        <div class="menu-item-body">
          <div class="menu-item-name">${r.name}</div>
          <div class="menu-item-desc">${r.desc || ''}</div>
        </div>
      `;
      body.appendChild(row);
    }
  }

  // Camp
  const camps = Object.entries(state.buildingsByTile || {}).filter(([_, list]) => list.length > 0);
  if (camps.length > 0) {
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Camp';
    body.appendChild(title);
    for (const [key, list] of camps) {
      const tileName = state.tiles[key]?.name || `(${key})`;
      const row = document.createElement('div');
      row.className = 'menu-item';
      const icons = list.map(b => recipeById(b.id)?.glyph || '').join(' ');
      row.innerHTML = `
        <span class="menu-item-icon">${icons}</span>
        <div class="menu-item-body">
          <div class="menu-item-name">${tileName}</div>
          <div class="menu-item-desc">${list.map(b => recipeById(b.id)?.name || b.id).join(', ')}</div>
        </div>
      `;
      body.appendChild(row);
    }
  }

  if (body.children.length === 0) {
    const p = document.createElement('p');
    p.className = 'inv-empty';
    p.textContent = 'You carry nothing yet.';
    body.appendChild(p);
  }

  $('inventory-modal').classList.remove('hidden');
}

// ---------------------------------------------------------------
// HISTORY MODAL
// ---------------------------------------------------------------

function openHistoryModal() {
  const body = $('history-body');
  body.innerHTML = '';
  const hist = state.history || [];

  if (hist.length === 0) {
    const p = document.createElement('p');
    p.className = 'inv-empty';
    p.textContent = 'Nothing has happened yet.';
    body.appendChild(p);
    $('history-modal').classList.remove('hidden');
    return;
  }

  let lastDay = null;
  for (const entry of hist) {
    if (entry.day !== lastDay) {
      const d = document.createElement('div');
      d.className = 'history-day';
      d.textContent = `Day ${entry.day}`;
      body.appendChild(d);
      lastDay = entry.day;
    }
    const el = document.createElement('div');
    el.className = `history-entry role-${entry.role}`;
    el.textContent = entry.text;
    body.appendChild(el);
  }

  $('history-modal').classList.remove('hidden');
  body.scrollTop = body.scrollHeight;
}

// ---------------------------------------------------------------
// MANUAL
// ---------------------------------------------------------------

let manualPage = 1;
const MANUAL_PAGES = 5;
let manualReady = false;
let manualContinue = null;

function renderManual() {
  document.querySelectorAll('.manual-page').forEach(p => {
    p.classList.toggle('hidden', parseInt(p.dataset.page, 10) !== manualPage);
  });
  $('manual-progress').textContent = `${manualPage} / ${MANUAL_PAGES}`;
  $('btn-manual-prev').disabled = manualPage <= 1;

  const next = $('btn-manual-next');
  if (manualPage < MANUAL_PAGES) {
    next.textContent = 'Continue';
    next.disabled = false;
  } else {
    next.textContent = manualReady ? 'Enter the island' : 'Loading…';
    next.disabled = !manualReady;
  }
}

function openManual(onContinue) {
  manualPage = 1;
  manualReady = false;
  manualContinue = onContinue;
  renderManual();
  $('manual-modal').classList.remove('hidden');
}

function closeManual() {
  $('manual-modal').classList.add('hidden');
}

function setManualReady() {
  manualReady = true;
  if (manualPage === MANUAL_PAGES) renderManual();
}

function wireManual() {
  $('btn-manual-prev').addEventListener('click', () => {
    if (manualPage > 1) { manualPage--; renderManual(); }
  });
  $('btn-manual-next').addEventListener('click', async () => {
    if (manualPage < MANUAL_PAGES) {
      manualPage++;
      renderManual();
    } else if (manualReady && manualContinue) {
      closeManual();
      await manualContinue();
    }
  });
}

// ---------------------------------------------------------------
// ACTION BAR
// ---------------------------------------------------------------

function wireActionBar() {
  document.querySelectorAll('.action').forEach(btn => {
    btn.addEventListener('click', () => {
      if (busy) return;
      if (!hasApiKey()) { openSettings(); return; }
      if (!state.islandSeed) return;
      const action = btn.dataset.action;

      if (action === 'gather')    return openGatherModal();
      if (action === 'craft')     return openCraftModal();
      if (action === 'inventory') return openInventoryModal();

      if (action === 'rest') {
        openNumpad('How many hours will you rest?', async (hours) => {
          const bonus = restBonus(state, state.player.x, state.player.y);
          advanceTicks(state, hours);
          const hpGain = bonus.hpPerHour * hours;
          const moGain = bonus.moralePerHour * hours;
          const waGain = bonus.waterPerHour * hours;
          const foodCost = Math.max(0, Math.round(hours * 0.6));
          applyBeat(state, {
            state_delta: {
              health: hpGain,
              morale: moGain,
              water: waGain - Math.round(hours * 0.4),
              food: -foodCost,
            },
          });
          autoConsume(state);
          applyStarvationDamage(state, hours);
          pushGameHistory(state, 'player', `Rested for ${hours}h.`);
          renderStats();
          renderClock();
          renderSuppliesLine();
          saveState(state);
          await runBeat(
            { type: 'bar', action, hours },
            { mode: 'action', loadingText: 'Resting…' }
          );
        });
      }
    });
  });
}

// ---------------------------------------------------------------
// ERROR
// ---------------------------------------------------------------

function handleError(err) {
  console.error('game error', err);
  let msg = 'Something went wrong.';
  if (err instanceof ApiError) {
    if (err.code === 'NO_KEY') msg = 'No API key set. Open settings (⚙).';
    else if (err.status === 401 || err.status === 403) msg = 'API key rejected.';
    else if (err.status === 429) msg = 'Rate limited. Wait, then retry.';
    else if (err.code === 'EMPTY_CONTENT') msg = 'Model returned empty. Retry?';
    else if (err.code === 'PARSE') msg = 'Invalid JSON from model. Retry?';
    else msg = err.message || msg;
  }
  showBanner(msg, () => {
    hideBanner();
  });
}

// ---------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------

function openSettings() {
  $('settings-modal').classList.remove('hidden');
}

function wireSettingsButtons() {
  const btnHistory = $('btn-show-history');
  if (btnHistory) btnHistory.addEventListener('click', openHistoryModal);

  const btnManual = $('btn-show-manual');
  if (btnManual) btnManual.addEventListener('click', () => openManual(null));
}

// ---------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  wireGlobalClose();
  wireActionBar();
  wireNumpad();
  wireWeatherPopover();
  wireManual();
  wireSettingsButtons();

  const openingEl = $('opening');
  const btnBegin = $('btn-begin');

  if (!state.started || !state.islandSeed) {
    openingEl.classList.remove('hidden');
    btnBegin.addEventListener('click', async () => {
      openingEl.classList.add('hidden');
      if (!hasApiKey()) {
        openSettings();
        setNarration('Settings', 'Add your DeepSeek API key (⚙), then tap New Game.');
        return;
      }

      state.manualSeen = true;
      saveState(state);

      let genesisDone = false;
      let genesisError = null;

      const genesisPromise = runGenesis()
        .then(() => { genesisDone = true; setManualReady(); })
        .catch(err => { genesisError = err; setManualReady(); });

      openManual(async () => {
        if (genesisError) {
          handleError(genesisError);
          return;
        }
        if (!genesisDone) {
          await genesisPromise;
        }
      });
    });
  } else {
    ensureWeatherForToday(state);
    renderStats();
    renderClock();
    renderWeatherIcon();
    renderViewport();
    renderCampLine();
    renderSuppliesLine();
    const loc = getLocation(state, state.player.x, state.player.y);
    if (loc) renderChoices(filterChoices(state, loc));
    const last = getHistory().slice(-1)[0];
    if (last) setNarration(state.currentLocationName, stripJsonIfAny(last.content));
    else setNarration(state.currentLocationName, 'You are here.');
  }

  const btnNewGame = $('btn-new-game');
  if (btnNewGame) {
    btnNewGame.addEventListener('click', async () => {
      if (!confirm('Start a new game? Current progress will be lost.')) return;
      clearState(); clearHistory();
      state = defaultState();
      $('settings-modal').classList.add('hidden');
      if (!hasApiKey()) { setNarration('Settings', 'Add your API key first.'); return; }

      let genesisDone = false;
      let genesisError = null;

      const genesisPromise = runGenesis()
        .then(() => { genesisDone = true; setManualReady(); })
        .catch(err => { genesisError = err; setManualReady(); });

      openManual(async () => {
        if (genesisError) { handleError(genesisError); return; }
        if (!genesisDone) await genesisPromise;
      });
    });
  }

  const btnResetSave = $('btn-reset-save');
  if (btnResetSave) {
    btnResetSave.addEventListener('click', () => {
      if (!confirm('Reset everything? This clears the save and history.')) return;
      clearState(); clearHistory();
      location.reload();
    });
  }
});

function stripJsonIfAny(str) {
  if (!str) return '';
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed.narration === 'string') return parsed.narration;
  } catch {}
  return str.length > 400 ? str.slice(0, 400) + '…' : str;
}
