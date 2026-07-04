import { describe, expect, it } from 'vitest';
import { rollAttack } from '../combat';
import { effectiveStats, resolveHit } from '../hits';
import { reduce } from '../reducer';
import { rollRally } from '../rally';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function withMarker(marker: Parameters<typeof addUnit>[7]) {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  const u = addUnit(s, 'U', 'A', 0, 0, 0, 'rifle', marker);
  return effectiveStats(s, u);
}

describe('hit-marker effects (rulebook §7.5)', () => {
  it('suppressed: −2 red FP, +1 AP to fire', () => {
    const eff = withMarker(['suppressed']);
    expect(eff.fp.red).toBe(3 - 2);
    expect(eff.apToFire).toBe(4 + 1);
  });

  it('pinned: cannot move or pivot', () => {
    const eff = withMarker(['pinned']);
    expect(eff.canMove).toBe(false);
    expect(eff.canPivot).toBe(false);
    expect(eff.canFire).toBe(true);
  });

  it('stunned: only rally allowed', () => {
    const eff = withMarker(['stunned']);
    expect(eff.onlyRally).toBe(true);
    expect(eff.canFire).toBe(false);
    expect(eff.canMove).toBe(false);
  });

  it('cowering: range drops to 1, +2 AP to fire, +1 move cost', () => {
    const eff = withMarker(['cowering']);
    expect(eff.range).toBe(1);
    expect(eff.apToFire).toBe(4 + 2);
    expect(eff.move).toBe(1 + 1);
  });

  it('no marker: stats equal the template', () => {
    const eff = withMarker([]);
    expect(eff.fp.red).toBe(3);
    expect(eff.range).toBe(4);
    expect(eff.canFire).toBe(true);
  });

  it('berserk: −1 AP to fire, +1 red/blue FP, range drops to 1, Front DR +2, Flank DR +1', () => {
    // Base template: fp{red:3,blue:0}, dr{front:12,flank:11}, move:1, range:4, apToFire:4.
    const eff = withMarker(['berserk']);
    expect(eff.apToFire).toBe(4 - 1);
    expect(eff.fp.red).toBe(3 + 1);
    expect(eff.fp.blue).toBe(0 + 1);
    expect(eff.range).toBe(1);
    expect(eff.dr.front).toBe(12 + 2);
    expect(eff.dr.flank).toBe(11 + 1);
  });

  it('berserk: Rally Number is 8', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const u = addUnit(s, 'U', 'A', 0, 0, 0, 'rifle', ['berserk']);
    const r = rollRally(s, u);
    expect(r.legal).toBe(true);
    expect(r.target).toBe(8);
  });
});

describe('resolveHit (§7.4/§7.5) — the dice-roller preview must never disagree with the reducer', () => {
  it('a Critical destroys immediately without drawing a marker or advancing the RNG', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const t = addUnit(s, 'T', 'B', 0, 0, 0, 'rifle');
    const res = resolveHit(s, t, true, 'red', s.rng);
    expect(res.outcome).toEqual({ kind: 'destroyed-immediate' });
    expect(res.rng).toEqual(s.rng);
    expect(res.pile).toBeUndefined();
  });

  it('a Unit that already carries a marker is destroyed immediately, no new draw', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const t = addUnit(s, 'T', 'B', 0, 0, 0, 'rifle', ['pinned']);
    const res = resolveHit(s, t, false, 'red', s.rng);
    expect(res.outcome).toEqual({ kind: 'destroyed-immediate' });
    expect(res.rng).toEqual(s.rng);
  });

  it('a fresh Unit draws a marker from the matching-color pile (red → foot, blue → vehicle)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const foot = addUnit(s, 'F', 'B', 0, 0, 0, 'rifle');
    const veh = addUnit(s, 'V', 'B', 0, 0, 0, 'rifle');
    const redRes = resolveHit(s, foot, false, 'red', s.rng);
    expect(redRes.armored).toBe(false);
    expect(['marked', 'destroyed-drawn']).toContain(redRes.outcome.kind);
    const blueRes = resolveHit(s, veh, false, 'blue', s.rng);
    expect(blueRes.armored).toBe(true);
    expect(['marked', 'destroyed-drawn']).toContain(blueRes.outcome.kind);
  });

  it.each([1, 2, 3, 4, 5])(
    'preview via resolveHit exactly matches what a real FIRE Action applies (seed %i)',
    (seed) => {
      const s = baseState(seed);
      // AR = 8 (FP) + 3 (short range) = 11; DR = 12 (front) → Hit# = 1: any
      // 2d6 roll hits (min 2 ≥ 1), but only rolls ≥5 are Critical (1+4) — a
      // guaranteed Hit whose Critical-vs-marker outcome still varies by seed.
      addTemplate(s, rifleTemplate({ fp: { red: 8, blue: 0 }, range: 4 }));
      addHex(s, 0, 0);
      addHex(s, 1, 0);
      const a = addUnit(s, 'A', 'A', 0, 0, 0, 'rifle');
      const t = addUnit(s, 'T', 'B', 1, 0, 3); // faces attacker (front arc)

      // Preview: what the dice-roller shows before the player commits — first
      // the (guaranteed) Hit itself, exactly as store.ts's requestFireRoll
      // does, then the resulting hit-effect from the RNG state right after it.
      const roll = rollAttack(s, a, t);
      expect(roll.hit).toBe(true);
      const preview = resolveHit(s, t, roll.critical, roll.fpColor, roll.rng);

      // Commit: the real Action, from the identical starting state.
      const res = reduce(s, { type: 'FIRE', attackerId: 'A', targetId: 'T' });
      expect(res.events.some((e) => e.type === 'illegal')).toBe(false);

      if (preview.outcome.kind === 'destroyed-drawn' || preview.outcome.kind === 'destroyed-immediate') {
        expect(res.state.units['T']).toBeUndefined();
      } else {
        expect(res.state.units['T']!.hitMarkers).toEqual([preview.outcome.hitType]);
      }
    },
  );
});
