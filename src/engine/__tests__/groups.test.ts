import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { groupConnected, isValidSupporter } from '../groups';
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

/** §10.7 red box: HMG34 leader (red 5 FP) + 2 supporting Rifles → 7AR vs 12DR. */
function groupAttackScene(seed = 1): GameState {
  const s = baseState(seed);
  addTemplate(s, rifleTemplate({ id: 'hmg', fp: { red: 5, blue: 0 }, range: 9, apToFire: 2 }));
  addTemplate(s, rifleTemplate({ id: 'rifle', fp: { red: 3, blue: 0 }, range: 5 }));
  for (let q = -1; q <= 4; q++) for (let r = -1; r <= 1; r++) addHex(s, q, r);
  addUnit(s, 'HMG', 'A', 0, 0, 0, 'hmg'); // leader, faces east
  addUnit(s, 'S1', 'A', 1, 0, 0, 'rifle'); // supporter, adjacent to leader
  addUnit(s, 'S2', 'A', 0, 1, 0, 'rifle'); // supporter, adjacent to leader
  addUnit(s, 'T', 'B', 3, 0, 3, 'rifle'); // target faces west → front DR 12
  return s;
}

const groupAttack: Action = {
  type: 'GROUP_ATTACK',
  leaderId: 'HMG',
  supporterIds: ['S1', 'S2'],
  targetId: 'T',
};

describe('Group Attack (§10.5–§10.8 red box)', () => {
  it('adds +1AR per qualifying supporter: 5AR + 2 → 7AR vs 12DR, Hit# 5', () => {
    const res = reduce(groupAttackScene(1), groupAttack);
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    const fire = res.events.find((e) => e.type === 'groupFire');
    expect(fire?.text).toMatch(/AR 7 /);
    expect(fire?.text).toMatch(/Hit# 5 /);
    // One Group Spent Check at the leader's 2AP cost; all members Stressed.
    const checks = res.events.filter((e) => e.type === 'spent');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.text).toMatch(/cost 2/);
    for (const id of ['HMG', 'S1', 'S2']) expect(res.state.units[id]?.stressed).toBe(true);
  });

  it('rejects a supporter that is not adjacent to the leader', () => {
    const s = groupAttackScene();
    addHex(s, 6, 0);
    addUnit(s, 'FAR', 'A', 6, 0, 0, 'rifle'); // not within 1 hex of the leader
    const res = reduce(s, { ...groupAttack, supporterIds: ['S1', 'FAR'] });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s);
  });

  it('rejects a supporter whose hit marker affects its Firepower (§10.6)', () => {
    const s = groupAttackScene();
    s.units['S1']!.hitMarkers = ['suppressed']; // Suppressed = −2 FP
    expect(isValidSupporter(s, s.units['HMG']!, s.units['S1']!, s.units['T']!)).toBe(false);
    const res = reduce(s, groupAttack);
    expect(res.events[0]?.type).toBe('illegal');
  });
});

describe('Group Rally (§10.9)', () => {
  /** Two adjacent hit rifles rallying together. */
  function rallyScene(seed = 1): GameState {
    const s = baseState(seed);
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'R1', 'A', 0, 0, 0).hitMarkers = ['pinned']; // rally 7
    addUnit(s, 'R2', 'A', 1, 0, 0).hitMarkers = ['pinned'];
    return s;
  }
  const groupRally: Action = { type: 'GROUP_RALLY', unitIds: ['R1', 'R2'] };

  it('rolls an individual Rally Check per member but one Group Spent Check', () => {
    const res = reduce(rallyScene(2), groupRally);
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    // Two rally events (one per member), exactly one Group Spent Check.
    expect(res.events.filter((e) => e.type === 'rally')).toHaveLength(2);
    const checks = res.events.filter((e) => e.type === 'spent');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.text).toMatch(/Group Spent Check/);
    // Both members are Stressed regardless of rally outcome (§10.10).
    expect(res.state.units['R1']?.stressed).toBe(true);
    expect(res.state.units['R2']?.stressed).toBe(true);
  });

  it('removes a marker only from members that pass their own Rally Check', () => {
    // Members succeed/fail independently, so across seeds both outcomes appear.
    let sawKept = false;
    let sawRemoved = false;
    for (let seed = 1; seed <= 30 && !(sawKept && sawRemoved); seed++) {
      const st = reduce(rallyScene(seed), groupRally).state;
      for (const id of ['R1', 'R2']) {
        if (st.units[id]!.hitMarkers.length === 0) sawRemoved = true;
        else sawKept = true;
      }
    }
    expect(sawRemoved).toBe(true);
    expect(sawKept).toBe(true);
  });

  it('rejects a member with no hit marker', () => {
    const s = rallyScene();
    s.units['R2']!.hitMarkers = [];
    const res = reduce(s, groupRally);
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s);
  });
});
