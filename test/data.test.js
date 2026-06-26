import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

describe('activities.json', () => {
  const data = read('../public/activities.json');
  it('has a non-empty activities array', () => {
    expect(Array.isArray(data.activities)).toBe(true);
    expect(data.activities.length).toBeGreaterThan(0);
  });
  it('gives every activity a string title', () => {
    for (const a of data.activities) expect(typeof a.title).toBe('string');
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
