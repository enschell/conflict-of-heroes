/**
 * Combat resolution (rulebook v3 §6.0–§6.11).
 *
 *   AR = Firepower(target's DR colour) + AR modifiers (range, close combat)
 *   DR = Defense(front if attacker in target's arc, else flank) + terrain/wall DM
 *   Hit Number = DR − AR (− CAP dice mod, §3.2)
 *   A 2d6 roll ≥ Hit Number is a Hit; Critical (instant kill) if it exceeds the
 *   Hit Number by 4+ (§6.8 / §7.1).
 *
 * (The algebra is identical to the 2nd-ed AV = FP + 2d6 ≥ DV; v3 just names the
 *  static Attack/Defense Ratings AR/DR and compares the dice to DR − AR.)
 */
import { distance, idOf, lineDraw, parseHexId } from './hex';
import { effectiveStats, templateOf } from './hits';
import { hasLOS, inArc } from './los';
import { fpRangeModifier, rangeBand, type RangeBand } from './range';
import { roll2d6 } from './rng';
import { terrainDM } from './terrain';
import { directionTo } from './movement';
import type { DRColor, GameState, RngState, SideId, Unit, UnitId } from './types';

/** +1 DM if the shot crosses a wall in/bordering the target hex (§5.0.2). */
function wallDMForFire(state: GameState, attackerHexId: string, targetHexId: string): number {
  const line = lineDraw(parseHexId(attackerHexId), parseHexId(targetHexId));
  if (line.length < 2) return 0;
  const prev = idOf(line[line.length - 2]!); // hex the shot enters the target from
  const dir = directionTo(targetHexId, prev);
  if (dir < 0) return 0;
  const target = state.hexes[targetHexId];
  const prevHex = state.hexes[prev];
  const opp = (dir + 3) % 6;
  return target?.walls[dir] || prevHex?.walls[opp] ? 1 : 0;
}

export interface AttackContext {
  legal: boolean;
  reason?: string;
  band: RangeBand;
  fpColor: DRColor;
  /** Attack Rating: attacker Firepower of the target's colour + range/CC mods. */
  ar: number;
  /** Defense Rating: target Defense (front/flank) + terrain/wall DM. */
  dr: number;
  /** Hit Number the 2d6 must reach = DR − AR (before any CAP dice mod). */
  hitNumber: number;
  /** True if resolved against the target's flank DR. */
  isFlank: boolean;
}

/** Compute the static combat picture (no dice). Used by the UI for previews. */
export function attackContext(
  state: GameState,
  attacker: Unit,
  target: Unit,
  _capMod = 0,
): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  const dist = distance(parseHexId(attacker.hexId), parseHexId(target.hexId));
  const band = rangeBand(dist, aEff.range);
  const fpColor = tEff.dr.color;

  if (!aEff.canFire) return fail('unit cannot fire', band, fpColor);
  if (attacker.id === target.id) return fail('cannot fire at self', band, fpColor);
  if (attacker.side === target.side) return fail('friendly target', band, fpColor);
  // While an enemy shares your hex you may not fire/sight out of it (§7.7.3) —
  // your only attack is close combat against units in the hex.
  if (
    target.hexId !== attacker.hexId &&
    Object.values(state.units).some((u) => u.side !== attacker.side && u.hexId === attacker.hexId)
  )
    return fail('enemy in your hex — must close combat', band, fpColor);
  if (!inArc(attacker.hexId, attacker.facing, target.hexId))
    return fail('target out of arc', band, fpColor);
  if (!hasLOS(state, attacker.hexId, target.hexId)) return fail('no line of sight', band, fpColor);
  if (band === 'out') return fail('out of range', band, fpColor);

  const attackerInTargetFront = inArc(target.hexId, target.facing, attacker.hexId);
  const isFlank = !attackerInTargetFront;
  const defense = attackerInTargetFront ? tEff.dr.front : tEff.dr.flank;
  const dr = defense + terrainDM(state, target.hexId) + wallDMForFire(state, attacker.hexId, target.hexId);
  const ar = (fpColor === 'red' ? aEff.fp.red : aEff.fp.blue) + fpRangeModifier(band);

  return { legal: true, band, fpColor, ar, dr, hitNumber: dr - ar, isFlank };
}

function fail(reason: string, band: RangeBand, fpColor: DRColor): AttackContext {
  return { legal: false, reason, band, fpColor, ar: 0, dr: 0, hitNumber: 0, isFlank: false };
}

export interface AttackRoll {
  legal: boolean;
  reason?: string;
  /** Attack Rating (Firepower + mods, static — no dice). */
  ar: number;
  /** Defense Rating (Defense + terrain/wall DM). */
  dr: number;
  /** Hit Number the dice had to reach = DR − AR − CAP dice mod (§3.2, §6.8). */
  hitNumber: number;
  dice: [number, number];
  /** The 2d6 total rolled. */
  total: number;
  hit: boolean;
  critical: boolean;
  isFlank: boolean;
  fpColor: DRColor;
  band: RangeBand;
  rng: RngState;
}

/**
 * Roll an attack. Pure: consumes the RNG from state and returns the advanced
 * RNG. The reducer applies the consequences (draw hit / destroy).
 */
export function rollAttack(
  state: GameState,
  attacker: Unit,
  target: Unit,
  capMod = 0,
): AttackRoll {
  const ctx = attackContext(state, attacker, target, capMod);
  if (!ctx.legal) {
    return {
      legal: false,
      reason: ctx.reason,
      ar: 0,
      dr: 0,
      hitNumber: 0,
      dice: [0, 0],
      total: 0,
      hit: false,
      critical: false,
      isFlank: false,
      fpColor: ctx.fpColor,
      band: ctx.band,
      rng: state.rng,
    };
  }
  const { value, dice, rng } = roll2d6(state.rng);
  // CAPs lower the Hit Number before the roll (§3.2); the dice must reach it.
  const hitNumber = ctx.dr - ctx.ar - capMod;
  const hit = value >= hitNumber;
  const critical = value >= hitNumber + 4;
  return {
    legal: true,
    ar: ctx.ar,
    dr: ctx.dr,
    hitNumber,
    dice,
    total: value,
    hit,
    critical,
    isFlank: ctx.isFlank,
    fpColor: ctx.fpColor,
    band: ctx.band,
    rng,
  };
}

// ---------------------------------------------------------------------------
// Close combat (§7.7.3): an attack against an enemy in the SAME hex. No arc,
// LOS, or range check. FP is +4 (or −2 for white-boxed crew weapons), always
// resolved against the target's flank DR plus terrain DMs.
// ---------------------------------------------------------------------------

export function closeCombatContext(state: GameState, attacker: Unit, target: Unit): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  const fpColor = tEff.dr.color;

  if (!aEff.canFire) return fail('unit cannot fight', 'short', fpColor);
  if (attacker.id === target.id) return fail('cannot close-combat self', 'short', fpColor);
  if (attacker.side === target.side) return fail('friendly target', 'short', fpColor);
  if (attacker.hexId !== target.hexId) return fail('not in the same hex', 'short', fpColor);

  const ccMod = templateOf(state, attacker).whiteBoxFp ? -2 : 4;
  const ar = (fpColor === 'red' ? aEff.fp.red : aEff.fp.blue) + ccMod;
  const dr = tEff.dr.flank + terrainDM(state, target.hexId);
  return { legal: true, band: 'short', fpColor, ar, dr, hitNumber: dr - ar, isFlank: true };
}

export function rollCloseCombat(
  state: GameState,
  attacker: Unit,
  target: Unit,
  capMod = 0,
): AttackRoll {
  const ctx = closeCombatContext(state, attacker, target);
  if (!ctx.legal) {
    return {
      legal: false,
      reason: ctx.reason,
      ar: 0,
      dr: 0,
      hitNumber: 0,
      dice: [0, 0],
      total: 0,
      hit: false,
      critical: false,
      isFlank: true,
      fpColor: ctx.fpColor,
      band: ctx.band,
      rng: state.rng,
    };
  }
  const { value, dice, rng } = roll2d6(state.rng);
  const hitNumber = ctx.dr - ctx.ar - capMod;
  const hit = value >= hitNumber;
  const critical = value >= hitNumber + 4;
  return {
    legal: true,
    ar: ctx.ar,
    dr: ctx.dr,
    hitNumber,
    dice,
    total: value,
    hit,
    critical,
    isFlank: true,
    fpColor: ctx.fpColor,
    band: ctx.band,
    rng,
  };
}

// ---------------------------------------------------------------------------
// Stacked fire (§7.5.1): a single shot at a hex resolves against EVERY enemy
// unit stacked there, each with its own dice roll, for one AP cost. Targets are
// resolved in a deterministic id order so a UI preview and the reducer (which
// roll from the same seeded RNG) produce identical dice.
// ---------------------------------------------------------------------------

/** Enemy units sharing `hexId`, sorted by id for deterministic resolution. */
export function enemiesInHex(state: GameState, side: SideId, hexId: string): Unit[] {
  return Object.values(state.units)
    .filter((u) => u.side !== side && u.hexId === hexId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface StackFireRoll {
  targetId: UnitId;
  roll: AttackRoll;
}

export interface StackFireResult {
  rolls: StackFireRoll[];
  /** RNG after rolling every target in the stack. */
  rng: RngState;
}

/**
 * Resolve a shot at the whole of `targetHexId` (§7.5.1). Pure: threads the RNG
 * through one roll per stacked enemy and returns the advanced RNG; the reducer
 * applies the consequences and charges the (single) AP cost.
 */
export function rollStackFire(
  state: GameState,
  attacker: Unit,
  targetHexId: string,
  capMod = 0,
): StackFireResult {
  const targets = enemiesInHex(state, attacker.side, targetHexId);
  const rolls: StackFireRoll[] = [];
  let rng = state.rng;
  for (const t of targets) {
    const roll = rollAttack({ ...state, rng }, attacker, t, capMod);
    rolls.push({ targetId: t.id, roll });
    rng = roll.rng;
  }
  return { rolls, rng };
}
