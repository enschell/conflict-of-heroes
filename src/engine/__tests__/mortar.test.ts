/**
 * Mortar Direct/Indirect Attacks (rulebook §13.0–§13.3, §13.9). Reproduces the
 * `rules/13` red-box "Indirect Mortar Attack" shape: a Mortar can't directly
 * see its Target Hex (blocked by Heavy Woods), but a Spotter Hex within 2
 * Hexes and clear LOS of the Mortar can see both.
 */
import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import { directFireZone, indirectFireZone, isValidSpotterHex, rollIndirectFire } from '../mortar';
import type { UnitTemplate } from '../types';
import { addHex, addTemplate, addUnit, baseState } from './helpers';

function mortarTemplate(over: Partial<UnitTemplate> = {}): UnitTemplate {
  return {
    id: 'mortar',
    nation: 'germans',
    name: 'Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 4, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 12,
    minRange: 2,
    apToFire: 3,
    indirectApToFire: 4,
    vp: 2,
    unburdened: false,
    canFireSmoke: true,
    ...over,
  };
}

/** Mortar (0,0) facing East — open ground all the way out to (3,0). */
function directScene() {
  const s = baseState();
  addTemplate(s, mortarTemplate());
  addTemplate(s, mortarTemplate({ id: 'rifle', kind: 'infantry', minRange: undefined }));
  for (let q = 0; q <= 3; q++) addHex(s, q, 0, 'open');
  const mortar = addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');
  const target = addUnit(s, 'T1', 'B', 3, 0, 3, 'rifle'); // faces West (toward the mortar — front arc)
  return { s, mortar, target };
}

/** Mortar (0,0) facing East — Woods (1,0, blocks) — open (2,0) — Target (3,0); Spotter (1,-1). */
function indirectScene() {
  const s = baseState();
  addTemplate(s, mortarTemplate());
  addTemplate(s, mortarTemplate({ id: 'rifle', kind: 'infantry', minRange: undefined }));
  addHex(s, 0, 0, 'open');
  addHex(s, 1, 0, 'woodsHeavy');
  addHex(s, 2, 0, 'open');
  addHex(s, 3, 0, 'open');
  addHex(s, 1, -1, 'open');
  const mortar = addUnit(s, 'M1', 'A', 0, 0, 0, 'mortar');
  const target = addUnit(s, 'T1', 'B', 3, 0, 3, 'rifle');
  return { s, mortar, target };
}

describe('Mortar Direct Attacks (§13.1)', () => {
  it('may not target a Hex closer than its Minimum Range', () => {
    const { s, mortar } = directScene();
    const near = addUnit(s, 'T2', 'B', 1, 0, 3, 'rifle'); // adjacent — inside the 2-hex Minimum Range
    const ctx = attackContext(s, mortar, near);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toMatch(/Minimum Range/);
  });

  it('resolves High Explosive (§13.9): always vs Flank Defense, even when in the target front arc', () => {
    const { s, mortar, target } = directScene();
    target.hexId = '2,0'; // in range, directly visible, attacker in target's front arc
    target.facing = 3; // faces the mortar — normally front DR would apply
    const ctx = attackContext(s, mortar, target);
    expect(ctx.legal).toBe(true);
    expect(ctx.isFlank).toBe(true);
    expect(ctx.dr).toBe(10); // flank DR, not front (11)
  });

  it('Air Burst (§13.9): a red-Flank target loses the Heavy Woods +2DR bonus vs HE', () => {
    const { s, mortar, target } = directScene();
    target.hexId = '2,0';
    s.hexes['2,0']!.terrain = 'woodsHeavy';
    const ctx = attackContext(s, mortar, target);
    expect(ctx.legal).toBe(true);
    expect(ctx.dr).toBe(10); // flank DR only — no +2 Heavy Woods bonus
  });
});

describe('Mortar Spotter Hex (§13.3)', () => {
  it('accepts a Hex within 2 with clear LOS of the Mortar, rejects otherwise', () => {
    const { s } = indirectScene();
    expect(isValidSpotterHex(s, '0,0', '1,-1')).toBe(true); // adjacent, clear
    expect(isValidSpotterHex(s, '0,0', '3,0')).toBe(false); // too far (dist 3 > 2)
  });
});

describe('Mortar Indirect Attacks (§13.2)', () => {
  it('is illegal without a valid Spotter Hex, even in range/arc', () => {
    const { s, mortar } = indirectScene();
    // '2,0' is within 2 of the mortar, but the mortar can't see IT either — the
    // same Woods at '1,0' that blocks the direct shot blocks this "spotter" too.
    const zone = indirectFireZone(s, mortar, '3,0', '2,0', 2);
    expect(zone.legal).toBe(false);
  });

  it('is illegal via a Spotter Hex that sees the Mortar but NOT the Target — both LOS legs matter (§13.3)', () => {
    const { s, mortar } = indirectScene();
    // Spotter-B ('0,-1') is adjacent to the mortar (trivially sees it), but its
    // own view to the Target is blocked by Woods at '1,-1' — a Spotter Hex must
    // satisfy BOTH legs: within-2/clear-LOS of the Mortar, AND clear LOS to the
    // Target. Passing leg 1 alone must not be enough.
    addHex(s, 0, -1, 'open');
    s.hexes['1,-1']!.terrain = 'woodsHeavy'; // was the good spotter in other tests; not used here
    addHex(s, 2, -1, 'open');
    expect(isValidSpotterHex(s, mortar.hexId, '0,-1')).toBe(true); // leg 1 (mortar<->spotter) passes
    const zone = indirectFireZone(s, mortar, '3,0', '0,-1', 2);
    expect(zone.legal).toBe(false); // leg 2 (spotter->target) fails, so the whole thing is illegal
    expect(zone.reason).toMatch(/Spotter Hex/);
  });

  it('is legal via a Spotter Hex that can see the Target the Mortar itself cannot (the red-box shape)', () => {
    const { s, mortar } = indirectScene();
    expect(directFireZone(s, mortar, '3,0', 2).legal).toBe(false); // blocked by the Woods
    const zone = indirectFireZone(s, mortar, '3,0', '1,-1', 2);
    expect(zone.legal).toBe(true);
  });

  it('resolves HE vs Flank Defense using the Spotter Hex for LOS/wall checks', () => {
    const { s, mortar, target } = indirectScene();
    const result = rollIndirectFire(s, mortar, target.hexId, '1,-1');
    expect(result.rolls).toHaveLength(1);
    const roll = result.rolls[0]!;
    expect(roll.dr).toBe(10); // flank DR
    expect(roll.ar).toBe(4); // FP only — target is at range 3 (normal band, no bonus/penalty)
    expect(roll.hitNumber).toBe(10 - 4);
    expect(roll.total).toBe(roll.dice[0] + roll.dice[1]);
  });

  it('threads the RNG forward so a second roll differs deterministically from the first', () => {
    const { s, mortar, target } = indirectScene();
    const r1 = rollIndirectFire(s, mortar, target.hexId, '1,-1');
    const r2 = rollIndirectFire({ ...s, rng: r1.rng }, mortar, target.hexId, '1,-1');
    expect(r2.rng).not.toEqual(s.rng);
    expect(r1.rng).not.toEqual(r2.rng);
  });
});

describe('Mortars may Close Combat at a −2AR penalty (§13.1, whiteBoxFp)', () => {
  it('uses the crew-served −2 modifier, not the usual +4', () => {
    const { s, mortar, target } = directScene();
    target.hexId = mortar.hexId; // same hex → close combat
    const ctx = closeCombatContext(s, mortar, target);
    expect(ctx.legal).toBe(true);
    expect(ctx.ar).toBe(4 - 2); // FP − 2 (whiteBoxFp), not FP + 4
  });
});
