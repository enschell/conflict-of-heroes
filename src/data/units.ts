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
    fp: { red: 3, blue: 2 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 3,
    range: 16,
    minRange: 3,
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

  // ---------------------------------------------------------------------
  // Storms of Steel 3rd Edition Unit List (docs/SoS3 Rulebook v70 single
  // pages.pdf, p.38 — a different CoH game/edition than the Unit List
  // above). Transcribed directly off the printed counters (high-DPI
  // render + crop, not bulk OCR) — Attack Cost/Move top corners, red-over
  // -blue FP bottom-left (white box = crew-served, §7.7.3/whiteBoxFp),
  // Range in the cross/star icon, flank-over-front DR bottom-right (a red
  // outline around the DR box = Open-Topped on that card). Units already
  // covered by an existing template above (by name) were intentionally
  // NOT duplicated here, even where this page's numbers differ somewhat
  // from the existing entry — see the CLAUDE.md handoff note for the
  // list of skipped duplicates and their discrepancies. `turreted` is
  // inferred from the vehicle having a real rotating turret (not itself
  // printed on the card — nothing on these cards visually distinguishes
  // turreted from casemate mounts); `vp` is our own scenario value per
  // field convention, not a counter stat.
  {
    // p.38 "Panzer Engineer Squad" (×3), 43-45. Flamethrower badge on the
    // counter (assault/demolition unit, "similar to Pioneers").
    id: 'ger-panzer-engineer',
    nation: 'germans',
    name: 'Panzer Engineer Squad',
    kind: 'infantry',
    fp: { red: 4, blue: 2 },
    dr: { front: 13, flank: 12, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 3,
    vp: 2,
    unburdened: true,
    hasFlamethrower: true,
    counterImage: '/assets/units/ger-panzer-engineer.png',
  },
  {
    // p.38 "Infantry Squad '43" (×9), 43-44.
    id: 'ger-infantry-43',
    nation: 'germans',
    name: "Infantry Squad '43",
    kind: 'infantry',
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 1,
    unburdened: true,
    counterImage: '/assets/units/ger-infantry-43.png',
  },
  {
    // p.38 "Panzer Grenadier Squad" (×9), 43-45.
    id: 'ger-panzer-grenadier',
    nation: 'germans',
    name: 'Panzer Grenadier Squad',
    kind: 'infantry',
    fp: { red: 5, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 2,
    unburdened: true,
    counterImage: '/assets/units/ger-panzer-grenadier.png',
  },
  {
    // p.38 "Sniper Squad" (×2), 41-45.
    id: 'ger-sniper',
    nation: 'germans',
    name: 'Sniper Squad',
    kind: 'infantry',
    whiteBoxFp: true,
    fp: { red: 2, blue: 2 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 1,
    range: 10,
    apToFire: 4,
    vp: 2,
    unburdened: true,
    counterImage: '/assets/units/ger-sniper.png',
  },
  {
    // p.38 "PaK38 5cm AT Gun" (×1), 41-45.
    id: 'ger-pak38',
    nation: 'germans',
    name: 'PaK 38',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 3, blue: 8 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 4,
    range: 10,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    counterImage: '/assets/units/ger-pak38.png',
  },
  {
    // p.38 "Maultier" (×2), 39-45. Unarmed supply half-track (printed FP
    // is negative/blank on the card — no attack capability at all).
    id: 'ger-maultier',
    nation: 'germans',
    name: 'Maultier',
    kind: 'vehicle',
    fp: { red: 0, blue: 0 },
    dr: { front: 11, flank: 11, color: 'red' },
    move: 3,
    range: 0,
    apToFire: 3,
    vp: 1,
    unburdened: false,
    propulsion: 'wheeled',
    attackMode: 'none',
    cannotControlHex: true,
    noCapLossOnDestroy: true,
    counterImage: '/assets/units/ger-maultier.png',
  },
  {
    // p.38 "SdKfz 251/2" (×2), 40-45. Half-track-mounted 8cm mortar.
    // ENGINE LIMITATION: `kind` is mutually exclusive between 'vehicle'
    // (movement.ts's propulsion/Bonus-Move rules) and 'mortar'
    // (actions.ts's INDIRECT_FIRE offer + combat.ts's HE-always-Flank) —
    // modeled here as 'vehicle' to keep its half-track mobility, so it
    // fires its mortar as a normal Direct-Fire FIRE Attack only (no
    // Indirect Fire/HE-Flank) until the engine supports both at once.
    id: 'ger-sdkfz251-2',
    nation: 'germans',
    name: 'SdKfz 251/2 (8cm Mortar)',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 3, blue: 2 },
    dr: { front: 13, flank: 12, color: 'blue' },
    move: 1,
    range: 16,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    counterImage: '/assets/units/ger-sdkfz251-2.png',
  },
  {
    // p.38 "SdKfz 251/9" (×2), 42-45. Half-track-mounted 7.5cm support gun.
    id: 'ger-sdkfz251-9',
    nation: 'germans',
    name: 'SdKfz 251/9',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 5, blue: 3 },
    dr: { front: 13, flank: 12, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    counterImage: '/assets/units/ger-sdkfz251-9.png',
  },
  {
    // p.38 "SdKfz 251/10" (×2), 39-43. Half-track-mounted 3.7cm PaK.
    id: 'ger-sdkfz251-10',
    nation: 'germans',
    name: 'SdKfz 251/10',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 2, blue: 5 },
    dr: { front: 13, flank: 12, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    counterImage: '/assets/units/ger-sdkfz251-10.png',
  },
  {
    // p.38 "SdKfz 251/17" (×1), 39-45. Half-track-mounted 2cm Flak (AA
    // capability not modeled — used here purely as a ground-fire vehicle).
    id: 'ger-sdkfz251-17',
    nation: 'germans',
    name: 'SdKfz 251/17 (2cm Flak)',
    kind: 'vehicle',
    fp: { red: 4, blue: 4 },
    dr: { front: 13, flank: 11, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    counterImage: '/assets/units/ger-sdkfz251-17.png',
  },
  {
    // p.38 "Panzer IIf" (×1), 40-43. 2cm L55 autocannon recon tank.
    id: 'ger-pz2f',
    nation: 'germans',
    name: 'Panzer IIf',
    kind: 'vehicle',
    fp: { red: 4, blue: 4 },
    dr: { front: 15, flank: 12, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-pz2f.png',
  },
  {
    // p.38 "Panzer IIIL" (×5), 42-43. 5cm L60 gun.
    id: 'ger-pz3l',
    nation: 'germans',
    name: 'Panzer IIIL',
    kind: 'vehicle',
    fp: { red: 4, blue: 9 },
    dr: { front: 17, flank: 14, color: 'blue' },
    move: 1,
    range: 10,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-pz3l.png',
  },
  {
    // p.38 "Panzer IIIm Flamm" (×1), 43-44. Twin flame projectors through
    // the main-gun barrels (bunker-busting flame tank).
    id: 'ger-pz3m-flamm',
    nation: 'germans',
    name: 'Panzer IIIm Flamm',
    kind: 'vehicle',
    fp: { red: 4, blue: 1 },
    dr: { front: 17, flank: 15, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    hasFlamethrower: true,
    counterImage: '/assets/units/ger-pz3m-flamm.png',
  },
  {
    // p.38 "Panzer IIIn" (×1), 43-45. 7.5cm L24 infantry-support gun (a
    // PzIII rearmed similarly to the PzIVe).
    id: 'ger-pz3n',
    nation: 'germans',
    name: 'Panzer IIIn',
    kind: 'vehicle',
    fp: { red: 5, blue: 5 },
    dr: { front: 17, flank: 15, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-pz3n.png',
  },
  {
    // p.38 "Panzer IVe" (×1), 39-43. 7.5cm L24. The printed counter's Range
    // icon was blank on this card (and PzIVf2/PzIVh below) — genuinely
    // missing from the source page, not an OCR miss (confirmed at 4x zoom).
    // Range 7 confirmed correct by the user against the physical rulebook.
    id: 'ger-pz4e',
    nation: 'germans',
    name: 'Panzer IVe',
    kind: 'vehicle',
    fp: { red: 5, blue: 3 },
    dr: { front: 16, flank: 14, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    // §14.1: this Mission's own missionInstructions.A calls out "the PzIVe
    // Tank, like the Pioneers, may fire Smoke" — the template was missing
    // the flag that actually grants it (kind-agnostic in actions.ts, so no
    // other change is needed for a Vehicle to use it at its normal Range).
    canFireSmoke: true,
    counterImage: '/assets/units/ger-pz4e.png',
  },
  {
    // p.38 "Panzer IVf2" (×1), 42-43. 7.5cm L43. Range icon blank on the
    // source card — see PzIVe's note above; corrected by the user against
    // the physical rulebook.
    id: 'ger-pz4f2',
    nation: 'germans',
    name: 'Panzer IVf2',
    kind: 'vehicle',
    fp: { red: 5, blue: 11 },
    dr: { front: 17, flank: 14, color: 'blue' },
    move: 1,
    range: 11,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-pz4f2.png',
  },
  {
    // p.38 "Panzer IVh" (×4), 43-45. 7.5cm L48.
    // TODO(unverified): Range icon blank on the source card — see PzIVe's
    // note above. Placeholder of 16 matches StuG IIIg (also L48).
    id: 'ger-pz4h',
    nation: 'germans',
    name: 'Panzer IVh',
    kind: 'vehicle',
    fp: { red: 5, blue: 11 },
    dr: { front: 18, flank: 15, color: 'blue' },
    move: 1,
    range: 16,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-pz4h.png',
  },
  {
    // p.38 "Panther D" (×5), 43-44. 7.5cm L70.
    id: 'ger-panther-d',
    nation: 'germans',
    name: 'Panther D',
    kind: 'vehicle',
    fp: { red: 5, blue: 13 },
    dr: { front: 21, flank: 16, color: 'blue' },
    move: 1,
    range: 19,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-panther-d.png',
  },
  {
    // p.38 "Tiger 1e" (×4), 42-44. 8.8cm L56.
    id: 'ger-tiger-1e',
    nation: 'germans',
    name: 'Tiger 1e',
    kind: 'vehicle',
    fp: { red: 5, blue: 12 },
    dr: { front: 21, flank: 19, color: 'blue' },
    move: 1,
    range: 18,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/ger-tiger-1e.png',
  },
  {
    // p.38 "T-34b Captured Tank" (×2), 39-43. A German-crewed captured
    // Soviet T-34b, radio-equipped.
    id: 'ger-t34b-captured',
    nation: 'germans',
    name: 'T-34b (Captured)',
    kind: 'vehicle',
    fp: { red: 5, blue: 8 },
    dr: { front: 18, flank: 15, color: 'blue' },
    move: 1,
    range: 9,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true,
    counterImage: '/assets/units/ger-t34b-captured.png',
  },
  {
    // p.38 "StuG IIIg" (×3), 39-43. Casemate SPG, 7.5cm L48, no turret.
    id: 'ger-stug-iiig',
    nation: 'germans',
    name: 'StuG IIIg',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 4, blue: 11 },
    dr: { front: 20, flank: 15, color: 'blue' },
    move: 1,
    range: 16,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    counterImage: '/assets/units/ger-stug-iiig.png',
  },
  {
    // p.38 "Marder IIc" (×1), 42-43. PaK40 on a Panzer II hull.
    id: 'ger-marder-iic',
    nation: 'germans',
    name: 'Marder IIc',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 3, blue: 11 },
    dr: { front: 16, flank: 12, color: 'blue' },
    move: 1,
    range: 17,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
    counterImage: '/assets/units/ger-marder-iic.png',
  },
  {
    // p.38 "Marder IIIh" (×1), 42-43. PaK40 on a Panzer 38(t) hull.
    id: 'ger-marder-iiih',
    nation: 'germans',
    name: 'Marder IIIh',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 3, blue: 11 },
    dr: { front: 15, flank: 12, color: 'blue' },
    move: 1,
    range: 18,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
    counterImage: '/assets/units/ger-marder-iiih.png',
  },
  {
    // p.38 "Marder IIIm" (×1), 43-45. PaK40 mounted on the hull rear.
    id: 'ger-marder-iiim',
    nation: 'germans',
    name: 'Marder IIIm',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 3, blue: 11 },
    dr: { front: 14, flank: 13, color: 'blue' },
    move: 1,
    range: 18,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
    counterImage: '/assets/units/ger-marder-iiim.png',
  },

  // ---------------------------------------------------------------------
  // Awakening the Bear Rulebook v65 Unit List (reference/Awakening the Bear
  // Rulebook v65.pdf, p.39 -- "Units in Awakening the Bear 3rd Edition").
  // Originally authored by analogy (no PDF-to-image tool was available to
  // transcribe the printed counters directly) -- the user has since checked
  // every one of these against the physical rulebook/counters and corrected
  // the stats below; only ger-pz4h above (a pre-existing entry, not part of
  // this batch) remains an unconfirmed placeholder.
  {
    // p.39 "Mortar 5cm" (×2), 39-42. Analogy: German counterpart of the already-
    // verified sov-mortar-50mm (same weapon class, weaker profile than the
    // German 8cm Mortar it was "later supplanted" by).
    id: 'ger-mortar-5cm',
    nation: 'germans',
    name: '5cm Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 2, blue: 0 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 1,
    range: 10,
    minRange: 2,
    apToFire: 3,
    vp: 1,
    unburdened: false,
  },
  {
    // p.39 "Tank Hunters" (×1), 39-42. A 2-man anti-tank assault team (bundled
    // grenades/mines). Analogy: a smaller, more specialized cousin of Pioneers
    // Squad (blue FP for anti-armor work), scaled down.
    id: 'ger-tank-hunter',
    nation: 'germans',
    name: 'Tank Hunter',
    kind: 'infantry',
    fp: { red: 1, blue: 3 },
    dr: { front: 13, flank: 11, color: 'red' },
    move: 1,
    range: 1,
    apToFire: 4,
    vp: 1,
    unburdened: true,
  },
  {
    // p.39 "7.5cm Inf Gun" (×2), 39-45 ("7,5 LeIG 18"). Light infantry-support
    // gun, HE vs soft targets only. Analogy: the Soviet 76mm Inf Gun's role
    // (soft-target support gun), German crew-served DR baseline.
    id: 'ger-leig18',
    nation: 'germans',
    name: '7.5cm Inf Gun (LeIG 18)',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 5, blue: 0 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 4,
    range: 25,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "PaK36" (×2), 39-42 ("3,7 PaK36"). Early-war 3.7cm AT gun, famously
    // outmatched by the T-34/KV-1. Analogy: weaker than PaK38 (which replaced
    // it), same wheeled/crew-served profile.
    id: 'ger-pak36',
    nation: 'germans',
    name: 'PaK 36',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 2, blue: 5 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 3,
    range: 5,
    apToFire: 2,
    vp: 1,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "7.62cm FK 297" (×1), 41-43. A captured, un-modified Soviet F-22 gun
    // repurposed by the Germans to stop the T-34/KV-1. Analogy: between PaK38
    // and PaK40's anti-tank punch; see sov-f22-76mm below — the same physical
    // gun, different crew (kept deliberately close but not identical, matching
    // this catalog's own T-34-captured precedent).
    id: 'ger-fk297',
    nation: 'germans',
    name: '7.62cm FK 297',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 5, blue: 7 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 6,
    range: 9,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "FlaK18 88mm" (×1), 39-45. The legendary "88" — "could penetrate any
    // armor." Analogy: the single most powerful German gun in this catalog,
    // deliberately given the highest blue FP/range of any German entry
    // (exceeding even PaK40/Marder-series AT guns).
    id: 'ger-flak18-88mm',
    nation: 'germans',
    name: 'FlaK18 88mm',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 6, blue: 12 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 7,
    range: 19,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "Wagons" (×3), 39-45. Unarmed horse-drawn supply wagon. Analogy:
    // ger-maultier's unarmed-supply-vehicle profile (attackMode 'none', no CAP
    // loss on destruction), but slower (horse- not motor-drawn).
    id: 'ger-wagon',
    nation: 'germans',
    name: 'Wagon',
    kind: 'vehicle',
    fp: { red: 0, blue: 0 },
    dr: { front: 11, flank: 11, color: 'red' },
    move: 1,
    range: 0,
    apToFire: 3,
    vp: 1,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    attackMode: 'none',
    cannotControlHex: true,
    noCapLossOnDestroy: true,
  },
  {
    // p.39 "Truck/Opel" (×2), 39-45 ("Opel Blitz"). Unarmed supply truck.
    // Analogy: sov-truck's GAZ-AA profile (closeCombatOnly attack mode, no CAP
    // loss), the motorized counterpart to Wagons above.
    id: 'ger-truck-opel',
    nation: 'germans',
    name: 'Truck (Opel Blitz)',
    kind: 'vehicle',
    fp: { red: -2, blue: -1 },
    dr: { front: 11, flank: 11, color: 'red' },
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
    // p.39 "Protze PaK36" (×1), 41-42 ("Protze 36"). A PaK36 3.7cm AT gun
    // mounted directly on a truck for mobility. Analogy: ger-pak36's gun stats
    // above, now self-propelled/open-topped like the Marder series.
    id: 'ger-protze-pak36',
    nation: 'germans',
    name: 'Protze PaK36',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 2, blue: 5 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 1,
    range: 5,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    mobileTrackBonusMoves: 1,
    openTopped: true,
  },
  {
    // p.39 "SkKfz 232L" (×1), 39-45 ("SdKfz 232L"). Heavy 8-wheel recon car with
    // a 2cm L55 autocannon (spaced-armor front shield). Analogy: Panzer IIf's
    // firepower (same 2cm L55 autocannon), lighter than a tracked vehicle's DR
    // (wheeled recon car).
    id: 'ger-sdkfz232l',
    nation: 'germans',
    name: 'SdKfz 232L',
    kind: 'vehicle',
    fp: { red: 4, blue: 4 },
    dr: { front: 14, flank: 11, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 2,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    mobileTrackBonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "DeMag D7" (×1), 41-42 ("Demag 38"). A standard PaK38 5cm AT gun on a
    // light half-track chassis. Analogy: ger-pak38's gun stats, now self-
    // propelled/open-topped (half-track chassis, sometimes with improvised front
    // armor per the flavor text).
    id: 'ger-demag-d7',
    nation: 'germans',
    name: 'DeMag D7',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 2, blue: 8 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 1,
    range: 9,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
  },
  {
    // p.39 "Panzer 38t" (×1), 39-42 ("Pz 38(t) E"). Czech light tank, 3.7cm L48
    // gun — "slated to be a main battle tank, but proved both vulnerable and
    // underpowered." Analogy: weaker than the Panzer IIIe below (a proper
    // German-chassis contemporary of similar gun caliber).
    id: 'ger-pz38t',
    nation: 'germans',
    name: 'Panzer 38(t)',
    kind: 'vehicle',
    fp: { red: 3, blue: 5 },
    dr: { front: 16, flank: 13, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "Panzer IIIe" (×2), 39-41 ("Pz III E"). Early Panzer III — "intended
    // to be the main German battle tank, but its puny 3.7cm gun proved useless
    // against most Soviet tanks." Analogy: the weakest of this catalog's Panzer
    // III variants (predates the already-verified ger-pz3h/ger-pz3l upgrades),
    // similar gun caliber to Panzer 38(t).
    id: 'ger-pz3e',
    nation: 'germans',
    name: 'Panzer IIIe',
    kind: 'vehicle',
    fp: { red: 3, blue: 5 },
    dr: { front: 15, flank: 13, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "Panzer IIIj" (×1), 42-43 ("Pz III J"). Upgraded Panzer IIIe with a
    // 5cm AT gun and much thicker armor. Analogy: a step up from the already-
    // verified ger-pz3h (also 3.7-5cm class), matching the flavor text's "much
    // thicker armor to protect against the T-34."
    id: 'ger-pz3j',
    nation: 'germans',
    name: 'Panzer IIIj',
    kind: 'vehicle',
    fp: { red: 4, blue: 9 },
    dr: { front: 17, flank: 15, color: 'blue' },
    move: 1,
    range: 11,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "S35(f) Somua Tank" (×1), 41-44 ("Somua S35"). Captured French medium
    // tank, 47mm L42 gun, radio + cupola. Analogy: the already-verified ger-
    // pz3l (similar 47-50mm gun class/era).
    id: 'ger-somua-s35f',
    nation: 'germans',
    name: 'S35(f) Somua Tank',
    kind: 'vehicle',
    fp: { red: 4, blue: 7 },
    dr: { front: 17, flank: 14, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "B2(f) Tank" (×1), 42-44 ("B-2 (f)"). Captured French heavy tank,
    // hull-mounted gun replaced by a flamethrower. Analogy: the already-verified
    // ger-pz3m-flamm (same flamethrower-tank role), scaled up to "heavy tank"
    // armor per the flavor text.
    id: 'ger-b2f',
    nation: 'germans',
    name: 'B2(f) Tank',
    kind: 'vehicle',
    fp: { red: 4, blue: 7 },
    dr: { front: 17, flank: 14, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    hasFlamethrower: true,
  },
  {
    // p.39 "T-34 Captured Tank" (×1), 41-42 ("T-34a", radio-equipped) — the
    // German-crewed captured-T-34a counterpart to the already-verified
    // ger-t34b-captured (a T-34b). Analogy: sov-t34a's own stats, with apToFire
    // lowered to 3 to match this catalog's existing convention for German-crewed
    // captured T-34s (ger-t34b-captured does the same vs sov-t34b: apToFire 3 vs
    // 5).
    id: 'ger-t34a-captured',
    nation: 'germans',
    name: 'T-34a (Captured)',
    kind: 'vehicle',
    fp: { red: 5, blue: 7 },
    dr: { front: 19, flank: 15, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 3,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true,
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

  // ---------------------------------------------------------------------
  // Storms of Steel 3rd Edition Unit List (docs/SoS3 Rulebook v70 single
  // pages.pdf, p.38) — see the matching German comment block above for
  // the full sourcing/transcription/inference methodology; the same
  // notes apply here (skipped duplicates, turreted inference, vp is ours).
  {
    // p.38 "Rifles '43 Squad" (×6), 43-45.
    id: 'sov-rifle-43',
    nation: 'soviets',
    name: "Rifles '43 Squad",
    kind: 'infantry',
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 6,
    apToFire: 4,
    vp: 1,
    unburdened: true,
    counterImage: '/assets/units/sov-rifle-43.png',
  },
  {
    // p.38 "Sniper Squad" (×2), 41-45.
    id: 'sov-sniper',
    nation: 'soviets',
    name: 'Sniper Squad',
    kind: 'infantry',
    whiteBoxFp: true,
    fp: { red: 2, blue: 2 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 1,
    range: 10,
    apToFire: 4,
    vp: 2,
    unburdened: true,
    counterImage: '/assets/units/sov-sniper.png',
  },
  {
    // p.38 "PTRD AT Rifle Squad" (×4), 39-45.
    id: 'sov-ptrd',
    nation: 'soviets',
    name: 'PTRD AT Rifle Squad',
    kind: 'infantry',
    whiteBoxFp: true,
    fp: { red: 2, blue: 3 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 3,
    vp: 2,
    unburdened: true,
    counterImage: '/assets/units/sov-ptrd.png',
  },
  {
    // p.38 "50mm Light Mortar" (×2), 39-43. No Indirect Attack Cost
    // printed on the card (unlike the 82mm Mortar's "(4)") — modeled as
    // Direct-Fire only (no `indirectApToFire`/`canFireSmoke`).
    id: 'sov-mortar-50mm',
    nation: 'soviets',
    name: '50mm Light Mortar',
    kind: 'mortar',
    whiteBoxFp: true,
    fp: { red: 2, blue: 0 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 1,
    range: 10,
    minRange: 2,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    counterImage: '/assets/units/sov-mortar-50mm.png',
  },
  {
    // p.38 "57LL ZiS-2 AT Gun" (×2), 43-45.
    id: 'sov-zis2-57mm',
    nation: 'soviets',
    name: '57LL ZiS-2 AT Gun',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 2, blue: 10 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 5,
    range: 11,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    counterImage: '/assets/units/sov-zis2-57mm.png',
  },
  {
    // p.38 "76.2mm ZiS-3 AT Gun" (×4), 39-43.
    id: 'sov-zis3-76mm',
    nation: 'soviets',
    name: '76.2mm ZiS-3 AT Gun',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 4, blue: 8 },
    dr: { front: 13, flank: 10, color: 'red' },
    move: 5,
    range: 10,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    counterImage: '/assets/units/sov-zis3-76mm.png',
  },
  {
    // p.38 "Churchill MkIII 6 pdr" (×4), 42-43. British Lend-Lease tank.
    id: 'sov-churchill',
    nation: 'soviets',
    name: 'Churchill MkIII',
    kind: 'vehicle',
    fp: { red: 4, blue: 9 },
    dr: { front: 18, flank: 16, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/sov-churchill.png',
  },
  {
    // p.38 "SU-76 76mm ZiS3" (×2), 43-45 (card reads "SU-76m").
    id: 'sov-su76',
    nation: 'soviets',
    name: 'SU-76',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 4, blue: 8 },
    dr: { front: 15, flank: 12, color: 'blue' },
    move: 1,
    range: 11,
    apToFire: 4,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
    counterImage: '/assets/units/sov-su76.png',
  },
  {
    // p.38 "SU-122 122mm M30" (×3), 43-45.
    id: 'sov-su122',
    nation: 'soviets',
    name: 'SU-122',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 6, blue: 9 },
    dr: { front: 18, flank: 15, color: 'blue' },
    move: 1,
    range: 11,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    counterImage: '/assets/units/sov-su122.png',
  },
  {
    // p.38 "SU-152 ML-20S" (×2), 43-45.
    id: 'sov-su152',
    nation: 'soviets',
    name: 'SU-152',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 7, blue: 12 },
    dr: { front: 21, flank: 16, color: 'blue' },
    move: 1,
    range: 12,
    apToFire: 6,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    counterImage: '/assets/units/sov-su152.png',
  },
  {
    // p.38 "KV-1s Med/Heavy Tank" (×3), 42-44.
    id: 'sov-kv1s',
    nation: 'soviets',
    name: 'KV-1s',
    kind: 'vehicle',
    fp: { red: 5, blue: 9 },
    dr: { front: 18, flank: 16, color: 'blue' },
    move: 1,
    range: 9,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/sov-kv1s.png',
  },
  {
    // p.38 "T-34b 76.2mm F34" (×1), 41-43.
    id: 'sov-t34b',
    nation: 'soviets',
    name: 'T-34b',
    kind: 'vehicle',
    fp: { red: 5, blue: 8 },
    dr: { front: 18, flank: 15, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true,
    counterImage: '/assets/units/sov-t34b.png',
  },
  {
    // p.38 "T-34c 76.2mm F34" (×9), 42-45.
    id: 'sov-t34c',
    nation: 'soviets',
    name: 'T-34c',
    kind: 'vehicle',
    fp: { red: 5, blue: 9 },
    dr: { front: 19, flank: 16, color: 'blue' },
    move: 1,
    range: 9,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    turreted: true,
    counterImage: '/assets/units/sov-t34c.png',
  },
  {
    // p.38 "T-70 45mm m32/38" (×6), 42-45.
    id: 'sov-t70',
    nation: 'soviets',
    name: 'T-70',
    kind: 'vehicle',
    fp: { red: 3, blue: 6 },
    dr: { front: 17, flank: 13, color: 'blue' },
    move: 1,
    range: 6,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    counterImage: '/assets/units/sov-t70.png',
  },
  {
    // p.38 "M3 APC" (×4), 43-45. American Lend-Lease half-track, often
    // carried a .50 cal HMG.
    id: 'sov-m3-apc',
    nation: 'soviets',
    name: 'M3 APC',
    kind: 'vehicle',
    fp: { red: 5, blue: 3 },
    dr: { front: 12, flank: 11, color: 'blue' },
    move: 1,
    range: 6,
    apToFire: 4,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 2,
    openTopped: true,
    apcTransport: true,
    counterImage: '/assets/units/sov-m3-apc.png',
  },
  {
    // p.38 "M3 Scout" (×2), 43-45. Wheeled American scout car.
    id: 'sov-m3-scout',
    nation: 'soviets',
    name: 'M3 Scout',
    kind: 'vehicle',
    fp: { red: 4, blue: 2 },
    dr: { front: 12, flank: 11, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 2,
    openTopped: true,
    counterImage: '/assets/units/sov-m3-scout.png',
  },
  {
    // p.39 "Inf Gun 76mm" (×1), 39-45 ("76 Inf Gun"). Soviet infantry support
    // gun M1927, issued to rifle/cavalry regiments. Analogy: the German 7.5cm
    // Inf Gun's role above (soft-target HE support gun).
    id: 'sov-inf-gun-76mm',
    nation: 'soviets',
    name: '76mm Inf Gun',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 5, blue: 0 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 4,
    range: 25,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "F22 m36 76mm" (×1), 39-45 ("76 F22 Artl"). Designed as both an AA
    // and AT gun, "disappointing in handling and performance" — the
    // Soviet-crewed original of the same physical gun the Germans captured and
    // fielded as ger-fk297 above (kept deliberately close but not identical,
    // matching this catalog's own captured-equipment precedent).
    id: 'sov-f22-76mm',
    nation: 'soviets',
    name: 'F22 m36 76mm',
    kind: 'gun',
    whiteBoxFp: true,
    fp: { red: 5, blue: 7 },
    dr: { front: 12, flank: 10, color: 'red' },
    move: 6,
    range: 9,
    apToFire: 3,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
  },
  {
    // p.39 "Wagons" (×4), 39-45. Unarmed horse-drawn supply wagon — the Soviet
    // counterpart to ger-wagon above (same profile/analogy).
    id: 'sov-wagon',
    nation: 'soviets',
    name: 'Wagon',
    kind: 'vehicle',
    fp: { red: 0, blue: 0 },
    dr: { front: 11, flank: 11, color: 'red' },
    move: 1,
    range: 0,
    apToFire: 0,
    vp: 1,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 1,
    attackMode: 'none',
    cannotControlHex: true,
    noCapLossOnDestroy: true,
  },
  {
    // p.39 "BA-10 Armored Car" (×2), 39-43. Wheeled recon car, light armor, good
    // speed, 45mm turreted gun + MG — "most-produced heavy armored car in the
    // war." Analogy: sov-t70's 45mm gun firepower, lighter (wheeled) armor than
    // that tracked light tank.
    id: 'sov-ba10',
    nation: 'soviets',
    name: 'BA-10 Armored Car',
    kind: 'vehicle',
    fp: { red: 4, blue: 6 },
    dr: { front: 14, flank: 12, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 5,
    vp: 2,
    unburdened: false,
    propulsion: 'wheeled',
    bonusMoves: 2,
    mobileTrackBonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "OT-26" (×1), 41-42. A flamethrower mounted on a modified T-26 light
    // tank — "short range and light armor made the OT-26 vulnerable." Analogy:
    // the already-verified ger-pz3m-flamm role (flamethrower tank), on the
    // weaker T-26 chassis (see sov-t26b below).
    id: 'sov-ot26',
    nation: 'soviets',
    name: 'OT-26',
    kind: 'vehicle',
    fp: { red: 2, blue: 0 },
    dr: { front: 14, flank: 12, color: 'blue' },
    move: 1,
    range: 5,
    apToFire: 5,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
    hasFlamethrower: true,
  },
  {
    // p.39 "ZiS-30 Mobile Art." (×1), 41-42. A hastily-designed tank destroyer —
    // a 57mm AT gun on a Komsomolets tractor, "not a good gun platform," early
    // 57mm gun "had many defects." Analogy: a decent AT gun (comparable to
    // sov-zis2-57mm's caliber) let down by a weak, unreliable chassis.
    id: 'sov-zis30',
    nation: 'soviets',
    name: 'ZiS-30 Mobile Art.',
    kind: 'vehicle',
    whiteBoxFp: true,
    fp: { red: 2, blue: 9 },
    dr: { front: 13, flank: 11, color: 'red' },
    move: 1,
    range: 7,
    apToFire: 6,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    openTopped: true,
  },
  {
    // p.39 "T-26b Light Tank" (×4), 39-42. "Obsolete by Operation Barbarossa,"
    // but the most numerous Soviet tank of the early war. Analogy: a step below
    // sov-t70 (also a light tank with a similar-era gun), reflecting its
    // obsolescence.
    id: 'sov-t26b',
    nation: 'soviets',
    name: 'T-26b Light Tank',
    kind: 'vehicle',
    fp: { red: 4, blue: 6 },
    dr: { front: 14, flank: 13, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 5,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "BT-7 Light Tank" (×2), 39-43. "Obsolete by 1941," but a fast cavalry
    // tank whose "design was a precursor of the T-34." Analogy: slightly better
    // gun/mobility than sov-t26b above, reflecting its T-34 lineage, but still
    // armor-thin (era-appropriate).
    id: 'sov-bt7',
    nation: 'soviets',
    name: 'BT-7 Light Tank',
    kind: 'vehicle',
    fp: { red: 4, blue: 6 },
    dr: { front: 15, flank: 12, color: 'blue' },
    move: 1,
    range: 7,
    apToFire: 5,
    vp: 2,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "T-35 Heavy Tank" (×1), 39-41. A multi-turret tank with 3 guns and 5
    // MGs — "prone to break down and poorly armored, it fought to extinction in
    // 1941." Analogy: high combined Firepower (multiple guns/MGs) but weaker
    // Defense than a "heavy tank" name implies (per the flavor text's own
    // "poorly armored").
    id: 'sov-t35',
    nation: 'soviets',
    name: 'T-35 Heavy Tank',
    kind: 'vehicle',
    fp: { red: 6, blue: 6 },
    dr: { front: 14, flank: 12, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 6,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "KV1a Heavy Tank" (×2), 40-42. "The most powerful serial-made tank at
    // the beginning of the war, its thick armor was almost impenetrable."
    // Analogy: the already-verified sov-kv1s (same KV lineage), with slightly
    // higher Defense to match the flavor text's emphasis on near-impenetrable
    // armor as the series' earliest model.
    id: 'sov-kv1a',
    nation: 'soviets',
    name: 'KV1a Heavy Tank',
    kind: 'vehicle',
    fp: { red: 5, blue: 7 },
    dr: { front: 20, flank: 17, color: 'blue' },
    move: 1,
    range: 9,
    apToFire: 5,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
  {
    // p.39 "KV2a Heavy Tank" (×1), 40-43 ("the 'Tank Buster'"). Provided close
    // support for the KV1a; "main drawback was its slow speed." Analogy: the
    // already-verified sov-su152's huge-gun Firepower/Attack Cost (both mount an
    // oversized howitzer-class gun), on KV1a-level armor rather than an SPG's.
    id: 'sov-kv2a',
    nation: 'soviets',
    name: 'KV2a Heavy Tank',
    kind: 'vehicle',
    fp: { red: 7, blue: 10 },
    dr: { front: 18, flank: 16, color: 'blue' },
    move: 1,
    range: 8,
    apToFire: 6,
    vp: 3,
    unburdened: false,
    propulsion: 'tracked',
    bonusMoves: 1,
    turreted: true,
  },
];

export const ALL_UNIT_TEMPLATES: UnitTemplate[] = [...GERMAN_UNITS, ...SOVIET_UNITS];

/** Templates keyed by id, for quick lookup and for assembling a MissionDef. */
export const UNIT_TEMPLATES: Record<string, UnitTemplate> = Object.fromEntries(
  ALL_UNIT_TEMPLATES.map((t) => [t.id, t]),
);
