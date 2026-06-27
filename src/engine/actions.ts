/**
 * Legal-action enumeration for the UI (rulebook §2.2). The UI asks the engine
 * what is legal; it must not duplicate rules (CLAUDE.md §3.5).
 */
import { attackContext } from './combat';
import { idOf, neighbors, parseHexId } from './hex';
import { effectiveStats } from './hits';
import { RALLY_AP_COST } from './rally';
import { moveCost, pivotCost } from './movement';
import type { Action, Facing, GameState, UnitId } from './types';

/** All legal actions for a single unit on the current turn. */
export function legalActionsForUnit(state: GameState, unitId: UnitId): Action[] {
  const unit = state.units[unitId];
  if (!unit) return [];
  if (unit.side !== state.currentSide) return [];

  const player = state.players[unit.side];
  const isActivated = player.activatedUnitId === unitId;
  const isFresh = unit.status === 'fresh';
  if (!isActivated && !isFresh) return [];

  const actions: Action[] = [];
  const eff = effectiveStats(state, unit);
  // In AP mode the budget is remaining AP plus spendable CAP; opportunity is free.
  const budget = isActivated ? player.ap + player.capCurrent : Infinity;
  const affordable = (cost: number) => cost <= budget;

  if (isFresh && !isActivated) actions.push({ type: 'ACTIVATE_UNIT', unitId });

  if (eff.canMove) {
    for (const n of neighbors(parseHexId(unit.hexId))) {
      const toHexId = idOf(n);
      if (!state.hexes[toHexId]) continue;
      const mc = moveCost(state, unit, toHexId);
      if (mc.ap == null || !affordable(mc.ap)) continue;
      actions.push({ type: 'MOVE', unitId, toHexId });
    }
  }

  if (eff.canFire && affordable(eff.apToFire)) {
    for (const target of Object.values(state.units)) {
      if (target.side === unit.side) continue;
      // Close combat against an enemy sharing this hex (§7.7.3); otherwise a
      // normal ranged attack if arc/LOS/range allow.
      if (target.hexId === unit.hexId) {
        actions.push({ type: 'CLOSE_COMBAT', attackerId: unitId, targetId: target.id });
      } else if (attackContext(state, unit, target).legal) {
        actions.push({ type: 'FIRE', attackerId: unitId, targetId: target.id });
      }
    }
  }

  if (unit.hitMarkers.length > 0 && affordable(RALLY_AP_COST)) {
    const enemyHere = Object.values(state.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (!enemyHere) actions.push({ type: 'RALLY', unitId });
  }

  if (eff.canPivot && affordable(pivotCost())) {
    for (let f = 0; f < 6; f++) {
      if (f !== unit.facing) actions.push({ type: 'PIVOT', unitId, facing: f as Facing });
    }
  }

  if (isActivated) actions.push({ type: 'MARK_SPENT', unitId });

  return actions;
}

/** All legal actions for the side whose turn it is (units + pass/stall). */
export function legalActions(state: GameState): Action[] {
  if (state.phase !== 'playing') return [];
  const actions: Action[] = [];
  for (const unit of Object.values(state.units)) {
    if (unit.side === state.currentSide) actions.push(...legalActionsForUnit(state, unit.id));
  }
  // Stalling costs 1 AP (the activated unit) or 1 CAP (§2.2) — only offer it when
  // something is actually payable, so legalActions matches what reduce accepts.
  const p = state.players[state.currentSide];
  if ((p.activatedUnitId != null && p.ap >= 1) || p.capCurrent >= 1) {
    actions.push({ type: 'STALL' });
  }
  actions.push({ type: 'PASS' });
  return actions;
}
