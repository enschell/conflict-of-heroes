/**
 * Foot Unit Hit Markers (rulebook §7.5): pile counts, rally numbers, and the
 * stat/ability modifiers each one imposes.
 */
import type { ArmoredHitType, HitMarkerDef, HitType, SoftHitType } from '../engine/types';

export const FOOT_HIT_MARKERS: Record<SoftHitType, HitMarkerDef> = {
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
    frontDrDelta: 2, // §7.5 Soft Target table: Berserk Front Def +2 (Flank +1)
    flankDrDelta: 1,
  },
};

/** Title-case a hit-marker type id, e.g. 'cowering' → 'Cowering'. */
export function markerName(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Human-readable list of a Hit Marker's restrictions and stat effects (§7.5),
 * for display under a Hit Unit. Derived from the marker's own data so the UI
 * always matches the modifiers the engine actually applies. Restrictions (what
 * the Unit may not do) come first, then stat modifiers, then the Rally Number.
 */
export function hitMarkerEffects(def: HitMarkerDef): string[] {
  const lines: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  // What the Unit may not do.
  if (def.killOnDraw) lines.push('Destroyed');
  if (def.onlyRally) lines.push('Can only Rally');
  if (def.cannotMove && def.cannotPivot) lines.push('Cannot Move or Pivot');
  else if (def.cannotMove) lines.push('Cannot Move');
  else if (def.cannotPivot) lines.push('Cannot Pivot');
  if (def.cannotFire) lines.push('Cannot Attack');

  // Stat modifiers.
  if (def.apToFireDelta) lines.push(`Attack Cost ${sign(def.apToFireDelta)} AP`);
  if (def.moveCostDelta) lines.push(`Move / Pivot Cost ${sign(def.moveCostDelta)} AP`);
  if (def.fpRedDelta != null && def.fpRedDelta === def.fpBlueDelta) {
    lines.push(`Firepower ${sign(def.fpRedDelta)}`);
  } else {
    if (def.fpRedDelta) lines.push(`Red Firepower ${sign(def.fpRedDelta)}`);
    if (def.fpBlueDelta) lines.push(`Blue Firepower ${sign(def.fpBlueDelta)}`);
  }
  if (def.rangeOverride != null) lines.push(`Range drops to ${def.rangeOverride}`);
  if (def.frontDrDelta != null && def.frontDrDelta === def.flankDrDelta) {
    lines.push(`Defense ${sign(def.frontDrDelta)}`);
  } else {
    if (def.frontDrDelta) lines.push(`Front Defense ${sign(def.frontDrDelta)}`);
    if (def.flankDrDelta) lines.push(`Flank Defense ${sign(def.flankDrDelta)}`);
  }

  // Rally.
  if (def.rally > 0) lines.push(`Rally Number: ${def.rally}`);
  else if (!def.killOnDraw) lines.push('Cannot Rally');

  return lines;
}

/** Build the starting foot hit-marker pile (type -> count). */
/**
 * Armored Target Hit Markers (§15.13). Same mechanism as the foot deck, with
 * vehicle-specific effects/rally numbers. "No Rally" (physical damage) = rally 0.
 */
export const ARMORED_HIT_MARKERS: Record<ArmoredHitType, HitMarkerDef> = {
  aStunned: { type: 'aStunned', count: 2, rally: 9, onlyRally: true },
  aDestroyed: { type: 'aDestroyed', count: 1, rally: 0, killOnDraw: true },
  aImmobilized: {
    type: 'aImmobilized',
    count: 5,
    rally: 0, // No Rally
    cannotMove: true,
    cannotPivot: true,
    flankDrDelta: 1,
    frontDrDelta: -1,
  },
  aLightDamage: { type: 'aLightDamage', count: 4, rally: 0 }, // No Rally, no stat effect
  aGunDamaged: { type: 'aGunDamaged', count: 2, rally: 0, cannotFire: true }, // No Rally
  aPanicked: { type: 'aPanicked', count: 1, rally: 9, cannotFire: true, frontDrDelta: -4 },
  aSuppressed: {
    type: 'aSuppressed',
    count: 5,
    rally: 8,
    apToFireDelta: 1,
    fpRedDelta: -3,
    fpBlueDelta: -5,
  },
};

/** Every hit marker keyed by type — used to resolve a marker's effects/rally. */
export const HIT_MARKERS: Record<HitType, HitMarkerDef> = {
  ...FOOT_HIT_MARKERS,
  ...ARMORED_HIT_MARKERS,
};

/** A zero-filled pile over every HitType (so every key is always present). */
function emptyPile(): Record<HitType, number> {
  const pile = {} as Record<HitType, number>;
  for (const type of Object.keys(HIT_MARKERS) as HitType[]) pile[type] = 0;
  return pile;
}

/** Build the starting Soft Target (foot) draw pile (type → count). */
export function makeFootHitPile(): Record<HitType, number> {
  const pile = emptyPile();
  for (const def of Object.values(FOOT_HIT_MARKERS)) pile[def.type] = def.count;
  return pile;
}

/** Build the starting Armored Target (vehicle) draw pile (type → count). */
export function makeArmoredHitPile(): Record<HitType, number> {
  const pile = emptyPile();
  for (const def of Object.values(ARMORED_HIT_MARKERS)) pile[def.type] = def.count;
  return pile;
}

/** True for an Armored Target marker (drawn from / returned to the vehicle pile). */
export function isArmoredMarker(type: HitType): boolean {
  return type in ARMORED_HIT_MARKERS;
}
