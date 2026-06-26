import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeScan, getNetworkDevices } from '../src/network.js';
import worker from '../src/worker.js';
import { baseEnv } from './helpers.js';
import { localDateISO } from '../public/datetime.js';

beforeEach(() => vi.restoreAllMocks());

const DEVICES = [
  { ip: '10.0.0.209', mac: 'c0:c7:db:0c:05:88', hostname: 'Karine-sin-MBP.localdomain' },
  { ip: '10.0.0.60', mac: '', hostname: 'Pixel-10-Pro.local' },
];

describe('storeScan / getNetworkDevices', () => {
  it('persists a scan and reads it back while fresh', async () => {
    const env = baseEnv();
    const now = new Date('2026-06-26T08:30:00Z');
    await storeScan(env, { devices: DEVICES }, now);
    expect(await getNetworkDevices(env, now)).toHaveLength(2);
  });

  it('drops a scan older than the TTL', async () => {
    const env = baseEnv({ NETWORK_PRESENCE_TTL_MINUTES: '20' });
    const scannedAt = new Date('2026-06-26T08:30:00Z');
    await storeScan(env, { devices: DEVICES }, scannedAt);
    const later = new Date(scannedAt.getTime() + 21 * 60 * 1000);
    expect(await getNetworkDevices(env, later)).toEqual([]);
  });

  it('rejects a malformed body', async () => {
    const env = baseEnv();
    await expect(storeScan(env, { devices: 'nope' }, new Date())).rejects.toThrow();
  });
});

describe('POST /api/network-presence', () => {
  const post = (env, body, token) =>
    worker.fetch(
      new Request('https://x/api/network-presence', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(body),
      }),
      env
    );

  it('401s without the correct agent token', async () => {
    const env = baseEnv({ NETWORK_AGENT_TOKEN: 'secret' });
    const res = await post(env, { devices: DEVICES }, 'wrong');
    expect(res.status).toBe(401);
  });

  it('503s when no agent token is configured', async () => {
    const res = await post(baseEnv(), { devices: DEVICES }, 'anything');
    expect(res.status).toBe(503);
  });

  it('stores the scan and echoes matched/unmatched', async () => {
    const env = baseEnv({ NETWORK_AGENT_TOKEN: 'secret' });
    const res = await post(env, { devices: DEVICES }, 'secret');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(2);
    // Pixel is unidentified against the real roster -> surfaced as unmatched.
    expect(json.unmatched.some((d) => d.hostname.includes('Pixel'))).toBe(true);
    expect(await getNetworkDevices(env, new Date())).toHaveLength(2);
  });

  it('405s on non-POST', async () => {
    const env = baseEnv({ NETWORK_AGENT_TOKEN: 'secret' });
    const res = await worker.fetch(new Request('https://x/api/network-presence'), env);
    expect(res.status).toBe(405);
  });
});

describe('GET /api/present merges network + slack', () => {
  it('includes network people even when nobody reacted in Slack', async () => {
    const env = baseEnv({ NETWORK_AGENT_TOKEN: 'secret' });
    // Seed a fresh scan containing a roster-known device (Vetle).
    await storeScan(
      env,
      { devices: [{ ip: '10.0.0.197', mac: 'aa:bb:cc:dd:ee:01', hostname: 'Vetles-MacBook.local' }] },
      new Date()
    );
    // Slack returns an empty reaction set.
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [] } }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(200);
    const { present } = await res.json();
    expect(present.map((p) => p.id)).toContain('vetle');
    expect(present.find((p) => p.id === 'vetle').sources).toEqual(['network']);
  });

  it('still serves network presence (200) when Slack fails', async () => {
    const env = baseEnv({ NETWORK_AGENT_TOKEN: 'secret' });
    await storeScan(
      env,
      { devices: [{ ip: '10.0.0.197', mac: 'aa:bb:cc:dd:ee:01', hostname: 'Vetles-MacBook.local' }] },
      new Date()
    );
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: false, error: 'channel_not_found' }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.present.map((p) => p.id)).toContain('vetle');
    expect(body.warning).toContain('channel_not_found');
  });
});
