/**
 * Fortifications (rulebook §17.1-§17.6): Trenches, Bunkers. Hasty Defenses are
 * per-Unit (`Unit.hastyDefense`, see types.ts), not a Hex feature, so they need
 * no `*At(hex)` lookup here — only a DR-bonus helper.
 *
 * Also holds §17.11/17.12: destroying a Fortification/Obstacle by ranged Fire
 * or Close Combat — shared machinery since either kind of feature can carry a
 * `destroyDr` (§17.11's "red Defense in the bottom right corner").
 */
import { inArc } from './los';
import { effectiveStats, templateOf } from './hits';
import { clampCapMod } from './cap';
import { roll2d6 } from './rng';
import { smokeAttackPenalty } from './smoke';
import type { FortificationState, GameState, Hex, HexId, Modifier, ObstacleState, RngState, Unit } from './types';

/** Live (non-destroyed) Fortification on this Hex, if any (§17.1). */
export function fortificationAt(hex: Hex): FortificationState | undefined {
  return hex.features.fortification && !hex.features.fortification.destroyed ? hex.features.fortification : undefined;
}

/**
 * Is `unit` currently occupying its Hex's Trench/Bunker (§17.2)? Re-validates
 * `unit.occupyingFortification` against a still-live matching Fortification —
 * defensive, same spirit as `obstacles.ts`'s `liveObstacle`.
 */
export function isOccupying(state: GameState, unit: Unit): FortificationState | undefined {
  if (!unit.occupyingFortification) return undefined;
  const hex = state.hexes[unit.hexId];
  return hex ? fortificationAt(hex) : undefined;
}

/**
 * §17.2: may `unit` occupy its current Hex's Fortification right now? False if
 * there's no live Fortification there, the Unit's kind isn't eligible (Trench:
 * Foot only; Bunker: Foot + Field Gun — never a Vehicle), or an enemy Unit
 * already occupies it (§17.2's "may not occupy a Fortification already
 * occupied by enemy Units").
 */
export function canOccupy(state: GameState, unit: Unit): boolean {
  const hex = state.hexes[unit.hexId];
  const fort = hex && fortificationAt(hex);
  if (!fort) return false;
  const kind = templateOf(state, unit).kind;
  if (kind === 'vehicle') return false;
  if (fort.kind === 'trench' && kind === 'gun') return false; // §17.4: All Foot Units only
  const enemyOccupies = Object.values(state.units).some(
    (u) => u.hexId === unit.hexId && u.side !== unit.side && u.occupyingFortification,
  );
  return !enemyOccupies;
}

/**
 * §17.4/§17.5: the flat DR bonus a Fortification grants its occupant `unit`
 * against an attack arriving from `attackerHexId`. Trench: flat +2 from ANY
 * direction. Bunker: +5 if the attacker is within the occupant's own front
 * arc (facing is locked to the Bunker's, so this reuses the same arc concept
 * `combat.ts` already uses for front/flank DR — no new arc math) else +3
 * (Flank). No color gating — §17.1's Black DR is effective vs both Red and
 * Blue Firepower. Returns undefined if `unit` isn't occupying a live
 * Fortification.
 */
export function fortificationDrBonus(state: GameState, unit: Unit, attackerHexId: HexId): Modifier | undefined {
  const fort = isOccupying(state, unit);
  if (!fort) return undefined;
  if (fort.kind === 'trench') {
    return { label: 'Trench Fortification Bonus', value: 2, section: '§17.4' };
  }
  const inFrontArc = inArc(unit.hexId, unit.facing, attackerHexId);
  return inFrontArc
    ? { label: 'Bunker Bonus (attacked within its Arc of Fire)', value: 5, section: '§17.5' }
    : { label: 'Bunker Bonus (Flank attacked)', value: 3, section: '§17.5' };
}

/** §17.6: the Hasty Defense's flat +1DR, from any direction, if `unit` built one and it's still up. */
export function hastyDefenseDrBonus(unit: Unit): Modifier | undefined {
  return unit.hastyDefense ? { label: 'Hasty Defense Bonus', value: 1, section: '§17.6' } : undefined;
}

/**
 * §17.5: is `targetHexId` within the occupant's Bunker-locked Arc of Fire, as
 * seen from `occupant`'s own Hex? The occupant's facing is already forced to
 * equal the Bunker's (§17.5), so this reuses `inArc` directly.
 */
export function withinBunkerArc(occupant: Unit, targetHexId: HexId): boolean {
  return inArc(occupant.hexId, occupant.facing, targetHexId);
}

/** §17.5: Mortars may not fire (Direct or Indirect) from within a Bunker at all — a flat kind-based denial. */
export function deniedByBunkerMortarRule(state: GameState, unit: Unit): boolean {
  return templateOf(state, unit).kind === 'mortar' && isOccupying(state, unit)?.kind === 'bunker';
}

/**
 * §17.11: whichever destructible feature (Fortification OR Obstacle — only
 * one can be on a Hex, §17.0) is on `hex`, if it has a `destroyDr` and isn't
 * already destroyed.
 */
export function destructibleFeatureAt(hex: Hex): FortificationState | ObstacleState | undefined {
  const fort = hex.features.fortification;
  if (fort && !fort.destroyed && fort.destroyDr != null) return fort;
  const obstacle = hex.features.obstacle;
  if (obstacle && !obstacle.destroyed && obstacle.destroyDr != null) return obstacle;
  return undefined;
}

/** §17.11: mark whichever destructible feature is on `hex` as destroyed. */
export function destroyFeatureAt(hex: Hex): void {
  const fort = hex.features.fortification;
  if (fort && !fort.destroyed && fort.destroyDr != null) {
    fort.destroyed = true;
    return;
  }
  const obstacle = hex.features.obstacle;
  if (obstacle && !obstacle.destroyed && obstacle.destroyDr != null) obstacle.destroyed = true;
}

export interface StructureDestroyRoll {
  hitNumber: number;
  dice: [number, number];
  total: number;
  hit: boolean;
  rng: RngState;
}

/**
 * §17.11: given an attacker's already-computed AR (the SAME one the occupant
 * roll used — no re-derivation) and a destructible feature's flat `destroyDr`
 * (no terrain/smoke/cover DR — §17.11/17.12: "no terrain modifiers apply to
 * the structure"), roll to destroy it. Owns its own `roll2d6`/RNG advance,
 * symmetric with `obstacles.ts`'s `rollMinesAttack`. No `critical` tier (the
 * rulebook only ever says "Hit ⇒ destroyed") and no `fpColor` (a structure
 * doesn't draw from a hit-marker pile).
 */
export function rollStructureDestroy(state: GameState, ar: number, destroyDr: number, capMod = 0): StructureDestroyRoll {
  const hitNumber = destroyDr - ar - clampCapMod(capMod);
  const { value, dice, rng } = roll2d6(state.rng);
  return { hitNumber, dice, total: value, hit: value >= hitNumber, rng };
}

/**
 * §17.12: the AR half of a CC Attack against a Fortification/Obstacle itself
 * (not its occupant) — "receives no Terrain modifiers," so this mirrors
 * `combat.ts`'s `closeCombatContext` AR math (FP + CC bonus/white-box penalty
 * + Group Support + smoke-attack-penalty) without any of its DR half. A
 * structure has no DR color of its own (§17.1: Black DR beats both); Close
 * Combat conventionally uses the attacker's red FP here since Fortifications/
 * Obstacles aren't armored targets.
 */
export function closeCombatStructureAr(state: GameState, attacker: Unit, arBonus = 0): { ar: number; arMods: Modifier[] } {
  const aEff = effectiveStats(state, attacker);
  const whiteBox = templateOf(state, attacker).whiteBoxFp;
  const ccMod = whiteBox ? -2 : 4;
  const smokeAr = smokeAttackPenalty(state, attacker.hexId);
  const arMods: Modifier[] = [
    { label: 'Red Firepower', value: aEff.fp.red, section: '§6.6' },
    { label: whiteBox ? 'Crewed Unit penalty in CC' : 'Close Combat Bonus', value: ccMod, section: whiteBox ? '§6.11' : '§6.10/§6.7' },
  ];
  if (arBonus) arMods.push({ label: 'Group Support (+1 per supporter)', value: arBonus, section: '§10.7' });
  if (smokeAr) arMods.push({ label: 'Smoke (firing out of it)', value: smokeAr, section: '§14.3' });
  return { ar: arMods.reduce((s, m) => s + m.value, 0), arMods };
}
