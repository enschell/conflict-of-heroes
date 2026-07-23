/**
 * §12.3 Elevation Combat Bonus: +1AR if the attacker is on higher ground than
 * the target; +1DR if the target is on higher ground than the attacker.
 */
import { describe, expect, it } from 'vitest';
import { attackContext } from '../combat';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

/** Attacker at (0,0), target at (3,0) facing back toward the attacker (front arc). */
function scene(attackerElev: number, targetElev: number) {
  const s = baseState();
  addTemplate(s, rifleTemplate({ fp: { red: 3, blue: 0 }, range: 4 }));
  addHex(s, 0, 0, 'open', { elevation: attackerElev });
  addHex(s, 1, 0, 'open');
  addHex(s, 2, 0, 'open');
  addHex(s, 3, 0, 'open', { elevation: targetElev });
  const a = addUnit(s, 'A1', 'A', 0, 0, 0); // facing East
  const t = addUnit(s, 'T1', 'B', 3, 0, 3); // facing West, toward the attacker
  return { s, a, t };
}

describe('Elevation Combat Bonus (§12.3)', () => {
  it('gives the attacker +1AR when on higher ground', () => {
    const { s, a, t } = scene(1, 0);
    const ctx = attackContext(s, a, t);
    expect(ctx.ar).toBe(3 + 1); // FP + Elevation Bonus
    expect(ctx.dr).toBe(12); // front DR, unaffected
    expect(ctx.arMods.some((m) => m.section === '§12.3')).toBe(true);
    expect(ctx.drMods.some((m) => m.section === '§12.3')).toBe(false);
  });

  it('gives the target +1DR when on higher ground', () => {
    const { s, a, t } = scene(0, 1);
    const ctx = attackContext(s, a, t);
    expect(ctx.ar).toBe(3); // FP only
    expect(ctx.dr).toBe(12 + 1); // front DR + Elevation Bonus
    expect(ctx.drMods.some((m) => m.section === '§12.3')).toBe(true);
    expect(ctx.arMods.some((m) => m.section === '§12.3')).toBe(false);
  });

  it('gives neither side a bonus when level', () => {
    const { s, a, t } = scene(1, 1);
    const ctx = attackContext(s, a, t);
    expect(ctx.ar).toBe(3);
    expect(ctx.dr).toBe(12);
    expect(ctx.arMods.some((m) => m.section === '§12.3')).toBe(false);
    expect(ctx.drMods.some((m) => m.section === '§12.3')).toBe(false);
  });
});
