/** Shared test helpers for src/state/__tests__ — small store-level scenario builders. */
import { idOf, neighbors, parseHexId, planVehicleMove } from '../../engine';
import type { GameState, Unit } from '../../engine/types';

/** Legal next hexes for extending `path` with this vehicle (§15.2 Bonus-Move path building). */
export function legalSteps(g: GameState, unit: Unit, path: string[]): string[] {
  const from = path.length ? path[path.length - 1]! : unit.hexId;
  const out: string[] = [];
  for (const n of neighbors(parseHexId(from))) {
    const nid = idOf(n);
    if (!g.hexes[nid] || path.includes(nid)) continue;
    if (planVehicleMove(g, unit, [...path, nid]).ap != null) out.push(nid);
  }
  return out;
}

/** Any one adjacent hex `unit` can legally step into (terrain-independent helper). */
export function legalStep(game: GameState, unit: Unit): string {
  const step = legalSteps(game, unit, [])[0];
  if (!step) throw new Error(`no legal step found for ${unit.id}`);
  return step;
}
