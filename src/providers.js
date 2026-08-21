// The data-provider registry. Providers feed the query language: each declares
// the properties it supplies and a best-effort `load(env, now)` returning their
// current values. The language's vocabulary is exactly the union of those
// properties, so adding a source (people-in-office, today's lunch, …) means
// writing one provider module and listing it below — the engine and the activity
// data need no modification.
//
// A provider lives in its own file under src/ and looks like:
//   { name: string,
//     properties: [{ name: string, type: 'number' | 'boolean' | 'string' }],
//     async load(env, now) -> { [property]: value }   // omit a property to leave it unknown
//   }

import { clockProvider } from './clock.js';
import { weatherProvider } from './weather.js';
import { attendanceProvider } from './attendance.js';

// The active registry. Order only affects merge precedence on (disallowed)
// duplicate property names; declaredProperties() rejects those outright.
export const PROVIDERS = [clockProvider, weatherProvider, attendanceProvider];

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
