import { describe, expect, it } from 'vitest';
import { planVehicleMove } from '../movement';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

/** §16.4 Mobile Vehicle: Wheeled base with both Wheel and Track Bonus Move symbols. */
function mobile(wheelBonus: number, trackBonus: number) {
  return rifleTemplate({
    id: 'halftrack',
    name: 'Halftrack',
    kind: 'vehicle',
    move: 1,
    dr: { front: 12, flank: 10, color: 'blue' },
    propulsion: 'wheeled',
    bonusMoves: wheelBonus,
    mobileTrackBonusMoves: trackBonus,
  });
}

function plainWheeled(bonus: number) {
  return rifleTemplate({
    id: 'truck',
    name: 'Truck',
    kind: 'vehicle',
    move: 1,
    dr: { front: 11, flank: 11, color: 'blue' },
    propulsion: 'wheeled',
    bonusMoves: bonus,
  });
}

describe('Mobile Vehicles (§16.4)', () => {
  it('may use its Track Bonus Move to enter Open Terrain off-road (unlike a plain Wheeled vehicle)', () => {
    const s = baseState();
    addTemplate(s, mobile(1, 1));
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true }); // regular move, road→road
    addHex(s, 2, 0, 'open'); // bonus move off-road into Open Terrain — needs Track budget
    addUnit(s, 'V', 'A', 0, 0, 0, 'halftrack');
    const plan = planVehicleMove(s, s.units['V']!, ['1,0', '2,0']);
    expect(plan.ap).toBe(1);
    expect(plan.finalHexId).toBe('2,0');
  });

  it('a plain Wheeled vehicle (no Track symbols) cannot make that same off-road bonus move', () => {
    const s = baseState();
    addTemplate(s, plainWheeled(1));
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true });
    addHex(s, 2, 0, 'open');
    addUnit(s, 'V', 'A', 0, 0, 0, 'truck');
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0']).ap).toBeNull();
  });

  it('its Track Bonus Move bypasses Road Congestion that would block a Wheel Bonus Move', () => {
    const s = baseState();
    addTemplate(s, mobile(1, 1));
    addTemplate(s, plainWheeled(1));
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true });
    addHex(s, 2, 0, 'open', { road: true }); // congested by a parked vehicle
    addUnit(s, 'V', 'A', 0, 0, 0, 'halftrack');
    addUnit(s, 'Parked', 'A', 2, 0, 0, 'truck');
    const plan = planVehicleMove(s, s.units['V']!, ['1,0', '2,0']);
    expect(plan.ap).toBe(1);
    expect(plan.finalHexId).toBe('2,0');
  });

  it('rejects using the same Track budget twice when both bonus hexes require it', () => {
    const s = baseState();
    addTemplate(s, mobile(1, 1)); // only 1 Track bonus available
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true });
    addHex(s, 2, 0, 'open'); // needs Track (off-road)
    addHex(s, 3, 0, 'open'); // needs Track (off-road) too — but only 1 Track budget
    addUnit(s, 'V', 'A', 0, 0, 0, 'halftrack');
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0', '3,0']).ap).toBeNull();
  });

  it('can spend its Wheel and Track bonuses in the same multi-hex move (one of each)', () => {
    const s = baseState();
    addTemplate(s, mobile(1, 1));
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true }); // regular move
    addHex(s, 2, 0, 'open', { road: true }); // bonus 1: road→road (either budget)
    addHex(s, 3, 0, 'open'); // bonus 2: off-road (Track only)
    addUnit(s, 'V', 'A', 0, 0, 0, 'halftrack');
    const plan = planVehicleMove(s, s.units['V']!, ['1,0', '2,0', '3,0']);
    expect(plan.ap).toBe(1);
    expect(plan.finalHexId).toBe('3,0');
  });

  it('without any mobileTrackBonusMoves, behaves exactly like a plain Wheeled vehicle', () => {
    const s: GameState = baseState();
    addTemplate(s, mobile(1, 0));
    addHex(s, 0, 0, 'open', { road: true });
    addHex(s, 1, 0, 'open', { road: true });
    addHex(s, 2, 0, 'open'); // off-road bonus — should fail with 0 Track budget
    addUnit(s, 'V', 'A', 0, 0, 0, 'halftrack');
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0']).ap).toBeNull();
  });
});
