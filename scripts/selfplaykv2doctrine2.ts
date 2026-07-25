/**
 * 200-game self-play harness — "German doctrine, round 2" — a FRESH,
 * explicit-waypoint German script, forked from scripts/selfplaykv2doctrine.ts
 * but deliberately NOT reusing that round's doctrine (KV2a-engagement gate,
 * sector-hash dispersal, standing rush/preservation bonuses) per this
 * round's own explicit "DON'T USE last doctrine." Same independent-rule-
 * oracle technique as scripts/conformance.ts throughout; same per-unit-type
 * + hit-heatmap + per-side move-heatmap tracking as the prior two rounds.
 *
 * User's explicit new doctrine — a literal, hex-by-hex scripted route per
 * German unit group, implemented as `waypointAction()` below, checked ahead
 * of normal combat/movement scoring whenever a unit's route isn't finished:
 *   1. Pioneer: from wherever it enters (near M01) to N01 — placing Smoke on
 *      N02 first, if not already placed — then on to O01, placing Smoke on
 *      O01 itself first, then holding there permanently once arrived.
 *   2. Flak 18 88mm + its Opel tow truck: LOAD the moment both are on the
 *      board (they enter already sharing a hex, so this is the very next
 *      action available — the engine has no "starts pre-loaded" concept for
 *      reinforcements, so one real LOAD Action is the closest honest match
 *      to "don't spend AP to do this," done immediately with nothing else
 *      interposed). The Truck then carries it via N01 to O01, where it
 *      Unloads facing the KV2a and fires with the maximum affordable CAP
 *      dice mod (up to 2, §3.2) every time it has a legal shot — "try to
 *      kill it using CAPs if necessary," no odds threshold this round.
 *   3. The four Panzers (2x IIf, IVe, 38(t)) march via N01, O01, P01, Q01,
 *      then south down column S (q=18) to its southmost Map4 hex (S12),
 *      crossing onto Map5's own S01 — ignoring combat entirely until that
 *      final waypoint is reached, then reverting to fully normal combat
 *      priority ("just try to kill and take VP").
 *   4. The two remaining Wave-1 infantry (Rifles, MG34) march to one of
 *      F07/G07/H08 (assigned by a stable per-unit-id hash, since there are 2
 *      units and 3 named hexes) — once arrived, they revert to normal
 *      behavior, with an added pull toward the KV2a's own Hex (Map5 J01,
 *      the Mission's OBJECTIVE_HEX) only if the KV2a is already destroyed;
 *      otherwise genuinely "do as you wish" — no override at all.
 * The Soviet side is completely untouched — no KV2a-preservation behavior
 * this round, plain default 5-style AI, matching "don't use last doctrine."
 *
 *   npx tsx scripts/selfplaykv2doctrine2.ts
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
  hasLOS,
  hastyDefenseDrBonus,
  legalSetupHexes,
  smokeAttackPenalty,
  smokeDefenseBonus,
  smokeLosDrBonus,
  smokeRallyBonus,
  axialToPixel,
  facingToward,
} from '../src/engine';
import { lineDraw } from '../src/engine/hex';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TERRAIN } from '../src/data/terrainTypes';
// Mission 1 (every earlier round in this series) is Foot-only, so those
// harnesses only ever needed FOOT_HIT_MARKERS. This Mission has Vehicles
// (KV-1s, Panzers, half-tracks) that draw Armored hit markers instead — the
// combined HIT_MARKERS table (keyed by the full HitType union) is required
// here, or a marker lookup on a Vehicle throws `undefined`.
import { HIT_MARKERS } from '../src/data/hitMarkers';
import { ATB_FIREFIGHT_9_KV2_MISSION } from '../src/data/missions/atb-firefight-9-kv2';
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
    const d = HIT_MARKERS[hm];
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

/** §15.15: a non-Vehicle Unit sharing its Hex with a friendly Vehicle (and
 *  not itself being Transported by one) gets +1 DR. Mission 1 (every earlier
 *  round in this series) never had Vehicles, so this term was always 0 there
 *  and never needed — this Mission's armor clusters make it matter. */
function myVehicleCoverBonus(state: GameState, target: Unit): number {
  if (target.carriedBy) return 0;
  if (state.templates[target.templateId]!.kind === 'vehicle') return 0;
  const covered = Object.values(state.units).some(
    (u) => u.id !== target.id && u.side === target.side && u.hexId === target.hexId && state.templates[u.templateId]!.kind === 'vehicle',
  );
  return covered ? 1 : 0;
}

/** §16.6: a Unit Transported by a shield-marked ("apcTransport") Vehicle
 *  gets +2 DR while riding. Also newly relevant only for this Mission. */
function myApcTransportBonus(state: GameState, target: Unit): number {
  if (!target.carriedBy) return 0;
  const carrier = state.units[target.carriedBy];
  return carrier && state.templates[carrier.templateId]!.apcTransport ? 2 : 0;
}

function expectFire(state: GameState, atk: Unit, tgt: Unit, arBonus = 0) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const dist = distance(parseHexId(atk.hexId), parseHexId(tgt.hexId));
  const rm = rangeMod(dist, ae.range);
  if (rm === null) return null;
  const { elevAr, elevDr } = elevationCombatMods(state, atk.hexId, tgt.hexId);
  // §14.3: Smoke costs the ATTACKER's own AR when firing out of it, on top of
  // the DR-side bonus below — never came up before this Mission (no prior
  // round's AI could ever cast Smoke).
  const smokeAr = smokeAttackPenalty(state, atk.hexId);
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + rm + elevAr + arBonus + smokeAr;
  // §13.0/§13.9: Mortars fire HE, which always resolves against Flank
  // Defense regardless of facing arc — this term was always false (no
  // Mortars) in every earlier round of this series.
  const isHE = state.templates[atk.templateId]!.kind === 'mortar';
  const inFront = !isHE && inArc(tgt.hexId, tgt.facing, atk.hexId);
  const defense = inFront ? te.front : te.flank;
  const tHex = state.hexes[tgt.hexId]!;
  // §13.9: a red-FP HE hit loses Heavy Woods' Defensive Terrain Bonus (Air Burst).
  const terrainDr = isHE && te.color === 'red' && tHex.terrain === 'woodsHeavy' ? 0 : TERRAIN[tHex.terrain].dm;
  // §14.3/§14.4: the target's own-hex Smoke bonus and a separate +1 for the
  // shot's LOS crossing an intervening Light Smoke hex, capped at +2 total —
  // NOT a plain `tHex.features.smoke` read (that's only the first term).
  const smokeDr = Math.min(2, smokeDefenseBonus(state, tgt.hexId) + smokeLosDrBonus(state, atk.hexId, tgt.hexId));
  const dr =
    defense +
    terrainDr +
    smokeDr +
    myWallDM(state, atk.hexId, tgt.hexId) +
    elevDr +
    hastyDr(tgt) +
    myVehicleCoverBonus(state, tgt) +
    myApcTransportBonus(state, tgt);
  return { ar, dr, hitNumber: dr - ar, isFlank: !inFront, apToFire: ae.apToFire };
}

function expectCC(state: GameState, atk: Unit, tgt: Unit, arBonus = 0) {
  const ae = myEff(state, atk);
  const te = myEff(state, tgt);
  const whiteBox = !!state.templates[atk.templateId]!.whiteBoxFp;
  // §14.3: Smoke's AR penalty applies to Close Combat too (same-hex, so this
  // reads the attacker's own hex, identical to the target's).
  const smokeAr = smokeAttackPenalty(state, atk.hexId);
  const ar = (te.color === 'red' ? ae.fpRed : ae.fpBlue) + (whiteBox ? -2 : 4) + arBonus + smokeAr;
  const tHex = state.hexes[tgt.hexId]!;
  // §15.14: a Vehicle target gets NO terrain Defensive Modifier in Close
  // Combat (Foot targets still do) — never came up before this Mission (no
  // prior round's AI ever fought a Vehicle in Close Combat).
  const targetIsVehicle = state.templates[tgt.templateId]!.kind === 'vehicle';
  const terrainDr = targetIsVehicle ? 0 : TERRAIN[tHex.terrain].dm;
  const dr =
    te.flank +
    terrainDr +
    smokeDefenseBonus(state, tgt.hexId) +
    hastyDr(tgt) +
    myVehicleCoverBonus(state, tgt) +
    myApcTransportBonus(state, tgt);
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
    case 'HASTY_DEFENSE':
    case 'REMOVE_HASTY_DEFENSE':
    case 'FIRE_SMOKE':
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
    case 'FIRE': {
      const attacker = state.units[a.attackerId]!;
      const target = state.units[a.targetId]!;
      const base = myEff(state, attacker).apToFire;
      // §16.2: a Turreted Vehicle firing outside its own facing Arc pays
      // +2AP instead of Pivoting first — never came up before this Mission
      // (no Vehicles in Mission 1).
      const outOfArc = !inArc(attacker.hexId, attacker.facing, target.hexId);
      const turretPenalty = outOfArc && state.templates[attacker.templateId]!.turreted ? 2 : 0;
      return base + turretPenalty;
    }
    case 'CLOSE_COMBAT':
      return myEff(state, state.units[a.attackerId]!).apToFire;
    // §14.1: Fire Smoke's Action Cost is the Unit's own normal Attack Cost
    // (a.spotterHexId is never set by this harness's AI, so always Direct).
    case 'FIRE_SMOKE':
      return myEff(state, state.units[a.unitId]!).apToFire;
    case 'RALLY':
      return RALLY_AP_COST;
    case 'PIVOT':
    case 'STALL':
      return 1;
    case 'HASTY_DEFENSE':
      return 5;
    case 'REMOVE_HASTY_DEFENSE':
      return 0;
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

// ---------------------------------------------------------------------------
// Four styles, one per Category in reference/conflict_of_heroes_tactics.xlsx
// (37 rows; see the header comment for the full row->tactic mapping), plus
// "balanced" as a neutral no-emphasis baseline and "random" as the control/
// rules-exerciser. Mission 1 is infantry-only with no Vehicles, Hidden Units,
// Mortars, Mines, or authored Fortifications/Smoke — so every Vehicle-only,
// Hidden-only, Mine-only, Mortar-only, or Fortification-only row (roughly a
// third of the sheet) simply can't manifest here; this harness only embodies
// the rows that are mechanically reachable in this Mission, same "untested"
// honesty the sheet itself already flags for those rows.
// ---------------------------------------------------------------------------

type Style = 'balanced' | 'ap_econ' | 'defense' | 'combat_group' | 'vp_focus' | 'random';
const STYLES: Style[] = ['balanced', 'ap_econ', 'defense', 'combat_group', 'vp_focus', 'random'];
// Hex '9,8' (label "5-J01") is this Mission's key contested VP hex — the one
// the German situation text names directly ("force their way through to Hex
// 5-J01"), defended by the KV-1s (§victoryHexes[1] in the mission data).
const OBJECTIVE_HEX = '9,8';

// ---------------------------------------------------------------------------
// This round's own scripted-route hex constants (user's exact waypoint list,
// looked up against the Mission's own authored hex labels — several labels
// like "J01"/"S01"/"F07" exist on BOTH Map4 and Map5, since both boards
// reuse the same A01-S12 local grid, so each id below was confirmed against
// its hex's own `mapNumber` field, not guessed from the label text alone).
// ---------------------------------------------------------------------------
const MAP4_N01 = '13,-6';
const MAP4_N02 = '13,-5';
const MAP4_O01 = '14,-6';
const MAP4_P01 = '15,-7';
const MAP4_Q01 = '16,-7';
const MAP4_S12 = '18,3'; // southmost column-S (q=18) hex on Map4 — the seam into Map5
const MAP5_S01 = '18,4';
const INFANTRY_HEXES = ['5,4', '6,4', '7,4'] as const; // Map4 F07/G07/H08

/** Five tunable knobs behind every non-random style's movement scoring:
 *  cover-seeking, LOS-spreading, Hasty-Defense propensity, AP-cost
 *  awareness (prefer cheaper moves — roads, no backwards/pivot, no needless
 *  elevation climbs), and high-ground-seeking (Attack Downhill). */
interface Weights {
  cover: number;
  los: number;
  hasty: number;
  apCost: number;
  elevation: number;
}

/**
 * Row numbers below cite reference/conflict_of_heroes_tactics.xlsx as read
 * for this round (37 rows; the user added row 3 "Stress Cap Avoidance" and
 * re-categorized several rows into "Combat & Group Actions" since the first
 * version of this sheet).
 *
 * - ap_econ  (Category "AP Economy & Movement", 14 rows, top-rated #5 Road
 *   Movement/High, #7 Batch Group Entry/High, #8 Free-Riding Group Move/High):
 *   high `apCost` weight — among similarly good destinations, prefer the
 *   cheaper one (rewards roads, penalizes backwards/pivot/steep-climb costs
 *   implicitly through the engine's own move-cost math, rows #5/#6/#14).
 *   Batch Entry/Group Move (#7/#8) are already universal defaults below.
 * - defense  (Category "Defense & Positioning", 12 rows, top-rated #17 Stack
 *   Defensive Bonuses/High): high `cover` + `hasty` weight (rows #17, #19).
 * - combat_group (Category "Combat & Group Actions", 6 rows, top-rated #29
 *   Attack Downhill/High, #9 Free Group Attack Support/High — already a
 *   universal default below): high `los` weight (opens more Group Attack
 *   support opportunities, rows #9/#32) + high `elevation` weight (#29).
 * - vp_focus (Category "Victory Points", 5 rows, top-rated #35 Objective
 *   Denial/High, #36 Hold Objectives Early/High): primarily objective-pull
 *   movement with an explicit early-Round emphasis that decays after Round 2
 *   (#36) and a "don't abandon a controlled objective" stickiness penalty
 *   (#35) — see moveScoreFor's own vp_focus branch, not expressible as a
 *   flat weight the way the other three profiles are.
 * - balanced: a neutral baseline touching every knob lightly, for comparison.
 */
const PROFILE_WEIGHTS: Record<Style, Weights> = {
  balanced: { cover: 0.5, los: 0.5, hasty: 0.3, apCost: 0.15, elevation: 0.15 },
  ap_econ: { cover: 0.3, los: 0.3, hasty: 0.2, apCost: 0.7, elevation: 0.1 },
  defense: { cover: 1.6, los: 0.3, hasty: 1.3, apCost: 0.1, elevation: 0.2 },
  combat_group: { cover: 0.5, los: 1.2, hasty: 0.3, apCost: 0.1, elevation: 0.8 },
  vp_focus: { cover: 0.3, los: 0.3, hasty: 0.3, apCost: 0.1, elevation: 0.1 },
  random: { cover: 0, los: 0, hasty: 0, apCost: 0, elevation: 0 },
};

function weightsFor(style: Style): Weights {
  return PROFILE_WEIGHTS[style];
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

/** Terrain Defense Modifier of a Hex (§6.4) — how much cover it grants, used
 *  here purely as a movement preference, not a combat-math input. */
function terrainCover(state: GameState, hexId: HexId): number {
  const hex = state.hexes[hexId];
  return hex ? TERRAIN[hex.terrain].dm : 0;
}

/**
 * Cover term shared by every non-Objective style (user request: "consider
 * using or staying in cover... to increase chance of not getting hit"):
 * reward a destination's own cover, and separately penalize leaving BETTER
 * cover than the destination offers, so a Unit already dug into Woods
 * doesn't wander back out onto Open ground without a good tactical reason.
 * Weighted at 1 "cover point" per Hex of tactical distance — enough to swing
 * a close call, not enough to override a clearly better tactical move.
 */
function coverTerm(state: GameState, fromHexId: HexId, toHexId: HexId): number {
  const fromCover = terrainCover(state, fromHexId);
  const toCover = terrainCover(state, toHexId);
  return toCover - Math.max(0, fromCover - toCover) * 0.5;
}

/** Which enemies some OTHER friendly Unit (not the one about to move) can
 *  already see, computed once per turn's decision — the baseline "coverage"
 *  a candidate destination is compared against. */
function alreadyCoveredEnemies(state: GameState, side: SideId, enemies: Unit[]): Set<string> {
  const covered = new Set<string>();
  if (!enemies.length) return covered;
  const friendlies = Object.values(state.units).filter((u) => u.side === side);
  for (const e of enemies) {
    if (friendlies.some((u) => hasLOS(state, u.hexId, e.hexId))) covered.add(e.id);
  }
  return covered;
}

/** §5.2 LOS, used as a movement preference: reward a destination that opens
 *  a sightline on an enemy nobody else on the side can currently see —
 *  "more opportunities for combat and distraction of the enemy" (user ask),
 *  rather than every Unit training its guns on the same one target. */
function losSpreadBonus(state: GameState, toHexId: HexId, enemies: Unit[], alreadyCovered: Set<string>): number {
  if (!enemies.length) return 0;
  return enemies.some((e) => !alreadyCovered.has(e.id) && hasLOS(state, toHexId, e.hexId)) ? 1 : 0;
}

/** §12.2 elevation-move-cost-aware "prefer cheap moves" term (tactics rows
 *  #5 Road Movement, #6 Avoid Backwards/Pivot Costs, #14 Elevation Planning)
 *  — reuses the same independent move-cost oracle used for rule verification
 *  below, since it's exactly "how many AP would this cost." */
function apCostTerm(state: GameState, unit: Unit, toHexId: HexId): number {
  return -expectMoveCost(state, unit, toHexId);
}

/** Tactics row #29 Attack Downhill: reward ending a move at higher elevation
 *  than the Unit started at (a pure movement preference — the real Elevation
 *  Combat Bonus itself, §12.3, already flows through expectFire/expectCC's
 *  own Hit Number math untouched). */
function elevationTerm(state: GameState, unit: Unit, toHexId: HexId): number {
  const from = state.hexes[unit.hexId]?.elevation ?? 0;
  const to = state.hexes[toHexId]?.elevation ?? 0;
  return to - from;
}

/** User's own tactical note for this Mission: "there are L1 and L2 hills
 *  here; perhaps a good place for the Flak88!" — the Flak 18 88mm is a
 *  long-range Gun with no Bonus Moves of its own, so once it's on the board
 *  (its Round-3 wave) it should climb toward the highest reachable ground
 *  and then hold it, both for the +1AR Elevation Combat Bonus (§12.3) and
 *  the wider LOS a hilltop gives a stationary AT gun. An absolute pull
 *  toward elevation (not just "higher than where I started," the way the
 *  general-purpose `elevationTerm` above works) so it keeps climbing across
 *  multiple Turns rather than settling for the first uphill step. */
function flak88HillBonus(state: GameState, unit: Unit, toHexId: HexId): number {
  if (unit.templateId !== 'ger-flak18-88mm') return 0;
  const elev = state.hexes[toHexId]?.elevation ?? 0;
  return elev * 4;
}

/** Deterministic per-Unit-id hash, same technique the prior round used for
 *  its 3-way sector split — here just picking ONE of the three named
 *  F07/G07/H08 Hexes per infantry Unit (2 Units, 3 Hexes), so a given Unit
 *  keeps the same assignment for its whole game. */
function infantryTargetHexFor(unitId: UnitId): HexId {
  let h = 0;
  for (let i = 0; i < unitId.length; i++) h = (h * 31 + unitId.charCodeAt(i)) >>> 0;
  return INFANTRY_HEXES[h % INFANTRY_HEXES.length]!;
}

/** This round's own post-arrival infantry pull (user's instruction: once the
 *  Rifles/MG34 reach their assigned F07/G07/H08 Hex, "take the J01 if the
 *  KV2a is dead; else do as you wish") — a pull toward the KV2a's own Hex
 *  (Map5 J01, `OBJECTIVE_HEX`) that only ever activates once the KV2a no
 *  longer exists; otherwise these two Units get no override at all from this
 *  term (they still get the normal `moveScoreFor` extras below, matching
 *  "do as you wish"). */
function infantryObjectivePull(state: GameState, unit: Unit, toHexId: HexId): number {
  if (unit.templateId !== 'ger-rifle' && unit.templateId !== 'ger-lmg') return 0;
  if (unit.hexId !== infantryTargetHexFor(unit.id)) return 0; // not yet arrived at its assigned Hex
  const kv2Alive = Object.values(state.units).some((u) => u.templateId === 'sov-kv2a');
  if (kv2Alive) return 0;
  return -distance(parseHexId(toHexId), parseHexId(OBJECTIVE_HEX)) * 0.8;
}

function moveScoreFor(
  style: Style,
  state: GameState,
  unit: Unit,
  toHexId: HexId,
  enemies: Unit[],
  alreadyCovered: Set<string>,
  weights: Weights,
): number {
  const fromHexId = unit.hexId;
  const cover = coverTerm(state, fromHexId, toHexId) * weights.cover;
  const los = losSpreadBonus(state, toHexId, enemies, alreadyCovered) * weights.los;
  const apEff = apCostTerm(state, unit, toHexId) * weights.apCost;
  const elev = elevationTerm(state, unit, toHexId) * weights.elevation;
  const hill = flak88HillBonus(state, unit, toHexId);
  const objPull = infantryObjectivePull(state, unit, toHexId);
  const extras = cover + los + apEff + elev + hill + objPull;

  // Tactics rows #35 Objective Denial / #36 Hold Objectives Early: rush the
  // VP Hex hardest in the opening Rounds (decaying afterward, since a lead
  // secured early compounds — the earlier self-play rounds' own finding),
  // and heavily resist abandoning it once this side already controls it.
  if (style === 'vp_focus') {
    const objPull = state.round <= 2 ? 1.0 : state.round === 3 ? 0.7 : 0.4;
    const dist = -distance(parseHexId(toHexId), parseHexId(OBJECTIVE_HEX)) * objPull;
    const controllingSide = state.hexes[OBJECTIVE_HEX]?.features.control;
    const stickiness = fromHexId === OBJECTIVE_HEX && controllingSide === unit.side && toHexId !== OBJECTIVE_HEX ? -5 : 0;
    return dist + stickiness + extras * 0.3;
  }
  if (!enemies.length) return extras;
  return -Math.min(...enemies.map((e) => distance(parseHexId(toHexId), parseHexId(e.hexId)))) + extras;
}

/** Build-a-Hasty-Defense candidate (§17.6): a Fresh, uncarried Foot Unit
 *  already sitting on cover terrain, within reach of the enemy, with no
 *  Hasty Defense yet. Scored on the same rough scale as `moveScoreFor` so it
 *  can be compared directly against the best available Move. */
function hastyDefenseCandidate(
  state: GameState,
  side: SideId,
  weights: Weights,
  allActs: Action[],
  enemies: Unit[],
): { action: Action; score: number } | null {
  if (weights.hasty <= 0) return null;
  let best: { unitId: UnitId; score: number } | null = null;
  for (const a of allActs) {
    if (a.type !== 'HASTY_DEFENSE') continue;
    const u = state.units[a.unitId];
    // Fresh-only, matching every other heuristic here (see chooseAction's own
    // `isFresh` filter) — the emitted Action always omits `capCostReduce`
    // (full 5AP cost, a normal Spent Check), which is unconditionally legal
    // for a Fresh Unit but would be denied for a Spent one (§3.4).
    if (!u || u.side !== side || u.status !== 'fresh') continue;
    const myCover = terrainCover(state, u.hexId);
    if (myCover <= 0) continue; // only dig in where there's real cover to reinforce
    const nearestD = enemies.length ? Math.min(...enemies.map((e) => distance(parseHexId(u.hexId), parseHexId(e.hexId)))) : Infinity;
    if (nearestD > 6) continue; // not worth it until the enemy is somewhere nearby
    const score = weights.hasty * (myCover * 2 - nearestD * 0.1);
    if (!best || score > best.score) best = { unitId: a.unitId, score };
  }
  return best ? { action: { type: 'HASTY_DEFENSE', unitId: best.unitId }, score: best.score } : null;
}

/**
 * User's own tactical note for this Mission: only the German Pioneer and
 * PzIVe can Fire Smoke (§14.1) — no Soviet Unit here can — "use this for
 * extra defense or to block LOS ... to protect their units until they get
 * into place." Screens the advance rather than being spent reactively:
 * among this Turn's legal FIRE_SMOKE targets (already LOS/range-validated
 * by `legalActionsForUnit`, so nothing here re-derives that), prefer the Hex
 * closest to the KV-2 — the single biggest threat on the board — that isn't
 * already under Heavy Smoke, laying a curtain between it and the advancing
 * force. Only while the KV-2 is still at real range (close enough that LOS
 * to it is a live tactical question, far enough that Smoke can still matter
 * before the fight is already Close Combat) and only in the Mission's
 * opening Rounds — once Round 4+, the battle is close enough that Smoke is
 * more likely to blind a Group Attack than protect an advance.
 */
function smokeCandidate(state: GameState, side: SideId, acts: Action[]): { action: Action; score: number } | null {
  if (side !== 'A' || state.round > 3) return null;
  const smokes = acts.filter((a): a is Extract<Action, { type: 'FIRE_SMOKE' }> => a.type === 'FIRE_SMOKE');
  if (!smokes.length) return null;
  const kv2 = Object.values(state.units).find((u) => u.templateId === 'sov-kv2a');
  if (!kv2) return null;
  const kv2Dist = (hexId: HexId) => distance(parseHexId(hexId), parseHexId(kv2.hexId));
  const usable = smokes.filter((a) => (state.hexes[a.targetHexId]?.features.smoke ?? 0) < 2 && kv2Dist(a.targetHexId) <= 6);
  if (!usable.length) return null;
  const best = bestBy(usable, (a) => -kv2Dist(a.targetHexId));
  if (!best) return null;
  return { action: best, score: 2.2 }; // comparable in scale to a solid Move/Hasty Defense choice
}

/** Which of `waypoints` a Unit should currently be heading toward: the first
 *  one it hasn't landed on exactly, UNLESS it's already closer to a LATER
 *  waypoint (a longer single-Action move skipped past an intermediate one
 *  without landing on it exactly) — in that case, advance to the closest
 *  remaining one instead of getting stuck re-targeting an already-passed
 *  leg. Returns null once the Unit has reached the final waypoint. */
function currentWaypoint(unit: Unit, waypoints: HexId[]): HexId | null {
  const upos = parseHexId(unit.hexId);
  for (let i = 0; i < waypoints.length; i++) {
    if (unit.hexId === waypoints[i]) continue;
    let bestIdx = i;
    let bestDist = distance(upos, parseHexId(waypoints[i]!));
    for (let j = i + 1; j < waypoints.length; j++) {
      const d = distance(upos, parseHexId(waypoints[j]!));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    return waypoints[bestIdx]!;
  }
  return null;
}

/**
 * This round's own explicit, hex-by-hex German route — see this file's own
 * header comment for the full list. Checked once per `chooseAction` call,
 * AHEAD of normal combat/movement scoring, for whichever managed unit-group
 * still has an unfinished leg; returns null the moment nothing mandatory
 * remains for any of them, letting normal `chooseAction` logic run
 * unmodified from then on (including for these same Units).
 *
 * Deliberate, documented simplification: while a Unit's own route is
 * unfinished, this function unconditionally prioritizes movement over any
 * opportunistic Fire/Close Combat along the way — "stream the tanks down
 * ... once there just try to kill" and "move the infantry ... then do Group
 * move/attacks from there" both read as move-first, fight-later, not
 * "fight anything convenient along the way."
 */
function waypointAction(state: GameState, allActs: Action[]): Action | null {
  if (state.currentSide !== 'A') return null;
  const isFreshUnit = (id: UnitId) => state.units[id]?.status === 'fresh';
  const movesFor = (unitId: UnitId) => allActs.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE' && a.unitId === unitId);
  const bestMoveToward = (unitId: UnitId, target: HexId): Action | null => {
    const cands = movesFor(unitId);
    if (!cands.length) return null;
    return bestBy(cands, (a) => -distance(parseHexId(a.toHexId), parseHexId(target)))!;
  };
  const kv2 = Object.values(state.units).find((u) => u.templateId === 'sov-kv2a');

  // --- 1. Pioneer: [smoke N02] -> N01 -> [smoke O01] -> O01, then hold ------
  const pioneer = Object.values(state.units).find((u) => u.side === 'A' && u.templateId === 'ger-pioneer');
  if (pioneer && isFreshUnit(pioneer.id)) {
    const legs: { smokeHex: HexId; moveTo: HexId }[] = [
      { smokeHex: MAP4_N02, moveTo: MAP4_N01 },
      { smokeHex: MAP4_O01, moveTo: MAP4_O01 },
    ];
    const leg = legs.find((l) => pioneer.hexId !== l.moveTo);
    if (leg) {
      const alreadySmoked = (state.hexes[leg.smokeHex]?.features.smoke ?? 0) > 0;
      if (!alreadySmoked) {
        const smokeAct = allActs.find(
          (a): a is Extract<Action, { type: 'FIRE_SMOKE' }> => a.type === 'FIRE_SMOKE' && a.unitId === pioneer.id && a.targetHexId === leg.smokeHex,
        );
        if (smokeAct) return smokeAct;
      }
      const mv = bestMoveToward(pioneer.id, leg.moveTo);
      if (mv) return mv;
    }
  }

  // --- 2. Flak 18 88mm + Opel Truck: LOAD -> N01 -> O01 -> UNLOAD -> FIRE ---
  const flak = Object.values(state.units).find((u) => u.side === 'A' && u.templateId === 'ger-flak18-88mm');
  const truck = Object.values(state.units).find((u) => u.side === 'A' && u.templateId === 'ger-truck-opel');
  if (flak && truck) {
    if (!flak.carriedBy && isFreshUnit(flak.id) && isFreshUnit(truck.id)) {
      // "Already preloaded on truck when it enters, don't spend AP to do
      // this" — the engine has no such concept for a Reinforcement (no
      // `carriedBy` field on `ReinforcementUnit`), so the closest honest
      // match is: LOAD as the very first thing this pair ever does, with
      // nothing else interposed (they enter sharing a Hex, so it's legal
      // immediately) — a real, small AP cost, not literally zero.
      const loadAct = allActs.find((a): a is Extract<Action, { type: 'LOAD' }> => a.type === 'LOAD' && a.unitId === flak.id && a.vehicleId === truck.id);
      if (loadAct) return loadAct;
    } else if (flak.carriedBy === truck.id) {
      const target = currentWaypoint(truck, [MAP4_N01, MAP4_O01]);
      if (target && isFreshUnit(truck.id)) {
        const mv = bestMoveToward(truck.id, target);
        if (mv) return mv;
      }
      if (!target && isFreshUnit(flak.id)) {
        // Arrived at O01 with the Flak88 still aboard — unload it facing the
        // KV2a (`facingToward` is any-distance-correct, borrowed purely for
        // its geometry — no Hidden-Unit mechanic is involved here).
        const unloadAct = allActs.find((a): a is Extract<Action, { type: 'UNLOAD' }> => a.type === 'UNLOAD' && a.unitId === flak.id);
        if (unloadAct) return kv2 ? { ...unloadAct, facing: facingToward(unloadAct.toHexId, kv2.hexId) } : unloadAct;
      }
    } else if (!flak.carriedBy && isFreshUnit(flak.id) && kv2) {
      // Unloaded and in position — "try to kill it using CAPs if necessary":
      // always spend the maximum affordable dice-mod CAP (up to the §3.2
      // ceiling of 2), no odds threshold this round.
      const fireAct = allActs.find((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE' && a.attackerId === flak.id && a.targetId === kv2.id);
      if (fireAct) {
        const capDiceMod = Math.min(2, state.players.A.capCurrent);
        return capDiceMod > 0 ? { ...fireAct, capDiceMod } : fireAct;
      }
    }
  }

  // --- 3. The four Panzers: N01 -> O01 -> P01 -> Q01 -> S12(Map4) -> S01(Map5) ---
  const tankRoute = [MAP4_N01, MAP4_O01, MAP4_P01, MAP4_Q01, MAP4_S12, MAP5_S01];
  const tankIds = Object.values(state.units)
    .filter((u) => u.side === 'A' && (u.templateId === 'ger-pz2f' || u.templateId === 'ger-pz4e' || u.templateId === 'ger-pz38t'))
    .map((u) => u.id);
  for (const id of tankIds) {
    if (!isFreshUnit(id)) continue;
    const target = currentWaypoint(state.units[id]!, tankRoute);
    if (!target) continue; // arrived at Map5 S01 — falls through to normal behavior
    const mv = bestMoveToward(id, target);
    if (mv) return mv;
  }

  // --- 4. Rifles + MG34: march to an assigned F07/G07/H08, then fall through ---
  const infantryIds = Object.values(state.units)
    .filter((u) => u.side === 'A' && (u.templateId === 'ger-rifle' || u.templateId === 'ger-lmg'))
    .map((u) => u.id);
  for (const id of infantryIds) {
    if (!isFreshUnit(id)) continue;
    const target = infantryTargetHexFor(id);
    if (state.units[id]!.hexId === target) continue; // arrived
    const mv = bestMoveToward(id, target);
    if (mv) return mv;
  }

  return null;
}

function chooseAction(state: GameState, styleOf: Record<SideId, Style>, rand: () => number): Action {
  const side = state.currentSide;
  const style = styleOf[side];
  const weights = weightsFor(style);
  const enemies = Object.values(state.units).filter((e) => e.side !== side);
  const alreadyCovered = alreadyCoveredEnemies(state, side, enemies);
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
  // The Pioneer holds permanently once it reaches the end of its route
  // (O01) — "smoke O01 and move into it next and stay there" — so it's
  // excluded from ordinary Move consideration once arrived, rather than
  // wandering off toward the nearest enemy like every other Unit's default
  // move-scoring would otherwise pull it.
  const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE').filter((a) => {
    if (side !== 'A') return true;
    const u = state.units[a.unitId];
    return !(u?.templateId === 'ger-pioneer' && u.hexId === MAP4_O01);
  });
  const pivots = acts.filter((a): a is Extract<Action, { type: 'PIVOT' }> => a.type === 'PIVOT');
  const stalls = acts.filter((a): a is Extract<Action, { type: 'STALL' }> => a.type === 'STALL');

  // User's own tactical note: the Flak 18 88mm arriving Round 3 is "their
  // best weapon to kill the KV2a -- the Soviets will fear this." Once it's
  // on the board, a Soviet attacker with a real choice of targets should
  // treat it as the priority kill — a flat bonus large enough to outweigh a
  // normal Hit Number difference between two otherwise-comparable targets,
  // without being so large it'd force an obviously terrible shot.
  const fearsFlak88 = (targetId: UnitId) => side === 'B' && state.units[targetId]?.templateId === 'ger-flak18-88mm' ? 4 : 0;
  const ccScore = (a: { attackerId: string; targetId: string }) =>
    -expectCC(state, state.units[a.attackerId]!, state.units[a.targetId]!).hitNumber + fearsFlak88(a.targetId);
  const fireScore = (a: { attackerId: string; targetId: string }) => {
    const ex = expectFire(state, state.units[a.attackerId]!, state.units[a.targetId]!);
    return ex ? -ex.hitNumber + fearsFlak88(a.targetId) : -Infinity;
  };

  /** Upgrade a chosen (leaderId, targetId) solo attack into a Group Attack if
   *  any currently-Fresh, same-side Unit qualifies as a supporter (§10.6). */
  const groupUpgrade = (leaderId: UnitId, targetId: UnitId): Action => {
    const leader = state.units[leaderId]!;
    const target = state.units[targetId]!;
    const isCC = target.hexId === leader.hexId;
    const supporterIds = Object.values(state.units)
      .filter((u) => u.side === side && u.id !== leaderId && u.status === 'fresh')
      .filter((u) => isValidSupporter(state, leader, u, target))
      .map((u) => u.id);
    if (supporterIds.length === 0) {
      return isCC ? { type: 'CLOSE_COMBAT', attackerId: leaderId, targetId } : { type: 'FIRE', attackerId: leaderId, targetId };
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

  // --- Deterministic tactic-profile styles ---------------------------------
  // This round's own scripted German route (see this file's header comment
  // and `waypointAction` above) takes priority over everything below it,
  // for whichever managed unit-group still has an unfinished leg — a null
  // return means every managed Unit has either arrived or isn't Fresh this
  // Turn, so normal combat/movement scoring proceeds unmodified.
  const wp = waypointAction(state, allActs);
  if (wp) return wp;

  // Combat priority is shared by all five profiles (Close Combat > Fire, both
  // always upgraded to a Group Attack when a qualifying supporter exists,
  // tactics row #9 "Free Group Attack Support" — a strict no-cost AR bonus,
  // so there's never a reason for any profile to decline it). No KV2a-
  // specific gating this round (see this file's header — "don't use last
  // doctrine") — once a managed Unit has finished its route, or for any
  // Unit never on a route at all, this is exactly the pre-doctrine default.
  const c = bestBy(cc, ccScore);
  if (c) return groupUpgrade(c.attackerId, c.targetId);
  const f = bestBy(fires, fireScore);
  if (f) return groupUpgrade(f.attackerId, f.targetId);

  if (rallies.length) {
    const freshUnits = Object.values(state.units).filter((u) => u.side === side && u.status === 'fresh');
    const rallyCluster = largestCluster(freshUnits.filter((u) => rallies.some((r) => r.unitId === u.id)));
    if (rallyCluster.length >= 2) return { type: 'GROUP_RALLY', unitIds: rallyCluster.map((u) => u.id) };
    return rallies[0]!;
  }

  const bestMoveScoreSoFar = () =>
    moves.length
      ? Math.max(...moves.map((a) => moveScoreFor(style, state, state.units[a.unitId]!, a.toHexId, enemies, alreadyCovered, weights)))
      : -Infinity;

  // Fire Smoke (§14.1, user's own tactical note): screen the advance while
  // the Pioneer/PzIVe still can — only these two Templates in this Mission
  // have it, and no Soviet Unit does at all, so this is Side-A-only. Checked
  // ahead of Hasty Defense/Move since it's a proactive, time-limited window
  // (the KV-2 has to still be at real range, §smokeCandidate's own doc).
  const smoke = smokeCandidate(state, side, acts);
  if (smoke && smoke.score > bestMoveScoreSoFar()) return smoke.action;

  // Hasty Defense (§17.6, tactics row #19): dig in instead of moving if
  // nothing else useful is happening and no available Move clearly beats
  // staying put and fortifying — compared on the same scoring scale as the
  // best solo Move. vp_focus never digs in — its whole logic is "keep
  // pressing/holding the objective," not "fortify wherever you happen to be."
  const hasty = style === 'vp_focus' ? null : hastyDefenseCandidate(state, side, weights, allActs, enemies);
  if (hasty) {
    const bestMoveScore = bestMoveScoreSoFar();
    if (hasty.score > bestMoveScore) return hasty.action;
  }

  if (moves.length) {
    const freshUnits = Object.values(state.units).filter((u) => u.side === side && u.status === 'fresh');
    const moveCluster = largestCluster(freshUnits.filter((u) => moves.some((m) => m.unitId === u.id)));
    if (moveCluster.length >= 2) {
      const memberMoves = moveCluster.map((u) => {
        const candidates = moves.filter((m) => m.unitId === u.id);
        const best = bestBy(candidates, (a) => moveScoreFor(style, state, u, a.toHexId, enemies, alreadyCovered, weights))!;
        return { unitId: u.id, toHexId: best.toHexId };
      });
      return { type: 'GROUP_MOVE', moves: memberMoves };
    }
    return bestBy(moves, (a) => moveScoreFor(style, state, state.units[a.unitId]!, a.toHexId, enemies, alreadyCovered, weights))!;
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

/** Per-game telemetry, summed across the whole run afterward (§ user's ask:
 *  "stats on heuristics used and fail/success rate ... smoke use for defense
 *  and LOS ... how often the 88 got to fire"). */
interface Telemetry {
  fireAttempts: { A: number; B: number };
  fireHits: { A: number; B: number };
  ccAttempts: { A: number; B: number };
  ccHits: { A: number; B: number };
  rallyAttempts: { A: number; B: number };
  rallySuccess: { A: number; B: number };
  hastyDefenseBuilds: { A: number; B: number };
  groupAttackUses: { A: number; B: number };
  smokePlacements: number;
  // Defensive value of Smoke: Fire attempts/hits against a target standing
  // in/behind Smoke vs. not — a lower hit rate on the "smoked" bucket is the
  // signal that Smoke is actually helping the defense, not just "used."
  smokedTargetFireAttempts: number;
  smokedTargetFireHits: number;
  unsmokedTargetFireAttempts: number;
  unsmokedTargetFireHits: number;
  // A Move actually attributable to the LOS-spread term (opened a sightline
  // on an enemy nobody else on the side could already see).
  losSpreadMovesChosen: number;
  moveDecisions: number;
  flak88FireAttempts: number;
  flak88FireHits: number;
  flak88FiredThisGame: boolean;
  flak88TargetedBySoviets: number;
  totalSovietAttacksOnGermanUnits: number;
}

function emptyTelemetry(): Telemetry {
  return {
    fireAttempts: { A: 0, B: 0 },
    fireHits: { A: 0, B: 0 },
    ccAttempts: { A: 0, B: 0 },
    ccHits: { A: 0, B: 0 },
    rallyAttempts: { A: 0, B: 0 },
    rallySuccess: { A: 0, B: 0 },
    hastyDefenseBuilds: { A: 0, B: 0 },
    groupAttackUses: { A: 0, B: 0 },
    smokePlacements: 0,
    smokedTargetFireAttempts: 0,
    smokedTargetFireHits: 0,
    unsmokedTargetFireAttempts: 0,
    unsmokedTargetFireHits: 0,
    losSpreadMovesChosen: 0,
    moveDecisions: 0,
    flak88FireAttempts: 0,
    flak88FireHits: 0,
    flak88FiredThisGame: false,
    flak88TargetedBySoviets: 0,
    totalSovietAttacksOnGermanUnits: 0,
  };
}

const isFlak88 = (u: Unit | undefined) => u?.templateId === 'ger-flak18-88mm';

/** Shared telemetry recording for one resolved shot (FIRE, CLOSE_COMBAT, or
 *  either branch of GROUP_ATTACK) — the Flak88's own fire-attempt/hit record,
 *  the Soviets' "fear the Flak88" target-choice rate, and Smoke's actual
 *  defensive effect (hit rate on a smoked target vs. an unsmoked one). Does
 *  NOT bump the per-Action-type attempt/hit counters (FIRE vs. CLOSE_COMBAT
 *  are tracked separately by their own call sites) — `pre` must be the state
 *  BEFORE this shot resolved, so Smoke status reflects what was actually
 *  being fired into/out of. */
function recordFlak88AndSmokeTelemetry(telemetry: Telemetry, pre: GameState, attacker: Unit, target: Unit, hit: boolean) {
  if (isFlak88(attacker)) {
    telemetry.flak88FireAttempts++;
    telemetry.flak88FiredThisGame = true;
    if (hit) telemetry.flak88FireHits++;
  }
  if (attacker.side === 'B' && target.side === 'A') {
    telemetry.totalSovietAttacksOnGermanUnits++;
    if (isFlak88(target)) telemetry.flak88TargetedBySoviets++;
  }

  const targetSmoked = (pre.hexes[target.hexId]?.features.smoke ?? 0) > 0;
  if (targetSmoked) {
    telemetry.smokedTargetFireAttempts++;
    if (hit) telemetry.smokedTargetFireHits++;
  } else {
    telemetry.unsmokedTargetFireAttempts++;
    if (hit) telemetry.unsmokedTargetFireHits++;
  }
}

/**
 * Per-unit-type + hex-heatmap attribution for one resolved shot (Fire, Close
 * Combat, or a member of a Group Attack's stack) — the user's own ask:
 * "attacks and hits... is fired upon... is hit... destroyed and by which
 * unit... a heatmap of hexes where a unit was hit and destroyed." `pre` must
 * be the state BEFORE the shot (target's Hex at the moment of the shot);
 * `post` decides "destroyed" from ground truth (the Unit no longer exists),
 * not re-derived, so it can never disagree with the real engine.
 */
function recordUnitTypeAttack(
  stats: UnitTypeStatsMap,
  heat: HexHeat,
  pre: GameState,
  post: GameState,
  attackerTemplateId: string,
  targetId: UnitId,
  hit: boolean,
) {
  const target = pre.units[targetId]!;
  const attackerStats = statsFor(stats, attackerTemplateId);
  if (hit) attackerStats.attackHits++;
  const targetStats = statsFor(stats, target.templateId);
  targetStats.firedUpon++;
  if (hit) {
    targetStats.hit++;
    bumpHex(heat, target.hexId, 'hits');
    if (!post.units[targetId]) {
      targetStats.destroyed++;
      targetStats.destroyedBy[attackerTemplateId] = (targetStats.destroyedBy[attackerTemplateId] ?? 0) + 1;
      bumpHex(heat, target.hexId, 'destroys');
    }
  }
}

/** Per-unit-TYPE (templateId, not per-instance — instance ids don't mean
 *  anything aggregated across 120 separate games) event counters — the
 *  user's own ask: "keep track of each time unit moves, moves into cover or
 *  open, attacks, attacks and hits, is fired upon, is hit, rallies, smoke
 *  placed... unit is destroyed and by which unit." */
interface UnitTypeStats {
  moves: number;
  movesIntoCover: number;
  movesIntoOpen: number;
  attacksMade: number;
  attackHits: number;
  firedUpon: number;
  hit: number;
  rallyAttempts: number;
  rallySuccesses: number;
  smokePlaced: number;
  destroyed: number;
  /** Keyed by the destroyer's templateId, or the literal string "mines" for
   *  a Unit killed by triggering an Obstacle rather than by another Unit. */
  destroyedBy: Record<string, number>;
}

function emptyUnitTypeStats(): UnitTypeStats {
  return {
    moves: 0, movesIntoCover: 0, movesIntoOpen: 0, attacksMade: 0, attackHits: 0,
    firedUpon: 0, hit: 0, rallyAttempts: 0, rallySuccesses: 0, smokePlaced: 0,
    destroyed: 0, destroyedBy: {},
  };
}

type UnitTypeStatsMap = Record<string, UnitTypeStats>;
function statsFor(map: UnitTypeStatsMap, templateId: string): UnitTypeStats {
  if (!map[templateId]) map[templateId] = emptyUnitTypeStats();
  return map[templateId]!;
}

/** Hex-keyed heat data for "a heatmap of hexes where a Unit was hit and
 *  destroyed" — the target's own Hex at the moment of the shot, not the
 *  attacker's. */
type HexHeat = Record<string, { hits: number; destroys: number }>;
function bumpHex(map: HexHeat, hexId: string, field: 'hits' | 'destroys') {
  if (!map[hexId]) map[hexId] = { hits: 0, destroys: 0 };
  map[hexId][field]++;
}
function bumpHexBy(map: HexHeat, hexId: string, field: 'hits' | 'destroys', n: number) {
  if (!map[hexId]) map[hexId] = { hits: 0, destroys: 0 };
  map[hexId][field] += n;
}

/** Hex-keyed heat data for "a heatmap of hexes moved into by Germans and
 *  Soviets" (this round's own new ask) — every Hex a Unit actually arrived
 *  at via MOVE or GROUP_MOVE, counted separately per side. Deliberately
 *  does NOT count ENTER/SETUP_PLACE (placement, not "moving into" a Hex). */
type MoveHeat = Record<string, { A: number; B: number }>;
function bumpMoveHeat(map: MoveHeat, hexId: string, side: SideId) {
  if (!map[hexId]) map[hexId] = { A: 0, B: 0 };
  map[hexId][side]++;
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
  telemetry: Telemetry;
  unitTypeStats: UnitTypeStatsMap;
  hexHeat: HexHeat;
  moveHeat: MoveHeat;
}

function playGame(seed: number, styleA: Style, styleB: Style): GameResult {
  let state = initGame({ ...ATB_FIREFIGHT_9_KV2_MISSION, seed });
  const styleOf: Record<SideId, Style> = { A: styleA, B: styleB };
  const rand = mulberry32(seed * 2654435761);
  const violations: Violation[] = [];
  const coverage = { A: {} as Record<string, number>, B: {} as Record<string, number> };
  const bump = (side: SideId, k: string) => (coverage[side][k] = (coverage[side][k] ?? 0) + 1);
  const trajectory: RoundSnapshot[] = [];
  const groupEntryUsed = { A: false, B: false };
  const telemetry = emptyTelemetry();
  const unitTypeStats: UnitTypeStatsMap = {};
  const hexHeat: HexHeat = {};
  const moveHeat: MoveHeat = {};
  const check0 = (cond: boolean, section: string, msg: string) => {
    if (!cond) violations.push({ section, msg, round: state.round, action: 'SETUP_PLACE' });
  };

  // §E Pre-Mission Setup phase: place Side B's setupForces pool one Unit at a
  // time (0AP, no Spent Check, no Turn to hand off — it isn't the real game
  // yet) before Round 1 can start. Biased toward Map 5 (the Mission's own
  // "Place Hidden Units anywhere on Map 5" instruction) and toward the KV-1s'
  // existing position, for a coherent defensive cluster.
  let setupSteps = 0;
  while (state.phase === 'setup' && setupSteps < 20) {
    const pool = state.setupPool ?? [];
    const mySide = state.setupSide;
    const entry = pool.find((u) => u.side === mySide);
    if (!entry) break;
    const legal = legalSetupHexes(state);
    const onMap5 = legal.filter((h) => state.hexes[h]?.mapNumber === 5);
    const candidates = onMap5.length ? onMap5 : legal;
    const hexId = bestBy(candidates, (h) => -distance(parseHexId(h), parseHexId(OBJECTIVE_HEX)));
    if (!hexId) {
      violations.push({ section: '-', msg: `no legal Setup Hex for ${entry.id}`, round: state.round, action: 'SETUP_PLACE' });
      break;
    }
    const pre = state;
    const res = reduce(pre, { type: 'SETUP_PLACE', unitId: entry.id, hexId });
    if (res.events[0]?.type === 'illegal') {
      violations.push({ section: '-', msg: `SETUP_PLACE rejected: ${res.events[0]?.text}`, round: pre.round, action: `SETUP_PLACE ${entry.id}->${hexId}` });
      break;
    }
    check0(res.state.units[entry.id]?.hexId === hexId, '4.12', `${entry.id} should be placed at its chosen Setup Hex`);
    check0(!!pre.setupPool?.some((u) => u.id === entry.id) && !res.state.setupPool?.some((u) => u.id === entry.id), 'setup', `${entry.id} should leave the Setup pool`);
    bump(mySide!, 'SETUP_PLACE');
    state = res.state;
    setupSteps += 1;
  }
  if (state.phase === 'setup') {
    violations.push({ section: '-', msg: `Setup phase never finished (phase=${state.phase})`, round: state.round, action: '-' });
  }

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
    // §15.2 multi-hex Bonus Move: `expectMoveCost` only re-derives a single
    // hex-to-hex transition (correct for every prior round in this series,
    // which had no Vehicles) — a real Bonus-Move `path` chains several hexes
    // together under one Action, with a materially different cost formula
    // this harness doesn't independently re-derive yet. Skip cost/CAP
    // verification for those specific Actions rather than report a false
    // violation; still verify the Unit ends at the right final Hex, the
    // Spent Check's own internal roll-vs-cost consistency, and Stress.
    // A MOVE's `path` field is only set for SOME Bonus-Move journeys — even a
    // plain `{toHexId}` MOVE can represent a multi-hex Bonus-Move trip the
    // engine resolves internally, for any Unit with `bonusMoves` set. Skip by
    // Unit capability, not just by whether `path` happens to be present.
    const moveActor = action.type === 'MOVE' ? pre.units[action.unitId] : null;
    const moveHasBonusMoves = !!moveActor && (pre.templates[moveActor.templateId]!.bonusMoves ?? 0) > 0;
    // §17.7-17.8: Barbed Wire adds a genuinely random 1d6 to Move Cost — by
    // design (see scripts/conformance.ts's own long-standing note) this is
    // deliberately unpredictable ahead of the real roll, "hidden until
    // executed," so it was never meant to be independently re-derived here
    // either. Mission 1's sandboxes had Barbed Wire but no self-play round
    // ever actually crossed one until this Mission's board did.
    const moveIntoWire = action.type === 'MOVE' && pre.hexes[action.toHexId]?.features.obstacle?.kind === 'barbedWire';
    const skipCostCheck = action.type === 'MOVE' && (moveHasBonusMoves || moveIntoWire);

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
      // §C Phase 2 "specific-Unit kill VP" — this Mission overrides the KV-1s'
      // own kill value (3 VP) via `unitKillVp`, keyed by the killed Unit's own
      // id. Mission 1 never used this field, so no prior round's oracle read
      // it — falls back to the general per-kill rate / template VP as before.
      const vp = pre.victory.unitKillVp?.[id] ?? vpPerKillFor(pre.victory, opp) ?? pre.templates[u.templateId]!.vp;
      if (opp === 'A') vpToA += vp;
      else vpToB += vp;
    }
    const roundEnded = action.type === 'PASS' && (post.round > pre.round || post.phase === 'gameOver');
    if (roundEnded) {
      // This Mission has an `awardTiming: 'endOfMission'` Victory Hex (score
      // only on the true final Round-end) alongside a default 'endOfRound'
      // one — Mission 1 never authored anything but the 'endOfRound' default,
      // so no prior round's oracle needed to branch on this field.
      const isFinalRoundEnd = post.phase === 'gameOver';
      for (const vh of post.victory.victoryHexes) {
        const timing = vh.awardTiming ?? 'endOfRound';
        if (timing === 'endOfMission' && !isFinalRoundEnd) continue;
        if (timing === 'specificRounds' && !(vh.awardRounds ?? []).includes(pre.round)) continue;
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
      // §7.13: destroying a Unit immediately clamps its OWN side's CAP down
      // to max(3, capStart - losses) if current CAP exceeds that new ceiling
      // — a real, passive CAP-reduction path completely separate from this
      // Action's own deliberate capCostReduce/capDiceMod spend. Never came up
      // before this Mission: no earlier round's Action could get its own
      // actor's side to lose a Unit mid-Action (e.g. a Move that triggers a
      // fatal Mines Attack against the mover itself, or a Close Combat on a
      // live Mines Hex).
      // §16.1: a destroyed Truck/Wagon (noCapLossOnDestroy) does NOT adjust
      // the CAPs Track — excluded from the loss count, same as destroyUnit's
      // own `if (!tmpl.noCapLossOnDestroy)` guard.
      const ownSideLossesThisAction = Object.keys(pre.units).filter(
        (uid) => pre.units[uid]!.side === side && !post.units[uid] && !pre.templates[pre.units[uid]!.templateId]!.noCapLossOnDestroy,
      ).length;
      const capCeilingAfterLosses = Math.max(3, pre.players[side].capStart - pre.players[side].unitLosses - ownSideLossesThisAction);
      if (!skipCostCheck) {
        const actualCapSpent = preCap[side] - post.players[side].capCurrent;
        const expectedPostCap = Math.min(preCap[side] - expCapNeeded, capCeilingAfterLosses);
        if (post.players[side].capCurrent !== expectedPostCap && process.env.DEBUG_CAP) {
          console.error('DEBUG_CAP mismatch', {
            action,
            preActor: pre.units[id],
            expCost,
            costBeforeReduce,
            requestedReduce,
            requestedDiceMod,
            capsSpentForCost,
            expCapNeeded,
            actualCapSpent,
            ownSideLossesThisAction,
            capCeilingAfterLosses,
            expectedPostCap,
            events: res.events,
          });
        }
        check(
          post.players[side].capCurrent === expectedPostCap,
          '3.3',
          `CAP after engine ${post.players[side].capCurrent} != expected ${expectedPostCap} (spend ${expCapNeeded}, ceiling ${capCeilingAfterLosses}) (${aStr})`,
        );
      }
      const sp = parseSpent(res.events);
      if (skipCostCheck) {
        if (sp) check(sp.fresh === sp.roll > sp.cost, '2.5', `Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
      } else if (expCost > 0) {
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
      // §15.7/§15.9: Moving/Pivoting a loaded Transport carries its passenger
      // along as one Group Action under the hood — 2 Stressed units is
      // correct in that case, not a violation. Mission 1 (every earlier
      // round) never had Transport, so this was always exactly 1 before.
      const hasTransportLink = !!pre.units[id]?.carriedBy || Object.values(pre.units).some((u) => u.carriedBy === id);
      const maxStressed = hasTransportLink ? 2 : 1;
      const stressedSame = Object.values(post.units).filter((u) => u.side === side && u.stressed);
      check(stressedSame.length <= maxStressed, '2.6', `side ${side} has ${stressedSame.length} stressed units (max ${maxStressed})`);
    };

    /** §10.10/§10.11: ONE Group Spent Check; on failure EVERY member goes
     *  Spent; ALL members (and only them) are Stressed regardless of result.
     *  `expGroupCost` is independently recomputed by each case below (from
     *  the pre-state member list), NOT derived from `expectBase`/`actorId`
     *  (those only understand solo Actions and would silently read 0). */
    const verifyGroupEconomy = (
      side: SideId,
      memberIds: UnitId[],
      expGroupCostBeforeReduce: number,
      skipCost = false,
      expCapSpend = 0,
      capCostReduce = 0,
    ) => {
      // §3.2: a Group Action's own `capCostReduce` (never set by any earlier
      // round's AI on a Group-style Action, so this branch was unexercised
      // until this round's 'random' style started drawing LOAD/UNLOAD
      // directly from `legalActions()`'s own enumeration, which — unlike
      // this file's own hand-built GROUP_MOVE/GROUP_ATTACK/GROUP_RALLY
      // candidates — does include cost-reduced variants) works exactly like
      // solo `verifyEconomy`'s own reduction math, just applied to the
      // Group's combined cost instead of one Unit's.
      const capsSpentForCost = Math.min(Math.max(0, capCostReduce), Math.max(0, expGroupCostBeforeReduce));
      const expGroupCost = Math.max(0, expGroupCostBeforeReduce - capsSpentForCost);
      const totalCapSpend = expCapSpend + capsSpentForCost;
      if (!skipCost) {
        check(post.players[side].capCurrent === preCap[side] - totalCapSpend, '3.3', `Group action CAP after engine ${post.players[side].capCurrent} != expected ${preCap[side] - totalCapSpend} (${aStr})`);
      }
      const sp = parseSpent(res.events);
      if (skipCost) {
        if (sp) check(sp.fresh === sp.roll > sp.cost, '2.5', `Group Spent result inconsistent: rolled ${sp.roll} vs ${sp.cost} -> ${sp.fresh}`);
      } else if (expGroupCost > 0) {
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
        // §17.10: Mines don't distinguish side — a Unit can trigger and be
        // destroyed by its own side's minefield mid-Move (never came up
        // before this Mission's mine placement). A destroyed Unit simply no
        // longer exists post-Move, which isn't a failure to arrive.
        const movedUnit = post.units[action.unitId];
        check(!movedUnit || movedUnit.hexId === action.toHexId, '4.5', 'unit did not move to target hex');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'MOVE');
        bump(pre.currentSide, TERRAIN[pre.hexes[action.toHexId]!.terrain].isCover ? 'MOVE_into_cover' : 'MOVE_into_open');
        bumpMoveHeat(moveHeat, action.toHexId, pre.currentSide);
        {
          const moverTmplId = pre.units[action.unitId]!.templateId;
          const s = statsFor(unitTypeStats, moverTmplId);
          s.moves++;
          if (TERRAIN[pre.hexes[action.toHexId]!.terrain].isCover) s.movesIntoCover++;
          else s.movesIntoOpen++;
          // A Unit destroyed by triggering its own (or the enemy's) Mines
          // mid-Move (§17.10) has no attacking Unit to credit — "mines" is
          // the destroyer for the heatmap/attribution table.
          if (!movedUnit) {
            s.destroyed++;
            s.destroyedBy['mines'] = (s.destroyedBy['mines'] ?? 0) + 1;
            bumpHex(hexHeat, action.toHexId, 'destroys');
          }
        }
        // Attribute this Move to the LOS-spread heuristic (row #9/#32) if it
        // genuinely opened a sightline nobody else on the side already had —
        // recomputed post hoc from `pre`, the same helpers chooseAction itself
        // used to score the candidate, rather than threading telemetry
        // through chooseAction's own (otherwise pure) scoring functions.
        telemetry.moveDecisions++;
        {
          const moveEnemies = Object.values(pre.units).filter((e) => e.side !== pre.currentSide);
          const covered = alreadyCoveredEnemies(pre, pre.currentSide, moveEnemies);
          if (losSpreadBonus(pre, action.toHexId, moveEnemies, covered) > 0) telemetry.losSpreadMovesChosen++;
        }
        break;
      }
      // §15.6-15.9: LOAD/UNLOAD have never been dispatched by any earlier
      // round's AI (every prior KV2 harness left Transport entirely unused —
      // "LOAD / UNLOAD (Transport): 0" in every earlier round's own coverage
      // report), so neither had any independent-oracle verification at all
      // until this round's Flak88+Truck route actually used them. Both are
      // Group-style (§15.7/§15.9's own "one Group Spent Check" step 3), so
      // they reuse `verifyGroupEconomy` like GROUP_MOVE/GROUP_ATTACK/
      // GROUP_RALLY, not the solo `verifyEconomy`.
      case 'LOAD': {
        const unit = pre.units[action.unitId]!;
        const vehicle = pre.units[action.vehicleId]!;
        const sameHex = unit.hexId === vehicle.hexId;
        // §15.7: same-hex load uses the Unit's own RAW template Move (no
        // hit-marker deltas) — an asymmetry with UNLOAD's own same-hex case
        // below (which DOES use hit-marker-adjusted Move) that's real in the
        // engine itself (`doLoad` reads `templateOf(...).move` directly,
        // `doUnload` reads `effectiveStats(...).move`), not a harness slip.
        const base = sameHex ? pre.templates[unit.templateId]!.move : expectMoveCost(pre, unit, vehicle.hexId);
        const members = [unit, vehicle];
        const expGroupCost = base + groupStressExp(members);
        check(post.units[action.unitId]?.carriedBy === action.vehicleId, '15.6', 'unit should be carried by the Vehicle after Loading');
        check(post.units[action.unitId]?.hexId === post.units[action.vehicleId]?.hexId, '15.6', 'loaded unit should share the Vehicle\'s hex');
        verifyGroupEconomy(pre.currentSide, [action.unitId, action.vehicleId], expGroupCost, false, 0, action.capCostReduce ?? 0);
        handover(true);
        bump(pre.currentSide, 'LOAD');
        break;
      }
      case 'UNLOAD': {
        const unit = pre.units[action.unitId]!;
        const vehicle = pre.units[unit.carriedBy!]!;
        const sameHex = action.toHexId === vehicle.hexId;
        // §15.9: same-hex unload DOES use hit-marker-adjusted Move (unlike
        // LOAD's own same-hex case above) — see this case's own comment.
        const base = sameHex ? myEff(pre, unit).move : expectMoveCost(pre, unit, action.toHexId);
        const members = [unit, vehicle];
        const expGroupCost = base + groupStressExp(members);
        check(post.units[action.unitId]?.hexId === action.toHexId, '15.9', 'unit should be at the target hex after Unloading');
        check(!post.units[action.unitId]?.carriedBy, '15.9', 'unit should no longer be carried after Unloading');
        if (action.facing !== undefined) check(post.units[action.unitId]?.facing === action.facing, '15.9', 'unload facing should match the requested facing');
        verifyGroupEconomy(pre.currentSide, [action.unitId, vehicle.id], expGroupCost, false, 0, action.capCostReduce ?? 0);
        handover(true);
        bump(pre.currentSide, 'UNLOAD');
        break;
      }
      case 'PIVOT': {
        // Same defensive allowance as MOVE: if the Unit no longer exists
        // post-Action for any reason, that's not a "failed to set facing."
        const pivotedUnit = post.units[action.unitId];
        check(!pivotedUnit || pivotedUnit.facing === action.facing, '4.5', 'pivot did not set facing');
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
      case 'HASTY_DEFENSE': {
        check(post.units[action.unitId]?.hastyDefense === true, '17.6', 'unit should have a Hasty Defense after building one');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'HASTY_DEFENSE');
        telemetry.hastyDefenseBuilds[pre.currentSide]++;
        break;
      }
      case 'REMOVE_HASTY_DEFENSE': {
        // §17.6: free at-will removal — no AP, no Spent Check, no Stress, no
        // turn change (the engine's own doRemoveHastyDefense skips afterAction
        // entirely, unlike every AP-costed Action here).
        check(post.units[action.unitId]?.hastyDefense === false, '17.6', 'unit should have lost its Hasty Defense');
        check(post.players[pre.currentSide].capCurrent === preCap[pre.currentSide], '17.6', 'removal should spend no CAP');
        check(parseSpent(res.events) === null, '17.6', 'removal makes no Spent Check');
        check(post.currentSide === pre.currentSide, '17.6', 'free removal should not change the turn');
        bump(pre.currentSide, 'REMOVE_HASTY_DEFENSE');
        break;
      }
      case 'FIRE_SMOKE': {
        check(post.hexes[action.targetHexId]?.features.smoke === 2, '14.1', 'Fire Smoke should place a fresh Heavy Smoke Marker');
        verifyEconomy(pre.units[action.unitId]!.side, action.unitId);
        handover(true);
        bump(pre.currentSide, 'FIRE_SMOKE');
        telemetry.smokePlacements++;
        statsFor(unitTypeStats, pre.units[action.unitId]!.templateId).smokePlaced++;
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
          telemetry.fireAttempts[attacker.side]++;
          if (roll.hit) telemetry.fireHits[attacker.side]++;
          recordFlak88AndSmokeTelemetry(telemetry, pre, attacker, pre.units[targetId]!, roll.hit);
          statsFor(unitTypeStats, attacker.templateId).attacksMade++;
          recordUnitTypeAttack(unitTypeStats, hexHeat, pre, post, attacker.templateId, targetId, roll.hit);
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
        telemetry.ccAttempts[pre.currentSide]++;
        if (peek.hit) telemetry.ccHits[pre.currentSide]++;
        recordFlak88AndSmokeTelemetry(telemetry, pre, pre.units[action.attackerId]!, pre.units[action.targetId]!, peek.hit);
        statsFor(unitTypeStats, pre.units[action.attackerId]!.templateId).attacksMade++;
        recordUnitTypeAttack(unitTypeStats, hexHeat, pre, post, pre.units[action.attackerId]!.templateId, action.targetId, peek.hit);
        break;
      }
      case 'RALLY': {
        const preU = pre.units[action.unitId]!;
        const peek = rallyPeek!;
        const def = HIT_MARKERS[preU.hitMarkers[0]!];
        let mod = 0;
        const hex = pre.hexes[preU.hexId]!;
        if (TERRAIN[hex.terrain].isCover) mod += 1;
        // §7.8/§14.3: +1 to Rally for being in Smoke, Heavy or Light alike —
        // never came up before this Mission's AI could actually cast Smoke.
        mod += smokeRallyBonus(pre, preU.hexId);
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
        telemetry.rallyAttempts[pre.currentSide]++;
        if (peek.success) telemetry.rallySuccess[pre.currentSide]++;
        {
          const s = statsFor(unitTypeStats, preU.templateId);
          s.rallyAttempts++;
          if (peek.success) s.rallySuccesses++;
        }
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
          const memberPostUnit = post.units[m.unitId];
          // Same Mines-mid-Move allowance as solo MOVE — a Group member can
          // also trigger a fatal Mines Attack on the way to its own Hex.
          check(!memberPostUnit || memberPostUnit.hexId === m.toHexId, '4.5', `${m.unitId} did not move to target hex in Group Move`);
          const memberIsCover = TERRAIN[pre.hexes[m.toHexId]!.terrain].isCover;
          bump(pre.currentSide, memberIsCover ? 'MOVE_into_cover' : 'MOVE_into_open');
          bumpMoveHeat(moveHeat, m.toHexId, pre.currentSide);
          const memberTmplId = pre.units[m.unitId]!.templateId;
          const ms = statsFor(unitTypeStats, memberTmplId);
          ms.moves++;
          if (memberIsCover) ms.movesIntoCover++;
          else ms.movesIntoOpen++;
          if (!memberPostUnit) {
            ms.destroyed++;
            ms.destroyedBy['mines'] = (ms.destroyedBy['mines'] ?? 0) + 1;
            bumpHex(hexHeat, m.toHexId, 'destroys');
          }
        }
        const expGroupCost = maxMove + groupStressExp(preMembers); // §10.4/§10.11
        // See the solo-MOVE `skipCostCheck` note above — the same Bonus-Move
        // pathing gap, and Barbed Wire's genuinely random 1d6 Move Cost,
        // apply per-member here too.
        const groupSkipCost =
          preMembers.some((u) => (pre.templates[u.templateId]!.bonusMoves ?? 0) > 0) ||
          action.moves.some((m) => m.toHexId != null && pre.hexes[m.toHexId]?.features.obstacle?.kind === 'barbedWire');
        verifyGroupEconomy(pre.currentSide, memberIds, expGroupCost, groupSkipCost);
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
        // §3.2: a Group Attack's own capDiceMod (the German doctrine's KV2a-
        // engagement CAP boost, see chooseAction's capDiceModForKv2 — never
        // set by any earlier round's AI, so this whole path was unexercised
        // until now) lowers the Hit Number exactly like a solo Fire/CC's own
        // requestedDiceMod already does — both the peek roll AND the
        // expected Hit Number below need it, or they disagree with what the
        // engine actually rolled.
        // Re-derive via the same dice the engine actually rolled, by peeking
        // the identical roll function with the same pre-state + arBonus.
        if (isCC) {
          const peek = rollCloseCombat(pre, leader, target, requestedDiceMod, arBonus);
          const exp = expectCC(pre, leader, target, arBonus);
          const expHitNumber = exp.hitNumber - requestedDiceMod;
          check(peek.ar === exp.ar, '6.11', `Group CC AR: engine ${peek.ar} != expected ${exp.ar}`);
          check(peek.hitNumber === expHitNumber, '6.11', `Group CC Hit Number: engine ${peek.hitNumber} != expected ${expHitNumber} (capDiceMod ${requestedDiceMod})`);
          verifyHit(pre, post, action.targetId, peek.hit, peek.critical, check);
          telemetry.ccAttempts[leader.side]++;
          if (peek.hit) telemetry.ccHits[leader.side]++;
          recordFlak88AndSmokeTelemetry(telemetry, pre, leader, target, peek.hit);
          statsFor(unitTypeStats, leader.templateId).attacksMade++;
          recordUnitTypeAttack(unitTypeStats, hexHeat, pre, post, leader.templateId, action.targetId, peek.hit);
        } else {
          const stack = rollStackFire(pre, leader, target.hexId, requestedDiceMod, arBonus);
          for (const { targetId, roll } of stack.rolls) {
            const exp = expectFire(pre, leader, pre.units[targetId]!, arBonus);
            if (!exp) continue;
            const expHitNumber = exp.hitNumber - requestedDiceMod;
            check(roll.ar === exp.ar, '6.1', `Group Fire AR: engine ${roll.ar} != expected ${exp.ar} (arBonus ${arBonus})`);
            check(roll.hitNumber === expHitNumber, '6.8', `Group Fire Hit Number: engine ${roll.hitNumber} != expected ${expHitNumber} (capDiceMod ${requestedDiceMod})`);
            verifyHit(pre, post, targetId, roll.hit, roll.critical, check);
            telemetry.fireAttempts[leader.side]++;
            if (roll.hit) telemetry.fireHits[leader.side]++;
            recordFlak88AndSmokeTelemetry(telemetry, pre, leader, pre.units[targetId]!, roll.hit);
            statsFor(unitTypeStats, leader.templateId).attacksMade++;
            recordUnitTypeAttack(unitTypeStats, hexHeat, pre, post, leader.templateId, targetId, roll.hit);
          }
        }
        // §16.2: a Turreted leader firing outside its own facing Arc (ranged
        // only — Close Combat has no Arc requirement) pays +2AP, same as a
        // solo FIRE — never came up before this Mission (no Turreted Vehicles
        // led a Group Attack in any earlier round).
        const leaderOutOfArc = !isCC && !inArc(leader.hexId, leader.facing, target.hexId);
        const leaderArcPenalty = leaderOutOfArc && pre.templates[leader.templateId]!.turreted ? 2 : 0;
        const expGroupCost = myEff(pre, leader).apToFire + leaderArcPenalty + groupStressExp(preMembers); // §10.8/§10.11
        verifyGroupEconomy(pre.currentSide, memberIds, expGroupCost, false, Math.abs(requestedDiceMod));
        handover(true);
        bump(pre.currentSide, 'GROUP_ATTACK');
        telemetry.groupAttackUses[pre.currentSide]++;
        break;
      }
      case 'GROUP_RALLY': {
        const memberIds = action.unitIds;
        const preMembers = memberIds.map((id) => pre.units[id]!);
        for (const id of memberIds) {
          const preU = pre.units[id]!;
          const def = HIT_MARKERS[preU.hitMarkers[0]!];
          let mod = 0;
          const hex = pre.hexes[preU.hexId]!;
          if (TERRAIN[hex.terrain].isCover) mod += 1;
        // §7.8/§14.3: +1 to Rally for being in Smoke, Heavy or Light alike —
        // never came up before this Mission's AI could actually cast Smoke.
        mod += smokeRallyBonus(pre, preU.hexId);
          for (const o of Object.values(pre.units)) {
            if (o.id !== preU.id && o.side === preU.side && o.hexId === preU.hexId && o.hitMarkers.length === 0) mod += 1;
          }
          const postU = post.units[id];
          check(!!postU, '7.4', `${id} should still exist after a Group Rally`);
          if (postU) check(postU.hitMarkers.length === 0 || postU.hitMarkers.length === preU.hitMarkers.length, '7.7', `${id}'s marker count should be 0 (rallied) or unchanged (failed)`);
          const rs = statsFor(unitTypeStats, preU.templateId);
          rs.rallyAttempts++;
          if (postU && postU.hitMarkers.length === 0) rs.rallySuccesses++;
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
    telemetry,
    unitTypeStats,
    hexHeat,
    moveHeat,
  };
}

// ---------------------------------------------------------------------------
// 2000-game statistical round (follow-up to the 25-game playability smoke
// tests): a 200-game random-vs-random control block + an 1800-game 5x5
// style grid (balanced/ap_econ/defense/combat_group/vp_focus), 72 games per
// pairing — per the user's ask for "stats on heuristics used and fail/
// success rate," "smoke use for defense and LOS," "how often the 88 got to
// fire," and per-side/heuristic win margins.
// ---------------------------------------------------------------------------

type ResultWithBlock = GameResult & { block: 'control' | 'heuristic' };
const results: ResultWithBlock[] = [];
let seedCounter = 950001;

const HEURISTICS: Style[] = ['balanced', 'ap_econ', 'defense', 'combat_group', 'vp_focus'];
console.log(`Conflict of Heroes — 200-game "German doctrine, round 2" self-play analysis (AtB Firefight 9 - KV2, v3 rules)`);
console.log(`Scheduled 200 games (25 random-vs-random control + 175 across the 5x5 heuristic grid, 7 each)...\n`);
console.log(`German (side A) scripted route active in every non-random game: Pioneer M01->[smoke N02]->N01->[smoke O01]->O01 hold; Flak88+Truck LOAD->N01->O01->UNLOAD facing KV2a->FIRE (max CAP); 4 Panzers N01->O01->P01->Q01->S12(Map4)->S01(Map5); Rifles+MG34 to F07/G07/H08 then normal (KV2a-dead pull to J01). Soviet side untouched (no doctrine-1 carryover).\n`);

for (let k = 0; k < 25; k++) results.push({ ...playGame(seedCounter++, 'random', 'random'), block: 'control' });
const pairs: [Style, Style][] = [];
for (const sa of HEURISTICS) for (const sb of HEURISTICS) pairs.push([sa, sb]);
for (let i = 0; i < 175; i++) {
  const [sa, sb] = pairs[i % pairs.length]!;
  results.push({ ...playGame(seedCounter++, sa, sb), block: 'heuristic' });
}

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
let marginSum = 0;
let groupEntryGames = 0;
let setupPlaceGames = 0;
const coverageTotals: Record<string, number> = {};
const winsByStyleAsA: Record<Style, number> = { balanced: 0, ap_econ: 0, defense: 0, combat_group: 0, vp_focus: 0, random: 0 };
const winsByStyleAsB: Record<Style, number> = { balanced: 0, ap_econ: 0, defense: 0, combat_group: 0, vp_focus: 0, random: 0 };
const gamesByStyleAsA: Record<Style, number> = { balanced: 0, ap_econ: 0, defense: 0, combat_group: 0, vp_focus: 0, random: 0 };
const gamesByStyleAsB: Record<Style, number> = { balanced: 0, ap_econ: 0, defense: 0, combat_group: 0, vp_focus: 0, random: 0 };
// Signed margin per style (+ when that style won, − when its opponent won) —
// "record win margins for each side, i.e. +1.5VP for heuristic."
const signedMarginByStyleAsA: Record<Style, number[]> = { balanced: [], ap_econ: [], defense: [], combat_group: [], vp_focus: [], random: [] };
const signedMarginByStyleAsB: Record<Style, number[]> = { balanced: [], ap_econ: [], defense: [], combat_group: [], vp_focus: [], random: [] };
const T = emptyTelemetry();
let flak88FiredGames = 0;
const unitTypeStats: UnitTypeStatsMap = {};
const hexHeat: HexHeat = {};
const moveHeat: MoveHeat = {};

for (const r of results) {
  if (r.winner) winsBySide[r.winner]++;
  marginSum += r.margin;
  if (r.groupEntryUsed.A || r.groupEntryUsed.B) groupEntryGames++;
  gamesByStyleAsA[r.styleA]++;
  gamesByStyleAsB[r.styleB]++;
  if (r.winner === 'A') winsByStyleAsA[r.styleA]++;
  if (r.winner === 'B') winsByStyleAsB[r.styleB]++;
  const signedA = r.winner === 'A' ? r.margin : r.winner === 'B' ? -r.margin : 0;
  signedMarginByStyleAsA[r.styleA].push(signedA);
  signedMarginByStyleAsB[r.styleB].push(-signedA);
  for (const side of ['A', 'B'] as SideId[]) {
    for (const [k, v] of Object.entries(r.coverage[side])) {
      coverageTotals[k] = (coverageTotals[k] ?? 0) + v;
      if (k === 'SETUP_PLACE') setupPlaceGames++;
    }
  }
  // Sum this game's telemetry into the running total.
  T.fireAttempts.A += r.telemetry.fireAttempts.A; T.fireAttempts.B += r.telemetry.fireAttempts.B;
  T.fireHits.A += r.telemetry.fireHits.A; T.fireHits.B += r.telemetry.fireHits.B;
  T.ccAttempts.A += r.telemetry.ccAttempts.A; T.ccAttempts.B += r.telemetry.ccAttempts.B;
  T.ccHits.A += r.telemetry.ccHits.A; T.ccHits.B += r.telemetry.ccHits.B;
  T.rallyAttempts.A += r.telemetry.rallyAttempts.A; T.rallyAttempts.B += r.telemetry.rallyAttempts.B;
  T.rallySuccess.A += r.telemetry.rallySuccess.A; T.rallySuccess.B += r.telemetry.rallySuccess.B;
  T.hastyDefenseBuilds.A += r.telemetry.hastyDefenseBuilds.A; T.hastyDefenseBuilds.B += r.telemetry.hastyDefenseBuilds.B;
  T.groupAttackUses.A += r.telemetry.groupAttackUses.A; T.groupAttackUses.B += r.telemetry.groupAttackUses.B;
  T.smokePlacements += r.telemetry.smokePlacements;
  T.smokedTargetFireAttempts += r.telemetry.smokedTargetFireAttempts;
  T.smokedTargetFireHits += r.telemetry.smokedTargetFireHits;
  T.unsmokedTargetFireAttempts += r.telemetry.unsmokedTargetFireAttempts;
  T.unsmokedTargetFireHits += r.telemetry.unsmokedTargetFireHits;
  T.losSpreadMovesChosen += r.telemetry.losSpreadMovesChosen;
  T.moveDecisions += r.telemetry.moveDecisions;
  T.flak88FireAttempts += r.telemetry.flak88FireAttempts;
  T.flak88FireHits += r.telemetry.flak88FireHits;
  T.flak88TargetedBySoviets += r.telemetry.flak88TargetedBySoviets;
  T.totalSovietAttacksOnGermanUnits += r.telemetry.totalSovietAttacksOnGermanUnits;
  if (r.telemetry.flak88FiredThisGame) flak88FiredGames++;

  // Merge this game's per-unit-type stats into the running total.
  for (const [templateId, s] of Object.entries(r.unitTypeStats)) {
    const agg = statsFor(unitTypeStats, templateId);
    agg.moves += s.moves;
    agg.movesIntoCover += s.movesIntoCover;
    agg.movesIntoOpen += s.movesIntoOpen;
    agg.attacksMade += s.attacksMade;
    agg.attackHits += s.attackHits;
    agg.firedUpon += s.firedUpon;
    agg.hit += s.hit;
    agg.rallyAttempts += s.rallyAttempts;
    agg.rallySuccesses += s.rallySuccesses;
    agg.smokePlaced += s.smokePlaced;
    agg.destroyed += s.destroyed;
    for (const [byId, n] of Object.entries(s.destroyedBy)) {
      agg.destroyedBy[byId] = (agg.destroyedBy[byId] ?? 0) + n;
    }
  }
  // Merge this game's hex heatmap into the running total.
  for (const [hexId, h] of Object.entries(r.hexHeat)) {
    bumpHexBy(hexHeat, hexId, 'hits', h.hits);
    bumpHexBy(hexHeat, hexId, 'destroys', h.destroys);
  }
  // Merge this game's per-side move heatmap into the running total.
  for (const [hexId, h] of Object.entries(r.moveHeat)) {
    if (!moveHeat[hexId]) moveHeat[hexId] = { A: 0, B: 0 };
    moveHeat[hexId]!.A += h.A;
    moveHeat[hexId]!.B += h.B;
  }
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const pct = (n: number, d: number) => (d > 0 ? ((100 * n) / d).toFixed(1) + '%' : 'n/a');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);

console.log(`\n--- Outcome summary ---`);
console.log(`  Side A (Germans): ${winsBySide.A}/${results.length} (${pct(winsBySide.A, results.length)})`);
console.log(`  Side B (Soviets): ${winsBySide.B}/${results.length} (${pct(winsBySide.B, results.length)})`);
console.log(`  Average VP margin: ${(marginSum / results.length).toFixed(2)}`);
console.log(`  Games where a Group Entry (>1 Unit, one Action) was used: ${groupEntryGames}/${results.length}`);
console.log(`  Games with at least one SETUP_PLACE Action: ${setupPlaceGames > 0 ? results.length : 0}/${results.length}`);

console.log(`\n--- Heuristic (style) win rate and signed win margin ---`);
for (const s of HEURISTICS) {
  const gamesPlayed = gamesByStyleAsA[s] + gamesByStyleAsB[s];
  const wins = winsByStyleAsA[s] + winsByStyleAsB[s];
  const allSigned = [...signedMarginByStyleAsA[s], ...signedMarginByStyleAsB[s]];
  console.log(
    `  ${s.padEnd(13)}: ${wins}/${gamesPlayed} (${pct(wins, gamesPlayed)}) | as A: ${winsByStyleAsA[s]}/${gamesByStyleAsA[s]} (avg margin ${fmtSigned(avg(signedMarginByStyleAsA[s]))} VP) | ` +
      `as B: ${winsByStyleAsB[s]}/${gamesByStyleAsB[s]} (avg margin ${fmtSigned(avg(signedMarginByStyleAsB[s]))} VP) | overall avg margin ${fmtSigned(avg(allSigned))} VP`,
  );
}
const controlGames = results.filter((r) => r.block === 'control').length;
console.log(
  `  random       : (control only, ${results.filter((r) => r.block === 'control' && r.winner === 'A').length}/${controlGames} as A) | ` +
    `overall avg margin ${fmtSigned(avg(results.filter((r) => r.block === 'control').map((r) => (r.winner === 'A' ? r.margin : r.winner === 'B' ? -r.margin : 0))))} VP`,
);

console.log(`\n--- Fail/success rate by Action type (both sides) ---`);
console.log(`  Fire         : A ${T.fireHits.A}/${T.fireAttempts.A} hit (${pct(T.fireHits.A, T.fireAttempts.A)}) | B ${T.fireHits.B}/${T.fireAttempts.B} hit (${pct(T.fireHits.B, T.fireAttempts.B)})`);
console.log(`  Close Combat : A ${T.ccHits.A}/${T.ccAttempts.A} hit (${pct(T.ccHits.A, T.ccAttempts.A)}) | B ${T.ccHits.B}/${T.ccAttempts.B} hit (${pct(T.ccHits.B, T.ccAttempts.B)})`);
console.log(`  Rally        : A ${T.rallySuccess.A}/${T.rallyAttempts.A} success (${pct(T.rallySuccess.A, T.rallyAttempts.A)}) | B ${T.rallySuccess.B}/${T.rallyAttempts.B} success (${pct(T.rallySuccess.B, T.rallyAttempts.B)})`);
console.log(`  Hasty Defense built: A ${T.hastyDefenseBuilds.A} | B ${T.hastyDefenseBuilds.B}`);
console.log(`  Group Attack used  : A ${T.groupAttackUses.A} | B ${T.groupAttackUses.B}`);

console.log(`\n--- Smoke: usage, and its actual defensive effect ---`);
console.log(`  Fire Smoke placements (German-only capability): ${T.smokePlacements}`);
console.log(
  `  Hit rate vs. a SMOKED target  : ${T.smokedTargetFireHits}/${T.smokedTargetFireAttempts} (${pct(T.smokedTargetFireHits, T.smokedTargetFireAttempts)})`,
);
console.log(
  `  Hit rate vs. an UNSMOKED target: ${T.unsmokedTargetFireHits}/${T.unsmokedTargetFireAttempts} (${pct(T.unsmokedTargetFireHits, T.unsmokedTargetFireAttempts)})`,
);

console.log(`\n--- LOS-spread heuristic usage ---`);
console.log(
  `  Moves attributably chosen for opening a new sightline: ${T.losSpreadMovesChosen}/${T.moveDecisions} (${pct(T.losSpreadMovesChosen, T.moveDecisions)})`,
);

console.log(`\n--- Flak 18 88mm: how often did it get to fire? ---`);
console.log(`  Games where the Flak88 fired at least once: ${flak88FiredGames}/${results.length} (${pct(flak88FiredGames, results.length)})`);
console.log(`  Total Flak88 fire attempts: ${T.flak88FireAttempts} | hits: ${T.flak88FireHits} (${pct(T.flak88FireHits, T.flak88FireAttempts)})`);
console.log(
  `  Soviet "fear the Flak88" targeting rate: ${T.flak88TargetedBySoviets}/${T.totalSovietAttacksOnGermanUnits} of all Soviet attacks on German units (${pct(T.flak88TargetedBySoviets, T.totalSovietAttacksOnGermanUnits)})`,
);

console.log(`\n--- Action mix (summed over all ${results.length} games, both sides) ---`);
console.log(`  ${Object.entries(coverageTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);

console.log(`\n--- New-mechanic coverage check ---`);
console.log(`  SETUP_PLACE (Pre-Mission Setup):    ${coverageTotals['SETUP_PLACE'] ?? 0}`);
console.log(`  HIDDEN_MOVE:                        ${coverageTotals['HIDDEN_MOVE'] ?? 0}`);
console.log(`  RECON_BY_FIRE:                       ${coverageTotals['RECON_BY_FIRE'] ?? 0}`);
console.log(`  INDIRECT_FIRE (Mortar):              ${coverageTotals['INDIRECT_FIRE'] ?? 0}`);
console.log(`  LOAD / UNLOAD (Transport):           ${(coverageTotals['LOAD'] ?? 0) + (coverageTotals['UNLOAD'] ?? 0)}`);
console.log(`  PIVOT:                                ${coverageTotals['PIVOT'] ?? 0}`);

// ---------------------------------------------------------------------------
// Per-unit-type behavior stats (the user's explicit ask: "each time unit
// moves, moves into cover or open, attacks, attacks and hits, is fired upon,
// is hit, rallies, smoke placed, side passes, unit is destroyed and by
// which unit"). "Side passes" is already covered by the coverageTotals'
// PASS count above — no separate per-unit tracking needed, a Pass has no
// acting unit.
// ---------------------------------------------------------------------------
console.log(`\n--- Per-unit-type behavior stats (summed over all ${results.length} games) ---`);
const templateIds = Object.keys(unitTypeStats).sort();
for (const tid of templateIds) {
  const s = unitTypeStats[tid]!;
  const destroyedByStr = Object.entries(s.destroyedBy)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(', ') || 'n/a';
  console.log(`  ${tid}`);
  console.log(
    `    moves ${s.moves} (into cover ${s.movesIntoCover} / into open ${s.movesIntoOpen}) | ` +
      `attacks ${s.attacksMade} (hits ${s.attackHits}, ${pct(s.attackHits, s.attacksMade)}) | ` +
      `fired upon ${s.firedUpon} (hit ${s.hit}, ${pct(s.hit, s.firedUpon)}) | ` +
      `rally ${s.rallySuccesses}/${s.rallyAttempts} (${pct(s.rallySuccesses, s.rallyAttempts)}) | ` +
      `smoke placed ${s.smokePlaced} | destroyed ${s.destroyed} (by: ${destroyedByStr})`,
  );
}

// ---------------------------------------------------------------------------
// Hex heatmap — top hexes by combined hits+destroys, plus a full JSON export
// (pixel-position-annotated via the same flat-top axialToPixel the live
// board uses) for the published Artifact report to render as an SVG.
// ---------------------------------------------------------------------------
console.log(`\n--- Hex heatmap: top 15 hexes by hits, then destroys ---`);
const heatEntries = Object.entries(hexHeat).sort((a, b) => b[1].hits + b[1].destroys - (a[1].hits + a[1].destroys));
for (const [hexId, h] of heatEntries.slice(0, 15)) {
  const label = ATB_FIREFIGHT_9_KV2_MISSION.hexes.find((hx) => hx.id === hexId)?.label ?? hexId;
  console.log(`  ${label.padEnd(10)}: hits ${h.hits}, destroys ${h.destroys}`);
}
console.log(`  Total distinct hexes with at least one hit: ${heatEntries.length}`);

// ---------------------------------------------------------------------------
// Move heatmap — this round's own new ask: "a heatmap of hexes moved into by
// Germans and Soviets" (grey for German, red for Soviet in the rendered
// report) — a direct check on whether the road/SE/SW dispersal doctrine
// actually spreads German movement out, versus the 120-game round's own
// finding that combat concentrated hard on a few central-column Hexes.
// ---------------------------------------------------------------------------
console.log(`\n--- Move heatmap: top 15 hexes by combined German+Soviet moves-into ---`);
const moveEntries = Object.entries(moveHeat).sort((a, b) => b[1].A + b[1].B - (a[1].A + a[1].B));
for (const [hexId, h] of moveEntries.slice(0, 15)) {
  const label = ATB_FIREFIGHT_9_KV2_MISSION.hexes.find((hx) => hx.id === hexId)?.label ?? hexId;
  console.log(`  ${label.padEnd(10)}: German ${h.A}, Soviet ${h.B}`);
}
console.log(`  Total distinct hexes moved into: ${moveEntries.length}`);
const totalGermanMoves = Object.values(moveHeat).reduce((n, h) => n + h.A, 0);
const totalSovietMoves = Object.values(moveHeat).reduce((n, h) => n + h.B, 0);
const germanColumnSpread = new Set(Object.entries(moveHeat).filter(([, h]) => h.A > 0).map(([id]) => parseHexId(id).q));
console.log(`  German moves: ${totalGermanMoves} total, spread across ${germanColumnSpread.size} distinct columns (q values)`);

const heatmapExport = {
  missionId: ATB_FIREFIGHT_9_KV2_MISSION.id,
  hexes: ATB_FIREFIGHT_9_KV2_MISSION.hexes.map((hx) => ({
    id: hx.id,
    label: hx.label,
    terrain: hx.terrain,
    px: axialToPixel(parseHexId(hx.id)),
  })),
  heat: hexHeat,
  moveHeat,
  unitTypeStats,
};
try {
  const outPath = path.join(process.cwd(), 'selfplaykv2doctrine2-export.json');
  fs.writeFileSync(outPath, JSON.stringify(heatmapExport));
  console.log(`\nWrote heatmap/unit-stats export to ${outPath}`);
} catch (e) {
  console.log(`\n(could not write JSON export: ${(e as Error).message})`);
}

process.exitCode = totalViolations > 0 ? 1 : 0;
