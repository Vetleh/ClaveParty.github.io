// Pure selection logic. No DOM. Randomness via Math.random (stubbed in tests).
//
// Eligibility filtering (season, weather, …) now happens server-side: the screen
// fetches an already-filtered pool from /api/activities. This module only picks
// a person and an activity from what it is given.
//
// People are drawn uniformly. Activities are drawn by `vekting` — a hand-tuned
// number in activities.json, defaulting to 1 — so a rarely-eligible activity can
// be made to stand out during its window.

export function pickPerson(present, excluded = []) {
  const candidates = present.filter((p) => !excluded.includes(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const DEFAULT_WEIGHT = 1;

// A missing, non-numeric, or non-positive `vekting` falls back to the default rather
// than silently dropping the activity out of the pool.
function weightOf(activity) {
  const w = Number(activity.vekting);
  return Number.isFinite(w) && w > 0 ? w : DEFAULT_WEIGHT;
}

// Cumulative-weight scan. At Math.random() === 0 this returns the first candidate,
// exactly as a uniform index draw did.
function weightedPick(list) {
  const total = list.reduce((sum, a) => sum + weightOf(a), 0);
  let r = Math.random() * total;
  for (const a of list) {
    r -= weightOf(a);
    if (r < 0) return a;
  }
  return list[list.length - 1]; // float rounding at r ≈ total
}

export function pickActivity(activities, lastActivity = null) {
  if (activities.length === 0) return null;
  const pool =
    lastActivity && activities.length > 1
      ? activities.filter((a) => a.id !== lastActivity.id)
      : activities;
  return weightedPick(pool);
}

export function pick(present, activities, lastActivity = null, excluded = []) {
  return {
    person: pickPerson(present, excluded),
    activity: pickActivity(activities, lastActivity),
  };
}
