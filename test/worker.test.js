import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { baseEnv } from './helpers.js';
import { localDateISO } from '../public/datetime.js';

beforeEach(() => vi.restoreAllMocks());

describe('worker.fetch', () => {
  it('serves /api/present as JSON', async () => {
    const env = baseEnv();
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [] } }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ present: [] });
  });

  it('returns 502 with an empty present list when Slack fails', async () => {
    const env = baseEnv();
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: false, error: 'channel_not_found' }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(502);
    expect((await res.json()).present).toEqual([]);
  });

  it('delegates non-api paths to static assets', async () => {
    const env = { ASSETS: { fetch: vi.fn(async () => new Response('<html>', { status: 200 })) } };
    const res = await worker.fetch(new Request('https://x/'), env);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe('worker.scheduled', () => {
  it('posts the check-in message', async () => {
    const env = baseEnv();
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, channel: 'C123', ts: '1.2' }) }));
    let pending;
    const ctx = { waitUntil: (p) => { pending = p; } };
    await worker.scheduled({}, env, ctx);
    await pending;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
