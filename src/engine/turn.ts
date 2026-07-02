/**
 * Round and turn flow (rulebook §2.0–§2.3).
 */
import { capCeiling } from './cap';
import { roll2d6 } from './rng';
import { dissipateSmoke } from './smoke';
import type { GameState, SideId } from './types';
import { computeWinner, gainVp, otherSide, updateVictoryHexControl, vpLeader } from './victory';

const SIDES: SideId[] = ['A', 'B'];

/**
 * Pre-Round Sequence (infantry subset, §9.4) + Initiative. Mutates `state`.
 * Flips Spent units Fresh keeping markers + facing (§9.6), clears Stress, resets
 * CAP to ceiling (floor 3, §7.13), dissipates Smoke (§14.4: Heavy → Light,
 * Light → removed), then sets Initiative (§9.11):
 *  - Round 1: the mission-defined side goes first (§2.0).
 *  - Later Rounds: only the side WITHOUT VP Advantage rolls 2d6; on **7+** it
 *    takes the first Turn, otherwise the VP leader does.
 * (Cards and OBA planning/resolution are later modules.)
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
  dissipateSmoke(state);
  state.consecutivePasses = 0;

  if (state.round === 1) {
    state.initiativeSide = state.firstInitiativeSide;
    state.log.push({
      type: 'roundStart',
      round: state.round,
      text: `Round 1 — initiative: Side ${state.initiativeSide} (mission)`,
    });
  } else {
    const leader = vpLeader(state); // holds VP Advantage → does NOT roll (§9.11)
    const challenger = otherSide(leader);
    const r = roll2d6(state.rng);
    state.rng = r.rng;
    state.initiativeSide = r.value >= 7 ? challenger : leader;
    state.log.push({
      type: 'roundStart',
      round: state.round,
      text:
        `Round ${state.round} — initiative: Side ${challenger} (no VP advantage) ` +
        `rolled ${r.value} → Side ${state.initiativeSide} goes first`,
    });
  }
  state.currentSide = state.initiativeSide;
  state.phase = 'playing';
}

/**
 * End the current Round (§9.0): update control, **award end-of-Round control VP**
 * (§9.1) onto the no-tie track, then either finish the Mission (last Round → the
 * VP-Advantage holder wins, §9.3) or advance into the next Pre-Round Sequence.
 */
export function endRound(state: GameState): void {
  updateVictoryHexControl(state);
  for (const vh of state.victory.victoryHexes) {
    const ctrl = state.hexes[vh.hexId]?.features.control;
    if (ctrl) {
      gainVp(state, ctrl, vh.vp);
      state.log.push({
        type: 'vp',
        round: state.round,
        side: ctrl,
        text: `Side ${ctrl} controls ${vh.hexId}: +${vh.vp} VP (end of Round ${state.round})`,
      });
    }
  }
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
