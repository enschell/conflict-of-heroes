/**
 * Foot Unit Hit Markers (rulebook §7.5): pile counts, rally numbers, and the
 * stat/ability modifiers each one imposes.
 */
import type { HitMarkerDef, HitType } from '../engine/types';

export const FOOT_HIT_MARKERS: Record<HitType, HitMarkerDef> = {
  stunned: { type: 'stunned', count: 2, rally: 7, onlyRally: true },
  unnerved: { type: 'unnerved', count: 2, rally: 7 },
  kia: { type: 'kia', count: 1, rally: 0, killOnDraw: true },
  pinned: { type: 'pinned', count: 5, rally: 7, cannotMove: true, cannotPivot: true },
  panicked: {
    type: 'panicked',
    count: 2,
    rally: 8,
    cannotFire: true,
    frontDrDelta: -2,
    flankDrDelta: 1,
  },
  suppressed: {
    type: 'suppressed',
    count: 5,
    rally: 7,
    apToFireDelta: 1,
    fpRedDelta: -2,
    fpBlueDelta: -2,
  },
  cowering: {
    type: 'cowering',
    count: 2,
    rally: 8,
    apToFireDelta: 2,
    moveCostDelta: 1,
    rangeOverride: 1,
    frontDrDelta: 1,
    flankDrDelta: 1,
  },
  berserk: {
    type: 'berserk',
    count: 1,
    rally: 8,
    apToFireDelta: -1,
    fpRedDelta: 1,
    fpBlueDelta: 1,
    rangeOverride: 1,
    frontDrDelta: 1,
    flankDrDelta: 1,
  },
};

/** Build the starting foot hit-marker pile (type -> count). */
export function makeFootHitPile(): Record<HitType, number> {
  const pile = {} as Record<HitType, number>;
  for (const def of Object.values(FOOT_HIT_MARKERS)) pile[def.type] = def.count;
  return pile;
}
