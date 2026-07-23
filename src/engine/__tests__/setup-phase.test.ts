/**
 * Pre-Mission Setup phase (Mission-configurable, user-specified — not a
 * `rules/` chapter of its own): before Round 1, one side places a pool of
 * starting Units onto any empty Hex, then the other side does the same,
 * THEN the real Round 1/initiative sequence begins.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../state';
import { reduce } from '../reducer';
import { legalSetupHexes } from '../setup';
import { baseState, addHex, addTemplate, addUnit, rifleTemplate } from './helpers';
import type { FirefightDef, MapHexDef } from '../types';

function miniDef(over: Partial<FirefightDef> = {}): FirefightDef {
  const hexes: MapHexDef[] = [];
  for (let q = 0; q <= 3; q++) hexes.push({ id: `${q},0`, terrain: 'open' });
  return {
    id: 'm', name: 'Mini', roundsTotal: 5, seed: 1,
    caps: { A: 7, B: 7 }, nations: { A: ['germans'], B: ['soviets'] },
    templates: [rifleTemplate()],
    hexes,
    units: [],
    victoryHexes: [],
    ...over,
  };
}

describe('initGame with setupForces', () => {
  it('a Mission with no setupForces skips straight to playing, as before', () => {
    const s = initGame(miniDef());
    expect(s.phase).toBe('playing');
    expect(s.setupPool ?? []).toEqual([]);
    expect(s.setupSide).toBeUndefined();
  });

  it('a Mission with setupForces stays in the setup phase, pool Units not yet on the map', () => {
    const s = initGame(
      miniDef({
        setupForces: [
          { id: 'A1', side: 'A', templateId: 'rifle', facing: 0 },
          { id: 'B1', side: 'B', templateId: 'rifle', facing: 3 },
        ],
      }),
    );
    expect(s.phase).toBe('setup');
    expect(s.setupPool).toHaveLength(2);
    expect(s.units['A1']).toBeUndefined();
    expect(s.units['B1']).toBeUndefined();
  });

  it('defaults setupSide to Side A', () => {
    const s = initGame(
      miniDef({ setupForces: [{ id: 'A1', side: 'A', templateId: 'rifle', facing: 0 }] }),
    );
    expect(s.setupSide).toBe('A');
  });

  it('setupFirstSide is honored', () => {
    const s = initGame(
      miniDef({
        setupForces: [
          { id: 'A1', side: 'A', templateId: 'rifle', facing: 0 },
          { id: 'B1', side: 'B', templateId: 'rifle', facing: 3 },
        ],
        setupFirstSide: 'B',
      }),
    );
    expect(s.setupSide).toBe('B');
  });

  it('skips to the side that actually has pool Units if the authored first side has none', () => {
    const s = initGame(
      miniDef({
        setupForces: [{ id: 'B1', side: 'B', templateId: 'rifle', facing: 3 }],
        setupFirstSide: 'A', // A has nothing to place
      }),
    );
    expect(s.setupSide).toBe('B');
  });
});

describe('SETUP_PLACE (reducer)', () => {
  function scene() {
    const s = baseState();
    for (let q = 0; q <= 3; q++) addHex(s, q, 0);
    addTemplate(s, rifleTemplate());
    s.phase = 'setup';
    s.setupSide = 'A';
    s.setupPool = [
      { id: 'A1', side: 'A', nation: 'germans', templateId: 'rifle', facing: 0 },
      { id: 'A2', side: 'A', nation: 'germans', templateId: 'rifle', facing: 0 },
      { id: 'B1', side: 'B', nation: 'soviets', templateId: 'rifle', facing: 3 },
    ];
    return s;
  }

  it('every other Action type is denied while phase is setup', () => {
    const s = scene();
    const res = reduce(s, { type: 'PASS' });
    expect(res.state).toBe(s); // untouched — denied before any clone
  });

  it('the granted CHOOSE_FACING is honored DURING setup, not silently no-op\'d', () => {
    const s = scene();
    const r1 = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0', facing: 2 });
    // Still mid-setup (A2/B1 unplaced) — the free correction must work NOW,
    // not only once the phase ends (caught live: the "Choose facing" callout
    // appeared but every click was swallowed by the setup-phase Action guard).
    expect(r1.state.phase).toBe('setup');
    const r2 = reduce(r1.state, { type: 'CHOOSE_FACING', unitId: 'A1', facing: 5 });
    expect(r2.state.units['A1']!.facing).toBe(5);
    expect(r2.state.pendingFacingChoices ?? []).not.toContain('A1');
    expect(r2.state.phase).toBe('setup'); // choosing a facing never advances setup
  });

  it('places the Unit, removes it from the pool, and grants a free facing choice', () => {
    const s = scene();
    const res = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0', facing: 2 });
    expect(res.state.units['A1']).toMatchObject({ hexId: '0,0', facing: 2, side: 'A', status: 'fresh' });
    expect(res.state.setupPool!.some((u) => u.id === 'A1')).toBe(false);
    expect(res.state.pendingFacingChoices).toContain('A1');
    expect(res.state.phase).toBe('setup'); // Side A still has A2 left
    expect(res.state.setupSide).toBe('A');
  });

  it('denies placing the other side\'s Unit out of turn', () => {
    const s = scene();
    const res = reduce(s, { type: 'SETUP_PLACE', unitId: 'B1', hexId: '0,0' });
    expect(res.state).toBe(s);
  });

  it('denies placing onto an already-occupied Hex', () => {
    const s = scene();
    const r1 = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0' });
    const r2 = reduce(r1.state, { type: 'SETUP_PLACE', unitId: 'A2', hexId: '0,0' });
    expect(r2.state).toBe(r1.state); // denied, unchanged
  });

  it('hands setup to Side B once Side A\'s pool is empty', () => {
    const s = scene();
    const r1 = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0' });
    const r2 = reduce(r1.state, { type: 'SETUP_PLACE', unitId: 'A2', hexId: '1,0' });
    expect(r2.state.setupSide).toBe('B');
    expect(r2.state.phase).toBe('setup'); // B still has B1 to place
  });

  it('finishes setup and starts the real Round 1 once BOTH sides are done', () => {
    const s = scene();
    const r1 = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0' });
    const r2 = reduce(r1.state, { type: 'SETUP_PLACE', unitId: 'A2', hexId: '1,0' });
    const r3 = reduce(r2.state, { type: 'SETUP_PLACE', unitId: 'B1', hexId: '2,0' });
    expect(r3.state.setupSide).toBeUndefined();
    expect(r3.state.phase).toBe('playing');
    expect(r3.state.round).toBe(1);
    expect(r3.state.units['A1']).toBeDefined();
    expect(r3.state.units['A2']).toBeDefined();
    expect(r3.state.units['B1']).toBeDefined();
    // Round 1 initiative already ran (startRound) — currentSide is set to it.
    expect(r3.state.currentSide).toBe(r3.state.initiativeSide);
  });

  it('a real Action (e.g. PASS) is processed again once setup has finished', () => {
    const s = scene();
    const r1 = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0' });
    const r2 = reduce(r1.state, { type: 'SETUP_PLACE', unitId: 'A2', hexId: '1,0' });
    const r3 = reduce(r2.state, { type: 'SETUP_PLACE', unitId: 'B1', hexId: '2,0' });
    // Confirm the reducer actually processes a real Action now, rather than
    // silently no-oping the way it would have during 'setup'.
    const res = reduce(r3.state, { type: 'PASS' });
    expect(res.state).not.toBe(r3.state);
  });
});

describe('legalSetupHexes', () => {
  it('excludes occupied Hexes only', () => {
    const s = baseState();
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addHex(s, 2, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'X', 'A', 1, 0, 0);
    expect(legalSetupHexes(s).sort()).toEqual(['0,0', '2,0']);
  });

  it('forMine additionally excludes Hexes with an existing Obstacle/Fortification (§17.0)', () => {
    const s = baseState();
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addHex(s, 2, 0);
    s.hexes['1,0']!.features.obstacle = { kind: 'barbedWire', destroyed: false, ownerSide: 'A' };
    s.hexes['2,0']!.features.fortification = { kind: 'trench', destroyed: false };
    expect(legalSetupHexes(s).sort()).toEqual(['0,0', '1,0', '2,0']); // units may stand on them
    expect(legalSetupHexes(s, true)).toEqual(['0,0']); // a Mine may not stack on either
  });
});

describe('SETUP_PLACE of a Mines token (§17.10, data-only hidden)', () => {
  function mineScene() {
    const s = baseState();
    for (let q = 0; q <= 3; q++) addHex(s, q, 0);
    addTemplate(s, rifleTemplate());
    s.phase = 'setup';
    s.setupSide = 'A';
    s.setupPool = [
      { id: 'A-mines-1', side: 'A', nation: 'germans', templateId: 'mines', facing: 0, hidden: true, mine: { hitNumber: 8 } },
      { id: 'B1', side: 'B', nation: 'soviets', templateId: 'rifle', facing: 3 },
    ];
    return s;
  }

  it('placing writes a hidden Mines obstacle onto the Hex — no Unit is created', () => {
    const s = mineScene();
    const r = reduce(s, { type: 'SETUP_PLACE', unitId: 'A-mines-1', hexId: '1,0' });
    expect(r.state.units['A-mines-1']).toBeUndefined();
    expect(r.state.hexes['1,0']!.features.obstacle).toEqual({
      kind: 'mines',
      hitNumber: 8,
      destroyed: false,
      ownerSide: 'A',
      hidden: true,
    });
    expect(r.state.setupPool!.some((u) => u.id === 'A-mines-1')).toBe(false);
    // No facing window — an obstacle has no facing.
    expect(r.state.pendingFacingChoices ?? []).toEqual([]);
    // Placing the mine counted as Side A's setup — hand-off to B.
    expect(r.state.setupSide).toBe('B');
  });

  it('denies placing a Mines token onto a Hex that already has an Obstacle', () => {
    const s = mineScene();
    s.hexes['1,0']!.features.obstacle = { kind: 'roadBlock', destroyed: false, ownerSide: 'B' };
    const r = reduce(s, { type: 'SETUP_PLACE', unitId: 'A-mines-1', hexId: '1,0' });
    expect(r.state).toBe(s);
  });

  it('a hidden non-mine pool Unit carries hidden onto the placed Unit (data-only)', () => {
    const s = mineScene();
    s.setupPool = [
      { id: 'A1', side: 'A', nation: 'germans', templateId: 'rifle', facing: 0, hidden: true },
      ...s.setupPool!.filter((u) => u.id !== 'A-mines-1'),
    ];
    const r = reduce(s, { type: 'SETUP_PLACE', unitId: 'A1', hexId: '0,0' });
    expect(r.state.units['A1']!.hidden).toBe(true);
  });
});
