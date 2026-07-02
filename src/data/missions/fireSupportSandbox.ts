/**
 * Fire Support Sandbox — a NON-canonical test scenario (not from the Mission
 * Book), mirroring `sandbox.ts`'s Armor Sandbox but for M7 (§13–14).
 *
 * Each side has a Mortar and a Rifle Squad. The two Mortars are positioned so
 * neither has direct LOS to the other side's Rifle Squad (Heavy Woods at
 * F07/G07 blocks it) — Indirect Attacks and Fire Smoke need a Spotter Hex,
 * exercising §13.2–§13.3 and §14 without altering Mission 1.
 */
import type { MissionDef, UnitPlacement } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);

const UNITS: UnitPlacement[] = [
  // Germans (A): Mortar at H07 can't directly see D07 (blocked by Heavy Woods
  // at F07/G07) — indirect via a Spotter Hex like H08 or F08 (within 2, clear LOS).
  { id: 'G-mortar', side: 'A', templateId: 'ger-mortar', hexId: at('H07'), facing: 5 },
  { id: 'G-rifle', side: 'A', templateId: 'ger-rifle', hexId: at('H08'), facing: 5 },
  // Soviets (B): Mortar at D06 can't directly see H07 either — indirect via
  // Spotter Hex D08 (within 2, clear LOS to both).
  { id: 'S-mortar', side: 'B', templateId: 'sov-mortar', hexId: at('D06'), facing: 1 },
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: at('D07'), facing: 2 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Fire Support Sandbox references unknown unit template: ${id}`);
  return t;
});

export const FIRE_SUPPORT_SANDBOX: MissionDef = {
  id: 'sandbox-fire-support',
  name: 'Fire Support Sandbox (test)',
  roundsTotal: 5,
  seed: 130725,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: MISSION1_MAP,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: at('I06'), vp: 1 }],
};
