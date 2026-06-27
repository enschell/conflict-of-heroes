/**
 * Victory points and victory-hex control (rulebook §2.4, §2.5).
 */
import type { GameState, SideId } from './types';

export function otherSide(s: SideId): SideId {
  return s === 'A' ? 'B' : 'A';
}

/**
 * Update control of victory hexes: a side gains control by being the sole
 * occupier; an empty or contested hex keeps its current controller (§2.5.2).
 * Mutates `state` (call on a reducer clone).
 */
export function updateVictoryHexControl(state: GameState): void {
  for (const vh of state.victory.victoryHexes) {
    const occupants = Object.values(state.units).filter((u) => u.hexId === vh.hexId);
    const sides = new Set(occupants.map((o) => o.side));
    if (sides.size === 1) {
      const hex = state.hexes[vh.hexId];
      if (hex) hex.features.control = [...sides][0];
    }
  }
}

/** Final scores: accumulated VP plus controlled victory-hex VP. */
export function finalScores(state: GameState): Record<SideId, number> {
  const scores: Record<SideId, number> = { A: state.players.A.vp, B: state.players.B.vp };
  for (const vh of state.victory.victoryHexes) {
    const ctrl = state.hexes[vh.hexId]?.features.control;
    if (ctrl) scores[ctrl] += vh.vp;
  }
  return scores;
}

/** Winner by score; null on a tie (rulebook: a tie means both lose). */
export function computeWinner(state: GameState): SideId | null {
  const s = finalScores(state);
  if (s.A > s.B) return 'A';
  if (s.B > s.A) return 'B';
  return null;
}
