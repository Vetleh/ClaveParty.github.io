import { describe, it, expect } from 'vitest';
import { compile, tokenize, parse } from '../src/query.js';

// Evaluate a query string against a context in one step.
const run = (query, ctx) => compile(query)(ctx);

describe('query engine — comparisons', () => {
  it('evaluates numeric gt/gte/lt/lte', () => {
    expect(run('temperature gt 15', { temperature: 20 })).toBe(true);
    expect(run('temperature gt 15', { temperature: 15 })).toBe(false);
    expect(run('temperature gte 15', { temperature: 15 })).toBe(true);
    expect(run('temperature lt 15', { temperature: 10 })).toBe(true);
    expect(run('temperature lte 15', { temperature: 20 })).toBe(false);
  });

  it('evaluates eq/neq for booleans and numbers', () => {
    expect(run('raining eq false', { raining: false })).toBe(true);
    expect(run('raining eq false', { raining: true })).toBe(false);
    expect(run('month neq 12', { month: 6 })).toBe(true);
    expect(run('month neq 12', { month: 12 })).toBe(false);
  });

  it('evaluates eq for quoted string literals', () => {
    expect(run('kategori eq "Sommerspesial"', { kategori: 'Sommerspesial' })).toBe(true);
    expect(run('kategori eq "Mat & drikke"', { kategori: 'Sommerspesial' })).toBe(false);
  });

  it('supports negative number literals', () => {
    expect(run('temperature lt -3', { temperature: -5 })).toBe(true);
    expect(run('temperature lt -3', { temperature: 0 })).toBe(false);
  });
});

describe('query engine — boolean logic and precedence', () => {
  it('combines with and/or', () => {
    expect(run('month gte 6 and month lte 8', { month: 7 })).toBe(true);
    expect(run('month gte 6 and month lte 8', { month: 9 })).toBe(false);
    expect(run('month lt 3 or month gt 10', { month: 12 })).toBe(true);
  });

  it('binds and tighter than or', () => {
    // false and false or true  ==  (false and false) or true  == true
    expect(run('month gt 10 and month lt 3 or raining eq false', { month: 6, raining: false })).toBe(true);
  });

  it('respects parentheses and nesting', () => {
    const q = 'month gte 6 and month lte 8 and ((temperature gt 15 or sunny eq true) or temperature gt 20)';
    expect(run(q, { month: 7, temperature: 12, sunny: true })).toBe(true);
    expect(run(q, { month: 7, temperature: 12, sunny: false })).toBe(false);
    expect(run(q, { month: 7, temperature: 22, sunny: false })).toBe(true);
    expect(run(q, { month: 9, temperature: 22, sunny: true })).toBe(false);
  });

  it('negates with not', () => {
    expect(run('not month eq 12', { month: 6 })).toBe(true);
    expect(run('not month eq 12', { month: 12 })).toBe(false);
  });
});

describe('query engine — fail-closed unknown properties', () => {
  it('makes any comparison on an unknown property false', () => {
    expect(run('temperature gt 15', {})).toBe(false);
    expect(run('temperature lt 15', {})).toBe(false);
    expect(run('raining eq false', {})).toBe(false); // rain unknown -> outdoor excluded
    expect(run('raining eq true', {})).toBe(false);
  });

  it('makes ordering on a non-numeric value false', () => {
    expect(run('temperature gt 15', { temperature: 'warm' })).toBe(false);
  });

  it('treats inherited Object.prototype names as unknown', () => {
    // `context[name]` would resolve these off the prototype chain, letting
    // `constructor neq 0` evaluate true and sneak an activity through.
    for (const q of [
      'constructor neq 0',
      'toString neq 0',
      'valueOf neq 5',
      'hasOwnProperty neq 1',
      'isPrototypeOf neq 1',
    ]) {
      expect(run(q, {}), q).toBe(false);
    }
  });

  it('documents the fail-open pitfall of negated conditions', () => {
    // `not (raining eq true)` fails OPEN when rain is unknown — why conditions
    // must be authored as positive requirements (`raining eq false`).
    expect(run('not (raining eq true)', {})).toBe(true);
  });
});

describe('query engine — property validation', () => {
  it('accepts queries whose properties are all declared', () => {
    const allowed = new Set(['month', 'temperature']);
    expect(() => parse(tokenize('month gte 6 and temperature gt 15'), allowed)).not.toThrow();
  });

  it('rejects a query referencing an undeclared property', () => {
    const allowed = new Set(['month']);
    expect(() => parse(tokenize('humidity gt 80'), allowed)).toThrow(/humidity/);
  });
});

describe('query engine — malformed input', () => {
  it('throws on a dangling operator', () => {
    expect(() => compile('month gte')).toThrow();
  });

  it('throws on unbalanced parentheses', () => {
    expect(() => compile('(month gte 6')).toThrow();
  });

  it('throws on trailing tokens', () => {
    expect(() => compile('month gte 6 month lte 8')).toThrow();
  });
});
