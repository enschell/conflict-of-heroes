/**
 * Mission 1 — "Partisans" (17 October 1941), the Section-1 teaching Mission.
 *
 * Setup is the real Academy Games Mission 1 (our own data + stats; no art): a
 * single Map 1 board, 5 Rounds, 7 CAPs/side, Germans hold Round-1 Initiative,
 * the Soviets begin with 1 VP, and control of Hex I06 scores 1 VP each Round
 * end. 1 VP per enemy Unit destroyed. FF1 is played before cards, so no cards.
 *
 * Reinforcements (§4.12) enter the Map rather than being pre-placed:
 *  - German Round 1: "Rifles 1/2 Platoon" (2× Rifles, 2× MG34) enters via any
 *    full Hex along the south edge (Row B, B01–B12).
 *  - German Round 3: the "SS Tracker Unit" (1× Pioneer) enters within 2 Hexes
 *    of Hex R01. May not use Smoke or the Flamethrower (not modeled — neither
 *    exists in the engine yet, so this is a no-op restriction for now).
 *  - Soviet Round 2 (or any later Round, at the Soviet player's option):
 *    "Reinforcements" (2× Rifles) enter at Road Hex R07.
 */
import { idOf, neighbors, parseHexId } from '../../engine/hex';
import type { HexId, MissionDef, ReinforcementWaveDef, UnitPlacement } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);
const playable = new Set(MISSION1_MAP.map((h) => h.id));

/** Every playable Hex within `dist` of `origin` (for an "entry area", §4.12). */
function withinPlayable(origin: HexId, dist: number): HexId[] {
  const seen = new Set<HexId>([origin]);
  let frontier = [origin];
  for (let d = 0; d < dist; d++) {
    const next: HexId[] = [];
    for (const id of frontier) {
      for (const n of neighbors(parseHexId(id))) {
        const nid = idOf(n);
        if (playable.has(nid) && !seen.has(nid)) {
          seen.add(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

/** Row B (B01–B12): the full-hex south edge, German Round-1 entry (§4.12). */
const SOUTH_EDGE: HexId[] = Array.from({ length: 12 }, (_, i) => at(`B${String(i + 1).padStart(2, '0')}`));

// --- Soviet partisans (B): pre-placed setup (Maxim support) — NOT reinforcements. ---
const UNITS: UnitPlacement[] = [
  { id: 'S-maxim', side: 'B', templateId: 'sov-maxim', hexId: at('K02'), facing: 5 },
  { id: 'S-rifle-1', side: 'B', templateId: 'sov-rifle', hexId: at('L08'), facing: 5 },
  { id: 'S-rifle-2', side: 'B', templateId: 'sov-rifle', hexId: at('M05'), facing: 5 },
  { id: 'S-rifle-3', side: 'B', templateId: 'sov-rifle', hexId: at('N10'), facing: 5 },
];

// Germans face north (toward the objective, facing 1 = NE); partisans/Soviet
// reinforcements face south (facing 5 = SE) toward the German advance.
const REINFORCEMENTS: ReinforcementWaveDef[] = [
  {
    id: 'ger-r1-platoon',
    side: 'A',
    earliestRound: 1,
    entryHexIds: SOUTH_EDGE,
    units: [
      { id: 'G-mg34-1', templateId: 'ger-lmg', facing: 1 },
      { id: 'G-rifle-1', templateId: 'ger-rifle', facing: 1 },
      { id: 'G-rifle-2', templateId: 'ger-rifle', facing: 1 },
      { id: 'G-mg34-2', templateId: 'ger-lmg', facing: 1 },
    ],
  },
  {
    id: 'ger-r3-ss-tracker',
    side: 'A',
    earliestRound: 3,
    entryHexIds: withinPlayable(at('R01'), 2),
    units: [{ id: 'G-ss-pioneer', templateId: 'ger-pioneer', facing: 1 }],
  },
  {
    id: 'sov-r2-reinforcements',
    side: 'B',
    earliestRound: 2,
    entryHexIds: [at('R07')],
    units: [
      { id: 'S-r2-rifle-1', templateId: 'sov-rifle', facing: 5 },
      { id: 'S-r2-rifle-2', templateId: 'sov-rifle', facing: 5 },
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
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A', // Germans have Round-1 Initiative
  startVp: { B: 1 }, // Soviets begin the Mission with 1 VP (§9.2)
  vpPerKill: 1, // 1 VP per enemy Unit destroyed (§9.1)
  hexes: MISSION1_MAP,
  units: UNITS,
  reinforcements: REINFORCEMENTS,
  templates,
  victoryHexes: [{ hexId: at('I06'), vp: 1 }], // control I06 → +1 VP each Round end
};
