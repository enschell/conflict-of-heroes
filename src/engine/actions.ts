/**
 * Legal-action enumeration for the UI (rulebook §2.2). The UI asks the engine
 * what is legal; it must not duplicate rules (CLAUDE.md §3.5).
 *
 * v3: there is no AP budget. A Fresh Unit may take any rules-legal Action (the
 * Action Cost only matters for the Spent Check that follows). A Spent Unit may
 * act only if it can reduce the Action Cost to 0AP with CAPs (§3.4), i.e. it has
 * at least `cost` CAPs available.
 */
import { HIT_MARKERS } from '../data/hitMarkers';
import { attackContext, closeCombatContext } from './combat';
import { canOccupy, fortificationAt, isOccupying } from './fortifications';
import { idOf, neighbors, parseHexId } from './hex';
import { effectiveStats, templateOf } from './hits';
import { bestSpotterFor, directFireZone, indirectFireZone } from './mortar';
import { RALLY_AP_COST } from './rally';
import { directionTo, moveCost, pivotCost } from './movement';
import { legalEntryHexes } from './reinforcements';
import type { Action, Facing, GameState, Unit, UnitId } from './types';

/** Cost (incl. Stress) a Spent Unit would have to buy down to 0AP with CAPs. */
function spentReachable(unit: Unit, base: number, capCurrent: number): boolean {
  const cost = base + (unit.stressed ? 1 : 0);
  return capCurrent >= cost;
}

/**
 * The modified Action Cost of a concrete action (base + Stress, §2.4/§2.6),
 * before any CAP reduction; `null` if the action is illegal. The UI uses this to
 * show how many CAPs a Spent Unit must spend to act at 0AP (§3.4) before asking
 * the player to confirm.
 */
export function modifiedActionCost(state: GameState, action: Action): number | null {
  const stress = (u: Unit) => (u.stressed ? 1 : 0);
  switch (action.type) {
    case 'MOVE': {
      const u = state.units[action.unitId];
      if (!u) return null;
      const mc = moveCost(state, u, action.toHexId);
      return mc.ap == null ? null : mc.ap + stress(u);
    }
    case 'PIVOT': {
      const u = state.units[action.unitId];
      return u ? pivotCost() + stress(u) : null;
    }
    case 'FIRE': {
      const u = state.units[action.attackerId];
      const t = state.units[action.targetId];
      if (!u || !t) return null;
      const ctx = attackContext(state, u, t);
      // §16.2: a Turreted Vehicle firing outside its Arc pays +2AP.
      const arcPenalty = ctx.legal && ctx.outOfArc && templateOf(state, u).turreted ? 2 : 0;
      return effectiveStats(state, u).apToFire + arcPenalty + stress(u);
    }
    case 'CLOSE_COMBAT': {
      const u = state.units[action.attackerId];
      return u ? effectiveStats(state, u).apToFire + stress(u) : null;
    }
    case 'RALLY': {
      const u = state.units[action.unitId];
      return u ? RALLY_AP_COST + stress(u) : null;
    }
    case 'STALL': {
      const u = state.units[action.unitId];
      return u ? 1 + stress(u) : null;
    }
    case 'INDIRECT_FIRE': {
      const u = state.units[action.attackerId];
      if (!u) return null;
      const base = templateOf(state, u).indirectApToFire ?? effectiveStats(state, u).apToFire;
      return base + stress(u);
    }
    case 'FIRE_SMOKE': {
      const u = state.units[action.unitId];
      if (!u) return null;
      const tmpl = templateOf(state, u);
      const base = action.spotterHexId
        ? (tmpl.indirectApToFire ?? effectiveStats(state, u).apToFire)
        : effectiveStats(state, u).apToFire;
      return base + stress(u);
    }
    case 'HASTY_DEFENSE': {
      const u = state.units[action.unitId];
      return u ? 5 + stress(u) : null;
    }
    case 'REMOVE_HASTY_DEFENSE':
      return 0;
    case 'EXIT': {
      const u = state.units[action.unitId];
      return u ? effectiveStats(state, u).move + stress(u) : null;
    }
    default:
      return null;
  }
}

/** All legal actions for a single unit on the current turn. */
export function legalActionsForUnit(state: GameState, unitId: UnitId): Action[] {
  const unit = state.units[unitId];
  if (!unit) return [];
  if (unit.side !== state.currentSide) return [];
  if (unit.status !== 'fresh' && unit.status !== 'spent') return [];

  const player = state.players[unit.side];
  const isFresh = unit.status === 'fresh';
  const stress = unit.stressed ? 1 : 0;
  // A Fresh Unit can always take a legal Action; a Spent Unit only if it can
  // buy the cost down to 0AP with CAPs (§3.4).
  const actionable = (base: number) =>
    isFresh || spentReachable(unit, base, player.capCurrent);
  // A Spent Unit's only legal Action is at 0AP, so emit the explicit CAP spend
  // that gets it there (the reducer never reduces silently). Fresh actions add
  // no CAP fields. This keeps the emitted action directly dispatchable.
  const cr = (base: number): { capCostReduce?: number } =>
    isFresh ? {} : { capCostReduce: base + stress };

  const actions: Action[] = [];
  const eff = effectiveStats(state, unit);
  const tmpl = templateOf(state, unit);
  // A Transported Unit rides along with its Vehicle's Move — it may not Move,
  // Pivot, or Attack on its own, but may still Rally, Stall, or Unload (§15.8).
  const carried = !!unit.carriedBy;

  // §17.2: may this Unit occupy a live Fortification on `hexId`? Mirrors
  // `fortifications.ts`'s `canOccupy`, but for a hypothetical destination Hex
  // rather than the Unit's current one (that function assumes `unit.hexId`).
  const canOccupyHex = (hexId: string): boolean => {
    const hex = state.hexes[hexId];
    const fort = hex && fortificationAt(hex);
    if (!fort) return false;
    if (tmpl.kind === 'vehicle') return false;
    if (fort.kind === 'trench' && tmpl.kind === 'gun') return false;
    const enemyOccupies = Object.values(state.units).some(
      (u) => u.hexId === hexId && u.side !== unit.side && u.occupyingFortification,
    );
    return !enemyOccupies;
  };

  if (eff.canMove && !carried) {
    for (const n of neighbors(parseHexId(unit.hexId))) {
      const toHexId = idOf(n);
      if (!state.hexes[toHexId]) continue;
      const mc = moveCost(state, unit, toHexId);
      if (mc.ap == null) continue;
      if (!actionable(mc.ap)) continue;
      actions.push({ type: 'MOVE', unitId, toHexId, ...cr(mc.ap) });
      // §17.2/17.3: the same Move may occupy the destination Hex's
      // Trench/Bunker on arrival — a distinct legal action from the plain
      // "move here, don't occupy" one above, since occupying is optional.
      if (canOccupyHex(toHexId)) {
        actions.push({ type: 'MOVE', unitId, toHexId, occupyFortification: true, ...cr(mc.ap) });
      }
    }
    // §17.3 (2nd paragraph): occupy this Hex's Fortification from within,
    // ignoring Difficult Terrain (a same-hex "Move").
    if (!isOccupying(state, unit) && canOccupy(state, unit)) {
      const occupyCost = eff.move;
      if (actionable(occupyCost)) {
        actions.push({ type: 'MOVE', unitId, toHexId: unit.hexId, occupyFortification: true, ...cr(occupyCost) });
      }
    }
  }
  // §16.1: Wagons ('none') may not attack at all; Trucks ('closeCombatOnly')
  // may only attack in Close Combat, never with ranged FIRE.
  if (eff.canFire && !carried && tmpl.attackMode !== 'none') {
    for (const target of Object.values(state.units)) {
      if (target.side === unit.side) continue;
      // Close combat against an enemy sharing this hex (§7.7.3); otherwise a
      // normal ranged attack if arc/LOS/range allow.
      if (target.hexId === unit.hexId) {
        if (actionable(eff.apToFire)) {
          actions.push({ type: 'CLOSE_COMBAT', attackerId: unitId, targetId: target.id, ...cr(eff.apToFire) });
        }
        // §18.0: a Flamethrower-capable Unit may choose to Close Combat with
        // its Flamethrower instead — a distinct, separately-legal action.
        if (tmpl.hasFlamethrower && closeCombatContext(state, unit, target, 0, true).legal && actionable(eff.apToFire)) {
          actions.push({ type: 'CLOSE_COMBAT', attackerId: unitId, targetId: target.id, useFlamethrower: true, ...cr(eff.apToFire) });
        }
      } else if (tmpl.attackMode !== 'closeCombatOnly') {
        const ctx = attackContext(state, unit, target);
        if (ctx.legal) {
          // §16.2: a Turreted Vehicle firing outside its Arc pays +2AP.
          const cost = eff.apToFire + (ctx.outOfArc && tmpl.turreted ? 2 : 0);
          if (actionable(cost)) actions.push({ type: 'FIRE', attackerId: unitId, targetId: target.id, ...cr(cost) });
        }
        // §18.0: same idea for ranged Fire (Flamethrower Max Range 1) — a
        // separate legality check since its range/arc math differs (fixed
        // Range 1 instead of the Unit's own Range stat).
        if (tmpl.hasFlamethrower) {
          const flameCtx = attackContext(state, unit, target, 0, 0, true);
          if (flameCtx.legal && actionable(eff.apToFire)) {
            actions.push({ type: 'FIRE', attackerId: unitId, targetId: target.id, useFlamethrower: true, ...cr(eff.apToFire) });
          }
        }
      }
    }
  }

  // Mortar Indirect Attack (§13.2): one action per enemy-occupied Hex (an
  // Attack needs something to attack).
  if (eff.canFire && !carried && tmpl.attackMode !== 'none' && tmpl.kind === 'mortar') {
    const enemyHexIds = new Set(
      Object.values(state.units)
        .filter((u) => u.side !== unit.side && u.hexId !== unit.hexId)
        .map((u) => u.hexId),
    );
    for (const targetHexId of enemyHexIds) {
      const spotterHexId = bestSpotterFor(state, unit, targetHexId);
      if (!spotterHexId) continue;
      const zone = indirectFireZone(state, unit, targetHexId, spotterHexId, tmpl.minRange ?? 0);
      if (!zone.legal) continue;
      const cost = tmpl.indirectApToFire ?? eff.apToFire;
      if (actionable(cost)) {
        actions.push({ type: 'INDIRECT_FIRE', attackerId: unitId, targetHexId, spotterHexId, ...cr(cost) });
      }
    }
  }

  // Fire Smoke (§14.0): unlike an Attack, this targets terrain, not a Unit —
  // "any Hex except Water," occupied or not (e.g. to screen your own advance).
  if (eff.canFire && !carried && tmpl.attackMode !== 'none' && tmpl.canFireSmoke) {
    // §18.1: a Pioneer's Fire Smoke is capped to a max Range of 1 Hex.
    const smokeMaxRange = tmpl.pioneer ? 1 : undefined;
    for (const targetHexId of Object.keys(state.hexes)) {
      if (state.hexes[targetHexId]!.terrain === 'water') continue;
      const dz = directFireZone(state, unit, targetHexId, tmpl.minRange ?? 0, smokeMaxRange);
      if (dz.legal) {
        if (actionable(eff.apToFire))
          actions.push({ type: 'FIRE_SMOKE', unitId, targetHexId, ...cr(eff.apToFire) });
        continue;
      }
      if (tmpl.kind === 'mortar') {
        const spotterHexId = bestSpotterFor(state, unit, targetHexId);
        if (spotterHexId && indirectFireZone(state, unit, targetHexId, spotterHexId, tmpl.minRange ?? 0).legal) {
          const cost = tmpl.indirectApToFire ?? eff.apToFire;
          if (actionable(cost))
            actions.push({ type: 'FIRE_SMOKE', unitId, targetHexId, spotterHexId, ...cr(cost) });
        }
      }
    }
  }

  if (unit.hitMarkers.length > 0 && actionable(RALLY_AP_COST)) {
    const enemyHere = Object.values(state.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (!enemyHere) actions.push({ type: 'RALLY', unitId, ...cr(RALLY_AP_COST) });
  }

  // §17.5: a Bunker occupant's facing is locked — no Pivot at all.
  if (eff.canPivot && !carried && isOccupying(state, unit)?.kind !== 'bunker') {
    for (let f = 0; f < 6; f++) {
      if (f !== unit.facing && actionable(pivotCost()))
        actions.push({ type: 'PIVOT', unitId, facing: f as Facing, ...cr(pivotCost()) });
    }
  }

  // Hasty Defense (§17.6): a Foot Unit (not Field Gun/Vehicle), not
  // Transported, without one already, may spend 5AP to build one on itself.
  if (!carried && tmpl.kind !== 'vehicle' && tmpl.kind !== 'gun' && !unit.hastyDefense && actionable(5)) {
    actions.push({ type: 'HASTY_DEFENSE', unitId, ...cr(5) });
  }
  // §17.6: free at-will removal, always legal whenever the marker is up.
  if (unit.hastyDefense) actions.push({ type: 'REMOVE_HASTY_DEFENSE', unitId });

  // Exit the Map (§4.0, Mission-authored): legal only on one of this Unit's own
  // side's designated exit Hexes.
  if (eff.canMove && !carried && state.exitZones.some((z) => z.side === unit.side && z.hexIds.includes(unit.hexId))) {
    if (actionable(eff.move)) actions.push({ type: 'EXIT', unitId, ...cr(eff.move) });
  }

  // Stall (§2.8): the Unit does nothing but makes a Spent Check and is Stressed.
  if (actionable(1)) actions.push({ type: 'STALL', unitId, ...cr(1) });

  // Transport (§15.6–15.9): Load onto a friendly Vehicle, or Unload from one.
  // Cost/affordability is judged for the (Unit, Vehicle) Group, since Load and
  // Unload are Group Actions with a single Group Spent Check (§15.7/§15.9).
  const groupActionable = (base: number, vehicle: Unit) => {
    const groupStress = unit.stressed || vehicle.stressed ? 1 : 0;
    const cost = base + groupStress;
    const anySpent = unit.status === 'spent' || vehicle.status === 'spent';
    return { cost, ok: !anySpent || player.capCurrent >= cost };
  };
  const groupCr = (base: number, vehicle: Unit): { capCostReduce?: number } => {
    const groupStress = unit.stressed || vehicle.stressed ? 1 : 0;
    const anySpent = unit.status === 'spent' || vehicle.status === 'spent';
    return anySpent ? { capCostReduce: base + groupStress } : {};
  };

  // A foot Unit may always be Loaded (transported, §15.6); a Vehicle only if
  // it's damaged (Immobilized/Stunned) and thus towable (§15.10).
  const unitMarker = unit.hitMarkers[0];
  const towable = unitMarker === 'aImmobilized' || unitMarker === 'aStunned';
  const loadable = templateOf(state, unit).kind !== 'vehicle' || towable;

  if (!carried && loadable) {
    for (const vehicle of Object.values(state.units)) {
      if (vehicle.side !== unit.side || templateOf(state, vehicle).kind !== 'vehicle') continue;
      if (Object.values(state.units).some((u) => u.carriedBy === vehicle.id)) continue; // full (§15.6)
      // §15.10: a Tracked Vehicle may only be towed by another Tracked Vehicle.
      if (towable) {
        const unitProp = templateOf(state, unit).propulsion ?? 'tracked';
        const towerProp = templateOf(state, vehicle).propulsion ?? 'tracked';
        if (unitProp === 'tracked' && towerProp !== 'tracked') continue;
      }
      const sameHex = unit.hexId === vehicle.hexId;
      if (!sameHex && directionTo(unit.hexId, vehicle.hexId) < 0) continue;
      const base = sameHex ? templateOf(state, unit).move : moveCost(state, unit, vehicle.hexId).ap;
      if (base == null) continue;
      const { ok } = groupActionable(base, vehicle);
      if (!ok) continue;
      actions.push({ type: 'LOAD', unitId, vehicleId: vehicle.id, ...groupCr(base, vehicle) });
    }
  }

  if (carried) {
    const vehicle = state.units[unit.carriedBy!];
    const stunned = unit.hitMarkers.some((h) => HIT_MARKERS[h].onlyRally);
    if (vehicle && !stunned) {
      const candidates = [vehicle.hexId, ...neighbors(parseHexId(vehicle.hexId)).map(idOf)];
      for (const toHexId of candidates) {
        if (!state.hexes[toHexId]) continue;
        const sameHex = toHexId === vehicle.hexId;
        const base = sameHex ? effectiveStats(state, unit).move : moveCost(state, unit, toHexId).ap;
        if (base == null) continue;
        const { ok } = groupActionable(base, vehicle);
        if (!ok) continue;
        actions.push({ type: 'UNLOAD', unitId, toHexId, ...groupCr(base, vehicle) });
      }
    }
  }

  return actions;
}

/**
 * Legal ENTER actions for one reinforcement Unit right now (§4.12): one action
 * per legal entry Hex, placing just that Unit (the UI/player may compose a
 * multi-Unit Group entry itself by combining several `placements`).
 */
export function legalActionsForReinforcement(state: GameState, unitId: UnitId): Action[] {
  const r = state.reinforcements.find((x) => x.id === unitId);
  if (!r) return [];
  if (r.side !== state.currentSide) return [];
  if (state.round < r.earliestRound) return [];
  return legalEntryHexes(state, r).map((hexId) => ({
    type: 'ENTER',
    placements: [{ unitId: r.id, hexId, facing: r.facing }],
  }));
}

/** All legal actions for the side whose turn it is (units + reinforcements + pass). */
export function legalActions(state: GameState): Action[] {
  if (state.phase !== 'playing') return [];
  const actions: Action[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.side === state.currentSide) actions.push(...legalActionsForUnit(state, unit.id));
  }
  for (const r of state.reinforcements) {
    if (r.side === state.currentSide) actions.push(...legalActionsForReinforcement(state, r.id));
  }
  actions.push({ type: 'PASS' });
  return actions;
}
