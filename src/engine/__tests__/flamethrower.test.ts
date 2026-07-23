/**
 * Flamethrowers (§18.0-§18.1). Reproduces the rulebook's own worked example
 * (German Pioneers' Flamethrower vs a Soviet Infantry Gun in a Stone Building)
 * as a fixture, per CLAUDE.md's "red-box examples are oracles" convention.
 */
import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import { directFireZone } from '../mortar';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

const pioneerTemplate = () =>
  rifleTemplate({
    id: 'pioneer',
    fp: { red: 4, blue: 3 },
    dr: { front: 12, flank: 12, color: 'red' },
    range: 3,
    apToFire: 2,
    hasFlamethrower: true,
    pioneer: true,
    canFireSmoke: true,
  });

const infGunTemplate = () => rifleTemplate({ id: 'infgun', dr: { front: 12, flank: 10, color: 'red' } });

describe('Flamethrower Attack (§18.0) — reproduces the rulebook worked example', () => {
  it('German Pioneers vs a Soviet Infantry Gun in a Stone Building: 6AR, 10DR, Hit Number 4', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'buildingStone');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    const infGun = addUnit(s, 'GUN', 'B', 1, 0, 3, 'infgun');

    const ctx = attackContext(s, pioneer, infGun, 0, 0, true);
    expect(ctx.legal).toBe(true);
    expect(ctx.ar).toBe(6); // red 3FP + 3AR Short Range Bonus
    expect(ctx.dr).toBe(10); // Flank DR only — Stone Building DM ignored
    expect(ctx.hitNumber).toBe(4);
    expect(ctx.isFlank).toBe(true);
    // Ignoring the Stone Building's Terrain DM is the whole point of the
    // fixture — confirm no Terrain line item snuck into drMods.
    expect(ctx.drMods.some((m) => m.section === '§6.4')).toBe(false);
  });

  it('denies useFlamethrower for a Unit without hasFlamethrower', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const target = addUnit(s, 'T1', 'B', 1, 0, 3);
    const ctx = attackContext(s, attacker, target, 0, 0, true);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toContain('Flamethrower');
  });

  it('has a fixed Max Range of 1 Hex, regardless of the Unit\'s own (longer) Range', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addHex(s, 2, 0, 'open');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    const farTarget = addUnit(s, 'GUN', 'B', 2, 0, 3, 'infgun');
    const ctx = attackContext(s, pioneer, farTarget, 0, 0, true);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toContain('Flamethrower range');
    // The same target is a perfectly legal NORMAL Fire (range 3) — confirms
    // it's specifically the Flamethrower's own cap, not a general LOS/arc issue.
    expect(attackContext(s, pioneer, farTarget).legal).toBe(true);
  });

  it('always targets Flank Defense, even when the attacker is in the target\'s front arc', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    // Target faces east (0) — directly at the Pioneer, i.e. Pioneer is in its FRONT arc.
    const target = addUnit(s, 'GUN', 'B', 1, 0, 0, 'infgun');
    const ctx = attackContext(s, pioneer, target, 0, 0, true);
    expect(ctx.legal).toBe(true);
    expect(ctx.isFlank).toBe(true);
    expect(ctx.dr).toBe(10); // flank, not the 12 front
  });

  it('ignores every DR modifier except Smoke', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'buildingStone', { elevation: 2 }); // Terrain AND Elevation, both should be ignored
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    const target = addUnit(s, 'GUN', 'B', 1, 0, 3, 'infgun');
    const ctx = attackContext(s, pioneer, target, 0, 0, true);
    expect(ctx.dr).toBe(10); // no Terrain DM, no Elevation Bonus for the target being higher
    expect(ctx.drMods).toEqual([{ label: 'Flank Defense (Flamethrower always targets flank)', value: 10, section: '§18.0' }]);
  });
});

describe('Flamethrower in Close Combat (§18.0)', () => {
  it('substitutes a flat 3FP + its own +4 CC bonus, ignoring the target\'s Terrain', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'buildingStone');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    const target = addUnit(s, 'GUN', 'B', 0, 0, 3, 'infgun');
    const ctx = closeCombatContext(s, pioneer, target, 0, true);
    expect(ctx.legal).toBe(true);
    expect(ctx.ar).toBe(3 + 4); // red 3FP + Flamethrower CC Bonus
    expect(ctx.dr).toBe(10); // Flank Defense only, Stone Building ignored
  });

  it('denies useFlamethrower for a Unit without hasFlamethrower', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const target = addUnit(s, 'T1', 'B', 0, 0, 3);
    const ctx = closeCombatContext(s, attacker, target, 0, true);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toContain('Flamethrower');
  });
});

describe('reducer integration: FIRE/CLOSE_COMBAT with useFlamethrower', () => {
  it('FIRE with useFlamethrower resolves using the Flamethrower profile', () => {
    const s = baseState(5);
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'buildingStone');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    addUnit(s, 'GUN', 'B', 1, 0, 3, 'infgun');
    const res = reduce(s, { type: 'FIRE', attackerId: pioneer.id, targetId: 'GUN', useFlamethrower: true });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.events.some((e) => e.type === 'fire' && e.text.includes('Flamethrower'))).toBe(true);
  });

  it('CLOSE_COMBAT with useFlamethrower resolves using the Flamethrower profile', () => {
    const s = baseState(6);
    addTemplate(s, pioneerTemplate());
    addTemplate(s, infGunTemplate());
    addHex(s, 0, 0, 'open');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    addUnit(s, 'GUN', 'B', 0, 0, 3, 'infgun');
    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: pioneer.id, targetId: 'GUN', useFlamethrower: true });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.events.some((e) => e.type === 'cc' && e.text.includes('Flamethrower'))).toBe(true);
  });
});

describe('Pioneer exceptions (§18.1)', () => {
  it('may enter a Mines Hex without triggering a Mines Attack', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    s.hexes['1,0']!.features.obstacle = { kind: 'mines', hitNumber: 8, destroyed: false, ownerSide: 'B' };
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    const res = reduce(s, { type: 'MOVE', unitId: pioneer.id, toHexId: '1,0' });
    expect(res.events.some((e) => e.type === 'mines')).toBe(false);
  });

  it('a non-Pioneer Foot Unit still triggers the same Mines Hex', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    s.hexes['1,0']!.features.obstacle = { kind: 'mines', hitNumber: 8, destroyed: false, ownerSide: 'B' };
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    const res = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0' });
    expect(res.events.some((e) => e.type === 'mines')).toBe(true);
  });

  it('Fire Smoke is capped to a max Range of 1 Hex, unlike its normal (longer) Fire range', () => {
    const s = baseState();
    addTemplate(s, pioneerTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addHex(s, 2, 0, 'open');
    const pioneer = addUnit(s, 'PIO', 'A', 0, 0, 0, 'pioneer');
    expect(directFireZone(s, pioneer, '1,0', 0, 1).legal).toBe(true); // adjacent — within the Range-1 cap
    expect(directFireZone(s, pioneer, '2,0', 0, 1).legal).toBe(false); // 2 Hexes — outside it
    expect(directFireZone(s, pioneer, '2,0', 0, 1).reason).toContain('Fire Smoke Max Range');
  });
});
