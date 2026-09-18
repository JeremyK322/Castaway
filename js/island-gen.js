// island-gen.js — infinite procedural island tiles.
// Pure function of (x, y, seed). No state, no memory.

// ---------- deterministic hash + noise ----------

function hash2D(x, y, seed) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function valueNoise(x, y, seed, scale) {
  const sx = x / scale, sy = y / scale;
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = x0 + 1, y1 = y0 + 1;
  const tx = smoothstep(sx - x0), ty = smoothstep(sy - y0);
  const v00 = hash2D(x0, y0, seed);
  const v10 = hash2D(x1, y0, seed);
  const v01 = hash2D(x0, y1, seed);
  const v11 = hash2D(x1, y1, seed);
  const a = lerp(v00, v10, tx);
  const b = lerp(v01, v11, tx);
  return lerp(a, b, ty);
}

function fbm(x, y, seed, octaves = 4) {
  let value = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq, seed + i * 1013, 8) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / max;
}

// ---------- shape ----------

function landScore(x, y, seed) {
  const dist = Math.sqrt(x * x + y * y);
  const radial = 1 - smoothstep((dist - 10) / 8);
  const noise = fbm(x, y, seed, 5);
  return radial * 0.75 + noise * 0.45;
}

function isForcedLand(x, y) {
  return Math.abs(x) <= 1 && Math.abs(y) <= 1;
}

function isForcedOcean(x, y) {
  // Beyond radius 20: always ocean.
  return Math.abs(x) > 20 || Math.abs(y) > 20;
}

const LAND_THRESHOLD = 0.55;

function baseBiome(x, y, seed, dist) {
  if (isForcedLand(x, y)) return 'beach';
  const b = valueNoise(x, y, seed ^ 0x9e3779b9, 5);

  if (dist < 3) return b < 0.5 ? 'beach' : 'jungle';
  if (dist < 7) {
    if (b < 0.25) return 'beach';
    if (b < 0.60) return 'jungle';
    if (b < 0.80) return 'marsh';
    return 'hills';
  }
  if (dist < 13) {
    if (b < 0.15) return 'jungle';
    if (b < 0.40) return 'hills';
    if (b < 0.60) return 'marsh';
    if (b < 0.80) return 'cliff';
    return 'ruins';
  }
  if (b < 0.40) return 'hills';
  if (b < 0.65) return 'cliff';
  if (b < 0.85) return 'cave';
  return 'ruins';
}

// ---------- public API ----------

export const BIOMES = {
  OCEAN_DEEP:    { id: 'ocean_deep',    passable: false, isLand: false, isOcean: true  },
  OCEAN_SHALLOW: { id: 'ocean_shallow', passable: true,  isLand: false, isOcean: true  },
  BEACH:         { id: 'beach',         passable: true,  isLand: true,  isOcean: false },
  JUNGLE:        { id: 'jungle',        passable: true,  isLand: true,  isOcean: false },
  MARSH:         { id: 'marsh',         passable: true,  isLand: true,  isOcean: false },
  HILLS:         { id: 'hills',         passable: true,  isLand: true,  isOcean: false },
  CLIFF:         { id: 'cliff',         passable: true,  isLand: true,  isOcean: false },
  CAVE:          { id: 'cave',          passable: true,  isLand: true,  isOcean: false },
  RUINS:         { id: 'ruins',         passable: true,  isLand: true,  isOcean: false },
};

function rawLand(x, y, seed) {
  if (isForcedLand(x, y)) return true;
  if (isForcedOcean(x, y)) return false;
  return landScore(x, y, seed) >= LAND_THRESHOLD;
}

function computeTile(x, y, seed) {
  const dist = Math.max(Math.abs(x), Math.abs(y));
  const land = rawLand(x, y, seed);

  if (land) {
    const biomeId = baseBiome(x, y, seed, dist);
    const biome = BIOMES[biomeId.toUpperCase()] || BIOMES.BEACH;
    return {
      x, y,
      biome: biome.id,
      isLand: true,
      isOcean: false,
      passable: biome.passable,
      distance: dist,
    };
  }

  // It's ocean. Shallow if any orthogonal neighbour is land.
  const neighbours = [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
  ];
  let shallow = false;
  for (const [nx, ny] of neighbours) {
    if (rawLand(nx, ny, seed)) { shallow = true; break; }
  }

  return {
    x, y,
    biome: shallow ? 'ocean_shallow' : 'ocean_deep',
    isLand: false,
    isOcean: true,
    passable: shallow,
    distance: dist,
  };
}

// Simple cache — per seed, avoids re-hashing the same tile repeatedly.
const _cache = new Map();
const CACHE_LIMIT = 50000;

export function tileAt(x, y, seed) {
  const key = `${seed}:${x},${y}`;
  const hit = _cache.get(key);
  if (hit) return hit;
  const t = computeTile(x, y, seed);
  if (_cache.size > CACHE_LIMIT) _cache.clear();
  _cache.set(key, t);
  return t;
}

export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function radiusOf(x, y) {
  return Math.max(Math.abs(x), Math.abs(y));
}