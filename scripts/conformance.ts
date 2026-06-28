/**
 * Rules-conformance harness (M3.4).
 *
 * Auto-plays full Firefight 1 games and, for EVERY action, independently
 * re-derives the expected result straight from the rulebook and asserts the
 * engine agrees. The re-derivation deliberately does NOT call the engine's
 * cost/combat functions — it recomputes from the data tables (terrain, hit
 * markers, templates) so it is a genuine cross-check. (Geometry primitives —
 * distance / inArc / lineDraw — are shared math and are reused.)
 *
 *   npm run conformance
 *
 * Each violation is tagged with its rulebook section. Ambiguous rules where the
 * engine makes a defensible-but-unconfirmed choice are listed in
 * RULES-ASSUMPTIONS.md rather than reported as violations.
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
  neighbor,
  idOf,
} from '../src/engine';
import { lineDraw } from '../src/engine/hex';
import { TERRAIN } from '../src/data/terrainTypes';
import { FOOT_HIT_MARKERS } from '../src/data/hitMarkers';
import { FIREFIGHT_1 } from '../src/data/firefights/firefight1';
import type { Action, GameState, Unit } from '../src/engine/types';

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
  const baseFP = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + rm;
  const inFront = inArc(tgt.hexId, tgt.facing, atk.hexId); // attacker in target's front?
  const dr = inFront ? te.front : te.flank;
  const tHex = state.hexes[tgt.hexId]!;
  const dv = dr + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0) + myWallDM(state, atk.hexId, tgt.hexId);
  return { baseFP, dv, isFlank: !inFront, apToFire: ae.apToFire };
}

function expectCC(state: GameState, atk: Unit, tgt: Unit) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const whiteBox = !!state.templates[atk.templateId]!.whiteBoxFp;
  const baseFP = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + (whiteBox ? -2 : 4);
  const tHex = state.hexes[tgt.hexId]!;
  const dv = te.flank + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0);
  return { baseFP, dv, apToFire: ae.apToFire };
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
// Helpers
// ---------------------------------------------------------------------------

type Mode = 'ap' | 'opportunity' | 'invalid';

function modeOf(state: GameState, unitId: string): Mode {
  const u = state.units[unitId];
  if (!u) return 'invalid';
  if (state.players[u.side].activatedUnitId === unitId) return 'ap';
  if (u.status === 'fresh') return 'opportunity';
  return 'invalid';
}

function apPaid(pre: GameState, post: GameState, side: 'A' | 'B'): number {
  return (
    pre.players[side].ap + pre.players[side].capCurrent -
    (post.players[side].ap + post.players[side].capCurrent)
  );
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
    case 'ACTIVATE_UNIT':
    case 'MARK_SPENT':
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
// A simple AI to drive the game. style 'activate' = activate then act in AP
// mode (real combat); style 'opportunity' = act with fresh units (free, spends
// them) — together they exercise both action modes.
// ---------------------------------------------------------------------------

function nearestEnemyDist(state: GameState, u: Unit): number {
  const enemies = Object.values(state.units).filter((e) => e.side !== u.side);
  if (!enemies.length) return Infinity;
  return Math.min(...enemies.map((e) => distance(parseHexId(u.hexId), parseHexId(e.hexId))));
}

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

type Style = 'activate' | 'opportunity' | 'assault';

function chooseAction(state: GameState, style: Style): Action {
  const side = state.currentSide;
  const acts = legalActions(state);
  const player = state.players[side];
  const enemies = Object.values(state.units).filter((e) => e.side !== side);
  const towardScore = (toHexId: string) =>
    enemies.length ? -Math.min(...enemies.map((e) => distance(parseHexId(toHexId), parseHexId(e.hexId)))) : 0;
  const fireScore = (a: { attackerId: string; targetId: string }) => {
    const ex = expectFire(state, state.units[a.attackerId]!, state.units[a.targetId]!);
    return ex ? ex.baseFP - ex.dv : -Infinity;
  };

  // Close combat is always taken first (any style).
  const cc = acts.filter((a): a is Extract<Action, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT');
  if (cc.length) return bestBy(cc, (a) => { const e = expectCC(state, state.units[a.attackerId]!, state.units[a.targetId]!); return e.baseFP - e.dv; })!;

  const fires = acts.filter((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE');

  if (style === 'opportunity') {
    if (fires.length) return bestBy(fires, fireScore)!;
    const rallies = acts.filter((a) => a.type === 'RALLY');
    if (rallies.length) return rallies[0]!;
    const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
    if (moves.length) return bestBy(moves, (a) => towardScore(a.toHexId))!;
    return { type: 'PASS' };
  }

  // 'activate' and 'assault' both use activation (AP-mode coverage).
  if (!player.activatedUnitId) {
    const activations = acts.filter((a): a is Extract<Action, { type: 'ACTIVATE_UNIT' }> => a.type === 'ACTIVATE_UNIT');
    if (activations.length) return bestBy(activations, (a) => -nearestEnemyDist(state, state.units[a.unitId]!))!;
  }
  const U = player.activatedUnitId;
  const rallies = acts.filter((a) => a.type === 'RALLY' && a.unitId === U);
  if (rallies.length) return rallies[0]!;

  // Assault: prefer moving ONTO an adjacent enemy hex (forces close combat, §5.4).
  if (style === 'assault' && U) {
    const onto = acts.filter(
      (a): a is Extract<Action, { type: 'MOVE' }> =>
        a.type === 'MOVE' && a.unitId === U && enemies.some((e) => e.hexId === a.toHexId),
    );
    if (onto.length) return onto[0]!;
  }

  const fU = fires.filter((a) => a.attackerId === U);
  if (fU.length) return bestBy(fU, fireScore)!;
  const movesU = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE' && a.unitId === U);
  if (movesU.length) return bestBy(movesU, (a) => towardScore(a.toHexId))!;
  if (U) return { type: 'MARK_SPENT', unitId: U };
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

    const mode = action.type === 'MOVE' || action.type === 'FIRE' || action.type === 'CLOSE_COMBAT' ||
      action.type === 'RALLY' || action.type === 'PIVOT'
      ? modeOf(pre, (action as { unitId?: string; attackerId?: string }).unitId ?? (action as { attackerId: string }).attackerId)
      : 'invalid';

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
    check(post.players.A.ap >= 0 && post.players.B.ap >= 0, '3.0', 'AP went negative');
    check(post.players.A.capCurrent >= 0 && post.players.B.capCurrent >= 0, '3.2', 'CAP went negative');
    for (const u of Object.values(post.units)) check(u.hitMarkers.length <= 1, '7.4', `${u.id} has >1 hit marker`);

    // VP only from destroyed units this step (§2.5.1) -----------------------
    const destroyed = Object.keys(pre.units).filter((id) => !post.units[id]);
    let vpToA = 0;
    let vpToB = 0;
    for (const id of destroyed) {
      const u = pre.units[id]!;
      const vp = pre.templates[u.templateId]!.vp;
      if (otherSide(u.side) === 'A') vpToA += vp;
      else vpToB += vp;
    }
    check(post.players.A.vp - pre.players.A.vp === vpToA, '2.5.1', `Side A VP delta ${post.players.A.vp - pre.players.A.vp} != ${vpToA} from kills`);
    check(post.players.B.vp - pre.players.B.vp === vpToB, '2.5.1', `Side B VP delta ${post.players.B.vp - pre.players.B.vp} != ${vpToB} from kills`);

    const handover = (turnAction: boolean) => {
      if (post.phase !== 'playing' || post.round !== pre.round) return; // round/game ended
      if (turnAction) check(post.currentSide !== pre.currentSide, '2.2', `turn should alternate after ${action.type}`);
      else check(post.currentSide === pre.currentSide, '2.2', `${action.type} should not change the active side`);
    };
    const oppSpent = (id: string) => {
      if (mode === 'opportunity') check(!post.units[id] || post.units[id]!.status === 'spent', '3.1', `${id} opportunity action should spend it`);
    };

    switch (action.type) {
      case 'ACTIVATE_UNIT': {
        const u = post.units[action.unitId]!;
        check(post.players[u.side].activatedUnitId === action.unitId, '3.0', 'activate sets activatedUnitId');
        check(post.players[u.side].ap === 7, '3.0', 'activate grants 7 AP');
        check(u.status === 'active', '2.2', 'activated unit is active');
        handover(false);
        bump('ACTIVATE');
        break;
      }
      case 'MOVE': {
        const preU = pre.units[action.unitId]!;
        const exp = expectMoveCost(pre, preU, action.toHexId);
        const paid = apPaid(pre, post, preU.side);
        if (mode === 'ap') check(paid === exp, '5.0', `move AP cost ${paid} != expected ${exp}`);
        else check(paid === 0, '3.1', `opportunity move should be free, paid ${paid}`);
        check(post.units[action.unitId]?.hexId === action.toHexId, '5.4', 'unit did not move to target hex');
        oppSpent(action.unitId);
        handover(true);
        bump('MOVE');
        break;
      }
      case 'FIRE': {
        const attacker = pre.units[action.attackerId]!;
        const stack = firePeek!;
        // §7.5.1: one shot at a hex hits every enemy stacked there.
        check(stack.rolls.length >= 1, '7.5.1', 'fire should resolve at least one target');
        check(
          stack.rolls.some((r) => r.targetId === action.targetId),
          '7.5.1',
          'clicked target must be among the resolved stack',
        );
        for (const { targetId, roll } of stack.rolls) {
          const exp = expectFire(pre, attacker, pre.units[targetId]!);
          if (!exp) {
            check(false, '7.7', `${targetId} in fired hex should be a legal target`);
            continue;
          }
          check(roll.dv === exp.dv, '7.3', `DV: engine ${roll.dv} != expected ${exp.dv}`);
          const myAV = exp.baseFP + roll.dice[0] + roll.dice[1];
          check(roll.av === myAV, '7.2', `AV: engine ${roll.av} != expected ${myAV} (FP ${exp.baseFP}+${roll.dice[0]}+${roll.dice[1]})`);
          check(roll.hit === myAV >= exp.dv, '7.0', `hit: engine ${roll.hit} != ${myAV >= exp.dv}`);
          check(roll.critical === myAV >= exp.dv + 4, '7.0', `crit: engine ${roll.critical} != ${myAV >= exp.dv + 4}`);
          check(roll.isFlank === exp.isFlank, '7.3', `flank flag mismatch`);
          verifyHit(pre, post, targetId, roll.hit, roll.critical, check);
        }
        // The whole shot costs a single fire action (§7.5.1).
        const paid = apPaid(pre, post, attacker.side);
        const apToFire = myEff(pre, attacker).apToFire;
        if (mode === 'ap') check(paid === apToFire, '7.0', `fire AP cost ${paid} != ${apToFire}`);
        else check(paid === 0, '3.1', `opportunity fire should be free, paid ${paid}`);
        oppSpent(action.attackerId);
        handover(true);
        bump('FIRE');
        break;
      }
      case 'CLOSE_COMBAT': {
        const exp = expectCC(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!);
        const peek = ccPeek!;
        check(peek.dv === exp.dv, '7.7.3', `CC DV: engine ${peek.dv} != expected ${exp.dv} (flank+terrain)`);
        const myAV = exp.baseFP + peek.dice[0] + peek.dice[1];
        check(peek.av === myAV, '7.7.3', `CC AV: engine ${peek.av} != expected ${myAV} (FP ${exp.baseFP})`);
        check(peek.isFlank === true, '7.7.3', 'CC must resolve vs flank DR');
        verifyHit(pre, post, action.targetId, peek.hit, peek.critical, check);
        oppSpent(action.attackerId);
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
        check(peek.target === def.rally, '7.6', `rally number engine ${peek.target} != ${def.rally}`);
        check(peek.total === myTotal, '7.6.1', `rally total engine ${peek.total} != ${myTotal} (mods ${mod})`);
        check(peek.success === myTotal >= def.rally, '7.6', 'rally success mismatch');
        const postU = post.units[action.unitId];
        if (myTotal >= def.rally) check(!!postU && postU.hitMarkers.length === 0, '7.6', 'successful rally should remove the marker');
        else check(!!postU && postU.hitMarkers.length === preU.hitMarkers.length, '7.6', 'failed rally should keep the marker');
        const paid = apPaid(pre, post, preU.side);
        if (mode === 'ap') check(paid === 5, '7.6', `rally AP cost ${paid} != 5`);
        oppSpent(action.unitId);
        handover(true);
        bump('RALLY');
        break;
      }
      case 'PIVOT': {
        const paid = apPaid(pre, post, pre.units[action.unitId]!.side);
        if (mode === 'ap') check(paid === 1, '5.3', `pivot AP cost ${paid} != 1`);
        check(post.units[action.unitId]?.facing === action.facing, '5.3', 'pivot did not set facing');
        oppSpent(action.unitId);
        handover(true);
        bump('PIVOT');
        break;
      }
      case 'MARK_SPENT': {
        check(post.units[action.unitId]?.status === 'spent', '2.2', 'mark-spent did not spend the unit');
        handover(false);
        bump('MARKSPENT');
        break;
      }
      case 'STALL': {
        const paid = apPaid(pre, post, pre.currentSide);
        check(paid === 1, '2.2', `stall should cost 1, paid ${paid}`);
        handover(true);
        bump('STALL');
        break;
      }
      case 'PASS': {
        if (post.phase === 'playing' && post.round === pre.round) {
          check(post.currentSide !== pre.currentSide, '2.2', 'pass should alternate turn');
          check(post.consecutivePasses === pre.consecutivePasses + 1, '2.3', 'pass should increment the pass counter');
        }
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
  check(!postT || postT.hitMarkers.length === 1, '7.5', 'a first hit must add exactly one marker (or KIA destroys)');
}

// ---------------------------------------------------------------------------
// Scripted probe for the two actions the AI rarely takes (pivot, stall).
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
  state = reduce(state, { type: 'ACTIVATE_UNIT', unitId: u.id }).state;
  check(state.players[side].ap === 7, '3.0', 'probe: activate should grant 7 AP');

  // Pivot (1 AP, sets facing, hands over the turn).
  const apBefore = state.players[side].ap;
  const turnBefore = state.currentSide;
  const newFacing = ((u.facing + 2) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
  const rp = reduce(state, { type: 'PIVOT', unitId: u.id, facing: newFacing });
  if (rp.events[0]?.type === 'illegal') {
    check(false, '5.3', `probe: pivot rejected (${rp.events[0]?.text})`);
  } else {
    check(rp.state.units[u.id]?.facing === newFacing, '5.3', 'probe: pivot did not set facing');
    check(apBefore - rp.state.players[side].ap === 1, '5.3', 'probe: pivot should cost 1 AP');
    check(rp.state.currentSide !== turnBefore, '2.2', 'probe: pivot should hand over the turn');
    bump('PIVOT');
    state = rp.state;
  }

  // Stall by the now-active side (no activated unit → spends 1 CAP).
  const s = state.currentSide;
  const capBefore = state.players[s].capCurrent;
  const apB = state.players[s].ap;
  const rs = reduce(state, { type: 'STALL' });
  if (rs.events[0]?.type === 'illegal') {
    check(false, '2.2', `probe: stall rejected (${rs.events[0]?.text})`);
  } else {
    const paid = apB + capBefore - (rs.state.players[s].ap + rs.state.players[s].capCurrent);
    check(paid === 1, '2.2', `probe: stall should cost 1, paid ${paid}`);
    check(rs.state.currentSide !== s, '2.2', 'probe: stall should hand over the turn');
    bump('STALL');
    state = rs.state;
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
  playGame(101, 'activate'),
  playGame(202, 'opportunity'),
  playGame(303, 'assault'), // forces move-into-enemy-hex + close combat
  probe(), // pivot + stall
];
console.log('Conflict of Heroes — rules conformance audit (Firefight 1)');
for (const g of games) report(g);
const total = games.reduce((n, g) => n + g.violations.length, 0);
console.log(`\nTOTAL violations across ${games.length} games: ${total}`);
process.exitCode = total > 0 ? 1 : 0;
