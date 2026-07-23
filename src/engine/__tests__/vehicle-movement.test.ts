import { describe, expect, it } from 'vitest';
import { moveCost } from '../movement';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState, TerrainId } from '../types';

/** Vehicle template with a given propulsion (move cost 1 for easy arithmetic). */
const vehicle = (propulsion: 'wheeled' | 'tracked') =>
  rifleTemplate({
    id: 'veh',
    name: 'Veh',
    kind: 'vehicle',
    move: 1,
    dr: { front: 14, flank: 12, color: 'blue' },
    propulsion,
  });

/** Place a vehicle at (0,0) facing E and a destination hex at (1,0). */
function scene(propulsion: 'wheeled' | 'tracked', toTerrain: TerrainId, opts: { road?: boolean; fromRoad?: boolean } = {}): GameState {
  const s = baseState();
  addTemplate(s, vehicle(propulsion));
  addHex(s, 0, 0, 'open', { road: opts.fromRoad });
  addHex(s, 1, 0, toTerrain, { road: opts.road });
  addUnit(s, 'V', 'A', 0, 0, 0, 'veh'); // faces E toward (1,0)
  return s;
}
const ap = (s: GameState) => moveCost(s, s.units['V']!, '1,0').ap;

describe('vehicle movement (§15.1–§15.4)', () => {
  it('Light Woods costs the tracked/wheeled penalty', () => {
    expect(ap(scene('tracked', 'woodsLight'))).toBe(1 + 1); // base 1 + tracked 1
    expect(ap(scene('wheeled', 'woodsLight'))).toBe(1 + 2); // base 1 + wheeled 2
  });

  it('Heavy Woods is +2 for tracked but Impassable to wheeled', () => {
    expect(ap(scene('tracked', 'woodsHeavy'))).toBe(1 + 2);
    expect(ap(scene('wheeled', 'woodsHeavy'))).toBeNull();
  });

  it('Stone Buildings cost +2 tracked / +3 wheeled', () => {
    expect(ap(scene('tracked', 'buildingStone'))).toBe(1 + 2);
    expect(ap(scene('wheeled', 'buildingStone'))).toBe(1 + 3);
  });

  it('Plowed Fields are +0 for tracked but Impassable to wheeled', () => {
    expect(ap(scene('tracked', 'plowed'))).toBe(1);
    expect(ap(scene('wheeled', 'plowed'))).toBeNull();
  });

  it('Water is Impassable to all vehicles', () => {
    expect(ap(scene('tracked', 'water'))).toBeNull();
    expect(ap(scene('wheeled', 'water'))).toBeNull();
  });

  it('road→road ignores Difficult and Impassable terrain (§15.4)', () => {
    // Heavy Woods on a road, entered from a road hex: just the base move cost.
    expect(ap(scene('wheeled', 'woodsHeavy', { road: true, fromRoad: true }))).toBe(1);
    expect(ap(scene('tracked', 'water', { road: true, fromRoad: true }))).toBe(1);
  });

  it('Open terrain is just the base move cost', () => {
    expect(ap(scene('tracked', 'open'))).toBe(1);
  });
});
