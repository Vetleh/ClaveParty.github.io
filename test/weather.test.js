import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRaining, weatherProvider } from '../src/weather.js';
import { baseEnv } from './helpers.js';

beforeEach(() => vi.restoreAllMocks());

// A minimal met.no nowcast GeoJSON payload carrying one precipitation reading.
const nowcast = (rate) => ({
  properties: { timeseries: [{ data: { instant: { details: { precipitation_rate: rate } } } }] },
});
const ok = (rate) => ({ ok: true, status: 200, json: async () => nowcast(rate) });

// A minimal met.no locationforecast payload carrying temperature + cloud cover.
const forecast = (air_temperature, cloud_area_fraction) => ({
  properties: { timeseries: [{ data: { instant: { details: { air_temperature, cloud_area_fraction } } } }] },
});

// Route a mocked fetch to the right payload by which met.no product it hits.
const metRouter = ({ rate, temp, cloud }) => vi.fn(async (url) => {
  if (String(url).includes('/nowcast/')) return ok(rate);
  return { ok: true, status: 200, json: async () => forecast(temp, cloud) };
});

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

describe('weatherProvider', () => {
  it('declares the properties the query language can use', () => {
    const names = weatherProvider.properties.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['raining', 'precipitationRate', 'temperature', 'cloudCover', 'sunny']));
  });

  it('reports rain, temperature and sunniness from both met.no products', async () => {
    globalThis.fetch = metRouter({ rate: 0, temp: 21, cloud: 5 });
    const ctx = await weatherProvider.load(baseEnv(), new Date());
    expect(ctx.raining).toBe(false);
    expect(ctx.precipitationRate).toBe(0);
    expect(ctx.temperature).toBe(21);
    expect(ctx.cloudCover).toBe(5);
    expect(ctx.sunny).toBe(true); // low cloud cover -> sunny
  });

  it('fetches both met.no products concurrently, not one after the other', async () => {
    // Sequential awaits double the worst-case pre-spin latency, which blocks the
    // wheel in its announcing state while met.no is slow.
    let inFlight = 0;
    let peakInFlight = 0;
    globalThis.fetch = vi.fn(async (url) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      if (String(url).includes('/nowcast/')) return ok(0);
      return { ok: true, status: 200, json: async () => forecast(18, 10) };
    });
    await weatherProvider.load(baseEnv(), new Date());
    expect(peakInFlight).toBe(2);
  });

  it('is not sunny under heavy cloud cover', async () => {
    globalThis.fetch = metRouter({ rate: 0, temp: 15, cloud: 90 });
    const ctx = await weatherProvider.load(baseEnv(), new Date());
    expect(ctx.sunny).toBe(false);
  });

  it('fails closed to raining=true and leaves rain detail unknown when nowcast fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/nowcast/')) throw new Error('down');
      return { ok: true, status: 200, json: async () => forecast(18, 10) };
    });
    const ctx = await weatherProvider.load(baseEnv(), new Date());
    expect(ctx.raining).toBe(true);
    expect(ctx.precipitationRate).toBeUndefined();
    expect(ctx.temperature).toBe(18); // the other product still works
  });

  it('leaves temperature/sunny unknown when locationforecast fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/nowcast/')) return ok(0);
      throw new Error('down');
    });
    const ctx = await weatherProvider.load(baseEnv(), new Date());
    expect(ctx.raining).toBe(false);
    expect(ctx.temperature).toBeUndefined();
    expect(ctx.sunny).toBeUndefined();
  });
});
