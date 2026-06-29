/**
 * Command Action Point helpers (rulebook §3.2, §3.3, §7.4).
 */
import type { PlayerState } from './types';

/** Dice-roll CAP modifiers are limited to ±2 (§3.2). */
export function clampCapMod(n: number): number {
  return Math.max(-2, Math.min(2, Math.trunc(n)));
}

/**
 * Modify a d10 Spent Check by spending CAPs (§3.3): any number of CAPs, each
 * lowering the Action Cost by 1, floored at 0AP (§3.4 ⇒ no Spent Check). A
 * caller can request more CAPs than are useful; we only consume as many as it
 * takes to reach 0 and report how many were actually spent.
 */
export function reduceActionCost(
  base: number,
  caps: number,
): { cost: number; capsSpent: number } {
  const want = Math.max(0, Math.trunc(caps));
  const capsSpent = Math.min(want, Math.max(0, base));
  return { cost: Math.max(0, base - capsSpent), capsSpent };
}

/**
 * Apply a unit loss to a player: increment losses and lower the CAP ceiling.
 * Destroyed units sit on the CAP track, permanently reducing future CAPs and
 * immediately reducing current CAP if it sits at/above the lost space (§7.4).
 */
export function applyUnitLoss(player: PlayerState): void {
  player.unitLosses += 1;
  const ceiling = Math.max(0, player.capStart - player.unitLosses);
  if (player.capCurrent > ceiling) player.capCurrent = ceiling;
}
