/**
 * 1000-game self-play analysis harness — third round, follow-up to
 * scripts/selfplay.ts (25 games) and scripts/selfplay500.ts (500 games,
 * added Group Actions). Same independent-rule-oracle technique as
 * scripts/conformance.ts throughout. New in this round, per the user's
 * explicit ask ("use a strategy for one side that seems better for them
 * more often... keep the random play in some of the games as a control
 * group"):
 *
 *   - A 180-game CONTROL block: every heuristic-vs-random / random-vs-
 *     heuristic / random-vs-random pairing, uniform, unchanged from the
 *     500-game report's shape — still the rules-exerciser/control group.
 *   - An 820-game WEIGHTED block: each side's style is independently drawn
 *     from a distribution biased toward whichever heuristic performed best
 *     FOR THAT SIDE in the 500-game report (Germans skew Assault/Balanced;
 *     Soviets skew Balanced/Marksman), not a single fixed strategy — "more
 *     often," not "always," so there's still cross-matchup data to learn
 *     from.
 *
 *   npx tsx scripts/selfplay1000.ts
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
  vpForRound,
  vpPerKillFor,
  vpMargin,
  isValidSupporter,
  RALLY_AP_COST,
  legalEntryHexes,
} from '../src/engine';
import { lineDraw } from '../src/engine/hex';
import { TERRAIN } from '../src/data/terrainTypes';
import { FOOT_HIT_MARKERS } from '../src/data/hitMarkers';
import { MISSION_1 } from '../src/data/missions/mission1';
import { hexIdForLabel } from '../src/data/maps/mission1';
import type { Action, GameEvent, GameState, HexId, SideId, Unit, UnitId } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Independent re-derivations from the rules + data (unchanged oracle, copied
// from scripts/selfplay.ts / scripts/conformance.ts).
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

/** §17.6: a Unit that built a Hasty Defense (a per-Unit marker, not a Hex
 *  feature) gets +1 DR from any direction until it Moves/Pivots strips it. */
function hastyDr(tgt: Unit): number {
  return tgt.hastyDefense ? 1 : 0;
}

function expectFire(state: GameState, atk: Unit, tgt: Unit, arBonus = 0) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const dist = distance(parseHexId(atk.hexId), parseHexId(tgt.hexId));
  const rm = rangeMod(dist, ae.range);
  if (rm === null) return null;
  const { elevAr, elevDr } = elevationCombatMods(state, atk.hexId, tgt.hexId);
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + rm + elevAr + arBonus;
  const inFront = inArc(tgt.hexId, tgt.facing, atk.hexId);
  const defense = inFront ? te.front : te.flank;
  const tHex = state.hexes[tgt.hexId]!;
  const dr = defense + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0) + myWallDM(state, atk.hexId, tgt.hexId) + elevDr + hastyDr(tgt);
  return { ar, dr, hitNumber: dr - ar, isFlank: !inFront, apToFire: ae.apToFire };
}

function expectCC(state: GameState, atk: Unit, tgt: Unit, arBonus = 0) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const whiteBox = !!state.templates[atk.templateId]!.whiteBoxFp;
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + (whiteBox ? -2 : 4) + arBonus;
  const tHex = state.hexes[tgt.hexId]!;
  const dr = te.flank + TERRAIN[tHex.terrain].dm + (tHex.features.smoke ?? 0) + hastyDr(tgt);
  return { ar, dr, hitNumber: dr - ar, apToFire: ae.apToFire };
}

/** §3.2: any number of CAPs may shift a d10/d6 roll, clamped to ±2. */
function clampCapMod(n: number): number {
  return Math.max(-2, Math.min(2, Math.trunc(n)));
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

/** §10.11: +1AP if ANY member acted (was Stressed) on the previous Turn. */
function groupStressExp(units: Unit[]): number {
  return units.some((u) => u.stressed) ? 1 : 0;
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
      return RALLY_AP_COST;
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
// Small deterministic PRNG for the AI's own choices (random style + tie
// breaks) — separate from the engine's own seeded RNG in GameState, so the
// AI's "coin flips" never touch the game's real dice stream.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Group-Action construction helpers.
// ---------------------------------------------------------------------------

function connectedClusters(units: Unit[]): Unit[][] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const remaining = new Set(units.map((u) => u.id));
  const clusters: Unit[][] = [];
  while (remaining.size) {
    const startId: UnitId = remaining.values().next().value!;
    remaining.delete(startId);
    const cluster = [byId.get(startId)!];
    const stack = [byId.get(startId)!];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const otherId of [...remaining]) {
        const other = byId.get(otherId)!;
        if (distance(parseHexId(cur.hexId), parseHexId(other.hexId)) <= 1) {
          remaining.delete(otherId);
          cluster.push(other);
          stack.push(other);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function largestCluster(units: Unit[]): Unit[] {
  const clusters = connectedClusters(units);
  return clusters.reduce((a, b) => (b.length > a.length ? b : a), [] as Unit[]);
}

/** Assign a whole reinforcement wave to one connected chain of entry Hexes
 *  (§4.12 Group entry), stacking extra members on the first Hex if the
 *  candidate area can't fit them all as a spread-out chain. */
function pickConnectedEntryHexes(state: GameState, waveIds: UnitId[]): HexId[] | null {
  const r0 = state.reinforcements.find((r) => r.id === waveIds[0]);
  if (!r0) return null;
  const candidates = legalEntryHexes(state, r0);
  if (!candidates.length) return null;
  const chosen: HexId[] = [candidates[0]!];
  const remaining = candidates.slice(1);
  for (let i = 1; i < waveIds.length; i++) {
    const idx = remaining.findIndex((cand) => chosen.some((c) => distance(parseHexId(c), parseHexId(cand)) <= 1));
    if (idx >= 0) {
      chosen.push(remaining[idx]!);
      remaining.splice(idx, 1);
    } else {
      chosen.push(chosen[0]!); // stack extra members on the first entry Hex
    }
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Five strategies. Four are the deterministic heuristics from selfplay.ts,
// now Group-Action-aware; "random" samples uniformly across every legal
// individual Action AND the constructed Group-Action candidates.
// ---------------------------------------------------------------------------

type Style = 'balanced' | 'assault' | 'marksman' | 'objective' | 'random';
const STYLES: Style[] = ['balanced', 'assault', 'marksman', 'objective', 'random'];
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

function moveScoreFor(style: Style, toHexId: HexId, enemies: Unit[]): number {
  if (!enemies.length) return 0;
  if (style === 'objective') return -distance(parseHexId(toHexId), parseHexId(OBJECTIVE_HEX));
  if (style === 'marksman') {
    const d = Math.min(...enemies.map((e) => distance(parseHexId(toHexId), parseHexId(e.hexId))));
    return d <= 1 ? -100 - d : -d;
  }
  return -Math.min(...enemies.map((e) => distance(parseHexId(toHexId), parseHexId(e.hexId))));
}

function chooseAction(state: GameState, styleOf: Record<SideId, Style>, rand: () => number): Action {
  const side = state.currentSide;
  const style = styleOf[side];
  const enemies = Object.values(state.units).filter((e) => e.side !== side);
  const allActs = legalActions(state);
  const isFresh = (a: Action) => {
    const id = actorId(a);
    return id != null && state.units[id]?.status === 'fresh';
  };

  // --- Reinforcements: batch a whole ready wave into one Group Entry ------
  // (§4.12) whenever possible — mirrors the live UI's "Enter now." "random"
  // sometimes enters a single Unit instead, to also exercise that path.
  const readyByWave = new Map<string, typeof state.reinforcements>();
  for (const r of state.reinforcements) {
    if (r.side !== side || state.round < r.earliestRound) continue;
    const arr = readyByWave.get(r.waveId) ?? [];
    arr.push(r);
    readyByWave.set(r.waveId, arr);
  }
  const readyWaves = [...readyByWave.values()];
  if (readyWaves.length) {
    const wave = readyWaves[0]!;
    const single = style === 'random' && rand() < 0.35;
    if (single || wave.length === 1) {
      const target = wave[0]!;
      const hexId = pickConnectedEntryHexes(state, [target.id])?.[0];
      if (hexId) return { type: 'ENTER', placements: [{ unitId: target.id, hexId, facing: target.facing }] };
    }
    const ids = wave.map((r) => r.id);
    const hexes = pickConnectedEntryHexes(state, ids);
    if (hexes) {
      return {
        type: 'ENTER',
        placements: wave.map((r, i) => ({ unitId: r.id, hexId: hexes[i]!, facing: r.facing })),
      };
    }
  }

  const acts = allActs.filter(isFresh);
  const cc = acts.filter((a): a is Extract<Action, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT');
  const fires = acts.filter((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE');
  const rallies = acts.filter((a): a is Extract<Action, { type: 'RALLY' }> => a.type === 'RALLY');
  const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  const pivots = acts.filter((a): a is Extract<Action, { type: 'PIVOT' }> => a.type === 'PIVOT');
  const stalls = acts.filter((a): a is Extract<Action, { type: 'STALL' }> => a.type === 'STALL');

  const ccScore = (a: { attackerId: string; targetId: string }) =>
    -expectCC(state, state.units[a.attackerId]!, state.units[a.targetId]!).hitNumber;
  const fireScore = (a: { attackerId: string; targetId: string }) => {
    const ex = expectFire(state, state.units[a.attackerId]!, state.units[a.targetId]!);
    return ex ? -ex.hitNumber : -Infinity;
  };

  /** Upgrade a chosen (leaderId, targetId) solo attack into a Group Attack if
   *  any currently-Fresh, same-side Unit qualifies as a supporter (§10.6). */
  const groupUpgrade = (leaderId: UnitId, targetId: UnitId): Action => {
    const leader = state.units[leaderId]!;
    const target = state.units[targetId]!;
    const supporterIds = Object.values(state.units)
      .filter((u) => u.side === side && u.id !== leaderId && u.status === 'fresh')
      .filter((u) => isValidSupporter(state, leader, u, target))
      .map((u) => u.id);
    if (supporterIds.length === 0) {
      return target.hexId === leader.hexId
        ? { type: 'CLOSE_COMBAT', attackerId: leaderId, targetId }
        : { type: 'FIRE', attackerId: leaderId, targetId };
    }
    return { type: 'GROUP_ATTACK', leaderId, supporterIds, targetId };
  };

  if (style === 'random') {
    const candidates: Action[] = [...allActs];
    const freshUnits = Object.values(state.units).filter((u) => u.side === side && u.status === 'fresh');
    const moveCluster = largestCluster(freshUnits.filter((u) => moves.some((m) => m.unitId === u.id)));
    if (moveCluster.length >= 2) {
      candidates.push({
        type: 'GROUP_MOVE',
        moves: moveCluster.map((u) => ({ unitId: u.id, toHexId: moves.find((m) => m.unitId === u.id)!.toHexId })),
      });
    }
    if (fires.length) {
      const f = fires[Math.floor(rand() * fires.length)]!;
      candidates.push(groupUpgrade(f.attackerId, f.targetId));
    }
    if (cc.length) {
      const c = cc[Math.floor(rand() * cc.length)]!;
      candidates.push(groupUpgrade(c.attackerId, c.targetId));
    }
    const rallyCluster = largestCluster(freshUnits.filter((u) => rallies.some((r) => r.unitId === u.id)));
    if (rallyCluster.length >= 2) {
      candidates.push({ type: 'GROUP_RALLY', unitIds: rallyCluster.map((u) => u.id) });
    }
    return candidates[Math.floor(rand() * candidates.length)]!;
  }

  // --- Deterministic heuristic styles --------------------------------------
  const takeCombat = (): Action | null => {
    const pick = (list: { attackerId: string; targetId: string }[], score: (a: any) => number) =>
      bestBy(list, score);
    if (style === 'marksman') {
      const f = pick(fires, fireScore);
      if (f) return groupUpgrade(f.attackerId, f.targetId);
      const c = pick(cc, ccScore);
      if (c) return groupUpgrade(c.attackerId, c.targetId);
      return null;
    }
    const c = pick(cc, ccScore);
    if (c) return groupUpgrade(c.attackerId, c.targetId);
    const f = pick(fires, fireScore);
    if (f) return groupUpgrade(f.attackerId, f.targetId);
    return null;
  };
  const combat = takeCombat();
  if (combat) return combat;

  if (rallies.length) {
    const freshUnits = Object.values(state.units).filter((u) => u.side === side && u.status === 'fresh');
    const rallyCluster = largestCluster(freshUnits.filter((u) => rallies.some((r) => r.unitId === u.id)));
    if (rallyCluster.length >= 2) return { type: 'GROUP_RALLY', unitIds: rallyCluster.map((u) => u.id) };
    return rallies[0]!;
  }

  if (moves.length) {
    const freshUnits = Object.values(state.units).filter((u) => u.side === side && u.status === 'fresh');
    const moveCluster = largestCluster(freshUnits.filter((u) => moves.some((m) => m.unitId === u.id)));
    if (moveCluster.length >= 2) {
      const memberMoves = moveCluster.map((u) => {
        const candidates = moves.filter((m) => m.unitId === u.id);
        const best =
          style === 'assault'
            ? bestBy(candidates, (a) => (enemies.some((e) => e.hexId === a.toHexId) ? 1000 : moveScoreFor(style, a.toHexId, enemies)))!
            : bestBy(candidates, (a) => moveScoreFor(style, a.toHexId, enemies))!;
        return { unitId: u.id, toHexId: best.toHexId };
      });
      return { type: 'GROUP_MOVE', moves: memberMoves };
    }
    if (style === 'assault') {
      const onto = moves.filter((a) => enemies.some((e) => e.hexId === a.toHexId));
      if (onto.length) return onto[0]!;
    }
    return bestBy(moves, (a) => moveScoreFor(style, a.toHexId, enemies))!;
  }

  if (pivots.length || stalls.length) return { type: 'PASS' }; // heuristics never bother pivoting/stalling
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
  groupEntryUsed: { A: boolean; B: boolean };
}

function playGame(seed: number, styleA: Style, styleB: Style): GameResult {
  let state = initGame({ ...MISSION_1, seed });
  const styleOf: Record<SideId, Style> = { A: styleA, B: styleB };
  const rand = mulberry32(seed * 2654435761);
  const violations: Violation[] = [];
  const coverage = { A: {} as Record<string, number>, B: {} as Record<string, number> };
  const bump = (side: SideId, k: string) => (coverage[side][k] = (coverage[side][k] ?? 0) + 1);
  const trajectory: RoundSnapshot[] = [];
  const groupEntryUsed = { A: false, B: false };

  let steps = 0;
  while (state.phase === 'playing' && steps < 10000) {
    const pre = state;
    const action = chooseAction(pre, styleOf, rand);
    const aStr = JSON.stringify(action);
    const check = (cond: boolean, section: string, msg: string) => {
      if (!cond) violations.push({ section, msg, round: pre.round, action: aStr });
    };

    // Pre-action invariants: solo Actions must be in legalActions(); Group
    // Actions are checked structurally instead (legalActions doesn't
    // enumerate them — the caller composes membership, same as the real UI).
    if (!['GROUP_MOVE', 'GROUP_ATTACK', 'GROUP_RALLY'].includes(action.type)) {
      check(legalActions(pre).some((x) => actionEq(x, action)), '2.2', `AI chose an action not in legalActions: ${aStr}`);
    }

    // "random" style samples raw legalActions() output, which — unlike every
    // heuristic style's own hand-built actions — legitimately includes CAP
    // cost-reduce/dice-mod variants (§3.2/§3.3: a Fresh Unit may deliberately
    // spend CAPs on its own action, not just a Spent one buying its way to
    // 0AP). Both fields must be folded into the expected cost/CAP spend, or
    // every such pick reads as a false "fresh action spent CAP" violation.
    const aId = actorId(action);
    const actor = aId ? pre.units[aId] : null;
    const expStress = actor?.stressed ? 1 : 0;
    const requestedReduce = 'capCostReduce' in action ? Math.max(0, Math.trunc((action as any).capCostReduce ?? 0)) : 0;
    const requestedDiceMod = 'capDiceMod' in action ? clampCapMod((action as any).capDiceMod ?? 0) : 0;
    const costBeforeReduce = aId ? expectBase(pre, action) + expStress : 0;
    const capsSpentForCost = Math.min(requestedReduce, Math.max(0, costBeforeReduce));
    const expCost = aId ? Math.max(0, costBeforeReduce - capsSpentForCost) : 0;
    const expCapNeeded = capsSpentForCost + Math.abs(requestedDiceMod);
    const preCap = { A: pre.players.A.capCurrent, B: pre.players.B.capCurrent };

    const firePeek = action.type === 'FIRE' ? rollStackFire(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!.hexId, requestedDiceMod) : null;
    const ccPeek = action.type === 'CLOSE_COMBAT' ? rollCloseCombat(pre, pre.units[action.attackerId]!, pre.units[action.targetId]!, requestedDiceMod) : null;
    const rallyPeek = action.type === 'RALLY' ? rollRally(pre, pre.units[action.unitId]!, requestedDiceMod) : null;

    const res = reduce(pre, action);
    if (res.events.length === 1 && res.events[0]?.type === 'illegal') {
      violations.push({ section: '-', msg: `reduce rejected an AI-composed action: ${res.events[0]?.text}`, round: pre.round, action: aStr });
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
      check(post.players[side].capCurrent === preCap[side] - expCapNeeded, '3.3', `CAP spend engine ${preCap[side] - post.players[side].capCurrent} != expected ${expCapNeeded} (${aStr})`);
      const sp = parseSpent(res.events);
      if (expCost > 0) {
        check(!!sp, '2.5', `expected a Spent Check log for ${aStr}`);
        if (sp) {
          check(sp.cost === expCost, '2.4', `Spent Check cost engine ${sp.cost} != expected ${expCost}`);
          check(sp.fresh === sp.roll > sp.cost, '2.5', `Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
          const postActor = post.units[id];
          if (postActor) check(postActor.status === (sp.fresh ? 'fresh' : 'spent'), '2.5', `actor status ${postActor.status} != Spent Check result`);
        }
      } else {
        check(sp === null, '3.4', `0AP action (via CAP reduce) should make no Spent Check`);
      }
      const postActor = post.units[id];
      if (postActor) check(postActor.stressed === true, '2.6', `${id} should be Stressed after acting`);
      const stressedSame = Object.values(post.units).filter((u) => u.side === side && u.stressed);
      check(stressedSame.length <= 1, '2.6', `side ${side} has ${stressedSame.length} stressed units (max 1, solo action)`);
    };

    /** §10.10/§10.11: ONE Group Spent Check; on failure EVERY member goes
     *  Spent; ALL members (and only them) are Stressed regardless of result.
     *  `expGroupCost` is independently recomputed by each case below (from
     *  the pre-state member list), NOT derived from `expectBase`/`actorId`
     *  (those only understand solo Actions and would silently read 0). */
    const verifyGroupEconomy = (side: SideId, memberIds: UnitId[], expGroupCost: number) => {
      check(post.players[side].capCurrent === preCap[side], '3.3', `fresh group action should spend no CAP (${aStr})`);
      const sp = parseSpent(res.events);
      if (expGroupCost > 0) {
        check(!!sp, '2.5', `expected a Group Spent Check log for ${aStr}`);
        if (sp) {
          check(sp.cost === expGroupCost, '2.4', `Group Spent Check cost engine ${sp.cost} != expected ${expGroupCost}`);
          check(sp.fresh === sp.roll > sp.cost, '2.5', `Group Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
          for (const id of memberIds) {
            const postActor = post.units[id];
            if (postActor) check(postActor.status === (sp.fresh ? 'fresh' : 'spent'), '2.5', `${id} status != Group Spent Check result`);
          }
        }
      } else {
        check(sp === null, '4.12', `0AP group action should make no Spent Check`);
      }
      for (const id of memberIds) {
        const postActor = post.units[id];
        if (postActor) check(postActor.stressed === true, '10.11', `${id} should be Stressed after Group action`);
      }
      const stressedSide = Object.values(post.units).filter((u) => u.side === side && u.stressed);
      check(
        stressedSide.length === memberIds.filter((id) => post.units[id]).length,
        '10.11',
        `side ${side} should have exactly the Group's ${memberIds.length} members Stressed, has ${stressedSide.length}`,
      );
    };

    switch (action.type) {
      case 'MOVE': {
        check(post.units[action.unitId]?.hexId === action.toHexId, '4.5', 'unit did not move to target hex');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'MOVE');
        break;
      }
      case 'PIVOT': {
        check(post.units[action.unitId]?.facing === action.facing, '4.5', 'pivot did not set facing');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'PIVOT');
        break;
      }
      case 'STALL': {
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'STALL');
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
          // §3.2: CAPs lower the Hit Number before rolling, not the dice total.
          const expHitNumber = exp.hitNumber - requestedDiceMod;
          check(roll.hitNumber === expHitNumber, '6.8', `Hit Number: engine ${roll.hitNumber} != expected ${expHitNumber} (base ${exp.hitNumber}, capDiceMod ${requestedDiceMod})`);
          const myTotal = roll.dice[0] + roll.dice[1];
          check(roll.total === myTotal, '6.8', `total: engine ${roll.total} != ${myTotal}`);
          check(roll.hit === myTotal >= expHitNumber, '6.8', `hit: engine ${roll.hit} != ${myTotal >= expHitNumber}`);
          check(roll.critical === myTotal >= expHitNumber + 4, '6.8', `crit: engine ${roll.critical} != ${myTotal >= expHitNumber + 4}`);
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
        const expHitNumber = exp.hitNumber - requestedDiceMod;
        check(peek.ar === exp.ar, '6.11', `CC AR: engine ${peek.ar} != expected ${exp.ar}`);
        check(peek.dr === exp.dr, '6.11', `CC DR: engine ${peek.dr} != expected ${exp.dr}`);
        check(peek.hitNumber === expHitNumber, '6.11', `CC Hit Number: engine ${peek.hitNumber} != expected ${expHitNumber} (capDiceMod ${requestedDiceMod})`);
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
        const myTotal = peek.dice[0] + peek.dice[1] + mod + requestedDiceMod;
        check(peek.target === def.rally, '7.7', `rally number engine ${peek.target} != ${def.rally}`);
        check(peek.total === myTotal, '7.7', `rally total engine ${peek.total} != ${myTotal} (mods ${mod}, capDiceMod ${requestedDiceMod})`);
        check(peek.success === myTotal >= def.rally, '7.7', 'rally success mismatch');
        const postU = post.units[action.unitId];
        if (myTotal >= def.rally) check(!!postU && postU.hitMarkers.length === 0, '7.7', 'successful rally should remove the marker');
        else check(!!postU && postU.hitMarkers.length === preU.hitMarkers.length, '7.7', 'failed rally should keep the marker');
        verifyEconomy(preU.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'RALLY');
        break;
      }
      case 'GROUP_MOVE': {
        const memberIds = action.moves.map((m) => m.unitId);
        const preMembers = memberIds.map((id) => pre.units[id]!);
        check(memberIds.every((id) => pre.units[id]?.side === pre.currentSide), '10.2', 'group members must be the acting side');
        const hexIds = preMembers.map((u) => u.hexId);
        const connected = hexIds.length <= 1 || hexIds.every((h, i) => i === 0 || hexIds.slice(0, i).some((h2) => distance(parseHexId(h), parseHexId(h2)) <= 1));
        check(connected, '10.2', 'group must begin continuously adjacent');
        let maxMove = 0;
        for (const m of action.moves) {
          if (m.toHexId == null) continue;
          maxMove = Math.max(maxMove, expectMoveCost(pre, pre.units[m.unitId]!, m.toHexId));
          check(post.units[m.unitId]?.hexId === m.toHexId, '4.5', `${m.unitId} did not move to target hex in Group Move`);
        }
        const expGroupCost = maxMove + groupStressExp(preMembers); // §10.4/§10.11
        verifyGroupEconomy(pre.currentSide, memberIds, expGroupCost);
        handover(true);
        bump(pre.currentSide, 'GROUP_MOVE');
        break;
      }
      case 'GROUP_ATTACK': {
        const leader = pre.units[action.leaderId]!;
        const target = pre.units[action.targetId]!;
        const isCC = target.hexId === leader.hexId;
        const memberIds = [action.leaderId, ...action.supporterIds];
        const preMembers = memberIds.map((id) => pre.units[id]!);
        for (const supId of action.supporterIds) {
          check(isValidSupporter(pre, leader, pre.units[supId]!, target), '10.6', `${supId} is not a valid supporter`);
        }
        const arBonus = action.supporterIds.length;
        // Re-derive via the same dice the engine actually rolled, by peeking
        // the identical roll function with the same pre-state + arBonus.
        if (isCC) {
          const peek = rollCloseCombat(pre, leader, target, 0, arBonus);
          const exp = expectCC(pre, leader, target, arBonus);
          check(peek.ar === exp.ar, '6.11', `Group CC AR: engine ${peek.ar} != expected ${exp.ar}`);
          check(peek.hitNumber === exp.hitNumber, '6.11', `Group CC Hit Number: engine ${peek.hitNumber} != expected ${exp.hitNumber}`);
          verifyHit(pre, post, action.targetId, peek.hit, peek.critical, check);
        } else {
          const stack = rollStackFire(pre, leader, target.hexId, 0, arBonus);
          for (const { targetId, roll } of stack.rolls) {
            const exp = expectFire(pre, leader, pre.units[targetId]!, arBonus);
            if (!exp) continue;
            check(roll.ar === exp.ar, '6.1', `Group Fire AR: engine ${roll.ar} != expected ${exp.ar} (arBonus ${arBonus})`);
            check(roll.hitNumber === exp.hitNumber, '6.8', `Group Fire Hit Number: engine ${roll.hitNumber} != expected ${exp.hitNumber}`);
            verifyHit(pre, post, targetId, roll.hit, roll.critical, check);
          }
        }
        const expGroupCost = myEff(pre, leader).apToFire + groupStressExp(preMembers); // §10.8/§10.11
        verifyGroupEconomy(pre.currentSide, memberIds, expGroupCost);
        handover(true);
        bump(pre.currentSide, 'GROUP_ATTACK');
        break;
      }
      case 'GROUP_RALLY': {
        const memberIds = action.unitIds;
        const preMembers = memberIds.map((id) => pre.units[id]!);
        for (const id of memberIds) {
          const preU = pre.units[id]!;
          const def = FOOT_HIT_MARKERS[preU.hitMarkers[0]!];
          let mod = 0;
          const hex = pre.hexes[preU.hexId]!;
          if (TERRAIN[hex.terrain].isCover) mod += 1;
          for (const o of Object.values(pre.units)) {
            if (o.id !== preU.id && o.side === preU.side && o.hexId === preU.hexId && o.hitMarkers.length === 0) mod += 1;
          }
          const postU = post.units[id];
          check(!!postU, '7.4', `${id} should still exist after a Group Rally`);
          if (postU) check(postU.hitMarkers.length === 0 || postU.hitMarkers.length === preU.hitMarkers.length, '7.7', `${id}'s marker count should be 0 (rallied) or unchanged (failed)`);
        }
        const expGroupCost = RALLY_AP_COST + groupStressExp(preMembers); // §10.9/§10.11
        verifyGroupEconomy(pre.currentSide, memberIds, expGroupCost);
        handover(true);
        bump(pre.currentSide, 'GROUP_RALLY');
        break;
      }
      case 'ENTER': {
        for (const p of action.placements) {
          check(post.units[p.unitId]?.hexId === p.hexId, '4.12', 'entered unit should be at its chosen hex');
        }
        const memberIds = action.placements.map((p) => p.unitId);
        const stressedSide = Object.values(post.units).filter((u) => u.side === pre.currentSide && u.stressed);
        check(
          stressedSide.length === memberIds.length,
          '2.6',
          `entry should Stress exactly the ${memberIds.length} entered Unit(s), got ${stressedSide.length}`,
        );
        check(parseSpent(res.events) === null, '4.12', 'entry makes no Spent Check');
        if (memberIds.length > 1) groupEntryUsed[pre.currentSide] = true;
        handover(true);
        bump(pre.currentSide, memberIds.length > 1 ? 'ENTER(group)' : 'ENTER');
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
    groupEntryUsed,
  };
}

// ---------------------------------------------------------------------------
// Build the 1000-game schedule: a 180-game control block (every pairing
// touching "random", uniform) + an 820-game win-weighted block (each side's
// style drawn from a distribution biased toward its own best performer from
// the 500-game report).
// ---------------------------------------------------------------------------

const HEURISTICS: Style[] = ['balanced', 'assault', 'marksman', 'objective'];
// 500-game report: as Germans, Assault 93% > Balanced 90% > Marksman 88% > Objective 84%.
const WEIGHTS_A: Record<Style, number> = { assault: 0.35, balanced: 0.3, marksman: 0.2, objective: 0.15, random: 0 };
// 500-game report: as Soviets, Balanced 35% > Marksman 33% > Objective 28% > Assault 27%.
const WEIGHTS_B: Record<Style, number> = { balanced: 0.35, marksman: 0.3, objective: 0.2, assault: 0.15, random: 0 };

function weightedPool(weights: Record<Style, number>, total: number): Style[] {
  const pool: Style[] = [];
  for (const s of HEURISTICS) {
    const n = Math.round(weights[s] * total);
    for (let i = 0; i < n; i++) pool.push(s);
  }
  while (pool.length < total) pool.push(HEURISTICS[pool.length % HEURISTICS.length]!);
  return pool.slice(0, total);
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const games: { seed: number; styleA: Style; styleB: Style; block: 'control' | 'weighted' }[] = [];
let seedCounter = 300001;

// Control block (180 games): every pairing where at least one side is random.
for (const sa of [...HEURISTICS, 'random'] as Style[]) {
  for (const sb of [...HEURISTICS, 'random'] as Style[]) {
    if (sa !== 'random' && sb !== 'random') continue;
    for (let k = 0; k < 20; k++) games.push({ seed: seedCounter++, styleA: sa, styleB: sb, block: 'control' });
  }
}

// Weighted block (820 games): independent win-weighted draws per side, shuffled.
const scheduleRand = mulberry32(300000);
const poolA = shuffle(weightedPool(WEIGHTS_A, 820), scheduleRand);
const poolB = shuffle(weightedPool(WEIGHTS_B, 820), scheduleRand);
for (let i = 0; i < 820; i++) games.push({ seed: seedCounter++, styleA: poolA[i]!, styleB: poolB[i]!, block: 'weighted' });

console.log(`Conflict of Heroes — 1000-game self-play analysis (Mission 1 "Partisans", v3 rules, win-weighted styles)`);
console.log(`Scheduled ${games.length} games (180 control + 820 win-weighted)...\n`);

const results = games.map((g) => ({ ...playGame(g.seed, g.styleA, g.styleB), block: g.block }));

// ---------------------------------------------------------------------------
// Report (aggregate only — 1000 rows is too much for a console; violations
// are printed in full if any are found).
// ---------------------------------------------------------------------------

let totalViolations = 0;
const violationLines: string[] = [];
for (const r of results) {
  totalViolations += r.violations.length;
  for (const v of r.violations) {
    violationLines.push(`  seed ${r.seed} A=${r.styleA} B=${r.styleB} | §${v.section} R${v.round} [${v.action}] — ${v.msg}`);
  }
}
console.log(`TOTAL rule violations across ${results.length} games: ${totalViolations}`);
if (totalViolations > 0) {
  console.log('\nViolations (reproduce with the seed + style pairing shown):');
  for (const line of violationLines.slice(0, 200)) console.log(line);
}

const totalSteps = results.reduce((n, r) => n + r.steps, 0);
console.log(`Total Actions played & verified: ${totalSteps}`);

const winsBySide: Record<SideId, number> = { A: 0, B: 0 };
const winsByStyleAsA: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0, random: 0 };
const winsByStyleAsB: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0, random: 0 };
const gamesByStyleAsA: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0, random: 0 };
const gamesByStyleAsB: Record<Style, number> = { balanced: 0, assault: 0, marksman: 0, objective: 0, random: 0 };
let marginSum = 0;
const marginByWinnerStyle: Record<Style, number[]> = { balanced: [], assault: [], marksman: [], objective: [], random: [] };
const leadRoundByWinnerStyle: Record<Style, number[]> = { balanced: [], assault: [], marksman: [], objective: [], random: [] };
const coverageTotals: Record<Style, Record<string, number>> = {
  balanced: {}, assault: {}, marksman: {}, objective: {}, random: {},
};
const matchupWins: Record<string, { aWins: number; total: number }> = {};
let groupEntryGames = 0;

for (const r of results) {
  gamesByStyleAsA[r.styleA]++;
  gamesByStyleAsB[r.styleB]++;
  if (r.winner) winsBySide[r.winner]++;
  if (r.winner === 'A') winsByStyleAsA[r.styleA]++;
  if (r.winner === 'B') winsByStyleAsB[r.styleB]++;
  marginSum += r.margin;
  if (r.groupEntryUsed.A || r.groupEntryUsed.B) groupEntryGames++;
  const winnerStyle = r.winner === 'A' ? r.styleA : r.winner === 'B' ? r.styleB : null;
  if (winnerStyle) {
    marginByWinnerStyle[winnerStyle].push(r.margin);
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
  const key = `${r.styleA} vs ${r.styleB}`;
  const m = matchupWins[key] ?? { aWins: 0, total: 0 };
  m.total++;
  if (r.winner === 'A') m.aWins++;
  matchupWins[key] = m;
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);

console.log(`\n--- Side win rate ---`);
console.log(`  Side A (Germans): ${winsBySide.A}/${results.length} (${((100 * winsBySide.A) / results.length).toFixed(1)}%)`);
console.log(`  Side B (Soviets): ${winsBySide.B}/${results.length} (${((100 * winsBySide.B) / results.length).toFixed(1)}%)`);
console.log(`  Average VP margin: ${(marginSum / results.length).toFixed(2)}`);
console.log(`  Games where a Group Entry (>1 Unit, one Action) was used: ${groupEntryGames}/${results.length}`);

console.log(`\n--- Control block (180 games, uniform, unweighted — rules-exerciser) ---`);
const control = results.filter((r) => r.block === 'control');
const controlAWins = control.filter((r) => r.winner === 'A').length;
console.log(`  Side A: ${controlAWins}/${control.length} (${((100 * controlAWins) / control.length).toFixed(1)}%)`);

console.log(`\n--- Weighted block (820 games, each side biased toward its own best 500-game performer) ---`);
const weighted = results.filter((r) => r.block === 'weighted');
const weightedAWins = weighted.filter((r) => r.winner === 'A').length;
console.log(`  Side A: ${weightedAWins}/${weighted.length} (${((100 * weightedAWins) / weighted.length).toFixed(1)}%)`);
console.log(`  Average VP margin: ${(weighted.reduce((n, r) => n + r.margin, 0) / weighted.length).toFixed(2)}`);

console.log(`\n--- Style win rate (combined across both sides played) ---`);
for (const s of STYLES) {
  const gamesPlayed = gamesByStyleAsA[s] + gamesByStyleAsB[s];
  const wins = winsByStyleAsA[s] + winsByStyleAsB[s];
  console.log(
    `  ${s.padEnd(9)}: ${wins}/${gamesPlayed} (${((100 * wins) / gamesPlayed).toFixed(1)}%) | as A: ${winsByStyleAsA[s]}/${gamesByStyleAsA[s]} | as B: ${winsByStyleAsB[s]}/${gamesByStyleAsB[s]} | avg margin (W): ${avg(marginByWinnerStyle[s]).toFixed(2)} | avg lead-stable round: ${avg(leadRoundByWinnerStyle[s]).toFixed(2)}`,
  );
}

console.log(`\n--- Action mix per style (summed over all games played, either side) ---`);
for (const s of STYLES) {
  const c = coverageTotals[s];
  console.log(`  ${s.padEnd(9)}: ${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

console.log(`\n--- Matchup results (Side A win rate) ---`);
for (const [key, m] of Object.entries(matchupWins).sort()) {
  console.log(`  ${key.padEnd(28)}: A won ${m.aWins}/${m.total}`);
}

process.exitCode = totalViolations > 0 ? 1 : 0;
