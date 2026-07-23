/**
 * Obstacles (rulebook §17.7-§17.10): Barbed Wire, Mines, Road Blocks. Movement
 * cost/impassability lives in `movement.ts` (mirrors how Walls/terrain are
 * split); this module holds the two things unique to Obstacles: the Mines
 * Attack roll, and Barbed Wire's destroy-on-tracked-entry rule.
 *
 * §17.11 (destroying a Fortification/Obstacle by ranged Attack/CC) is a Phase
 * 2 concern (bundled with Fortifications, since it shares the same "two rolls,
 * one Spent Check" combat-resolution wrinkle) — not implemented here yet.
 */
import { clampCapMod } from './cap';
import { effectiveStats } from './hits';
import { roll2d6 } from './rng';
import type { DRColor, GameState, Hex, HexId, RngState, SideId, Unit, UnitId } from './types';

export interface MinesAttackRoll {
  targetId: UnitId;
  hitNumber: number;
  dice: [number, number];
  total: number;
  hit: boolean;
  critical: boolean;
  fpColor: DRColor;
  rng: RngState;
}

/**
 * §17.10 Mines Attack: a fixed Hit Number (no AR/DR) rolled against a single
 * Unit. The owning side may spend up to 2 CAPs to raise or lower the Hit
 * Number before rolling (§3.2's usual convention: `capMod` is subtracted, so
 * a positive value makes the Hit easier — helps hitting an enemy Unit;
 * negative protects a friendly Unit that blundered into its own field).
 * Mines attack both Soft and Armored Targets alike — the target's own DR
 * colour only decides which Hit-Marker pile a Hit draws from.
 */
export function rollMinesAttack(state: GameState, target: Unit, baseHitNumber: number, capMod = 0): MinesAttackRoll {
  const fpColor = effectiveStats(state, target).dr.color;
  const hitNumber = baseHitNumber - clampCapMod(capMod);
  const { value, dice, rng } = roll2d6(state.rng);
  const hit = value >= hitNumber;
  const critical = value >= hitNumber + 4;
  return { targetId: target.id, hitNumber, dice, total: value, hit, critical, fpColor, rng };
}

/**
 * Units that would be attacked by live Mines occupying `hexId` (§17.10):
 * every Unit that just moved into it, Pivoted in it, or initiated Close
 * Combat there — the caller decides which Unit ids qualify per the specific
 * Action (see `reducer.ts`'s `doMove`/`doPivot`/`doCloseCombat`). Returns []
 * when the Hex has no live Mines.
 */
export function minesTargetsFor(
  state: GameState,
  hexId: HexId,
  actingUnitIds: UnitId[],
): { unitId: UnitId; hitNumber: number }[] {
  const obstacle = state.hexes[hexId]?.features.obstacle;
  if (!obstacle || obstacle.kind !== 'mines' || obstacle.destroyed) return [];
  const hitNumber = obstacle.hitNumber ?? 0;
  return actingUnitIds.map((unitId) => ({ unitId, hitNumber }));
}

/** The side whose CAP pays for a live Mines Hex's Hit Number modification (§17.10), if any. */
export function minesOwnerSide(state: GameState, hexId: HexId): SideId | undefined {
  const obstacle = state.hexes[hexId]?.features.obstacle;
  if (!obstacle || obstacle.kind !== 'mines' || obstacle.destroyed) return undefined;
  return obstacle.ownerSide;
}

/** §17.8: a Tracked Vehicle moving into live Barbed Wire destroys it (removed from the Map). */
export function destroysBarbedWire(hex: Hex, propulsion: 'wheeled' | 'tracked'): boolean {
  return propulsion === 'tracked' && hex.features.obstacle?.kind === 'barbedWire' && !hex.features.obstacle.destroyed;
}
