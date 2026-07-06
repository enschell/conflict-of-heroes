/**
 * Hills Sandbox — a NON-canonical test scenario (not from the Mission Book),
 * for M9 (§12 Hills and Elevation). Unlike `sandbox.ts`/`fireSupportSandbox.ts`,
 * this one needs its own map: Map 1 has no hills at all, so a small purpose-
 * built board (8 columns × 5 rows, plain axial `q,r` — no need for Map 1's
 * rulebook hex-label scheme since this mission isn't cross-referenced against
 * the physical board) stands in for it.
 *
 * Row 0 — a Steep (2-level) cliff: L0→L2 directly at col 2 (on a Road, so a
 *   Vehicle can still cross it — §15.4 — but still pays the §12.2 elevation
 *   AP cost) and L2→L0 at col 4, off-Road (impassable to Vehicles, §15.3).
 * Row 1 — a gradual Sloping ridge (L0→L1→L2→L1→L0) with a Road running up
 *   the ascent (§12.2's "Roads and Hills" example: the Road does not cancel
 *   the elevation AP penalty). G-tank sits at the base for the "Vehicle Moving
 *   Uphill" Bonus-Move worked example (§15's own, base Move + 1 ascending
 *   Bonus Move = the rulebook's 1+1+1=3AP case); G-hilltop atop the ridge has
 *   clear, unobstructed LOS down to S-rifle for the §12.3 Elevation Combat
 *   Bonus (+1AR).
 * Row 2 — the same ridge shape, but with Light Woods at col 5 (flat ground,
 *   not on the hill) so the ridge's peak (col 3) demonstrates the §12.6 Blind
 *   Spot: col 6 (directly behind the Woods) is unseeable from the peak even
 *   though col 7 (beyond it) is visible again.
 * Row 3 — a second copy of Row 1's ridge (extra maneuver room).
 * Row 4 — a flat L1 "mesa" (cols 1–4 all Level 1, no terrain): demonstrates
 *   the corrected §12.4 rule that same-level LOS is uniform at any elevation,
 *   not just Level 0 (G-mesa ↔ S-mesa see each other across it).
 */
import { hexId } from '../../engine/hex';
import type { MapHexDef, MissionDef, TerrainId, UnitPlacement } from '../../engine/types';
import { UNIT_TEMPLATES } from '../units';

interface ColDef {
  terrain: TerrainId;
  elevation: number;
  road?: boolean;
}

const O = (elevation: number, road?: boolean): ColDef => ({ terrain: 'open', elevation, ...(road ? { road: true } : {}) });
const W = (elevation: number): ColDef => ({ terrain: 'woodsLight', elevation });

// 8 columns (0..7) per row.
const ROWS: ColDef[][] = [
  // Row 0 — Steep cliff (on-Road at col 2, off-Road at col 4).
  [O(0), O(0, true), O(2, true), O(2), O(0), O(0), O(0), O(0)],
  // Row 1 — Sloping ridge on a Road (vehicle Bonus-Move + elevation combat bonus).
  [O(0), O(0, true), O(1, true), O(2, true), O(1), O(0), O(0), O(0)],
  // Row 2 — same ridge, Woods at col 5 for the Blind Spot showcase.
  [O(0), O(0, true), O(1, true), O(2, true), O(1), W(0), O(0), O(0)],
  // Row 3 — a second ridge lane.
  [O(0), O(0, true), O(1, true), O(2, true), O(1), O(0), O(0), O(0)],
  // Row 4 — flat L1 mesa, cols 1-4.
  [O(0), O(1), O(1), O(1), O(1), O(0), O(0), O(0)],
];

const HEXES: MapHexDef[] = ROWS.flatMap((row, r) =>
  row.map((col, q): MapHexDef => ({
    id: hexId(q, r),
    terrain: col.terrain,
    elevation: col.elevation,
    ...(col.road ? { road: true } : {}),
    label: `R${r}C${q}`,
  })),
);

const UNITS: UnitPlacement[] = [
  // Germans (A), facing east (facing 0).
  { id: 'G-rifle', side: 'A', templateId: 'ger-rifle', hexId: hexId(0, 1), facing: 0 },
  { id: 'G-hilltop', side: 'A', templateId: 'ger-lmg', hexId: hexId(3, 1), facing: 0 },
  { id: 'G-tank', side: 'A', templateId: 'ger-pz3h', hexId: hexId(1, 1), facing: 0 },
  { id: 'G-mesa', side: 'A', templateId: 'ger-rifle', hexId: hexId(1, 4), facing: 0 },
  // Soviets (B), facing west (facing 3).
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: hexId(6, 1), facing: 3 },
  { id: 'S-mesa', side: 'B', templateId: 'sov-rifle', hexId: hexId(4, 4), facing: 3 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Hills Sandbox references unknown unit template: ${id}`);
  return t;
});

export const HILLS_SANDBOX: MissionDef = {
  id: 'sandbox-hills',
  name: 'Hills Sandbox (test)',
  roundsTotal: 5,
  seed: 120926,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: hexId(3, 2), vp: 1 }],
};
