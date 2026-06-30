import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

const tank = (over = {}) =>
  rifleTemplate({ id: 'tank', name: 'Tank', kind: 'vehicle', dr: { front: 14, flank: 12, color: 'blue' }, fp: { red: 4, blue: 8 }, ...over });

/** Attacker A1 in close combat (same hex) with target T1 of the given terrain. */
function ccScene(targetIsVehicle: boolean, terrain: 'open' | 'woodsHeavy'): GameState {
  const s = baseState();
  addTemplate(s, rifleTemplate({ fp: { red: 3, blue: 6 } }));
  if (targetIsVehicle) addTemplate(s, tank());
  addHex(s, 0, 0, terrain);
  addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
  addUnit(s, 'T1', 'B', 0, 0, 0, targetIsVehicle ? 'tank' : 'rifle');
  return s;
}
const ccDr = (s: GameState) => closeCombatContext(s, s.units['A1']!, s.units['T1']!).dr;

describe('vehicle close combat (§15.14)', () => {
  it('a Vehicle gets no terrain DR in close combat', () => {
    expect(ccDr(ccScene(true, 'woodsHeavy'))).toBe(ccDr(ccScene(true, 'open')));
  });

  it('a foot Unit still gets terrain DR in close combat', () => {
    expect(ccDr(ccScene(false, 'woodsHeavy'))).toBe(ccDr(ccScene(false, 'open')) + 2);
  });
});

describe('vehicles as cover (§15.15)', () => {
  function fireScene(withFriendlyVehicle: boolean): GameState {
    const s = baseState();
    addTemplate(s, rifleTemplate({ fp: { red: 5, blue: 0 }, range: 6 }));
    addTemplate(s, tank());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addHex(s, 2, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle'); // attacker faces E
    addUnit(s, 'F1', 'B', 2, 0, 3, 'rifle'); // foot target, faces W (toward attacker)
    if (withFriendlyVehicle) addUnit(s, 'V1', 'B', 2, 0, 3, 'tank'); // friendly vehicle shares the hex
    return s;
  }

  it('a foot target stacked with a friendly vehicle gets +1 DR', () => {
    const bare = fireScene(false);
    const covered = fireScene(true);
    const drBare = attackContext(bare, bare.units['A1']!, bare.units['F1']!).dr;
    const drCovered = attackContext(covered, covered.units['A1']!, covered.units['F1']!).dr;
    expect(drCovered).toBe(drBare + 1);
  });

  it('the vehicle itself does not get cover from itself', () => {
    const s = fireScene(true);
    const ctxV = attackContext(s, s.units['A1']!, s.units['V1']!);
    // DR of the tank = its own defense + terrain only (no +1 cover).
    expect(ctxV.dr).toBe(s.templates['tank']!.dr.front); // front (attacker in front), open terrain, no cover
  });
});
