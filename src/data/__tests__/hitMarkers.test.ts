import { describe, expect, it } from 'vitest';
import { FOOT_HIT_MARKERS, hitMarkerEffects } from '../hitMarkers';

describe('hitMarkerEffects (§7.5 Soft Target table)', () => {
  it('Stunned: only Rally', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.stunned)).toEqual([
      'Cannot take any Action other than Rally',
      'Rally Number: 7',
    ]);
  });

  it('Pinned: cannot Move or Pivot', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.pinned)).toEqual([
      'Cannot Move or Pivot',
      'Rally Number: 7',
    ]);
  });

  it('Panicked: cannot Attack, front/flank DR split', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.panicked)).toEqual([
      'Cannot Attack',
      'Front Defense -2',
      'Flank Defense +1',
      'Rally Number: 8',
    ]);
  });

  it('Suppressed: attack cost and firepower', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.suppressed)).toEqual([
      'Attack Cost +1 AP',
      'Firepower -2',
      'Rally Number: 7',
    ]);
  });

  it('Cowering: combined +1 Defense', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.cowering)).toEqual([
      'Attack Cost +2 AP',
      'Move / Pivot Cost +1 AP',
      'Range drops to 1',
      'Defense +1',
      'Rally Number: 8',
    ]);
  });

  it('Berserk: Front Def +2, Flank +1 (§7.5)', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.berserk)).toEqual([
      'Attack Cost -1 AP',
      'Firepower +1',
      'Range drops to 1',
      'Front Defense +2',
      'Flank Defense +1',
      'Rally Number: 8',
    ]);
  });

  it('Unnerved: no stat effects, just a Rally Number', () => {
    expect(hitMarkerEffects(FOOT_HIT_MARKERS.unnerved)).toEqual(['Rally Number: 7']);
  });
});
