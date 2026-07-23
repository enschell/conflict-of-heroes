import { describe, expect, it } from 'vitest';
import { gainVp, vpLeader, vpMargin, computeWinner } from '../victory';
import { startRound } from '../turn';
import { initGame } from '../state';
import { makeRng, roll2d6 } from '../rng';
import type { FirefightDef, MapHexDef } from '../types';
import { baseState } from './helpers';
import { rifleTemplate } from './helpers';

describe('no-tie VP track (§9.2)', () => {
  it('leader gaining VP widens the margin', () => {
    const s = baseState();
    s.vpMarker = 2; // A leads by 2
    gainVp(s, 'A', 1);
    expect(s.vpMarker).toBe(3);
    expect(vpLeader(s)).toBe('A');
    expect(vpMargin(s)).toBe(3);
  });

  it('rulebook example: A leads 2, B gains 2 → flips to B leading 1 (skips 0)', () => {
    const s = baseState();
    s.vpMarker = 2; // Germans (A) hold 2 VP advantage
    gainVp(s, 'B', 2); // Soviets take a 2-VP objective
    expect(s.vpMarker).toBe(-1); // marker stepped 2→1→flip→ B's 1
    expect(vpLeader(s)).toBe('B');
    expect(vpMargin(s)).toBe(1);
  });

  it('never lands on 0 and the winner is always the advantage holder', () => {
    const s = baseState();
    s.vpMarker = 1; // A leads by 1
    gainVp(s, 'B', 1); // trailer ties the score → flip, not 0
    expect(s.vpMarker).toBe(-1);
    expect(computeWinner(s)).toBe('B');
  });

  it('gross per-side VP still accumulates for display', () => {
    const s = baseState();
    s.players.A.vp = 0;
    gainVp(s, 'A', 3);
    expect(s.players.A.vp).toBe(3);
  });
});

function miniDef(over: Partial<FirefightDef> = {}): FirefightDef {
  const hexes: MapHexDef[] = [];
  for (let q = 0; q <= 3; q++) hexes.push({ id: `${q},0`, terrain: 'open' });
  return {
    id: 'm', name: 'Mini', roundsTotal: 5, seed: 1,
    caps: { A: 7, B: 7 }, nations: { A: ['germans'], B: ['soviets'] },
    templates: [rifleTemplate()],
    hexes,
    units: [
      { id: 'A1', side: 'A', templateId: 'rifle', hexId: '0,0', facing: 0 },
      { id: 'B1', side: 'B', templateId: 'rifle', hexId: '3,0', facing: 3 },
    ],
    victoryHexes: [],
    ...over,
  };
}

describe('Mission-1-style setup (§9.2, §2.0)', () => {
  it('Soviets start with 1 VP and the German side has Round-1 initiative', () => {
    const s = initGame(miniDef({ startVp: { B: 1 }, firstInitiative: 'A' }));
    expect(s.players.B.vp).toBe(1);
    expect(s.vpMarker).toBe(-1); // B leads by 1
    expect(vpLeader(s)).toBe('B');
    expect(vpMargin(s)).toBe(1);
    expect(s.initiativeSide).toBe('A'); // Round-1 initiative is mission-defined
    expect(s.currentSide).toBe('A');
  });
});

describe('v3 initiative (§9.11)', () => {
  it('Round 1 uses the mission side and rolls no dice', () => {
    const s = baseState();
    s.round = 1;
    s.firstInitiativeSide = 'B';
    const rngBefore = { ...s.rng };
    startRound(s);
    expect(s.initiativeSide).toBe('B');
    expect(s.rng).toEqual(rngBefore); // no initiative roll in Round 1
  });

  it('later Rounds: only the non-advantage side rolls; 7+ gives it the first Turn', () => {
    const s = baseState();
    s.round = 2;
    s.vpMarker = 3; // A holds VP advantage → B (challenger) rolls
    // Predict the 2d6 the engine will roll from the current RNG.
    const predicted = roll2d6(makeRng(s.rng.state)).value;
    startRound(s);
    const expected = predicted >= 7 ? 'B' : 'A';
    expect(s.initiativeSide).toBe(expected);
  });
});
