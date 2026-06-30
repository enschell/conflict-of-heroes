import { describe, expect, it } from 'vitest';
import { MISSION_1 } from '../missions/mission1';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { initGame, legalActions, reduce } from '../../engine';
import type { Action, GameState } from '../../engine/types';

const mapIds = new Set(MISSION1_MAP.map((h) => h.id));

describe('Mission 1 — Partisans (setup)', () => {
  it('uses the real Map 1 board and the v3 mission parameters', () => {
    expect(MISSION_1.hexes).toBe(MISSION1_MAP);
    expect(MISSION_1.roundsTotal).toBe(5);
    expect(MISSION_1.caps).toEqual({ A: 7, B: 7 });
    expect(MISSION_1.firstInitiative).toBe('A'); // German Round-1 initiative
    expect(MISSION_1.startVp).toEqual({ B: 1 }); // Soviets begin with 1 VP
    expect(MISSION_1.vpPerKill).toBe(1); // flat 1 VP per kill
  });

  it('scores the single objective I06 at 1 VP', () => {
    expect(MISSION_1.victoryHexes).toEqual([{ hexId: hexIdForLabel('I06'), vp: 1 }]);
  });

  it('places all units on valid map hexes with known templates', () => {
    const ids = MISSION_1.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    for (const u of MISSION_1.units) {
      expect(mapIds.has(u.hexId)).toBe(true);
      expect(MISSION_1.templates.some((t) => t.id === u.templateId)).toBe(true);
    }
    // Stopgap forces: 4 Germans pre-placed + 4 Soviet partisans set up.
    expect(MISSION_1.units.filter((u) => u.side === 'A')).toHaveLength(4);
    expect(MISSION_1.units.filter((u) => u.side === 'B')).toHaveLength(4);
  });

  it('is a no-card teaching mission', () => {
    expect('deck' in MISSION_1).toBe(false);
    expect('cards' in MISSION_1).toBe(false);
  });
});

describe('Mission 1 — initial state', () => {
  it('starts the Soviets (B) with the 1-VP no-tie advantage, Germans first', () => {
    const s = initGame(MISSION_1);
    expect(s.phase).toBe('playing');
    expect(s.players.B.vp).toBe(1);
    expect(s.players.A.vp).toBe(0);
    expect(s.vpMarker).toBe(-1); // B leads by 1 (§9.2)
    expect(s.initiativeSide).toBe('A'); // German Round-1 initiative
    expect(s.players.A.capCurrent).toBe(7);
  });

  it('controls I06 for whoever sits on it (Soviet Maxim is elsewhere at start)', () => {
    const s = initGame(MISSION_1);
    // No unit starts on I06, so it begins uncontrolled.
    expect(s.hexes[hexIdForLabel('I06')]!.features.control).toBeUndefined();
  });
});

const ORDER: Action['type'][] = ['CLOSE_COMBAT', 'FIRE', 'MOVE', 'RALLY', 'PIVOT', 'STALL', 'PASS'];
function pick(state: GameState): Action {
  const acts = legalActions(state);
  for (const t of ORDER) {
    const found = acts.filter((a) => a.type === t);
    if (found.length) return found[0]!;
  }
  return { type: 'PASS' };
}

describe('Mission 1 — plays to a decision', () => {
  it('reaches gameOver within the round cap with a VP-advantage winner', () => {
    let s = initGame(MISSION_1);
    let steps = 0;
    while (s.phase === 'playing' && steps < 8000) {
      s = reduce(s, pick(s)).state;
      steps += 1;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.round).toBeLessThanOrEqual(MISSION_1.roundsTotal);
    expect(s.winner === 'A' || s.winner === 'B').toBe(true); // no-tie: always a winner
  });
});
