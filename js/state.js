// state.js — game state. Save/load via localStorage.

const SAVE_KEY   = 'castaway.state.v5';
const HISTORY_KEY = 'castaway.history.v5';

export function defaultState() {
  return {
    version: 5,
    started: false,
    worldSeed: null,
    islandSeed: null,
    player: { x: 0, y: 0 },
    stats: { health: 100, food: 100, water: 100, morale: 60 },
    inventory: {
      wood: 0, stone: 0, vine: 0, fiber: 0,
      berries: 0, freshwater: 0, herbs: 0, fish: 0, meat: 0,
      clay: 0, ore: 0, gold: 0, relic_fragment: 0,
    },
    tools: [],
    craftedItems: {},
    buildingsByTile: {},
    flags: [],
    threadsProgressed: {},
    revealed: [],
    visited: [],
    tiles: {},
    locations: {},
    tileEvents: {},
    recentTiles: [],
    worldFlags: [],
    day: 1,
    totalTicks: 0,
    lastBeatDay: 1,
    lastGenesisRadius: 0,
    maxRadius: 0,
    currentBeatType: null,
    currentLocationName: 'The Wreck Beach',
    weather: { today: 'clear', tomorrow: 'clear' },
    weatherDay: 1,
    history: [],
    historySeenIndex: 0,
    manualSeen: false,
  };
}

const START_TICKS = 6;

// ---------- load / save ----------

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return { ...base, ...parsed };
  } catch (e) {
    console.error('loadState failed', e);
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('saveState failed', e);
    return false;
  }
}

export function clearState() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// ---------- time ----------

export function getDay(state)  { return Math.floor(state.totalTicks / 24) + 1; }
export function getHour(state) { return ((state.totalTicks % 24) + 24) % 24; }

export function getTimeOfDay(state) {
  const h = getHour(state);
  if (h >= 5 && h < 8)  return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

export function formatClock(state) {
  const h = getHour(state);
  return `${String(h).padStart(2, '0')}:00`;
}

export function advanceTicks(state, ticks) {
  state.totalTicks += Math.max(0, ticks | 0);
  state.day = getDay(state);
  return state.totalTicks;
}

// ---------- deltas ----------

export function applyDelta(state, delta) {
  if (!delta || typeof delta !== 'object') return state;
  const s = state.stats;
  if (typeof delta.health === 'number') s.health = clamp(s.health + delta.health, 0, 100);
  if (typeof delta.food   === 'number') s.food   = clamp(s.food   + delta.food,   0, 100);
  if (typeof delta.water  === 'number') s.water  = clamp(s.water  + delta.water,  0, 100);
  if (typeof delta.morale === 'number') s.morale = clamp(s.morale + delta.morale, 0, 100);
  if (delta.inventory && typeof delta.inventory === 'object') {
    for (const [k, v] of Object.entries(delta.inventory)) {
      if (typeof v !== 'number') continue;
      state.inventory[k] = Math.max(0, (state.inventory[k] || 0) + v);
    }
  }
  return state;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// ---------- reveal / visit ----------

export function revealAround(state, cx, cy, radius = 1) {
  const set = new Set(state.revealed);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      set.add(`${cx + dx},${cy + dy}`);
    }
  }
  state.revealed = Array.from(set);
}

export function markVisited(state, x, y) {
  const key = `${x},${y}`;
  if (!state.visited.includes(key)) state.visited.push(key);
  const r = Math.max(Math.abs(x), Math.abs(y));
  if (r > state.maxRadius) state.maxRadius = r;
}

export function isRevealed(state, x, y) {
  return state.revealed.includes(`${x},${y}`);
}

// ---------- tiles ----------

export function stateKey(x, y) { return `${x},${y}`; }

export function getTileFromCache(state, x, y) {
  return state.tiles[stateKey(x, y)] || null;
}

export function setTileInCache(state, x, y, tile) {
  state.tiles[stateKey(x, y)] = { ...(state.tiles[stateKey(x, y)] || {}), ...tile };
}

// ---------- locations ----------

export function newLocationRecord(x, y, biome) {
  return {
    x, y, biome,
    name: null,
    firstSeenTick: null,
    lastSeenTick: null,
    choices: null,
    generatedAtTick: null,
    conditionHash: null,
    permanentFacts: [],
    log: [],
  };
}

export function getLocation(state, x, y) {
  return state.locations[stateKey(x, y)] || null;
}

export function setLocation(state, x, y, loc) {
  state.locations[stateKey(x, y)] = loc;
}

// ---------- recent tiles ----------

export function pushRecentTile(state, x, y, name) {
  const list = state.recentTiles || [];
  const filtered = list.filter(t => !(t.x === x && t.y === y));
  filtered.push({ x, y, name: name || null, atTick: state.totalTicks });
  state.recentTiles = filtered.slice(-5);
}

// ---------- tile events ----------

export function addTileEvent(state, x, y, tag) {
  const key = `${x},${y}`;
  const list = state.tileEvents[key] || [];
  if (!list.includes(tag)) list.push(tag);
  state.tileEvents[key] = list.slice(-10);
}

// ---------- conditions ----------

export function computeConditionHash(state, x, y) {
  const loc = getLocation(state, x, y);
  const tile = getTileFromCache(state, x, y);
  const parts = [
    getDay(state),
    getTimeOfDay(state),
    state.weather?.today || '',
    state.tools.slice().sort().join(','),
    state.flags.slice().sort().join(','),
    state.worldFlags.slice().sort().join(','),
    (loc?.permanentFacts || []).slice().sort().join(','),
    (tile?.name || ''),
  ];
  return simpleHash(parts.join('|'));
}

function simpleHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------- history (LLM chat) ----------

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
  } catch (e) {
    console.error('saveHistory failed', e);
  }
}

export function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
}

// ---------- in-game history log ----------

export function pushGameHistory(state, role, text) {
  if (!state.history) state.history = [];
  state.history.push({
    tick: state.totalTicks,
    day: getDay(state),
    role,
    text: String(text).slice(0, 400),
  });
  if (state.history.length > 400) {
    // Trim the oldest 50 and adjust seenIndex accordingly.
    const drop = state.history.length - 400;
    state.history = state.history.slice(drop);
    state.historySeenIndex = Math.max(0, (state.historySeenIndex || 0) - drop);
  }
}

/**
 * Returns entries the LLM has not yet been told about.
 */
export function unseenHistory(state) {
  if (!Array.isArray(state.history)) return [];
  const start = state.historySeenIndex || 0;
  return state.history.slice(start);
}

export function markHistorySeen(state) {
  state.historySeenIndex = (state.history || []).length;
}

export { START_TICKS };