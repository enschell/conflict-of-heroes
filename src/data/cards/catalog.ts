/**
 * Merged Card catalog lookup — the one import site the engine/UI uses.
 * See BATTLE_CARDS/WEAPON_CARDS/VETERAN_CARDS for the transcription itself
 * and rules/08-battle-cards.md's "Card Catalog" section for methodology.
 */
import type { CardDef, CardId } from '../../engine/types';
import { BATTLE_CARDS } from './battleCards';
import { WEAPON_CARDS } from './weaponCards';
import { VETERAN_CARDS } from './veteranCards';

export const CARD_CATALOG: Record<CardId, CardDef> = {
  ...BATTLE_CARDS,
  ...WEAPON_CARDS,
  ...VETERAN_CARDS,
};

export function cardDef(id: CardId): CardDef | undefined {
  return CARD_CATALOG[id];
}
