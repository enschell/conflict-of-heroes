/**
 * Rules-conformance harness (M3.4, re-pointed to v3 §2–§3 in the M4.5 cutover).
 *
 * Auto-plays full Mission 1 games and, for EVERY action, independently
 * re-derives the expected result straight from the rulebook and asserts the
 * engine agrees. The re-derivation deliberately does NOT call the engine's
 * cost/combat functions — it recomputes from the data tables (terrain, hit
 * markers, templates) so it is a genuine cross-check. (Geometry primitives —
 * distance / inArc / lineDraw — are shared math and are reused.)
 *
 *   npm run conformance
 *
 * v3 economy: there is no AP pool. Each Action's (modified) cost is the
 * threshold for a d10 Spent Check (§2.5); acting Stresses the unit (§2.6).
 * The AI below acts only with Fresh units (so CAP is never spent on 0AP
 * Actions); the spent-unit-via-CAP path (§3.4) is exercised by the probe.
 */
import {
  reduce,
  legalActions,
  initGame,
  rollStackFire,
  rollCloseCombat,
  rollRally,
  distance,
  parseHexId,
  inArc,
  otherSide,
  directionTo,
  idOf,
} from '../src/engine';
import { lineDraw } from '../src/engine/hex';
import { TERRAIN } from '../src/data/terrainTypes';
import { FOOT_HIT_MARKERS } from '../src/data/hitMarkers';
import { FIREFIGHT_1 } from '../src/data/firefights/firefight1';
import type { Action, GameEvent, GameState, SideId, Unit } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Independent re-derivations from the rules + data (no engine cost/combat fns)
// ---------------------------------------------------------------------------

interface Eff {
  fpRed: number;
  fpBlue: number;
  front: number;
  flank: number;
  move: number;
  range: number;
  apToFire: number;
  color: 'red' | 'blue';
}

function myEff(state: GameState, unit: Unit): Eff {
  const t = state.templates[unit.templateId]!;
  const e: Eff = {
    fpRed: t.fp.red,
    fpBlue: t.fp.blue,
    front: t.dr.front,
    flank: t.dr.flank,
    move: t.move,
    range: t.range,
    apToFire: t.apToFire,
    color: t.dr.color,
  };
  for (const hm of unit.hitMarkers) {
    const d = FOOT_HIT_MARKERS[hm];
    e.fpRed += d.fpRedDelta ?? 0;
    e.fpBlue += d.fpBlueDelta ?? 0;
    e.front += d.frontDrDelta ?? 0;
    e.flank += d.flankDrDelta ?? 0;
    e.move += d.moveCostDelta ?? 0;
    e.apToFire += d.apToFireDelta ?? 0;
    if (d.rangeOverride !== undefined) e.range = d.rangeOverride;
  }
  return e;
}

/** Range FP modifier (§7.7): +3 adjacent, 0 within range, −2 long, null = out. */
function rangeMod(dist: number, range: number): number | null {
  if (dist < 1) return null;
  if (dist === 1) return 3;
  if (dist <= range) return 0;
  if (dist <= range * 2) return -2;
  return null;
}

/** +1 DM if the shot crosses a wall in/bordering the target hex (§5.0.2). */
function myWallDM(state: GameState, fromId: string, toId: string): number {
  const line = lineDraw(parseHexId(fromId), parseHexId(toId));
  if (line.length < 2) return 0;
  const prev = idOf(line[line.length - 2]!);
  const dir = directionTo(toId, prev);
  if (dir < 0) return 0;
  const target = state.hexes[toId];
  const prevHex = state.hexes[prev];
  const opp = (dir + 3) % 6;
  return target?.walls[dir] || prevHex?.walls[opp] ? 1 : 0;
}

function expectFire(state: GameState, atk: Unit, tgt: Unit) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const dist = distance(parseHexId(atk.hexId), parseHexId(tgt.hexId));
  const rm = rangeMod(dist, ae.range);
  if (rm === null) return null;
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + rm;
  const inFront = inArc(tgt.hexId, tgt.facing, atk.hexId); // attacker in target's front?
  const defense = inFront ? te.front : te.flank;
  const tHex = state.hexes[tgt.hexId]!;
  const dr = defense + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0) + myWallDM(state, atk.hexId, tgt.hexId);
  return { ar, dr, hitNumber: dr - ar, isFlank: !inFront, apToFire: ae.apToFire };
}

function expectCC(state: GameState, atk: Unit, tgt: Unit) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const whiteBox = !!state.templates[atk.templateId]!.whiteBoxFp;
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + (whiteBox ? -2 : 4);
  const tHex = state.hexes[tgt.hexId]!;
  const dr = te.flank + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0);
  return { ar, dr, hitNumber: dr - ar, apToFire: ae.apToFire };
}

function expectMoveCost(state: GameState, unit: Unit, toId: string): number {
  const e = myEff(state, unit);
  const from = state.hexes[unit.hexId]!;
  const to = state.hexes[toId]!;
  let ap = e.move;
  ap += from.road && to.road ? 0 : TERRAIN[to.terrain].apCost;
  if (!inArc(unit.hexId, unit.facing, toId)) ap += 1; // backward (§5.2)
  const dir = directionTo(unit.hexId, toId);
  const opp = (dir + 3) % 6;
  if (from.walls[dir] || to.walls[opp]) ap += 1; // wall crossing (§5.0.2)
  ap += Math.max(0, to.elevation - from.elevation); // uphill (§5)
  return ap;
}

// ---------------------------------------------------------------------------
// v3 helpers: action actor, expected base cost, and Spent-event parsing
// ---------------------------------------------------------------------------

/** The Unit that performs an Action (none for PASS). */
function actorId(a: Action): string | null {
  switch (a.type) {
    case 'MOVE':
    case 'PIVOT':
    case 'RALLY':
    case 'STALL':
      return a.unitId;
    case 'FIRE':
    case 'CLOSE_COMBAT':
      return a.attackerId;
    default:
      return null;
  }
}

/** Base Action Cost (before Stress / CAPs), re-derived from the rules. */
function expectBase(state: GameState, a: Action): number {
  switch (a.type) {
    case 'MOVE':
      return expectMoveCost(state, state.units[a.unitId]!, a.toHexId);
    case 'FIRE':
    case 'CLOSE_COMBAT':
      return myEff(state, state.units[a.attackerId]!).apToFire;
    case 'RALLY':
      return 5;
    case 'PIVOT':
    case 'STALL':
      return 1;
    default:
      return 0;
  }
}

/** Parse the engine's Spent-Check log line (§2.5). */
function parseSpent(events: GameEvent[]): { roll: number; cost: number; fresh: boolean } | null {
  const e = events.find((x) => x.type === 'spent');
  if (!e) return null;
  const m = /rolled (\d+) vs cost (\d+) -> (Fresh|Spent)/.exec(e.text);
  if (!m) return null;
  return { roll: Number(m[1]), cost: Number(m[2]), fresh: m[3] === 'Fresh' };
}

function actionEq(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'MOVE':
      return a.unitId === (b as typeof a).unitId && a.toHexId === (b as typeof a).toHexId;
    case 'FIRE':
    case 'CLOSE_COMBAT':
      return a.attackerId === (b as typeof a).attackerId && a.targetId === (b as typeof a).targetId;
    case 'PIVOT':
      return a.unitId === (b as typeof a).unitId && a.facing === (b as typeof a).facing;
    case 'RALLY':
    case 'STALL':
      return a.unitId === (b as typeof a).unitId;
    default:
      return true;
  }
}

interface Violation {
  section: string;
  msg: string;
  round: number;
  action: string;
}

// ---------------------------------------------------------------------------
// A simple AI that drives the game with Fresh units only.
// 'assault' prefers moving onto an adjacent enemy hex (forces close combat, §5.4).
// ---------------------------------------------------------------------------

function bestBy<T>(arr: T[], score: (t: T) => number): T | undefined {
  if (arr.length === 0) return undefined;
  let best = arr[0]!;
  let bestS = score(best);
  for (let i = 1; i < arr.length; i++) {
    const s = score(arr[i]!);
    if (s > bestS) {
      bestS = s;
      best = arr[i]!;
    }
  }
  return best;
}

type Style = 'default' | 'assault';

function chooseAction(state: GameState, style: Style): Action {
  const side = state.currentSide;
  const enemies = Object.values(state.units).filter((e) => e.side !== side);
  const isFresh = (a: Action) => {
    const id = actorId(a);
    return id != null && state.units[id]?.status === 'fresh';
  };
  const acts = legalActions(state).filter(isFresh);

  const towardScore = (toHexId: string) =>
    enemies.length ? -Math.min(...enemies.map((e) => distance(parseHexId(toHexId), parseHexId(e.hexId)))) : 0;
  const fireScore = (a: { attackerId: string; targetId: string }) => {
    const ex = expectFire(state, state.units[a.attackerId]!, state.units[a.targetId]!);
    return ex ? -ex.hitNumber : -Infinity; // lower Hit Number = easier
  };

  const cc = acts.filter((a): a is Extract<Action, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT');
  if (cc.length) return bestBy(cc, (a) => { const e = expectCC(state, state.units[a.attackerId]!, state.units[a.targetId]!); return -e.hitNumber; })!;

  const fires = acts.filter((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE');
  if (fires.length) return bestBy(fires, fireScore)!;

  const rallies = acts.filter((a) => a.type === 'RALLY');
  if (rallies.length) return rallies[0]!;

  const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  if (style === 'assault') {
    const onto = moves.filter((a) => enemies.some((e) => e.hexId === a.toHexId));
    if (onto.length) return onto[0]!;
  }
  if (moves.length) return bestBy(moves, (a) => towardScore(a.toHexId))!;

  return { type: 'PASS' };
}

// ---------------------------------------------------------------------------
// Play + verify one game
// ---------------------------------------------------------------------------

interface GameResult {
  seed: number;
  style: string;
  steps: number;
  rounds: number;
  winner: string;
  vpA: number;
  vpB: number;
  violations: Violation[];
  coverage: Record<string, number>;
}

function playGame(seed: number, style: Style): GameResult {
  let state = initGame({ ...FIREFIGHT_1, seed });
  const violations: Violation[] = [];
  const coverage: Record<string, number> = {};
  const bump = (k: string) => (coverage[k] = (coverage[k] ?? 0) + 1);

  let steps = 0;
  while (state.phase === 'playing' && steps < 6000) {
    const pre = state;
    const action = chooseAction(pre, style);
    const aStr = JSON.stringify(action);
    const check = (cond: boolean, section: string, msg: string) => {
      if (!cond) violations.push({ section, msg, round: pre.round, action: aStr });
    };

    // Pre-action invariants -------------------------------------------------
    check(legalActions(pre).some((x) => actionEq(x, action)), '2.2', `AI chose an action not in legalActions: ${aStr}`);
    // No friendly unit may FIRE out of a hex shared with an enemy (§7.7.3).
    for (const u of Object.values(pre.units)) {
      if (u.side !== pre.currentSide) continue;
      const enemyInHex = Object.values(pre.units).some((e) => e.side !== u.side && e.hexId === u.hexId);
      if (enemyInHex) {
        const fireOut = legalActions(pre).some(
          (x) => x.type === 'FIRE' && x.attackerId === u.id && pre.units[x.targetId]?.hexId !== u.hexId,
        );
        check(!fireOut, '7.7.3', `${u.id} shares a hex with an enemy but may fire out`);
      }
    }

    // Independent expectations BEFORE reducing -------------------------------
    const aId = actorId(action);
    const actor = aId ? pre.units[aId] : null;
    const expStress = actor?.stressed ? 1 : 0;
    const expCost = aId ? expectBase(pre, action) + expStress : 0;
    const preCap = { A: pre.players.A.capCurrent, B: pre.players.B.capCurrent };

    // Pre-roll peeks (deterministic from pre.rng) for dice actions ----------
    const firePeek =
      action.type === 'FIRE'
        ? rollStackFire(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!.hexId)
        : null;
    const ccPeek = action.type === 'CLOSE_COMBAT' ? rollCloseCombat(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!) : null;
    const rallyPeek = action.type === 'RALLY' ? rollRally(pre, pre.units[action.unitId]!) : null;

    const res = reduce(pre, action);
    if (res.events.length === 1 && res.events[0]?.type === 'illegal') {
      violations.push({ section: '-', msg: `reduce rejected an AI-legal action: ${res.events[0]?.text}`, round: pre.round, action: aStr });
      break;
    }
    const post = res.state;

    // Post invariants -------------------------------------------------------
    check(post.players.A.capCurrent >= 0 && post.players.B.capCurrent >= 0, '3.2', 'CAP went negative');
    for (const u of Object.values(post.units)) check(u.hitMarkers.length <= 1, '7.4', `${u.id} has >1 hit marker`);

    // §7.13: a new Round resets each side's CAP to max(3, capStart − losses).
    if (post.phase === 'playing' && post.round > pre.round) {
      for (const sd of ['A', 'B'] as SideId[]) {
        const p = post.players[sd];
        const exp = Math.max(3, p.capStart - p.unitLosses);
        check(p.capCurrent === exp, '7.13', `round-reset CAP for ${sd} ${p.capCurrent} != ${exp}`);
      }
    }

    // VP only from destroyed units this step (§7.0) -------------------------
    const destroyed = Object.keys(pre.units).filter((id) => !post.units[id]);
    let vpToA = 0;
    let vpToB = 0;
    for (const id of destroyed) {
      const u = pre.units[id]!;
      const vp = pre.templates[u.templateId]!.vp;
      if (otherSide(u.side) === 'A') vpToA += vp;
      else vpToB += vp;
    }
    check(post.players.A.vp - pre.players.A.vp === vpToA, '7.0', `Side A VP delta ${post.players.A.vp - pre.players.A.vp} != ${vpToA} from kills`);
    check(post.players.B.vp - pre.players.B.vp === vpToB, '7.0', `Side B VP delta ${post.players.B.vp - pre.players.B.vp} != ${vpToB} from kills`);

    const handover = (turnAction: boolean) => {
      if (post.phase !== 'playing' || post.round !== pre.round) return; // round/game ended
      if (turnAction) check(post.currentSide !== pre.currentSide, '2.2', `turn should alternate after ${action.type}`);
      else check(post.currentSide === pre.currentSide, '2.2', `${action.type} should not change the active side`);
    };

    // Spent Check + Stress for any cost-bearing Action (§2.5, §2.6) ----------
    const verifyEconomy = (side: SideId, id: string) => {
      // The AI only acts with Fresh units → no CAP is spent (cost > 0AP).
      check(post.players[side].capCurrent === preCap[side], '3.3', `fresh action should spend no CAP (${aStr})`);
      const sp = parseSpent(res.events);
      check(!!sp, '2.5', `expected a Spent Check log for ${aStr}`);
      if (sp) {
        check(sp.cost === expCost, '2.4', `Spent Check cost engine ${sp.cost} != expected ${expCost}`);
        check(sp.fresh === sp.roll > sp.cost, '2.5', `Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
        const postActor = post.units[id];
        if (postActor) check(postActor.status === (sp.fresh ? 'fresh' : 'spent'), '2.5', `actor status ${postActor.status} != Spent Check result`);
      }
      // Stress Marker moved onto the actor; at most one stressed unit per side (§2.6).
      const postActor = post.units[id];
      if (postActor) check(postActor.stressed === true, '2.6', `${id} should be Stressed after acting`);
      const stressedSame = Object.values(post.units).filter((u) => u.side === side && u.stressed);
      check(stressedSame.length <= 1, '2.6', `side ${side} has ${stressedSame.length} stressed units (max 1)`);
    };

    switch (action.type) {
      case 'MOVE': {
        check(post.units[action.unitId]?.hexId === action.toHexId, '4.5', 'unit did not move to target hex');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump('MOVE');
        break;
      }
      case 'FIRE': {
        const attacker = pre.units[action.attackerId]!;
        const stack = firePeek!;
        // §7.5.1: one shot at a hex hits every enemy stacked there.
        check(stack.rolls.length >= 1, '7.5.1', 'fire should resolve at least one target');
        check(stack.rolls.some((r) => r.targetId === action.targetId), '7.5.1', 'clicked target must be among the resolved stack');
        for (const { targetId, roll } of stack.rolls) {
          const exp = expectFire(pre, attacker, pre.units[targetId]!);
          if (!exp) {
            check(false, '6.0', `${targetId} in fired hex should be a legal target`);
            continue;
          }
          check(roll.ar === exp.ar, '6.1', `AR: engine ${roll.ar} != expected ${exp.ar}`);
          check(roll.dr === exp.dr, '6.3', `DR: engine ${roll.dr} != expected ${exp.dr}`);
          check(roll.hitNumber === exp.hitNumber, '6.8', `Hit Number: engine ${roll.hitNumber} != expected ${exp.hitNumber} (DR ${exp.dr} − AR ${exp.ar})`);
          const myTotal = roll.dice[0] + roll.dice[1];
          check(roll.total === myTotal, '6.8', `total: engine ${roll.total} != ${myTotal}`);
          check(roll.hit === myTotal >= exp.hitNumber, '6.8', `hit: engine ${roll.hit} != ${myTotal >= exp.hitNumber}`);
          check(roll.critical === myTotal >= exp.hitNumber + 4, '6.8', `crit: engine ${roll.critical} != ${myTotal >= exp.hitNumber + 4}`);
          check(roll.isFlank === exp.isFlank, '6.3', `flank flag mismatch`);
          verifyHit(pre, post, targetId, roll.hit, roll.critical, check);
        }
        verifyEconomy(attacker.side, action.attackerId);
        handover(true);
        bump('FIRE');
        break;
      }
      case 'CLOSE_COMBAT': {
        const exp = expectCC(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!);
        const peek = ccPeek!;
        check(peek.ar === exp.ar, '6.11', `CC AR: engine ${peek.ar} != expected ${exp.ar}`);
        check(peek.dr === exp.dr, '6.11', `CC DR: engine ${peek.dr} != expected ${exp.dr} (flank+terrain)`);
        check(peek.hitNumber === exp.hitNumber, '6.11', `CC Hit Number: engine ${peek.hitNumber} != expected ${exp.hitNumber}`);
        check(peek.isFlank === true, '6.11', 'CC must resolve vs flank DR');
        verifyHit(pre, post, action.targetId, peek.hit, peek.critical, check);
        verifyEconomy(pre.units[action.attackerId]!.side, action.attackerId);
        handover(true);
        bump('CC');
        break;
      }
      case 'RALLY': {
        const preU = pre.units[action.unitId]!;
        const peek = rallyPeek!;
        const def = FOOT_HIT_MARKERS[preU.hitMarkers[0]!];
        let mod = 0;
        const hex = pre.hexes[preU.hexId]!;
        if (TERRAIN[hex.terrain].isCover) mod += 1;
        for (const o of Object.values(pre.units)) {
          if (o.id !== preU.id && o.side === preU.side && o.hexId === preU.hexId && o.hitMarkers.length === 0) mod += 1;
        }
        const myTotal = peek.dice[0] + peek.dice[1] + mod;
        check(peek.target === def.rally, '7.7', `rally number engine ${peek.target} != ${def.rally}`);
        check(peek.total === myTotal, '7.7', `rally total engine ${peek.total} != ${myTotal} (mods ${mod})`);
        check(peek.success === myTotal >= def.rally, '7.7', 'rally success mismatch');
        const postU = post.units[action.unitId];
        if (myTotal >= def.rally) check(!!postU && postU.hitMarkers.length === 0, '7.7', 'successful rally should remove the marker');
        else check(!!postU && postU.hitMarkers.length === preU.hitMarkers.length, '7.7', 'failed rally should keep the marker');
        // §7.10: a Spent Check follows the rally regardless of result.
        verifyEconomy(preU.side, action.unitId);
        handover(true);
        bump('RALLY');
        break;
      }
      case 'PIVOT': {
        check(post.units[action.unitId]?.facing === action.facing, '4.5', 'pivot did not set facing');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump('PIVOT');
        break;
      }
      case 'STALL': {
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump('STALL');
        break;
      }
      case 'PASS': {
        if (post.phase === 'playing' && post.round === pre.round) {
          check(post.currentSide !== pre.currentSide, '2.7', 'pass should alternate turn');
          check(post.consecutivePasses === pre.consecutivePasses + 1, '2.7', 'pass should increment the pass counter');
        }
        // Passing clears the passing side's Stress (§2.7).
        const stillStressed = Object.values(post.units).filter((u) => u.side === pre.currentSide && u.stressed);
        check(stillStressed.length === 0, '2.7', `pass should clear side ${pre.currentSide}'s Stress`);
        bump('PASS');
        break;
      }
    }

    state = post;
    steps += 1;
  }

  return {
    seed,
    style,
    steps,
    rounds: state.round,
    winner: state.winner === undefined ? '(unfinished)' : state.winner ?? 'tie',
    vpA: state.players.A.vp,
    vpB: state.players.B.vp,
    violations,
    coverage,
  };
}

function verifyHit(
  pre: GameState,
  post: GameState,
  targetId: string,
  hit: boolean,
  crit: boolean,
  check: (c: boolean, s: string, m: string) => void,
) {
  const preT = pre.units[targetId]!;
  const postT = post.units[targetId];
  const preH = preT.hitMarkers.length;
  if (!hit) {
    check(!!postT && postT.hitMarkers.length === preH, '7.5', 'a miss must not change the target');
    return;
  }
  if (crit || preH > 0) {
    check(!postT, '7.4', 'critical or second hit must destroy the target');
    return;
  }
  check(!postT || postT.hitMarkers.length === 1, '7.5', 'a first hit must add exactly one marker (or Destroyed kills)');
}

// ---------------------------------------------------------------------------
// Scripted probe for the actions the AI rarely takes: pivot, stall, and a
// Spent unit acting by buying its cost down to 0AP with CAPs (§3.4).
// ---------------------------------------------------------------------------

function probe(): GameResult {
  let state = initGame({ ...FIREFIGHT_1, seed: 909 });
  const violations: Violation[] = [];
  const coverage: Record<string, number> = {};
  const bump = (k: string) => (coverage[k] = (coverage[k] ?? 0) + 1);
  const check = (cond: boolean, section: string, msg: string) => {
    if (!cond) violations.push({ section, msg, round: state.round, action: 'probe' });
  };

  const side = state.currentSide;
  const u = Object.values(state.units).find((x) => x.side === side)!;

  // Pivot (cost 1, sets facing, runs a Spent Check, hands over the turn).
  const turnBefore = state.currentSide;
  const newFacing = ((u.facing + 2) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
  const rp = reduce(state, { type: 'PIVOT', unitId: u.id, facing: newFacing });
  if (rp.events[0]?.type === 'illegal') {
    check(false, '4.5', `probe: pivot rejected (${rp.events[0]?.text})`);
  } else {
    check(rp.state.units[u.id]?.facing === newFacing, '4.5', 'probe: pivot did not set facing');
    check(rp.state.units[u.id]?.stressed === true, '2.6', 'probe: pivot should Stress the unit');
    check(parseSpent(rp.events)?.cost === 1, '2.4', 'probe: pivot Spent Check should be cost 1');
    check(rp.state.currentSide !== turnBefore, '2.2', 'probe: pivot should hand over the turn');
    bump('PIVOT');
    state = rp.state;
  }

  // Stall by the now-active side (a Unit does nothing; Spent Check + Stress).
  const s2 = state.currentSide;
  const u2 = Object.values(state.units).find((x) => x.side === s2 && x.status === 'fresh')!;
  const rs = reduce(state, { type: 'STALL', unitId: u2.id });
  if (rs.events[0]?.type === 'illegal') {
    check(false, '2.8', `probe: stall rejected (${rs.events[0]?.text})`);
  } else {
    check(parseSpent(rs.events)?.cost === 1, '2.8', 'probe: stall Spent Check should be cost 1');
    check(rs.state.units[u2.id]?.stressed === true, '2.8', 'probe: stall should Stress the unit');
    check(rs.state.currentSide !== s2, '2.8', 'probe: stall should hand over the turn');
    bump('STALL');
    state = rs.state;
  }

  // Spent unit acting via CAP to reach 0AP (§3.4): flip a unit Spent and move it.
  const s3 = state.currentSide;
  const u3 = Object.values(state.units).find((x) => x.side === s3)!;
  const moveTarget = legalActions({ ...state, units: { ...state.units, [u3.id]: { ...u3, status: 'fresh' } } })
    .find((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE' && a.unitId === u3.id);
  if (moveTarget) {
    const spentState: GameState = { ...state, units: { ...state.units, [u3.id]: { ...u3, status: 'spent', stressed: false } } };
    const capBefore = spentState.players[s3].capCurrent;
    const base = expectBase(spentState, moveTarget); // no Stress (cleared above)
    // §3.4: a Spent unit must explicitly spend CAPs to reach 0AP (no auto-reduce).
    const rc = reduce(spentState, { ...moveTarget, capCostReduce: base });
    if (rc.events[0]?.type === 'illegal') {
      check(false, '3.4', `probe: spent-unit 0AP move rejected (${rc.events[0]?.text})`);
    } else {
      check(rc.state.units[u3.id]?.hexId === moveTarget.toHexId, '3.4', 'probe: spent unit should move');
      check(rc.state.units[u3.id]?.status === 'spent', '3.4', 'probe: spent unit stays Spent after a 0AP Action');
      check(parseSpent(rc.events) === null, '3.4', 'probe: 0AP Action makes no Spent Check');
      check(capBefore - rc.state.players[s3].capCurrent === base, '3.3', `probe: 0AP move should spend ${base} CAP`);
      bump('SPENT0AP');
    }
  }

  return { seed: 909, style: 'scripted probe', steps: 3, rounds: state.round, winner: '-', vpA: 0, vpB: 0, violations, coverage };
}

// ---------------------------------------------------------------------------
// Run the games and report
// ---------------------------------------------------------------------------

function report(r: GameResult) {
  console.log(`\n=== Game (seed ${r.seed}, style "${r.style}") ===`);
  console.log(`  steps ${r.steps} · rounds played ${r.rounds} · winner ${r.winner} · VP A ${r.vpA} / B ${r.vpB}`);
  console.log(`  coverage: ${Object.entries(r.coverage).map(([k, v]) => `${k}=${v}`).join('  ') || '(none)'}`);
  if (r.violations.length === 0) {
    console.log(`  ✅ 0 rule violations`);
  } else {
    console.log(`  ❌ ${r.violations.length} violation(s):`);
    for (const v of r.violations.slice(0, 40)) {
      console.log(`     §${v.section} R${v.round} [${v.action}] — ${v.msg}`);
    }
  }
}

const games: GameResult[] = [
  playGame(101, 'default'),
  playGame(202, 'default'),
  playGame(303, 'assault'), // forces move-into-enemy-hex + close combat
  probe(), // pivot + stall + spent-unit-via-CAP
];
console.log('Conflict of Heroes — rules conformance audit (Mission 1, v3 economy)');
for (const g of games) report(g);
const total = games.reduce((n, g) => n + g.violations.length, 0);
console.log(`\nTOTAL violations across ${games.length} games: ${total}`);
process.exitCode = total > 0 ? 1 : 0;
