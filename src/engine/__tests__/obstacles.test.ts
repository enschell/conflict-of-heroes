/**
 * Obstacles (§17.7-§17.10). Reproduces the rulebook's own Mines Attack
 * shape (a fixed Hit Number, hits both Soft/Armored, owner-side CAP-
 * modifiable) via both the pure `rollMinesAttack`/`minesTargetsFor` helpers
 * and full `reduce()` integration for MOVE/PIVOT/CLOSE_COMBAT.
 */
import { describe, expect, it } from 'vitest';
import { destroysBarbedWire, minesOwnerSide, minesTargetsFor, rollMinesAttack } from '../obstacles';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

function putMines(s: GameState, hexId: string, hitNumber: number, ownerSide: 'A' | 'B' = 'B') {
  s.hexes[hexId]!.features.obstacle = { kind: 'mines', hitNumber, destroyed: false, ownerSide };
}
function putBarbedWire(s: GameState, hexId: string, ownerSide: 'A' | 'B' = 'B') {
  s.hexes[hexId]!.features.obstacle = { kind: 'barbedWire', destroyed: false, ownerSide };
}

describe('rollMinesAttack (§17.10)', () => {
  it('subtracts the (clamped) CAP mod from the base Hit Number', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'T1', 'A', 0, 0, 0);
    expect(rollMinesAttack(s, u, 8, 0).hitNumber).toBe(8);
    expect(rollMinesAttack(s, u, 8, 2).hitNumber).toBe(6); // helps hit an enemy
    expect(rollMinesAttack(s, u, 8, -2).hitNumber).toBe(10); // protects a friendly Unit
    expect(rollMinesAttack(s, u, 8, 5).hitNumber).toBe(6); // clamped to ±2
  });

  it('hit/critical are consistent with the actual roll vs the Hit Number', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'T1', 'A', 0, 0, 0);
    const roll = rollMinesAttack(s, u, 8, 0);
    expect(roll.hit).toBe(roll.total >= roll.hitNumber);
    expect(roll.critical).toBe(roll.total >= roll.hitNumber + 4);
    expect(roll.fpColor).toBe('red'); // rifleTemplate's default DR colour
  });

  it('routes fpColor by the target\'s own DR colour, regardless of Mines having no AR', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', dr: { front: 14, flank: 12, color: 'blue' } }));
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'V1', 'A', 0, 0, 0, 'veh');
    expect(rollMinesAttack(s, u, 8, 0).fpColor).toBe('blue');
  });
});

describe('minesTargetsFor / minesOwnerSide', () => {
  it('returns one entry per Unit id when the Hex has live Mines', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open');
    putMines(s, '0,0', 8);
    expect(minesTargetsFor(s, '0,0', ['U1', 'U2'])).toEqual([
      { unitId: 'U1', hitNumber: 8 },
      { unitId: 'U2', hitNumber: 8 },
    ]);
    expect(minesOwnerSide(s, '0,0')).toBe('B');
  });

  it('is empty/undefined for a Hex with no Obstacle, a different kind, or destroyed Mines', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addHex(s, 2, 0, 'open');
    putBarbedWire(s, '1,0');
    putMines(s, '2,0', 8);
    s.hexes['2,0']!.features.obstacle!.destroyed = true;
    expect(minesTargetsFor(s, '0,0', ['U1'])).toEqual([]);
    expect(minesTargetsFor(s, '1,0', ['U1'])).toEqual([]);
    expect(minesTargetsFor(s, '2,0', ['U1'])).toEqual([]);
    expect(minesOwnerSide(s, '2,0')).toBeUndefined();
  });
});

describe('destroysBarbedWire (§17.8)', () => {
  it('is true only for a Tracked vehicle entering LIVE Barbed Wire', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open');
    putBarbedWire(s, '0,0');
    const hex = s.hexes['0,0']!;
    expect(destroysBarbedWire(hex, 'tracked')).toBe(true);
    expect(destroysBarbedWire(hex, 'wheeled')).toBe(false);
    hex.features.obstacle!.destroyed = true;
    expect(destroysBarbedWire(hex, 'tracked')).toBe(false);
  });
});

describe('Mines Attack — reducer integration (§17.10)', () => {
  function scene() {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putMines(s, '1,0', 8, 'B');
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    return { s, u };
  }

  it('MOVE into a Mines Hex triggers an attack, deducting the owner\'s CAP for a nonzero mod', () => {
    const { s, u } = scene();
    const capBefore = s.players.B.capCurrent;
    const res = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0', minesCapMods: { [u.id]: 2 } });
    expect(res.events.some((e) => e.type === 'mines')).toBe(true);
    expect(res.state.players.B.capCurrent).toBe(capBefore - 2);
  });

  it('does not deduct CAP or roll anything when the mod is 0 (default)', () => {
    const { s, u } = scene();
    const capBefore = s.players.B.capCurrent;
    const res = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0' });
    expect(res.events.some((e) => e.type === 'mines')).toBe(true);
    expect(res.state.players.B.capCurrent).toBe(capBefore);
  });

  it('never triggers when the destination Hex has no Mines', () => {
    const { s, u } = scene();
    s.hexes['1,0']!.features.obstacle = undefined;
    const res = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0' });
    expect(res.events.some((e) => e.type === 'mines')).toBe(false);
  });

  it('PIVOT in a Mines Hex attacks the pivoting Unit', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    putMines(s, '0,0', 8, 'B');
    const u = addUnit(s, 'A1', 'A', 0, 0, 0);
    const res = reduce(s, { type: 'PIVOT', unitId: u.id, facing: 2 });
    expect(res.events.some((e) => e.type === 'mines')).toBe(true);
  });

  it('CLOSE_COMBAT in a Mines Hex attacks only the initiating attacker, not the defender', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    putMines(s, '0,0', 8, 'B');
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const target = addUnit(s, 'T1', 'B', 0, 0, 3);
    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: attacker.id, targetId: target.id });
    const minesEvents = res.events.filter((e) => e.type === 'mines');
    expect(minesEvents).toHaveLength(1);
    expect(minesEvents[0]!.text).toContain(attacker.id);
    expect(minesEvents[0]!.text).not.toContain(target.id);
  });

  it('a Tracked vehicle destroys Barbed Wire on entry', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putBarbedWire(s, '1,0', 'B');
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    const res = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0' });
    expect(res.state.hexes['1,0']!.features.obstacle!.destroyed).toBe(true);
    expect(res.events.some((e) => e.type === 'obstacle')).toBe(true);
  });
});
