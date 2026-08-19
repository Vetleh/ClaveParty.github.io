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

// Returns the upcoming spin as { time: "HH:MM", today: boolean }: the earliest
// scheduled time that has not run and whose grace window has not passed, or
// the first time tomorrow once today's spins are spent.
export function nextSpin(now, spinTimes, ranKeys, timeZone, graceMinutes = 15) {
  const date = localDateISO(now, timeZone);
  const nowMin = toMinutes(localTimeHHMM(now, timeZone));
  const times = [...spinTimes].sort((a, b) => toMinutes(a) - toMinutes(b));
  for (const t of times) {
    if (nowMin <= toMinutes(t) + graceMinutes && !ranKeys.includes(`${date}T${t}`)) {
      return { time: t, today: true };
    }
  }
  return { time: times[0], today: false };
}

// Returns the spin key whose weather should be prefetched now — i.e. exactly
// `leadMinutes` before its scheduled time — or null. Same key format as dueSpin
// so a stashed reading can be matched to the spin it belongs to. Minute
// granularity, like dueSpin; app.js dedupes repeat ticks within that minute.
export function duePrefetch(now, spinTimes, timeZone, leadMinutes = 1) {
  const date = localDateISO(now, timeZone);
  const nowMin = toMinutes(localTimeHHMM(now, timeZone));
  for (const t of spinTimes) {
    if (toMinutes(t) - nowMin === leadMinutes) return `${date}T${t}`;
  }
  return null;
}
