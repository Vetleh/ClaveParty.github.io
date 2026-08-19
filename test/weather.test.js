import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRaining } from '../src/weather.js';
import { baseEnv } from './helpers.js';

beforeEach(() => vi.restoreAllMocks());

// A minimal met.no nowcast GeoJSON payload carrying one precipitation reading.
const nowcast = (rate) => ({
  properties: { timeseries: [{ data: { instant: { details: { precipitation_rate: rate } } } }] },
});
const ok = (rate) => ({ ok: true, status: 200, json: async () => nowcast(rate) });

describe('isRaining', () => {
  it('is false when there is no precipitation', async () => {
    globalThis.fetch = vi.fn(async () => ok(0));
    expect(await isRaining(baseEnv())).toBe(false);
  });

  it('is true for any precipitation rate above zero', async () => {
    globalThis.fetch = vi.fn(async () => ok(0.1));
    expect(await isRaining(baseEnv())).toBe(true);
  });

  it('sends an identifying User-Agent to met.no', async () => {
    globalThis.fetch = vi.fn(async () => ok(0));
    await isRaining(baseEnv());
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers['User-Agent']).toMatch(/clave-party/);
  });

  it('retries and succeeds after transient failures', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error('network');
      return ok(0);
    });
    expect(await isRaining(baseEnv())).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all three attempts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(isRaining(baseEnv())).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('logs INFO on success and WARNING once per failed attempt', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n += 1;
      if (n < 2) throw new Error('boom');
      return ok(0);
    });
    await isRaining(baseEnv());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('treats a missing precipitation_rate as a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ properties: { timeseries: [] } }) }));
    await expect(isRaining(baseEnv())).rejects.toThrow();
  });
});
