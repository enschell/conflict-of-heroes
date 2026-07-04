/**
 * Mortar Indirect Attacks (rulebook §13.2–§13.3): targeting a Hex the Mortar
 * cannot itself see, via a Spotter Hex. Direct Attacks and Fire Smoke need no
 * new combat math — they reuse `combat.ts`'s `attackContext` (already HE-aware
 * for `kind: 'mortar'`, §13.9) and the Fire-Zone check below, respectively;
 * this module only adds the pieces that are unique to firing indirectly:
 * Spotter Hex validity, and resolving Attack/DR from the Spotter's LOS instead
 * of the Mortar's own.
 */
import { distance, parseHexId } from './hex';
import { effectiveStats, templateOf } from './hits';
import { hasLOS, inArc } from './los';
import { apcTransportBonus, vehicleCoverBonus, wallDMForFire, type Modifier } from './combat';
import { fpRangeModifier, rangeBand, type RangeBand } from './range';
import { roll2d6 } from './rng';
import { smokeAttackPenalty, smokeDefenseBonus, smokeLosDrBonus } from './smoke';
import { terrainOf } from './terrain';
import type { DRColor, GameState, HexId, RngState, Unit, UnitId } from './types';

/**
 * A valid Spotter Hex for an Indirect Attack (§13.3): within 2 Hexes and clear
 * LOS of the Mortar's own Hex. (No arc requirement — a Spotter Hex is just a
 * point the Mortar can see, not something it fires through.)
 */
export function isValidSpotterHex(state: GameState, mortarHexId: HexId, spotterHexId: HexId): boolean {
  if (!state.hexes[spotterHexId]) return false;
  if (spotterHexId === mortarHexId) return true;
  if (distance(parseHexId(mortarHexId), parseHexId(spotterHexId)) > 2) return false;
  return hasLOS(state, mortarHexId, spotterHexId);
}

export interface FireZoneResult {
  legal: boolean;
  reason?: string;
  band: RangeBand;
}

/**
 * Fire-Zone legality of a raw Target Hex (no Unit needed there) from a Unit's
 * own Hex/facing/range, honoring an optional Minimum Range (§13.1). Used for
 * Direct Fire Smoke, where there may be no enemy occupying the Target Hex.
 */
export function directFireZone(
  state: GameState,
  attacker: Unit,
  targetHexId: HexId,
  minRange = 0,
): FireZoneResult {
  if (!state.hexes[targetHexId]) return { legal: false, reason: 'no such hex', band: 'out' };
  const dist = distance(parseHexId(attacker.hexId), parseHexId(targetHexId));
  if (dist < 1) return { legal: false, reason: 'cannot target own hex', band: 'out' };
  if (dist < minRange) return { legal: false, reason: 'inside Minimum Range (§13.1)', band: 'out' };
  if (!inArc(attacker.hexId, attacker.facing, targetHexId))
    return { legal: false, reason: 'target out of arc', band: 'out' };
  if (!hasLOS(state, attacker.hexId, targetHexId))
    return { legal: false, reason: 'no line of sight', band: 'out' };
  const band = rangeBand(dist, effectiveStats(state, attacker).range);
  if (band === 'out') return { legal: false, reason: 'out of range', band };
  return { legal: true, band };
}

/**
 * Fire-Zone legality of an Indirect Attack/Fire-Smoke Target Hex (§13.2–§13.3):
 * Arc of Fire and Min/Max Range are from the Mortar's own Hex; LOS is from the
 * Spotter Hex instead.
 */
export function indirectFireZone(
  state: GameState,
  attacker: Unit,
  targetHexId: HexId,
  spotterHexId: HexId,
  minRange = 0,
): FireZoneResult {
  if (!state.hexes[targetHexId]) return { legal: false, reason: 'no such hex', band: 'out' };
  if (!isValidSpotterHex(state, attacker.hexId, spotterHexId))
    return { legal: false, reason: 'not a valid Spotter Hex (§13.3)', band: 'out' };
  const dist = distance(parseHexId(attacker.hexId), parseHexId(targetHexId));
  if (dist < 1) return { legal: false, reason: 'cannot target own hex', band: 'out' };
  if (dist < minRange) return { legal: false, reason: 'inside Minimum Range (§13.1)', band: 'out' };
  if (!inArc(attacker.hexId, attacker.facing, targetHexId))
    return { legal: false, reason: 'target out of arc', band: 'out' };
  if (!hasLOS(state, spotterHexId, targetHexId))
    return { legal: false, reason: 'no line of sight from Spotter Hex', band: 'out' };
  const band = rangeBand(dist, effectiveStats(state, attacker).range);
  if (band === 'out') return { legal: false, reason: 'out of range', band };
  return { legal: true, band };
}

/**
 * §13.9 Air Burst: a red-Flank (soft) target loses the Heavy Woods +2DR bonus
 * vs High Explosive fire (mirrors `combat.ts`'s private `terrainDMForAttack`).
 */
function heTerrainDM(state: GameState, hexId: HexId, fpColor: DRColor): number {
  const hex = state.hexes[hexId];
  if (!hex) return 0;
  if (fpColor === 'red' && hex.terrain === 'woodsHeavy') return 0;
  return terrainOf(hex).dm;
}

/**
 * A reasonable Spotter Hex choice for enumerating legal Indirect actions
 * (§13.3): the first Hex within 2 of the Mortar with clear LOS to both the
 * Mortar and the Target Hex. The reducer accepts any Spotter Hex the caller
 * supplies; this only produces one representative action per Target Hex for
 * the legal-action list (a UI would let the player pick a different one).
 */
export function bestSpotterFor(state: GameState, mortar: Unit, targetHexId: HexId): HexId | undefined {
  const candidates = Object.keys(state.hexes).filter(
    (id) => id === mortar.hexId || distance(parseHexId(mortar.hexId), parseHexId(id)) <= 2,
  );
  for (const spotterHexId of candidates) {
    if (isValidSpotterHex(state, mortar.hexId, spotterHexId) && hasLOS(state, spotterHexId, targetHexId)) {
      return spotterHexId;
    }
  }
  return undefined;
}

export interface IndirectAttackRoll {
  targetId: UnitId;
  ar: number;
  dr: number;
  hitNumber: number;
  dice: [number, number];
  total: number;
  hit: boolean;
  critical: boolean;
  fpColor: DRColor;
  arMods: Modifier[];
  drMods: Modifier[];
}

export interface IndirectFireResult {
  rolls: IndirectAttackRoll[];
  rng: RngState;
}

/**
 * Resolve an Indirect Attack against every enemy stacked in `targetHexId`
 * (§7.5.1-style, always HE vs Flank Defense, §13.9). Pure: threads the RNG.
 * (Elevation Combat Bonus from the Spotter Hex, §13.3/§12.3, is 0 until Hills
 * are built, M9 — the same deferral `movement.ts` already documents.)
 */
export function rollIndirectFire(
  state: GameState,
  attacker: Unit,
  targetHexId: HexId,
  spotterHexId: HexId,
  capMod = 0,
): IndirectFireResult {
  const aEff = effectiveStats(state, attacker);
  const dist = distance(parseHexId(attacker.hexId), parseHexId(targetHexId));
  const band = rangeBand(dist, aEff.range);
  const targets = Object.values(state.units)
    .filter((u) => u.side !== attacker.side && u.hexId === targetHexId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rolls: IndirectAttackRoll[] = [];
  let rng = state.rng;
  for (const target of targets) {
    const tEff = effectiveStats(state, target);
    // §16.5: Indirect Fire is always HE (§13.9), so an Open-Topped Vehicle's
    // blue Flank Defense is always treated as red here — same flip as
    // combat.ts's attackContext (Direct HE) and closeCombatContext (CC).
    const openToppedFlip = templateOf(state, target).openTopped;
    const fpColor = openToppedFlip ? 'red' : tEff.dr.color;
    const smokeDr = Math.min(
      2,
      smokeDefenseBonus(state, target.hexId) + smokeLosDrBonus(state, spotterHexId, targetHexId),
    );
    const terrainDr = heTerrainDM(state, target.hexId, fpColor);
    const wallDr = wallDMForFire(state, spotterHexId, target.hexId);
    const coverDr = vehicleCoverBonus(state, target);
    const apcDr = apcTransportBonus(state, target);
    const rangeAr = fpRangeModifier(band);
    const smokeAr = smokeAttackPenalty(state, attacker.hexId);
    const fp = fpColor === 'red' ? aEff.fp.red : aEff.fp.blue;

    const drMods: Modifier[] = [{ label: 'Flank Defense (HE always targets flank)', value: tEff.dr.flank, section: '§13.9' }];
    const targetHex = state.hexes[target.hexId];
    if (fpColor === 'red' && targetHex?.terrain === 'woodsHeavy') {
      drMods.push({ label: 'Heavy Woods negated by Air Burst', value: 0, section: '§13.9' });
    } else if (terrainDr !== 0) {
      drMods.push({ label: `${targetHex ? terrainOf(targetHex).name : 'Terrain'} DM`, value: terrainDr, section: '§6.4' });
    }
    if (wallDr) drMods.push({ label: 'Wall Cover (shot crosses a wall)', value: wallDr, section: '§6.5' });
    if (coverDr) drMods.push({ label: 'Vehicle Cover (shares hex with a friendly Vehicle)', value: coverDr, section: '§15.15' });
    if (apcDr) drMods.push({ label: 'APC Transport Bonus', value: apcDr, section: '§16.6' });
    if (smokeDr) drMods.push({ label: 'Smoke (defending in/behind it)', value: smokeDr, section: '§14.3' });

    const arMods: Modifier[] = [
      {
        label: `${fpColor === 'red' ? 'Red' : 'Blue'} Firepower (HE)${openToppedFlip ? ' — Open-Topped target' : ''}`,
        value: fp,
        section: openToppedFlip ? '§16.5' : '§13.9',
      },
    ];
    if (rangeAr) arMods.push({ label: rangeAr > 0 ? 'Short Range Bonus (adjacent)' : 'Long Range Penalty', value: rangeAr, section: '§6.7' });
    if (smokeAr) arMods.push({ label: 'Smoke (firing out of it)', value: smokeAr, section: '§14.3' });

    const dr = drMods.reduce((s, m) => s + m.value, 0);
    const ar = arMods.reduce((s, m) => s + m.value, 0);
    const hitNumber = dr - ar - capMod;
    const { value, dice, rng: rolled } = roll2d6(rng);
    rng = rolled;
    const hit = value >= hitNumber;
    const critical = value >= hitNumber + 4;
    rolls.push({ targetId: target.id, ar, dr, hitNumber, dice, total: value, hit, critical, fpColor, arMods, drMods });
  }
  return { rolls, rng };
}
