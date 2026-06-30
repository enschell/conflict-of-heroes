import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { groupConnected } from '../groups';
import type { Action, GameState } from '../types';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

/** Four side-A rifles in a row (0,0)…(3,0), all facing east, plus a heavy-woods
 *  hex at (4,0) so one member's move costs 2AP. */
function fourRifles(seed = 1): GameState {
  const s = baseState(seed);
  addTemplate(s, rifleTemplate());
  for (let q = 0; q <= 4; q++) addHex(s, q, 0, q === 4 ? 'woodsHeavy' : 'open');
  addUnit(s, 'R1', 'A', 0, 0, 0);
  addUnit(s, 'R2', 'A', 1, 0, 0);
  addUnit(s, 'R3', 'A', 2, 0, 0);
  addUnit(s, 'R4', 'A', 3, 0, 0);
  return s;
}

const groupMoveEast: Action = {
  type: 'GROUP_MOVE',
  moves: [
    { unitId: 'R1', toHexId: '1,0' },
    { unitId: 'R2', toHexId: '2,0' },
    { unitId: 'R3', toHexId: '3,0' },
    { unitId: 'R4', toHexId: '4,0' }, // into heavy woods → 2AP
  ],
};

describe('groupConnected (§10.2)', () => {
  it('accepts a continuously-adjacent cluster and rejects a gap', () => {
    const s = fourRifles();
    expect(groupConnected(s, ['R1', 'R2', 'R3', 'R4'])).toBe(true);
    // Move R4 far away → no longer continuous.
    s.units['R4']!.hexId = '9,0';
    addHex(s, 9, 0);
    expect(groupConnected(s, ['R1', 'R2', 'R3', 'R4'])).toBe(false);
  });
});

describe('Group Move (§10.4 red box)', () => {
  it('costs the highest member move (2AP via heavy woods) with ONE Spent Check', () => {
    const s = fourRifles(1);
    const res = reduce(s, groupMoveEast);

    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    // Group cost = max(1,1,1,2) = 2AP, logged once.
    expect(res.events.some((e) => e.type === 'groupMove' && /cost 2\)/.test(e.text))).toBe(true);
    // Exactly one Spent Check for the whole Group.
    const checks = res.events.filter((e) => e.type === 'spent');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.text).toMatch(/Group Spent Check/);

    // All four moved and are Stressed; their Fresh/Spent status is uniform (§10.10).
    const us = ['R1', 'R2', 'R3', 'R4'].map((id) => res.state.units[id]!);
    expect(us.map((u) => u.hexId)).toEqual(['1,0', '2,0', '3,0', '4,0']);
    expect(us.every((u) => u.stressed)).toBe(true);
    const statuses = new Set(us.map((u) => u.status));
    expect(statuses.size).toBe(1); // all Fresh or all Spent together
    // Turn handed to the opponent.
    expect(res.state.currentSide).toBe('B');
  });

  it('on a failed Spent Check every member becomes Spent together', () => {
    // Find a seed whose 2AP group check fails (roll ≤ 2) and confirm all Spent.
    let sawFail = false;
    for (let seed = 1; seed <= 40 && !sawFail; seed++) {
      const res = reduce(fourRifles(seed), groupMoveEast);
      const us = ['R1', 'R2', 'R3', 'R4'].map((id) => res.state.units[id]!);
      if (us[0]!.status === 'spent') {
        sawFail = true;
        expect(us.every((u) => u.status === 'spent')).toBe(true);
      }
    }
    expect(sawFail).toBe(true);
  });

  it('rejects a Group that does not begin continuously adjacent', () => {
    const s = fourRifles();
    s.units['R4']!.hexId = '9,0';
    addHex(s, 9, 0);
    const res = reduce(s, { ...groupMoveEast, moves: groupMoveEast.type === 'GROUP_MOVE' ? [
      { unitId: 'R1', toHexId: '1,0' },
      { unitId: 'R4' },
    ] : [] });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s); // untouched
  });

  it("rejects another side's unit in the Group", () => {
    const s = fourRifles();
    addHex(s, 0, 1);
    addUnit(s, 'E1', 'B', 0, 1, 0);
    const res = reduce(s, { type: 'GROUP_MOVE', moves: [{ unitId: 'R1' }, { unitId: 'E1' }] });
    expect(res.events[0]?.type).toBe('illegal');
  });
});
