/**
 * Conformance invariants (regression guard for the M3.4 audit). Plays several
 * seeded full games via reduce/legalActions and asserts cross-cutting rules hold
 * every step. The detailed per-move re-derivation lives in scripts/conformance.ts;
 * this keeps a fast, self-contained subset in the test suite.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActions } from '../actions';
import { initGame } from '../state';
import { otherSide } from '../victory';
import { MISSION_1 } from '../../data/missions/mission1';
import type { Action, GameState } from '../types';

const ORDER: Action['type'][] = [
  'ENTER', 'CLOSE_COMBAT', 'FIRE', 'MOVE', 'RALLY', 'PIVOT', 'STALL', 'PASS',
];

function pick(state: GameState): Action {
  const acts = legalActions(state);
  for (const t of ORDER) {
    const found = acts.filter((a) => a.type === t);
    if (found.length) return found[0]!;
  }
  return { type: 'PASS' };
}

function play(seed: number) {
  let state = initGame({ ...MISSION_1, seed });
  let steps = 0;
  while (state.phase === 'playing' && steps < 6000) {
    const pre = state;
    const action = pick(pre);
    expect(legalActions(pre).some((x) => JSON.stringify(x) === JSON.stringify(action))).toBe(true);

    const res = reduce(pre, action);
    expect(res.events.length === 1 && res.events[0]?.type === 'illegal').toBe(false);
    const post = res.state;

    expect(post.players.A.capCurrent).toBeGreaterThanOrEqual(0);
    expect(post.players.B.capCurrent).toBeGreaterThanOrEqual(0);
    for (const u of Object.values(post.units)) expect(u.hitMarkers.length).toBeLessThanOrEqual(1);

    // VP changes from kills (§9.1) plus end-of-Round control awards (§9.0).
    const destroyed = Object.keys(pre.units).filter((id) => !post.units[id]);
    let vpToA = 0;
    let vpToB = 0;
    for (const id of destroyed) {
      const u = pre.units[id]!;
      const vp = pre.victory.vpPerKill ?? pre.templates[u.templateId]!.vp;
      if (otherSide(u.side) === 'A') vpToA += vp;
      else vpToB += vp;
    }
    const roundEnded = action.type === 'PASS' && (post.round > pre.round || post.phase === 'gameOver');
    if (roundEnded) {
      for (const vh of post.victory.victoryHexes) {
        const ctrl = post.hexes[vh.hexId]?.features.control;
        if (ctrl === 'A') vpToA += vh.vp;
        else if (ctrl === 'B') vpToB += vh.vp;
      }
    }
    expect(post.players.A.vp - pre.players.A.vp).toBe(vpToA);
    expect(post.players.B.vp - pre.players.B.vp).toBe(vpToB);
    expect(post.vpMarker).not.toBe(0); // §9.2 no-tie: always a leader

    // A unit sharing a hex with an enemy may not fire OUT of it (§7.7.3).
    for (const u of Object.values(pre.units)) {
      if (u.side !== pre.currentSide) continue;
      const enemyInHex = Object.values(pre.units).some((e) => e.side !== u.side && e.hexId === u.hexId);
      if (!enemyInHex) continue;
      const firesOut = legalActions(pre).some(
        (x) => x.type === 'FIRE' && x.attackerId === u.id && pre.units[x.targetId]?.hexId !== u.hexId,
      );
      expect(firesOut).toBe(false);
    }

    state = post;
    steps += 1;
  }
  expect(state.phase).toBe('gameOver');
}

describe('rules conformance invariants', () => {
  for (const seed of [1, 2, 3, 7, 42, 101]) {
    it(`game seed ${seed} stays legal and finishes`, () => play(seed));
  }
});
