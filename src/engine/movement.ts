/**
 * Unit movement (rulebook §4 foot, §15 vehicles). Hills/elevation are a later
 * module (elevation is read here so the climb penalty works once hills exist).
 */
import { effectiveStats, templateOf } from './hits';
import { isInFrontArc, neighbor, parseHexId } from './hex';
import { terrainOf } from './terrain';
import type { Facing, GameState, Hex, HexId, TerrainId, Unit, UnitTemplate } from './types';

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

/**
 * Vehicle Difficult/Impassable Terrain (§15.3), AP penalty by propulsion.
 * `null` = Impassable. Omitted terrain costs +0. Walls are handled separately
 * (hexside feature). Road→road movement ignores all of this (§15.4).
 */
const VEHICLE_TERRAIN: Partial<Record<TerrainId, { wheeled: number | null; tracked: number | null }>> = {
  woodsLight: { wheeled: 2, tracked: 1 },
  woodsHeavy: { wheeled: null, tracked: 2 }, // Heavy Woods impassable to wheeled
  buildingWood: { wheeled: 2, tracked: 1 },
  buildingStone: { wheeled: 3, tracked: 2 },
  plowed: { wheeled: null, tracked: 0 }, // wheeled impassable; tracked +0
  water: { wheeled: null, tracked: null }, // impassable to all vehicles
};

/** AP cost for a vehicle to move into an adjacent hex (§15.1–§15.4). */
function vehicleMoveCost(
  state: GameState,
  unit: Unit,
  tmpl: UnitTemplate,
  from: Hex,
  to: Hex,
  dir: number,
): MoveCostResult {
  const eff = effectiveStats(state, unit);
  const prop = tmpl.propulsion ?? 'tracked';
  const roadMove = from.road && to.road;
  let ap = eff.move;

  // §15.4: moving road→adjacent-road ignores both Difficult and Impassable terrain.
  if (!roadMove) {
    // Wall hexside (§15.3): impassable to wheeled; tracked crosses for +0 AP.
    if (wallBetween(state, unit.hexId, to.id, dir) && prop === 'wheeled')
      return { ap: null, reason: 'wall impassable to wheeled vehicle' };
    const vt = VEHICLE_TERRAIN[to.terrain];
    if (vt) {
      const cost = prop === 'wheeled' ? vt.wheeled : vt.tracked;
      if (cost === null) return { ap: null, reason: `terrain impassable to ${prop} vehicle` };
      ap += cost;
    }
  }

  // Backwards move (§4.11) — moving into a non-front hex costs +1 AP.
  const forward = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(to.id));
  if (!forward) ap += 1;
  // Uphill (hills are a later module; elevation 0 for now).
  ap += Math.max(0, to.elevation - from.elevation);
  return { ap };
}

/** AP cost for a unit to move into an adjacent hex (foot §4, vehicle §15). */
export function moveCost(state: GameState, unit: Unit, toHexId: HexId): MoveCostResult {
  const from = state.hexes[unit.hexId];
  const to = state.hexes[toHexId];
  if (!from || !to) return { ap: null, reason: 'no such hex' };

  const dir = directionTo(unit.hexId, toHexId);
  if (dir < 0) return { ap: null, reason: 'not adjacent' };

  const eff = effectiveStats(state, unit);
  if (!eff.canMove) return { ap: null, reason: 'unit cannot move' };

  const tmpl = templateOf(state, unit);
  if (tmpl.kind === 'vehicle') return vehicleMoveCost(state, unit, tmpl, from, to, dir);

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
