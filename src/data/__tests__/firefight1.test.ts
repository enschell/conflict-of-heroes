/**
 * Firefight 1 ("Partisans") content integrity + a deterministic playthrough.
 * This is the M2 acceptance test: real scenario data loads and plays to a
 * decision through the M1 engine, reproducibly.
 */
import { describe, expect, it } from 'vitest';
import { initGame, legalActions, reduce, serialize, deserialize } from '../../engine';
import type { Action, GameState } from '../../engine/types';
import { FIREFIGHT_1 } from '../firefights/firefight1';
import { PARTISANS_MAP } from '../maps/partisans';
import { UNIT_TEMPLATES } from '../units';

describe('Firefight 1 — scenario integrity', () => {
  it('has a well-formed, de-duplicated map', () => {
    const ids = PARTISANS_MAP.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate hexes
    for (const h of PARTISANS_MAP) expect(h.id).toMatch(/^\d+,\d+$/);
  });

  it('places every unit on a real hex with a known template and valid facing', () => {
    const mapIds = new Set(PARTISANS_MAP.map((h) => h.id));
    const unitIds = FIREFIGHT_1.units.map((u) => u.id);
    expect(new Set(unitIds).size).toBe(unitIds.length); // no duplicate unit ids

    for (const u of FIREFIGHT_1.units) {
      expect(mapIds.has(u.hexId), `${u.id} on ${u.hexId}`).toBe(true);
      expect(UNIT_TEMPLATES[u.templateId], `template ${u.templateId}`).toBeDefined();
      expect(FIREFIGHT_1.templates.some((t) => t.id === u.templateId)).toBe(true);
      expect(u.facing).toBeGreaterThanOrEqual(0);
      expect(u.facing).toBeLessThanOrEqual(5);
    }
  });

  it('puts every objective on a real hex', () => {
    const mapIds = new Set(PARTISANS_MAP.map((h) => h.id));
    for (const vh of FIREFIGHT_1.victoryHexes) expect(mapIds.has(vh.hexId)).toBe(true);
  });

  it('uses no cards (FF1 predates the cards section)', () => {
    expect('deck' in FIREFIGHT_1).toBe(false);
    expect('cards' in FIREFIGHT_1).toBe(false);
  });
});

describe('Firefight 1 — initial state', () => {
  it('starts a playable round 1 with both forces deployed', () => {
    const s = initGame(FIREFIGHT_1);
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(Object.keys(s.units)).toHaveLength(10);
    expect(['A', 'B']).toContain(s.currentSide);
  });

  it('gives the partisans initial control of the strongpoint, crossroads neutral', () => {
    const s = initGame(FIREFIGHT_1);
    expect(s.hexes['6,3']?.features.control).toBe('B');
    expect(s.hexes['3,3']?.features.control).toBeUndefined();
  });
});

/** Deterministic, dependency-free auto-player: close combat > fire > move > pass. */
function autoAct(state: GameState): Action {
  const acts = legalActions(state);
  return (
    acts.find((a) => a.type === 'CLOSE_COMBAT') ??
    acts.find((a) => a.type === 'FIRE') ??
    acts.find((a) => a.type === 'MOVE') ??
    { type: 'PASS' }
  );
}

function playOut(seedState: GameState, maxSteps = 2000): { state: GameState; steps: number } {
  let state = seedState;
  let steps = 0;
  while (state.phase === 'playing' && steps < maxSteps) {
    state = reduce(state, autoAct(state)).state;
    steps++;
  }
  return { state, steps };
}

describe('Firefight 1 — plays to a decision', () => {
  it('reaches gameOver within the step budget and the round cap', () => {
    const { state, steps } = playOut(initGame(FIREFIGHT_1));
    expect(state.phase).toBe('gameOver');
    expect(steps).toBeLessThan(2000);
    expect(state.round).toBeLessThanOrEqual(FIREFIGHT_1.roundsTotal);
    expect(state.winner === null || state.winner === 'A' || state.winner === 'B').toBe(true);
  });

  it('is fully deterministic from the seed', () => {
    const a = playOut(initGame(FIREFIGHT_1)).state;
    const b = playOut(initGame(FIREFIGHT_1)).state;
    expect(serialize(a)).toBe(serialize(b));
  });

  it('round-trips through serialize/deserialize mid-game', () => {
    let state = initGame(FIREFIGHT_1);
    for (let i = 0; i < 12 && state.phase === 'playing'; i++) {
      state = reduce(state, autoAct(state)).state;
    }
    const restored = deserialize(serialize(state));
    expect(serialize(restored)).toBe(serialize(state));
    // ...and continues identically from the restore point.
    expect(serialize(playOut(restored).state)).toBe(serialize(playOut(state).state));
  });
});
