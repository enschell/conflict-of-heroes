/**
 * AR/DR modifier breakdown (`arMods`/`drMods`): every line item must sum to
 * the same `ar`/`dr` the engine actually uses, and each carries a rule-section
 * citation for the dice-roller UI.
 */
import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import type { Facing } from '../types';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function sum(mods: { value: number }[]): number {
  return mods.reduce((s, m) => s + m.value, 0);
}

function scene(opts: {
  targetFacing: Facing;
  targetQ?: number;
  targetTerrain?: 'open' | 'woodsHeavy';
  attackerFp?: number;
  range?: number;
}) {
  const targetQ = opts.targetQ ?? 1;
  const s = baseState();
  addTemplate(s, rifleTemplate({ fp: { red: opts.attackerFp ?? 3, blue: 0 }, range: opts.range ?? 4 }));
  for (let q = 0; q <= 10; q++) addHex(s, q, 0, q === targetQ ? (opts.targetTerrain ?? 'open') : 'open');
  const a = addUnit(s, 'A1', 'A', 0, 0, 0);
  const t = addUnit(s, 'T1', 'B', targetQ, 0, opts.targetFacing);
  return { s, a, t };
}

describe('AR/DR modifier breakdown (dice-roller detail)', () => {
  it('arMods and drMods always sum to ar/dr', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetQ: 1, targetTerrain: 'woodsHeavy' });
    const ctx = attackContext(s, a, t);
    expect(sum(ctx.arMods)).toBe(ctx.ar);
    expect(sum(ctx.drMods)).toBe(ctx.dr);
  });

  it('cites §6.6 Firepower and §6.7 Short Range Bonus at adjacent range', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetQ: 1 });
    const ctx = attackContext(s, a, t);
    expect(ctx.arMods).toContainEqual({ label: 'Red Firepower', value: 3, section: '§6.6' });
    expect(ctx.arMods).toContainEqual({
      label: 'Short Range Bonus (adjacent)',
      value: 3,
      section: '§6.7',
    });
  });

  it('cites §6.7 Long Range Penalty beyond Range', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetQ: 6 }); // dist 6, range 4
    const ctx = attackContext(s, a, t);
    expect(ctx.arMods).toContainEqual({ label: 'Long Range Penalty', value: -2, section: '§6.7' });
  });

  it('omits the range modifier entirely at normal range (no zero-value clutter)', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetQ: 3 }); // dist 3, range 4
    const ctx = attackContext(s, a, t);
    expect(ctx.arMods.some((m) => m.section === '§6.7')).toBe(false);
  });

  it('cites §6.1 Front Defense vs §6.3 Flank Defense depending on arc', () => {
    const front = scene({ targetFacing: 3 }); // faces attacker → front arc
    expect(attackContext(front.s, front.a, front.t).drMods[0]).toEqual({
      label: 'Front Defense',
      value: 12,
      section: '§6.1',
    });
    const flank = scene({ targetFacing: 0 }); // faces away → flank
    expect(attackContext(flank.s, flank.a, flank.t).drMods[0]).toEqual({
      label: 'Flank Defense',
      value: 11,
      section: '§6.3',
    });
  });

  it('cites §6.4 for a terrain DM', () => {
    const { s, a, t } = scene({ targetFacing: 3, targetTerrain: 'woodsHeavy' });
    const ctx = attackContext(s, a, t);
    expect(ctx.drMods).toContainEqual({ label: 'Woods (Heavy) DM', value: 2, section: '§6.4' });
  });

  it('explains Air Burst zeroing Heavy Woods with a 0-value §13.9 line, not silence', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'mortar', kind: 'mortar', fp: { red: 4, blue: 0 }, range: 8 }));
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsHeavy');
    const a = addUnit(s, 'M', 'A', 0, 0, 0, 'mortar');
    const t = addUnit(s, 'T', 'B', 1, 0, 3);
    const ctx = attackContext(s, a, t);
    expect(ctx.drMods).toContainEqual({
      label: 'Heavy Woods negated by Air Burst',
      value: 0,
      section: '§13.9',
    });
    expect(ctx.drMods.some((m) => m.section === '§6.4')).toBe(false);
  });

  describe('Close Combat (§6.10/§6.11)', () => {
    function ccScene(whiteBoxFp = false) {
      const s = baseState();
      addTemplate(s, rifleTemplate({ id: 'atk', fp: { red: 3, blue: 0 }, whiteBoxFp }));
      addTemplate(s, rifleTemplate({ id: 'def', dr: { front: 12, flank: 11, color: 'red' } }));
      addHex(s, 0, 0);
      const a = addUnit(s, 'A', 'A', 0, 0, 0, 'atk');
      const t = addUnit(s, 'T', 'B', 0, 0, 0, 'def');
      return { s, a, t };
    }

    it('cites §6.10 Close Combat Bonus (+4) for a normal attacker', () => {
      const { s, a, t } = ccScene(false);
      const ctx = closeCombatContext(s, a, t);
      expect(ctx.arMods).toContainEqual({ label: 'Close Combat Bonus', value: 4, section: '§6.10/§6.7' });
      expect(ctx.drMods[0]).toEqual({ label: 'Flank Defense (always, in CC)', value: 11, section: '§6.10' });
      expect(sum(ctx.arMods)).toBe(ctx.ar);
      expect(sum(ctx.drMods)).toBe(ctx.dr);
    });

    it('cites §6.11 Crewed Unit penalty (-2) instead of the +4 bonus', () => {
      const { s, a, t } = ccScene(true);
      const ctx = closeCombatContext(s, a, t);
      expect(ctx.arMods).toContainEqual({ label: 'Crewed Unit penalty in CC', value: -2, section: '§6.11' });
    });

    it('cites §15.14 (0-value) when the target is a Vehicle — no CC terrain bonus', () => {
      const s = baseState();
      addTemplate(s, rifleTemplate({ id: 'atk', fp: { red: 3, blue: 2 } }));
      addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', dr: { front: 12, flank: 10, color: 'blue' } }));
      addHex(s, 0, 0, 'woodsHeavy');
      const a = addUnit(s, 'A', 'A', 0, 0, 0, 'atk');
      const t = addUnit(s, 'V', 'B', 0, 0, 0, 'veh');
      const ctx = closeCombatContext(s, a, t);
      expect(ctx.drMods).toContainEqual({ label: 'No Vehicle terrain bonus in CC', value: 0, section: '§15.14' });
    });

    it('cites §16.5 when Open-Topped flips the target color to red', () => {
      const s = baseState();
      addTemplate(s, rifleTemplate({ id: 'atk', fp: { red: 3, blue: 2 } }));
      addTemplate(
        s,
        rifleTemplate({ id: 'ot', kind: 'vehicle', dr: { front: 12, flank: 10, color: 'blue' }, openTopped: true }),
      );
      addHex(s, 0, 0);
      const a = addUnit(s, 'A', 'A', 0, 0, 0, 'atk');
      const t = addUnit(s, 'V', 'B', 0, 0, 0, 'ot');
      const ctx = closeCombatContext(s, a, t);
      expect(ctx.fpColor).toBe('red');
      expect(ctx.arMods).toContainEqual({
        label: 'Red Firepower (Open-Topped target)',
        value: 3,
        section: '§16.5',
      });
    });
  });
});
