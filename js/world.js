// world.js — the catalogue of things that exist in the world.

export const worldBible = {
  version: 1,

  resources: [
    { id: "wood",             name: "Driftwood",       glyph: "🪵" },
    { id: "stone",            name: "Stone",           glyph: "🪨" },
    { id: "vine",             name: "Vine",            glyph: "🌿" },
    { id: "fiber",            name: "Plant Fiber",     glyph: "🌾" },
    { id: "berries",          name: "Berries",         glyph: "🍓", edible: { food: 8 } },
    { id: "fish",             name: "Raw Fish",        glyph: "🐟", edible: { food: 6, sickChance: 0.15, sickDamage: 5 } },
    { id: "meat",             name: "Raw Meat",        glyph: "🍖", edible: { food: 10, sickChance: 0.25, sickDamage: 8 } },
    { id: "freshwater",       name: "Fresh Water",     glyph: "💧", edible: { water: 15 } },
    { id: "herbs",            name: "Medicinal Herbs", glyph: "🌱" },
    { id: "ore",              name: "Iron Ore",        glyph: "⚙️" },
    { id: "clay",             name: "Clay",            glyph: "🏺" },
    { id: "gold",             name: "Gold",            glyph: "🪙" },
    { id: "relic_fragment",   name: "Relic Fragment",  glyph: "🔮" },
  ],

  tools: [
    { id: "axe",     name: "Stone Axe",     glyph: "🪓" },
    { id: "pickaxe", name: "Stone Pickaxe", glyph: "⛏️" },
    { id: "rope",    name: "Vine Rope",     glyph: "🪢" },
    { id: "canteen", name: "Water Canteen", glyph: "🥤" },
    { id: "torch",   name: "Torch",         glyph: "🔦" },
    { id: "spear",   name: "Hunting Spear", glyph: "🗡️" },
  ],

  buildings: [
    { id: "campfire",    name: "Campfire",    glyph: "🔥" },
    { id: "lean-to",     name: "Lean-to",     glyph: "⛺" },
    { id: "hut",         name: "Hut",         glyph: "🛖" },
    { id: "workshop",    name: "Workshop",    glyph: "🔨" },
    { id: "well",        name: "Stone Well",  glyph: "💧" },
    { id: "goat_pen",    name: "Goat Pen",    glyph: "🐐" },
    { id: "signal_fire", name: "Signal Fire", glyph: "🔥" },
    { id: "shrine",      name: "Shrine",      glyph: "🛕" },
  ],

  gather: {
    beach: [
      { id: "wood",   name: "Driftwood",  icon: "🪵", min: 0.6, max: 1.2, tool: null, desc: "Dry wood along the tideline." },
      { id: "stone",  name: "Stone",      icon: "🪨", min: 0.4, max: 0.9, tool: null, desc: "Loose rocks in the sand." },
      { id: "fish",   name: "Shellfish",  icon: "🐚", min: 0.5, max: 1.1, tool: null, desc: "Shellfish in the shallows.", isFood: true },
    ],
    jungle: [
      { id: "berries", name: "Berries",    icon: "🍓", min: 0.4, max: 1.0, tool: null,  desc: "Wild berries. Sweet, mostly safe.", isFood: true },
      { id: "wood",    name: "Wood",       icon: "🪵", min: 0.7, max: 1.3, tool: "axe", desc: "Wood from trees. Faster with an axe." },
      { id: "vine",    name: "Vine",       icon: "🌿", min: 0.5, max: 1.0, tool: null,  desc: "Hanging vines, good for rope." },
      { id: "fiber",   name: "Fiber",      icon: "🌾", min: 0.6, max: 1.2, tool: null,  desc: "Tough plant fibers." },
    ],
    marsh: [
      { id: "freshwater", name: "Fresh Water", icon: "💧", min: 0.8, max: 1.4, tool: null, desc: "Clean water from the marsh.", isWater: true },
      { id: "fiber",      name: "Fiber",       icon: "🌾", min: 0.6, max: 1.0, tool: null, desc: "Reeds and grass fibers." },
      { id: "herbs",      name: "Herbs",       icon: "🌱", min: 0.3, max: 0.7, tool: null, desc: "Healing herbs." },
      { id: "clay",       name: "Clay",        icon: "🏺", min: 0.4, max: 0.8, tool: null, desc: "Wet clay from the banks." },
    ],
    hills: [
      { id: "stone", name: "Stone",  icon: "🪨", min: 0.5, max: 1.1, tool: null,      desc: "Rocks embedded in the slopes." },
      { id: "herbs", name: "Herbs",  icon: "🌱", min: 0.3, max: 0.8, tool: null,      desc: "Mountain herbs." },
      { id: "ore",   name: "Ore",    icon: "⚙️", min: 0.2, max: 0.5, tool: "pickaxe", desc: "Iron ore. Requires a pickaxe." },
    ],
    cliff: [
      { id: "stone", name: "Stone",  icon: "🪨", min: 0.4, max: 0.9, tool: null,      desc: "Fallen rocks." },
      { id: "ore",   name: "Ore",    icon: "⚙️", min: 0.15, max: 0.4, tool: "pickaxe", desc: "Ore veins. Requires a pickaxe." },
    ],
    cave: [
      { id: "ore",   name: "Ore",    icon: "⚙️", min: 0.4, max: 0.8, tool: "torch",  desc: "Rich ore. Requires a torch to see." },
      { id: "stone", name: "Stone",  icon: "🪨", min: 0.5, max: 1.0, tool: "torch",  desc: "Loose stone. Requires a torch." },
    ],
    ruins: [
      { id: "stone", name: "Stone",  icon: "🪨", min: 0.5, max: 0.9, tool: null,      desc: "Fallen masonry." },
      { id: "gold",  name: "Gold",   icon: "🪙", min: 0.1, max: 0.3, tool: "pickaxe", desc: "Gold fragments. Requires a pickaxe." },
    ],
    ocean_shallow: [
      { id: "fish",  name: "Fish",   icon: "🐟", min: 0.4, max: 0.9, tool: null, desc: "Fish in the shallows. Better at dawn or dusk.", isFood: true },
      { id: "fiber", name: "Fiber",  icon: "🌾", min: 0.4, max: 0.8, tool: null, desc: "Seaweed and tough kelp." },
    ],
  },

  // Priority for auto-consume. Lower = preferred.
  consumeOrder: {
    food: ["cooked_meat", "cooked_fish", "dried_berries", "berries", "fish", "meat"],
    water: ["freshwater"],
  },

  recipes: [
    // ----- TOOLS -----
    {
      id: "axe", kind: "tool", name: "Stone Axe", glyph: "🪓",
      cost: { wood: 3, stone: 2, fiber: 1 }, costTicks: 2,
      desc: "Cuts wood faster. +50% wood yield.",
      effects: { tool: "axe" },
    },
    {
      id: "pickaxe", kind: "tool", name: "Stone Pickaxe", glyph: "⛏️",
      cost: { wood: 3, stone: 3, fiber: 1 }, costTicks: 2,
      desc: "Enables ore gathering. +30% stone yield.",
      effects: { tool: "pickaxe" },
    },
    {
      id: "rope", kind: "tool", name: "Vine Rope", glyph: "🪢",
      cost: { vine: 3, fiber: 2 }, costTicks: 1,
      desc: "For climbing and taming.",
      effects: { tool: "rope" },
    },
    {
      id: "torch", kind: "tool", name: "Torch", glyph: "🔦",
      cost: { wood: 2, fiber: 1 }, costTicks: 1,
      desc: "Lets you explore caves.",
      effects: { tool: "torch" },
    },
    {
      id: "canteen", kind: "tool", name: "Water Canteen", glyph: "🥤",
      cost: { clay: 2, fiber: 1 }, costTicks: 2,
      desc: "Carry water away from sources.",
      effects: { tool: "canteen" },
    },
    {
      id: "spear", kind: "tool", name: "Hunting Spear", glyph: "🗡️",
      cost: { wood: 4, stone: 2, fiber: 2 }, costTicks: 3,
      desc: "Enables hunting large game.",
      effects: { tool: "spear" },
    },

    // ----- ITEMS -----
    {
      id: "cooked_fish", kind: "item", name: "Cooked Fish", glyph: "🍽️",
      cost: { fish: 1 }, costTicks: 1,
      requires: { buildingOnTile: "campfire" },
      desc: "A hot meal. +25 food.",
      effects: { consumable: { food: 25 } },
    },
    {
      id: "cooked_meat", kind: "item", name: "Cooked Meat", glyph: "🍖",
      cost: { meat: 1 }, costTicks: 1,
      requires: { buildingOnTile: "campfire" },
      desc: "Rich and warming. +40 food, +5 morale.",
      effects: { consumable: { food: 40, morale: 5 } },
    },
    {
      id: "bandage", kind: "item", name: "Bandage", glyph: "🩹",
      cost: { fiber: 1, herbs: 1 }, costTicks: 1,
      desc: "Heals 15 health when used.",
      effects: { consumable: { health: 15 } },
    },
    {
      id: "dried_berries", kind: "item", name: "Dried Berries", glyph: "🫐",
      cost: { berries: 3 }, costTicks: 2,
      requires: { buildingOnTile: "campfire" },
      desc: "Preserved food. +20 food, keeps well.",
      effects: { consumable: { food: 20 } },
    },

    // ----- CAMP -----
    {
      id: "campfire", kind: "camp", name: "Campfire", glyph: "🔥",
      cost: { wood: 3 }, costTicks: 1,
      desc: "Warmth, cooking, +1 HP/hour on rest.",
      effects: { restHP: 1, restMorale: 1, unlocksRecipe: "cooked_fish" },
    },
    {
      id: "lean-to", kind: "camp", name: "Lean-to Shelter", glyph: "⛺",
      cost: { wood: 6, fiber: 3 }, costTicks: 3,
      requires: { buildingOnTile: "campfire" },
      desc: "+2 HP/hour, +1 morale/hour on rest. Rain protection.",
      effects: { restHP: 2, restMorale: 1, fireProtection: "rain" },
    },
    {
      id: "hut", kind: "camp", name: "Hut", glyph: "🛖",
      cost: { wood: 12, stone: 4, fiber: 4 }, costTicks: 6,
      requires: { buildingOnTile: "campfire" },
      desc: "+5 HP/hour, +3 morale/hour. Full weather protection.",
      effects: { restHP: 5, restMorale: 3, fireProtection: "all" },
    },
    {
      id: "workshop", kind: "camp", name: "Workshop", glyph: "🔨",
      cost: { wood: 10, stone: 6 }, costTicks: 8,
      requires: { buildingOnTile: "campfire" },
      desc: "Unlocks advanced recipes.",
      effects: { unlocksRecipes: ["rope", "canteen"] },
    },
    {
      id: "well", kind: "camp", name: "Stone Well", glyph: "💧",
      cost: { stone: 10, wood: 2 }, costTicks: 6,
      requires: { buildingOnTile: "campfire" },
      desc: "Fresh water while at camp. +2 water/hour rest.",
      effects: { restWater: 2 },
    },
    {
      id: "goat_pen", kind: "camp", name: "Goat Pen", glyph: "🐐",
      cost: { wood: 8, fiber: 4, rope: 1 }, costTicks: 5,
      requires: { buildingOnTile: "workshop" },
      desc: "Home for tamed goats. Breed them for milk and hides.",
      effects: { unlocksRecipes: ["milk", "hide"] },
    },
    {
      id: "signal_fire", kind: "camp", name: "Signal Fire", glyph: "🔥",
      cost: { wood: 20, fiber: 10 }, costTicks: 12,
      requires: { buildingOnTile: "hut", biome: "cliff" },
      desc: "Lit for three nights, this summons rescue.",
      effects: { rescue: true },
    },
    {
      id: "shrine", kind: "camp", name: "Shrine", glyph: "🛕",
      cost: { stone: 15, gold: 2, relic_fragment: 1 }, costTicks: 10,
      requires: { buildingOnTile: "workshop", biome: "ruins" },
      desc: "A place to assemble the fragments. Unlocks the secret.",
      effects: { shrine: true },
    },
  ],
};

export default worldBible;