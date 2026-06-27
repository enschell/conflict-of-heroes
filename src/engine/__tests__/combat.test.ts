import { describe, expect, it } from 'vitest';
import { attackContext, rollAttack } from '../combat';
import type { Facing } from '../types';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function scene(opts: {
  targetFacing: Facing;
  targetQ?: number;
  targetTerrain?: 'open' | 'woodsHeavy';
  attackerFp?: number;
  range?: number;
}) {
  const targetQ = opts.targetQ ?? 1;
  const s = baseState();
  addTemplate(
    s,
    rifleTemplate({ fp: { red: opts.attackerFp ?? 3, blue: 0 }, range: opts.range ?? 4 }),
  );
  for (let q = 0; q <= 10; q++) {
    addHex(s, q, 0, q === targetQ ? (opts.targetTerrain ?? 'open') : 'open');
  }
  const a = addUnit(s, 'A1', 'A', 0, 0, 0); // facing East
  const t = addUnit(s, 'T1', 'B', targetQ, 0, opts.targetFacing);
  return { s, a, t };
}

describe('combat resolution (rulebook §7)', () => {
  it('uses front DR when the attacker is in the target front arc, +3FP at short range', () => {
    const { s, a, t } = scene({ targetFacing: 3 }); // target faces West (toward attacker)
    const ctx = attackContext(s, a, t);
    expect(ctx.legal).toBe(true);
    expect(ctx.fpColor).toBe('red');
    expect(ctx.isFlank).toBe(false);
    expect(ctx.defenseValue).toBe(12); // front DR
    expect(ctx.baseFP).toBe(3 + 3); // FP + short-range bonus
  });

  it('uses flank DR when the attacker is outside the target arc', () => {
    const { s, a, t } = scene({ targetFacing: 0 }); // target faces East (away)
    const ctx = attackContext(s, a, t);
    expect(ctx.isFlank).toBe(true);
    expect(ctx.defenseValue).toBe(11); // flank DR
  });

  it('adds terrain DM to the defender', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetTerrain: 'woodsHeavy' });
    expect(attackContext(s, a, t).defenseValue).toBe(12 + 2);
  });

  it('applies range bands: normal (0), long (-2), out of range', () => {
    const normal = scene({ targetFacing: 3, targetQ: 3 }); // dist 3, range 4
    expect(attackContext(normal.s, normal.a, normal.t).baseFP).toBe(3);

    const long = scene({ targetFacing: 3, targetQ: 6 }); // dist 6, range 4 (≤ 8)
    expect(attackContext(long.s, long.a, long.t).baseFP).toBe(3 - 2);

    const out = scene({ targetFacing: 3, targetQ: 9 }); // dist 9 > 8
    expect(attackContext(out.s, out.a, out.t).legal).toBe(false);
  });

  it('wires AV/DV, hit and critical correctly', () => {
    const { s, a, t } = scene({ targetFacing: 3 }); // baseFP 6, dv 12
    const r = rollAttack(s, a, t);
    expect(r.legal).toBe(true);
    expect(r.av).toBe(r.dice[0] + r.dice[1] + 6);
    expect(r.hit).toBe(r.av >= r.dv);
    expect(r.critical).toBe(r.av >= r.dv + 4);
  });

  it('overwhelming firepower yields a critical hit', () => {
    const { s, a, t } = scene({ targetFacing: 3, attackerFp: 50 });
    const r = rollAttack(s, a, t);
    expect(r.hit).toBe(true);
    expect(r.critical).toBe(true);
  });
});
