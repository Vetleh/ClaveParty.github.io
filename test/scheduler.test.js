import { describe, it, expect } from 'vitest';
import { dueSpin, nextSpin } from '../public/scheduler.js';

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

describe('nextSpin', () => {
  it('points at the first spin of the day before it fires', () => {
    // 06:00Z = 08:00 Oslo
    expect(nextSpin(new Date('2026-06-26T06:00:00Z'), TIMES, [], TZ)).toEqual({ time: '10:30', today: true });
  });

  it('still points at a spin inside its grace window that has not run', () => {
    // 08:35Z = 10:35 Oslo, 5 min after 10:30
    expect(nextSpin(new Date('2026-06-26T08:35:00Z'), TIMES, [], TZ)).toEqual({ time: '10:30', today: true });
  });

  it('moves to the afternoon spin once the morning one has run', () => {
    // 08:35Z = 10:35 Oslo
    expect(nextSpin(new Date('2026-06-26T08:35:00Z'), TIMES, ['2026-06-26T10:30'], TZ)).toEqual({ time: '14:30', today: true });
  });

  it('moves to the afternoon spin once the morning grace window has passed', () => {
    // 09:00Z = 11:00 Oslo, 30 min after 10:30
    expect(nextSpin(new Date('2026-06-26T09:00:00Z'), TIMES, [], TZ)).toEqual({ time: '14:30', today: true });
  });

  it('rolls over to tomorrow after the last spin of the day', () => {
    // 14:00Z = 16:00 Oslo
    expect(nextSpin(new Date('2026-06-26T14:00:00Z'), TIMES, [], TZ)).toEqual({ time: '10:30', today: false });
  });

  it('handles unsorted spin times', () => {
    // 06:00Z = 08:00 Oslo
    expect(nextSpin(new Date('2026-06-26T06:00:00Z'), ['14:30', '10:30'], [], TZ)).toEqual({ time: '10:30', today: true });
  });
});
