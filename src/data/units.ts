/**
 * Infantry stat templates for the vertical slice, keyed by nation.
 *
 * v3 VALUES: numbers below are the actual *Awakening the Bear* 3rd-edition
 * counter stats, read from the rulebook Unit List (printed p.38) and the
 * unit counters. Stats are facts/ideas (fine to implement); we still render
 * with our own original graphics and never embed Academy Games' art
 * (see CLAUDE.md §10).
 *
 * Counter layout (v3): Attack Cost = top-left; Move Cost = top-right;
 * Firepower red-over-blue = bottom-left; Range = bottom-center (yellow);
 * Defense flank-over-front = bottom-right. Crew-served weapons show their
 * Firepower on a white field → `whiteBoxFp: true` (−2 AR in close combat, 6.11).
 *
 * Fields (see UnitTemplate): fp{red,blue}, dr{front,flank,color:'red'=soft},
 * move (AP/hex), range, apToFire (Attack Cost), vp (to opponent on
 * destruction — OUR scenario value, not a counter stat), unburdened (move ≤ 2).
 */
import type { UnitTemplate } from '../engine/types';

export const GERMAN_UNITS: UnitTemplate[] = [
  {
    // Unit List p.38 — "Rifles Squad '41" (×8). Red 2 FP; the squad's MG34 is a separate counter.
    id: 'ger-rifle',
    nation: 'germans',
    name: "Rifles Squad '41",
    kind: 'infantry',
    fp: { red: 2, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 5,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    // Unit List p.38 — "MG34 - Belt Fed" (×7). Crew-served.
    id: 'ger-lmg',
    nation: 'germans',
    name: 'MG34 (Belt-Fed)',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 1,
    range: 9,
    apToFire: 2,
    vp: 2,
    unburdened: true,
  },
  {
    // Unit List p.38 — "Pioneers Squad" (×3). Notable blue 3 FP (anti-armor / demolition).
    id: 'ger-pioneer',
    nation: 'germans',
    name: 'Pioneers Squad',
    kind: 'infantry',
    fp: { red: 4, blue: 3 },
    dr: { front: 12, flank: 12, color: 'red' },
    move: 1,
    range: 3,
    apToFire: 2,
    vp: 2,
    unburdened: true,
  },
  {
    // Unit List p.38 — "HMG34" (×2). Tripod MG: long range, move 2. Crew-served.
    id: 'ger-hmg',
    nation: 'germans',
    name: 'HMG34',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 5, blue: 1 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 2,
    range: 12,
    apToFire: 2,
    vp: 2,
    unburdened: true,
  },
  {
    // NON-CANONICAL: AtB has no standalone German SMG squad (SMGs fold into the
    // Rifles squad). Kept as a custom unit; not placed in Mission 1. Stats are ours.
    id: 'ger-smg',
    nation: 'germans',
    name: 'SMG (custom)',
    kind: 'infantry',
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 2,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    // M6 vehicle (Armored Target, blue Defense). Stats are ours; movement
    // bonus-move / wheeled-tracked fields arrive with the vehicle-movement step.
    id: 'ger-pz3',
    nation: 'germans',
    name: 'Panzer III',
    kind: 'vehicle',
    fp: { red: 4, blue: 8 },
    dr: { front: 16, flank: 13, color: 'blue' },
    move: 2,
    range: 12,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true, // §16.2 — the Pz III's 360° turret can fire outside its Arc for +2AP
  },
  {
    // §16.7 Field Gun: crewed, towable (15.6) rather than self-mobile; green
    // Wheel Move cost. Stats are ours.
    id: 'ger-pak40',
    nation: 'germans',
    name: 'PaK 40',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 2, blue: 9 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 14,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // M7 (§13, §14): 8cm Granatwerfer 34. Crew-served (whiteBoxFp: −2AR in CC,
    // §13.1). Direct Attack Cost = `apToFire`; Indirect = `indirectApToFire`.
    // Min Range 2 (§13.1/§13.2). Stats are ours — the printed rulebook table
    // (rules/13, p.25) was OCR-garbled beyond reliable transcription.
    id: 'ger-mortar',
    nation: 'germans',
    name: '8cm Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 4, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 12,
    minRange: 2,
    apToFire: 3,
    indirectApToFire: 4,
    vp: 2,
    unburdened: false,
    canFireSmoke: true,
  },
  {
    // §16.5/§16.6 Open-Topped APC: transports a foot Unit with +2DR (apcTransport),
    // but its own open top pulls a Soft Target marker vs red-FP Close Combat.
    id: 'ger-sdkfz251',
    nation: 'germans',
    name: 'SdKfz 251',
    kind: 'vehicle',
    fp: { red: 3, blue: 1 },
    dr: { front: 11, flank: 10, color: 'blue' },
    move: 1,
    range: 6,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    apcTransport: true,
  },
];

export const SOVIET_UNITS: UnitTemplate[] = [
  {
    // Unit List p.38 — "Rifles '41 Squad" (×12). Greater FP than German rifles (3 vs 2).
    id: 'sov-rifle',
    nation: 'soviets',
    name: "Rifles '41 Squad",
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 5,
    apToFire: 4,
    vp: 1,
    unburdened: true,
  },
  {
    // Unit List p.38 — "SMG/Rifles Squad" (×4).
    id: 'sov-smg',
    nation: 'soviets',
    name: 'SMG/Rifles Squad',
    kind: 'infantry',
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 3,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    // Unit List p.38 — "MMG Maxim Squad" (×3). Crew-served.
    id: 'sov-maxim',
    nation: 'soviets',
    name: 'MMG Maxim Squad',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 2,
    range: 9,
    apToFire: 3,
    vp: 2,
    unburdened: true,
  },
  {
    // No "Partisan" counter exists in AtB. Mapped to the "NKVD Squad" (×3, p.38) —
    // security troops fit hamlet defenders. Swap to Rifles '41 stats if preferred.
    id: 'sov-partisan',
    nation: 'soviets',
    name: 'Partisans (NKVD stats)',
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 13, flank: 11, color: 'red' },
    move: 1,
    range: 5,
    apToFire: 4,
    vp: 1,
    unburdened: true,
  },
  {
    // M6 vehicle (Armored Target, blue Defense). Stats are ours; movement
    // bonus-move / wheeled-tracked fields arrive with the vehicle-movement step.
    id: 'sov-t34',
    nation: 'soviets',
    name: 'T-34',
    kind: 'vehicle',
    fp: { red: 5, blue: 10 },
    dr: { front: 18, flank: 15, color: 'blue' },
    move: 1,
    range: 15,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true, // §16.2 — the T-34's 360° turret can fire outside its Arc for +2AP
  },
  {
    // M7 (§13, §14): 82mm mortar. Crew-served (whiteBoxFp: −2AR in CC, §13.1).
    // Stats are ours — see the ger-mortar note above.
    id: 'sov-mortar',
    nation: 'soviets',
    name: '82mm Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 5, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 14,
    minRange: 2,
    apToFire: 3,
    indirectApToFire: 4,
    vp: 2,
    unburdened: false,
    canFireSmoke: true,
  },
  {
    // §16.1 Truck: Wheeled, cannot control a Hex, destroyed doesn't reduce CAPs
    // (still counts for VP), and may only attack in Close Combat.
    id: 'sov-truck',
    nation: 'soviets',
    name: 'GAZ-AA Truck',
    kind: 'vehicle',
    fp: { red: 0, blue: 0 },
    dr: { front: 8, flank: 7, color: 'blue' },
    move: 1,
    range: 0,
    apToFire: 2,
    vp: 1,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    attackMode: 'closeCombatOnly',
    cannotControlHex: true,
    noCapLossOnDestroy: true,
  },
];

export const ALL_UNIT_TEMPLATES: UnitTemplate[] = [...GERMAN_UNITS, ...SOVIET_UNITS];

/** Templates keyed by id, for quick lookup and for assembling a MissionDef. */
export const UNIT_TEMPLATES: Record<string, UnitTemplate> = Object.fromEntries(
  ALL_UNIT_TEMPLATES.map((t) => [t.id, t]),
);
