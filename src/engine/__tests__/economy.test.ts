/**
 * v3 action-economy fixtures (rulebook §2.4–§2.8, §3.3–§3.4). These reproduce
 * the worked red-box examples in rules/02 and rules/03. The Spent Die face is
 * RNG-driven (covered exhaustively in spent.test.ts), so these assert the
 * deterministic parts: the Action Cost the Spent Check is taken against (read
 * from the logged event), Stress application/clearing, the 0AP no-check rule,
 * and that a Spent Unit may act only by buying down to 0AP with CAPs.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

/** The cost a Spent Check was taken against, parsed from the 'spent' event. */
function spentCost(events: { type: string; text: string }[]): number | null {
  const e = events.find((x) => x.type === 'spent');
  if (!e) return null;
  const m = /vs cost (\d+)/.exec(e.text);
  return m ? Number(m[1]) : null;
}

describe('Spent Check cost (§2.5)', () => {
  it('a 1AP move with no modifiers is checked against cost 1 (rules/02 Move A)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle'); // move 1, faces East
    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(spentCost(res.events)).toBe(1);
  });

  it('a 4AP attack with no modifiers is checked against cost 4 (rules/02 Attack B)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate()); // apToFire 4
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle');
    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(spentCost(res.events)).toBe(4);
  });
});

describe('Stress (§2.6 / §2.7)', () => {
  it('adds exactly +1AP when a Stressed unit acts (not cumulative)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const u = addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle'); // move 1
    u.stressed = true; // already holds its side's marker (acted last Turn)

    // 1AP move + 1AP Stress → Spent Check against cost 2 (Stress is a boolean,
    // so it can never stack beyond +1).
    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(spentCost(res.events)).toBe(2);
  });

  it('an unstressed unit pays no Stress penalty (baseline cost)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(spentCost(res.events)).toBe(1);
  });

  it('moves the marker to a different unit that acts (no penalty for the new one)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    for (let q = 0; q <= 3; q++) {
      addHex(s, q, 0);
      addHex(s, q, 1);
    }
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'A2', 'A', 0, 1, 0, 'rifle');

    let st = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' }).state;
    expect(st.units['A1']!.stressed).toBe(true);
    st = reduce(st, { type: 'PASS' }).state; // B passes
    // A2 (fresh, never acted) moves: no Stress penalty → cost 1; marker moves to A2.
    const res = reduce(st, { type: 'MOVE', unitId: 'A2', toHexId: '1,1' });
    expect(spentCost(res.events)).toBe(1);
    expect(res.state.units['A1']!.stressed).toBe(false);
    expect(res.state.units['A2']!.stressed).toBe(true);
  });

  it('Passing clears only the passing side’s Stress marker (§2.7)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    for (let q = 0; q <= 2; q++) {
      addHex(s, q, 0);
      addHex(s, q, 2);
    }
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'B1', 'B', 0, 2, 0, 'rifle');

    let st = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' }).state; // A1 stressed
    st = reduce(st, { type: 'MOVE', unitId: 'B1', toHexId: '1,2' }).state; // B1 stressed
    expect(st.units['A1']!.stressed).toBe(true);
    expect(st.units['B1']!.stressed).toBe(true);
    // A passes: clears A's marker, leaves B's.
    st = reduce(st, { type: 'PASS' }).state;
    expect(st.units['A1']!.stressed).toBe(false);
    expect(st.units['B1']!.stressed).toBe(true);
  });
});

describe('CAPs and 0AP (§3.3 / §3.4)', () => {
  it('reducing the cost to 0AP makes no Spent Check and keeps the unit Fresh', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    const capBefore = s.players.A.capCurrent; // 5

    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0', capCostReduce: 1 });
    expect(spentCost(res.events)).toBeNull(); // no Spent Check
    expect(res.events.some((e) => e.type === 'spent' && /no Spent Check/.test(e.text))).toBe(true);
    expect(res.state.units['A1']!.status).toBe('fresh');
    expect(res.state.players.A.capCurrent).toBe(capBefore - 1); // 1 CAP spent for the 1AP move
  });

  it('a Spent unit needs an EXPLICIT CAP spend to reach 0AP — no silent reduction (§3.4)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const u = addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    u.status = 'spent';

    // A 1AP move needs 1 CAP to reach 0AP — legalActions offers it (capCurrent 5 ≥ 1).
    expect(legalActionsForUnit(s, 'A1').some((a) => a.type === 'MOVE')).toBe(true);

    // Without an explicit capCostReduce the engine does NOT auto-spend CAP: denied.
    const denied = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(denied.events[0]?.type).toBe('illegal');
    expect(denied.state).toBe(s); // untouched — no CAP lost

    // With an explicit capCostReduce that reaches 0AP, it acts and stays Spent.
    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0', capCostReduce: 1 });
    expect(res.state.units['A1']!.hexId).toBe('1,0');
    expect(res.state.units['A1']!.status).toBe('spent'); // remains Spent after a 0AP action
    expect(res.events.some((e) => e.type === 'spent' && /no Spent Check/.test(e.text))).toBe(true);
    expect(res.state.players.A.capCurrent).toBe(s.players.A.capCurrent - 1);
  });

  it('an explicit capCostReduce too small to reach 0AP is rejected for a Spent unit', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const u = addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    u.status = 'spent';
    u.stressed = true; // move cost 1 + Stress 1 = 2; reducing by 1 leaves 1AP > 0

    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0', capCostReduce: 1 });
    expect(res.events[0]?.type).toBe('illegal');
    expect(res.state).toBe(s);
  });

  it('a Spent unit with no CAPs cannot act', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const u = addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    u.status = 'spent';
    s.players.A.capCurrent = 0;

    expect(legalActionsForUnit(s, 'A1')).toHaveLength(0);
    const res = reduce(s, { type: 'MOVE', unitId: 'A1', toHexId: '1,0' });
    expect(res.events[0]?.type).toBe('illegal');
  });
});
