import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attendanceProvider } from '../src/attendance.js';
import { baseEnv } from './helpers.js';

const NOW = new Date('2026-06-26T08:30:00Z'); // 10:30 Oslo -> date key 2026-06-26

// Today's check-in message already exists, so no test posts to Slack.
async function envWithCheckin() {
  const env = baseEnv();
  await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
  return env;
}

function reactionsReply(reactions) {
  return vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions } }) }));
}

beforeEach(() => vi.restoreAllMocks());

describe('attendanceProvider', () => {
  it('declares the attending property', () => {
    expect(attendanceProvider.properties).toEqual([{ name: 'attending', type: 'number' }]);
  });

  it('reports how many people reacted with the check-in emoji', async () => {
    const env = await envWithCheckin();
    globalThis.fetch = reactionsReply([
      { name: 'white_check_mark', users: ['U1', 'U2', 'U3', 'U4'] },
      { name: 'eyes', users: ['U5'] },
    ]);
    expect(await attendanceProvider.load(env, NOW)).toEqual({ attending: 4 });
  });

  it('reports 0 rather than nothing when nobody has signed up', async () => {
    // 0 must be a known value: `attending eq 0` should be answerable, and it is
    // distinct from Slack being unreachable.
    const env = await envWithCheckin();
    globalThis.fetch = reactionsReply([]);
    expect(await attendanceProvider.load(env, NOW)).toEqual({ attending: 0 });
  });

  it('propagates a Slack failure so the property is left unknown', async () => {
    // buildContext catches this per provider; an unknown `attending` makes every
    // comparison on it false (fail-closed).
    const env = await envWithCheckin();
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: false, error: 'ratelimited' }) }));
    await expect(attendanceProvider.load(env, NOW)).rejects.toThrow('ratelimited');
  });
});
