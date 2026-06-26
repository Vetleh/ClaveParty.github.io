import { describe, it, expect } from 'vitest';
import { dueSpin } from '../public/scheduler.js';

const TZ = 'Europe/Oslo';
const TIMES = ['10:30', '14:30'];

it('fires the 10:30 spin within the grace window', () => {
  // 08:35Z = 10:35 Oslo (CEST), 5 min after 10:30
  expect(dueSpin(new Date('2026-06-26T08:35:00Z'), TIMES, [], TZ)).toBe('2026-06-26T10:30');
});

it('does not fire before the scheduled time', () => {
  // 08:25Z = 10:25 Oslo
  expect(dueSpin(new Date('2026-06-26T08:25:00Z'), TIMES, [], TZ)).toBeNull();
});

it('does not fire a stale spin past the grace window', () => {
  // 09:00Z = 11:00 Oslo, 30 min after 10:30
  expect(dueSpin(new Date('2026-06-26T09:00:00Z'), TIMES, [], TZ)).toBeNull();
});

it('does not re-fire a spin already run today', () => {
  expect(dueSpin(new Date('2026-06-26T08:35:00Z'), TIMES, ['2026-06-26T10:30'], TZ)).toBeNull();
});

it('fires the afternoon spin independently', () => {
  // 12:35Z = 14:35 Oslo
  expect(dueSpin(new Date('2026-06-26T12:35:00Z'), TIMES, ['2026-06-26T10:30'], TZ)).toBe('2026-06-26T14:30');
});
