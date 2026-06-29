import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { deserialize, initGame, serialize } from '../state';
import type { FirefightDef, MapHexDef } from '../types';
import { rifleTemplate } from './helpers';

function ff(seed = 1, rounds = 5): FirefightDef {
  const hexes: MapHexDef[] = [];
  for (let q = 0; q <= 5; q++) hexes.push({ id: `${q},0`, terrain: 'open' });
  return {
    id: 't',
    name: 'Test',
    roundsTotal: rounds,
    seed,
    caps: { A: 5, B: 5 },
    nations: { A: ['germans'], B: ['soviets'] },
    templates: [rifleTemplate()],
    hexes,
    units: [
      { id: 'A1', side: 'A', templateId: 'rifle', hexId: '0,0', facing: 0 },
      { id: 'B1', side: 'B', templateId: 'rifle', hexId: '3,0', facing: 3 },
    ],
    victoryHexes: [],
  };
}

describe('turn & round flow (rulebook §2)', () => {
  it('initGame starts a playable round 1', () => {
    const s = initGame(ff());
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.currentSide).toBe(s.initiativeSide);
  });

  it('is deterministic for a fixed seed', () => {
    expect(initGame(ff(99))).toEqual(initGame(ff(99)));
  });

  it('two consecutive passes end the round', () => {
    let s = initGame(ff(1, 5));
    const r0 = s.round;
    s = reduce(s, { type: 'PASS' }).state;
    s = reduce(s, { type: 'PASS' }).state;
    expect(s.round).toBe(r0 + 1);
    expect(s.consecutivePasses).toBe(0);
    expect(s.phase).toBe('playing');
  });

  it('passing through the final round ends the game', () => {
    let s = initGame(ff(1, 1));
    s = reduce(s, { type: 'PASS' }).state;
    s = reduce(s, { type: 'PASS' }).state;
    expect(s.phase).toBe('gameOver');
  });

  it('a non-pass action resets the consecutive-pass counter', () => {
    let s = initGame(ff(1, 5));
    s = reduce(s, { type: 'PASS' }).state;
    expect(s.consecutivePasses).toBe(1);
    const unit = s.currentSide === 'A' ? 'A1' : 'B1';
    s = reduce(s, { type: 'STALL', unitId: unit }).state;
    expect(s.consecutivePasses).toBe(0);
  });

  it('replays identically and round-trips through serialization', () => {
    const script = [{ type: 'PASS' }, { type: 'PASS' }, { type: 'PASS' }, { type: 'PASS' }] as const;
    const run = (def: FirefightDef) =>
      script.reduce((st, a) => reduce(st, a).state, initGame(def));
    const a = run(ff(7));
    const b = run(ff(7));
    expect(a).toEqual(b);
    expect(deserialize(serialize(a))).toEqual(a);
  });
});
