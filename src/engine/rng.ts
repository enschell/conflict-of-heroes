/**
 * Seeded, purely-functional RNG (mulberry32).
 *
 * The RNG state lives inside GameState and is threaded through every roll, so
 * saves, undo, and replays are bit-for-bit deterministic (CLAUDE.md §3.2).
 * Never use Math.random() in the engine.
 */
import type { RngState } from './types';

export function makeRng(seed: number): RngState {
  return { state: seed | 0 };
}

/** One mulberry32 step → a float in [0, 1) plus the advanced state. */
function step(state: number): { value: number; state: number } {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a | 0 };
}

export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  const { value, state } = step(rng.state);
  return { value, rng: { state } };
}

/** Integer in [min, max] inclusive. */
export function randInt(
  rng: RngState,
  min: number,
  max: number,
): { value: number; rng: RngState } {
  const { value, rng: next } = nextFloat(rng);
  return { value: min + Math.floor(value * (max - min + 1)), rng: next };
}

export function rollD6(rng: RngState): { value: number; rng: RngState } {
  return randInt(rng, 1, 6);
}

export function roll2d6(rng: RngState): {
  value: number;
  dice: [number, number];
  rng: RngState;
} {
  const a = rollD6(rng);
  const b = rollD6(a.rng);
  return { value: a.value + b.value, dice: [a.value, b.value], rng: b.rng };
}

/**
 * The Spent Die (v3 §2.5): a weighted d10 whose ten faces carry the values
 * [1, 1, 2, 3, 3, 4, 5, 5, 6, 7]. Each face is equally likely; the weighting
 * comes from repeated values, which is what makes the Spent-chance curve land
 * on the 20/30/50/60/80/90/100% table in `rules/03`.
 */
export const SPENT_DIE_FACES: readonly number[] = [
  1, 1, 2, 3, 3, 4, 5, 5, 6, 7,
];

/** Roll the weighted Spent Die: pick one of the ten faces uniformly (§2.5). */
export function rollSpentDie(rng: RngState): { value: number; rng: RngState } {
  const { value: index, rng: next } = randInt(
    rng,
    0,
    SPENT_DIE_FACES.length - 1,
  );
  return { value: SPENT_DIE_FACES[index]!, rng: next };
}

/**
 * Fisher-Yates shuffle over the seeded RNG (§8.1: the Battle Card Draw Deck is
 * shuffled once at Mission start). Pure — returns a new array, never mutates
 * `arr`, and returns the advanced RNG alongside it like every other roll here.
 */
export function shuffle<T>(rng: RngState, arr: readonly T[]): { value: T[]; rng: RngState } {
  const out = [...arr];
  let cur = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const { value: j, rng: next } = randInt(cur, 0, i);
    cur = next;
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { value: out, rng: cur };
}
