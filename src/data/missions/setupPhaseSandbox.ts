/**
 * Setup Phase Sandbox — a NON-canonical test scenario (not from the Mission
 * Book). Exercises the Pre-Mission Setup phase (Mission-configurable, added
 * on user request): no fixed starting Units at all — both sides place their
 * entire force from a Setup Pool before Round 1 begins. Side B sets up
 * first (a non-default `setupFirstSide`, so the "goes first" wiring is
 * genuinely exercised, not just the A-default path), then Side A. Also
 * exercises the new `specificRounds` Victory VP mode: I06 only awards VP in
 * Rounds 3, 4, and 5.
 */
import type { MissionDef } from '../../engine/types';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { UNIT_TEMPLATES } from '../units';

const at = (label: string) => hexIdForLabel(label);

const templateIds = ['ger-rifle', 'sov-rifle'] as const;
const templates = templateIds.map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Setup Phase sandbox references unknown unit template: ${id}`);
  return t;
});

export const SETUP_PHASE_SANDBOX: MissionDef = {
  id: 'sandbox-setup-phase',
  name: 'Setup Phase Sandbox (test)',
  roundsTotal: 5,
  seed: 20260716,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: MISSION1_MAP,
  units: [],
  templates,
  setupForces: [
    { id: 'A-setup-1', side: 'A', templateId: 'ger-rifle', facing: 1 },
    { id: 'A-setup-2', side: 'A', templateId: 'ger-rifle', facing: 1 },
    { id: 'B-setup-1', side: 'B', templateId: 'sov-rifle', facing: 4 },
    { id: 'B-setup-2', side: 'B', templateId: 'sov-rifle', facing: 4 },
  ],
  setupFirstSide: 'B',
  setupInstructions: 'Side B sets up first, anywhere south of the objective; Side A then sets up anywhere north of it.',
  victoryHexes: [{ hexId: at('I06'), vp: 1, awardTiming: 'specificRounds', awardRounds: [3, 4, 5] }],
};
