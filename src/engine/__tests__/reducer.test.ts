import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

describe('reducer (v3 action economy)', () => {
  it('a fire destroys a target, awards VP, runs a Spent Check, and hands over', () => {
    const s = baseState(); // phase playing, currentSide A
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } }));
    addTemplate(s, rifleTemplate({ id: 'rifle', vp: 2 }));
    for (let q = 0; q <= 4; q++) addHex(s, q, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big');
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle'); // adjacent, faces attacker

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined(); // destroyed
    expect(res.state.players.A.vp).toBe(2); // VP to attacker's side
    expect(res.events.some((e) => e.type === 'spent')).toBe(true); // Spent Check ran
    expect(res.state.units['A1']!.stressed).toBe(true); // acting Stresses (§2.6)
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

  it('a move resolves through a Spent Check and hands over the turn', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');

    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(res.state.units['A1']!.hexId).toBe('1,0');
    expect(res.events.some((e) => e.type === 'spent')).toBe(true);
    expect(res.state.units['A1']!.stressed).toBe(true);
    expect(res.state.currentSide).toBe('B');
  });

  it('one FIRE resolves every enemy in the target hex for a single Spent Check (§7.5.1)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } }));
    addTemplate(s, rifleTemplate({ id: 'rifle', vp: 1 }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big'); // faces East toward (1,0)
    addUnit(s, 'B1', 'B', 1, 0, 0, 'rifle');
    addUnit(s, 'B2', 'B', 1, 0, 0, 'rifle');

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined(); // both in the hex are hit
    expect(res.state.units['B2']).toBeUndefined();
    expect(res.state.players.A.vp).toBe(2); // VP for both kills
    // A single fire action ⇒ exactly one Spent Check, one handover.
    expect(res.events.filter((e) => e.type === 'spent')).toHaveLength(1);
    expect(res.state.currentSide).toBe('B');
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
