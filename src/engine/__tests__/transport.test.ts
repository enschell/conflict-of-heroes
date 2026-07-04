/** Vehicle Transport: Loading, Transporting, Unloading (§15.6–15.11). */
import { describe, expect, it } from 'vitest';
import { closeCombatContext } from '../combat';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { moveCost } from '../movement';
import { UNIT_TEMPLATES } from '../../data/units';
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

  it('Pivoting the Vehicle also pivots its passenger to match (§15.7: rides facing the same direction)', () => {
    const s = loadedScene();
    const res = reduce(s, { type: 'PIVOT', unitId: 'V', facing: 4 });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['V']!.facing).toBe(4);
    expect(res.state.units['R']!.facing).toBe(4);
    // One Group Spent Check covers both (§15.8/§10.10), like Move already does.
    expect(res.events.filter((e) => e.type === 'spent')).toHaveLength(1);
    expect(res.events.some((e) => e.type === 'spent' && /whole Group/.test(e.text))).toBe(true);
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
    // §15.11: "facing any direction" — a free CHOOSE_FACING window opens for it.
    expect(res.state.pendingFacingChoices).toEqual(['R']);
    const faced = reduce(res.state, { type: 'CHOOSE_FACING', unitId: 'R', facing: 5 });
    expect(faced.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(faced.state.units['R']!.facing).toBe(5);
  });
});

describe('Towing damaged Vehicles (§15.10)', () => {
  const trackedTow = () => tankTemplate({ id: 'tank', propulsion: 'tracked' });
  const wheeledTow = () => tankTemplate({ id: 'truck', propulsion: 'wheeled' });

  it('an Immobilized Vehicle may be hooked up (same hex) by a Tracked tower', () => {
    const s = scene();
    addTemplate(s, trackedTow());
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'tank');
    addUnit(s, 'DMG', 'A', 0, 0, 0, 'apc', ['aImmobilized']);
    const res = reduce(s, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TOW' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['DMG']!.carriedBy).toBe('TOW');
  });

  it('a Stunned Vehicle may also be towed', () => {
    const s = scene();
    addTemplate(s, trackedTow());
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'tank');
    addUnit(s, 'DMG', 'A', 0, 0, 0, 'apc', ['aStunned']);
    const res = reduce(s, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TOW' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
  });

  it('rejects towing an undamaged Vehicle — only Immobilized/Stunned qualify', () => {
    const s = scene();
    addTemplate(s, trackedTow());
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'tank');
    addUnit(s, 'HEALTHY', 'A', 0, 0, 0, 'apc'); // no hit marker
    const res = reduce(s, { type: 'LOAD', unitId: 'HEALTHY', vehicleId: 'TOW' });
    expect(res.events[0]?.type).toBe('illegal');
    expect(legalActionsForUnit(s, 'HEALTHY').some((a) => a.type === 'LOAD')).toBe(false);
  });

  it('a Tracked damaged Vehicle may only be towed by a Tracked tower', () => {
    const s = scene();
    addTemplate(s, wheeledTow());
    addUnit(s, 'TRUCK', 'A', 0, 0, 0, 'truck');
    addUnit(s, 'DMG', 'A', 0, 0, 0, 'apc', ['aImmobilized']); // apc is tracked (see tankTemplate)
    const res = reduce(s, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TRUCK' });
    expect(res.events[0]?.type).toBe('illegal');
    expect(legalActionsForUnit(s, 'DMG').some((a) => a.type === 'LOAD' && a.vehicleId === 'TRUCK')).toBe(false);
  });

  it('a Wheeled damaged Vehicle may be towed by any Vehicle (wheeled or tracked)', () => {
    const byWheeled = scene();
    addTemplate(byWheeled, wheeledTow());
    addUnit(byWheeled, 'TRUCKTOW', 'A', 0, 0, 0, 'truck');
    addUnit(byWheeled, 'DMG', 'A', 0, 0, 0, 'truck', ['aImmobilized']);
    expect(
      reduce(byWheeled, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TRUCKTOW' }).events.some(
        (e) => e.type === 'illegal',
      ),
    ).toBe(false);

    const byTracked = scene();
    addTemplate(byTracked, wheeledTow());
    addTemplate(byTracked, trackedTow());
    addUnit(byTracked, 'TANKTOW', 'A', 0, 0, 0, 'tank');
    addUnit(byTracked, 'DMG', 'A', 0, 0, 0, 'truck', ['aImmobilized']);
    expect(
      reduce(byTracked, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TANKTOW' }).events.some(
        (e) => e.type === 'illegal',
      ),
    ).toBe(false);
  });

  it('adjacent-hex hookup is impossible — an Immobilized/Stunned Vehicle cannot move to reach it', () => {
    const s = scene();
    addTemplate(s, trackedTow());
    addUnit(s, 'TOW', 'A', 1, 0, 0, 'tank');
    addUnit(s, 'DMG', 'A', 0, 0, 0, 'apc', ['aImmobilized']);
    const res = reduce(s, { type: 'LOAD', unitId: 'DMG', vehicleId: 'TOW' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('the towed Vehicle moves with its tower and may not Fire on its own (§15.10)', () => {
    const s = scene();
    addTemplate(s, trackedTow());
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'tank');
    addUnit(s, 'DMG', 'A', 0, 0, 0, 'apc', ['aImmobilized']).carriedBy = 'TOW';
    addUnit(s, 'E', 'B', 2, 0, 3, 'rifle');

    expect(legalActionsForUnit(s, 'DMG').some((a) => a.type === 'FIRE')).toBe(false);
    expect(reduce(s, { type: 'FIRE', attackerId: 'DMG', targetId: 'E' }).events[0]?.type).toBe('illegal');

    const res = reduce(s, { type: 'MOVE', unitId: 'TOW', toHexId: '1,0' });
    expect(res.state.units['TOW']!.hexId).toBe('1,0');
    expect(res.state.units['DMG']!.hexId).toBe('1,0'); // towed along
  });
});

describe('§16.7 Field Guns', () => {
  // The real ger-pak40 unit: `kind: 'gun'`, not `kind: 'vehicle'` — so unlike
  // §15.10's Immobilized/Stunned precondition for towing damaged Vehicles, a
  // Field Gun may be hooked up (Loaded) at ANY time, undamaged or not, since
  // `actions.ts`'s `loadable` check only imposes that precondition on
  // `kind === 'vehicle'`.
  function gunScene(): GameState {
    const s = baseState(1);
    addTemplate(s, UNIT_TEMPLATES['ger-pak40']!);
    addTemplate(s, tankTemplate({ id: 'halftrack', propulsion: 'wheeled' }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    return s;
  }

  it('a fully healthy Field Gun may be Loaded (towed) — no Immobilized/Stunned precondition', () => {
    const s = gunScene();
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'halftrack');
    addUnit(s, 'GUN', 'A', 0, 0, 0, 'ger-pak40'); // fresh, no hit markers
    expect(legalActionsForUnit(s, 'GUN').some((a) => a.type === 'LOAD' && a.vehicleId === 'TOW')).toBe(true);
    const res = reduce(s, { type: 'LOAD', unitId: 'GUN', vehicleId: 'TOW' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['GUN']!.carriedBy).toBe('TOW');
  });

  it('a Damaged Field Gun (Suppressed) may STILL be Loaded — the tow precondition never applies to Guns', () => {
    const s = gunScene();
    addUnit(s, 'TOW', 'A', 0, 0, 0, 'halftrack');
    addUnit(s, 'GUN', 'A', 0, 0, 0, 'ger-pak40', ['suppressed']);
    const res = reduce(s, { type: 'LOAD', unitId: 'GUN', vehicleId: 'TOW' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
  });

  it('may also move under its own power, using ordinary (non-Vehicle) terrain rules', () => {
    const s = gunScene();
    s.hexes['1,0']!.terrain = 'woodsHeavy'; // Foot Difficult Terrain is +1AP (§4.9); Vehicle rules would differ
    const gun = addUnit(s, 'GUN', 'A', 0, 0, 0, 'ger-pak40');
    const mc = moveCost(s, gun, '1,0');
    expect(mc.ap).toBe(UNIT_TEMPLATES['ger-pak40']!.move + 1);
  });

  it('may Close Combat, but at the Crewed −2AR penalty (whiteBoxFp) instead of the usual +4AR', () => {
    const s = gunScene();
    addTemplate(s, rifleTemplate({ id: 'enemy' }));
    const gun = addUnit(s, 'GUN', 'A', 0, 0, 0, 'ger-pak40'); // whiteBoxFp: true — Field Guns are Crewed (§6.11)
    addUnit(s, 'ENEMY', 'B', 0, 0, 0, 'enemy');
    const ctx = closeCombatContext(s, gun, s.units['ENEMY']!);
    expect(ctx.arMods).toContainEqual({ label: 'Crewed Unit penalty in CC', value: -2, section: '§6.11' });
  });
});
