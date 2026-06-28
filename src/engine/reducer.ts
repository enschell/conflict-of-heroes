/**
 * The central reducer: reduce(state, action) -> { state, events }.
 *
 * This is the ONLY way to mutate game state and is the future online wire
 * format (CLAUDE.md §3.4). It deep-clones the input, mutates the clone, and
 * returns it; all validation happens before any mutation, so a denied action
 * leaves the original state untouched.
 */
import { FOOT_HIT_MARKERS } from '../data/hitMarkers';
import { applyUnitLoss, clampCapMod } from './cap';
import { attackContext, closeCombatContext, rollCloseCombat, rollStackFire } from './combat';
import { isInFrontArc, parseHexId } from './hex';
import { drawHit, effectiveStats, returnHitToPile, templateOf } from './hits';
import { directionTo, moveCost, pivotCost } from './movement';
import { RALLY_AP_COST, rollRally } from './rally';
import { endRound, switchTurn } from './turn';
import { otherSide, updateVictoryHexControl } from './victory';
import type {
  Action,
  Facing,
  GameEvent,
  GameState,
  PlayerState,
  ReduceResult,
  SideId,
  Unit,
} from './types';

type Mode = 'ap' | 'opportunity';

export function reduce(state: GameState, action: Action): ReduceResult {
  if (state.phase !== 'playing') {
    return { state, events: [] };
  }

  const next: GameState = structuredClone(state);
  const events: GameEvent[] = [];

  const log = (type: string, text: string, side?: SideId) => {
    const e: GameEvent = { type, round: next.round, side, text };
    events.push(e);
    next.log.push(e);
  };
  const deny = (reason: string): ReduceResult => ({
    state,
    events: [{ type: 'illegal', round: state.round, text: reason }],
  });
  const finish = (): ReduceResult => ({ state: next, events });

  // -- shared helpers -------------------------------------------------------

  const actionMode = (unit: Unit): Mode | null => {
    const player = next.players[unit.side];
    if (unit.side !== next.currentSide) return null;
    if (player.activatedUnitId === unit.id) return 'ap';
    if (unit.status === 'fresh') return 'opportunity';
    return null;
  };

  const payAP = (player: PlayerState, cost: number): boolean => {
    const fromAp = Math.min(cost, player.ap);
    const fromCap = cost - fromAp;
    if (fromCap > player.capCurrent) return false;
    player.ap -= fromAp;
    player.capCurrent -= fromCap;
    return true;
  };

  const resetPassCycle = () => {
    next.consecutivePasses = 0;
    next.players.A.passed = false;
    next.players.B.passed = false;
  };

  const maybeSpendActivated = (player: PlayerState) => {
    if (player.activatedUnitId && player.ap <= 0) {
      const u = next.units[player.activatedUnitId];
      if (u) u.status = 'spent';
      player.activatedUnitId = null;
      player.ap = 0;
    }
  };

  /** After a completed action: spend the unit appropriately and pass the turn. */
  const completeAction = (unit: Unit, mode: Mode, player: PlayerState) => {
    resetPassCycle();
    if (mode === 'opportunity') unit.status = 'spent';
    else maybeSpendActivated(player);
    switchTurn(next);
  };

  const destroyUnit = (unit: Unit) => {
    for (const hm of unit.hitMarkers) {
      next.hitPiles.foot = returnHitToPile(next.hitPiles.foot, hm);
    }
    const tmpl = templateOf(next, unit);
    const opp = otherSide(unit.side);
    next.players[opp].vp += tmpl.vp;
    applyUnitLoss(next.players[unit.side]);
    const ownerP = next.players[unit.side];
    if (ownerP.activatedUnitId === unit.id) {
      ownerP.activatedUnitId = null;
      ownerP.ap = 0;
    }
    delete next.units[unit.id];
    log('destroyed', `${unit.id} destroyed (+${tmpl.vp} VP to ${opp})`, unit.side);
  };

  const applyHit = (target: Unit, critical: boolean) => {
    if (critical || target.hitMarkers.length > 0) {
      destroyUnit(target);
      return;
    }
    const draw = drawHit(next.rng, next.hitPiles.foot);
    next.rng = draw.rng;
    next.hitPiles.foot = draw.pile;
    const def = FOOT_HIT_MARKERS[draw.type];
    if (def.killOnDraw) {
      next.hitPiles.foot = returnHitToPile(next.hitPiles.foot, draw.type);
      destroyUnit(target);
    } else {
      target.hitMarkers = [draw.type];
      log('hit', `${target.id} takes a hit: ${draw.type}`, target.side);
    }
  };

  // -- action handlers ------------------------------------------------------

  const activate = (unitId: string): ReduceResult => {
    const unit = next.units[unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.status !== 'fresh') return deny('unit must be fresh to activate');
    const player = next.players[unit.side];
    if (player.activatedUnitId && player.activatedUnitId !== unitId) {
      const old = next.units[player.activatedUnitId];
      if (old) old.status = 'spent';
    }
    player.activatedUnitId = unitId;
    player.ap = 7;
    unit.status = 'active';
    resetPassCycle();
    log('activate', `${unitId} activated (7 AP)`, unit.side);
    return finish();
  };

  const doMove = (a: Extract<Action, { type: 'MOVE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    const mode = actionMode(unit);
    if (!mode) return deny('unit not actionable this turn');
    const mc = moveCost(next, unit, a.toHexId);
    if (mc.ap == null) return deny(mc.reason ?? 'illegal move');
    const player = next.players[unit.side];
    if (mode === 'ap' && !payAP(player, mc.ap)) return deny('not enough AP/CAP');

    const oldHexId = unit.hexId;
    const dir = directionTo(oldHexId, a.toHexId);
    const forward = isInFrontArc(parseHexId(oldHexId), unit.facing, parseHexId(a.toHexId));
    unit.hexId = a.toHexId;
    if (forward && dir >= 0) unit.facing = dir as Facing;
    log(
      'move',
      `${unit.id} -> ${a.toHexId} (${mode === 'ap' ? mc.ap + ' AP' : 'opportunity'})`,
      unit.side,
    );
    updateVictoryHexControl(next);
    completeAction(unit, mode, player);
    return finish();
  };

  const doPivot = (a: Extract<Action, { type: 'PIVOT' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    const mode = actionMode(unit);
    if (!mode) return deny('unit not actionable this turn');
    const eff = effectiveStats(next, unit);
    if (!eff.canPivot) return deny('unit cannot pivot');
    const player = next.players[unit.side];
    if (mode === 'ap' && !payAP(player, pivotCost())) return deny('not enough AP/CAP');
    unit.facing = a.facing;
    log('pivot', `${unit.id} pivots to ${a.facing}`, unit.side);
    completeAction(unit, mode, player);
    return finish();
  };

  const doFire = (a: Extract<Action, { type: 'FIRE' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    const target = next.units[a.targetId];
    if (!attacker || !target) return deny('no such unit');
    const mode = actionMode(attacker);
    if (!mode) return deny('attacker not actionable this turn');
    const capMod = clampCapMod(a.capMod ?? 0);
    const ctx = attackContext(next, attacker, target, capMod);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal attack');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    if (mode === 'ap' && !payAP(player, eff.apToFire)) return deny('not enough AP/CAP to fire');
    const capModCost = Math.abs(capMod);
    if (player.capCurrent < capModCost) return deny('not enough CAP for dice modifier');
    player.capCurrent -= capModCost;

    // §7.5.1: one shot at a hex resolves against every enemy stacked there, each
    // with its own roll, for the single fire cost already paid above.
    const stack = rollStackFire(next, attacker, target.hexId, capMod);
    next.rng = stack.rng;
    for (const { targetId, roll } of stack.rolls) {
      log(
        'fire',
        `${attacker.id} fires at ${targetId}: rolled ${roll.dice[0]}+${roll.dice[1]}=` +
          `${roll.dice[0] + roll.dice[1]} · AV ${roll.av} vs DV ${roll.dv}` +
          `${roll.isFlank ? ' (flank)' : ''} -> ` +
          `${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        attacker.side,
      );
      if (roll.hit) {
        const t = next.units[targetId];
        if (t) applyHit(t, roll.critical);
      }
    }
    completeAction(attacker, mode, player);
    return finish();
  };

  const doCloseCombat = (a: Extract<Action, { type: 'CLOSE_COMBAT' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    const target = next.units[a.targetId];
    if (!attacker || !target) return deny('no such unit');
    const mode = actionMode(attacker);
    if (!mode) return deny('attacker not actionable this turn');
    const capMod = clampCapMod(a.capMod ?? 0);
    const ctx = closeCombatContext(next, attacker, target);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal close combat');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    if (mode === 'ap' && !payAP(player, eff.apToFire))
      return deny('not enough AP/CAP for close combat');
    const capModCost = Math.abs(capMod);
    if (player.capCurrent < capModCost) return deny('not enough CAP for dice modifier');
    player.capCurrent -= capModCost;

    const roll = rollCloseCombat(next, attacker, target, capMod);
    next.rng = roll.rng;
    log(
      'cc',
      `${attacker.id} close-combats ${target.id}: rolled ${roll.dice[0]}+${roll.dice[1]}=` +
        `${roll.dice[0] + roll.dice[1]} · AV ${roll.av} vs flank DV ${roll.dv} -> ` +
        `${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
      attacker.side,
    );
    if (roll.hit) applyHit(target, roll.critical);
    completeAction(attacker, mode, player);
    return finish();
  };

  const doRally = (a: Extract<Action, { type: 'RALLY' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    const mode = actionMode(unit);
    if (!mode) return deny('unit not actionable this turn');
    if (unit.hitMarkers.length === 0) return deny('unit has no hit marker');
    const enemyHere = Object.values(next.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (enemyHere) return deny('cannot rally with enemy in hex');

    const capMod = clampCapMod(a.capMod ?? 0);
    const player = next.players[unit.side];
    if (mode === 'ap' && !payAP(player, RALLY_AP_COST)) return deny('not enough AP/CAP to rally');
    const capModCost = Math.abs(capMod);
    if (player.capCurrent < capModCost) return deny('not enough CAP for dice modifier');
    player.capCurrent -= capModCost;

    const rr = rollRally(next, unit, capMod);
    next.rng = rr.rng;
    if (rr.success) {
      const removed = unit.hitMarkers[0]!;
      unit.hitMarkers = [];
      next.hitPiles.foot = returnHitToPile(next.hitPiles.foot, removed);
      log(
        'rally',
        `${unit.id} rallies — rolled ${rr.dice[0]}+${rr.dice[1]}=${rr.roll} · ` +
          `total ${rr.total} >= ${rr.target}`,
        unit.side,
      );
    } else {
      log(
        'rally',
        `${unit.id} fails to rally — rolled ${rr.dice[0]}+${rr.dice[1]}=${rr.roll} · ` +
          `total ${rr.total} < ${rr.target}`,
        unit.side,
      );
    }
    completeAction(unit, mode, player);
    return finish();
  };

  const doMarkSpent = (a: Extract<Action, { type: 'MARK_SPENT' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    const player = next.players[unit.side];
    unit.status = 'spent';
    if (player.activatedUnitId === unit.id) {
      player.activatedUnitId = null;
      player.ap = 0;
    }
    log('spent', `${unit.id} marked spent`, unit.side);
    return finish(); // not a turn handover (beginning-of-turn bookkeeping)
  };

  const doStall = (a: Extract<Action, { type: 'STALL' }>): ReduceResult => {
    const player = next.players[next.currentSide];
    if (a.useCap) {
      if (player.capCurrent < 1) return deny('no CAP to stall');
      player.capCurrent -= 1;
    } else if (player.activatedUnitId && player.ap >= 1) {
      player.ap -= 1;
      maybeSpendActivated(player);
    } else if (player.capCurrent >= 1) {
      player.capCurrent -= 1;
    } else {
      return deny('nothing to spend for a stall');
    }
    resetPassCycle();
    log('stall', `${next.currentSide} stalls`, next.currentSide);
    switchTurn(next);
    return finish();
  };

  const doPass = (): ReduceResult => {
    const player = next.players[next.currentSide];
    if (player.activatedUnitId) {
      const u = next.units[player.activatedUnitId];
      if (u) u.status = 'spent';
      player.activatedUnitId = null;
      player.ap = 0;
    }
    player.passed = true;
    next.consecutivePasses += 1;
    log('pass', `${next.currentSide} passes`, next.currentSide);
    if (next.consecutivePasses >= 2) {
      log('roundEnd', `Round ${next.round} ends`);
      endRound(next);
      return finish();
    }
    switchTurn(next);
    return finish();
  };

  // -- dispatch -------------------------------------------------------------

  switch (action.type) {
    case 'ACTIVATE_UNIT':
      return activate(action.unitId);
    case 'MOVE':
      return doMove(action);
    case 'PIVOT':
      return doPivot(action);
    case 'FIRE':
      return doFire(action);
    case 'CLOSE_COMBAT':
      return doCloseCombat(action);
    case 'RALLY':
      return doRally(action);
    case 'MARK_SPENT':
      return doMarkSpent(action);
    case 'STALL':
      return doStall(action);
    case 'PASS':
      return doPass();
    default:
      return assertNever(action);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
