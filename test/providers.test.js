import { describe, it, expect } from 'vitest';
import { clockProvider, buildContext, declaredProperties, PROVIDERS } from '../src/providers.js';
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
});

describe('buildContext', () => {
  const now = new Date('2026-07-15T12:30:00Z');

  it('merges the properties of every provider', async () => {
    const providers = [
      { name: 'a', properties: [{ name: 'x' }], load: async () => ({ x: 1 }) },
      { name: 'b', properties: [{ name: 'y' }], load: async () => ({ y: 2 }) },
    ];
    const ctx = await buildContext(baseEnv(), now, providers);
    expect(ctx).toMatchObject({ x: 1, y: 2 });
  });

  it('is best-effort: a provider that throws contributes nothing', async () => {
    const providers = [
      { name: 'ok', properties: [{ name: 'x' }], load: async () => ({ x: 1 }) },
      { name: 'boom', properties: [{ name: 'y' }], load: async () => { throw new Error('down'); } },
    ];
    const ctx = await buildContext(baseEnv(), now, providers);
    expect(ctx.x).toBe(1);
    expect('y' in ctx).toBe(false);
  });
});

describe('declaredProperties', () => {
  it('returns the union of every provider property name', () => {
    const providers = [
      { name: 'a', properties: [{ name: 'x' }, { name: 'z' }], load: async () => ({}) },
      { name: 'b', properties: [{ name: 'y' }], load: async () => ({}) },
    ];
    const props = declaredProperties(providers);
    expect([...props].sort()).toEqual(['x', 'y', 'z']);
  });

  it('throws when two providers declare the same property', () => {
    const providers = [
      { name: 'a', properties: [{ name: 'dup' }], load: async () => ({}) },
      { name: 'b', properties: [{ name: 'dup' }], load: async () => ({}) },
    ];
    expect(() => declaredProperties(providers)).toThrow(/dup/);
  });

  it('the real registry exposes clock and weather properties without collisions', () => {
    const props = declaredProperties(PROVIDERS);
    expect(props).toEqual(expect.any(Set));
    ['month', 'hour', 'weekday', 'raining', 'temperature', 'sunny'].forEach((p) => {
      expect(props.has(p)).toBe(true);
    });
  });
});
