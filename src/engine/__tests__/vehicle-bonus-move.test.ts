import { describe, expect, it } from 'vitest';
import { planVehicleMove } from '../movement';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { Action, GameState } from '../types';

/** Tracked vehicle (move 1) with `bonus` Track bonus moves, facing E. */
function tracked(bonus: number) {
  return rifleTemplate({ id: 'tank', name: 'Tank', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked', bonusMoves: bonus });
}
function wheeled(bonus: number) {
  return rifleTemplate({ id: 'truck', name: 'Truck', kind: 'vehicle', move: 1, dr: { front: 11, flank: 11, color: 'blue' }, propulsion: 'wheeled', bonusMoves: bonus });
}

/** A straight east-running strip of open hexes (0,0)..(n,0), optionally roads. */
function strip(n: number, opts: { road?: boolean; templateMaker?: () => ReturnType<typeof tracked> } = {}): GameState {
  const s = baseState();
  addTemplate(s, (opts.templateMaker ?? (() => tracked(2)))());
  for (let q = 0; q <= n; q++) addHex(s, q, 0, 'open', { road: opts.road });
  addUnit(s, 'V', 'A', 0, 0, 0, (opts.templateMaker ? opts.templateMaker() : tracked(2)).id); // faces E
  return s;
}

describe('vehicle Bonus Moves (§15.2)', () => {
  it('a tracked tank moves 1 regular + 2 bonus through open for the base cost', () => {
    const s = strip(3); // tank with 2 track bonuses
    const plan = planVehicleMove(s, s.units['V']!, ['1,0', '2,0', '3,0']);
    expect(plan.ap).toBe(1); // just the regular move cost — bonus moves are free
    expect(plan.finalHexId).toBe('3,0');
  });

  it('rejects more bonus hexes than the vehicle has symbols', () => {
    const s = strip(3, { templateMaker: () => tracked(1) }); // only 1 bonus
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0', '3,0']).ap).toBeNull();
  });

  it('forfeits bonus moves when the first move is into Difficult Terrain', () => {
    const s = baseState();
    addTemplate(s, tracked(2));
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsLight'); // difficult for the first (regular) move
    addHex(s, 2, 0);
    addUnit(s, 'V', 'A', 0, 0, 0, 'tank');
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0']).reason).toMatch(/forfeit/);
  });

  it('a tracked bonus move may not enter difficult terrain mid-path', () => {
    const s = baseState();
    addTemplate(s, tracked(2));
    addHex(s, 0, 0);
    addHex(s, 1, 0); // open regular move
    addHex(s, 2, 0, 'woodsLight'); // bonus into woods — illegal (not open / not road→road)
    addUnit(s, 'V', 'A', 0, 0, 0, 'tank');
    expect(planVehicleMove(s, s.units['V']!, ['1,0', '2,0']).ap).toBeNull();
  });

  it('a wheeled vehicle may bonus-move only road→road', () => {
    const open = strip(2, { templateMaker: () => wheeled(1) });
    expect(planVehicleMove(open, open.units['V']!, ['1,0', '2,0']).ap).toBeNull(); // open, not road
    const road = strip(2, { road: true, templateMaker: () => wheeled(1) });
    expect(planVehicleMove(road, road.units['V']!, ['1,0', '2,0']).ap).toBe(1); // road→road ok
  });

  it('the reducer applies the whole path and ends on the final hex', () => {
    const s = strip(3);
    const move: Action = { type: 'MOVE', unitId: 'V', toHexId: '3,0', path: ['1,0', '2,0', '3,0'] };
    const res = reduce(s, move);
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['V']!.hexId).toBe('3,0');
    expect(res.events.some((e) => e.type === 'move' && /\+2 bonus/.test(e.text))).toBe(true);
  });
});
