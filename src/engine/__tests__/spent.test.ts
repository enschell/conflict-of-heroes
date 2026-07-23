import { describe, expect, it } from 'vitest';
import { makeRng, rollSpentDie } from '../rng';
import { SPENT_DIE_FACES, spentCheck } from '../spent';
import type { RngState } from '../types';

const FACE_SET = new Set(SPENT_DIE_FACES);

/** The Spent-Chance table from rules/03 §3.3: Action Cost → P(becoming Spent). */
const SPENT_CHANCE: Record<number, number> = {
  1: 0.2,
  2: 0.3,
  3: 0.5,
  4: 0.6,
  5: 0.8,
  6: 0.9,
  7: 1.0,
};

describe('Spent Die (v3 §2.5)', () => {
  it('has the weighted d10 faces [1,1,2,3,3,4,5,5,6,7]', () => {
    expect(SPENT_DIE_FACES).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 6, 7]);
  });

  it('only ever rolls one of its face values', () => {
    let rng = makeRng(99);
    for (let i = 0; i < 2000; i++) {
      const r = rollSpentDie(rng);
      expect(FACE_SET.has(r.value)).toBe(true);
      rng = r.rng;
    }
  });

  it('produces each face with ~10% frequency over a large sample', () => {
    const N = 200_000;
    const counts = new Map<number, number>();
    let rng = makeRng(2024);
    for (let i = 0; i < N; i++) {
      const r = rollSpentDie(rng);
      counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
      rng = r.rng;
    }
    // Distinct values 1..7; the repeated faces (1,3,5) should land near 20%.
    expect(counts.get(1)! / N).toBeCloseTo(0.2, 2);
    expect(counts.get(3)! / N).toBeCloseTo(0.2, 2);
    expect(counts.get(5)! / N).toBeCloseTo(0.2, 2);
    // Singleton faces near 10%.
    for (const v of [2, 4, 6, 7]) {
      expect(counts.get(v)! / N).toBeCloseTo(0.1, 2);
    }
  });
});

describe('spentCheck (v3 §2.5)', () => {
  it('passes (stays Fresh) iff the roll is strictly greater than the cost', () => {
    // Invariant covers every boundary: roll == cost fails, roll == cost+1 passes.
    let rng = makeRng(555);
    for (let cost = 0; cost <= 8; cost++) {
      for (let i = 0; i < 500; i++) {
        const r = spentCheck(rng, cost);
        expect(r.fresh).toBe(r.roll > cost);
        rng = r.rng;
      }
    }
  });

  it('always stays Fresh at 0AP and always becomes Spent at 7AP', () => {
    // Min face is 1 (>0) so 0AP never fails; max face is 7 (≤7) so 7AP never passes.
    let rng = makeRng(31);
    for (let i = 0; i < 1000; i++) {
      const zero = spentCheck(rng, 0);
      expect(zero.fresh).toBe(true);
      rng = zero.rng;
      const seven = spentCheck(rng, 7);
      expect(seven.fresh).toBe(false);
      rng = seven.rng;
    }
  });

  it('matches the rules/03 Spent-Chance table over a large seeded sample', () => {
    const N = 200_000;
    for (let cost = 1; cost <= 7; cost++) {
      let rng: RngState = makeRng(7000 + cost);
      let spent = 0;
      for (let i = 0; i < N; i++) {
        const r = spentCheck(rng, cost);
        if (!r.fresh) spent++;
        rng = r.rng;
      }
      // ±0.5% tolerance is comfortable for N=200k; the exact value is the table.
      expect(spent / N).toBeCloseTo(SPENT_CHANCE[cost]!, 2);
    }
  });

  it('is deterministic for a given seed and advances the RNG', () => {
    const a = spentCheck(makeRng(42), 3);
    const b = spentCheck(makeRng(42), 3);
    expect(a.roll).toBe(b.roll);
    expect(a.fresh).toBe(b.fresh);
    expect(a.rng).toEqual(b.rng);
    expect(a.rng).not.toEqual(makeRng(42));
  });
});
