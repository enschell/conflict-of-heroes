/**
 * Mission 1 — "Partisans" (17 October 1941), the Section-1 teaching Mission.
 *
 * Setup is the real Academy Games Mission 1 (our own data + stats; no art): a
 * single Map 1 board, 5 Rounds, 7 CAPs/side, Germans hold Round-1 Initiative,
 * the Soviets begin with 1 VP, and control of Hex I06 scores 1 VP each Round
 * end. 1 VP per enemy Unit destroyed. FF1 is played before cards, so no cards.
 *
 * STOPGAP (see CLAUDE.md §A): the engine has no reinforcement / map-edge entry
 * yet, so the German Round-1 platoon is PRE-PLACED on the south full-hex row (B)
 * rather than entering from the south edge, and the Round-2 Soviet rifles (→R07)
 * and Round-3 German SS Pioneer (→near R01) are DEFERRED until that feature lands.
 */
import type { MissionDef, UnitPlacement } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);

// Germans face north (toward the objective); partisans face south (toward the
// German approach). Facing 1 = NE (northward), 5 = SE (southward).
const UNITS: UnitPlacement[] = [
  // --- Germans (A): Round-1 "Rifles 1/2 Platoon" — STOPGAP pre-placed on row B.
  { id: 'G-mg34-1', side: 'A', templateId: 'ger-lmg', hexId: at('B05'), facing: 1 },
  { id: 'G-rifle-1', side: 'A', templateId: 'ger-rifle', hexId: at('B06'), facing: 1 },
  { id: 'G-rifle-2', side: 'A', templateId: 'ger-rifle', hexId: at('B07'), facing: 1 },
  { id: 'G-mg34-2', side: 'A', templateId: 'ger-lmg', hexId: at('B08'), facing: 1 },

  // --- Soviet partisans (B): pre-placed setup (Maxim support).
  { id: 'S-maxim', side: 'B', templateId: 'sov-maxim', hexId: at('K02'), facing: 5 },
  { id: 'S-rifle-1', side: 'B', templateId: 'sov-rifle', hexId: at('L08'), facing: 5 },
  { id: 'S-rifle-2', side: 'B', templateId: 'sov-rifle', hexId: at('M05'), facing: 5 },
  { id: 'S-rifle-3', side: 'B', templateId: 'sov-rifle', hexId: at('N10'), facing: 5 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
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
  templates,
  victoryHexes: [{ hexId: at('I06'), vp: 1 }], // control I06 → +1 VP each Round end
};
