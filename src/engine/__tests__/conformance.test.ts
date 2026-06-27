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
import { FIREFIGHT_1 } from '../../data/firefights/firefight1';
import type { Action, GameState } from '../types';

const ORDER: Action['type'][] = [
  'CLOSE_COMBAT', 'FIRE', 'MOVE', 'ACTIVATE_UNIT', 'RALLY', 'PIVOT', 'MARK_SPENT', 'STALL', 'PASS',
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
  let state = initGame({ ...FIREFIGHT_1, seed });
  let steps = 0;
  while (state.phase === 'playing' && steps < 6000) {
    const pre = state;
    const action = pick(pre);
    expect(legalActions(pre).some((x) => JSON.stringify(x) === JSON.stringify(action))).toBe(true);

    const res = reduce(pre, action);
    expect(res.events.length === 1 && res.events[0]?.type === 'illegal').toBe(false);
    const post = res.state;

    expect(post.players.A.ap).toBeGreaterThanOrEqual(0);
    expect(post.players.B.ap).toBeGreaterThanOrEqual(0);
    expect(post.players.A.capCurrent).toBeGreaterThanOrEqual(0);
    expect(post.players.B.capCurrent).toBeGreaterThanOrEqual(0);
    for (const u of Object.values(post.units)) expect(u.hitMarkers.length).toBeLessThanOrEqual(1);

    // VP changes only from kills during play (§2.5.1).
    const destroyed = Object.keys(pre.units).filter((id) => !post.units[id]);
    let vpToA = 0;
    let vpToB = 0;
    for (const id of destroyed) {
      const u = pre.units[id]!;
      const vp = pre.templates[u.templateId]!.vp;
      if (otherSide(u.side) === 'A') vpToA += vp;
      else vpToB += vp;
    }
    expect(post.players.A.vp - pre.players.A.vp).toBe(vpToA);
    expect(post.players.B.vp - pre.players.B.vp).toBe(vpToB);

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
