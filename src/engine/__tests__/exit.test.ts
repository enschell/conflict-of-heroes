/**
 * Exit the Map via a Mission-authored exit zone (§4.0: "a Unit may never exit
 * the Map, unless specified by a Mission"). Costs the Unit's own move stat as
 * AP (a real Spent Check, like a Move); VP goes to the exiting Unit's own side.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { baseState, addHex, addTemplate, addUnit, rifleTemplate } from './helpers';

function scene() {
  const s = baseState();
  addTemplate(s, rifleTemplate({ move: 2 }));
  addHex(s, 0, 0);
  addHex(s, 1, 0);
  addUnit(s, 'A1', 'A', 0, 0, 0);
  addUnit(s, 'A2', 'A', 1, 0, 0);
  s.exitZones = [{ id: 'zone1', side: 'A', hexIds: ['0,0'], vpPerUnit: 4 }];
  return s;
}

describe('EXIT (§4.0, Mission-authored exit zones)', () => {
  it('a Unit on its own designated exit hex may EXIT', () => {
    const s = scene();
    const acts = legalActionsForUnit(s, 'A1');
    expect(acts.some((a) => a.type === 'EXIT')).toBe(true);
  });

  it('a Unit NOT on a designated exit hex has no EXIT action', () => {
    const s = scene();
    const acts = legalActionsForUnit(s, 'A2');
    expect(acts.some((a) => a.type === 'EXIT')).toBe(false);
  });

  it('exiting removes the Unit, spends its move AP with a real Spent Check, and awards VP to its own side', () => {
    const s = scene();
    const before = s.players.A.vp;
    const res = reduce(s, { type: 'EXIT', unitId: 'A1' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['A1']).toBeUndefined();
    expect(res.state.players.A.vp - before).toBe(4);
    expect(res.state.log.some((e) => e.type === 'spent')).toBe(true);
  });

  it('a wrong-side Unit on the same hex cannot use another side\'s exit zone', () => {
    const s = scene();
    addUnit(s, 'B1', 'B', 0, 0, 0);
    s.exitZones = [{ id: 'zone1', side: 'A', hexIds: ['0,0'], vpPerUnit: 4 }];
    const acts = legalActionsForUnit(s, 'B1');
    expect(acts.some((a) => a.type === 'EXIT')).toBe(false);
    const res = reduce(s, { type: 'EXIT', unitId: 'B1' });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('a transported Unit cannot Exit on its own', () => {
    const s = scene();
    s.units['A1']!.carriedBy = 'A2';
    const res = reduce(s, { type: 'EXIT', unitId: 'A1' });
    expect(res.events[0]?.type).toBe('illegal');
  });
});
