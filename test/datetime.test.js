import { describe, it, expect } from 'vitest';
import { localDateISO, localTimeHHMM, localMonth } from '../public/datetime.js';

const TZ = 'Europe/Oslo';

describe('localDateISO', () => {
  it('formats the date in the given timezone', () => {
    expect(localDateISO(new Date('2026-06-26T08:30:00Z'), TZ)).toBe('2026-06-26');
  });
  it('rolls to the next local day when UTC is late', () => {
    // 23:30Z in June is 01:30 next day in Oslo (CEST = UTC+2)
    expect(localDateISO(new Date('2026-06-26T23:30:00Z'), TZ)).toBe('2026-06-27');
  });
});

describe('localTimeHHMM', () => {
  it('formats the time in the given timezone (CEST = UTC+2)', () => {
    expect(localTimeHHMM(new Date('2026-06-26T08:30:00Z'), TZ)).toBe('10:30');
  });
  it('renders midnight as 00:00', () => {
    // 22:00Z in June is 00:00 next day in Oslo
    expect(localTimeHHMM(new Date('2026-06-26T22:00:00Z'), TZ)).toBe('00:00');
  });
});

describe('localMonth', () => {
  it('returns the 1-12 month number in the given timezone', () => {
    expect(localMonth(new Date('2026-06-15T12:00:00Z'), TZ)).toBe(6);
    expect(localMonth(new Date('2026-01-15T12:00:00Z'), TZ)).toBe(1);
    expect(localMonth(new Date('2026-12-15T12:00:00Z'), TZ)).toBe(12);
  });
  it('uses the local month when UTC has rolled into the next one', () => {
    // 23:30Z on Jun 30 is 01:30 Jul 1 in Oslo (CEST = UTC+2)
    expect(localMonth(new Date('2026-06-30T23:30:00Z'), TZ)).toBe(7);
  });
});
