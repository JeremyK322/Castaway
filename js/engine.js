// engine.js — game rules. No DOM. No network.

import { tileAt } from './island-gen.js';
import { weatherData, weatherForTick } from './weather.js';
import { worldBible } from './world.js';
import {
  applyDelta, revealAround, markVisited, setTileInCache,
  getLocation, setLocation, newLocationRecord,
  computeConditionHash, advanceTicks, getDay, getTimeOfDay,
  pushGameHistory,
} from './state.js';
import { shouldFireMidGenesis } from './pacing.js';

// ---------- weather ----------

/**
 * Called after every tick advance. If the current weather has expired,
 * rolls a new one and sets state.pendingWeatherChange.
 */
export function ensureWeatherForTick(state) {
  if (!state.weather) {
    state.weather = {
      current: 'clear',
      expiresAtTick: state.totalTicks + 12,
      rolledAtTick: state.totalTicks,
    };
    state.pendingWeatherChange = null;
    return { changed: false };
  }

  if (state.totalTicks < state.weather.expiresAtTick) {
    return { changed: false };
  }

  const prev = state.weather.current;
  const next = weatherForTick(state.totalTicks, state.worldSeed);
  const duration = weatherDuration(next, state.totalTicks, state.worldSeed);

  state.weather = {
    current: next,
    expiresAtTick: state.totalTicks + duration,
    rolledAtTick: state.totalTicks,
  };

  if (prev !== next) {
    state.pendingWeatherChange = {
      from: prev,
      to: next,
      atTick: state.totalTicks,
    };
    return { changed: true, from: prev, to: next };
  }
  return { changed: false };
}

export function currentWeather(state) {
  return weatherData(state.weather?.current || 'clear');
}

export function hoursSinceWeatherRoll(state) {
  if (!state.weather) return 0;
  return Math.max(0, state.totalTicks - state.weather.rolledAtTick);
}

// ---------- compass ----------

const DIRECTIONS = [
  ['north',     0, -1],
  ['northeast', 1, -1],
  ['east',      1,  0],
  ['southeast', 1,  1],
  ['south',     0,  1],
  ['southwest',-1,  1],
  ['west',     -1,  0],
  ['northwest',-1, -1],
];

export function adjacentTiles(state) {
  const out = {};
  for (const [dir, dx, dy] of DIRECTIONS) {
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    const t = tileAt(x, y, state.worldSeed);
    const cached = state.tiles[`${x},${y}`];
    out[dir] = {
      x, y,
      biome: t.biome,
      passable: t.passable,
      name: cached?.name || null,
    };
  }
  return out;
}

export function directionFromTo(fromX, fromY, toX, toY) {
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  const found = DIRECTIONS.find(([_, ddx, ddy]) => ddx === dx && ddy === dy);
  return found ? found[0] : 'unknown';
}

export function isStranded(state) {
  const here = tileAt(state.player.x, state.player.y, state.worldSeed);
  if (here.passable) return false;
  const adj = adjacentTiles(state);
  for (const dir of Object.keys(adj)) {
    if (adj[dir].passable) return false;
  }
  return true;
}

// ---------- moves ----------

export function isAdjacent(x1, y1, x2, y2) {
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
}

export function canMoveTo(state, tx, ty) {
  if (!isAdjacent(state.player.x, state.player.y, tx, ty)) return false;
  return tileAt(tx, ty, state.worldSeed).passable;
}

export function movePlayer(state, tx, ty) {
  const tile = tileAt(tx, ty, state.worldSeed);
  if (!tile.passable) return { ok: false, reason: 'impassable' };
  if (!isAdjacent(state.player.x, state.player.y, tx, ty)) {
    return { ok: false, reason: 'not_adjacent' };
  }

  const fromX = state.player.x;
  const fromY = state.player.y;

  state.player.x = tx;
  state.player.y = ty;

  markVisited(state, tx, ty);

  const wx = currentWeather(state);
  const radius = wx.id === 'fog' ? 0 : 1;
  revealAround(state, tx, ty, radius);

  setTileInCache(state, tx, ty, { biome: tile.biome });
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx, ny = ty + dy;
      const nt = tileAt(nx, ny, state.worldSeed);
      setTileInCache(state, nx, ny, { biome: nt.biome });
    }
  }

  const cost = wx.movementCost;
  advanceTicks(state, cost);
  ensureWeatherForTick(state);
  autoConsume(state);
  applyStarvationDamage(state, cost);

  const direction = directionFromTo(fromX, fromY, tx, ty);

  return { ok: true, biome: tile.biome, weather: wx.id, cost, direction };
}

export function teleportPlayer(state, tx, ty, costTicks = 1) {
  const fromX = state.player.x;
  const fromY = state.player.y;
  const tile = tileAt(tx, ty, state.worldSeed);

  state.player.x = tx;
  state.player.y = ty;

  markVisited(state, tx, ty);
  revealAround(state, tx, ty, 1);

  setTileInCache(state, tx, ty, { biome: tile.biome });
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx, ny = ty + dy;
      const nt = tileAt(nx, ny, state.worldSeed);
      setTileInCache(state, nx, ny, { biome: nt.biome });
    }
  }

  advanceTicks(state, Math.max(1, costTicks | 0));
  ensureWeatherForTick(state);
  autoConsume(state);
  applyStarvationDamage(state, costTicks);

  const direction = directionFromTo(fromX, fromY, tx, ty);
  return { ok: true, biome: tile.biome, direction };
}

// ---------- fire survival ----------

export function applyWeatherToFires(state) {
  const wx = currentWeather(state);
  if (wx.fireRisk === 0) return [];

  const removed = [];
  for (const [key, list] of Object.entries(state.buildingsByTile || {})) {
    const [xs, ys] = key.split(',');
    const x = parseInt(xs, 10), y = parseInt(ys, 10);
    const tile = tileAt(x, y, state.worldSeed);
    const biome = tile.biome;

    const hasHut = list.some(b => b.id === 'hut');
    const hasLeanTo = list.some(b => b.id === 'lean-to');
    const isCave = biome === 'cave';

    const protectedFromThis = isCave || hasHut || (wx.id === 'rain' && hasLeanTo);
    if (protectedFromThis) continue;

    const filtered = list.filter(b => {
      if (b.id === 'campfire' || b.id === 'signal_fire') {
        removed.push({ tileKey: key, structureId: b.id });
        return false;
      }
      return true;
    });
    state.buildingsByTile[key] = filtered;
  }
  return removed;
}

// ---------- gather ----------

export function gatherOptionsForTile(state) {
  const tile = tileAt(state.player.x, state.player.y, state.worldSeed);
  const table = worldBible.gather || {};
  const list = table[tile.biome] || [];
  const wx = currentWeather(state);

  return list.filter(opt => {
    if (opt.id === 'fish' && wx.id === 'storm') return false;
    return true;
  }).map(opt => {
    const hasTool = !opt.tool || state.tools.includes(opt.tool);
    return { ...opt, hasTool };
  });
}

export function gatherYield(state, resourceId, hours) {
  const tile = tileAt(state.player.x, state.player.y, state.worldSeed);
  const table = worldBible.gather || {};
  const options = table[tile.biome] || [];
  const spec = options.find(o => o.id === resourceId);
  if (!spec) return { qty: 0 };

  let toolMul = 1.0;
  if (spec.tool && state.tools.includes(spec.tool)) toolMul = 1.5;

  const wx = currentWeather(state);
  const base = rand01(state, resourceId, state.totalTicks) * (spec.max - spec.min) + spec.min;
  const weatherMul = resourceId === 'fish' ? wx.fish : wx.gather;
  const qty = Math.max(0, Math.round(base * toolMul * weatherMul * hours));
  return { qty, biome: tile.biome };
}

function rand01(state, salt, tick) {
  const seedStr = `${state.worldSeed}|${salt}|${tick}|${state.player.x}|${state.player.y}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// ---------- rest ----------

export function restBonus(state, x, y) {
  const wx = currentWeather(state);
  const tile = tileAt(x, y, state.worldSeed);
  const structures = (state.buildingsByTile?.[`${x},${y}`] || []).map(b => b.id);
  const inCave = tile.biome === 'cave';
  const hasShelter = structures.includes('lean-to') || structures.includes('hut');

  let hpPerHour = 2;
  let moralePerHour = 1;
  let waterPerHour = 0;

  for (const id of structures) {
    const r = (worldBible.recipes || []).find(x => x.id === id);
    if (!r || !r.effects) continue;
    if (r.effects.restHP)     hpPerHour += r.effects.restHP;
    if (r.effects.restMorale) moralePerHour += r.effects.restMorale;
    if (r.effects.restWater)  waterPerHour += r.effects.restWater;
  }

  if (inCave) hpPerHour += 1;
  hpPerHour += wx.restHP;
  moralePerHour += wx.restMorale;

  if (!hasShelter && !inCave && (wx.id === 'rain' || wx.id === 'storm')) {
    hpPerHour -= 1;
    moralePerHour -= 1;
  }

  return { hpPerHour, moralePerHour, waterPerHour };
}

// ---------- crafting ----------

export function recipeById(id) {
  return (worldBible.recipes || []).find(r => r.id === id);
}

export function resourceById(id) {
  return (worldBible.resources || []).find(r => r.id === id);
}

export function buildingsOnTile(state, x, y) {
  return (state.buildingsByTile?.[`${x},${y}`] || []).map(b => b.id);
}

export function canCraft(state, recipeId) {
  const r = recipeById(recipeId);
  if (!r) return { ok: false, reason: 'Unknown recipe' };

  const here = buildingsOnTile(state, state.player.x, state.player.y);
  const tile = tileAt(state.player.x, state.player.y, state.worldSeed);

  if (r.requires?.buildingOnTile && !here.includes(r.requires.buildingOnTile)) {
    return { ok: false, reason: `Needs a ${r.requires.buildingOnTile} here` };
  }
  if (r.requires?.biome && tile.biome !== r.requires.biome) {
    return { ok: false, reason: `Only on ${r.requires.biome}` };
  }

  const missing = {};
  for (const [k, v] of Object.entries(r.cost || {})) {
    const have = state.inventory[k] || 0;
    if (have < v) missing[k] = v - have;
  }
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: 'Missing resources', missing };
  }

  if (r.kind === 'camp' && here.includes(r.id)) {
    return { ok: false, reason: 'Already built here' };
  }
  if (r.kind === 'tool' && state.tools.includes(r.id)) {
    return { ok: false, reason: 'Already owned' };
  }

  return { ok: true };
}

export function craftRecipe(state, recipeId) {
  const check = canCraft(state, recipeId);
  if (!check.ok) return { ok: false, reason: check.reason };

  const r = recipeById(recipeId);

  for (const [k, v] of Object.entries(r.cost || {})) {
    state.inventory[k] = (state.inventory[k] || 0) - v;
    if (state.inventory[k] < 0) state.inventory[k] = 0;
  }

  advanceTicks(state, r.costTicks || 1);
  ensureWeatherForTick(state);
  autoConsume(state);
  applyStarvationDamage(state, r.costTicks || 1);

  if (r.kind === 'tool') {
    if (!state.tools.includes(r.id)) state.tools.push(r.id);
  } else if (r.kind === 'camp') {
    const key = `${state.player.x},${state.player.y}`;
    if (!state.buildingsByTile[key]) state.buildingsByTile[key] = [];
    state.buildingsByTile[key].push({ id: r.id, builtAtTick: state.totalTicks });
  } else if (r.kind === 'item') {
    state.craftedItems[r.id] = (state.craftedItems[r.id] || 0) + 1;
  }

  pushGameHistory(state, 'player', `Crafted ${r.name}`);

  return { ok: true, recipe: r };
}

// ---------- consumption ----------

export function bestConsumable(state, category) {
  const order = (worldBible.consumeOrder || {})[category] || [];
  for (const id of order) {
    const res = resourceById(id);
    if (res && (state.inventory[id] || 0) > 0) {
      return { kind: 'resource', id, def: res };
    }
    const rec = recipeById(id);
    if (rec && (state.craftedItems[id] || 0) > 0) {
      return { kind: 'item', id, def: rec };
    }
  }
  return null;
}

export function autoConsume(state) {
  const THRESHOLD = 35;
  if (state.stats.food < THRESHOLD) {
    const best = bestConsumable(state, 'food');
    if (best) consumeOne(state, best);
  }
  if (state.stats.water < THRESHOLD) {
    const best = bestConsumable(state, 'water');
    if (best) consumeOne(state, best);
  }
}

function consumeOne(state, pick) {
  const id = pick.id;
  if (pick.kind === 'resource') {
    state.inventory[id] = Math.max(0, (state.inventory[id] || 0) - 1);
    const edible = pick.def.edible || {};
    const delta = {};
    if (edible.food)  delta.food  = edible.food;
    if (edible.water) delta.water = edible.water;
    let verb = 'Ate';
    if (!edible.food && edible.water) verb = 'Drank';
    if (edible.sickChance && Math.random() < edible.sickChance) {
      delta.health = -(edible.sickDamage || 5);
      pushGameHistory(state, 'player', `${verb} ${pick.def.name} raw. Felt sick.`);
    } else {
      pushGameHistory(state, 'player', `${verb} ${pick.def.name}.`);
    }
    applyDelta(state, delta);
  } else {
    state.craftedItems[id] = Math.max(0, (state.craftedItems[id] || 0) - 1);
    const effects = pick.def.effects?.consumable || {};
    applyDelta(state, effects);
    const verb = effects.food ? 'Ate' : 'Used';
    pushGameHistory(state, 'player', `${verb} ${pick.def.name}.`);
  }
}

export function consumeFromInventory(state, kind, id) {
  if (kind === 'resource') {
    const res = resourceById(id);
    if (!res || !res.edible) return { ok: false };
    if ((state.inventory[id] || 0) < 1) return { ok: false };

    state.inventory[id] -= 1;
    const edible = res.edible;
    const delta = {};
    let sickness = false;
    let verb = 'Ate';
    if (!edible.food && edible.water) verb = 'Drank';
    if (edible.food)  delta.food  = edible.food;
    if (edible.water) delta.water = edible.water;
    if (edible.sickChance && Math.random() < edible.sickChance) {
      delta.health = -(edible.sickDamage || 5);
      sickness = true;
    }
    applyDelta(state, delta);
    pushGameHistory(state, 'player', `${verb} ${res.name}${sickness ? ' (raw, sick)' : ''}.`);
    return { ok: true, delta, sickness, name: res.name };
  }

  if (kind === 'item') {
    const rec = recipeById(id);
    if (!rec || !rec.effects?.consumable) return { ok: false };
    if ((state.craftedItems[id] || 0) < 1) return { ok: false };

    state.craftedItems[id] -= 1;
    applyDelta(state, rec.effects.consumable);
    const verb = rec.effects.consumable.food ? 'Ate' : 'Used';
    pushGameHistory(state, 'player', `${verb} ${rec.name}.`);
    return { ok: true, delta: rec.effects.consumable, name: rec.name };
  }

  return { ok: false };
}

export function suppliesSummary(state) {
  const foods = [];
  const waters = [];
  for (const r of worldBible.resources) {
    if (!r.edible) continue;
    const n = state.inventory[r.id] || 0;
    if (n <= 0) continue;
    if (r.edible.food)  foods.push({ glyph: r.glyph, name: r.name, count: n });
    if (r.edible.water) waters.push({ glyph: r.glyph, name: r.name, count: n });
  }
  for (const c of worldBible.recipes) {
    if (c.kind !== 'item') continue;
    const n = state.craftedItems[c.id] || 0;
    if (n <= 0) continue;
    if (c.effects?.consumable?.food) foods.push({ glyph: c.glyph, name: c.name, count: n });
  }
  return { foods, waters };
}

// ---------- starvation ----------

export function applyStarvationDamage(state, ticks) {
  if (ticks <= 0) return;
  let drain = 0;
  if (state.stats.food <= 0)  drain += Math.max(1, Math.floor(ticks / 4));
  if (state.stats.water <= 0) drain += Math.max(1, Math.floor(ticks / 4));
  if (drain > 0) {
    applyDelta(state, { health: -drain });
    const causes = [];
    if (state.stats.food <= 0)  causes.push('hunger');
    if (state.stats.water <= 0) causes.push('thirst');
    pushGameHistory(state, 'gm', `You are weakened by ${causes.join(' and ')}.`);
  }
}

// ---------- beats ----------

export function applyBeat(state, beat) {
  if (!beat || typeof beat !== 'object') return state;

  applyDelta(state, beat.state_delta);

  if (beat.thread_progress && typeof beat.thread_progress === 'object') {
    for (const [tid] of Object.entries(beat.thread_progress)) {
      state.threadsProgressed[tid] = (state.threadsProgressed[tid] || 0) + 1;
    }
  }

  if (Array.isArray(beat.flags)) {
    for (const f of beat.flags) {
      if (!state.flags.includes(f)) state.flags.push(f);
    }
  }

  if (beat.location && typeof beat.location === 'object') {
    if (beat.location.name) state.currentLocationName = beat.location.name;
    if (typeof beat.location.x === 'number' && typeof beat.location.y === 'number') {
      const key = `${beat.location.x},${beat.location.y}`;
      const t = state.tiles[key] || {};
      t.name = beat.location.name;
      state.tiles[key] = t;
      const loc = getLocation(state, beat.location.x, beat.location.y);
      if (loc) loc.name = beat.location.name;
    }
  }

  if (typeof beat.beat_type === 'string') {
    state.currentBeatType = beat.beat_type;
  }

  if (['milestone','milestone_early','setback','discovery','revelation','finale'].includes(beat.beat_type)) {
    state.lastBeatDay = getDay(state);
  }

  return state;
}

// ---------- location helpers ----------

export function ensureLocation(state, x, y) {
  let loc = getLocation(state, x, y);
  if (!loc) {
    const tile = tileAt(x, y, state.worldSeed);
    loc = newLocationRecord(x, y, tile.biome);
    loc.firstSeenTick = state.totalTicks;
    setLocation(state, x, y, loc);
  }
  loc.lastSeenTick = state.totalTicks;
  return loc;
}

export function isNewLocation(state, x, y) {
  const loc = getLocation(state, x, y);
  return !loc || loc.choices === null;
}

export function shouldRegenerateChoices(state, x, y) {
  const loc = getLocation(state, x, y);
  if (!loc) return true;
  if (!loc.choices) return true;
  return loc.conditionHash !== computeConditionHash(state, x, y);
}

export function filterChoices(state, loc) {
  if (!loc || !Array.isArray(loc.choices)) return [];
  const day = getDay(state);
  const tod = getTimeOfDay(state);
  const wx = state.weather?.current || 'clear';

  const out = [];
  for (const c of loc.choices) {
    if (c.permanent && loc.permanentFacts.includes(`taken:${c.id}`)) continue;

    if (typeof c.expiresOnDay === 'number' && day > c.expiresOnDay) {
      out.push({
        ...c,
        expired: true,
        label: c.expired_label || 'It is gone now.',
        risk: 'none',
        tombstone: true,
      });
      continue;
    }

    if (c.requires && typeof c.requires === 'object') {
      let meets = true;
      if (c.requires.timeOfDay && c.requires.timeOfDay !== tod) meets = false;
      if (c.requires.weather && c.requires.weather !== wx) meets = false;
      if (c.requires.tool && !state.tools.includes(c.requires.tool)) meets = false;
      if (c.requires.flag && !state.flags.includes(c.requires.flag)) meets = false;
      if (!meets) continue;
    }

    out.push(c);
  }

  return out.slice(0, 3);
}

export function markChoiceTaken(state, loc, choiceId, permanent = true) {
  if (!loc) return;
  if (permanent) {
    const tag = `taken:${choiceId}`;
    if (!loc.permanentFacts.includes(tag)) loc.permanentFacts.push(tag);
  }
  loc.log.push({ tick: state.totalTicks, type: 'choice', text: choiceId });
}

// ---------- shallow ocean ----------

export function rollShallowOceanEntry(state, x, y) {
  const seed = (hashStr(state.worldSeed) + state.totalTicks * 7919 + x * 131 + y * 17) | 0;
  const r = Math.abs(seed % 1000) / 1000;
  if (r < 0.30) return { type: 'fish',  delta: { inventory: { fish: 1 } },  text: 'You spot a fish in the shallows and catch it with your hands.' };
  if (r < 0.50) return { type: 'shell', delta: { inventory: { fiber: 1 } }, text: 'A shell, sharp-edged, good for cutting.' };
  if (r < 0.62) return { type: 'cut',   delta: { health: -4 },              text: 'A sharp rock under the water cuts your foot.' };
  if (r < 0.72) return { type: 'none',  delta: {},                           text: 'The water is cold and clear. Nothing here.' };
  if (r < 0.82) return { type: 'wood',  delta: { inventory: { wood: 1 } },  text: 'A piece of driftwood, half-buried in the sand.' };
  return { type: 'none', delta: {}, text: 'You wade carefully. The tide pulls at your ankles.' };
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- mid-genesis ----------

export function checkMidGenesis(state) {
  const band = shouldFireMidGenesis(state.maxRadius, state.lastGenesisRadius);
  if (band) {
    state.lastGenesisRadius = band;
    return band;
  }
  return null;
}

export function tileForDisplay(state, x, y) {
  const cached = state.tiles[`${x},${y}`];
  if (cached) return cached;
  const t = tileAt(x, y, state.worldSeed);
  return { biome: t.biome };
}