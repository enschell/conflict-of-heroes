/** Reinforcements (rulebook §4.12): Units entering the Map from off-board. */
import { describe, expect, it } from 'vitest';
import { legalActionsForReinforcement } from '../actions';
import { legalEntryHexes } from '../reinforcements';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState, ReinforcementUnit } from '../types';

function scene(): GameState {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  for (let q = 0; q <= 3; q++) addHex(s, q, 0);
  return s;
}

function reinforcement(over: Partial<ReinforcementUnit> = {}): ReinforcementUnit {
  return {
    id: 'R1',
    side: 'A',
    nation: 'germans',
    templateId: 'rifle',
    facing: 0,
    waveId: 'wave1',
    earliestRound: 1,
    entryHexIds: ['0,0', '1,0'],
    ...over,
  };
}

describe('legalEntryHexes (§4.12)', () => {
  it('returns the Mission-specified entry hexes when none are enemy-occupied', () => {
    const s = scene();
    const r = reinforcement();
    expect(legalEntryHexes(s, r).sort()).toEqual(['0,0', '1,0'].sort());
  });

  it('excludes an entry hex occupied by an enemy unit', () => {
    const s = scene();
    addUnit(s, 'E1', 'B', 0, 0, 3, 'rifle');
    const r = reinforcement();
    expect(legalEntryHexes(s, r)).toEqual(['1,0']);
  });

  it('falls back to within 2 hexes when ALL entry hexes are enemy-occupied', () => {
    const s = scene();
    addUnit(s, 'E1', 'B', 0, 0, 3, 'rifle');
    addUnit(s, 'E2', 'B', 1, 0, 3, 'rifle');
    const r = reinforcement();
    const legal = legalEntryHexes(s, r);
    // Neither original entry hex is offered (both enemy-occupied)...
    expect(legal).not.toContain('0,0');
    expect(legal).not.toContain('1,0');
    // ...but nearby non-occupied hexes within 2 are.
    expect(legal).toContain('2,0');
  });
});

describe('legalActionsForReinforcement (round gating)', () => {
  it('offers no ENTER actions before the earliest Round', () => {
    const s = scene();
    s.reinforcements.push(reinforcement({ earliestRound: 3 }));
    expect(s.round).toBe(1);
    expect(legalActionsForReinforcement(s, 'R1')).toEqual([]);
  });

  it('offers one ENTER action per legal entry hex once eligible', () => {
    const s = scene();
    s.round = 3;
    s.reinforcements.push(reinforcement({ earliestRound: 3 }));
    const acts = legalActionsForReinforcement(s, 'R1');
    expect(acts).toHaveLength(2);
    expect(acts.every((a) => a.type === 'ENTER')).toBe(true);
  });

  it('offers nothing for the other side\'s reinforcement', () => {
    const s = scene();
    s.reinforcements.push(reinforcement({ side: 'B' }));
    expect(s.currentSide).toBe('A');
    expect(legalActionsForReinforcement(s, 'R1')).toEqual([]);
  });
});

describe('ENTER reducer (§4.12)', () => {
  it('places the Unit, removes it from reinforcements, costs 0AP, no Spent Check, but Stresses it', () => {
    const s = scene();
    s.reinforcements.push(reinforcement());
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '1,0' }] });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    const u = res.state.units['R1'];
    expect(u).toBeDefined();
    expect(u!.hexId).toBe('1,0');
    expect(u!.facing).toBe(0); // wave's suggested facing (no override given)
    expect(u!.status).toBe('fresh');
    expect(u!.stressed).toBe(true); // §4.12: still Stressed despite 0AP
    expect(res.state.reinforcements).toHaveLength(0);
    expect(res.events.some((e) => e.type === 'spent' && /no Spent Check/.test(e.text))).toBe(true);
    expect(res.state.currentSide).not.toBe(s.currentSide); // hands over the turn
  });

  it('an explicit facing overrides the wave-suggested one', () => {
    const s = scene();
    s.reinforcements.push(reinforcement());
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '1,0', facing: 3 }] });
    expect(res.state.units['R1']!.facing).toBe(3);
  });

  it('denies entry before the earliest Round', () => {
    const s = scene();
    s.reinforcements.push(reinforcement({ earliestRound: 3 }));
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '1,0' }] });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s); // untouched
  });

  it('denies entry onto a hex not in the legal entry set', () => {
    const s = scene();
    s.reinforcements.push(reinforcement());
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '2,0' }] });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('denies entering the other side\'s reinforcement', () => {
    const s = scene();
    s.reinforcements.push(reinforcement({ side: 'B' }));
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '1,0' }] });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('Group entry: multiple Units in one Action, all Stressed, one (skipped) Spent Check', () => {
    const s = scene();
    s.reinforcements.push(
      reinforcement({ id: 'R1', entryHexIds: ['0,0'] }),
      reinforcement({ id: 'R2', entryHexIds: ['1,0'] }),
    );
    const res = reduce(s, {
      type: 'ENTER',
      placements: [
        { unitId: 'R1', hexId: '0,0' },
        { unitId: 'R2', hexId: '1,0' },
      ],
    });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R1']).toBeDefined();
    expect(res.state.units['R2']).toBeDefined();
    expect(res.state.units['R1']!.stressed).toBe(true);
    expect(res.state.units['R2']!.stressed).toBe(true);
    expect(res.state.reinforcements).toHaveLength(0);
    const checks = res.events.filter((e) => e.type === 'spent');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.text).toMatch(/Group 0AP action/);
  });

  it('rejects a duplicate unit id within one ENTER action', () => {
    const s = scene();
    s.reinforcements.push(reinforcement());
    const res = reduce(s, {
      type: 'ENTER',
      placements: [
        { unitId: 'R1', hexId: '0,0' },
        { unitId: 'R1', hexId: '1,0' },
      ],
    });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('taking control of an objective on entry updates Hex control', () => {
    const s = scene();
    s.victory.victoryHexes = [{ hexId: '1,0', vp: 1 }];
    s.reinforcements.push(reinforcement());
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '1,0' }] });
    expect(res.state.hexes['1,0']!.features.control).toBe('A');
  });
});
