import { describe, it, expect, vi, afterEach } from 'vitest';
import { pick, pickPerson, pickActivity, seasonalActivities, filterByWeather } from '../public/selection.js';

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
});

describe('seasonalActivities', () => {
  const yearRound = { id: 'y1', kategori: 'Mat & drikke', sesong: 'hele_aret' };
  const summerSeason = { id: 'sm1', kategori: 'Mat & drikke', sesong: 'sommer' };
  const special1 = { id: 's1', kategori: 'Sommerspesial', sesong: 'sommer' };
  const special2 = { id: 's2', kategori: 'Sommerspesial', sesong: 'sommer' };
  const all = [yearRound, summerSeason, special1, special2];
  const ids = (month) => seasonalActivities(all, month).map((a) => a.id);

  it('keeps only year-round activities outside the summer window', () => {
    for (const month of [1, 2, 3, 4, 9, 10, 11, 12]) {
      expect(ids(month)).toEqual(['y1']);
    }
  });
  it('adds sesong:sommer activities in May and August (but not Sommerspesial)', () => {
    expect(ids(5)).toEqual(['y1', 'sm1']);
    expect(ids(8)).toEqual(['y1', 'sm1']);
  });
  it('includes everything during June and July', () => {
    expect(ids(6)).toEqual(['y1', 'sm1', 's1', 's2']);
    expect(ids(7)).toEqual(['y1', 'sm1', 's1', 's2']);
  });
});

describe('filterByWeather', () => {
  const acts = [
    { id: 'in1', ute: false },
    { id: 'out1', ute: true },
    { id: 'in2' }, // no ute flag => treated as indoor
  ];
  it('drops outdoor (ute:true) activities when raining', () => {
    expect(filterByWeather(acts, true).map((a) => a.id)).toEqual(['in1', 'in2']);
  });
  it('keeps every activity when it is not raining', () => {
    expect(filterByWeather(acts, false)).toEqual(acts);
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
