// Date/time facts for the configured timezone, as a data provider (see
// src/providers.js for the provider shape). No I/O, so its properties are
// always available.

import { localDateISO, localMonth, localTimeHHMM } from '../public/datetime.js';

// Mon=1 .. Sun=7, timezone-aware.
const ISO_WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function localWeekday(now, timeZone) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ISO_WEEKDAY[short];
}

export const clockProvider = {
  name: 'clock',
  properties: [
    { name: 'month', type: 'number' },    // 1-12
    { name: 'hour', type: 'number' },     // 0-23
    { name: 'weekday', type: 'number' },  // 1 (Mon) .. 7 (Sun)
    { name: 'dateISO', type: 'string' },  // YYYY-MM-DD
  ],
  async load(env, now) {
    const tz = env.TIMEZONE;
    return {
      month: localMonth(now, tz),
      hour: Number(localTimeHHMM(now, tz).slice(0, 2)),
      weekday: localWeekday(now, tz),
      dateISO: localDateISO(now, tz),
    };
  },
};