// flavour.js — local templates and rare-event rates.
// Keeps gather/craft/rest instant unless a rare event is rolled.

// ---------- rarity rates per action ----------

export const RARE_EVENT_RATES = {
  // Resource-id keys
  wood:       [0.08, 0.12],
  stone:      [0.08, 0.12],
  berries:    [0.15, 0.22],
  fish:       [0.18, 0.25],
  freshwater: [0.08, 0.15],
  herbs:      [0.15, 0.20],
  clay:       [0.10, 0.15],
  ore:        [0.12, 0.18],
  gold:       [0.20, 0.30],
  // Fallbacks
  gather:     [0.10, 0.18],
  craft:      [0.05, 0.08],
  rest:       [0.10, 0.15],
};

export function rareEventChance(actionKey) {
  const range = RARE_EVENT_RATES[actionKey] || [0.10, 0.18];
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function rollRareEvent(actionKey) {
  return Math.random() < rareEventChance(actionKey);
}

// ---------- weather-aware templates ----------

const GATHER_TEMPLATES = {
  clear: [
    "You work in the sun for {hours} hours. {qty} {resource}.",
    "The light is steady. You gather {qty} {resource} in {hours} hours.",
    "Warm and unhurried. {qty} {resource} after {hours} hours of work.",
  ],
  overcast: [
    "The sky is grey. You gather {qty} {resource} over {hours} hours.",
    "{hours} hours of quiet work. {qty} {resource}.",
    "Cool and still. You fill your hands with {qty} {resource}.",
  ],
  rain: [
    "Rain drips from the leaves. You work {hours} hours and find {qty} {resource}.",
    "Wet work. {hours} hours pass. {qty} {resource}.",
    "The ground is soft. {qty} {resource} in {hours} hours of gathering.",
  ],
  storm: [
    "The wind tears at you. You find only {qty} {resource} in {hours} hours.",
    "You shelter, then gather. {qty} {resource} in {hours} hours.",
    "Storm-blown. You manage {qty} {resource}.",
  ],
  fog: [
    "You work by feel. {qty} {resource} in {hours} hours.",
    "The fog hides the ground. Still, {qty} {resource}.",
    "{hours} hours in the grey. You find {qty} {resource}.",
  ],
};

const CRAFT_TEMPLATES = {
  clear: [
    "You work by sunlight. {item} complete.",
    "It takes {hours} hours. You hold {item}.",
    "A clean make. {item}.",
  ],
  overcast: [
    "You work in the grey light. {item} done.",
    "{hours} hours. {item}.",
    "The air is cool. {item} takes shape.",
  ],
  rain: [
    "You work under cover. {item} finished in {hours} hours.",
    "Rain taps above you. {item}.",
    "Inside, dry. {item} takes form.",
  ],
  storm: [
    "You work between gusts. {item}, at last.",
    "The storm passes. You finish {item}.",
    "{item}, made with cold hands.",
  ],
  fog: [
    "You work by memory. {item}.",
    "{hours} hours. {item} done.",
    "The fog lifts as you finish {item}.",
  ],
};

const REST_TEMPLATES = {
  clear: [
    "You sleep under clear stars. {hours} hours.",
    "The night is still. You rest {hours} hours.",
    "Clear sky, quiet sleep. {hours} hours.",
  ],
  overcast: [
    "The sky is even and grey. {hours} hours of sleep.",
    "Cool, still, unhurried. {hours} hours.",
    "{hours} hours. You wake without dreaming.",
  ],
  rain: [
    "Rain taps the shelter. You sleep {hours} hours.",
    "The sound of rain carries you. {hours} hours.",
    "You rest to the drum of water. {hours} hours.",
  ],
  storm: [
    "The wind howls. You barely sleep, but {hours} hours pass.",
    "Storm-wracked. {hours} hours of fitful rest.",
    "You wake at every gust. {hours} hours gone.",
  ],
  fog: [
    "You sleep in the grey silence. {hours} hours.",
    "The fog wraps the camp. {hours} hours.",
    "{hours} hours. You wake unsure of the time.",
  ],
};

// ---------- time-of-day suffixes ----------

const TIME_SUFFIX = {
  dawn:  " Dawn is coming.",
  day:   "",
  dusk:  " The light is failing.",
  night: " Night has fallen.",
};

// ---------- pick a template ----------

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

/**
 * Local gather narration.
 * @param {object} p
 * @param {string} p.weather  - 'clear' | 'overcast' | 'rain' | 'storm' | 'fog'
 * @param {string} p.timeOfDay - 'dawn' | 'day' | 'dusk' | 'night'
 * @param {number} p.hours
 * @param {number} p.qty
 * @param {string} p.resource - display name
 */
export function localGatherText({ weather, timeOfDay, hours, qty, resource }) {
  const pool = GATHER_TEMPLATES[weather] || GATHER_TEMPLATES.clear;
  const base = fill(pick(pool), { hours, qty, resource });
  const suffix = (timeOfDay === 'dusk' || timeOfDay === 'night') ? TIME_SUFFIX[timeOfDay] : '';
  return base + suffix;
}

export function localCraftText({ weather, timeOfDay, hours, item }) {
  const pool = CRAFT_TEMPLATES[weather] || CRAFT_TEMPLATES.clear;
  const base = fill(pick(pool), { hours, item });
  const suffix = (timeOfDay === 'dusk' || timeOfDay === 'night') ? TIME_SUFFIX[timeOfDay] : '';
  return base + suffix;
}

export function localRestText({ weather, timeOfDay, hours }) {
  const pool = REST_TEMPLATES[weather] || REST_TEMPLATES.clear;
  return fill(pick(pool), { hours });
}

// ---------- weather "current conditions" text (past tense, for popover) ----------

export function weatherDurationText(ticksElapsed) {
  if (ticksElapsed <= 0) return 'just now';
  if (ticksElapsed === 1) return '1 hour';
  return `${ticksElapsed} hours`;
}