/**
 * Unit movement (rulebook §4 foot, §15 vehicles, §12 hills/elevation).
 */
import { effectiveStats, templateOf } from './hits';
import { isInFrontArc, neighbor, parseHexId } from './hex';
import { rollD6 } from './rng';
import { terrainOf } from './terrain';
import type {
  Facing,
  FortificationKind,
  GameState,
  Hex,
  HexId,
  Modifier,
  ObstacleKind,
  RngState,
  TerrainId,
  Unit,
  UnitTemplate,
} from './types';

/** Live (non-destroyed) Obstacle of a given kind on this hex, if any (§17.7). */
function liveObstacle(hex: Hex, kind: ObstacleKind): boolean {
  return hex.features.obstacle?.kind === kind && !hex.features.obstacle.destroyed;
}

/** Live (non-destroyed) Fortification of a given kind on this hex, if any (§17.1). */
function liveFortification(hex: Hex, kind: FortificationKind): boolean {
  return hex.features.fortification?.kind === kind && !hex.features.fortification.destroyed;
}

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
  /** Line items summing to `ap` — for a hover-popup breakdown. Omitted when illegal. */
  mods?: Modifier[];
  /**
   * Advanced RNG, present only when a die was actually rolled (Barbed Wire's
   * §17.8 1d6, foot Units only). Pure/deterministic like the rest of the
   * engine's roll-then-maybe-commit pattern (`combat.ts`'s `rollStackFire`
   * etc.): calling `moveCost` again from the same `state.rng` reproduces the
   * identical roll for preview purposes; only the reducer's own call result
   * is ever assigned back into `GameState.rng`.
   */
  rng?: RngState;
}

/**
 * Elevation Move Cost Penalty (§12.2): a 1-level (Sloping) change is +1AP
 * ascending, +0AP descending; a 2-level (Steep) change is +2AP either
 * direction. Roads do NOT negate this (§12.2) — callers add it unconditionally.
 * Applies to Foot Units, Field Guns, AND Vehicles alike (§15's own "Vehicle
 * Moving Uphill" worked example pays it too); Steep is separately impassable
 * to Vehicles off-road (`isSteep`, checked by vehicle callers before this).
 */
function elevationMoveCost(from: Hex, to: Hex): number {
  const diff = to.elevation - from.elevation;
  const absDiff = Math.abs(diff);
  if (absDiff >= 2) return 2; // Steep: both directions
  if (absDiff === 1) return diff > 0 ? 1 : 0; // Sloping: ascending only
  return 0;
}

/** A 2-level elevation change between adjacent hexes (§12.2 Steep Terrain). */
function isSteep(from: Hex, to: Hex): boolean {
  return Math.abs(to.elevation - from.elevation) >= 2;
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
  const mods: Modifier[] = [{ label: 'Move', value: eff.move, section: '§15.1' }];

  // §17.8/§17.9: Barbed Wire and Road Blocks are impassable to Wheeled Units
  // UNCONDITIONALLY — unlike ordinary Difficult/Impassable terrain, a Road
  // does not let a Wheeled vehicle bypass them (the whole point of a Road
  // Block is to obstruct a road). Tracked vehicles pass freely (no AP charge);
  // Barbed Wire is destroyed on entry, handled by the reducer.
  if (prop === 'wheeled' && liveObstacle(to, 'barbedWire')) {
    return { ap: null, reason: 'impassable due to Barbed Wire (§17.8)' };
  }
  if (prop === 'wheeled' && liveObstacle(to, 'roadBlock')) {
    return { ap: null, reason: 'impassable due to Road Block (§17.9)' };
  }
  // §17.4: Trenches are impassable to Wheeled Units, same as Barbed Wire/Road
  // Block above. Bunkers get NO such restriction — §17.5 lets Field Guns
  // (wheeled) occupy a Bunker, so its Hex must stay enterable by wheeled
  // vehicles too.
  if (prop === 'wheeled' && liveFortification(to, 'trench')) {
    return { ap: null, reason: 'impassable due to Trench (§17.4)' };
  }

  // §15.4: moving road→adjacent-road ignores both Difficult and Impassable terrain
  // (§15.3 lists Steep Terrain as one of the Impassable kinds) — but the elevation
  // AP cost itself is still charged below regardless (§12.2 "roads do not negate").
  if (!roadMove) {
    // Wall hexside (§15.3): impassable to wheeled; tracked crosses for +0 AP.
    if (wallBetween(state, unit.hexId, to.id, dir) && prop === 'wheeled')
      return { ap: null, reason: 'wall impassable to wheeled vehicle (§15.3)' };
    if (isSteep(from, to)) return { ap: null, reason: 'Steep terrain impassable to vehicles (§15.3, §12.2)' };
    const vt = VEHICLE_TERRAIN[to.terrain];
    if (vt) {
      const cost = prop === 'wheeled' ? vt.wheeled : vt.tracked;
      if (cost === null) return { ap: null, reason: `${terrainOf(to).name} impassable to ${prop} vehicles (§15.3)` };
      if (cost) {
        ap += cost;
        mods.push({ label: `${terrainOf(to).name} (Difficult Terrain)`, value: cost, section: '§15.3' });
      }
    }
  }

  // Backwards move (§4.11) — moving into a non-front hex costs +1 AP.
  const forward = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(to.id));
  if (!forward) {
    ap += 1;
    mods.push({ label: 'Backwards Move', value: 1, section: '§4.11' });
  }
  const elevAp = elevationMoveCost(from, to);
  if (elevAp) {
    ap += elevAp;
    mods.push({ label: elevAp >= 2 ? 'Steep Terrain' : 'Sloping Terrain', value: elevAp, section: '§12.2' });
  }
  return { ap, mods };
}

/**
 * AP cost for a unit to move into an adjacent hex (foot §4, vehicle §15).
 * Occupying a Trench/Bunker on arrival (§17.2/17.3) costs NO additional AP —
 * that's a reducer-level side effect (`doMove`'s `occupyFortification` flag),
 * not a Move Cost change, so there's nothing to add here.
 */
export function moveCost(state: GameState, unit: Unit, toHexId: HexId): MoveCostResult {
  const from = state.hexes[unit.hexId];
  const to = state.hexes[toHexId];
  if (!from || !to) return { ap: null, reason: 'no such hex' };

  const dir = directionTo(unit.hexId, toHexId);
  if (dir < 0) return { ap: null, reason: 'not adjacent' };

  const eff = effectiveStats(state, unit);
  if (!eff.canMove) return { ap: null, reason: 'unit cannot move (current Hit Marker forbids it, §7.5)' };

  const tmpl = templateOf(state, unit);
  if (tmpl.kind === 'vehicle') return vehicleMoveCost(state, unit, tmpl, from, to, dir);

  const terr = terrainOf(to);
  if (terr.footOnly && !tmpl.unburdened) return { ap: null, reason: `${terr.name} is impassable to this Unit (§4.9)` };

  let ap = eff.move;
  const mods: Modifier[] = [{ label: 'Move', value: eff.move, section: '§4.5' }];

  // Terrain cost, negated when moving road-to-road (rulebook §5.0.1).
  const roadMove = from.road && to.road;
  const terrainAp = roadMove ? 0 : terr.apCost;
  if (terrainAp) {
    ap += terrainAp;
    mods.push({ label: `${terr.name} Terrain`, value: terrainAp, section: '§4.9' });
  }

  // Backwards penalty: moving into a flank (non-front) hex (§5.2).
  const forward = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(toHexId));
  if (!forward) {
    ap += 1;
    mods.push({ label: 'Backwards Move', value: 1, section: '§4.11' });
  }

  // Crossing a wall hexside (§5.0.2).
  if (wallBetween(state, unit.hexId, toHexId, dir)) {
    ap += 1;
    mods.push({ label: 'Wall Crossing', value: 1, section: '§5.0.2' });
  }

  const elevAp = elevationMoveCost(from, to);
  if (elevAp) {
    ap += elevAp;
    mods.push({ label: elevAp >= 2 ? 'Steep Terrain' : 'Sloping Terrain', value: elevAp, section: '§12.2' });
  }

  // §17.8 Barbed Wire: a Foot Unit moving into it rolls 1d6 and adds the
  // result to its Move Cost (Road Blocks explicitly do NOT affect foot
  // movement, §17.9 — nothing to add for those here).
  let rng: RngState | undefined;
  if (liveObstacle(to, 'barbedWire')) {
    const roll = rollD6(state.rng);
    rng = roll.rng;
    ap += roll.value;
    mods.push({ label: 'Barbed Wire (1d6)', value: roll.value, section: '§17.8', random: true });
  }

  return { ap, mods, rng };
}

/**
 * Classify a single Bonus-Move step by which kind of Bonus Move symbol it
 * requires (§15.2, §16.4): `'wheel'` (Road→Road, uncongested) can be paid from
 * either a Wheel or Track budget; `'track'` (Road Congestion, or into Open
 * Terrain) can only be paid from a Track budget. `null` = illegal for both.
 * `elevationAp` is the §12.2 Elevation Move Cost Penalty for this step — Bonus
 * Moves are otherwise free (§15.2), but elevation penalties still apply (§15's
 * own "Vehicle Moving Uphill" worked example charges it on a Bonus-Move step).
 * Off-road, a Steep (2-level) change is impassable, same as a regular Move.
 */
function classifyBonusStep(
  state: GameState,
  fromId: HexId,
  toId: HexId,
): { kind: 'either' | 'track' | null; reason?: string; elevationAp: number } {
  const from = state.hexes[fromId];
  const to = state.hexes[toId];
  if (!to) return { kind: null, reason: 'bonus move off-map', elevationAp: 0 };
  if (directionTo(fromId, toId) < 0) return { kind: null, reason: 'bonus move not adjacent', elevationAp: 0 };
  // §17.8/§17.9/§17.10: Bonus Moves may not enter OR exit a Barbed Wire, Road
  // Block, or Mines Hex, regardless of terrain/road eligibility otherwise.
  const blockedObstacle = (['barbedWire', 'roadBlock', 'mines'] as const).find(
    (k) => liveObstacle(to, k) || (from && liveObstacle(from, k)),
  );
  if (blockedObstacle) return { kind: null, reason: `Bonus Move may not enter or exit a ${blockedObstacle} Hex (§17)`, elevationAp: 0 };
  // §17.4: Tracked Vehicles may not Bonus Move into or out of a Trench Hex
  // either (Bunkers have no such restriction, see the wheeled-impassability
  // note above — only Trenches carry it).
  if (liveFortification(to, 'trench') || (from && liveFortification(from, 'trench'))) {
    return { kind: null, reason: 'Bonus Move may not enter or exit a Trench Hex (§17.4)', elevationAp: 0 };
  }
  const roadToRoad = Boolean(from?.road) && to.road;
  if (!roadToRoad && to.terrain !== 'open')
    return { kind: null, reason: 'bonus move must be road→road or into open terrain', elevationAp: 0 };
  if (!roadToRoad && from && isSteep(from, to))
    return { kind: null, reason: 'Steep terrain impassable to vehicles (§15.3, §12.2)', elevationAp: 0 };
  const elevationAp = from ? elevationMoveCost(from, to) : 0;
  if (roadToRoad) {
    // Road Congestion (§15.2) blocks only Wheel Bonus Moves; Track Bonus Moves ignore it.
    const congested = Object.values(state.units).some(
      (u) => u.hexId === toId && templateOf(state, u).kind === 'vehicle',
    );
    return { kind: congested ? 'track' : 'either', elevationAp };
  }
  return { kind: 'track', elevationAp }; // into Open Terrain: Track Bonus Moves only
}

export interface VehicleMovePlan {
  /** Action Cost (= the regular Move Cost; Bonus Moves are free), null if illegal. */
  ap: number | null;
  reason?: string;
  finalHexId: HexId;
  finalFacing: Facing;
  /** The regular (first) Move's cost breakdown — see `MoveCostResult.mods`. */
  mods?: Modifier[];
  /** See `MoveCostResult.rng` — carried through from the regular Move's cost calc. */
  rng?: RngState;
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
  const prop0 = tmpl.propulsion ?? 'tracked';
  // §16.4 Mobile Vehicles: a Wheeled vehicle may also carry Track Bonus Move
  // symbols (`mobileTrackBonusMoves`) alongside its (Wheel) `bonusMoves`.
  const wheelBudget = prop0 === 'wheeled' ? (tmpl.bonusMoves ?? 0) : 0;
  const trackBudget = prop0 === 'tracked' ? (tmpl.bonusMoves ?? 0) : (tmpl.mobileTrackBonusMoves ?? 0);
  const maxLen = 1 + wheelBudget + trackBudget;
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
    let trackRequired = 0;
    let flexSteps = 0;
    let bonusElevationAp = 0;
    for (let i = 1; i < path.length; i++) {
      const v = classifyBonusStep(state, prev, path[i]!);
      if (v.kind === null) return fail(v.reason ?? 'illegal bonus move');
      if (v.kind === 'track') trackRequired += 1;
      else flexSteps += 1;
      bonusElevationAp += v.elevationAp;
      const d = directionTo(prev, path[i]!);
      if (d >= 0) facing = d as Facing; // free pivot after each bonus move
      prev = path[i]!;
    }
    if (trackRequired > trackBudget) return fail('not enough Track Bonus Moves (§16.4)');
    if (flexSteps > wheelBudget + (trackBudget - trackRequired)) return fail('not enough Bonus Moves');
    return { ap: reg.ap + bonusElevationAp, finalHexId: path[path.length - 1]!, finalFacing: facing, mods: reg.mods, rng: reg.rng };
  }
  return { ap: reg.ap, finalHexId: path[path.length - 1]!, finalFacing: facing, mods: reg.mods, rng: reg.rng };
}

/** AP cost to pivot in place (§5.3). */
export function pivotCost(): number {
  return 1;
}
