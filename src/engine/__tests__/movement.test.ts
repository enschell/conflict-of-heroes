import { describe, expect, it } from 'vitest';
import { directionTo, moveCost } from '../movement';
import type { TerrainId } from '../types';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

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
