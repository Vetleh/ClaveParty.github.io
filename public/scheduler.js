import { localDateISO, localTimeHHMM } from './datetime.js';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Returns the spin key that should fire now, or null. A spin is "due" when the
// current local time is at or within graceMinutes after a scheduled time, and
// that day's key for it has not already run.
export function dueSpin(now, spinTimes, ranKeys, timeZone, graceMinutes = 15) {
  const date = localDateISO(now, timeZone);
  const nowMin = toMinutes(localTimeHHMM(now, timeZone));
  for (const t of spinTimes) {
    const delta = nowMin - toMinutes(t);
    if (delta >= 0 && delta <= graceMinutes) {
      const key = `${date}T${t}`;
      if (!ranKeys.includes(key)) return key;
    }
  }
  return null;
}
