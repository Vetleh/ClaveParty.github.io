import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

describe('activities.json', () => {
  const data = read('../public/activities.json');
  it('has a non-empty aktiviteter array', () => {
    expect(Array.isArray(data.aktiviteter)).toBe(true);
    expect(data.aktiviteter.length).toBeGreaterThan(0);
  });
  it('gives every activity a string id, kategori, and tekst', () => {
    for (const a of data.aktiviteter) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.kategori).toBe('string');
      expect(typeof a.tekst).toBe('string');
    }
  });
  it('has unique ids (so the avoid-repeat dedupe works)', () => {
    const ids = data.aktiviteter.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('config.json', () => {
  const cfg = read('../public/config.json');
  it('has the fields app.js depends on', () => {
    expect(Array.isArray(cfg.spinTimes)).toBe(true);
    expect(cfg.spinTimes.length).toBeGreaterThan(0);
    expect(typeof cfg.timezone).toBe('string');
    expect(typeof cfg.countdownSeconds).toBe('number');
    expect(typeof cfg.graceMinutes).toBe('number');
    expect(typeof cfg.soundFile).toBe('string');
    expect(typeof cfg.pollSeconds).toBe('number');
  });
});
