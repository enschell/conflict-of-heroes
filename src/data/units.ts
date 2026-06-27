/**
 * Infantry stat templates for the vertical slice, keyed by nation.
 *
 * CONTENT/LEGAL NOTE: these numbers are our OWN approximations for personal
 * play — not a copy of Academy Games' counter data. They are grounded in the
 * rulebook's *prose* where it states figures, e.g.:
 *   - German Rifle fires for 3AP, moves 1AP/hex (Figure 1).
 *   - Soviet Rifle '41 fires for 4AP, moves 1AP/hex (§3.0).
 *   - German LMG fires for 2AP (§3.2 example).
 *   - Pioneers have red 4FP (§7.0 example); Rifle DR 12 front / 11 flank (§7.0/§7.3).
 *   - MMG (Maxim) move cost 2AP (§5.0 example).
 * Everything else (ranges, VP values, SMG/HMG numbers) is balanced by us.
 *
 * Fields (see UnitTemplate): fp{red,blue}, dr{front,flank,color}, move (red AP
 * cost / hex), range, apToFire, vp (to opponent on destruction), unburdened
 * (move ≤ 2, §1.1).
 *
 * >>> EDIT THE STATS BELOW to the real counter values when ready. Only the
 * numbers change — no code edits needed, and no test or the `npm run
 * conformance` audit depends on these specific values (they re-derive from
 * whatever is here). After editing, run `npm test` to confirm. Keep `kind`,
 * `whiteBoxFp` (crew weapons: CC −2), and `unburdened` (move ≤ 2) accurate too.
 */
import type { UnitTemplate } from '../engine/types';

export const GERMAN_UNITS: UnitTemplate[] = [
  {
    id: 'ger-rifle',
    nation: 'germans',
    name: 'Rifle',
    kind: 'infantry',
    fp: { red: 4, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    id: 'ger-smg',
    nation: 'germans',
    name: 'SMG',
    kind: 'infantry',
    fp: { red: 5, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 2,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    id: 'ger-lmg',
    nation: 'germans',
    name: 'LMG',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 5, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 1,
    range: 5,
    apToFire: 2,
    vp: 2,
    unburdened: true,
  },
  {
    id: 'ger-hmg',
    nation: 'germans',
    name: 'HMG34',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 6, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 2,
    range: 8,
    apToFire: 3,
    vp: 2,
    unburdened: true,
  },
  {
    id: 'ger-pioneer',
    nation: 'germans',
    name: 'Pioneer',
    kind: 'infantry',
    fp: { red: 4, blue: 1 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 3,
    apToFire: 2,
    vp: 2,
    unburdened: true,
  },
];

export const SOVIET_UNITS: UnitTemplate[] = [
  {
    id: 'sov-rifle',
    nation: 'soviets',
    name: "Rifle '41",
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 4,
    vp: 1,
    unburdened: true,
  },
  {
    id: 'sov-smg',
    nation: 'soviets',
    name: 'SMG (PPSh)',
    kind: 'infantry',
    fp: { red: 5, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 2,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
  {
    id: 'sov-maxim',
    nation: 'soviets',
    name: 'Maxim MMG',
    kind: 'mg',
    whiteBoxFp: true,
    fp: { red: 5, blue: 0 },
    dr: { front: 11, flank: 10, color: 'red' },
    move: 2,
    range: 7,
    apToFire: 3,
    vp: 2,
    unburdened: true,
  },
  {
    id: 'sov-partisan',
    nation: 'soviets',
    name: 'Partisan',
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 3,
    apToFire: 3,
    vp: 1,
    unburdened: true,
  },
];

export const ALL_UNIT_TEMPLATES: UnitTemplate[] = [...GERMAN_UNITS, ...SOVIET_UNITS];

/** Templates keyed by id, for quick lookup and for assembling a FirefightDef. */
export const UNIT_TEMPLATES: Record<string, UnitTemplate> = Object.fromEntries(
  ALL_UNIT_TEMPLATES.map((t) => [t.id, t]),
);
