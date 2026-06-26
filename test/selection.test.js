import { describe, it, expect, vi, afterEach } from 'vitest';
import { pick, pickPerson, pickActivity } from '../public/selection.js';

const people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const acts = [{ title: 'X' }, { title: 'Y' }];

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
  it('avoids repeating the last activity when alternatives exist', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickActivity(acts, { title: 'X' })).toEqual({ title: 'Y' });
  });
  it('allows a repeat when only one activity exists', () => {
    expect(pickActivity([{ title: 'X' }], { title: 'X' })).toEqual({ title: 'X' });
  });
  it('returns null for an empty activity list', () => {
    expect(pickActivity([], null)).toBeNull();
  });
});

describe('pick', () => {
  it('returns both a person and an activity on a fresh spin', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = pick(people, acts, null, []);
    expect(r.person).toEqual({ id: 'a', name: 'A' });
    expect(r.activity).toEqual({ title: 'X' });
  });
});
