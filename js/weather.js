// weather.js — deterministic tick-based weather.

export const WEATHER_TYPES = {
  clear: {
    id: 'clear', name: 'Clear', icon: '☀',
    effects: [{ text: 'Ideal conditions.', className: 'we-good' }],
    gather: 1.0, fish: 1.0,
    movementCost: 1,
    restHP: 0, restMorale: 0,
    fireRisk: 0,
    durationRange: [12, 24],
  },
  overcast: {
    id: 'overcast', name: 'Overcast', icon: '☁',
    effects: [{ text: 'Gathering slightly reduced.', className: 'we-warn' }],
    gather: 0.9, fish: 0.9,
    movementCost: 1,
    restHP: 0, restMorale: 0,
    fireRisk: 0,
    durationRange: [10, 20],
  },
  rain: {
    id: 'rain', name: 'Rain', icon: '🌧',
    effects: [
      { text: 'Gathering reduced. Fishing heavily reduced.', className: 'we-warn' },
      { text: 'Exposed fires will go out.', className: 'we-bad' },
      { text: 'Rainwater can be collected.', className: 'we-good' },
    ],
    gather: 0.75, fish: 0.4,
    movementCost: 2,
    restHP: -1, restMorale: 0,
    fireRisk: 1,
    durationRange: [6, 16],
  },
  storm: {
    id: 'storm', name: 'Storm', icon: '⛈',
    effects: [
      { text: 'Most outdoor work impossible.', className: 'we-bad' },
      { text: 'Fishing impossible. Fires exposed.', className: 'we-bad' },
      { text: 'Rainwater collects fast.', className: 'we-good' },
    ],
    gather: 0.4, fish: 0.1,
    movementCost: 3,
    restHP: -2, restMorale: -1,
    fireRisk: 2,
    durationRange: [4, 10],
  },
  fog: {
    id: 'fog', name: 'Fog', icon: '🌫',
    effects: [
      { text: 'Vision reduced — you can only see adjacent tiles.', className: 'we-warn' },
      { text: 'Fishing reduced.', className: 'we-warn' },
    ],
    gather: 0.9, fish: 0.6,
    movementCost: 1,
    restHP: 0, restMorale: 0,
    fireRisk: 0,
    durationRange: [6, 12],
  },
};

function hash(a, b) {
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (a | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (b | 0), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return h >>> 0;
}

function seedNumFrom(worldSeed) {
  if (typeof worldSeed === 'string') {
    let h = 0;
    for (let i = 0; i < worldSeed.length; i++) {
      h = (h * 31 + worldSeed.charCodeAt(i)) | 0;
    }
    return h;
  }
  if (typeof worldSeed === 'number') return worldSeed | 0;
  return 0;
}

/**
 * Pick a weather type deterministically from (tick, worldSeed).
 * Called only when the previous weather expires.
 */
export function weatherForTick(tick, worldSeed) {
  const seed = seedNumFrom(worldSeed);
  const r = hash(seed, tick) % 100;
  if (r < 40) return 'clear';
  if (r < 65) return 'overcast';
  if (r < 85) return 'rain';
  if (r < 95) return 'storm';
  return 'fog';
}

/**
 * Duration in ticks for a given weather type.
 */
export function weatherDuration(weatherId, tick, worldSeed) {
  const w = WEATHER_TYPES[weatherId] || WEATHER_TYPES.clear;
  const [min, max] = w.durationRange;
  const seed = seedNumFrom(worldSeed);
  const r = (hash(seed ^ 0x5bd1e995, tick) % 1000) / 1000;
  return Math.floor(min + r * (max - min + 1));
}

export function weatherData(id) {
  return WEATHER_TYPES[id] || WEATHER_TYPES.clear;
}