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
import { deniedByBunkerMortarRule, fortificationDrBonus, hastyDefenseDrBonus, isOccupying } from './fortifications';
import { effectiveStats, templateOf } from './hits';
import { hasLOS, inArc } from './los';
import { fpRangeModifier, rangeBand, type RangeBand } from './range';
import { roll2d6 } from './rng';
import { smokeAttackPenalty, smokeDefenseBonus, smokeLosDrBonus } from './smoke';
import { terrainDM, terrainOf } from './terrain';
import { directionTo } from './movement';
import type { DRColor, GameState, Modifier, RngState, SideId, Unit, UnitId } from './types';

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
export function vehicleCoverBonus(state: GameState, target: Unit): number {
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
export function apcTransportBonus(state: GameState, target: Unit): number {
  if (!target.carriedBy) return 0;
  const carrier = state.units[target.carriedBy];
  return carrier && templateOf(state, carrier).apcTransport ? 2 : 0;
}

/**
 * §12.3 Elevation Combat Bonus: +1AR if the attacker's hex is higher than the
 * target's; +1DR if the target's hex is higher than the attacker's (never
 * both — they're always resolved from different hexes' elevations). Exported
 * so `mortar.ts`'s Indirect Attack can reuse it with the Spotter Hex standing
 * in for the Mortar's own hex (§13.3). Not applicable to Close Combat, where
 * attacker and target always share a hex (and thus always tie).
 */
export function elevationCombatMods(
  state: GameState,
  attackerHexId: string,
  targetHexId: string,
): { elevAr: number; elevDr: number } {
  const aElev = state.hexes[attackerHexId]?.elevation ?? 0;
  const tElev = state.hexes[targetHexId]?.elevation ?? 0;
  return { elevAr: aElev > tElev ? 1 : 0, elevDr: tElev > aElev ? 1 : 0 };
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
  /** Line items summing to `ar` — for the dice-roller breakdown. */
  arMods: Modifier[];
  /** Line items summing to `dr` — for the dice-roller breakdown. */
  drMods: Modifier[];
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
  useFlamethrower = false,
): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  const attackerTmpl = templateOf(state, attacker);
  const dist = distance(parseHexId(attacker.hexId), parseHexId(target.hexId));
  // §18.0: a Flamethrower's Max Range is a fixed 1 Hex, overriding the Unit's
  // own Range stat entirely (a Pioneer's normal 3-Hex range doesn't apply here).
  const band: RangeBand = useFlamethrower ? (dist <= 1 ? 'short' : 'out') : rangeBand(dist, aEff.range);
  // §13.0/§13.9: Mortars fire High Explosive — always vs the target's Flank
  // Defense (both Direct and Indirect Attacks), with the Air Burst exception
  // above; they also may not fire closer than their Minimum Range (§13.1).
  const isHE = attackerTmpl.kind === 'mortar';
  const minRange = attackerTmpl.minRange ?? 0;
  // §16.5: an Open-Topped Vehicle defends an HE or Flamethrower Attack (both
  // always vs Flank Defense) with its blue Flank Defense treated as red —
  // pulls a Soft Target Hit Marker, the same as a red-FP Close Combat attack
  // against it (closeCombatContext does the equivalent flip for CC).
  const openToppedFlip = (isHE || useFlamethrower) && templateOf(state, target).openTopped;
  const fpColor = openToppedFlip ? 'red' : tEff.dr.color;

  if (useFlamethrower && !attackerTmpl.hasFlamethrower) return fail('this Unit has no Flamethrower (§18.0)', band, fpColor);
  if (!aEff.canFire) return fail('unit cannot fire', band, fpColor);
  // §11: a Hidden enemy Unit is not a legal Attack target — only Recon by
  // Fire (§11.7) may find one.
  if (target.hidden) return fail('target is Hidden — use Recon by Fire (§11.7)', band, fpColor);
  // §17.5: Mortars may not fire — Direct or Indirect — from within a Bunker.
  if (attackerTmpl.kind === 'mortar' && deniedByBunkerMortarRule(state, attacker)) {
    return fail('Mortars may not fire from within a Bunker (§17.5)', band, fpColor);
  }
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
  // §17.5: a Bunker occupant may ONLY attack within the Bunker's Arc of Fire —
  // no Turreted exception (the Bunker's arc lock overrides it unconditionally).
  if (outOfArc && isOccupying(state, attacker)?.kind === 'bunker') {
    return fail('Bunker occupant may only attack within the Bunker Arc of Fire (§17.5)', band, fpColor);
  }
  if (outOfArc && !attackerTmpl.turreted) return fail('target out of arc', band, fpColor);
  if (!hasLOS(state, attacker.hexId, target.hexId)) return fail('no line of sight', band, fpColor);
  if (band === 'out') {
    return fail(useFlamethrower ? 'out of Flamethrower range (max 1 Hex, §18.0)' : 'out of range', band, fpColor);
  }

  const attackerInTargetFront = !isHE && !useFlamethrower && inArc(target.hexId, target.facing, attacker.hexId);
  const isFlank = !attackerInTargetFront;
  const rangeAr = fpRangeModifier(band);
  const smokeAr = smokeAttackPenalty(state, attacker.hexId);
  const fp = useFlamethrower ? 3 : fpColor === 'red' ? aEff.fp.red : aEff.fp.blue;
  const { elevAr, elevDr } = elevationCombatMods(state, attacker.hexId, target.hexId);

  // §18.0: a Flamethrower ignores ALL DR modifiers except Smoke — no Terrain,
  // Wall, Vehicle Cover, APC Transport, Elevation, Fortification, or Hasty
  // Defense bonus (all of those are DEFENSE-side; the AR-side bonuses below —
  // range, elevation, Group Support, smoke-attack-penalty — are unaffected).
  let drMods: Modifier[];
  if (useFlamethrower) {
    drMods = [{ label: 'Flank Defense (Flamethrower always targets flank)', value: tEff.dr.flank, section: '§18.0' }];
    const smokeDr = Math.min(
      2,
      smokeDefenseBonus(state, target.hexId) + smokeLosDrBonus(state, attacker.hexId, target.hexId),
    );
    if (smokeDr) drMods.push({ label: 'Smoke (defending in/behind it)', value: smokeDr, section: '§14.3' });
  } else {
    const defense = attackerInTargetFront ? tEff.dr.front : tEff.dr.flank;
    const smokeDr = Math.min(
      2,
      smokeDefenseBonus(state, target.hexId) + smokeLosDrBonus(state, attacker.hexId, target.hexId),
    ); // §14.3 stacking cap
    const wallDr = wallDMForFire(state, attacker.hexId, target.hexId);
    const coverDr = vehicleCoverBonus(state, target);
    const apcDr = apcTransportBonus(state, target);
    const terrainDr = terrainDMForAttack(state, target.hexId, fpColor, isHE);
    const targetHex = state.hexes[target.hexId];
    drMods = [
      { label: `${attackerInTargetFront ? 'Front' : 'Flank'} Defense`, value: defense, section: attackerInTargetFront ? '§6.1' : '§6.3' },
    ];
    if (isHE && fpColor === 'red' && targetHex?.terrain === 'woodsHeavy') {
      drMods.push({ label: 'Heavy Woods negated by Air Burst', value: 0, section: '§13.9' });
    } else if (terrainDr !== 0) {
      drMods.push({ label: `${targetHex ? terrainOf(targetHex).name : 'Terrain'} DM`, value: terrainDr, section: '§6.4' });
    }
    if (wallDr) drMods.push({ label: 'Wall Cover (shot crosses a wall)', value: wallDr, section: '§6.5' });
    if (coverDr) drMods.push({ label: 'Vehicle Cover (shares hex with a friendly Vehicle)', value: coverDr, section: '§15.15' });
    if (apcDr) drMods.push({ label: 'APC Transport Bonus', value: apcDr, section: '§16.6' });
    if (smokeDr) drMods.push({ label: 'Smoke (defending in/behind it)', value: smokeDr, section: '§14.3' });
    if (elevDr) drMods.push({ label: 'Elevation Bonus (target on higher ground)', value: elevDr, section: '§12.3' });
    const fortDr = fortificationDrBonus(state, target, attacker.hexId);
    if (fortDr) drMods.push(fortDr);
    const hastyDr = hastyDefenseDrBonus(target);
    if (hastyDr) drMods.push(hastyDr);
  }

  const arMods: Modifier[] = [
    {
      label: useFlamethrower
        ? `${fpColor === 'red' ? 'Red' : 'Blue'} Firepower (Flamethrower)`
        : `${fpColor === 'red' ? 'Red' : 'Blue'} Firepower${openToppedFlip ? ' (Open-Topped target)' : ''}`,
      value: fp,
      section: useFlamethrower ? '§18.0' : openToppedFlip ? '§16.5' : '§6.6',
    },
  ];
  if (rangeAr) arMods.push({ label: rangeAr > 0 ? 'Short Range Bonus (adjacent)' : 'Long Range Penalty', value: rangeAr, section: '§6.7' });
  if (arBonus) arMods.push({ label: 'Group Support (+1 per supporter)', value: arBonus, section: '§10.7' });
  if (smokeAr) arMods.push({ label: 'Smoke (firing out of it)', value: smokeAr, section: '§14.3' });
  if (elevAr) arMods.push({ label: 'Elevation Bonus (attacker on higher ground)', value: elevAr, section: '§12.3' });

  const dr = drMods.reduce((s, m) => s + m.value, 0);
  const ar = arMods.reduce((s, m) => s + m.value, 0);

  return { legal: true, band, fpColor, ar, dr, hitNumber: dr - ar, isFlank, outOfArc, arMods, drMods };
}

function fail(reason: string, band: RangeBand, fpColor: DRColor): AttackContext {
  return { legal: false, reason, band, fpColor, ar: 0, dr: 0, hitNumber: 0, isFlank: false, outOfArc: false, arMods: [], drMods: [] };
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
  arMods: Modifier[];
  drMods: Modifier[];
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
  useFlamethrower = false,
): AttackRoll {
  const ctx = attackContext(state, attacker, target, capMod, arBonus, useFlamethrower);
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
      arMods: [],
      drMods: [],
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
    arMods: ctx.arMods,
    drMods: ctx.drMods,
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
  useFlamethrower = false,
): AttackContext {
  const aEff = effectiveStats(state, attacker);
  const tEff = effectiveStats(state, target);
  const attackerTmpl = templateOf(state, attacker);
  // §16.5: an Open-Topped Vehicle defends Close Combat with its blue Flank
  // Defense treated as RED (pulls a Soft Target Hit Marker) — infantry can lob
  // grenades/fire straight into the open top, unlike a closed vehicle.
  const fpColor = templateOf(state, target).openTopped ? 'red' : tEff.dr.color;

  if (useFlamethrower && !attackerTmpl.hasFlamethrower) return fail('this Unit has no Flamethrower (§18.0)', 'short', fpColor);
  if (!aEff.canFire) return fail('unit cannot fight', 'short', fpColor);
  if (attacker.id === target.id) return fail('cannot close-combat self', 'short', fpColor);
  if (attacker.side === target.side) return fail('friendly target', 'short', fpColor);
  if (attacker.hexId !== target.hexId) return fail('not in the same hex', 'short', fpColor);
  // §11: a Hidden enemy Unit sharing this Hex would already have revealed
  // via the post-Action sweep (§11.1 bullet 2) — defensive check in case
  // that invariant is ever violated.
  if (target.hidden) return fail('target is Hidden — use Recon by Fire (§11.7)', 'short', fpColor);

  const whiteBox = attackerTmpl.whiteBoxFp;
  // §18.0: Flamethrower substitutes a flat 3FP and its own +4 CC bonus,
  // superseding the normal FP and any white-box crewed-weapon CC penalty.
  const ccMod = useFlamethrower ? 4 : whiteBox ? -2 : 4;
  const smokeAr = smokeAttackPenalty(state, attacker.hexId);
  const fp = useFlamethrower ? 3 : fpColor === 'red' ? aEff.fp.red : aEff.fp.blue;
  // §15.14: Vehicles get NO defensive terrain bonus in close combat (foot do, §6.10).
  const targetIsVehicle = templateOf(state, target).kind === 'vehicle';

  // §18.0: a Flamethrower ignores ALL DR modifiers except Smoke.
  let drMods: Modifier[];
  if (useFlamethrower) {
    drMods = [{ label: 'Flank Defense (always, in CC)', value: tEff.dr.flank, section: '§6.10' }];
    const smokeDr = smokeDefenseBonus(state, target.hexId);
    if (smokeDr) drMods.push({ label: 'Smoke (defending in it)', value: smokeDr, section: '§14.3' });
  } else {
    const terrain = targetIsVehicle ? 0 : terrainDM(state, target.hexId);
    const coverDr = vehicleCoverBonus(state, target);
    const apcDr = apcTransportBonus(state, target);
    const smokeDr = smokeDefenseBonus(state, target.hexId);
    drMods = [{ label: 'Flank Defense (always, in CC)', value: tEff.dr.flank, section: '§6.10' }];
    if (targetIsVehicle) drMods.push({ label: 'No Vehicle terrain bonus in CC', value: 0, section: '§15.14' });
    else if (terrain) drMods.push({ label: `${terrainOf(state.hexes[target.hexId]!).name} DM`, value: terrain, section: '§6.4' });
    if (coverDr) drMods.push({ label: 'Vehicle Cover (shares hex with a friendly Vehicle)', value: coverDr, section: '§15.15' });
    if (apcDr) drMods.push({ label: 'APC Transport Bonus', value: apcDr, section: '§16.6' });
    if (smokeDr) drMods.push({ label: 'Smoke (defending in it)', value: smokeDr, section: '§14.3' });
    // §17.5 note: a Bunker's own Flank Bonus (+3) still applies to a CC-attacked
    // occupant (attacker is always "in the hex," i.e. never in the occupant's
    // own arc from a same-hex vantage — `fortificationDrBonus` naturally returns
    // the Flank value here since `inArc(unit.hexId, unit.facing, attacker.hexId)`
    // with attacker.hexId === unit.hexId is never true).
    const fortDr = fortificationDrBonus(state, target, attacker.hexId);
    if (fortDr) drMods.push(fortDr);
    const hastyDr = hastyDefenseDrBonus(target);
    if (hastyDr) drMods.push(hastyDr);
  }

  const openToppedFlip = templateOf(state, target).openTopped && tEff.dr.color !== 'red';
  const arMods: Modifier[] = [
    {
      label: useFlamethrower
        ? `${fpColor === 'red' ? 'Red' : 'Blue'} Firepower (Flamethrower)`
        : `${fpColor === 'red' ? 'Red' : 'Blue'} Firepower${openToppedFlip ? ' (Open-Topped target)' : ''}`,
      value: fp,
      section: useFlamethrower ? '§18.0' : openToppedFlip ? '§16.5' : '§6.6',
    },
    {
      label: useFlamethrower ? 'Flamethrower Close Combat Bonus' : whiteBox ? 'Crewed Unit penalty in CC' : 'Close Combat Bonus',
      value: ccMod,
      section: useFlamethrower ? '§18.0' : whiteBox ? '§6.11' : '§6.10/§6.7',
    },
  ];
  if (arBonus) arMods.push({ label: 'Group Support (+1 per supporter)', value: arBonus, section: '§10.7' });
  if (smokeAr) arMods.push({ label: 'Smoke (firing out of it)', value: smokeAr, section: '§14.3' });

  const ar = arMods.reduce((s, m) => s + m.value, 0);
  const dr = drMods.reduce((s, m) => s + m.value, 0);
  return { legal: true, band: 'short', fpColor, ar, dr, hitNumber: dr - ar, isFlank: true, outOfArc: false, arMods, drMods };
}

export function rollCloseCombat(
  state: GameState,
  attacker: Unit,
  target: Unit,
  capMod = 0,
  arBonus = 0,
  useFlamethrower = false,
): AttackRoll {
  const ctx = closeCombatContext(state, attacker, target, arBonus, useFlamethrower);
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
      arMods: [],
      drMods: [],
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
    arMods: ctx.arMods,
    drMods: ctx.drMods,
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
  // §11: a Hidden enemy Unit never resolves as a stacked-fire target — Fire
  // at a Hex only ever hits the KNOWN (non-Hidden) enemies stacked there,
  // never a Hidden stack-mate the attacker doesn't know is present.
  return Object.values(state.units)
    .filter((u) => u.side !== side && u.hexId === hexId && !u.hidden)
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
  useFlamethrower = false,
): StackFireResult {
  const targets = enemiesInHex(state, attacker.side, targetHexId);
  const rolls: StackFireRoll[] = [];
  let rng = state.rng;
  for (const t of targets) {
    const roll = rollAttack({ ...state, rng }, attacker, t, capMod, arBonus, useFlamethrower);
    rolls.push({ targetId: t.id, roll });
    rng = roll.rng;
  }
  return { rolls, rng };
}
