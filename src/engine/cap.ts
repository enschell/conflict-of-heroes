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

/** The lowest a side's CAP ceiling can fall (§7.13: always ≥3 at round start). */
export const CAP_FLOOR = 3;

/** The CAP ceiling (per-Round allocation) given a side's losses (§7.12–§7.13). */
export function capCeiling(player: PlayerState): number {
  return Math.max(CAP_FLOOR, player.capStart - player.unitLosses);
}

/**
 * Apply a unit loss to a player: increment losses and lower the CAP ceiling.
 * Destroyed units sit on the CAP track, permanently reducing future CAPs and
 * immediately reducing current CAP if it sits above the new ceiling (§7.12).
 * The ceiling never drops below CAP_FLOOR — once only 3 spaces remain, further
 * destroyed units are no longer placed (§7.13). In-Round spending may still take
 * the current CAP below 3; the floor applies only to the ceiling/reset.
 */
export function applyUnitLoss(player: PlayerState): void {
  player.unitLosses += 1;
  const ceiling = capCeiling(player);
  if (player.capCurrent > ceiling) player.capCurrent = ceiling;
}
