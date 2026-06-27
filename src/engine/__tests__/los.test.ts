import { describe, expect, it } from 'vitest';
import { hasLOS, visibleHexesFrom } from '../los';
import { addHex, baseState } from './helpers';

describe('line of sight (rulebook §6.0)', () => {
  it('can see INTO a blocking hex but not THROUGH it (Figure 7)', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open'); // A
    addHex(s, 1, 0, 'woodsLight'); // B (blocks)
    addHex(s, 2, 0, 'open'); // C
    addHex(s, 3, 0, 'open'); // D
    expect(hasLOS(s, '0,0', '1,0')).toBe(true); // into the woods is fine
    expect(hasLOS(s, '0,0', '2,0')).toBe(false); // blocked by B
    expect(hasLOS(s, '0,0', '3,0')).toBe(false);
  });

  it('open ground never blocks', () => {
    const s = baseState();
    for (let q = 0; q <= 4; q++) addHex(s, q, 0, 'open');
    expect(hasLOS(s, '0,0', '4,0')).toBe(true);
  });

  it('edge-tie uses the least restrictive hex', () => {
    // Line from (0,0) to (1,1) runs along the edge between (1,0) and (0,1).
    const s = baseState();
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 1, 'open');
    addHex(s, 1, 0, 'woodsHeavy'); // one side blocks
    addHex(s, 0, 1, 'open'); // other side is clear
    expect(hasLOS(s, '0,0', '1,1')).toBe(true); // clear side wins

    // Now block BOTH edge hexes -> LOS is blocked.
    s.hexes['0,1']!.terrain = 'woodsHeavy';
    expect(hasLOS(s, '0,0', '1,1')).toBe(false);
  });

  it('visibleHexesFrom partitions the board', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'woodsHeavy');
    addHex(s, 2, 0, 'open');
    const vis = visibleHexesFrom(s, '0,0');
    expect(vis.visible).toContain('1,0'); // into the woods
    expect(vis.blocked).toContain('2,0'); // behind the woods
  });
});
