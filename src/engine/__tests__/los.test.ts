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

  it('Plowed Field blocks LOS through it, same as any other blocking terrain', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open'); // A
    addHex(s, 1, 0, 'plowed'); // B (blocks)
    addHex(s, 2, 0, 'open'); // C
    expect(hasLOS(s, '0,0', '1,0')).toBe(true); // into the field is fine
    expect(hasLOS(s, '0,0', '2,0')).toBe(false); // blocked by B
  });

  it('a Unit standing IN a Plowed Field (or any blocking terrain) can still be targeted — the target\'s own hex is never a blocking hex to itself, only intervening hexes are (§5.2 "endpoints excluded")', () => {
    const adjacent = baseState();
    addHex(adjacent, 0, 0, 'open'); // attacker
    addHex(adjacent, 1, 0, 'plowed'); // target's own hex — adjacent, no intervening hex at all
    expect(hasLOS(adjacent, '0,0', '1,0')).toBe(true);

    // Same check with a real (clear) intervening hex in between.
    const atRange = baseState();
    addHex(atRange, 0, 0, 'open'); // attacker
    addHex(atRange, 1, 0, 'open'); // intervening, clear
    addHex(atRange, 2, 0, 'plowed'); // target's own hex, two hexes away
    expect(hasLOS(atRange, '0,0', '2,0')).toBe(true);
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

describe('elevation and LOS (§12.4-§12.6)', () => {
  it('Plateau Effect (§12.4 worked example): A-B-C-D-E', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open', { elevation: 0 }); // A
    addHex(s, 1, 0, 'open', { elevation: 1 }); // B
    addHex(s, 2, 0, 'open', { elevation: 1 }); // C
    addHex(s, 3, 0, 'open', { elevation: 2 }); // D
    addHex(s, 4, 0, 'open', { elevation: 2 }); // E
    expect(hasLOS(s, '0,0', '2,0')).toBe(false); // A->C: B ties High Ground C
    expect(hasLOS(s, '0,0', '3,0')).toBe(true); // A->D: B/C both lower than D
    expect(hasLOS(s, '0,0', '4,0')).toBe(false); // A->E: D ties High Ground E
  });

  it('§12.5 worked example: L1 MG blocked by flat Woods, sees an open ATG', () => {
    const blocked = baseState();
    addHex(blocked, 0, 0, 'open', { elevation: 1 }); // MG34
    addHex(blocked, 1, 0, 'woodsLight', { elevation: 0 }); // flat Woods
    addHex(blocked, 2, 0, 'open', { elevation: 0 }); // Rifles
    expect(hasLOS(blocked, '0,0', '2,0')).toBe(false);

    const clear = baseState();
    addHex(clear, 0, 0, 'open', { elevation: 1 }); // MG34
    addHex(clear, 1, 0, 'open', { elevation: 0 }); // open ground
    addHex(clear, 2, 0, 'open', { elevation: 0 }); // ATG
    expect(hasLOS(clear, '0,0', '2,0')).toBe(true);
  });

  it('§12.5: Woods on an L1 Hill is an L2 blocker; a plain L1 Hill is not', () => {
    const woodsOnHill = baseState();
    addHex(woodsOnHill, 0, 0, 'open', { elevation: 2 }); // Shooter A
    addHex(woodsOnHill, 1, 0, 'woodsLight', { elevation: 1 }); // Woods on Hill
    addHex(woodsOnHill, 2, 0, 'open', { elevation: 0 }); // Target A
    expect(hasLOS(woodsOnHill, '0,0', '2,0')).toBe(false);

    const plainHill = baseState();
    addHex(plainHill, 0, 0, 'open', { elevation: 2 }); // Shooter B
    addHex(plainHill, 1, 0, 'open', { elevation: 1 }); // plain Hill
    addHex(plainHill, 2, 0, 'open', { elevation: 0 }); // Target B
    expect(hasLOS(plainHill, '0,0', '2,0')).toBe(true);
  });

  it('§12.6 Blind Spot: blocked directly behind Woods, visible again beyond', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open', { elevation: 2 }); // H1 (shooter)
    addHex(s, 1, 0, 'woodsLight', { elevation: 0 }); // Woods
    addHex(s, 2, 0, 'open', { elevation: 0 }); // Behind 1 (blind spot)
    addHex(s, 3, 0, 'open', { elevation: 0 }); // Behind 2 (visible again)
    expect(hasLOS(s, '0,0', '2,0')).toBe(false);
    expect(hasLOS(s, '0,0', '3,0')).toBe(true);
  });

  it('a bare hillock (no terrain) still blocks two Level-0 hexes', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open', { elevation: 0 }); // P1
    addHex(s, 1, 0, 'open', { elevation: 1 }); // bare hillock
    addHex(s, 2, 0, 'open', { elevation: 0 }); // P2
    expect(hasLOS(s, '0,0', '2,0')).toBe(false);
  });

  it('same-level "plateau" LOS is uniform at any elevation, not just L0', () => {
    const l1 = baseState();
    addHex(l1, 0, 0, 'open', { elevation: 1 }); // G1
    addHex(l1, 1, 0, 'open', { elevation: 1 }); // G2 (plateau)
    addHex(l1, 2, 0, 'open', { elevation: 1 }); // G3
    expect(hasLOS(l1, '0,0', '2,0')).toBe(true);

    const l2 = baseState();
    addHex(l2, 0, 0, 'open', { elevation: 2 }); // K1
    addHex(l2, 1, 0, 'open', { elevation: 2 }); // K2 (plateau)
    addHex(l2, 2, 0, 'open', { elevation: 2 }); // K3
    expect(hasLOS(l2, '0,0', '2,0')).toBe(true);
  });
});
