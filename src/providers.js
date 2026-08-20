// Data providers feed the query language. Each provider declares the properties
// it supplies and a best-effort `load(env, now)` returning their current values.
// The query language's vocabulary is exactly the union of these properties, so
// adding a source (people-in-office, today's lunch, …) is a one-object change
// here — the engine and activity data need no modification.
//
// A provider:
//   { name: string,
//     properties: [{ name: string, type: 'number' | 'boolean' | 'string' }],
//     async load(env, now) -> { [property]: value }   // omit a property to leave it unknown
//   }

import { localDateISO, localMonth, localTimeHHMM } from '../public/datetime.js';
import { weatherProvider } from './weather.js';

// Mon=1 .. Sun=7, timezone-aware.
const ISO_WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function localWeekday(now, timeZone) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ISO_WEEKDAY[short];
}

// Date/time facts for the configured timezone. Always available (no I/O).
export const clockProvider = {
  name: 'clock',
  properties: [
    { name: 'month', type: 'number' },   // 1-12
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

// The active registry. Order only affects merge precedence on (disallowed)
// duplicate property names; declaredProperties() rejects those outright.
export const PROVIDERS = [clockProvider, weatherProvider];

// The union of all declared property names. Throws if two providers declare the
// same name — a configuration error that would make one silently shadow another.
export function declaredProperties(providers = PROVIDERS) {
  const props = new Set();
  for (const provider of providers) {
    for (const { name } of provider.properties) {
      if (props.has(name)) {
        throw new Error(`Duplicate property '${name}' declared by more than one provider`);
      }
      props.add(name);
    }
  }
  return props;
}

// Run every provider best-effort and merge their values into one flat context.
// A provider that throws contributes nothing, so its properties stay unknown and
// any query referencing them evaluates false (fail-closed).
export async function buildContext(env, now, providers = PROVIDERS) {
  const context = {};
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        return await provider.load(env, now);
      } catch (err) {
        console.warn(`provider '${provider.name}' failed`, { error: String(err?.message || err) });
        return {};
      }
    }),
  );
  for (const values of results) Object.assign(context, values);
  return context;
}
