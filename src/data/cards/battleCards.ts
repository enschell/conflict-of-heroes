/**
 * Battle Cards 01-24 (rulebook §8.1, catalog transcribed in
 * rules/08-battle-cards.md's "Card Catalog" section — read that file for the
 * per-card cost-color/type-icon methodology and flagged best-guesses before
 * touching this data). Discarded when played (§8.0) — none of these are
 * Veteran Cards despite Card #07's flavor name "Veteran NCO".
 */
import type { CardDef } from '../../engine/types';

export const BATTLE_CARDS: Record<string, CardDef> = {
  '01': {
    id: '01',
    name: 'Adrenaline',
    category: 'battle',
    type: 'action',
    count: 4,
    cost: { color: 'green', amount: 0 },
    effectText: 'Any Spent Unit or Group may take any one Action at 0AP Cost.',
  },
  '02': {
    id: '02',
    name: 'Command Action',
    category: 'battle',
    type: 'action',
    count: 8,
    cost: { color: 'green', amount: 0 },
    effectText: 'Any Unit (Fresh or Spent) or Group may take any one Action at 0AP Cost.',
    battleIcons: { group: true },
  },
  '03': {
    id: '03',
    name: 'Follow Me!',
    category: 'battle',
    type: 'action',
    count: 2,
    // TODO(cost-color): best-guess Green — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'green', amount: 2 },
    effectText:
      "Automatically rally a Unit, even if in a Hex with an enemy Unit or if the Hit Marker has a 'No Rally' condition. (\"Destroyed\" Hit Markers with an \"XX\" marking can never be rallied.)",
  },
  '04': {
    id: '04',
    name: 'Rally Up!',
    category: 'battle',
    type: 'action',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      'Any Unit or Group may roll to attempt to rally (not in Close Combat). Each attempt must be rolled separately.',
    battleIcons: { group: true },
  },
  '05': {
    id: '05',
    name: 'Rapid Deployment',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      'After taking a full Move Action and its Spent Check, the Unit may move an extra Hex into any passable terrain at 0 Cost. May not be used on Immobilized, Pinned, or Stunned Units. Intervening Mines still affect the moving Unit.',
  },
  '06': {
    id: '06',
    name: 'Battlefield Confusion',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      "Played during the opponent's Turn: add a 3AP penalty to an enemy Unit's Action Cost, before its Spent Check roll. The opponent may still spend CAPs to reduce the Action Cost.",
  },
  '07': {
    id: '07',
    name: 'Veteran NCO',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText: 'Re-roll any one of your own die, after rolling it (d10, d6, or 2d6).',
  },
  '08': {
    id: '08',
    name: 'Frontline Officer',
    category: 'battle',
    type: 'bonus',
    count: 2,
    // TODO(cost-color): best-guess Green — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'green', amount: 2 },
    effectText:
      "Roll 1d6, add the result to your CAPs Track for this Round only. Added once; the CAP total may temporarily exceed the Mission's starting CAPs.",
  },
  '09': {
    id: '09',
    name: 'Seek Cover!',
    category: 'battle',
    type: 'action',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      'Place a Hasty Defense marker on any Fresh or Spent Unit or Group (incl. vehicles) not in Close Combat.',
  },
  '10': {
    id: '10',
    name: 'Sniper Fire',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      'Roll 1d6: opponent loses CAPs this Round equal to the result — 1=0 CAPs, 2 or 3=1 CAP, 4 or 5=2 CAPs, 6=3 CAPs.',
  },
  '11': {
    id: '11',
    name: 'Careful Aiming',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      "Add +2 to a Unit's Firepower for this Attack (may also add +2AR to a Group Attack).",
    battleIcons: { group: true },
  },
  '12': {
    id: '12',
    name: 'Swift Action',
    category: 'battle',
    type: 'action',
    count: 4,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      "Take an Action; when done, take another Action — two separately paid Actions in the same Turn (the 1st does not Stress the 2nd). The two Actions may be taken by different Units.",
  },
  '13': {
    id: '13',
    name: 'Luck!',
    category: 'battle',
    type: 'bonus',
    count: 2,
    cost: { color: 'green', amount: 0 },
    effectText:
      'After any of your die rolls, roll 1d6 to modify the result: 1 = -3, 2-6 = +2, added to the original roll.',
  },
  '14': {
    id: '14',
    name: 'Scout Teams',
    category: 'battle',
    type: 'bonus',
    count: 2,
    // TODO(cost-color): best-guess Blue — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'blue', amount: 1 },
    effectText:
      "Before or after a Unit's Action, either reveal hidden enemy Units within LOS and 3 Hexes of a Unit, or hide an eligible Unit.",
  },
  '15': {
    id: '15',
    name: 'Bogged Down',
    category: 'battle',
    type: 'bonus',
    count: 1,
    cost: { color: 'green', amount: 0 },
    effectText:
      "Played during the opponent's Turn: roll 2d6 >= 4 to mark an enemy Vehicle that just moved as Immobilized (place an Immobilized Marker underneath it); it may not move on its own for the rest of the Round (may still fire if able), until towed out by another Vehicle.",
  },
  '16': {
    id: '16',
    name: 'Obstacle-Clearing',
    category: 'battle',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'green', amount: 2 },
    effectText:
      'An un-hit friendly Unit not in Close Combat may remove one Obstacle from the (non-CC) Hex it occupies.',
  },
  '17': {
    id: '17',
    name: 'Mine-Laying',
    category: 'battle',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green — unconfirmed, see rules/08's Card Catalog.
    cost: { color: 'green', amount: 2 },
    effectText:
      'An un-hit friendly Unit not in Close Combat may lay a Mine within one Hex of itself, not on an enemy-occupied Hex; may be placed Hidden if out of enemy LOS.',
  },
  '18': {
    id: '18',
    name: 'Score',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText:
      "Both players score VP as directed by the Mission's own scoring instructions, if the Mission mixes this card into the deck. Then draw a new Battle Card.",
  },
  '19': {
    id: '19',
    name: 'Mission Event',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText:
      'Resolve the Mission Event as directed by the Mission, if mixed into the deck. Then draw a new Battle Card.',
  },
  '20': {
    id: '20',
    name: 'Halt Order',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    endsMission: true,
    effectText:
      'If mixed into the deck and drawn, the Mission ends immediately; both players total and score End Game Victory Points. (No redraw — the Mission is over.)',
  },
  '21': {
    id: '21',
    name: 'Objective 1',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText: "Defines a player's secret Objective, as specified by the Mission. Then draw a new Battle Card.",
  },
  '22': {
    id: '22',
    name: 'Objective 2',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText: "Defines a player's secret Objective, as specified by the Mission. Then draw a new Battle Card.",
  },
  '23': {
    id: '23',
    name: 'Objective 3',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText: "Defines a player's secret Objective, as specified by the Mission. Then draw a new Battle Card.",
  },
  '24': {
    id: '24',
    name: 'Objective 4',
    category: 'battle',
    type: 'mission',
    count: 1,
    missionSpecific: true,
    effectText: "Defines a player's secret Objective, as specified by the Mission. Then draw a new Battle Card.",
  },
};
