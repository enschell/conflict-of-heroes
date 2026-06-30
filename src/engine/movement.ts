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

/** Is a single Bonus-Move step legal for `tmpl` (§15.2)? */
function validBonusStep(
  state: GameState,
  tmpl: UnitTemplate,
  fromId: HexId,
  toId: HexId,
): { ok: boolean; reason?: string } {
  const from = state.hexes[fromId];
  const to = state.hexes[toId];
  if (!to) return { ok: false, reason: 'bonus move off-map' };
  if (directionTo(fromId, toId) < 0) return { ok: false, reason: 'bonus move not adjacent' };
  const roadToRoad = Boolean(from?.road) && to.road;
  if ((tmpl.propulsion ?? 'tracked') === 'wheeled') {
    // Wheel bonus moves: Road→adjacent Road only, and not into a vehicle-occupied Road (congestion).
    if (!roadToRoad) return { ok: false, reason: 'wheeled bonus move must be road→road' };
    const congested = Object.values(state.units).some(
      (u) => u.hexId === toId && templateOf(state, u).kind === 'vehicle',
    );
    if (congested) return { ok: false, reason: 'road congestion' };
  } else {
    // Track bonus moves: Road→Road, or into Open Terrain.
    if (!(roadToRoad || to.terrain === 'open'))
      return { ok: false, reason: 'tracked bonus move must be road→road or into open' };
  }
  return { ok: true };
}

export interface VehicleMovePlan {
  /** Action Cost (= the regular Move Cost; Bonus Moves are free), null if illegal. */
  ap: number | null;
  reason?: string;
  finalHexId: HexId;
  finalFacing: Facing;
}

/**
 * Validate a vehicle Move path (§15.2): one regular Move (pays the Action Cost,
 * including terrain/backwards) plus up to `bonusMoves` free Bonus-Move hexes.
 * All Bonus Moves are forfeited if the first Move was Backwards or into Difficult
 * Terrain. A free Pivot follows each Bonus Move (facing tracks the move direction).
 */
export function planVehicleMove(state: GameState, unit: Unit, path: HexId[]): VehicleMovePlan {
  const tmpl = templateOf(state, unit);
  const fail = (reason: string): VehicleMovePlan => ({ ap: null, reason, finalHexId: unit.hexId, finalFacing: unit.facing });
  if (path.length === 0) return fail('empty path');
  const maxLen = 1 + (tmpl.bonusMoves ?? 0);
  if (path.length > maxLen) return fail(`too many moves (max ${maxLen})`);

  // Step 0 — the regular Move pays the Action Cost (terrain + backwards folded in).
  const reg = moveCost(state, unit, path[0]!);
  if (reg.ap == null) return fail(reg.reason ?? 'illegal move');

  const from0 = state.hexes[unit.hexId]!;
  const to0 = state.hexes[path[0]!]!;
  let facing = unit.facing;
  const dir0 = directionTo(unit.hexId, path[0]!);
  const forward0 = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(path[0]!));
  if (forward0 && dir0 >= 0) facing = dir0 as Facing;

  if (path.length > 1) {
    const prop = tmpl.propulsion ?? 'tracked';
    const roadMove0 = from0.road && to0.road;
    const difficult0 = !roadMove0 && (VEHICLE_TERRAIN[to0.terrain]?.[prop] ?? 0) !== 0;
    if (!forward0) return fail('bonus moves forfeited: first move was backwards');
    if (difficult0) return fail('bonus moves forfeited: first move into difficult terrain');
    let prev = path[0]!;
    for (let i = 1; i < path.length; i++) {
      const v = validBonusStep(state, tmpl, prev, path[i]!);
      if (!v.ok) return fail(v.reason ?? 'illegal bonus move');
      const d = directionTo(prev, path[i]!);
      if (d >= 0) facing = d as Facing; // free pivot after each bonus move
      prev = path[i]!;
    }
  }
  return { ap: reg.ap, finalHexId: path[path.length - 1]!, finalFacing: facing };
}

/** AP cost to pivot in place (§5.3). */
export function pivotCost(): number {
  return 1;
}
