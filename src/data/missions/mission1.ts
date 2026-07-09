/**
 * Mission 1 — "Partisans" (17 October 1941), the Section-1 teaching Mission.
 * Re-authored onto the new flat-top board substrate (CLAUDE.md §B) directly
 * with the user: single Map 1 board, 5 Rounds, 6 CAP (Germans) / 7 CAP
 * (Soviets), Germans hold Round-1 Initiative, the Soviets begin with 1 VP,
 * and control of Hex I06 scores 1 VP each Round end (starts uncontrolled —
 * §9.2's normal sole-occupier rule decides it during play, not a setup
 * override). 1 VP per enemy Unit destroyed. FF1 is played before cards, so
 * no cards.
 *
 * Facings are a placeholder default (Germans face SE/0, Soviets face NW/3 —
 * roughly "toward each other" given Germans enter from the west edge and the
 * Soviets are dug in further east) — easy to adjust per-unit once the real
 * terrain is in and this plays end-to-end.
 *
 * Reinforcements (§4.12) enter the Map rather than being pre-placed:
 *  - German Round 1: "Rifles 1/2 Platoon" (2x Rifles, 2x MG34) enters via any
 *    full Hex along the west edge. Column A (the true board edge) is entirely
 *    half/quarter-hexes by construction (edgeCut.w on every cell — verified),
 *    so — mirroring the original Mission 1's own choice of Row B, not Row A,
 *    for its south edge — this uses column B (B01-B12), the first genuinely
 *    full-hex column in from the boundary.
 *  - German Round 3: the "SS Tracker Unit" (1x SS Tracker, ger-pioneer-tracker
 *    — same body as a Pioneer but explicitly fielded without the
 *    Flamethrower/Smoke/Pioneer-exception kit) enters within 2 Hexes of Hex
 *    R01, full hexes only (no half/quarter-hex entry).
 *  - Soviet Round 2 (or any later Round, at the Soviet player's option):
 *    "Reinforcements" (2x Rifles) enter at Road Hex R07. The scenario names
 *    Hex S06 — column S (the true east board edge) is, like column A on the
 *    west edge, entirely half/quarter-hexes by construction (edgeCut.e on
 *    every cell — verified: S06 has `edgeCut: {e: true}`), so this uses R07,
 *    the full-hex Road continuation one Hex inward (its other full neighbor,
 *    R06, isn't on the Road, so R07 is the one that preserves "Road Hex").
 *    Caught live the same way the German west-edge half-hex bug was:
 *    reinforcements were able to enter on a half-hex.
 */
import { idOf, neighbors, parseHexId } from '../../engine/hex';
import type { HexId, MissionDef, ReinforcementWaveDef, UnitPlacement } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);
const hexById = new Map(MISSION1_MAP.map((h) => [h.id, h]));

/** Every FULL playable Hex (no half/quarter-hex edge cut) within `dist` of `origin` (§4.12 entry areas). */
function withinPlayableFullHex(origin: HexId, dist: number): HexId[] {
  const seen = new Set<HexId>();
  const isFull = (id: HexId) => hexById.has(id) && !hexById.get(id)!.edgeCut;
  if (isFull(origin)) seen.add(origin);
  let frontier = [origin];
  for (let d = 0; d < dist; d++) {
    const next: HexId[] = [];
    for (const id of frontier) {
      for (const n of neighbors(parseHexId(id))) {
        const nid = idOf(n);
        if (isFull(nid) && !seen.has(nid)) {
          seen.add(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

/** Column B (B01-B12): the first full-hex column in from the west edge, German Round-1 entry (§4.12). */
const WEST_EDGE: HexId[] = Array.from({ length: 12 }, (_, i) => at(`B${String(i + 1).padStart(2, '0')}`));

// --- Soviet partisans (B): pre-placed setup (Maxim support) — NOT reinforcements. ---
const UNITS: UnitPlacement[] = [
  { id: 'S-maxim', side: 'B', templateId: 'sov-maxim', hexId: at('K02'), facing: 3 },
  { id: 'S-rifle-1', side: 'B', templateId: 'sov-rifle', hexId: at('M05'), facing: 3 },
  { id: 'S-rifle-2', side: 'B', templateId: 'sov-rifle', hexId: at('L08'), facing: 3 },
  { id: 'S-rifle-3', side: 'B', templateId: 'sov-rifle', hexId: at('N10'), facing: 3 },
];

const REINFORCEMENTS: ReinforcementWaveDef[] = [
  {
    id: 'ger-r1-platoon',
    side: 'A',
    earliestRound: 1,
    entryHexIds: WEST_EDGE,
    entryDescription: 'any full Hex along the west edge (B01-B12)',
    units: [
      { id: 'G-mg34-1', templateId: 'ger-lmg', facing: 0 },
      { id: 'G-rifle-1', templateId: 'ger-rifle', facing: 0 },
      { id: 'G-rifle-2', templateId: 'ger-rifle', facing: 0 },
      { id: 'G-mg34-2', templateId: 'ger-lmg', facing: 0 },
    ],
  },
  {
    id: 'ger-r3-ss-tracker',
    side: 'A',
    earliestRound: 3,
    entryHexIds: withinPlayableFullHex(at('R01'), 2),
    entryDescription: 'within 2 Hexes of Hex R01 (full Hexes only)',
    units: [{ id: 'G-ss-pioneer', templateId: 'ger-pioneer-tracker', facing: 0 }],
  },
  {
    id: 'sov-r2-reinforcements',
    side: 'B',
    earliestRound: 2,
    // §4.12 entry Hexes must be full Hexes — S06 (the scenario's named Hex)
    // is a half-hex on the board's true east edge; R07 is the full-hex Road
    // continuation one Hex inward (see header comment above).
    entryHexIds: [at('R07')],
    entryDescription: 'Road Hex R07, one Hex in from S06 — S06 itself is a half-hex (or any later Round, your option)',
    units: [
      { id: 'S-r2-rifle-1', templateId: 'sov-rifle', facing: 3 },
      { id: 'S-r2-rifle-2', templateId: 'sov-rifle', facing: 3 },
    ],
  },
];

const templateIds = new Set([
  ...UNITS.map((u) => u.templateId),
  ...REINFORCEMENTS.flatMap((w) => w.units.map((u) => u.templateId)),
]);
const templates = [...templateIds].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Mission 1 references unknown unit template: ${id}`);
  return t;
});

export const MISSION_1: MissionDef = {
  id: 'mission1-partisans',
  name: 'Mission 1 — Partisans',
  roundsTotal: 5,
  seed: 20261017,
  caps: { A: 6, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A', // Germans have Round-1 Initiative
  startVp: { B: 1 }, // Soviets begin the Mission with 1 VP (§9.2)
  vpPerKill: 1, // 1 VP per enemy Unit destroyed (§9.1)
  hexes: MISSION1_MAP,
  units: UNITS,
  reinforcements: REINFORCEMENTS,
  templates,
  victoryHexes: [{ hexId: at('I06'), vp: 1 }], // control I06 → +1 VP each Round end (starts uncontrolled)
};
