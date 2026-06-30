/**
 * Group Actions (rulebook v3 §10). A Group takes ONE Action with a single
 * Spent Check for the whole Group, and Stresses every participant (§10.10).
 *
 * This module holds the pure group helpers (connectivity, group cost pieces);
 * the reducer wires them into the act → one Spent Check → Stress-all flow.
 */
import { distance, parseHexId } from './hex';
import type { GameState, Unit, UnitId } from './types';

/**
 * Do the given Units occupy one continuously-adjacent cluster (§10.2)? Members
 * must *begin* in the same or adjacent hexes (they may separate while moving,
 * §10.3). Two members connect if they share a hex or are neighbours.
 */
export function groupConnected(state: GameState, unitIds: UnitId[]): boolean {
  if (unitIds.length === 0) return false;
  const hexes: string[] = [];
  for (const id of unitIds) {
    const u = state.units[id];
    if (!u) return false;
    hexes.push(u.hexId);
  }
  if (hexes.length === 1) return true;
  // Flood-fill from member 0 over the "same or adjacent hex" relation.
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (let j = 0; j < hexes.length; j++) {
      if (seen.has(j)) continue;
      if (distance(parseHexId(hexes[i]!), parseHexId(hexes[j]!)) <= 1) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === hexes.length;
}

/** Group Stress penalty (§10.11): +1AP if ANY member acted on the previous Turn. */
export function groupStress(units: Unit[]): number {
  return units.some((u) => u.stressed) ? 1 : 0;
}
