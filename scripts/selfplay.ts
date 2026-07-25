/**
 * 25-game self-play analysis harness (ad-hoc, user-requested — not part of
 * the permanent test suite). Plays Mission 1 "Partisans" to completion 25
 * times with four heuristic AI styles controlling each side, independently
 * re-derives the v3 rules for every Action taken (same technique as
 * scripts/conformance.ts — cost/AR/DR/VP are recomputed from the data tables,
 * not by calling the engine's own functions, so this is a genuine
 * cross-check), and reports:
 *   - any rule violation found, with the seed/style/round/action to reproduce
 *   - who won each game, by how much VP, and how the VP lead evolved
 *   - per-style and per-side win-rate / action-mix stats for strategy notes
 *
 *   npx tsx scripts/selfplay.ts
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
  legalEntryHexes,
  vpForRound,
  vpPerKillFor,
  vpMargin,
} from '../src/engine';
import { lineDraw } from '../src/engine/hex';
import { TERRAIN } from '../src/data/terrainTypes';
import { FOOT_HIT_MARKERS } from '../src/data/hitMarkers';
import { MISSION_1 } from '../src/data/missions/mission1';
import { hexIdForLabel } from '../src/data/maps/mission1';
import type { Action, GameEvent, GameState, SideId, Unit } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Independent re-derivations from the rules + data (no engine cost/combat fns)
// — copied from scripts/conformance.ts's proven oracle, unmodified.
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

function rangeMod(dist: number, range: number): number | null {
  if (dist < 1) return null;
  if (dist === 1) return 3;
  if (dist <= range) return 0;
  if (dist <= range * 2) return -2;
  return null;
}

function elevationMoveCost(fromElev: number, toElev: number): number {
  const diff = toElev - fromElev;
  const absDiff = Math.abs(diff);
  if (absDiff >= 2) return 2;
  if (absDiff === 1) return diff > 0 ? 1 : 0;
  return 0;
}

function elevationCombatMods(state: GameState, attackerHexId: string, targetHexId: string) {
  const aElev = state.hexes[attackerHexId]?.elevation ?? 0;
  const tElev = state.hexes[targetHexId]?.elevation ?? 0;
  return { elevAr: aElev > tElev ? 1 : 0, elevDr: tElev > aElev ? 1 : 0 };
}

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
  const { elevAr, elevDr } = elevationCombatMods(state, atk.hexId, tgt.hexId);
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + rm + elevAr;
  const inFront = inArc(tgt.hexId, tgt.facing, atk.hexId);
  const defense = inFront ? te.front : te.flank;
  const tHex = state.hexes[tgt.hexId]!;
  const dr = defense + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0) + myWallDM(state, atk.hexId, tgt.hexId) + elevDr;
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
  if (!inArc(unit.hexId, unit.facing, toId)) ap += 1;
  const dir = directionTo(unit.hexId, toId);
  const opp = (dir + 3) % 6;
  if (from.walls[dir] || to.walls[opp]) ap += 1;
  ap += elevationMoveCost(from.elevation, to.elevation);
  return ap;
}

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
// Four heuristic AI "strategies" — this is the part we vary to compare
// strategies against each other, unlike conformance.ts's fixed pair of styles.
// ---------------------------------------------------------------------------

type Style = 'balanced' | 'assault' | 'marksman' | 'objective';
const STYLES: Style[] = ['balanced', 'assault', 'marksman', 'objective'];
const OBJECTIVE_HEX = hexIdForLabel('I06');

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

function chooseAction(state: GameState, styleOf: Record<SideId, Style>): Action {
  const side = state.currentSide;
  const style = styleOf[side];
  const enemies = Object.values(state.units).filter((e) => e.side !== side);
  const isFresh = (a: Action) => {
    const id = actorId(a);
    return id != null && state.units[id]?.status === 'fresh';
  };
  const allActs = legalActions(state);
  // §4.12: bring reinforcements on as soon as eligible, regardless of style —
  // no real player would leave a Group off-Map for free once it can enter.
  const entries = allActs.filter((a): a is Extract<Action, { type: 'ENTER' }> => a.type === 'ENTER');
  if (entries.length) return entries[0]!;

  const acts = allActs.filter(isFresh);
  const cc = acts.filter((a): a is Extract<Action, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT');
  const fires = acts.filter((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE');
  const rallies = acts.filter((a) => a.type === 'RALLY');
  const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');

  const ccScore = (a: { attackerId: string; targetId: string }) =>
    -expectCC(state, state.units[a.attackerId]!, state.units[a.targetId]!).hitNumber;
  const fireScore = (a: { attackerId: string; targetId: string }) => {
    const ex = expectFire(state, state.units[a.attackerId]!, state.units[a.targetId]!);
    return ex ? -ex.hitNumber : -Infinity;
  };

  // Combat priority: every style but "marksman" prefers Close Combat (higher,
  // guaranteed-adjacent AR) over ranged Fire when both are available; a
  // marksman avoids closing to melee and shoots instead whenever it can.
  const takeCombat = (): Action | null => {
    if (style === 'marksman') {
      if (fires.length) return bestBy(fires, fireScore)!;
      if (cc.length) return bestBy(cc, ccScore)!;
      return null;
    }
    if (cc.length) return bestBy(cc, ccScore)!;
    if (fires.length) return bestBy(fires, fireScore)!;
    return null;
  };
  const combat = takeCombat();
  if (combat) return combat;

  if (rallies.length) return rallies[0]!;

  if (moves.length) {
    if (style === 'assault') {
      const onto = moves.filter((a) => enemies.some((e) => e.hexId === a.toHexId));
      if (onto.length) return onto[0]!;
      return bestBy(moves, (a) =>
        enemies.length ? -Math.min(...enemies.map((e) => distance(parseHexId(a.toHexId), parseHexId(e.hexId)))) : 0,
      )!;
    }
    if (style === 'objective') {
      return bestBy(moves, (a) => -distance(parseHexId(a.toHexId), parseHexId(OBJECTIVE_HEX)))!;
    }
    if (style === 'marksman') {
      // Approach until within firing range, but avoid voluntarily landing
      // adjacent (distance 1) where only Close Combat's harsher AR applies.
      return bestBy(moves, (a) => {
        if (!enemies.length) return 0;
        const d = Math.min(...enemies.map((e) => distance(parseHexId(a.toHexId), parseHexId(e.hexId))));
        return d <= 1 ? -100 - d : -d;
      })!;
    }
    // balanced
    return bestBy(moves, (a) =>
      enemies.length ? -Math.min(...enemies.map((e) => distance(parseHexId(a.toHexId), parseHexId(e.hexId)))) : 0,
    )!;
  }

  return { type: 'PASS' };
}

// ---------------------------------------------------------------------------
// Play + verify one game
// ---------------------------------------------------------------------------

interface RoundSnapshot {
  round: number;
  vpMarker: number;
  leader: SideId;
}

interface GameResult {
  seed: number;
  styleA: Style;
  styleB: Style;
  steps: number;
  rounds: number;
  winner: SideId | null;
  vpA: number;
  vpB: number;
  margin: number;
  trajectory: RoundSnapshot[];
  violations: Violation[];
  coverage: { A: Record<string, number>; B: Record<string, number> };
}

function playGame(seed: number, styleA: Style, styleB: Style): GameResult {
  let state = initGame({ ...MISSION_1, seed });
  const styleOf: Record<SideId, Style> = { A: styleA, B: styleB };
  const violations: Violation[] = [];
  const coverage = { A: {} as Record<string, number>, B: {} as Record<string, number> };
  const bump = (side: SideId, k: string) => (coverage[side][k] = (coverage[side][k] ?? 0) + 1);
  const trajectory: RoundSnapshot[] = [];

  let steps = 0;
  while (state.phase === 'playing' && steps < 8000) {
    const pre = state;
    const action = chooseAction(pre, styleOf);
    const aStr = JSON.stringify(action);
    const check = (cond: boolean, section: string, msg: string) => {
      if (!cond) violations.push({ section, msg, round: pre.round, action: aStr });
    };

    check(legalActions(pre).some((x) => actionEq(x, action)), '2.2', `AI chose an action not in legalActions: ${aStr}`);
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

    const aId = actorId(action);
    const actor = aId ? pre.units[aId] : null;
    const expStress = actor?.stressed ? 1 : 0;
    const expCost = aId ? expectBase(pre, action) + expStress : 0;
    const preCap = { A: pre.players.A.capCurrent, B: pre.players.B.capCurrent };

    const firePeek =
      action.type === 'FIRE' ? rollStackFire(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!.hexId) : null;
    const ccPeek = action.type === 'CLOSE_COMBAT' ? rollCloseCombat(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!) : null;
    const rallyPeek = action.type === 'RALLY' ? rollRally(pre, pre.units[action.unitId]!) : null;

    const res = reduce(pre, action);
    if (res.events.length === 1 && res.events[0]?.type === 'illegal') {
      violations.push({ section: '-', msg: `reduce rejected an AI-legal action: ${res.events[0]?.text}`, round: pre.round, action: aStr });
      break;
    }
    const post = res.state;

    check(post.players.A.capCurrent >= 0 && post.players.B.capCurrent >= 0, '3.2', 'CAP went negative');
    for (const u of Object.values(post.units)) check(u.hitMarkers.length <= 1, '7.4', `${u.id} has >1 hit marker`);

    if (post.phase === 'playing' && post.round > pre.round) {
      for (const sd of ['A', 'B'] as SideId[]) {
        const p = post.players[sd];
        const exp = Math.max(3, p.capStart - p.unitLosses);
        check(p.capCurrent === exp, '7.13', `round-reset CAP for ${sd} ${p.capCurrent} != ${exp}`);
      }
    }

    const destroyed = Object.keys(pre.units).filter((id) => !post.units[id]);
    let vpToA = 0;
    let vpToB = 0;
    for (const id of destroyed) {
      const u = pre.units[id]!;
      const opp = otherSide(u.side);
      const vp = vpPerKillFor(pre.victory, opp) ?? pre.templates[u.templateId]!.vp;
      if (opp === 'A') vpToA += vp;
      else vpToB += vp;
    }
    const roundEnded = action.type === 'PASS' && (post.round > pre.round || post.phase === 'gameOver');
    if (roundEnded) {
      for (const vh of post.victory.victoryHexes) {
        const ctrl = post.hexes[vh.hexId]?.features.control;
        const vp = vpForRound(vh, pre.round);
        if (ctrl === 'A') vpToA += vp;
        else if (ctrl === 'B') vpToB += vp;
      }
      trajectory.push({ round: pre.round, vpMarker: post.vpMarker, leader: post.vpMarker > 0 ? 'A' : 'B' });
    }
    check(post.players.A.vp - pre.players.A.vp === vpToA, '9.1', `Side A VP delta ${post.players.A.vp - pre.players.A.vp} != ${vpToA} (kills+control)`);
    check(post.players.B.vp - pre.players.B.vp === vpToB, '9.1', `Side B VP delta ${post.players.B.vp - pre.players.B.vp} != ${vpToB} (kills+control)`);
    check(post.vpMarker !== 0, '9.2', 'VP marker landed on 0 (no-tie violated)');

    const handover = (turnAction: boolean) => {
      if (post.phase !== 'playing' || post.round !== pre.round) return;
      if (turnAction) check(post.currentSide !== pre.currentSide, '2.2', `turn should alternate after ${action.type}`);
      else check(post.currentSide === pre.currentSide, '2.2', `${action.type} should not change the active side`);
    };

    const verifyEconomy = (side: SideId, id: string) => {
      check(post.players[side].capCurrent === preCap[side], '3.3', `fresh action should spend no CAP (${aStr})`);
      const sp = parseSpent(res.events);
      check(!!sp, '2.5', `expected a Spent Check log for ${aStr}`);
      if (sp) {
        check(sp.cost === expCost, '2.4', `Spent Check cost engine ${sp.cost} != expected ${expCost}`);
        check(sp.fresh === sp.roll > sp.cost, '2.5', `Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
        const postActor = post.units[id];
        if (postActor) check(postActor.status === (sp.fresh ? 'fresh' : 'spent'), '2.5', `actor status ${postActor.status} != Spent Check result`);
      }
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
        bump(pre.currentSide, 'MOVE');
        break;
      }
      case 'FIRE': {
        const attacker = pre.units[action.attackerId]!;
        const stack = firePeek!;
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
        bump(pre.currentSide, 'FIRE');
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
        bump(pre.currentSide, 'CC');
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
        verifyEconomy(preU.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'RALLY');
        break;
      }
      case 'ENTER': {
        for (const p of action.placements) {
          check(post.units[p.unitId]?.hexId === p.hexId, '4.12', 'entered unit should be at its chosen hex');
          check(post.units[p.unitId]?.stressed === true, '2.6', 'entry should Stress the unit');
        }
        check(parseSpent(res.events) === null, '4.12', 'entry makes no Spent Check');
        handover(true);
        bump(pre.currentSide, 'ENTER');
        break;
      }
      case 'PASS': {
        if (post.phase === 'playing' && post.round === pre.round) {
          check(post.currentSide !== pre.currentSide, '2.7', 'pass should alternate turn');
          check(post.consecutivePasses === pre.consecutivePasses + 1, '2.7', 'pass should increment the pass counter');
        }
        const stillStressed = Object.values(post.units).filter((u) => u.side === pre.currentSide && u.stressed);
        check(stillStressed.length === 0, '2.7', `pass should clear side ${pre.currentSide}'s Stress`);
        bump(pre.currentSide, 'PASS');
        break;
      }
    }

    state = post;
    steps += 1;
  }

  if (state.phase !== 'gameOver') {
    violations.push({ section: '-', msg: `game did not reach gameOver within the step cap (phase=${state.phase})`, round: state.round, action: '-' });
  }

  return {
    seed,
    styleA,
    styleB,
    steps,
    rounds: state.round,
    winner: state.winner ?? null,
    vpA: state.players.A.vp,
    vpB: state.players.B.vp,
    margin: vpMargin(state),
    trajectory,
    violations,
    coverage,
  };
}

// ---------------------------------------------------------------------------
// Build the 25-game schedule: all 16 ordered style pairings (A-style x
// B-style) once, then 8 mirror-matchup replays (same style both sides, a
// second seed) to sample seed variance, then 1 extra spot-check pairing.
// ---------------------------------------------------------------------------

const games: { seed: number; styleA: Style; styleB: Style }[] = [];
let seedCounter = 5001;
for (const sa of STYLES) {
  for (const sb of STYLES) {
    games.push({ seed: seedCounter++, styleA: sa, styleB: sb });
  }
}
for (const s of STYLES) {
  games.push({ seed: seedCounter++, styleA: s, styleB: s });
  games.push({ seed: seedCounter++, styleA: s, styleB: s });
}
games.push({ seed: seedCounter++, styleA: 'assault', styleB: 'objective' });
// 16 + 8 + 1 = 25

const results: GameResult[] = games.map((g) => playGame(g.seed, g.styleA, g.styleB));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('Conflict of Heroes — 25-game self-play analysis (Mission 1 "Partisans", v3 rules)\n');

let totalViolations = 0;
for (const r of results) {
  totalViolations += r.violations.length;
  const lead = r.trajectory.map((t) => `R${t.round}:${t.leader}${Math.abs(t.vpMarker)}`).join(' ');
  console.log(
    `seed ${r.seed} | A=${r.styleA.padEnd(9)} vs B=${r.styleB.padEnd(9)} | winner ${r.winner} by ${r.margin} VP ` +
      `(A${r.vpA}-B${r.vpB}) | steps ${r.steps} | trajectory ${lead} | violations ${r.violations.length}`,
  );
  for (const v of r.violations) {
    console.log(`    ❌ §${v.section} R${v.round} [${v.action}] — ${v.msg}`);
  }
}

console.log(`\nTOTAL rule violations across ${results.length} games: ${totalViolations}`);

// --- Win-rate / margin / speed stats -----------------------------------
const winsBySide: Record<SideId, number> = { A: 0, B: 0 };
const winsByStyleAsA: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0 };
const winsByStyleAsB: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0 };
const gamesByStyleAsA: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0 };
const gamesByStyleAsB: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0 };
let marginSum = 0;
const marginByWinnerStyle: Record<Style, number[]> = { balanced: [], assault: [], marksman: [], objective: [] };
const leadRoundByWinnerStyle: Record<Style, number[]> = { balanced: [], assault: [], marksman: [], objective: [] };
const coverageTotals: Record<Style, Record<string, number>> = {
  balanced: {},
  assault: {},
  marksman: {},
  objective: {},
};

for (const r of results) {
  gamesByStyleAsA[r.styleA]++;
  gamesByStyleAsB[r.styleB]++;
  if (r.winner) winsBySide[r.winner]++;
  if (r.winner === 'A') winsByStyleAsA[r.styleA]++;
  if (r.winner === 'B') winsByStyleAsB[r.styleB]++;
  marginSum += r.margin;
  const winnerStyle = r.winner === 'A' ? r.styleA : r.winner === 'B' ? r.styleB : null;
  if (winnerStyle) {
    marginByWinnerStyle[winnerStyle].push(r.margin);
    // "how quickly they win": first round after which the eventual VP leader
    // never lost the lead again (Mission 1's length is fixed at 5 Rounds —
    // there's no early-elimination win — so this is the best proxy for pace).
    let stableFrom = r.trajectory.length ? r.trajectory[r.trajectory.length - 1]!.round : r.rounds;
    for (let i = r.trajectory.length - 1; i >= 0; i--) {
      if (r.trajectory[i]!.leader === r.winner) stableFrom = r.trajectory[i]!.round;
      else break;
    }
    leadRoundByWinnerStyle[winnerStyle].push(stableFrom);
  }
  for (const side of ['A', 'B'] as SideId[]) {
    const style = side === 'A' ? r.styleA : r.styleB;
    for (const [k, v] of Object.entries(r.coverage[side])) {
      coverageTotals[style][k] = (coverageTotals[style][k] ?? 0) + v;
    }
  }
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);

console.log(`\n--- Side win rate ---`);
console.log(`  Side A (Germans): ${winsBySide.A}/${results.length}`);
console.log(`  Side B (Soviets): ${winsBySide.B}/${results.length}`);
console.log(`  Average VP margin across all games: ${(marginSum / results.length).toFixed(2)}`);

console.log(`\n--- Style win rate (combined across both sides played) ---`);
for (const s of STYLES) {
  const gamesPlayed = gamesByStyleAsA[s] + gamesByStyleAsB[s];
  const wins = winsByStyleAsA[s] + winsByStyleAsB[s];
  console.log(
    `  ${s.padEnd(9)}: ${wins}/${gamesPlayed} wins (as A: ${winsByStyleAsA[s]}/${gamesByStyleAsA[s]}, as B: ${winsByStyleAsB[s]}/${gamesByStyleAsB[s]}) ` +
      `| avg margin when winning: ${avg(marginByWinnerStyle[s]).toFixed(2)} | avg round lead stabilized: ${avg(leadRoundByWinnerStyle[s]).toFixed(2)}`,
  );
}

console.log(`\n--- Action-mix per style (summed over all games played, either side) ---`);
for (const s of STYLES) {
  const c = coverageTotals[s];
  console.log(`  ${s.padEnd(9)}: ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

process.exitCode = totalViolations > 0 ? 1 : 0;
