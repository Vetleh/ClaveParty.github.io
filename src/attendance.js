// How many people have signed up for today's round, as a data provider (see
// src/providers.js for the provider shape). The number is the count of reactions
// with CHECKIN_EMOJI on the daily Slack check-in message — the same signal
// /api/present uses to fill the wheel, so `attending` counts people who actively
// said they are joining, not devices seen on the office network.
//
// Errors are left to throw: buildContext catches per provider, which leaves
// `attending` unknown so every comparison on it is false (fail-closed). An empty
// message is different — nobody signed up is a known 0, and `attending eq 0`
// answers it.

import { countCheckinReactors } from './slack.js';

export const attendanceProvider = {
  name: 'attendance',
  properties: [{ name: 'attending', type: 'number' }],
  async load(env, now) {
    return { attending: await countCheckinReactors(env, now) };
  },
};
