/**
 * Command Action Point helpers (rulebook §3.2, §7.4).
 */
import type { PlayerState } from './types';

/** Dice-roll CAP modifiers are limited to ±2 (§3.2.3). */
export function clampCapMod(n: number): number {
  return Math.max(-2, Math.min(2, Math.trunc(n)));
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
