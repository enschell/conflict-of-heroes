import { describe, expect, it } from 'vitest';
import { legalActionsForUnit } from '../actions';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

/** A Spent, Stressed, Hit (Pinned, rally 7) unit with `cap` CAPs available. */
function scene(cap: number): GameState {
  const s = baseState(3);
  addTemplate(s, rifleTemplate());
  addHex(s, 0, 0);
  const u = addUnit(s, 'R', 'A', 0, 0, 0, 'rifle', ['pinned']);
  u.status = 'spent';
  u.stressed = true; // rally cost = 5AP + 1 Stress = 6
  s.players.A.capCurrent = cap;
  return s;
}

describe('a Spent Hit Unit may Rally by spending CAPs to 0AP (§7.10 / §3.4)', () => {
  it('is offered a Rally that buys the 6AP cost down to 0 when CAPs allow', () => {
    const s = scene(6);
    const rally = legalActionsForUnit(s, 'R').find((a) => a.type === 'RALLY');
    expect(rally).toBeDefined();
    expect(rally && 'capCostReduce' in rally ? rally.capCostReduce : undefined).toBe(6);
  });

  it('resolves the Rally, stays Spent, spends the CAPs, and makes no Spent Check', () => {
    const s = scene(6);
    const res = reduce(s, { type: 'RALLY', unitId: 'R', capCostReduce: 6 });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.players.A.capCurrent).toBe(0); // 6 CAP spent to reach 0AP
    expect(res.state.units['R']!.status).toBe('spent'); // a 0AP Action leaves it Spent (§3.4)
    expect(res.events.some((e) => e.type === 'rally')).toBe(true);
    expect(res.events.some((e) => e.type === 'spent' && /0AP/.test(e.text))).toBe(true);
  });

  it('is NOT offered (and is denied) when the side cannot afford 0AP', () => {
    const s = scene(3); // fewer than 6 CAP
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'RALLY')).toBe(false);
    const res = reduce(s, { type: 'RALLY', unitId: 'R' });
    expect(res.events[0]?.type).toBe('illegal');
  });
});
