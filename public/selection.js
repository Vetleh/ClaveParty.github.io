// Pure selection logic. No DOM. Randomness via Math.random (stubbed in tests).
//
// Eligibility filtering (season, weather, …) now happens server-side: the screen
// fetches an already-filtered pool from /api/activities. This module only picks
// a person and an activity from what it is given.

export function pickPerson(present, excluded = []) {
  const candidates = present.filter((p) => !excluded.includes(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pickActivity(activities, lastActivity = null) {
  if (activities.length === 0) return null;
  if (lastActivity && activities.length > 1) {
    const pool = activities.filter((a) => a.id !== lastActivity.id);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return activities[Math.floor(Math.random() * activities.length)];
}

export function pick(present, activities, lastActivity = null, excluded = []) {
  return {
    person: pickPerson(present, excluded),
    activity: pickActivity(activities, lastActivity),
  };
}
