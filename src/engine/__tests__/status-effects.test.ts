/**
 * End-to-end (through the reducer) checks that suppressed/pinned actually bite,
 * not just that effectiveStats computes the right numbers.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

describe('pinned', () => {
  it('cannot move (no MOVE in legal actions, and a MOVE is denied)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'p', 'A', 0, 0, 0, 'rifle', ['pinned']);

    const acts = legalActionsForUnit(s, 'p');
    expect(acts.some((a) => a.type === 'MOVE')).toBe(false);
    expect(acts.some((a) => a.type === 'PIVOT')).toBe(false);

    const res = reduce(s, { type: 'MOVE', unitId: 'p', toHexId: '1,0' });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state.units['p']?.hexId).toBe('0,0');
  });
});

describe('suppressed', () => {
  it('pays +1 AP to fire (4 → 5) and keeps firing legal', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate()); // apToFire 4
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'atk', 'A', 0, 0, 0, 'rifle', ['suppressed']);
    addUnit(s, 'tgt', 'B', 1, 0, 3, 'rifle');

    const activated = reduce(s, { type: 'ACTIVATE_UNIT', unitId: 'atk' }).state;
    expect(activated.players.A.ap).toBe(7);

    const fired = reduce(activated, { type: 'FIRE', attackerId: 'atk', targetId: 'tgt' });
    // 7 AP − (4 base + 1 suppressed) = 2 remaining
    expect(fired.state.players.A.ap).toBe(2);
    expect(fired.events.some((e) => e.type === 'fire')).toBe(true);
  });
});
