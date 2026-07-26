/**
 * Range bands and their firepower modifiers (rulebook §7.7).
 * Short (adjacent) +3FP; long (> range, ≤ 2× range) −2FP.
 */
export type RangeBand = 'short' | 'normal' | 'long' | 'out';

/**
 * `capped` (a hit marker's `rangeOverride`, e.g. Cowering/Berserk §7.7) skips
 * the normal ×2 "long range" extension — the overridden Range IS the limit,
 * not a new baseline to double. See `EffectiveStats.rangeCapped`'s own
 * comment for the real bug this fixes.
 */
export function rangeBand(dist: number, range: number, capped = false): RangeBand {
  if (dist < 1) return 'out';
  if (dist === 1) return 'short';
  if (dist <= range) return 'normal';
  if (!capped && dist <= range * 2) return 'long';
  return 'out';
}

export function fpRangeModifier(band: RangeBand): number {
  if (band === 'short') return 3;
  if (band === 'long') return -2;
  return 0;
}
