/**
 * Obstacles Sandbox — a NON-canonical test scenario (not from the Mission
 * Book), for M10 Phase 1 (§17.7-§17.10). Like `hillsSandbox.ts`, this needs
 * its own small map: Map 1 has no Obstacles either.
 *
 * Row 0 — Barbed Wire (§17.8): a foot Unit crossing it rolls 1d6 added to its
 *   Move Cost; a Wheeled vehicle is denied entry; a Tracked vehicle crosses
 *   for free and destroys it.
 * Row 1 — a Road running through a Road Block (§17.9): impassable to Wheeled
 *   (even though it's sitting ON the road — that's the whole point of a Road
 *   Block), Tracked crosses freely, foot Units are unaffected entirely.
 * Row 2 — Mines (§17.10): triggers an automatic attack (Hit# 8, matching the
 *   rulebook's own worked example) on any Unit that moves into it or Pivots
 *   there; the owning side (here, Side B, "planted" the field) may spend up
 *   to 2 CAP to raise/lower the Hit Number via the Mines CAP-choice dialog.
 */
import { hexId } from '../../engine/hex';
import type { MapHexDef, MissionDef, UnitPlacement } from '../../engine/types';
import { UNIT_TEMPLATES } from '../units';

const HEXES: MapHexDef[] = [];
for (let r = 0; r < 3; r++) {
  for (let q = 0; q < 6; q++) {
    const def: MapHexDef = { id: hexId(q, r), terrain: 'open', label: `R${r}C${q}` };
    if (r === 1) def.road = true; // the whole row is one Road (§17.9 needs it under the Block)
    if (r === 0 && q === 2) def.obstacle = { kind: 'barbedWire', ownerSide: 'A' };
    if (r === 1 && q === 2) def.obstacle = { kind: 'roadBlock', ownerSide: 'A' };
    if (r === 2 && q === 2) def.obstacle = { kind: 'mines', hitNumber: 8, ownerSide: 'B' };
    HEXES.push(def);
  }
}

const UNITS: UnitPlacement[] = [
  // Germans (A), facing east (facing 0).
  { id: 'G-rifle', side: 'A', templateId: 'ger-rifle', hexId: hexId(0, 0), facing: 0 },
  { id: 'G-sdkfz251', side: 'A', templateId: 'ger-sdkfz251', hexId: hexId(0, 1), facing: 0 }, // wheeled
  { id: 'G-pz3', side: 'A', templateId: 'ger-pz3', hexId: hexId(0, 2), facing: 0 }, // tracked
  // Soviets (B), facing west (facing 3) — "own" the Mines field (§17.10's
  // owning-side CAP choice is exercised from their side).
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: hexId(5, 0), facing: 3 },
  { id: 'S-rifle2', side: 'B', templateId: 'sov-rifle', hexId: hexId(5, 2), facing: 3 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Obstacles Sandbox references unknown unit template: ${id}`);
  return t;
});

export const OBSTACLES_SANDBOX: MissionDef = {
  id: 'sandbox-obstacles',
  name: 'Obstacles Sandbox (test)',
  roundsTotal: 5,
  seed: 170925,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: hexId(4, 1), vp: 1 }],
};
