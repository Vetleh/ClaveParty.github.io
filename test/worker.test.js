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

  it('reports raining:false when met.no shows no precipitation', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      properties: { timeseries: [{ data: { instant: { details: { precipitation_rate: 0 } } } }] },
    }) }));
    const res = await worker.fetch(new Request('https://x/api/weather'), baseEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ raining: false });
  });

  it('fails closed to raining:true when met.no is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const res = await worker.fetch(new Request('https://x/api/weather'), baseEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ raining: true });
  });

  it('serves /api/activities as a filtered pool plus the context it used', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = baseEnv();
    await env.KV.put(`checkin:${localDateISO(new Date(), 'Europe/Oslo')}`, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('reactions.get')) {
        return { json: async () => ({ ok: true, message: { reactions: [
          { name: 'white_check_mark', users: ['U1', 'U2'] },
        ] } }) };
      }
      const details = String(url).includes('/nowcast/')
        ? { precipitation_rate: 0 }
        : { air_temperature: 21, cloud_area_fraction: 5 };
      return { ok: true, status: 200, json: async () => ({ properties: { timeseries: [{ data: { instant: { details } } }] } }) };
    });

    const res = await worker.fetch(new Request('https://x/api/activities'), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.context.raining).toBe(false);
    expect(body.context.temperature).toBe(21);
    expect(body.context.attending).toBe(2);
    expect(Array.isArray(body.activities)).toBe(true);
    expect(body.activities.length).toBeGreaterThan(0);
    for (const a of body.activities) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.tekst).toBe('string');
    }
  });

  it('/api/activities still returns a non-empty pool when met.no is down (fail closed)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => { throw new Error('down'); });
    const res = await worker.fetch(new Request('https://x/api/activities'), baseEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.context.raining).toBe(true); // unknown rain treated as rain
    expect('attending' in body.context).toBe(false); // unknown, so `attending gte n` is false
    expect(body.activities.length).toBeGreaterThan(0);
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
