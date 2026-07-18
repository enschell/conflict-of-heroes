/**
 * Pre-Mission Setup phase (Mission-configurable, not a `rules/` chapter of
 * its own): before Round 1, one side places its `GameState.setupPool` Units
 * onto any empty Hex, then the other side does the same, then the real
 * Round 1/initiative sequence begins (`reducer.ts`'s `doSetupPlace`). This
 * module holds the pure legality helper; every existing Mission (no
 * `setupForces`) never enters this phase at all.
 */
import type { GameState, HexId } from './types';

/** Every Hex currently empty of any Unit — the only restriction on a Setup placement. */
export function legalSetupHexes(state: GameState): HexId[] {
  const occupied = new Set(Object.values(state.units).map((u) => u.hexId));
  return Object.keys(state.hexes).filter((id) => !occupied.has(id));
}
