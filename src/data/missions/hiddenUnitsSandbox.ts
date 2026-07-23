/**
 * Hidden Units Sandbox — a NON-canonical test scenario (not from the Mission
 * Book), for §11. Like `obstaclesSandbox.ts`, this needs its own small map
 * with real Concealing Terrain (Mission 1 doesn't guarantee Woods in a handy
 * spot for this). Cells are placed via `colRowToAxial` (engine/hexBoard.ts,
 * §B), not raw `hexId(q, r)` — see `hillsSandbox.ts`'s header comment for why.
 *
 * Row 1, cols 2-3 — Woods (Light), a Concealing Terrain hex (§11.5's
 *   `isConcealed`): a Hidden Unit standing here stays Hidden even in enemy
 *   LOS at any range.
 *
 * `A-hidden-1` and `B-hidden-1` start already Hidden (owner always sees their
 *   own; the enemy never sees them while Hidden — the render-layer filter).
 * `A-visible-1` starts NOT Hidden, adjacent to `A-hidden-1`'s Woods hex, to
 *   exercise a real §11.4 Becoming-Hidden Hidden Move into that hex — stacking
 *   with `A-hidden-1` there, since two Hidden Units sharing a hex don't reveal
 *   each other (§11.1 bullet 2 only fires for a NON-hidden hex-mate).
 * `B-visible-1` starts NOT Hidden, in Fire Zone of both Woods hexes, to
 *   exercise a real §11.7 Recon by Fire against `A-hidden-1` (and, once
 *   revealed, the cascade-reveal of `A-visible-1` sharing its hex per §11.1
 *   bullet 2).
 */
import { hexId } from '../../engine/hex';
import { colRowToAxial } from '../../engine/hexBoard';
import type { HexId, MapHexDef, MissionDef, UnitPlacement } from '../../engine/types';
import { UNIT_TEMPLATES } from '../units';

/** Column `c`, row `r` (this sandbox's own small grid) -> a real flat-top-adjacent HexId. */
function at(c: number, r: number): HexId {
  const a = colRowToAxial({ c, r });
  return hexId(a.q, a.r);
}

const HEXES: MapHexDef[] = [];
for (let r = 0; r < 3; r++) {
  for (let q = 0; q < 6; q++) {
    const def: MapHexDef = { id: at(q, r), terrain: 'open', label: `R${r}C${q}` };
    if (r === 1 && (q === 2 || q === 3)) def.terrain = 'woodsLight';
    HEXES.push(def);
  }
}

const UNITS: UnitPlacement[] = [
  // Germans (A), facing east (facing 0) — mirrors obstaclesSandbox's convention.
  { id: 'A-hidden-1', side: 'A', templateId: 'ger-rifle', hexId: at(2, 1), facing: 0, hidden: true },
  { id: 'A-visible-1', side: 'A', templateId: 'ger-rifle', hexId: at(1, 1), facing: 0 },
  // Soviets (B), facing west (facing 3).
  { id: 'B-hidden-1', side: 'B', templateId: 'sov-rifle', hexId: at(3, 1), facing: 3, hidden: true },
  { id: 'B-visible-1', side: 'B', templateId: 'sov-rifle', hexId: at(4, 1), facing: 3 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Hidden Units Sandbox references unknown unit template: ${id}`);
  return t;
});

export const HIDDEN_UNITS_SANDBOX: MissionDef = {
  id: 'sandbox-hidden-units',
  name: 'Hidden Units Sandbox (test)',
  roundsTotal: 5,
  seed: 111811,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: at(2, 0), vp: 1 }],
};
