import { describe, it, expect, vi, afterEach } from 'vitest';
import { pick, pickPerson, pickActivity } from '../public/selection.js';

const people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const acts = [{ id: 'x1' }, { id: 'y1' }];

afterEach(() => vi.restoreAllMocks());

describe('pickPerson', () => {
  it('returns null when everyone is excluded', () => {
    expect(pickPerson(people, ['a', 'b', 'c'])).toBeNull();
  });
  it('returns null for an empty present list', () => {
    expect(pickPerson([], [])).toBeNull();
  });
  it('never returns an excluded person', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // first candidate
    expect(pickPerson(people, ['a'])).toEqual({ id: 'b', name: 'B' });
  });
});

describe('pickActivity', () => {
  it('avoids repeating the last activity (by id) when alternatives exist', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickActivity(acts, { id: 'x1' })).toEqual({ id: 'y1' });
  });
  it('allows a repeat when only one activity exists', () => {
    expect(pickActivity([{ id: 'x1' }], { id: 'x1' })).toEqual({ id: 'x1' });
  });
  it('returns null for an empty activity list', () => {
    expect(pickActivity([], null)).toBeNull();
  });
  it('favours a heavier activity where a uniform draw would not', () => {
    const weighted = [{ id: 'a' }, { id: 'b', vekting: 3 }]; // total vekting 4
    vi.spyOn(Math, 'random').mockReturnValue(0.3); // 1.2 into the range -> b
    expect(pickActivity(weighted, null)).toEqual({ id: 'b', vekting: 3 });
    // A uniform draw at 0.3 would have landed on the first entry instead.
  });
  it('stays inside the lighter activity below the vekting boundary', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2); // 0.8 into the range -> a
    expect(pickActivity([{ id: 'a' }, { id: 'b', vekting: 3 }], null)).toEqual({ id: 'a' });
  });
  it('treats a missing vekting as 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const implicit = pickActivity([{ id: 'a' }, { id: 'b', vekting: 3 }], null);
    const explicit = pickActivity([{ id: 'a', vekting: 1 }, { id: 'b', vekting: 3 }], null);
    expect(implicit.id).toBe(explicit.id);
  });
  it('falls back to 1 for a zero, negative, or non-numeric vekting', () => {
    // Nothing drops out of the pool and the total never becomes 0.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const acts = [{ id: 'a', vekting: 0 }, { id: 'b', vekting: -2 }, { id: 'c', vekting: 'abc' }];
    expect(pickActivity(acts, null)).toEqual({ id: 'b', vekting: -2 }); // middle of 3 equal slots
  });
  it('avoids repeating the last activity even when it is the heaviest', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(pickActivity([{ id: 'a' }, { id: 'b', vekting: 99 }], { id: 'b' })).toEqual({ id: 'a' });
  });
  it('returns the last activity at the very top of the range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999999999999999);
    expect(pickActivity([{ id: 'a', vekting: 2 }, { id: 'b' }], null)).toEqual({ id: 'b' });
  });
});

describe('pick', () => {
  it('returns both a person and an activity on a fresh spin', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = pick(people, acts, null, []);
    expect(r.person).toEqual({ id: 'a', name: 'A' });
    expect(r.activity).toEqual({ id: 'x1' });
  });
});
