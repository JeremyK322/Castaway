// prompts.js — all prompt families.

import { worldBible } from './world.js';
import { unseenHistory } from './state.js';

const WORLD_BIBLE_JSON = JSON.stringify(worldBible, null, 2);

const RECIPE_SUMMARY = (worldBible.recipes || []).map(r => ({
  id: r.id, kind: r.kind, name: r.name,
  cost: r.cost,
  requires: r.requires || null,
  effects: r.effects || null,
}));

const BEAT_SCHEMA_EXAMPLE = `{
  "narration": "You push through the treeline. The jungle swallows the sound of the surf.",
  "location": { "x": 2, "y": -1, "name": "The Drowned Jungle" },
  "beat_type": "hook",
  "choices": [
    { "id": "a", "label": "Walk northeast into the jungle", "risk": "low",  "costTicks": 2, "moves_to": { "x": 3, "y": -2 } },
    { "id": "b", "label": "Stay and search the undergrowth", "risk": "low", "costTicks": 2 },
    { "id": "c", "label": "Return west to the beach",       "risk": "none", "costTicks": 1, "moves_to": { "x": 2, "y": -1 } }
  ],
  "state_delta": { "water": -5, "morale": 2 },
  "thread_progress": { "crown_of_the_god_king": "found_journal_page" },
  "flags": ["heard_the_stones"]
}`;

const FORCED_MOVE_EXAMPLE = `{
  "id": "b",
  "label": "Let them drag you",
  "risk": "high",
  "costTicks": 4,
  "forced_move_to": { "x": -6, "y": 8, "biome": "cave" }
}`;

const GENESIS_SCHEMA_EXAMPLE = `{
  "island_name": "Isle of the Weeping Stones",
  "ship_name": "Perseverance",
  "opening_scene": "You wake on cold sand. Salt in your throat. The ship is gone.",
  "secret": "A vanished civilization buried their god-king here.",
  "rescue_condition": "Keep a signal fire lit on the cliff for three nights.",
  "rescue_ship": "HMS Vigilant",
  "camp": { "x": 0, "y": 0, "name": "The Wreck Beach" },
  "early_locations": [
    {
      "id": "beach_camp",
      "name": "The Wreck Beach",
      "biome": "beach",
      "position": { "x": 0, "y": 0 },
      "description": "Where you washed ashore.",
      "resources": ["wood", "stone"],
      "danger": 0,
      "story_hooks": ["journal_page_1"]
    }
  ],
  "story_threads": [
    {
      "id": "crown_of_the_god_king",
      "title": "The Crown of the God-King",
      "summary": "Four shards of an obsidian crown are hidden on the island.",
      "milestones": [
        "find a torn journal page on the wreck beach",
        "find the first shard in the jungle",
        "find the second shard in the hills",
        "assemble the crown at the ruins"
      ],
      "resolution": "Learn the island's secret."
    }
  ],
  "starting_items": ["torn_shirt", "empty_canteen"],
  "tone": "literary, tense, hopeful"
}`;

// ---------------------------------------------------------------
// Shared rule blocks
// ---------------------------------------------------------------

const MOVEMENT_RULES = `MOVEMENT — TWO KINDS:

1. WALKING — use "moves_to".
   - The player takes one step to an ADJACENT tile.
   - Only use this for choices where the player physically walks.
   - Destination MUST be one of the eight adjacent tiles listed in ADJACENT_TILES.
   - Destination MUST be passable (not deep ocean).
   - If you point at a wall or deep ocean, the engine silently drops the move.

2. FORCED RELOCATION — use "forced_move_to".
   - The player is moved against their will.
   - Examples: abduction, swept away, falling, waking elsewhere, dragged.
   - Destination can be ANY tile at ANY distance, passable or not.
   - Use ONLY when the story demands it.

3. Every choice uses exactly ONE of: moves_to, forced_move_to, or neither.

COORDINATES AND DIRECTIONS:
- Player position is { x, y }.
- +x is EAST. -x is WEST.
- +y is SOUTH. -y is NORTH.
- Never describe a direction that contradicts ADJACENT_TILES.`;

const CHOICE_RULES = `CHOICES:
- Offer 0 to 3 choices.
- 0 is FINE. Some places are just terrain.
- A choice may cost time ("costTicks").
- A choice may have a "hint" — short italic text under the label.
- A choice may have a "risk": "none" | "low" | "medium" | "high" | "desperate".

CHOICES ARE PERSISTENT:
- A location's choices are generated once and cached.
- Do NOT contradict choices the player has already seen at this location.

CHOICES MAY EXPIRE:
- "expiresOnDay": integer. When day > expiresOnDay, the choice becomes a tombstone with "expired_label".
- Mark "permanent": true on choices consumed when taken.

THREAD PROGRESS:
- If the player genuinely reached a story milestone, include it in "thread_progress"
  as { "thread_id": "milestone_text" }.`;

const WEATHER_RULES = `WEATHER:
- The WEATHER block tells you the current weather and how long it has lasted.
- Weather changes over time. If the block says WEATHER_JUST_CHANGED, this is
  the player's first experience of the new weather — describe the transition
  naturally within your narration.
- Do NOT invent weather. Do NOT contradict the block.
- Do NOT narrate a sunny day during a storm. Do NOT offer fishing during a storm.`;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function buildSinceLastBeat(state) {
  const unseen = unseenHistory(state);
  if (unseen.length === 0) return '(nothing has happened since the last narration)';

  const lines = [];
  let lastDay = null;
  for (const entry of unseen) {
    if (entry.day !== lastDay) {
      lines.push(`— Day ${entry.day} —`);
      lastDay = entry.day;
    }
    const role = entry.role === 'player' ? '> ' : '';
    lines.push(`${role}${entry.text}`);
  }
  return lines.join('\n');
}

function buildWeatherChangeBlock(state) {
  const p = state.pendingWeatherChange;
  if (!p) return '';
  return `\nWEATHER_JUST_CHANGED:
- From: ${p.from}
- To: ${p.to}
- This is the first time the player experiences this new weather.
- Describe the transition or the new conditions in one clause of your narration.
`;
}

// ---------------------------------------------------------------
// 1. GENESIS
// ---------------------------------------------------------------

export function genesisPrompts() {
  const system = `You are a world-builder for a survival adventure game set on a mysterious uncharted island in the 1700s.

You are NOT narrating yet. You are authoring the island.

You MUST respond with valid json only. No prose outside the json. No markdown fences.`;

  const resourceIds = worldBible.resources.map(r => r.id).join(', ');
  const toolIds     = worldBible.tools.map(t => t.id).join(', ');
  const buildingIds = worldBible.buildings.map(b => b.id).join(', ');

  const user = `Author an island. Return exactly this JSON shape:

${GENESIS_SCHEMA_EXAMPLE}

Requirements:
- The island has a single central mystery, revealable through 3 interlocking story threads.
- Provide 1 camp location at (0,0) plus 2-4 early locations within radius 3 of origin.
- Place only early locations. Later locations are authored later. Do NOT place the final chamber.
- Story thread milestones: 4-6 steps each. Final milestone of each thread requires radius 6+.
- Tone: hopeful but tense. Literary but not purple. No anachronisms.

Reference only these ids:
- Resources: ${resourceIds}
- Tools: ${toolIds}
- Buildings: ${buildingIds}

Return valid json only.`;

  return { system, user };
}

// ---------------------------------------------------------------
// 2. MID-GENESIS
// ---------------------------------------------------------------

export function midGenesisPrompts({ worldSeed, currentRadius, targetRadius, recentNarration, existingLocationIds }) {
  const system = `You are extending an existing survival adventure island. Respond with valid json only.`;

  const user = `Existing island seed:

${JSON.stringify(worldSeed, null, 2)}

Existing location ids (do not reuse): ${JSON.stringify(existingLocationIds)}

Player reached radius ${currentRadius}. Author locations for band up to radius ${targetRadius}.

Recent narration: ${recentNarration || '(none)'}

Return valid json:
{
  "new_locations": [
    {
      "id": "unique_id",
      "name": "The Place Name",
      "biome": "jungle",
      "position": { "x": 4, "y": -2 },
      "description": "One or two sentences.",
      "resources": ["wood", "vine"],
      "danger": 2,
      "story_hooks": ["milestone_id"]
    }
  ]
}

Return valid json only.`;

  return { system, user };
}

// ---------------------------------------------------------------
// 3. ARRIVAL BEAT
// ---------------------------------------------------------------

export function arrivalBeatPrompts({ worldSeed, state, history, action, pacing, locationContext }) {
  const strandedBlock = locationContext.stranded
    ? `\nPLAYER IS STRANDED — CRITICAL:
- The player is on impassable terrain with no passable adjacent tiles.
- You MUST give at least one choice that moves them off the impassable tile.
- forced_move_to is fine here.
- Do NOT leave them stuck.
`
    : '';

  const weatherChangeBlock = buildWeatherChangeBlock(state);

  const system = `You are the Game Master for a survival adventure on a mysterious uncharted island.

You narrate in second person, present tense.

You MUST respond with valid json only. No prose outside the json. No markdown fences.

TONE: hopeful but tense. Wonder and dread in equal measure. Literary, not purple. No anachronisms.

LENGTH: narration 2-4 sentences, max 70 words.

ARRIVAL BEAT:
- The player has just arrived at a location.
- Narrate what they see. Then offer 0 to 3 choices.

${MOVEMENT_RULES}

${CHOICE_RULES}

${WEATHER_RULES}
${weatherChangeBlock}${strandedBlock}
SINCE_LAST_BEAT:
- The block below shows everything the player has done since your last narration.
- READ IT. Use it. Reference where the player has been.

The available resources, tools, buildings, and animals in this world:

${WORLD_BIBLE_JSON}

RECIPES:
${JSON.stringify(RECIPE_SUMMARY, null, 2)}`;

  const user = `SINCE_LAST_BEAT:
${buildSinceLastBeat(state)}

ISLAND SEED:
${JSON.stringify(worldSeed, null, 2)}

CURRENT STATE:
${JSON.stringify(state, null, 2)}

WEATHER:
${JSON.stringify(locationContext.weatherInfo, null, 2)}

LOCATION CONTEXT:
${JSON.stringify(locationContext, null, 2)}

ADJACENT_TILES (the ONLY valid targets for moves_to):
${JSON.stringify(locationContext.adjacentTiles, null, 2)}

RECENT TILES VISITED:
${JSON.stringify(locationContext.recentTiles || [], null, 2)}

PACING:
${JSON.stringify(pacing, null, 2)}

RECENT HISTORY:
${history}

PLAYER ACTION:
${JSON.stringify(action)}

Narrate the arrival. Then offer 0, 1, 2, or 3 choices.

Respond with valid json:

${BEAT_SCHEMA_EXAMPLE}

For a forced-move choice:
${FORCED_MOVE_EXAMPLE}

Return valid json only.`;

  return { system, user };
}

// ---------------------------------------------------------------
// 4. ACTION BEAT — normal (used for choices the player taps)
// ---------------------------------------------------------------

export function actionBeatPrompts({ worldSeed, state, history, action, pacing, locationContext }) {
  const weatherChangeBlock = buildWeatherChangeBlock(state);

  const system = `You are the Game Master for a survival adventure on a mysterious uncharted island.

You narrate in second person, present tense.

You MUST respond with valid json only. No prose outside the json.

TONE: hopeful but tense. Literary, not purple.

LENGTH: ONE SENTENCE. Maximum 30 words.

ACTION BEAT:
- The player just took an action. Narrate its outcome in one sentence.
- Do NOT offer choices. The choices array MUST be empty.

${WEATHER_RULES}
${weatherChangeBlock}
MAKE IT INTERESTING ONLY WHEN IT'S EARNED.
If nothing is worth remarking on, describe the action plainly.

The available resources, tools, buildings, and animals in this world:

${WORLD_BIBLE_JSON}`;

  const user = `SINCE_LAST_BEAT:
${buildSinceLastBeat(state)}

CURRENT STATE:
${JSON.stringify(state, null, 2)}

WEATHER:
${JSON.stringify(locationContext.weatherInfo, null, 2)}

LOCATION CONTEXT:
${JSON.stringify(locationContext, null, 2)}

RECENT HISTORY:
${history}

PLAYER ACTION:
${JSON.stringify(action)}

Narrate the outcome in ONE sentence. Choices array MUST be empty.

Return valid json:
{
  "narration": "One sentence.",
  "beat_type": "flavour",
  "choices": [],
  "state_delta": {}
}

Return valid json only.`;

  return { system, user };
}

// ---------------------------------------------------------------
// 5. RARE EVENT BEAT — fired on the 8-30% roll after gather/craft/rest
// ---------------------------------------------------------------

export function rareEventBeatPrompts({ worldSeed, state, history, action, pacing, locationContext }) {
  const weatherChangeBlock = buildWeatherChangeBlock(state);

  const system = `You are the Game Master for a survival adventure on a mysterious uncharted island.

You narrate in second person, present tense.

You MUST respond with valid json only. No prose outside the json.

TONE: hopeful but tense. Literary, not purple.

LENGTH: 1-2 sentences. Maximum 40 words.

RARE EVENT — this is NOT a normal action beat.

An ordinary action has just occurred (gathering, crafting, resting). The engine
has already applied the mechanical effects. You must NOT re-narrate the action.

Instead, introduce ONE small unexpected thing the player notices, finds, or
experiences during or just after the action. It must:
- Be consistent with the biome, weather, and time of day.
- Be brief.
- Offer a small reward or hook: an item, a hint, a clue, an animal, a sound.
- Optionally include a small "state_delta" for what was found (1 item, small stat).
- NEVER advance a story thread — that is reserved for milestone beats.
- If the seed has relevant threads, hint at them lightly. Do not resolve them.

Choices array MUST be empty. This is flavour, not a decision point.

${WEATHER_RULES}
${weatherChangeBlock}
The available resources, tools, buildings, and animals in this world:

${WORLD_BIBLE_JSON}`;

  const user = `SINCE_LAST_BEAT:
${buildSinceLastBeat(state)}

ISLAND SEED (brief):
Island: ${worldSeed.island_name || 'unknown'}, secret: ${worldSeed.secret || 'unknown'}

CURRENT STATE:
${JSON.stringify(state, null, 2)}

WEATHER:
${JSON.stringify(locationContext.weatherInfo, null, 2)}

LOCATION CONTEXT:
${JSON.stringify(locationContext, null, 2)}

RECENT HISTORY:
${history}

PLAYER ACTION (already resolved):
${JSON.stringify(action)}

Introduce ONE small unexpected thing noticed during or after this action.

Return valid json:
{
  "narration": "One or two sentences.",
  "beat_type": "flavour",
  "choices": [],
  "state_delta": {}
}

Return valid json only.`;

  return { system, user };
}