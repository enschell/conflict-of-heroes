/**
 * Smoke (rulebook §14.0–§14.4): DR/AR modifiers, LOS blocking, the Rally
 * bonus, and Pre-Round dissipation.
 */
import { describe, expect, it } from 'vitest';
import { attackContext } from '../combat';
import { hasLOS } from '../los';
import { dissipateSmoke, smokeAttackPenalty, smokeDefenseBonus, smokeRallyBonus } from '../smoke';
import { rallyModifier } from '../rally';
import { startRound } from '../turn';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function scene() {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  for (let q = 0; q <= 3; q++) addHex(s, q, 0, 'open');
  const a = addUnit(s, 'A1', 'A', 0, 0, 0);
  const t = addUnit(s, 'T1', 'B', 3, 0, 3);
  return { s, a, t };
}

describe('Smoke DR/AR modifiers (§14.3–§14.4)', () => {
  it('Heavy Smoke: +2DR defending, −2AR attacking out of it', () => {
    const { s } = scene();
    s.hexes['3,0']!.features.smoke = 2;
    s.hexes['0,0']!.features.smoke = 2;
    expect(smokeDefenseBonus(s, '3,0')).toBe(2);
    expect(smokeAttackPenalty(s, '0,0')).toBe(-2);
  });

  it('Light Smoke: +1DR defending, −1AR attacking out of it', () => {
    const { s } = scene();
    s.hexes['3,0']!.features.smoke = 1;
    s.hexes['0,0']!.features.smoke = 1;
    expect(smokeDefenseBonus(s, '3,0')).toBe(1);
    expect(smokeAttackPenalty(s, '0,0')).toBe(-1);
  });

  it('feeds into attackContext DR/AR (target hex Heavy Smoke, attacker hex Light Smoke)', () => {
    const { s, a, t } = scene();
    s.hexes['3,0']!.features.smoke = 2; // target defends in Heavy Smoke
    s.hexes['0,0']!.features.smoke = 1; // attacker fires out of Light Smoke
    const baseline = attackContext({ ...s, hexes: { ...s.hexes, '3,0': { ...s.hexes['3,0']!, features: {} }, '0,0': { ...s.hexes['0,0']!, features: {} } } }, a, t);
    const ctx = attackContext(s, a, t);
    expect(ctx.dr).toBe(baseline.dr + 2);
    expect(ctx.ar).toBe(baseline.ar - 1);
  });
});

describe('Smoke blocks LOS (§14.3–§14.4)', () => {
  it('a single Heavy Smoke hex on the path blocks LOS entirely', () => {
    const { s } = scene();
    s.hexes['1,0']!.features.smoke = 2;
    expect(hasLOS(s, '0,0', '3,0')).toBe(false);
  });

  it('a single Light Smoke hex on the path does NOT block LOS', () => {
    const { s } = scene();
    s.hexes['1,0']!.features.smoke = 1;
    expect(hasLOS(s, '0,0', '3,0')).toBe(true);
  });

  it('two or more Light Smoke hexes on the path DO block LOS', () => {
    const { s } = scene();
    s.hexes['1,0']!.features.smoke = 1;
    s.hexes['2,0']!.features.smoke = 1;
    expect(hasLOS(s, '0,0', '3,0')).toBe(false);
  });
});

describe('Smoke Rally bonus (§7.8/§14.3)', () => {
  it('grants +1 to rally, Heavy or Light alike', () => {
    const { s } = scene();
    const unit = s.units['A1']!;
    unit.hitMarkers = ['pinned'];
    expect(smokeRallyBonus(s, unit.hexId)).toBe(0);
    expect(rallyModifier(s, unit)).toBe(0);
    s.hexes[unit.hexId]!.features.smoke = 1;
    expect(smokeRallyBonus(s, unit.hexId)).toBe(1);
    expect(rallyModifier(s, unit)).toBe(1);
    s.hexes[unit.hexId]!.features.smoke = 2;
    expect(smokeRallyBonus(s, unit.hexId)).toBe(1); // still +1, not +2
  });
});

describe('Smoke dissipation (§14.4)', () => {
  it('Heavy Smoke flips to Light; existing Light Smoke is removed', () => {
    const { s } = scene();
    s.hexes['0,0']!.features.smoke = 2;
    s.hexes['1,0']!.features.smoke = 1;
    dissipateSmoke(s);
    expect(s.hexes['0,0']!.features.smoke).toBe(1);
    expect(s.hexes['1,0']!.features.smoke).toBeUndefined();
  });

  it('the Pre-Round Sequence dissipates Smoke on every Round transition', () => {
    const { s } = scene();
    s.hexes['0,0']!.features.smoke = 2;
    startRound(s);
    expect(s.hexes['0,0']!.features.smoke).toBe(1);
  });
});
