// pacing.js — story pacing rules.
// Pure functions. Given the player's progress, decide what stories
// and beat types the LLM is allowed to produce next.

// ---------- tiers ----------

export const TIERS = {
  opening: {
    id: 'opening',
    minRadius: 0,
    maxRadius: 1,
    allowedBeats: ['flavour', 'hook', 'encounter_minor'],
    forbidsRevelation: true,
    forbidsFinale: true,
    canAdvanceThread: false,
  },
  early: {
    id: 'early',
    minRadius: 2,
    maxRadius: 3,
    allowedBeats: ['flavour', 'hook', 'encounter_minor', 'milestone_early', 'setback_minor'],
    forbidsRevelation: true,
    forbidsFinale: true,
    canAdvanceThread: true,
  },
  mid: {
    id: 'mid',
    minRadius: 4,
    maxRadius: 7,
    allowedBeats: ['flavour', 'hook', 'encounter', 'milestone', 'setback', 'discovery'],
    forbidsRevelation: true,
    forbidsFinale: true,
    canAdvanceThread: true,
  },
  late: {
    id: 'late',
    minRadius: 8,
    maxRadius: Infinity,
    allowedBeats: ['flavour', 'hook', 'encounter', 'milestone', 'setback', 'discovery', 'revelation'],
    forbidsRevelation: false,
    forbidsFinale: false,
    canAdvanceThread: true,
  },
};

/**
 * Which tier is the player in?
 * @param {number} radius   — Chebyshev distance from camp
 * @param {number} daysSinceBeat — days since last major story beat
 */
export function tierFor(radius, daysSinceBeat = 0) {
  // Force a beat if it's been too long, regardless of radius
  if (daysSinceBeat >= 3 && radius >= 2) {
    return TIERS.mid;
  }
  if (radius <= 1) return TIERS.opening;
  if (radius <= 3) return TIERS.early;
  if (radius <= 7) return TIERS.mid;
  return TIERS.late;
}

// ---------- milestones ----------

/**
 * Given the island seed and the player's thread progress,
 * which milestones are *available* next?
 *
 * Each thread in the seed has `milestones` (ordered). A milestone
 * is available if the previous one has been reached.
 *
 * @returns {Array<{threadId, index, description}>}
 */
export function availableMilestones(seed, threadsProgressed) {
  const out = [];
  if (!seed || !Array.isArray(seed.story_threads)) return out;

  for (const thread of seed.story_threads) {
    const reached = threadsProgressed?.[thread.id] ?? 0; // count of milestones done
    const nextIndex = reached; // 0-based
    if (nextIndex < thread.milestones.length) {
      out.push({
        threadId: thread.id,
        index: nextIndex,
        description: thread.milestones[nextIndex],
      });
    }
  }
  return out;
}

/**
 * Which milestones are forbidden right now?
 * Anything more than one step ahead of the next available one.
 */
export function forbiddenMilestones(seed, threadsProgressed) {
  const forbidden = [];
  if (!seed || !Array.isArray(seed.story_threads)) return forbidden;

  for (const thread of seed.story_threads) {
    const reached = threadsProgressed?.[thread.id] ?? 0;
    for (let i = reached + 1; i < thread.milestones.length; i++) {
      forbidden.push({
        threadId: thread.id,
        index: i,
        description: thread.milestones[i],
      });
    }
  }
  return forbidden;
}

// ---------- lazy world expansion ----------

/**
 * Should the engine fire a mid-genesis call to author new locations?
 *
 * Rule: author a new band whenever the player crosses a radius boundary
 * that hasn't been authored yet.
 */
export const GENESIS_BANDS = [3, 5, 8, 12, 18];

export function shouldFireMidGenesis(radius, lastGenesisRadius) {
  for (const band of GENESIS_BANDS) {
    if (radius >= band && lastGenesisRadius < band) {
      return band;
    }
  }
  return null;
}

// ---------- beat type filtering ----------

/**
 * Given the tier and the story so far, what beat types may the LLM produce?
 */
export function allowedBeatTypes(tier, opts = {}) {
  const base = [...tier.allowedBeats];
  // If a thread milestone is available, milestones are OK.
  // (We still let the LLM decide whether this turn advances it.)
  if (opts.hasAvailableMilestone && !base.includes('milestone')) {
    base.push('milestone');
  }
  return base;
}

/**
 * Which beat types are explicitly forbidden this turn?
 */
export function forbiddenBeatTypes(tier) {
  const out = [];
  if (tier.forbidsRevelation) out.push('revelation');
  if (tier.forbidsFinale) out.push('finale');
  return out;
}

/**
 * Build the PACING_TIER block for the beat prompt.
 */
export function buildPacingBlock({ radius, daysSinceBeat, seed, threadsProgressed }) {
  const tier = tierFor(radius, daysSinceBeat);
  const available = availableMilestones(seed, threadsProgressed);
  const forbidden = forbiddenMilestones(seed, threadsProgressed);
  const allowed = allowedBeatTypes(tier, { hasAvailableMilestone: available.length > 0 });
  const forbiddenBeats = forbiddenBeatTypes(tier);

  return {
    tier: tier.id,
    radius,
    daysSinceBeat,
    allowedBeats: allowed,
    forbiddenBeats,
    availableMilestones: available.map(m => `${m.threadId}[${m.index}]: ${m.description}`),
    forbiddenMilestones: forbidden.map(m => `${m.threadId}[${m.index}]: ${m.description}`),
    canAdvanceThread: tier.canAdvanceThread,
    forbidsRevelation: tier.forbidsRevelation,
    forbidsFinale: tier.forbidsFinale,
  };
}