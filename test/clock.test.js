import { describe, it, expect } from 'vitest';
import { clockProvider } from '../src/clock.js';
import { baseEnv } from './helpers.js';

describe('clockProvider', () => {
  it('reports timezone-aware month, hour, weekday and dateISO', async () => {
    // 2026-07-15 12:30 UTC is 14:30 in Oslo summer (UTC+2); a Wednesday.
    const now = new Date('2026-07-15T12:30:00Z');
    const ctx = await clockProvider.load(baseEnv({ TIMEZONE: 'Europe/Oslo' }), now);
    expect(ctx.month).toBe(7);
    expect(ctx.hour).toBe(14);
    expect(ctx.weekday).toBe(3); // Mon=1 .. Sun=7
    expect(ctx.dateISO).toBe('2026-07-15');
  });

  it('reads the date in the configured timezone, not UTC', async () => {
    // 22:30 UTC on the 15th is already 00:30 on the 16th in Oslo (UTC+2).
    const now = new Date('2026-07-15T22:30:00Z');
    const ctx = await clockProvider.load(baseEnv({ TIMEZONE: 'Europe/Oslo' }), now);
    expect(ctx.dateISO).toBe('2026-07-16');
    expect(ctx.hour).toBe(0);
    expect(ctx.weekday).toBe(4); // Thursday, not Wednesday
  });
});