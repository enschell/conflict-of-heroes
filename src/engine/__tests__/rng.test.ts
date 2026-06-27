import { describe, expect, it } from 'vitest';
import { makeRng, roll2d6, rollD6 } from '../rng';

describe('seeded RNG', () => {
  it('is deterministic for a given seed', () => {
    const a = roll2d6(makeRng(42));
    const b = roll2d6(makeRng(42));
    expect(a.value).toBe(b.value);
    expect(a.dice).toEqual(b.dice);
    expect(a.rng).toEqual(b.rng);
  });

  it('advances state so successive rolls differ in sequence', () => {
    const r1 = rollD6(makeRng(7));
    const r2 = rollD6(r1.rng);
    expect(r1.rng).not.toEqual(r2.rng);
  });

  it('produces dice in range 1..6 and 2..12', () => {
    let rng = makeRng(123);
    for (let i = 0; i < 500; i++) {
      const d = rollD6(rng);
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(6);
      rng = d.rng;
      const t = roll2d6(rng);
      expect(t.value).toBeGreaterThanOrEqual(2);
      expect(t.value).toBeLessThanOrEqual(12);
      rng = t.rng;
    }
  });
});
