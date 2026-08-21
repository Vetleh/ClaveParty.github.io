import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postCheckin, getPresent, countCheckinReactors } from '../src/slack.js';
import { baseEnv } from './helpers.js';

const NOW = new Date('2026-06-26T08:30:00Z'); // 10:30 Oslo -> date key 2026-06-26

beforeEach(() => vi.restoreAllMocks());

describe('postCheckin', () => {
  it('posts a message and stores the ts in KV', async () => {
    const env = baseEnv();
    globalThis.fetch = vi.fn(async () => ({
      json: async () => ({ ok: true, channel: 'C123', ts: '111.222' }),
    }));
    const rec = await postCheckin(env, NOW);
    expect(rec).toEqual({ channel: 'C123', ts: '111.222' });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(await env.KV.get('checkin:2026-06-26', 'json')).toEqual({ channel: 'C123', ts: '111.222' });
  });

  it('is idempotent: does not post twice on the same day', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '999.000' }));
    globalThis.fetch = vi.fn();
    const rec = await postCheckin(env, NOW);
    expect(rec).toEqual({ channel: 'C123', ts: '999.000' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('getPresent', () => {
  it('returns resolved users who reacted with the check-in emoji', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('reactions.get')) {
        return { json: async () => ({ ok: true, message: { reactions: [
          { name: 'white_check_mark', users: ['U1', 'U2'] },
          { name: 'tada', users: ['U3'] },
        ] } }) };
      }
      if (u.includes('users.info')) {
        const id = new URL(u).searchParams.get('user');
        return { json: async () => ({ ok: true, user: { profile: { display_name: 'Name' + id, image_72: 'http://img/' + id } } }) };
      }
      throw new Error('unexpected url ' + u);
    });
    const present = await getPresent(env, NOW);
    expect(present).toEqual([
      { id: 'U1', name: 'NameU1', avatar: 'http://img/U1' },
      { id: 'U2', name: 'NameU2', avatar: 'http://img/U2' },
    ]);
  });

  it('returns an empty list when nobody used the check-in emoji', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [] } }) }));
    expect(await getPresent(env, NOW)).toEqual([]);
  });
});

describe('countCheckinReactors', () => {
  it('counts the people who reacted with the check-in emoji', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [
      { name: 'white_check_mark', users: ['U1', 'U2', 'U3'] },
      { name: 'tada', users: ['U4'] },
    ] } }) }));
    expect(await countCheckinReactors(env, NOW)).toBe(3);
  });

  it('resolves no names, so a headcount costs one Slack request', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('reactions.get')) {
        return { json: async () => ({ ok: true, message: { reactions: [
          { name: 'white_check_mark', users: ['U1', 'U2', 'U3'] },
        ] } }) };
      }
      return { json: async () => ({ ok: true, user: { profile: {} } }) };
    });
    await countCheckinReactors(env, NOW);
    const urls = globalThis.fetch.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.includes('users.info'))).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it('counts nobody when only other emoji were used', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [
      { name: 'tada', users: ['U4', 'U5'] },
    ] } }) }));
    expect(await countCheckinReactors(env, NOW)).toBe(0);
  });

  it('counts nobody when the message carries no reactions at all', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: {} }) }));
    expect(await countCheckinReactors(env, NOW)).toBe(0);
  });

  it('throws when Slack rejects the reactions lookup', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: false, error: 'channel_not_found' }) }));
    await expect(countCheckinReactors(env, NOW)).rejects.toThrow('channel_not_found');
  });
});
