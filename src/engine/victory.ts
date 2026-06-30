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

/**
 * Final gross VP per side (kills + the per-Round control VP already awarded at
 * each Round end). Display-only; the winner comes from the no-tie marker.
 */
export function finalScores(state: GameState): Record<SideId, number> {
  return { A: state.players.A.vp, B: state.players.B.vp };
}

// ---------------------------------------------------------------------------
// No-tie VP track (§9.2): one shared marker, never 0. `vpMarker` is signed from
// Side A's perspective (>0 = A leads by that many, <0 = B leads).
// ---------------------------------------------------------------------------

/** Which side currently holds VP Advantage (the face-up marker). */
export function vpLeader(state: GameState): SideId {
  return state.vpMarker > 0 ? 'A' : 'B';
}

/** How many VP the leader is ahead by (always ≥ 1). */
export function vpMargin(state: GameState): number {
  return Math.abs(state.vpMarker);
}

/**
 * Award `n` VP to `side` (§9.1) and step the no-tie marker `n` spaces. The
 * leader gaining moves the marker away from 0; the trailer gaining moves it
 * toward 0, and a step that would land on 0 flips to the gaining side's 1
 * (§9.2 — there is no zero). Also bumps the side's gross VP for display.
 */
export function gainVp(state: GameState, side: SideId, n: number): void {
  if (n <= 0) return;
  state.players[side].vp += n;
  const dir = side === 'A' ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const stepped = state.vpMarker + dir;
    state.vpMarker = stepped === 0 ? dir : stepped; // skip 0 → flip to gainer's 1
  }
}

/** Winner = the VP-Advantage holder. v3 has no ties (§9.3). */
export function computeWinner(state: GameState): SideId | null {
  return vpLeader(state);
}
