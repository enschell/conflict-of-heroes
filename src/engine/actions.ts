/**
 * Legal-action enumeration for the UI (rulebook §2.2). The UI asks the engine
 * what is legal; it must not duplicate rules (CLAUDE.md §3.5).
 *
 * v3: there is no AP budget. A Fresh Unit may take any rules-legal Action (the
 * Action Cost only matters for the Spent Check that follows). A Spent Unit may
 * act only if it can reduce the Action Cost to 0AP with CAPs (§3.4), i.e. it has
 * at least `cost` CAPs available.
 */
import { attackContext } from './combat';
import { idOf, neighbors, parseHexId } from './hex';
import { effectiveStats } from './hits';
import { RALLY_AP_COST } from './rally';
import { moveCost, pivotCost } from './movement';
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
    case 'FIRE':
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

  if (eff.canMove) {
    for (const n of neighbors(parseHexId(unit.hexId))) {
      const toHexId = idOf(n);
      if (!state.hexes[toHexId]) continue;
      const mc = moveCost(state, unit, toHexId);
      if (mc.ap == null) continue;
      if (!actionable(mc.ap)) continue;
      actions.push({ type: 'MOVE', unitId, toHexId, ...cr(mc.ap) });
    }
  }

  if (eff.canFire && actionable(eff.apToFire)) {
    for (const target of Object.values(state.units)) {
      if (target.side === unit.side) continue;
      // Close combat against an enemy sharing this hex (§7.7.3); otherwise a
      // normal ranged attack if arc/LOS/range allow.
      if (target.hexId === unit.hexId) {
        actions.push({ type: 'CLOSE_COMBAT', attackerId: unitId, targetId: target.id, ...cr(eff.apToFire) });
      } else if (attackContext(state, unit, target).legal) {
        actions.push({ type: 'FIRE', attackerId: unitId, targetId: target.id, ...cr(eff.apToFire) });
      }
    }
  }

  if (unit.hitMarkers.length > 0 && actionable(RALLY_AP_COST)) {
    const enemyHere = Object.values(state.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (!enemyHere) actions.push({ type: 'RALLY', unitId, ...cr(RALLY_AP_COST) });
  }

  if (eff.canPivot && actionable(pivotCost())) {
    for (let f = 0; f < 6; f++) {
      if (f !== unit.facing) actions.push({ type: 'PIVOT', unitId, facing: f as Facing, ...cr(pivotCost()) });
    }
  }

  // Stall (§2.8): the Unit does nothing but makes a Spent Check and is Stressed.
  if (actionable(1)) actions.push({ type: 'STALL', unitId, ...cr(1) });

  return actions;
}

/** All legal actions for the side whose turn it is (units + pass). */
export function legalActions(state: GameState): Action[] {
  if (state.phase !== 'playing') return [];
  const actions: Action[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.side === state.currentSide) actions.push(...legalActionsForUnit(state, unit.id));
  }
  actions.push({ type: 'PASS' });
  return actions;
}
