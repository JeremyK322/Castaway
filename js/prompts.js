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
    { "id": "a", "label": "Follow the stream north", "risk": "low",  "costTicks": 2, "moves_to": { "x": 2, "y": -2 } },
    { "id": "b", "label": "Push deeper",             "risk": "high", "costTicks": 2, "moves_to": { "x": 3, "y": -1 } },
    { "id": "c", "label": "Return to camp",          "risk": "none", "costTicks": 1, "moves_to": { "x": 0, "y": 0 } }
  ],
  "state_delta": { "water": -5, "morale": 2 },
  "thread_progress": { "crown_of_the_god_king": "found_journal_page" },
  "flags": ["heard_the_stones"]
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
// Format the since-last-beat log
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
  const system = `You are the Game Master for a survival adventure on a mysterious uncharted island.

You narrate in second person, present tense.

You MUST respond with valid json only. No prose outside the json. No markdown fences.

TONE: hopeful but tense. Wonder and dread in equal measure. Literary, not purple. No anachronisms.

LENGTH: narration 2-4 sentences, max 70 words.

ARRIVAL BEAT:
- The player has just arrived at a location.
- Narrate what they see. Then offer 0 to 3 choices.
- 0 choices is FINE and often correct. Some places are just terrain.
- 1 choice — a small find or a single decision.
- 2 choices — a fork in the path.
- 3 choices — a full story moment.

SINCE_LAST_BEAT:
- The block below shows everything the player has done since your last narration — every move, gather, craft, rest, even if no API call was made.
- READ IT. Use it. Reference where the player has been.
- If the block is long, the player has been busy. Honor that.

MAKE IT INTERESTING:
- The island should feel alive, not procedural.
- Reference recent tiles the player visited.
- Reference the time of day, weather, and camp.
- If nothing interesting happens, say so briefly and let the player move.
- Do NOT force drama.

CHOICES ARE PERSISTENT:
- A location's choices are generated once and cached.
- Do NOT contradict choices the player has already seen at this location.
- If a permanent fact applies, reference it and do NOT offer that choice again.

CHOICES MAY EXPIRE:
- "expiresOnDay": integer. When day > expiresOnDay, the choice becomes a tombstone with "expired_label".
- Mark "permanent": true on choices that are consumed when taken.

THREAD PROGRESS:
- If the player genuinely reached a story milestone, include it in "thread_progress" as { "thread_id": "milestone_text" }.
- The engine uses this to advance the pacing and unlock later story beats.
- Only include it when a milestone is truly reached, not for flavour.

WEATHER IS GIVEN, NOT INVENTED:
- The WEATHER block tells you today's weather.
- Do NOT narrate a sunny day during a storm. Do NOT offer fishing during a storm.

The available resources, tools, buildings, and animals in this world:

${WORLD_BIBLE_JSON}

The player may craft these recipes at any time if they have the resources and required buildings. Do not invent recipes outside this list.

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

RECENT TILES VISITED:
${JSON.stringify(locationContext.recentTiles || [], null, 2)}

PACING:
${JSON.stringify(pacing, null, 2)}

RECENT HISTORY:
${history}

PLAYER ACTION:
${JSON.stringify(action)}

Narrate the arrival. Then offer 0, 1, 2, or 3 choices. Zero is fine.

Respond with valid json:

${BEAT_SCHEMA_EXAMPLE}

Return valid json only.`;

  return { system, user };
}

// ---------------------------------------------------------------
// 4. ACTION BEAT
// ---------------------------------------------------------------

export function actionBeatPrompts({ worldSeed, state, history, action, pacing, locationContext }) {
  const system = `You are the Game Master for a survival adventure on a mysterious uncharted island.

You narrate in second person, present tense.

You MUST respond with valid json only. No prose outside the json.

TONE: hopeful but tense. Literary, not purple.

LENGTH: ONE SENTENCE. Maximum 30 words.

ACTION BEAT:
- The player just took an action. Narrate its outcome in one sentence.
- Do NOT offer choices. The choices array must be empty.
- Do NOT contradict the seed, the weather, or the current location.

SINCE_LAST_BEAT:
- Use the block below for continuity. Reference where they've been.

MAKE IT INTERESTING ONLY WHEN IT'S EARNED:
- If the player has done something with consequence, reference it.
- Cooking repeatedly at the same camp might attract animals nearby.
- If nothing is worth remarking on, just describe the action.

WEATHER IS GIVEN, NOT INVENTED.

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

PLAYER ACTION:
${JSON.stringify(action)}

Narrate the outcome in ONE sentence. Choices array is empty.

Respond with valid json of shape:

{
  "narration": "One sentence describing what happened.",
  "beat_type": "flavour",
  "choices": [],
  "state_delta": {}
}

Return valid json only.`;

  return { system, user };
}