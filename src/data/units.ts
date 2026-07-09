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
    counterImage: '/assets/units/German rifles 41.png',
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
    counterImage: '/assets/units/MG34v2.png',
  },
  {
    // Unit List p.38 — "Pioneers Squad" (×3). Notable blue 3 FP (anti-armor / demolition).
    // §18.1: Pioneers may attack with a Flamethrower, enter Mines Hexes without
    // triggering them, and Fire Smoke at a max Range of 1.
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
    hasFlamethrower: true,
    pioneer: true,
    canFireSmoke: true,
  },
  {
    // NON-CANONICAL: Mission 1's "SS Tracker Unit" reinforcement (§4.12,
    // Round 3) — same body/stats as ger-pioneer, but explicitly fielded
    // without its Flamethrower/Smoke/Pioneer-exception kit (mission design
    // choice, not a printed rulebook unit).
    id: 'ger-pioneer-tracker',
    nation: 'germans',
    name: 'SS Tracker Unit',
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
    id: 'ger-pz3h',
    nation: 'germans',
    name: 'Panzer IIIh',
    kind: 'vehicle',
    fp: { red: 3, blue: 8 },
    dr: { front: 17, flank: 15, color: 'blue' },
    move: 1,
    range: 9,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true, // §16.2 — the Pz III's 360° turret can fire outside its Arc for +2AP
    counterImage: '/assets/units/Ger Pz IIIh.png',
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
    // §16.4 Mobile Vehicle: a half-track has a Wheeled (green) Move Cost but
    // carries a Track Bonus Move symbol too (mobileTrackBonusMoves), so it can
    // spend that one to enter Open Terrain / dodge Road Congestion — its Wheel
    // Bonus Move stays Road→Road only.
    id: 'ger-sdkfz251',
    nation: 'germans',
    name: 'SdKfz 251',
    kind: 'vehicle',
    fp: { red: 3, blue: 0 },
    dr: { front: 13, flank: 12, color: 'blue' },
    move: 1,
    range: 5,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    mobileTrackBonusMoves: 1,
    openTopped: true,
    apcTransport: true,
  },
  {
    // Unit List p.38-39 ("PzJg 35R x1", 41-44) — a Czech 47mm gun on a captured
    // French R35 chassis (no turret: a Self-Propelled Gun, §16.3 — must Pivot to
    // Track a Target, which we get for free by leaving `turreted` unset).
    // §16.5's own worked example is THIS unit: "the PzJg 35R has a red 13DR if
    // attacked by a Soviet Rifle unit in CC" — i.e. its Flank DR is 13 (reference/
    // rulebook.txt, the §15.5/2nd-ed numbering for what's now §16.5). The rest of
    // the printed counter's numbers are badly OCR-scrambled (interleaved with a
    // neighboring unit's), so this reconstruction combines that one hard textual
    // fact (Flank DR 13) with a user-confirmed Range of 8, then derives the
    // remaining fields (Attack Cost 4, Move 1, FP 2/7, Front DR 15) from the
    // leftover digit group by elimination — treat those five as best-effort, not
    // verbatim transcription.
    id: 'ger-pzjg35r',
    nation: 'germans',
    name: 'PzJg 35R',
    kind: 'vehicle',
    fp: { red: 2, blue: 7 },
    dr: { front: 15, flank: 13, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    openTopped: true,
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
    counterImage: '/assets/units/sov-rifle.png',
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
    id: 'sov-t34a',
    nation: 'soviets',
    name: 'T-34a m40 Med Tank',
    kind: 'vehicle',
    fp: { red: 5, blue: 7 },
    dr: { front: 19, flank: 15, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true, // §16.2 — the T-34's 360° turret can fire outside its Arc for +2AP
    counterImage: '/assets/units/T34 facing left.png',
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
  {
    // §16.7 Field Gun: crewed, green Wheel Move cost, towable (15.6) rather
    // than self-mobile — the Soviet counterpart to `ger-pak40` (the Unit List
    // caption "AT Gun 45mm x2", reference/rulebook.txt, is clean prose, but
    // the printed counter's own numbers were in the same badly OCR-scrambled
    // block as the PzJg 35R's, so these stats are ours, not transcribed).
    id: 'sov-atgun45',
    nation: 'soviets',
    name: '45mm AT Gun',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 2, blue: 8 },
    dr: { front: 10, flank: 9, color: 'red' },
    move: 1,
    range: 12,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
];

export const ALL_UNIT_TEMPLATES: UnitTemplate[] = [...GERMAN_UNITS, ...SOVIET_UNITS];

/** Templates keyed by id, for quick lookup and for assembling a MissionDef. */
export const UNIT_TEMPLATES: Record<string, UnitTemplate> = Object.fromEntries(
  ALL_UNIT_TEMPLATES.map((t) => [t.id, t]),
);
