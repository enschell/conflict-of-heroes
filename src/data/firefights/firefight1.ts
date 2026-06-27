/**
 * Firefight 1 — "Partisans" (the Section-1 teaching scenario).
 *
 * IMPORTANT: in the rulebook FF1 is played BEFORE cards are introduced
 * (Section 2), so it uses NO action cards — the card subsystem is a later
 * milestone (FF2+). Setup below (forces, CAPs, rounds, objectives) is our own
 * balanced design in the spirit of "Partisans", not a copy of the published
 * scenario card.
 *
 *   Side A = Germans (attack from the west).
 *   Side B = Soviet partisans (hold the hamlet).
 *   Win by VP at the end of 5 rounds: destroyed units + held objectives
 *   (central strongpoint 6,3 = 5VP, crossroads 3,3 = 3VP).
 */
import type { FirefightDef, UnitPlacement } from '../../engine/types';
import { PARTISANS_MAP } from '../maps/partisans';
import { UNIT_TEMPLATES } from '../units';

// Germans face east (facing 0); partisans face west (facing 3).
const UNITS: UnitPlacement[] = [
  // --- Germans (A), entering from the west ---
  { id: 'G-rifle-1', side: 'A', templateId: 'ger-rifle', hexId: '0,2', facing: 0 },
  { id: 'G-lmg', side: 'A', templateId: 'ger-lmg', hexId: '0,3', facing: 0 },
  { id: 'G-rifle-2', side: 'A', templateId: 'ger-rifle', hexId: '0,4', facing: 0 },
  { id: 'G-pioneer', side: 'A', templateId: 'ger-pioneer', hexId: '1,2', facing: 0 },
  { id: 'G-hmg', side: 'A', templateId: 'ger-hmg', hexId: '1,4', facing: 0 },

  // --- Soviet partisans (B), holding the hamlet ---
  { id: 'S-partisan-1', side: 'B', templateId: 'sov-partisan', hexId: '6,3', facing: 3 },
  { id: 'S-partisan-2', side: 'B', templateId: 'sov-partisan', hexId: '5,3', facing: 3 },
  { id: 'S-rifle', side: 'B', templateId: 'sov-rifle', hexId: '6,2', facing: 3 },
  { id: 'S-smg', side: 'B', templateId: 'sov-smg', hexId: '7,3', facing: 3 },
  { id: 'S-maxim', side: 'B', templateId: 'sov-maxim', hexId: '6,4', facing: 3 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Firefight 1 references unknown unit template: ${id}`);
  return t;
});

export const FIREFIGHT_1: FirefightDef = {
  id: 'ff1-partisans',
  name: 'Firefight 1 — Partisans',
  roundsTotal: 5,
  seed: 20260626,
  caps: { A: 6, B: 5 },
  nations: { A: ['germans'], B: ['soviets'] },
  hexes: PARTISANS_MAP,
  units: UNITS,
  templates,
  victoryHexes: [
    { hexId: '6,3', vp: 5 }, // central strongpoint
    { hexId: '3,3', vp: 3 }, // road crossroads
  ],
};
