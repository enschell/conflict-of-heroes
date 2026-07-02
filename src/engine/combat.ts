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
import { smokeAttackPenalty, smokeDefenseBonus, smokeLosDrBonus } from './smoke';
import { terrainDM, terrainOf } from './terrain';
import { directionTo } from './movement';
import type { DRColor, GameState, RngState, SideId, Unit, UnitId } from './types';

/** +1 DM if the shot crosses a wall in/bordering the target hex (§5.0.2). */
export function wallDMForFire(state: GameState, attackerHexId: string, targetHexId: string): number {
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

/**
 * §15.15 Vehicles as Cover: a foot Unit sharing its hex with a friendly Vehicle
 * gains +1 DR — but NOT while actually being Transported by one (§15.15's own
 * exclusion; a Transported Unit shares its carrier's hex too, so it must be
 * excluded here explicitly, or it would double up with the APC Transport Bonus).
 */
function vehicleCoverBonus(state: GameState, target: Unit): number {
  if (target.carriedBy) return 0;
  if (templateOf(state, target).kind === 'vehicle') return 0;
  const covered = Object.values(state.units).some(
    (u) =>
      u.id !== target.id &&
      u.side === target.side &&
      u.hexId === target.hexId &&
      templateOf(state, u).kind === 'vehicle',
  );
  return covered ? 1 : 0;
}

/**
 * §16.6 APC Transport Bonus: a Soft Target being Transported by an APC (marked
 * `apcTransport`) gains +2DR from all flanks.
 */
function apcTransportBonus(state: GameState, target: Unit): number {
  if (!target.carriedBy) return 0;
  const carrier = state.units[target.carriedBy];
  return carrier && templateOf(state, carrier).apcTransport ? 2 : 0;
}

/**
 * §13.9 Air Burst: a red-Flank (soft) target loses the Heavy Woods +2DR
 * Defensive Terrain Bonus when hit by a High Explosive (Mortar/Artillery)
 * Attack — the tree-burst rains fragments down instead of the woods shielding
 * it. Every other terrain DM (and armored targets) is unaffected.
 */
function terrainDMForAttack(state: GameState, hexId: string, fpColor: DRColor, isHE: boolean): number {
  const hex = state.hexes[hexId];
  if (!hex) return 0;
  if (isHE && fpColor === 'red' && hex.terrain === 'woodsHeavy') return 0;
  return terrainOf(hex).dm;
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
  /**
   * True if the target is outside the attacker's Arc of Fire. Only reachable
   * (without denial) for a Turreted Vehicle (§16.2), which pays +2AP for it;
   * always false for Close Combat (no arc requirement).
   */
  outOfArc: boolean;
}

/**
 * Compute the static combat picture (no dice). Used by the UI for previews.
 * `arBonus` is the Group Support Bonus (+1AR per Supporting Unit, §10.7).
 */
export function attackContext(
  state: GameState,
  attacker: Unit,
  target: Unit,
  _capMod = 0,
  arBonus = 0,
): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  const dist = distance(parseHexId(attacker.hexId), parseHexId(target.hexId));
  const band = rangeBand(dist, aEff.range);
  const fpColor = tEff.dr.color;
  // §13.0/§13.9: Mortars fire High Explosive — always vs the target's Flank
  // Defense (both Direct and Indirect Attacks), with the Air Burst exception
  // above; they also may not fire closer than their Minimum Range (§13.1).
  const attackerTmpl = templateOf(state, attacker);
  const isHE = attackerTmpl.kind === 'mortar';
  const minRange = attackerTmpl.minRange ?? 0;

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
  if (dist < minRange) return fail('inside Minimum Range (§13.1)', band, fpColor);
  // §16.2: a Turreted Vehicle may fire outside its Arc without pivoting (for a
  // +2AP Attack Cost the caller applies); everyone else is denied out of arc.
  const outOfArc = !inArc(attacker.hexId, attacker.facing, target.hexId);
  if (outOfArc && !attackerTmpl.turreted) return fail('target out of arc', band, fpColor);
  if (!hasLOS(state, attacker.hexId, target.hexId)) return fail('no line of sight', band, fpColor);
  if (band === 'out') return fail('out of range', band, fpColor);

  const attackerInTargetFront = !isHE && inArc(target.hexId, target.facing, attacker.hexId);
  const isFlank = !attackerInTargetFront;
  const defense = attackerInTargetFront ? tEff.dr.front : tEff.dr.flank;
  const smokeDr = Math.min(
    2,
    smokeDefenseBonus(state, target.hexId) + smokeLosDrBonus(state, attacker.hexId, target.hexId),
  ); // §14.3 stacking cap
  const dr =
    defense +
    terrainDMForAttack(state, target.hexId, fpColor, isHE) +
    wallDMForFire(state, attacker.hexId, target.hexId) +
    vehicleCoverBonus(state, target) +
    apcTransportBonus(state, target) +
    smokeDr;
  const ar =
    (fpColor === 'red' ? aEff.fp.red : aEff.fp.blue) +
    fpRangeModifier(band) +
    arBonus +
    smokeAttackPenalty(state, attacker.hexId);

  return { legal: true, band, fpColor, ar, dr, hitNumber: dr - ar, isFlank, outOfArc };
}

function fail(reason: string, band: RangeBand, fpColor: DRColor): AttackContext {
  return { legal: false, reason, band, fpColor, ar: 0, dr: 0, hitNumber: 0, isFlank: false, outOfArc: false };
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
  /** See AttackContext.outOfArc (§16.2). */
  outOfArc: boolean;
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
  arBonus = 0,
): AttackRoll {
  const ctx = attackContext(state, attacker, target, capMod, arBonus);
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
      outOfArc: ctx.outOfArc,
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
    outOfArc: ctx.outOfArc,
  };
}

// ---------------------------------------------------------------------------
// Close combat (§7.7.3): an attack against an enemy in the SAME hex. No arc,
// LOS, or range check. FP is +4 (or −2 for white-boxed crew weapons), always
// resolved against the target's flank DR plus terrain DMs.
// ---------------------------------------------------------------------------

/**
 * `arBonus` is the Group Support Bonus (+1AR per Supporting Unit, §10.7) for a
 * Group Close Combat (§10.6: only same-hex Units may support one).
 */
export function closeCombatContext(
  state: GameState,
  attacker: Unit,
  target: Unit,
  arBonus = 0,
): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  // §16.5: an Open-Topped Vehicle defends Close Combat with its blue Flank
  // Defense treated as RED (pulls a Soft Target Hit Marker) — infantry can lob
  // grenades/fire straight into the open top, unlike a closed vehicle.
  const fpColor = templateOf(state, target).openTopped ? 'red' : tEff.dr.color;

  if (!aEff.canFire) return fail('unit cannot fight', 'short', fpColor);
  if (attacker.id === target.id) return fail('cannot close-combat self', 'short', fpColor);
  if (attacker.side === target.side) return fail('friendly target', 'short', fpColor);
  if (attacker.hexId !== target.hexId) return fail('not in the same hex', 'short', fpColor);

  const ccMod = templateOf(state, attacker).whiteBoxFp ? -2 : 4;
  // Close Combat shares one hex, so its Smoke both penalizes the attacker and
  // shields the defender at once (§14.3) — there's no separate LOS path to walk.
  const ar =
    (fpColor === 'red' ? aEff.fp.red : aEff.fp.blue) + ccMod + smokeAttackPenalty(state, attacker.hexId) + arBonus;
  // §15.14: Vehicles get NO defensive terrain bonus in close combat (foot do, §6.10).
  const targetIsVehicle = templateOf(state, target).kind === 'vehicle';
  const terrain = targetIsVehicle ? 0 : terrainDM(state, target.hexId);
  const dr =
    tEff.dr.flank +
    terrain +
    vehicleCoverBonus(state, target) +
    apcTransportBonus(state, target) +
    smokeDefenseBonus(state, target.hexId);
  return { legal: true, band: 'short', fpColor, ar, dr, hitNumber: dr - ar, isFlank: true, outOfArc: false };
}

export function rollCloseCombat(
  state: GameState,
  attacker: Unit,
  target: Unit,
  capMod = 0,
  arBonus = 0,
): AttackRoll {
  const ctx = closeCombatContext(state, attacker, target, arBonus);
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
      outOfArc: false,
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
    outOfArc: false,
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
  arBonus = 0,
): StackFireResult {
  const targets = enemiesInHex(state, attacker.side, targetHexId);
  const rolls: StackFireRoll[] = [];
  let rng = state.rng;
  for (const t of targets) {
    const roll = rollAttack({ ...state, rng }, attacker, t, capMod, arBonus);
    rolls.push({ targetId: t.id, roll });
    rng = roll.rng;
  }
  return { rolls, rng };
}
