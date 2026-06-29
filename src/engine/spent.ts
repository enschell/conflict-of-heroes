/**
 * The Spent Check (v3 §2.5).
 *
 * After a Unit performs an Action and its (modified) Action Cost is known, roll
 * the weighted Spent Die. If the roll is **higher than** the Action Cost the
 * Unit passes and stays Fresh; if the roll is **equal to or lower than** the
 * cost it fails and becomes Spent.
 *
 * This module is the rules-level wrapper around `rollSpentDie` (engine/rng.ts).
 * It stays pure per CLAUDE.md §3: the roll is drawn from the seeded RNG carried
 * in GameState and the advanced RNG is returned for the caller to thread back.
 *
 * Note on 0AP (§3.4): when CAPs reduce an Action Cost to 0AP, **no Spent Check
 * is made at all** — that skip is the turn loop's responsibility, so it must not
 * call `spentCheck` in that case (doing so would needlessly advance the RNG).
 */
import type { RngState } from './types';
import { rollSpentDie, SPENT_DIE_FACES } from './rng';

// Re-export the die faces so callers/tests can reach the canonical list through
// the Spent-Check module (the rules concept lives here; the roll lives in rng).
export { SPENT_DIE_FACES };

export interface SpentCheckResult {
  /** true → Unit stays Fresh (roll > cost); false → Unit becomes Spent. */
  fresh: boolean;
  /** The face value rolled on the Spent Die (one of SPENT_DIE_FACES). */
  roll: number;
  /** RNG advanced by the one Spent-Die roll. */
  rng: RngState;
}

/**
 * Roll a Spent Check against `cost` (the already-modified Action Cost in AP).
 * Passes (stays Fresh) iff the rolled face value is strictly greater than cost.
 */
export function spentCheck(rng: RngState, cost: number): SpentCheckResult {
  const { value: roll, rng: next } = rollSpentDie(rng);
  return { fresh: roll > cost, roll, rng: next };
}
