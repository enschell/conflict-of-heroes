import { describe, expect, it } from 'vitest';
import { directionTo, moveCost, planVehicleMove } from '../movement';
import { rollD6 } from '../rng';
import type { ObstacleKind, TerrainId } from '../types';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

/** Stamp a live Obstacle onto an already-added hex (§17.7). */
function putObstacle(s: ReturnType<typeof baseState>, hexId: string, kind: ObstacleKind, hitNumber?: number) {
  s.hexes[hexId]!.features.obstacle = { kind, hitNumber, destroyed: false, ownerSide: 'B' };
}

function ring(targetTerrain: TerrainId = 'open', walls: number[] = []) {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  addHex(s, 0, 0, 'open', { walls });
  // six neighbours of (0,0)
  addHex(s, 1, 0, targetTerrain); // dir 0 E (front)
  addHex(s, 1, -1, 'open'); // dir 1 NE
  addHex(s, 0, -1, 'open'); // dir 2 NW
  addHex(s, -1, 0, 'open'); // dir 3 W (flank, backward)
  addHex(s, -1, 1, 'open'); // dir 4 SW
  addHex(s, 0, 1, 'open'); // dir 5 SE
  const u = addUnit(s, 'A1', 'A', 0, 0, 0); // facing East
  return { s, u };
}

describe('foot movement (rulebook §5)', () => {
  it('costs the unit move value into an open front hex', () => {
    const { s, u } = ring();
    expect(moveCost(s, u, '1,0').ap).toBe(1);
  });

  it('adds terrain AP cost', () => {
    const { s, u } = ring('woodsHeavy');
    expect(moveCost(s, u, '1,0').ap).toBe(1 + 1);
  });

  it('adds +1 for backwards movement into a flank hex', () => {
    const { s, u } = ring();
    expect(moveCost(s, u, '-1,0').ap).toBe(1 + 1);
  });

  it('adds +1 for crossing a wall', () => {
    const { s, u } = ring('open', [0]); // wall on the East edge of (0,0)
    expect(moveCost(s, u, '1,0').ap).toBe(1 + 1);
  });

  it('rejects non-adjacent moves', () => {
    const { s, u } = ring();
    expect(moveCost(s, u, '2,0').ap).toBeNull();
  });

  it('directionTo finds the adjacent direction', () => {
    expect(directionTo('0,0', '1,0')).toBe(0);
    expect(directionTo('0,0', '-1,0')).toBe(3);
    expect(directionTo('0,0', '2,0')).toBe(-1);
  });
});

describe('elevation move cost (§12.2)', () => {
  function scene(fromElev: number, toElev: number, opts: { road?: boolean } = {}) {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open', { elevation: fromElev, road: opts.road });
    addHex(s, 1, 0, 'open', { elevation: toElev, road: opts.road });
    const u = addUnit(s, 'A1', 'A', 0, 0, 0); // facing East
    return { s, u };
  }

  it('Sloping (1 level): +1AP ascending, +0AP descending', () => {
    const up = scene(0, 1);
    expect(moveCost(up.s, up.u, '1,0').ap).toBe(1 + 1);
    const down = scene(1, 0);
    expect(moveCost(down.s, down.u, '1,0').ap).toBe(1 + 0);
  });

  it('Steep (2 levels): +2AP both ascending and descending (fixes the old descending-costs-0 bug)', () => {
    const up = scene(0, 2);
    expect(moveCost(up.s, up.u, '1,0').ap).toBe(1 + 2);
    const down = scene(2, 0);
    expect(moveCost(down.s, down.u, '1,0').ap).toBe(1 + 2);
  });

  it('Roads and Hills: a Road does not negate the Elevation Move Cost Penalty', () => {
    const { s, u } = scene(0, 1, { road: true });
    expect(moveCost(s, u, '1,0').ap).toBe(1 + 1);
  });

  it('itemizes the AP breakdown for a hover popup', () => {
    const steep = scene(0, 2);
    const steepResult = moveCost(steep.s, steep.u, '1,0');
    expect(steepResult.mods).toContainEqual({ label: 'Move', value: 1, section: '§4.5' });
    expect(steepResult.mods).toContainEqual({ label: 'Steep Terrain', value: 2, section: '§12.2' });

    const sloping = scene(0, 1);
    const slopingResult = moveCost(sloping.s, sloping.u, '1,0');
    expect(slopingResult.mods).toContainEqual({ label: 'Sloping Terrain', value: 1, section: '§12.2' });

    // A flat move has no elevation line item at all (only pushed when non-zero).
    const flat = scene(0, 0);
    const flatResult = moveCost(flat.s, flat.u, '1,0');
    expect(flatResult.mods?.some((m) => m.section === '§12.2')).toBe(false);
  });

  it('itemizes Heavy Woods terrain cost by name', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'woodsHeavy');
    const u = addUnit(s, 'A1', 'A', 0, 0, 0);
    const result = moveCost(s, u, '1,0');
    expect(result.ap).toBe(1 + 1);
    expect(result.mods).toContainEqual({ label: 'Woods (Heavy) Terrain', value: 1, section: '§4.9' });
  });

  it('vehicles pay the Sloping penalty too (§15 example), off-Road', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(s, 0, 0, 'open', { elevation: 0 });
    addHex(s, 1, 0, 'open', { elevation: 1 });
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    expect(moveCost(s, u, '1,0').ap).toBe(1 + 1);
  });

  it('Steep terrain is impassable to vehicles off-Road, but passable (still costed) on a Road', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(s, 0, 0, 'open', { elevation: 0 });
    addHex(s, 1, 0, 'open', { elevation: 2 });
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    expect(moveCost(s, u, '1,0').ap).toBeNull();

    const roaded = baseState();
    addTemplate(roaded, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(roaded, 0, 0, 'open', { elevation: 0, road: true });
    addHex(roaded, 1, 0, 'open', { elevation: 2, road: true });
    const u2 = addUnit(roaded, 'V', 'A', 0, 0, 0, 'veh');
    expect(moveCost(roaded, u2, '1,0').ap).toBe(1 + 2);
  });

  it('"Vehicle Moving Uphill" (§15 worked example): base Move + 1 ascending Bonus Move = 3AP', () => {
    const s = baseState();
    addTemplate(
      s,
      rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked', bonusMoves: 1 }),
    );
    addHex(s, 0, 0, 'open', { elevation: 0 }); // start, L0 Ground
    addHex(s, 1, 0, 'open', { elevation: 1 }); // A, L1 Hill (regular Move)
    addHex(s, 2, 0, 'open', { elevation: 2 }); // B, L2 Hill (1 Track Bonus Move)
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    const plan = planVehicleMove(s, u, ['1,0', '2,0']);
    expect(plan.ap).toBe(3);
    expect(plan.finalHexId).toBe('2,0');
  });
});

describe('Obstacles (§17.7-§17.9)', () => {
  it('§17.8 Barbed Wire: a Foot Unit rolls 1d6 added to its Move Cost', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putObstacle(s, '1,0', 'barbedWire');
    const u = addUnit(s, 'A1', 'A', 0, 0, 0);
    const result = moveCost(s, u, '1,0');
    const expectedRoll = rollD6(s.rng).value;
    expect(result.ap).toBe(1 + expectedRoll);
    expect(result.mods).toContainEqual({ label: 'Barbed Wire (1d6)', value: expectedRoll, section: '§17.8', random: true });
    expect(result.rng).toBeDefined();
  });

  it('§17.8/§17.9: Barbed Wire and Road Blocks are impassable to Wheeled vehicles, even on a Road', () => {
    for (const kind of ['barbedWire', 'roadBlock'] as const) {
      const s = baseState();
      addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'wheeled' }));
      addHex(s, 0, 0, 'open', { road: true });
      addHex(s, 1, 0, 'open', { road: true });
      putObstacle(s, '1,0', kind);
      const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
      expect(moveCost(s, u, '1,0').ap).toBeNull();
    }
  });

  it('§17.8/§17.9: Tracked vehicles cross Barbed Wire/Road Block freely (no extra AP)', () => {
    for (const kind of ['barbedWire', 'roadBlock'] as const) {
      const s = baseState();
      addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
      addHex(s, 0, 0, 'open');
      addHex(s, 1, 0, 'open');
      putObstacle(s, '1,0', kind);
      const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
      expect(moveCost(s, u, '1,0').ap).toBe(1);
    }
  });

  it('§17.9: Road Blocks do not affect Foot Unit movement at all', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putObstacle(s, '1,0', 'roadBlock');
    const u = addUnit(s, 'A1', 'A', 0, 0, 0);
    expect(moveCost(s, u, '1,0').ap).toBe(1);
  });

  it('§17.8/§17.9/§17.10: a vehicle Bonus Move may not enter or exit any of the three Obstacle kinds', () => {
    for (const kind of ['barbedWire', 'roadBlock', 'mines'] as const) {
      const s = baseState();
      addTemplate(
        s,
        rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked', bonusMoves: 1 }),
      );
      addHex(s, 0, 0, 'open');
      addHex(s, 1, 0, 'open'); // regular Move target
      addHex(s, 2, 0, 'open'); // would-be Bonus Move target
      putObstacle(s, '2,0', kind);
      const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
      const plan = planVehicleMove(s, u, ['1,0', '2,0']);
      expect(plan.ap).toBeNull();
    }
  });
});
