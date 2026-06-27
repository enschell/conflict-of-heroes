/**
 * Round and turn flow (rulebook §2.0–§2.3).
 */
import { roll2d6 } from './rng';
import type { GameState, SideId } from './types';
import { computeWinner, otherSide, updateVictoryHexControl } from './victory';

const SIDES: SideId[] = ['A', 'B'];

/**
 * Pre-round sequence (infantry subset) + initiative roll. Mutates `state`.
 * Flips spent units fresh, clears activations, resets CAP to start − losses,
 * then rolls 2D6 per side (reroll ties) to decide who goes first.
 */
export function startRound(state: GameState): void {
  for (const u of Object.values(state.units)) u.status = 'fresh';
  for (const side of SIDES) {
    const p = state.players[side];
    p.activatedUnitId = null;
    p.ap = 0;
    p.passed = false;
    p.capCurrent = Math.max(0, p.capStart - p.unitLosses);
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
