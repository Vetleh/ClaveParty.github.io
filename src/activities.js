// The activity catalogue and the eligibility filter.
//
// Data is authored in public/activities.json (still served statically for the
// repo's editing conventions) and bundled into the Worker here, so the server
// can evaluate each activity's `betingelse` query against the current context.

import { compile } from './query.js';
import { declaredProperties } from './providers.js';
import data from '../public/activities.json';

export const activities = data.aktiviteter;

// The query vocabulary, resolved once on first use. Computed lazily so a
// duplicate-property misconfiguration surfaces as an excluded activity with a
// log line rather than as an exception at module load.
let allowedProps;
function allowed() {
  if (!allowedProps) allowedProps = declaredProperties();
  return allowedProps;
}

// Cache compiled predicates by query string — the catalogue is small and static.
const predicateCache = new Map();
function predicateFor(betingelse) {
  if (!predicateCache.has(betingelse)) {
    // Validating against the declared vocabulary turns a typo into a loud,
    // named failure instead of a condition that silently never matches.
    predicateCache.set(betingelse, compile(betingelse, allowed()));
  }
  return predicateCache.get(betingelse);
}

// True if an activity is eligible in the given context. An activity with no
// `betingelse` is always eligible. A malformed query excludes the activity
// (fail-closed) rather than breaking the whole spin.
function isEligible(activity, context) {
  if (!activity.betingelse) return true;
  try {
    return predicateFor(activity.betingelse)(context);
  } catch (err) {
    console.warn('invalid betingelse, excluding activity', {
      id: activity.id,
      betingelse: activity.betingelse,
      error: String(err?.message || err),
    });
    return false;
  }
}

// Filter to the activities eligible in `context`. Guarantees a non-empty result
// whenever `list` is non-empty: if nothing matches, fall back to the
// unconditional activities, and if there are none, to the whole list.
export function filterActivities(list, context) {
  const eligible = list.filter((a) => isEligible(a, context));
  if (eligible.length) return eligible;
  const unconditional = list.filter((a) => !a.betingelse);
  return unconditional.length ? unconditional : list;
}
