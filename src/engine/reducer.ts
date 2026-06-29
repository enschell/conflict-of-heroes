/**
 * The central reducer: reduce(state, action) -> { state, events }.
 *
 * This is the ONLY way to mutate game state and is the future online wire
 * format (CLAUDE.md §3.4). It deep-clones the input, mutates the clone, and
 * returns it; all validation happens before any mutation, so a denied action
 * leaves the original state untouched.
 *
 * v3 action economy (§2.0–§2.8): pick one Unit → one Action. The Action Cost is
 * a threshold, not a budget: after the action resolves, roll the Spent Die —
 * `roll > cost` keeps the Unit Fresh, else it becomes Spent. CAPs may lower the
 * cost before the check (to 0AP ⇒ no check, §3.4). Acting Stresses the Unit
 * (+1AP next Turn if reused, §2.6).
 */
import { FOOT_HIT_MARKERS } from '../data/hitMarkers';
import { applyUnitLoss, clampCapMod, reduceActionCost } from './cap';
import { attackContext, closeCombatContext, rollCloseCombat, rollStackFire } from './combat';
import { isInFrontArc, parseHexId } from './hex';
import { drawHit, effectiveStats, returnHitToPile, templateOf } from './hits';
import { directionTo, moveCost, pivotCost } from './movement';
import { RALLY_AP_COST, rollRally } from './rally';
import { spentCheck } from './spent';
import { endRound, switchTurn } from './turn';
import { otherSide, updateVictoryHexControl } from './victory';
import type {
  Action,
  Facing,
  GameEvent,
  GameState,
  ReduceResult,
  SideId,
  Unit,
} from './types';

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

  const resetPassCycle = () => {
    next.consecutivePasses = 0;
    next.players.A.passed = false;
    next.players.B.passed = false;
  };

  /**
   * Plan a cost-bearing action's CAP spend (§3.3–§3.4). `base` already folds in
   * terrain and hit-marker deltas (movement/hits do that); here we add Stress
   * (+1AP, §2.6) then apply the caller's explicit CAP cost-reduction.
   *
   * Note: reduction is NEVER applied automatically. A Spent Unit may act only if
   * the caller explicitly spends enough CAPs (`capCostReduce`) to bring the cost
   * to exactly 0AP (§3.4) — taking a 0AP Action is a deliberate, costly choice,
   * not something that happens silently when a Spent Unit is selected.
   */
  const planCost = (unit: Unit, base: number, requestedReduce: number) => {
    const stress = unit.stressed ? 1 : 0;
    const costBeforeReduce = base + stress;
    const reduce = Math.max(0, Math.trunc(requestedReduce));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduce);
    return { cost, capsSpent };
  };

  /**
   * After an action resolves: roll the Spent Check (skipped at 0AP, §3.4), move
   * the acting side's single Stress Marker onto `unit` (§2.6), break the pass
   * cycle, and hand the turn over.
   */
  const afterAction = (unit: Unit, cost: number) => {
    if (cost > 0) {
      const sc = spentCheck(next.rng, cost);
      next.rng = sc.rng;
      if (!sc.fresh) unit.status = 'spent';
      log(
        'spent',
        `${unit.id} Spent Check: rolled ${sc.roll} vs cost ${cost} -> ${sc.fresh ? 'Fresh' : 'Spent'}`,
        unit.side,
      );
    } else {
      log('spent', `${unit.id} 0AP action — no Spent Check`, unit.side);
    }
    // Stress Marker move (§2.6): at most one stressed Unit per side.
    for (const u of Object.values(next.units)) {
      if (u.side === unit.side) u.stressed = false;
    }
    unit.stressed = true;
    resetPassCycle();
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

  const doMove = (a: Extract<Action, { type: 'MOVE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    const mc = moveCost(next, unit, a.toHexId);
    if (mc.ap == null) return deny(mc.reason ?? 'illegal move');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, mc.ap, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    const oldHexId = unit.hexId;
    const dir = directionTo(oldHexId, a.toHexId);
    const forward = isInFrontArc(parseHexId(oldHexId), unit.facing, parseHexId(a.toHexId));
    unit.hexId = a.toHexId;
    if (forward && dir >= 0) unit.facing = dir as Facing;
    log('move', `${unit.id} -> ${a.toHexId} (cost ${cost})`, unit.side);
    updateVictoryHexControl(next);
    afterAction(unit, cost);
    return finish();
  };

  const doPivot = (a: Extract<Action, { type: 'PIVOT' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    const eff = effectiveStats(next, unit);
    if (!eff.canPivot) return deny('unit cannot pivot');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, pivotCost(), a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    unit.facing = a.facing;
    log('pivot', `${unit.id} pivots to ${a.facing} (cost ${cost})`, unit.side);
    afterAction(unit, cost);
    return finish();
  };

  const doFire = (a: Extract<Action, { type: 'FIRE' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    const target = next.units[a.targetId];
    if (!attacker || !target) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const ctx = attackContext(next, attacker, target, diceMod);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal attack');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    const { cost, capsSpent } = planCost(attacker, eff.apToFire, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP to fire');
    player.capCurrent -= capNeeded;

    // §7.5.1: one shot at a hex resolves against every enemy stacked there, each
    // with its own roll, for the single fire cost already paid above.
    const stack = rollStackFire(next, attacker, target.hexId, diceMod);
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
    afterAction(attacker, cost);
    return finish();
  };

  const doCloseCombat = (a: Extract<Action, { type: 'CLOSE_COMBAT' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    const target = next.units[a.targetId];
    if (!attacker || !target) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const ctx = closeCombatContext(next, attacker, target);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal close combat');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    const { cost, capsSpent } = planCost(attacker, eff.apToFire, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP for close combat');
    player.capCurrent -= capNeeded;

    const roll = rollCloseCombat(next, attacker, target, diceMod);
    next.rng = roll.rng;
    log(
      'cc',
      `${attacker.id} close-combats ${target.id}: rolled ${roll.dice[0]}+${roll.dice[1]}=` +
        `${roll.dice[0] + roll.dice[1]} · AV ${roll.av} vs flank DV ${roll.dv} -> ` +
        `${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
      attacker.side,
    );
    if (roll.hit) applyHit(target, roll.critical);
    afterAction(attacker, cost);
    return finish();
  };

  const doRally = (a: Extract<Action, { type: 'RALLY' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.hitMarkers.length === 0) return deny('unit has no hit marker');
    const enemyHere = Object.values(next.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (enemyHere) return deny('cannot rally with enemy in hex');

    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, RALLY_AP_COST, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP to rally');
    player.capCurrent -= capNeeded;

    const rr = rollRally(next, unit, diceMod);
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
    // §7.10: a mandatory Spent Check follows the rally regardless of result —
    // produced here because every cost-bearing action goes through afterAction.
    afterAction(unit, cost);
    return finish();
  };

  const doStall = (a: Extract<Action, { type: 'STALL' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, 1, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    log('stall', `${next.currentSide} stalls with ${unit.id} (cost ${cost})`, next.currentSide);
    afterAction(unit, cost);
    return finish();
  };

  const doPass = (): ReduceResult => {
    const player = next.players[next.currentSide];
    // §2.7: Passing removes the passing side's Stress Marker (opponent keeps theirs).
    for (const u of Object.values(next.units)) {
      if (u.side === next.currentSide) u.stressed = false;
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
