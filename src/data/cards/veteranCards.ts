/**
 * Veteran Cards V01-V10 (rulebook §8.2, catalog transcribed in
 * rules/08-battle-cards.md's "Card Catalog" section). Mission-issued starting
 * hands (`MissionDef.cardConfig.initialHand`), NOT discarded when played —
 * they grant a Unit extra capability for the entire Mission.
 */
import type { CardDef } from '../../engine/types';

export const VETERAN_CARDS: Record<string, CardDef> = {
  V01: {
    id: 'V01',
    name: 'Rapid Move',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'For use by Foot & Vehicle Units. Move an extra Open-Terrain Hex for this Move Action; Action Cost is the sum of the move costs for every Hex moved into.',
  },
  V02: {
    id: 'V02',
    name: 'Better Equipped',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'Lower an Attack\'s Hit Number by 2 (any Attack type); +2 Range for this Attack. The Hit Number cannot be modified further (by CAPs).',
  },
  V03: {
    id: 'V03',
    name: 'Experienced',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 2 },
    effectText:
      'Modify a Spent Check (d10) result by 1, after the roll. Only the Spent Check die may be modified with this card.',
  },
  V04: {
    id: 'V04',
    name: 'Motivated Leader',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'Lower a Rally Number by 2; cannot be modified further with CAPs. (Still reduced normally by Defensive Terrain / other friendly un-hit Units sharing the Hex, §7.8.)',
  },
  V05: {
    id: 'V05',
    name: 'Blood and Honor',
    category: 'veteran',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'Played during the opponent\'s Turn: your Unit makes a simultaneous Close Combat counter-attack and its own Spent Check when attacked in Close Combat; a Spent Unit may counter-attack if its cost is lowered to 0AP. This counter-attack Stresses the Unit.',
  },
  V06: {
    id: 'V06',
    name: 'Iron Will',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    cost: { color: 'green', amount: 0 },
    effectText:
      "Ignore every positive and negative modifying stat on the Unit's current Hit Marker, for one Action (e.g. a Stunned Unit may move or fire; a Cowering Unit gets no DR bonus).",
  },
  V07: {
    id: 'V07',
    name: 'Concealed Fire',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'A Hidden Unit is NOT revealed when it executes an Attack, unless a 1 is rolled on either d6 Battle Die.',
  },
  V08: {
    id: 'V08',
    name: 'Combat Hardened',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      'Only one d6 may ever be rolled per d6 die-roll. After a d6 roll, may re-roll any one die; the d10 Spent Check die may never be rerolled with this card.',
  },
  V09: {
    id: 'V09',
    name: 'Use of Terrain',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    cost: { color: 'green', amount: 0 },
    effectText:
      "Played during the opponent's Turn: has no effect in Defensive Terrain (has effect in Open-Terrain Hill Hexes only). The Unit's Defense Ratings are increased by 1 when attacked in Open Terrain.",
  },
  V10: {
    id: 'V10',
    name: 'Overrun',
    category: 'veteran',
    type: 'bonus',
    count: 1,
    cost: { color: 'green', amount: 0 },
    effectText:
      'After a Unit completes a Close Combat Attack Action, it may take a separate 1-Hex Move Action (taken after the CC Spent Check resolves; no Bonus Moves; this Move gains no Stress Penalty from the preceding CC Attack).',
  },
};
