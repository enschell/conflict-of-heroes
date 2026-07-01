/**
 * Reinforcements (rulebook §4.12): Units that begin off the Map and enter
 * later. This module holds the pure entry-hex-legality helper; the reducer
 * wires ENTER into the same act → Spent Check → Stress flow (0AP, never a
 * Spent Check, but the Unit is Stressed — reusing the Group-Action Stress-all
 * path for Group entry, §10.2).
 */
import { idOf, neighbors, parseHexId } from './hex';
import type { GameState, HexId, ReinforcementUnit } from './types';

/** Every playable Hex within `maxDist` of `origin` (BFS over neighbours). */
function hexesWithin(state: GameState, origin: HexId, maxDist: number): HexId[] {
  const seen = new Set<HexId>([origin]);
  let frontier = [origin];
  for (let d = 0; d < maxDist; d++) {
    const next: HexId[] = [];
    for (const id of frontier) {
      for (const n of neighbors(parseHexId(id))) {
        const nid = idOf(n);
        if (state.hexes[nid] && !seen.has(nid)) {
          seen.add(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

/**
 * The legal entry Hexes for a reinforcement Unit right now (§4.12): normally
 * its Mission-specified entry Hexes, minus any occupied by an enemy Unit. If
 * EVERY entry Hex is enemy-occupied, the Unit may instead enter any Hex within
 * 2 Hexes of one of them.
 */
export function legalEntryHexes(state: GameState, r: ReinforcementUnit): HexId[] {
  const enemyAt = (hexId: HexId) =>
    Object.values(state.units).some((u) => u.side !== r.side && u.hexId === hexId);
  const open = r.entryHexIds.filter((h) => state.hexes[h] && !enemyAt(h));
  if (open.length > 0) return open;

  const nearby = new Set<HexId>();
  for (const h of r.entryHexIds) {
    if (!state.hexes[h]) continue;
    for (const n of hexesWithin(state, h, 2)) {
      if (!enemyAt(n)) nearby.add(n);
    }
  }
  return [...nearby];
}
