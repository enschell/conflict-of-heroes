/**
 * Pre-Mission Setup phase (Mission-configurable, not a `rules/` chapter of
 * its own): before Round 1, one side places its `GameState.setupPool` Units
 * onto any empty Hex, then the other side does the same, then the real
 * Round 1/initiative sequence begins (`reducer.ts`'s `doSetupPlace`). This
 * module holds the pure legality helper; every existing Mission (no
 * `setupForces`) never enters this phase at all.
 */
import type { GameState, HexId } from './types';

/**
 * Every Hex currently empty of any Unit — the only restriction on a Setup
 * placement. Pass `forMine: true` when the armed pool entry is a Mines token
 * (`SetupPoolUnit.mine`): a Hex may hold only one Obstacle/Fortification
 * (§17.0), so those are additionally excluded — keeps the UI highlight in
 * lockstep with `doSetupPlace`'s own validation.
 */
export function legalSetupHexes(state: GameState, forMine = false): HexId[] {
  const occupied = new Set(Object.values(state.units).map((u) => u.hexId));
  return Object.keys(state.hexes).filter((id) => {
    if (occupied.has(id)) return false;
    if (forMine) {
      const f = state.hexes[id]!.features;
      if (f.obstacle || f.fortification) return false;
    }
    return true;
  });
}
