/**
 * Round and turn flow (rulebook §2.0–§2.3).
 */
import { capCeiling } from './cap';
import { roll2d6 } from './rng';
import type { GameState, SideId } from './types';
import { computeWinner, otherSide, updateVictoryHexControl } from './victory';

const SIDES: SideId[] = ['A', 'B'];

/**
 * Pre-round sequence (infantry subset) + initiative roll. Mutates `state`.
 * Flips Spent units Fresh, clears Stress (§2.6/§9), resets CAP to start − losses,
 * then rolls 2D6 per side (reroll ties) to decide who goes first.
 *
 * v3 note: v3 initiative (only the non-VP-advantage side rolls, ≥7 goes first,
 * §9.11) is step 6 — deferred; this keeps the 2nd-ed both-sides-roll initiative
 * for now. The Pre-Round CAP reset already applies the §7.13 floor of 3.
 */
export function startRound(state: GameState): void {
  for (const u of Object.values(state.units)) {
    u.status = 'fresh';
    u.stressed = false;
  }
  for (const side of SIDES) {
    const p = state.players[side];
    p.passed = false;
    p.capCurrent = capCeiling(p); // §7.13: at least 3 CAPs at round start
  }
  state.consecutivePasses = 0;

  let a: number;
  let b: number;
  do {
    const ra = roll2d6(state.rng);
    state.rng = ra.rng;
    const rb = roll2d6(state.rng);
    state.rng = rb.rng;
    a = ra.value;
    b = rb.value;
  } while (a === b);
  state.initiativeSide = a > b ? 'A' : 'B';
  state.currentSide = state.initiativeSide;
  state.phase = 'playing';
  state.log.push({
    type: 'roundStart',
    round: state.round,
    text: `Round ${state.round} — initiative: A rolled ${a}, B rolled ${b} → Side ${state.initiativeSide} goes first`,
  });
}

/** End the current round: score control, then advance or finish the game. */
export function endRound(state: GameState): void {
  updateVictoryHexControl(state);
  if (state.round >= state.roundsTotal) {
    state.phase = 'gameOver';
    state.winner = computeWinner(state);
    return;
  }
  state.round += 1;
  startRound(state);
}

export function switchTurn(state: GameState): void {
  state.currentSide = otherSide(state.currentSide);
}
