/**
 * Armor Sandbox — a NON-canonical test scenario (not from the Mission Book).
 *
 * Reuses the Map 1 board with a tank + rifle squad on each side placed a couple
 * of hexes apart, so vehicles, the Armored Target hit deck (§15.13) and vehicle
 * movement (§15) can be exercised in the browser without altering the real,
 * infantry-only Mission 1. Also carries two extra German rifles adjacent to the
 * lone Soviet rifle (§10.6 Group Close Combat test): one Move each stacks them
 * both into S-rifle's hex, ready for a Group Attack there. A German SdKfz 251
 * half-track sits on the O02-O03 Road pair (Open terrain at O04) for a §16.4
 * Mobile Vehicle click-through: regular Move to O03 (Road→Road), then a Track
 * Bonus Move off-road onto O04 — a plain Wheeled vehicle couldn't take that
 * second hex at all. A German PzJg 35R (§16.5 Open-Topped SPG) sits at F04, so
 * its blue Flank DR flipping to red vs CC/HE can be exercised against it. A
 * German PaK 40 and Soviet 45mm AT Gun — both §16.7 Field Guns — share a Hex
 * with their side's Vehicle (G-pz3/S-t34) for an immediate same-Hex Load
 * (§15.7): either may be Loaded/towed at will (no Immobilized/Stunned
 * precondition, unlike a damaged Vehicle) as well as fire/Close-Combat on
 * their own.
 */
import type { MissionDef, UnitPlacement } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);

const UNITS: UnitPlacement[] = [
  // Germans (A) facing north (facing 1 = NE).
  { id: 'G-pz3', side: 'A', templateId: 'ger-pz3', hexId: at('F06'), facing: 1 },
  { id: 'G-rifle', side: 'A', templateId: 'ger-rifle', hexId: at('F05'), facing: 1 },
  // Two more German rifles, each one Hex from S-rifle (§10.6 Group Close Combat test).
  { id: 'G-rifle2', side: 'A', templateId: 'ger-rifle', hexId: at('I07'), facing: 3 },
  { id: 'G-rifle3', side: 'A', templateId: 'ger-rifle', hexId: at('G08'), facing: 1 },
  // §16.4 Mobile Vehicle test: on the O02-O03 Road pair, with Open terrain at O04.
  { id: 'G-sdkfz251', side: 'A', templateId: 'ger-sdkfz251', hexId: at('O02'), facing: 0 },
  // §16.5 Open-Topped SPG test.
  { id: 'G-pzjg35r', side: 'A', templateId: 'ger-pzjg35r', hexId: at('F04'), facing: 1 },
  // §16.7 Field Gun test: stacked with G-pz3 for an immediate same-Hex Load.
  { id: 'G-pak40', side: 'A', templateId: 'ger-pak40', hexId: at('F06'), facing: 1 },
  // Soviets (B) facing south (facing 5 = SE), two rows north.
  { id: 'S-t34', side: 'B', templateId: 'sov-t34a', hexId: at('H06'), facing: 5 },
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: at('H07'), facing: 5 },
  // §16.7 Field Gun test: stacked with S-t34 for an immediate same-Hex Load.
  { id: 'S-atgun45', side: 'B', templateId: 'sov-atgun45', hexId: at('H06'), facing: 5 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Armor sandbox references unknown unit template: ${id}`);
  return t;
});

export const ARMOR_SANDBOX: MissionDef = {
  id: 'sandbox-armor',
  name: 'Armor Sandbox (test)',
  roundsTotal: 5,
  seed: 424242,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: MISSION1_MAP,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: at('I06'), vp: 1 }],
};
