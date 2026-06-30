import { describe, expect, it } from 'vitest';
import {
  ARMORED_HIT_MARKERS,
  HIT_MARKERS,
  hitMarkerEffects,
  isArmoredMarker,
  makeArmoredHitPile,
  makeFootHitPile,
} from '../../data/hitMarkers';
import { effectiveStats } from '../hits';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { HitPile } from '../types';

const total = (pile: HitPile) => Object.values(pile).reduce((a, b) => a + b, 0);

/** A blue-Defense (Armored Target) vehicle template. */
const tank = (over = {}) =>
  rifleTemplate({ id: 'tank', name: 'Tank', kind: 'vehicle', dr: { front: 12, flank: 10, color: 'blue' }, vp: 3, ...over });

describe('Armored Target hit deck (§15.13)', () => {
  it('has the documented marker counts (20 total) distinct from the foot deck', () => {
    const pile = makeArmoredHitPile();
    expect(pile.aStunned).toBe(2);
    expect(pile.aDestroyed).toBe(1);
    expect(pile.aImmobilized).toBe(5);
    expect(pile.aLightDamage).toBe(4);
    expect(pile.aGunDamaged).toBe(2);
    expect(pile.aPanicked).toBe(1);
    expect(pile.aSuppressed).toBe(5);
    expect(total(pile)).toBe(20);
    // No foot markers in the armored pile (and vice versa).
    expect(pile.pinned).toBe(0);
    expect(makeFootHitPile().aImmobilized).toBe(0);
  });

  it('isArmoredMarker distinguishes the decks', () => {
    expect(isArmoredMarker('aImmobilized')).toBe(true);
    expect(isArmoredMarker('pinned')).toBe(false);
  });

  it('effectiveStats applies armored marker effects', () => {
    const s = baseState();
    addTemplate(s, tank());
    addHex(s, 0, 0);
    const immob = addUnit(s, 'V', 'A', 0, 0, 0, 'tank');
    immob.hitMarkers = ['aImmobilized'];
    const e1 = effectiveStats(s, immob);
    expect(e1.canMove).toBe(false);
    expect(e1.canPivot).toBe(false);
    expect(e1.dr.flank).toBe(10 + 1);
    expect(e1.dr.front).toBe(12 - 1);

    immob.hitMarkers = ['aGunDamaged'];
    expect(effectiveStats(s, immob).canFire).toBe(false);

    immob.hitMarkers = ['aSuppressed'];
    const e3 = effectiveStats(s, immob);
    expect(e3.apToFire).toBe(rifleTemplate().apToFire + 1);
    expect(e3.fp.blue).toBe(0 - 5);
  });

  it('renders armored effect text for the inspector', () => {
    expect(hitMarkerEffects(ARMORED_HIT_MARKERS.aImmobilized)).toEqual([
      'Cannot Move or Pivot',
      'Front Defense -1',
      'Flank Defense +1',
      'Cannot Rally',
    ]);
    expect(hitMarkerEffects(ARMORED_HIT_MARKERS.aGunDamaged)).toEqual([
      'Cannot Attack',
      'Cannot Rally',
    ]);
  });
});

describe('hits route to the deck matching the target armor', () => {
  /** Adjacent shooter vs a target; AR tuned to land non-crit hits frequently. */
  function scene(seed: number, armoredTarget: boolean) {
    const s = baseState(seed);
    addTemplate(s, rifleTemplate({ fp: { red: 4, blue: 4 } }));
    if (armoredTarget) addTemplate(s, tank());
    else addTemplate(s, rifleTemplate({ id: 'foot', dr: { front: 12, flank: 11, color: 'red' } }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle'); // faces E toward (1,0)
    addUnit(s, 'T1', 'B', 1, 0, 0, armoredTarget ? 'tank' : 'foot'); // faces E (flank to attacker)
    return s;
  }

  it('an Armored Target draws from the vehicle pile; the foot pile is untouched', () => {
    let sawHit = false;
    for (let seed = 1; seed <= 60; seed++) {
      const s = scene(seed, true);
      const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'T1' });
      const t = res.state.units['T1'];
      if (!t || t.hitMarkers.length !== 1) continue; // miss or crit-kill
      sawHit = true;
      expect(isArmoredMarker(t.hitMarkers[0]!)).toBe(true);
      expect(HIT_MARKERS[t.hitMarkers[0]!].type).toBe(t.hitMarkers[0]); // self-describing
      expect(total(res.state.hitPiles.vehicle)).toBe(20 - 1); // drew one armored marker
      expect(total(res.state.hitPiles.foot)).toBe(20); // foot deck untouched
    }
    expect(sawHit).toBe(true);
  });

  it('a Soft Target draws from the foot pile; the vehicle pile is untouched', () => {
    let sawHit = false;
    for (let seed = 1; seed <= 60; seed++) {
      const s = scene(seed, false);
      const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'T1' });
      const t = res.state.units['T1'];
      if (!t || t.hitMarkers.length !== 1) continue;
      sawHit = true;
      expect(isArmoredMarker(t.hitMarkers[0]!)).toBe(false);
      expect(total(res.state.hitPiles.foot)).toBe(20 - 1);
      expect(total(res.state.hitPiles.vehicle)).toBe(20);
    }
    expect(sawHit).toBe(true);
  });
});
