/**
 * FIRE_SMOKE and INDIRECT_FIRE through the reducer (rulebook §13.2, §14.1):
 * end-to-end action economy (Spent Check, turn handover) on top of the pure
 * fire-zone/roll logic already covered by `mortar.test.ts`/`smoke.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { legalActionsForUnit } from '../actions';
import { reduce } from '../reducer';
import type { UnitTemplate } from '../types';
import { addHex, addTemplate, addUnit, baseState } from './helpers';

function mortarTemplate(over: Partial<UnitTemplate> = {}): UnitTemplate {
  return {
    id: 'mortar',
    nation: 'germans',
    name: 'Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 4, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 12,
    minRange: 2,
    apToFire: 3,
    indirectApToFire: 4,
    vp: 2,
    unburdened: false,
    canFireSmoke: true,
    ...over,
  };
}

function rifle(over: Partial<UnitTemplate> = {}): UnitTemplate {
  return {
    id: 'rifle',
    nation: 'germans',
    name: 'Rifle',
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 4,
    vp: 1,
    unburdened: true,
    ...over,
  };
}

/** Mortar (0,0) facing East — Woods (1,0, blocks) — open (2,0) — Target (3,0); Spotter (1,-1). */
function scene() {
  const s = baseState();
  addTemplate(s, mortarTemplate());
  addTemplate(s, rifle());
  addHex(s, 0, 0, 'open');
  addHex(s, 1, 0, 'woodsHeavy');
  addHex(s, 2, 0, 'open');
  addHex(s, 3, 0, 'open');
  addHex(s, 1, -1, 'open');
  addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');
  addUnit(s, 'T1', 'B', 3, 0, 3, 'rifle');
  return s;
}

describe('INDIRECT_FIRE reducer flow (§13.2)', () => {
  it('resolves through a valid Spotter Hex, runs a Spent Check, and hands over the turn', () => {
    const s = scene();
    const res = reduce(s, {
      type: 'INDIRECT_FIRE',
      attackerId: 'M1',
      targetHexId: '3,0',
      spotterHexId: '1,-1',
    });
    expect(res.events.some((e) => e.type === 'indirectFire')).toBe(true);
    expect(res.events.some((e) => e.type === 'spent')).toBe(true);
    expect(res.state.currentSide).toBe('B');
  });

  it('denies an invalid Spotter Hex and leaves state untouched', () => {
    const s = scene();
    const res = reduce(s, {
      type: 'INDIRECT_FIRE',
      attackerId: 'M1',
      targetHexId: '3,0',
      spotterHexId: '3,0', // too far from the mortar (dist 3 > 2)
    });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s);
  });

  it('denies Indirect Attacks from a non-Mortar Unit', () => {
    const s = scene();
    addHex(s, 2, -1, 'open');
    addUnit(s, 'R1', 'A', 2, -1, 0, 'rifle');
    const res = reduce(s, {
      type: 'INDIRECT_FIRE',
      attackerId: 'R1',
      targetHexId: '3,0',
      spotterHexId: '1,-1',
    });
    expect(res.events[0]?.type).toBe('illegal');
  });
});

describe('FIRE_SMOKE reducer flow (§14.1)', () => {
  it('Direct: places a Heavy Smoke Marker on the Target Hex instead of attacking', () => {
    const s = baseState();
    addTemplate(s, mortarTemplate());
    for (let q = 0; q <= 3; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');

    const res = reduce(s, { type: 'FIRE_SMOKE', unitId: 'M1', targetHexId: '3,0' });
    expect(res.state.hexes['3,0']!.features.smoke).toBe(2);
    expect(res.events.some((e) => e.type === 'smoke')).toBe(true);
    expect(res.state.currentSide).toBe('B');
  });

  it('Indirect: places Smoke on a Hex the Mortar cannot itself see, via a Spotter Hex', () => {
    const s = scene();
    const res = reduce(s, {
      type: 'FIRE_SMOKE',
      unitId: 'M1',
      targetHexId: '3,0',
      spotterHexId: '1,-1',
    });
    expect(res.state.hexes['3,0']!.features.smoke).toBe(2);
  });

  it('denies Fire Smoke from a Unit without canFireSmoke', () => {
    const s = baseState();
    addTemplate(s, rifle());
    for (let q = 0; q <= 3; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'R1', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'FIRE_SMOKE', unitId: 'R1', targetHexId: '3,0' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('§14.0: enumerates a legal FIRE_SMOKE onto an unoccupied Hex — targets terrain, not a Unit', () => {
    const s = baseState();
    addTemplate(s, mortarTemplate());
    for (let q = 0; q <= 3; q++) addHex(s, q, 0, 'open'); // no enemy anywhere on the board
    addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');

    const acts = legalActionsForUnit(s, 'M1');
    const smokeAct = acts.find((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === '3,0');
    expect(smokeAct).toBeDefined();

    const res = reduce(s, smokeAct!);
    expect(res.state.hexes['3,0']!.features.smoke).toBe(2);
  });

  it('§14.0: never offers Fire Smoke onto Water', () => {
    const s = baseState();
    addTemplate(s, mortarTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addHex(s, 2, 0, 'open');
    addHex(s, 3, 0, 'water');
    addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');

    const acts = legalActionsForUnit(s, 'M1');
    expect(acts.some((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === '3,0')).toBe(false);
  });
});
