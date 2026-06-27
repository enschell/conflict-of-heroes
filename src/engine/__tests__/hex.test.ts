import { describe, expect, it } from 'vitest';
import { AXIAL_DIRECTIONS, distance, isInFrontArc, neighbors } from '../hex';
import type { Facing } from '../types';

describe('hex math', () => {
  it('computes distance', () => {
    expect(distance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(distance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(distance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(distance({ q: 0, r: 0 }, { q: -2, r: 2 })).toBe(2);
  });

  it('has six neighbours all at distance 1', () => {
    const ns = neighbors({ q: 0, r: 0 });
    expect(ns).toHaveLength(6);
    for (const n of ns) expect(distance({ q: 0, r: 0 }, n)).toBe(1);
  });

  it('front arc = facing direction plus the two adjacent directions', () => {
    // Facing 0 (East): front dirs {5,0,1}; flank dirs {2,3,4}.
    const origin = { q: 0, r: 0 };
    const facing: Facing = 0;
    const front = [5, 0, 1];
    for (let d = 0; d < 6; d++) {
      const target = AXIAL_DIRECTIONS[d]!;
      expect(isInFrontArc(origin, facing, target)).toBe(front.includes(d));
    }
  });

  it('the unit\'s own hex is not in its front arc', () => {
    expect(isInFrontArc({ q: 0, r: 0 }, 0, { q: 0, r: 0 })).toBe(false);
  });

  it('front/flank holds for every facing', () => {
    for (let f = 0; f < 6; f++) {
      const front = [(f + 5) % 6, f, (f + 1) % 6];
      for (let d = 0; d < 6; d++) {
        expect(isInFrontArc({ q: 0, r: 0 }, f as Facing, AXIAL_DIRECTIONS[d]!)).toBe(
          front.includes(d),
        );
      }
    }
  });
});
