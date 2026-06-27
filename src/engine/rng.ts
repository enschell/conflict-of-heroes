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
