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
import { HIT_MARKERS, isArmoredMarker } from '../data/hitMarkers';
import { applyUnitLoss, clampCapMod, reduceActionCost } from './cap';
import { attackContext, closeCombatContext, rollCloseCombat, rollStackFire } from './combat';
import { isInFrontArc, parseHexId } from './hex';
import { drawHit, effectiveStats, returnHitToPile, templateOf } from './hits';
import { groupConnected, groupStress, isValidSupporter } from './groups';
import { directionTo, moveCost, pivotCost } from './movement';
import { RALLY_AP_COST, rollRally } from './rally';
import { spentCheck } from './spent';
import { endRound, switchTurn } from './turn';
import { gainVp, otherSide, updateVictoryHexControl } from './victory';
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

  /**
   * After a Group Action (§10.10): ONE Spent Check at the group cost — on a fail
   * EVERY member becomes Spent — and ALL members are Stressed regardless (§10.11),
   * so a side may hold several Stress markers. Then break the pass cycle and hand
   * the turn over.
   */
  const afterGroupAction = (members: Unit[], cost: number) => {
    const side = members[0]!.side;
    if (cost > 0) {
      const sc = spentCheck(next.rng, cost);
      next.rng = sc.rng;
      if (!sc.fresh) for (const m of members) m.status = 'spent';
      log(
        'spent',
        `Group Spent Check: rolled ${sc.roll} vs cost ${cost} -> ${sc.fresh ? 'Fresh' : 'Spent'} (whole Group)`,
        side,
      );
    } else {
      log('spent', `Group 0AP action — no Spent Check`, side);
    }
    for (const u of Object.values(next.units)) if (u.side === side) u.stressed = false;
    for (const m of members) m.stressed = true;
    resetPassCycle();
    switchTurn(next);
  };

  // §7.5 / §15.13: a marker returns to the deck it was drawn from.
  const returnMarker = (type: Parameters<typeof returnHitToPile>[1]) => {
    if (isArmoredMarker(type)) next.hitPiles.vehicle = returnHitToPile(next.hitPiles.vehicle, type);
    else next.hitPiles.foot = returnHitToPile(next.hitPiles.foot, type);
  };
  /** Armored Targets (blue Defense, §15.13) draw from the vehicle pile. */
  const isArmored = (unit: Unit) => templateOf(next, unit).dr.color === 'blue';

  const destroyUnit = (unit: Unit) => {
    for (const hm of unit.hitMarkers) returnMarker(hm);
    const tmpl = templateOf(next, unit);
    const opp = otherSide(unit.side);
    // §9.1: VP to the destroyer (flat per-Mission value if set) + step the no-tie marker.
    const killVp = next.victory.vpPerKill ?? tmpl.vp;
    gainVp(next, opp, killVp);
    applyUnitLoss(next.players[unit.side]);
    delete next.units[unit.id];
    log('destroyed', `${unit.id} destroyed (+${killVp} VP to ${opp})`, unit.side);
  };

  const applyHit = (target: Unit, critical: boolean) => {
    if (critical || target.hitMarkers.length > 0) {
      destroyUnit(target);
      return;
    }
    const armored = isArmored(target);
    const pile = armored ? next.hitPiles.vehicle : next.hitPiles.foot;
    const draw = drawHit(next.rng, pile);
    next.rng = draw.rng;
    if (armored) next.hitPiles.vehicle = draw.pile;
    else next.hitPiles.foot = draw.pile;
    const def = HIT_MARKERS[draw.type];
    if (def.killOnDraw) {
      returnMarker(draw.type);
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
          `${roll.total} vs Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr})` +
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
        `${roll.total} vs flank Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr}) -> ` +
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
      returnMarker(removed);
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

  const doGroupMove = (a: Extract<Action, { type: 'GROUP_MOVE' }>): ReduceResult => {
    if (a.moves.length === 0) return deny('empty group');
    const ids = a.moves.map((m) => m.unitId);
    if (new Set(ids).size !== ids.length) return deny('duplicate group member');
    const members: Unit[] = [];
    for (const id of ids) {
      const u = next.units[id];
      if (!u) return deny('no such unit');
      if (u.side !== next.currentSide) return deny('not your turn');
      members.push(u);
    }
    // §10.2: the Group must BEGIN in one continuously-adjacent cluster.
    if (!groupConnected(next, ids)) return deny('group is not continuously adjacent');

    // §10.4: Group Move cost = the highest individual move cost (movers only).
    let maxMove = 0;
    for (const m of a.moves) {
      if (m.toHexId == null) continue;
      const unit = next.units[m.unitId]!;
      const mc = moveCost(next, unit, m.toHexId);
      if (mc.ap == null) return deny(mc.reason ?? 'illegal move');
      maxMove = Math.max(maxMove, mc.ap);
    }
    const costBeforeReduce = maxMove + groupStress(members); // §10.11
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    // §10.1: a Spent member may join only if the Group cost is 0AP.
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    // Apply each member's move/pivot (members may separate, §10.3).
    for (const m of a.moves) {
      const unit = next.units[m.unitId]!;
      if (m.toHexId != null) {
        const oldHexId = unit.hexId;
        const dir = directionTo(oldHexId, m.toHexId);
        const forward = isInFrontArc(parseHexId(oldHexId), unit.facing, parseHexId(m.toHexId));
        unit.hexId = m.toHexId;
        if (m.facing != null) unit.facing = m.facing;
        else if (forward && dir >= 0) unit.facing = dir as Facing;
      } else if (m.facing != null) {
        unit.facing = m.facing;
      }
    }
    log(
      'groupMove',
      `${next.currentSide} Group Moves ${ids.join(', ')} (cost ${cost})`,
      next.currentSide,
    );
    updateVictoryHexControl(next);
    afterGroupAction(members, cost);
    return finish();
  };

  const doGroupAttack = (a: Extract<Action, { type: 'GROUP_ATTACK' }>): ReduceResult => {
    const leader = next.units[a.leaderId];
    const target = next.units[a.targetId];
    if (!leader || !target) return deny('no such unit');
    if (leader.side !== next.currentSide) return deny('not your turn');
    if (target.side === leader.side) return deny('friendly target');
    // Group close combat is a later increment; support ranged Group Attacks now.
    if (target.hexId === leader.hexId) return deny('group close combat not yet supported');

    const capMod = clampCapMod(a.capDiceMod ?? 0);
    const ctx = attackContext(next, leader, target, capMod);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal attack');

    // Validate supporters (§10.6) and de-dup against the leader.
    const supIds = [...new Set(a.supporterIds)].filter((id) => id !== a.leaderId);
    const members: Unit[] = [leader];
    for (const id of supIds) {
      const sup = next.units[id];
      if (!sup) return deny('no such supporter');
      if (sup.side !== next.currentSide) return deny('not your turn');
      if (!isValidSupporter(next, leader, sup, target)) return deny(`${id} cannot support this attack`);
      members.push(sup);
    }
    const arBonus = supIds.length; // +1AR per qualifying Supporting Unit (§10.7)

    // §10.8: Group Attack cost = the Leader's Attack Cost (+ Group Stress).
    const eff = effectiveStats(next, leader);
    const costBeforeReduce = eff.apToFire + groupStress(members);
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    const capNeeded = capsSpent + Math.abs(capMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP');
    player.capCurrent -= capNeeded;

    // §7.5.1: one shot at the hex resolves against every stacked enemy; the
    // leader's AR carries the +1AR-per-supporter Group Support Bonus.
    const stack = rollStackFire(next, leader, target.hexId, capMod, arBonus);
    next.rng = stack.rng;
    for (const { targetId, roll } of stack.rolls) {
      log(
        'groupFire',
        `Group [${members.map((m) => m.id).join('+')}] fires at ${targetId}: rolled ${roll.dice[0]}+${roll.dice[1]}=` +
          `${roll.total} vs Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr})` +
          `${roll.isFlank ? ' (flank)' : ''} -> ${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        leader.side,
      );
      if (roll.hit) {
        const t = next.units[targetId];
        if (t) applyHit(t, roll.critical);
      }
    }
    afterGroupAction(members, cost);
    return finish();
  };

  const doGroupRally = (a: Extract<Action, { type: 'GROUP_RALLY' }>): ReduceResult => {
    if (a.unitIds.length === 0) return deny('empty group');
    const ids = [...new Set(a.unitIds)];
    if (ids.length !== a.unitIds.length) return deny('duplicate group member');
    const members: Unit[] = [];
    for (const id of ids) {
      const u = next.units[id];
      if (!u) return deny('no such unit');
      if (u.side !== next.currentSide) return deny('not your turn');
      members.push(u);
    }
    if (!groupConnected(next, ids)) return deny('group is not continuously adjacent');
    // Every member must be a Hit Unit able to Rally (§7.9): has a rallyable
    // marker and shares no hex with an enemy.
    for (const u of members) {
      if (u.hitMarkers.length === 0) return deny(`${u.id} has no hit marker`);
      if (HIT_MARKERS[u.hitMarkers[0]!].rally <= 0) return deny(`${u.id} cannot rally`);
      if (Object.values(next.units).some((e) => e.side !== u.side && e.hexId === u.hexId))
        return deny(`${u.id} shares a hex with an enemy`);
    }

    const costBeforeReduce = RALLY_AP_COST + groupStress(members); // §10.9 / §10.11
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    // §10.9: roll an INDIVIDUAL Rally Check per member; each success removes its marker.
    for (const u of members) {
      const rr = rollRally(next, u);
      next.rng = rr.rng;
      if (rr.success) {
        const removed = u.hitMarkers[0]!;
        u.hitMarkers = [];
        returnMarker(removed);
        log('rally', `${u.id} rallies — ${rr.dice[0]}+${rr.dice[1]} total ${rr.total} >= ${rr.target}`, u.side);
      } else {
        log('rally', `${u.id} fails to rally — total ${rr.total} < ${rr.target}`, u.side);
      }
    }
    afterGroupAction(members, cost); // §10.10: ONE Group Spent Check
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
    case 'GROUP_MOVE':
      return doGroupMove(action);
    case 'GROUP_ATTACK':
      return doGroupAttack(action);
    case 'GROUP_RALLY':
      return doGroupRally(action);
    case 'PASS':
      return doPass();
    default:
      return assertNever(action);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
