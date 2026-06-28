import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

describe('reducer', () => {
  it('opportunity fire destroys a target and awards VP', () => {
    const s = baseState(); // phase playing, currentSide A
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } }));
    addTemplate(s, rifleTemplate({ id: 'rifle', vp: 2 }));
    for (let q = 0; q <= 4; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big'); // fresh -> opportunity
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle'); // adjacent, faces attacker

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined(); // destroyed
    expect(res.state.players.A.vp).toBe(2); // VP to attacker's side
    expect(res.state.units['A1']!.status).toBe('spent'); // opportunity spends unit
    expect(res.state.currentSide).toBe('B'); // turn handed over
  });

  it('denies an out-of-arc shot and leaves the original state untouched', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    for (let q = -1; q <= 1; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle'); // facing East
    addUnit(s, 'B1', 'B', -1, 0, 0, 'rifle'); // West, behind the attacker

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s);
  });

  it('activate then move spends AP and hands over the turn', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');

    const a1 = reduce(s, { type: 'ACTIVATE_UNIT', unitId: 'A1' });
    expect(a1.state.players.A.ap).toBe(7);
    expect(a1.state.currentSide).toBe('A'); // activation is not a handover

    const a2 = reduce(a1.state, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(a2.state.players.A.ap).toBe(6);
    expect(a2.state.units['A1']!.hexId).toBe('1,0');
    expect(a2.state.currentSide).toBe('B');
  });

  it('one FIRE resolves every enemy in the target hex for a single fire cost (§7.5.1)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } }));
    addTemplate(s, rifleTemplate({ id: 'rifle', vp: 1 }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big'); // faces East toward (1,0)
    addUnit(s, 'B1', 'B', 1, 0, 0, 'rifle');
    addUnit(s, 'B2', 'B', 1, 0, 0, 'rifle');

    const act = reduce(s, { type: 'ACTIVATE_UNIT', unitId: 'A1' });
    const res = reduce(act.state, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined(); // both in the hex are hit
    expect(res.state.units['B2']).toBeUndefined();
    expect(res.state.players.A.vp).toBe(2); // VP for both kills
    expect(res.state.players.A.ap).toBe(7 - 4); // a single fire cost, not one per target
    expect(res.state.currentSide).toBe('B'); // turn handed over once
  });

  it('a hit on an already-hit unit destroys it', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } }));
    addTemplate(s, rifleTemplate({ id: 'rifle' }));
    for (let q = 0; q <= 2; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big');
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle', ['suppressed']); // already hit

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined();
  });
});
