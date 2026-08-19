// Pure selection logic. No DOM. Randomness via Math.random (stubbed in tests).

const SUMMER_ONLY_CATEGORY = 'Sommerspesial';
const SUMMER_ONLY_MONTHS = [6, 7];         // Sommerspesial: June & July only
const SUMMER_SEASON = 'sommer';
const SUMMER_SEASON_MONTHS = [5, 6, 7, 8]; // sesong: sommer: May–August

// Whether an activity is in season for the given 1-12 `month`:
//  - Sommerspesial activities run only in June & July (tightest rule wins,
//    even though they are also tagged sesong: sommer).
//  - Other sesong: sommer activities run May–August.
//  - Everything else is available year-round.
export function inSeason(activity, month) {
  if (activity.kategori === SUMMER_ONLY_CATEGORY) return SUMMER_ONLY_MONTHS.includes(month);
  if (activity.sesong === SUMMER_SEASON) return SUMMER_SEASON_MONTHS.includes(month);
  return true;
}

export function seasonalActivities(activities, month) {
  return activities.filter((a) => inSeason(a, month));
}

// When it's raining, drop activities that require going outside (ute: true).
// Anything else passes through unchanged.
export function filterByWeather(activities, raining) {
  return raining ? activities.filter((a) => a.ute !== true) : activities;
}

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
