/**
 * Cards Sandbox — a NON-canonical test scenario (not from the Mission Book),
 * for §8 Battle/Weapon/Veteran Cards + §13.4-13.9 OBA. Mirrors
 * `hiddenUnitsSandbox.ts`'s small-grid convention (`colRowToAxial`, not raw
 * `hexId(q, r)`).
 *
 * `cardConfig.battleCardIds` includes one of each Battle Card TYPE icon this
 * build's framework-only scope actually differentiates: '01' Adrenaline
 * (Action, Green 0), '12' Swift Action (Action, Blue 1), '18' Score (Mission
 * — `missionCardText` authored below, since it prints "See Mission Setup").
 * Side A's `initialHand` adds one of each remaining category: 'W01' Grenades
 * (Weapon, German-restricted), 'V06' Iron Will (Veteran, never discards),
 * and 'W06' Divisional Artillery (Artillery — triggers OBA via
 * `PLAN_OBA_STRIKE`). `obaAllowedRounds` covers every Round so a Strike can
 * be planned and resolved without waiting for a specific Round.
 */
import { hexId } from '../../engine/hex';
import { colRowToAxial } from '../../engine/hexBoard';
import type { HexId, MapHexDef, MissionDef, UnitPlacement } from '../../engine/types';
import { UNIT_TEMPLATES } from '../units';

function at(c: number, r: number): HexId {
  const a = colRowToAxial({ c, r });
  return hexId(a.q, a.r);
}

const HEXES: MapHexDef[] = [];
for (let r = 0; r < 3; r++) {
  for (let q = 0; q < 6; q++) {
    HEXES.push({ id: at(q, r), terrain: 'open', label: `R${r}C${q}` });
  }
}

const UNITS: UnitPlacement[] = [
  { id: 'A-rifle-1', side: 'A', templateId: 'ger-rifle', hexId: at(1, 1), facing: 0 },
  { id: 'A-rifle-2', side: 'A', templateId: 'ger-rifle', hexId: at(1, 0), facing: 0 },
  { id: 'B-rifle-1', side: 'B', templateId: 'sov-rifle', hexId: at(4, 1), facing: 3 },
];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Cards Sandbox references unknown unit template: ${id}`);
  return t;
});

export const CARDS_SANDBOX: MissionDef = {
  id: 'sandbox-cards',
  name: 'Cards Sandbox (test)',
  roundsTotal: 5,
  seed: 80108,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: [{ hexId: at(2, 0), vp: 1 }],
  cardConfig: {
    battleCardIds: ['01', '12', '18'],
    drawPerRound: {
      A: { round1: 2, eachRoundAfter: 1 },
      B: { round1: 1, eachRoundAfter: 1 },
    },
    initialHand: { A: ['W01', 'V06', 'W06'] },
    obaAllowedRounds: [1, 2, 3, 4, 5],
  },
  missionCardText: {
    '18': 'Both sides score 1 VP for this Cards Sandbox test.',
  },
};
