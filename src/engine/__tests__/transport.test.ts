/** Vehicle Transport: Loading, Transporting, Unloading (§15.6–15.11). */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

const tankTemplate = (over: Partial<Parameters<typeof rifleTemplate>[0]> = {}) =>
  rifleTemplate({
    id: 'apc',
    name: 'APC',
    kind: 'vehicle',
    dr: { front: 12, flank: 10, color: 'blue' },
    propulsion: 'tracked',
    bonusMoves: 2,
    ...over,
  });

function scene(): GameState {
  const s = baseState(1);
  addTemplate(s, rifleTemplate());
  addTemplate(s, tankTemplate());
  addHex(s, 0, 0);
  addHex(s, 1, 0);
  addHex(s, 2, 0);
  addHex(s, 1, -1);
  return s;
}

describe('Loading (§15.7)', () => {
  it('same-hex load ignores terrain/hit-marker deltas but pays the raw Move Cost', () => {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'LOAD', unitId: 'R', vehicleId: 'V' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R']!.carriedBy).toBe('V');
    expect(res.state.units['R']!.hexId).toBe(res.state.units['V']!.hexId);
    expect(res.state.units['R']!.facing).toBe(res.state.units['V']!.facing);
    expect(res.events.some((e) => /cost 1/.test(e.text))).toBe(true); // rifle move cost 1
  });

  it('adjacent-hex load pays the Move Cost into the Vehicle hex, then loads free', () => {
    const s = scene();
    addUnit(s, 'V', 'A', 1, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'LOAD', unitId: 'R', vehicleId: 'V' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R']!.carriedBy).toBe('V');
    expect(res.state.units['R']!.hexId).toBe('1,0');
  });

  it('one Group Spent Check covers both the loading Unit and the Vehicle', () => {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'LOAD', unitId: 'R', vehicleId: 'V' });
    const checks = res.events.filter((e) => e.type === 'spent');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.text).toMatch(/Group Spent Check/);
  });

  it('rejects loading onto a Vehicle that already has a passenger (§15.6)', () => {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R1', 'A', 0, 0, 0, 'rifle').carriedBy = 'V';
    addUnit(s, 'R2', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'LOAD', unitId: 'R2', vehicleId: 'V' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('rejects a Vehicle trying to load onto a Vehicle', () => {
    const s = scene();
    addUnit(s, 'V1', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'V2', 'A', 0, 0, 0, 'apc');
    const res = reduce(s, { type: 'LOAD', unitId: 'V2', vehicleId: 'V1' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('a Spent Unit/Vehicle pair may load only by spending CAPs to 0AP (§3.4)', () => {
    const s = scene();
    const v = addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    v.status = 'spent';
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const denied = reduce(s, { type: 'LOAD', unitId: 'R', vehicleId: 'V' });
    expect(denied.events[0]?.type).toBe('illegal');
    const ok = reduce(s, { type: 'LOAD', unitId: 'R', vehicleId: 'V', capCostReduce: 1 });
    expect(ok.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(ok.state.units['R']!.carriedBy).toBe('V');
    expect(ok.state.units['V']!.status).toBe('spent');
  });

  it('offers LOAD via legalActionsForUnit for an eligible foot unit', () => {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const acts = legalActionsForUnit(s, 'R');
    expect(acts.some((a) => a.type === 'LOAD' && a.vehicleId === 'V')).toBe(true);
  });
});

describe('Transporting (§15.8)', () => {
  function loadedScene(): GameState {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle').carriedBy = 'V';
    return s;
  }

  it('the Vehicle carries its passenger along when it Moves', () => {
    const s = loadedScene();
    const res = reduce(s, { type: 'MOVE', unitId: 'V', toHexId: '1,0' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['V']!.hexId).toBe('1,0');
    expect(res.state.units['R']!.hexId).toBe('1,0');
    expect(res.state.units['R']!.carriedBy).toBe('V');
  });

  it('a Transported Unit may not Move, Pivot, or Attack on its own (§15.8)', () => {
    const s = loadedScene();
    addUnit(s, 'E', 'B', 2, 0, 3, 'rifle');
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'MOVE')).toBe(false);
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'PIVOT')).toBe(false);
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'FIRE')).toBe(false);
    expect(reduce(s, { type: 'MOVE', unitId: 'R', toHexId: '1,0' }).events[0]?.type).toBe('illegal');
    expect(reduce(s, { type: 'PIVOT', unitId: 'R', facing: 1 }).events[0]?.type).toBe('illegal');
  });

  it('a Transported Unit MAY Rally and Stall (§15.8)', () => {
    const s = loadedScene();
    s.units['R']!.hitMarkers = ['pinned'];
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'RALLY')).toBe(true);
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'STALL')).toBe(true);
  });
});

describe('Unloading (§15.9)', () => {
  function loadedScene(): GameState {
    const s = scene();
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc');
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle').carriedBy = 'V';
    return s;
  }

  it('unloads under the Vehicle at no terrain cost', () => {
    const s = loadedScene();
    const res = reduce(s, { type: 'UNLOAD', unitId: 'R', toHexId: '0,0' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R']!.carriedBy).toBeUndefined();
    expect(res.state.units['R']!.hexId).toBe('0,0');
  });

  it('unloads into an adjacent hex, any facing', () => {
    const s = loadedScene();
    const res = reduce(s, { type: 'UNLOAD', unitId: 'R', toHexId: '1,0', facing: 3 });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R']!.hexId).toBe('1,0');
    expect(res.state.units['R']!.facing).toBe(3);
  });

  it('a Stunned Unit cannot Unload (§15.9)', () => {
    const s = loadedScene();
    s.units['R']!.hitMarkers = ['stunned'];
    expect(legalActionsForUnit(s, 'R').some((a) => a.type === 'UNLOAD')).toBe(false);
    const res = reduce(s, { type: 'UNLOAD', unitId: 'R', toHexId: '0,0' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('one Group Spent Check covers the unloading pair', () => {
    const s = loadedScene();
    const res = reduce(s, { type: 'UNLOAD', unitId: 'R', toHexId: '1,0' });
    expect(res.events.filter((e) => e.type === 'spent')).toHaveLength(1);
  });
});

describe('Destroying a Transport (§15.11)', () => {
  it('immediately and freely unloads the surviving passenger into the hex', () => {
    // §15.11: an Attack on a Transport rolls against BOTH Units stacked in its
    // hex (the general stacked-fire mechanic, §7.5.1, already does this). Give
    // the passenger a huge Defense so only the Vehicle dies to this shot, then
    // verify it's freed and placed in the hex at no cost.
    const s = scene();
    addTemplate(s, tankTemplate({ id: 'apc2', dr: { front: 2, flank: 2, color: 'blue' } }));
    addTemplate(s, rifleTemplate({ id: 'tough', dr: { front: 999, flank: 999, color: 'red' } }));
    addTemplate(s, rifleTemplate({ id: 'gun', fp: { red: 50, blue: 50 } }));
    addUnit(s, 'V', 'A', 0, 0, 0, 'apc2');
    addUnit(s, 'R', 'A', 0, 0, 0, 'tough').carriedBy = 'V';
    addUnit(s, 'ATK', 'B', 1, 0, 3, 'gun'); // adjacent, facing V's/R's hex
    s.currentSide = 'B';

    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'V' });
    expect(res.state.units['V']).toBeUndefined(); // Vehicle destroyed
    expect(res.state.units['R']).toBeDefined(); // passenger survived its own roll
    expect(res.state.units['R']!.carriedBy).toBeUndefined(); // freed
    expect(res.state.units['R']!.hexId).toBe('0,0'); // placed in the (former) hex
  });
});
