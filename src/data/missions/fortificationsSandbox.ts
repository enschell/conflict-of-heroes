/**
 * Fortifications Sandbox — a NON-canonical test scenario (not from the
 * Mission Book), for M10 Phase 2 (§17.1-§17.6, §17.11-§17.12). Like
 * `obstaclesSandbox.ts`, this needs its own small map: Map 1 has no
 * Fortifications either.
 *
 * Row 0 — a Trench (§17.4): any Foot Unit may occupy it (any facing), +2DR
 *   from any direction; impassable to Wheeled, no Tracked Bonus Move in/out.
 * Row 1 — a Bunker (§17.5) facing west (toward the German approach), with a
 *   destructible 16 Defense (matching the rulebook's own Panzer-vs-Bunker
 *   worked example): occupying locks facing/Arc of Fire, no Pivot, +5DR
 *   attacked within its Arc / +3DR Flank-attacked.
 * Row 2 — open ground for the Hasty Defense demo (§17.6): a Foot Unit may
 *   build one on itself (5AP), see it stripped by its own next Move/Pivot, or
 *   remove it freely at will.
 * Row 3 — open ground for the Flamethrower demo (§18.0-§18.1): a German
 *   Pioneers Squad (`hasFlamethrower`/`pioneer`) can attack with its
 *   Flamethrower (flat 3 red/3 blue FP, max Range 1, always vs Flank DR,
 *   ignores all DR mods but Smoke) against either the Soviet infantry or the
 *   T-34 tank — a live example of the Flamethrower's blue-FP profile against
 *   an Armored Target.
 *
 * Germans (A) start west facing east; Soviets (B) start at the Trench/Bunker
 * Hexes (occupying them is a live in-browser test, not pre-set at Mission
 * setup — `UnitPlacement` has no `occupyingFortification` field, by design:
 * occupying is always a player choice, §17.2/17.3).
 */
import { hexId } from '../../engine/hex';
import type { MapHexDef, MissionDef, UnitPlacement } from '../../engine/types';
import { UNIT_TEMPLATES } from '../units';

const HEXES: MapHexDef[] = [];
for (let r = 0; r < 4; r++) {
  for (let q = 0; q < 6; q++) {
    const def: MapHexDef = { id: hexId(q, r), terrain: 'open', label: `R${r}C${q}` };
    if (r === 0 && q === 2) def.fortification = { kind: 'trench' };
    if (r === 1 && q === 2) def.fortification = { kind: 'bunker', facing: 3, destroyDr: 16 };
    HEXES.push(def);
  }
}

const UNITS: UnitPlacement[] = [
  // Germans (A), facing east (facing 0).
  { id: 'G-rifle', side: 'A', templateId: 'ger-rifle', hexId: hexId(0, 0), facing: 0 },
  { id: 'G-pz3', side: 'A', templateId: 'ger-pz3', hexId: hexId(0, 1), facing: 0 }, // for the §17.11 two-roll destroy test
  { id: 'G-rifle2', side: 'A', templateId: 'ger-rifle', hexId: hexId(0, 2), facing: 0 }, // for the Hasty Defense demo
  { id: 'G-pioneer', side: 'A', templateId: 'ger-pioneer', hexId: hexId(0, 3), facing: 0 }, // §18.0-§18.1 Flamethrower demo
  // Soviets (B), facing west (facing 3) — start AT the Trench/Bunker Hexes;
  // occupying is a live choice the player makes in-browser.
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: hexId(2, 0), facing: 3 },
  { id: 'S-maxim', side: 'B', templateId: 'sov-maxim', hexId: hexId(2, 1), facing: 3 },
  { id: 'S-t34', side: 'B', templateId: 'sov-t34a', hexId: hexId(3, 3), facing: 3 }, // Flamethrower-vs-Armor target
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Fortifications Sandbox references unknown unit template: ${id}`);
  return t;
});

export const FORTIFICATIONS_SANDBOX: MissionDef = {
  id: 'sandbox-fortifications',
  name: 'Fortifications Sandbox (test)',
  roundsTotal: 5,
  seed: 170925,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: hexId(4, 2), vp: 1 }],
};
