import { describe, it, expect } from 'vitest';
import { wedgeAngles, rotationFor } from '../public/wheel-geometry.js';

describe('wedgeAngles', () => {
  it.each([1, 2, 3, 7, 20])('produces %i equal wedges summing to 360°', (n) => {
    const w = wedgeAngles(n);
    expect(w).toHaveLength(n);
    const total = w.reduce((s, x) => s + (x.end - x.start), 0);
    expect(total).toBeCloseTo(360);
    w.forEach((x) => {
      expect(x.end - x.start).toBeCloseTo(360 / n);
      expect(x.mid).toBeCloseTo((x.start + x.end) / 2);
    });
  });
});

describe('rotationFor', () => {
  // distance (deg) of the winner's wedge midpoint from the top pointer (0),
  // normalised to [0, 180] so that 0 and 360 both read as "under the pointer".
  const landed = (mid, R) => {
    const v = (((mid + R) % 360) + 360) % 360;
    return Math.min(v, 360 - v);
  };

  it.each([
    [1, 0], [2, 0], [2, 1], [3, 0], [3, 2], [7, 5], [20, 13],
  ])('lands winner %i of %i under the top pointer', (n, idx) => {
    const seg = 360 / n;
    const mid = idx * seg + seg / 2;
    const R = rotationFor(idx, n, 0, 5);
    expect(landed(mid, R)).toBeCloseTo(0);
  });

  it('always rotates forward across successive spins', () => {
    let current = 0;
    let prev = 0;
    for (const idx of [0, 2, 1, 4]) {
      const R = rotationFor(idx, 5, current, 5);
      expect(R).toBeGreaterThan(prev);
      current = R;
      prev = R;
    }
  });

  it('travels at least `turns` revolutions and less than one more', () => {
    const R = rotationFor(3, 8, 1000, 5);
    expect(R - 1000).toBeGreaterThanOrEqual(5 * 360);
    expect(R - 1000).toBeLessThan(6 * 360);
  });
});
