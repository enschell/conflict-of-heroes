/**
 * Foot unit movement (rulebook §5.0–§5.4). Vehicles/hills are later modules
 * (elevation is read here so the climb penalty works once hills exist).
 */
import { effectiveStats, templateOf } from './hits';
import { isInFrontArc, neighbor, parseHexId } from './hex';
import { terrainOf } from './terrain';
import type { Facing, GameState, HexId, Unit } from './types';

/** Adjacent direction index from one hex to another, or -1 if not adjacent. */
export function directionTo(fromId: HexId, toId: HexId): number {
  const a = parseHexId(fromId);
  const b = parseHexId(toId);
  for (let d = 0; d < 6; d++) {
    const n = neighbor(a, d as Facing);
    if (n.q === b.q && n.r === b.r) return d;
  }
  return -1;
}

function wallBetween(state: GameState, fromId: HexId, toId: HexId, dir: number): boolean {
  const from = state.hexes[fromId];
  const to = state.hexes[toId];
  const opp = (dir + 3) % 6;
  return Boolean(from?.walls[dir]) || Boolean(to?.walls[opp]);
}

export interface MoveCostResult {
  /** AP cost to move, or null if the move is illegal. */
  ap: number | null;
  reason?: string;
}

/** AP cost for a foot unit to move into an adjacent hex. */
export function moveCost(state: GameState, unit: Unit, toHexId: HexId): MoveCostResult {
  const from = state.hexes[unit.hexId];
  const to = state.hexes[toHexId];
  if (!from || !to) return { ap: null, reason: 'no such hex' };

  const dir = directionTo(unit.hexId, toHexId);
  if (dir < 0) return { ap: null, reason: 'not adjacent' };

  const eff = effectiveStats(state, unit);
  if (!eff.canMove) return { ap: null, reason: 'unit cannot move' };

  const tmpl = templateOf(state, unit);
  const terr = terrainOf(to);
  if (terr.footOnly && !tmpl.unburdened) return { ap: null, reason: 'impassable terrain' };

  let ap = eff.move;

  // Terrain cost, negated when moving road-to-road (rulebook §5.0.1).
  const roadMove = from.road && to.road;
  ap += roadMove ? 0 : terr.apCost;

  // Backwards penalty: moving into a flank (non-front) hex (§5.2).
  const forward = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(toHexId));
  if (!forward) ap += 1;

  // Crossing a wall hexside (§5.0.2).
  if (wallBetween(state, unit.hexId, toHexId, dir)) ap += 1;

  // Uphill: +1 AP per level (hills are a later module; elevation 0 for now).
  ap += Math.max(0, to.elevation - from.elevation);

  return { ap };
}

/** AP cost to pivot in place (§5.3). */
export function pivotCost(): number {
  return 1;
}
