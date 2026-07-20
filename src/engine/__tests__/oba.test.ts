/**
 * Off-Board Artillery (§13.4-13.9) — Drift Check + blast Attack resolution.
 * Reproduces rules/13-mortars-and-artillery.md's own worked examples as
 * oracles (this project's established red-box-fixture convention), except
 * the drift direction / destination hex, which our own documented 1-6 to
 * AXIAL_DIRECTIONS convention doesn't claim to reproduce (see cards.ts's
 * `driftDirection` doc comment — the physical marker's own arrow numbering
 * isn't recoverable from the OCR source this build was transcribed from).
 */
import { describe, expect, it } from 'vitest';
import { applyResolvedObaStrike, driftDirection, resolveDriftCheck, resolveObaStrike } from '../cards';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

function gridScene(): GameState {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  for (let q = -4; q <= 4; q++) {
    for (let r = -4; r <= 4; r++) addHex(s, q, r);
  }
  return s;
}

describe('driftDirection — documented 1-6 -> AXIAL_DIRECTIONS convention', () => {
  it('maps roll 1 to index 0 and roll 6 to index 5', () => {
    expect(driftDirection(1)).toBe(0);
    expect(driftDirection(6)).toBe(5);
  });
});

describe('Worked example: Drift Check (§13.7 red box — "Soviets need 4+, roll 3")', () => {
  it('a Soviet (checkNumber=4) rolling a 3 misses and drifts exactly 3 hexes', () => {
    let found: ReturnType<typeof resolveDriftCheck> | null = null;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = gridScene();
      s.rng = { ...s.rng, state: seed };
      const r = resolveDriftCheck(s, 'B', '0,0'); // Side B = soviets in baseState()
      if (!r.hit && r.dice1 === 3) found = r;
    }
    expect(found).not.toBeNull();
    expect(found!.checkNumber).toBe(4);
    expect(found!.driftDistance).toBe(3); // §13.7: drift distance = the failed roll's own value
  });
});

describe('Worked example: full OBA Strike (§13.6-13.9 red box — German Divisional Artillery vs own HMG)', () => {
  it('German (checkNumber=3) rolling a 2 misses and drifts 2 hexes', () => {
    let found: ReturnType<typeof resolveDriftCheck> | null = null;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = gridScene();
      s.rng = { ...s.rng, state: seed };
      const r = resolveDriftCheck(s, 'A', '0,0'); // Side A = germans (§13.7's example targets Hex 4-J08; only the mechanic is reproduced, not that specific label)
      if (!r.hit && r.dice1 === 2) found = r;
    }
    expect(found).not.toBeNull();
    expect(found!.checkNumber).toBe(3);
    expect(found!.driftDistance).toBe(2);
  });

  it("the friendly-fire Attack's Hit Number matches the example (10DR - 5FP = 5), CAP-raised to 7", () => {
    // "The Divisional Artillery card has a red 5 Firepower... 10 Flank Def... 5 Hit Number."
    const s = gridScene();
    const hmg = addUnit(s, 'HMG', 'A', 0, 0, 0);
    s.templates[hmg.templateId] = { ...s.templates[hmg.templateId]!, dr: { front: 12, flank: 10, color: 'red' } };
    // Force the Drift Check to land exactly on the HMG's own hex (a "hit" outcome — checkNumber met).
    let resolution: ReturnType<typeof resolveObaStrike> | null = null;
    for (let seed = 1; seed <= 300 && !resolution; seed++) {
      const s2 = gridScene();
      const hmg2 = addUnit(s2, 'HMG', 'A', 0, 0, 0);
      s2.templates[hmg2.templateId] = { ...s2.templates[hmg2.templateId]!, dr: { front: 12, flank: 10, color: 'red' } };
      s2.rng = { ...s2.rng, state: seed };
      const r = resolveObaStrike(s2, { side: 'A', cardId: 'W06', targetHexId: '0,0' });
      if (r.driftCheck.hit) resolution = r;
    }
    expect(resolution).not.toBeNull();
    const attack = resolution!.attacks.find((a) => a.targetId === 'HMG');
    expect(attack).toBeDefined();
    expect(attack!.ar).toBe(5); // W06's red Firepower (oracle-confirmed, rules/08's Card Catalog)
    expect(attack!.dr).toBe(10);
    expect(attack!.hitNumber).toBe(5); // 10 - 5 - 0

    // Now the SAME scene, CAP-raised by 2 (capMod = -2 raises the Hit Number, protecting the friendly Unit).
    let raised: ReturnType<typeof resolveObaStrike> | null = null;
    for (let seed = 1; seed <= 300 && !raised; seed++) {
      const s3 = gridScene();
      const hmg3 = addUnit(s3, 'HMG', 'A', 0, 0, 0);
      s3.templates[hmg3.templateId] = { ...s3.templates[hmg3.templateId]!, dr: { front: 12, flank: 10, color: 'red' } };
      s3.rng = { ...s3.rng, state: seed };
      const r = resolveObaStrike(s3, { side: 'A', cardId: 'W06', targetHexId: '0,0' }, -2);
      if (r.driftCheck.hit) raised = r;
    }
    expect(raised).not.toBeNull();
    const raisedAttack = raised!.attacks.find((a) => a.targetId === 'HMG');
    expect(raisedAttack!.hitNumber).toBe(7); // matches the rulebook's own CAP-raised example
  });
});

describe('resolveObaStrike blast radius (§13.8: target hex + its 6 neighbors, incl. friendly Units)', () => {
  it('hits units in the marker hex and every adjacent hex, never one further out', () => {
    const s = gridScene();
    addUnit(s, 'CENTER', 'A', 0, 0, 0);
    addUnit(s, 'NEIGHBOR', 'B', 1, 0, 0); // adjacent (SE, per AXIAL_DIRECTIONS index 0)
    addUnit(s, 'FAR', 'B', 3, 0, 0); // 3 hexes away — outside the blast
    // Force an on-target hit (no drift) by scanning for a seed whose first d6 clears the check number.
    let resolution: ReturnType<typeof resolveObaStrike> | null = null;
    for (let seed = 1; seed <= 100 && !resolution; seed++) {
      const s2 = gridScene();
      addUnit(s2, 'CENTER', 'A', 0, 0, 0);
      addUnit(s2, 'NEIGHBOR', 'B', 1, 0, 0);
      addUnit(s2, 'FAR', 'B', 3, 0, 0);
      s2.rng = { ...s2.rng, state: seed };
      const r = resolveObaStrike(s2, { side: 'A', cardId: 'W06', targetHexId: '0,0' });
      if (r.driftCheck.hit) resolution = r;
    }
    expect(resolution).not.toBeNull();
    const ids = resolution!.attacks.map((a) => a.targetId).sort();
    expect(ids).toEqual(['CENTER', 'NEIGHBOR']);
  });

  it('a Hidden Unit is never a valid OBA target', () => {
    const s = gridScene();
    const u = addUnit(s, 'HID', 'B', 0, 0, 0);
    u.hidden = true;
    let resolution: ReturnType<typeof resolveObaStrike> | null = null;
    for (let seed = 1; seed <= 100 && !resolution; seed++) {
      const s2 = gridScene();
      const u2 = addUnit(s2, 'HID', 'B', 0, 0, 0);
      u2.hidden = true;
      s2.rng = { ...s2.rng, state: seed };
      const r = resolveObaStrike(s2, { side: 'A', cardId: 'W06', targetHexId: '0,0' });
      if (r.driftCheck.hit) resolution = r;
    }
    expect(resolution).not.toBeNull();
    expect(resolution!.attacks).toHaveLength(0);
  });
});

describe('applyResolvedObaStrike (state mutation)', () => {
  it('commits the rng, logs the Drift Check and every Attack, and applies Hits', () => {
    const s = gridScene();
    addUnit(s, 'TGT', 'B', 0, 0, 0);
    let resolution: ReturnType<typeof resolveObaStrike> | null = null;
    let seedUsed = 0;
    for (let seed = 1; seed <= 200 && !resolution; seed++) {
      const s2 = gridScene();
      addUnit(s2, 'TGT', 'B', 0, 0, 0);
      s2.rng = { ...s2.rng, state: seed };
      const r = resolveObaStrike(s2, { side: 'A', cardId: 'W06', targetHexId: '0,0' });
      if (r.attacks.some((a) => a.hit)) {
        resolution = r;
        seedUsed = seed;
      }
    }
    expect(resolution).not.toBeNull();
    const s3 = gridScene();
    addUnit(s3, 'TGT', 'B', 0, 0, 0);
    s3.rng = { ...s3.rng, state: seedUsed };
    applyResolvedObaStrike(s3, { side: 'A', cardId: 'W06', targetHexId: '0,0' }, resolution!);
    expect(s3.log.some((e) => e.type === 'oba' && e.text.includes('Drift Check'))).toBe(true);
    expect(s3.log.some((e) => e.type === 'oba' && e.text.includes('OBA Attack on TGT'))).toBe(true);
    const tgt = s3.units['TGT'];
    // Either destroyed (removed) or carries a fresh Hit Marker — either way, the Hit was applied.
    expect(tgt === undefined || tgt.hitMarkers.length > 0).toBe(true);
  });
});
