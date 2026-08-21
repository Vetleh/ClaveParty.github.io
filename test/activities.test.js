import { describe, it, expect, vi } from 'vitest';
import { filterActivities, activities } from '../src/activities.js';

const ids = (list) => list.map((a) => a.id);

describe('filterActivities', () => {
  it('always includes activities that have no betingelse', () => {
    const list = [{ id: 'a' }, { id: 'b', betingelse: 'month eq 1' }];
    expect(ids(filterActivities(list, { month: 7 }))).toEqual(['a']);
  });

  it('includes an activity when its betingelse matches, excludes it otherwise', () => {
    // An unconditional 'always' keeps the pool non-empty so the fallback does
    // not mask whether 'summer' was included or excluded.
    const list = [{ id: 'always' }, { id: 'summer', betingelse: 'month gte 6 and month lte 8' }];
    expect(ids(filterActivities(list, { month: 7 }))).toEqual(['always', 'summer']);
    expect(ids(filterActivities(list, { month: 2 }))).toEqual(['always']);
  });

  it('falls back to the unconditional activities when everything is filtered out', () => {
    const list = [
      { id: 'always' },
      { id: 'winter', betingelse: 'month lt 3' },
    ];
    // month 7 excludes 'winter'; 'always' has no condition, so it is returned —
    // but even if it did not match, the fallback guarantees a non-empty pool.
    const winterOnly = [{ id: 'winter', betingelse: 'month lt 3' }, { id: 'summer', betingelse: 'month gt 5' }];
    expect(ids(filterActivities(winterOnly, { month: 4 }))).toEqual(['winter', 'summer']); // all, as last resort
    expect(ids(filterActivities(list, { month: 7 }))).toEqual(['always']);
  });

  it('excludes (never throws on) an activity whose betingelse is malformed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = [{ id: 'ok' }, { id: 'bad', betingelse: 'month gte' }];
    expect(ids(filterActivities(list, { month: 7 }))).toEqual(['ok']);
  });

  it('rejects a betingelse naming an undeclared property, naming it in the log', () => {
    // A typo must be reported, not silently evaluated as false forever.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = [{ id: 'ok' }, { id: 'typo', betingelse: 'temprature gt 20' }];
    expect(ids(filterActivities(list, { temperature: 25 }))).toEqual(['ok']);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toMatch(/temprature/);
  });
});

describe('activities data', () => {
  it('loads the activity list from the bundled JSON', () => {
    expect(Array.isArray(activities)).toBe(true);
    expect(activities.length).toBeGreaterThan(0);
  });
});
