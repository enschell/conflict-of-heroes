import { describe, expect, it } from 'vitest';
import { CAP_FLOOR, applyUnitLoss, capCeiling, clampCapMod, reduceActionCost } from '../cap';
import { startRound } from '../turn';
import type { PlayerState } from '../types';
import { baseState } from './helpers';

function player(capStart: number, capCurrent = capStart, unitLosses = 0): PlayerState {
  return { side: 'A', nations: ['germans'], capStart, capCurrent, unitLosses, vp: 0, hand: [], passed: false };
}

describe('reduceActionCost (§3.3)', () => {
  it('spends 1 CAP per AP, flooring the cost at 0', () => {
    expect(reduceActionCost(4, 0)).toEqual({ cost: 4, capsSpent: 0 });
    expect(reduceActionCost(4, 1)).toEqual({ cost: 3, capsSpent: 1 });
    expect(reduceActionCost(4, 4)).toEqual({ cost: 0, capsSpent: 4 });
  });

  it('never spends more CAPs than needed to reach 0AP', () => {
    expect(reduceActionCost(2, 9)).toEqual({ cost: 0, capsSpent: 2 });
    expect(reduceActionCost(0, 5)).toEqual({ cost: 0, capsSpent: 0 });
  });
});

describe('clampCapMod (§3.2)', () => {
  it('limits dice modifiers to ±2', () => {
    expect(clampCapMod(5)).toBe(2);
    expect(clampCapMod(-5)).toBe(-2);
    expect(clampCapMod(1)).toBe(1);
  });
});

describe('CAP floor of 3 (§7.12–§7.13)', () => {
  it('capCeiling drops by 1 per loss but never below 3', () => {
    const p = player(6);
    expect(capCeiling(p)).toBe(6);
    p.unitLosses = 1;
    expect(capCeiling(p)).toBe(5);
    p.unitLosses = 3;
    expect(capCeiling(p)).toBe(CAP_FLOOR); // 3
    p.unitLosses = 7; // more losses don't push below the floor
    expect(capCeiling(p)).toBe(CAP_FLOOR);
  });

  it('applyUnitLoss lowers the ceiling and clamps current CAP down to it (§7.12)', () => {
    const p = player(6); // capCurrent 6
    applyUnitLoss(p);
    expect(p.unitLosses).toBe(1);
    expect(p.capCurrent).toBe(5); // pushed down with the ceiling
    applyUnitLoss(p);
    applyUnitLoss(p);
    expect(p.capCurrent).toBe(3); // ceiling now at the floor
    applyUnitLoss(p); // 4th loss: ceiling stays 3, current already 3
    expect(p.capCurrent).toBe(3);
  });

  it('a loss does NOT raise CAP already spent below the new ceiling', () => {
    const p = player(6, 1); // spent down to 1 this Round
    applyUnitLoss(p); // ceiling 5, but current 1 is below it
    expect(p.capCurrent).toBe(1); // unchanged
  });

  it('round reset restores CAP to the ceiling, floored at 3', () => {
    const s = baseState();
    s.players.A.capStart = 6;
    s.players.A.unitLosses = 5; // ceiling would be max(3, 1) = 3
    s.players.A.capCurrent = 0; // fully spent
    startRound(s);
    expect(s.players.A.capCurrent).toBe(3);
  });
});
