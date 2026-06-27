/**
 * Range bands and their firepower modifiers (rulebook §7.7).
 * Short (adjacent) +3FP; long (> range, ≤ 2× range) −2FP.
 */
export type RangeBand = 'short' | 'normal' | 'long' | 'out';

export function rangeBand(dist: number, range: number): RangeBand {
  if (dist < 1) return 'out';
  if (dist === 1) return 'short';
  if (dist <= range) return 'normal';
  if (dist <= range * 2) return 'long';
  return 'out';
}

export function fpRangeModifier(band: RangeBand): number {
  if (band === 'short') return 3;
  if (band === 'long') return -2;
  return 0;
}
