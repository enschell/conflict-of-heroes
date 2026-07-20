/**
 * Weapon Cards W01-W07 (rulebook §8.3, catalog transcribed in
 * rules/08-battle-cards.md's "Card Catalog" section). Mission-specified
 * availability (`MissionDef.cardConfig.initialHand`), not drawn per-round.
 * Discarded when played, same default as Battle Cards (no stated exception).
 */
import type { CardDef } from '../../engine/types';

export const WEAPON_CARDS: Record<string, CardDef> = {
  W01: {
    id: 'W01',
    name: 'Grenades',
    category: 'weapon',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green 0 — the printed stat block was OCR-garbled
    // (col-merged with an adjacent Veteran card), see rules/08's Card Catalog note.
    cost: { color: 'green', amount: 0 },
    effectText:
      "For use by German Foot Units only. Short Range and Close Combat bonus modifiers apply; Defender's Terrain modifiers apply; no Long Range.",
    restrictedTo: { nation: 'germans', kind: 'infantry' },
  },
  W02: {
    id: 'W02',
    name: 'Molotov Cocktail',
    category: 'weapon',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green 0 — see rules/08's Card Catalog note.
    cost: { color: 'green', amount: 0 },
    effectText:
      "For use by Soviet Foot Units only. Close Combat bonus modifiers apply; may be used from an adjacent Hex at a -2AR Long Range penalty; Defender's Terrain modifiers apply.",
    restrictedTo: { nation: 'soviets', kind: 'infantry' },
  },
  W03: {
    id: 'W03',
    name: 'Demolitions',
    category: 'weapon',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green 0 — see rules/08's Card Catalog note.
    cost: { color: 'green', amount: 0 },
    effectText:
      'For use by German Foot Units only. May only be used at 0 range and Close Combat; Terrain modifiers do not apply. No Long Range, no Terrain Modifiers.',
    restrictedTo: { nation: 'germans', kind: 'infantry' },
  },
  W04: {
    id: 'W04',
    name: 'Sturmovik Airplane',
    category: 'weapon',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green 0 — see rules/08's Card Catalog note.
    cost: { color: 'green', amount: 0 },
    effectText:
      'Place the Airplane Counter (§16.7); defender may attack it with available Anti-Air (if hit, remove the plane; if not, the plane attacks all Target flanks in front of it with no Short Range or Elevation bonus).',
    restrictedTo: { nation: 'soviets' },
  },
  W05: {
    id: 'W05',
    name: 'Stuka Airplane',
    category: 'weapon',
    type: 'action',
    count: 1,
    // TODO(cost-color): best-guess Green 0 — see rules/08's Card Catalog note.
    cost: { color: 'green', amount: 0 },
    effectText: 'Same Airplane mechanic as the Sturmovik card (§16.7), German counterpart.',
    restrictedTo: { nation: 'germans' },
  },
  W06: {
    id: 'W06',
    name: 'Divisional Artillery (German 15cm FH18)',
    category: 'weapon',
    type: 'artillery',
    count: 1,
    effectText:
      'Off-Board Artillery: plan an Artillery Strike during this Pre-Round Sequence, resolve during the next one (§13.4-13.9). Strikes target a Hex and its 6 surrounding Hexes. Terrain modifiers apply, except Woods Air Bursts (§13.9).',
    battleIcons: { he: true },
    restrictedTo: { nation: 'germans' },
    // TODO(firepower): only `red: 5` is oracle-confirmed (§13.9's worked example:
    // "the card's red 5 Firepower, resulting in a 5 Hit Number"); `blue: 7` is an
    // unconfirmed second printed number, see rules/08's Card Catalog note.
    firepower: { red: 5, blue: 7 },
  },
  W07: {
    id: 'W07',
    name: 'Divisional Artillery (Soviet 152mm m.36)',
    category: 'weapon',
    type: 'artillery',
    count: 1,
    effectText:
      'Off-Board Artillery: plan an Artillery Strike during this Pre-Round Sequence, resolve during the next one (§13.4-13.9). Strikes target a Hex and its 6 surrounding Hexes. Terrain modifiers apply, except Woods Air Bursts (§13.9).',
    battleIcons: { he: true },
    restrictedTo: { nation: 'soviets' },
    // TODO(firepower): see W06's identical note — both nations' Divisional
    // Artillery share one printed stat block in the source.
    firepower: { red: 5, blue: 7 },
  },
};
