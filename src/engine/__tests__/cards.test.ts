/**
 * Battle/Weapon/Veteran Cards (§8) — deck construction, draw, and Play Card
 * legality. OBA (§13.4-13.9) has its own file, oba.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildBattleDeck, canPlayCard, drawBattleCards } from '../cards';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

describe('buildBattleDeck (§8.1)', () => {
  it('repeats each id by its catalog count', () => {
    const deck = buildBattleDeck(['01', '02']);
    expect(deck.filter((id) => id === '01')).toHaveLength(4);
    expect(deck.filter((id) => id === '02')).toHaveLength(8);
    expect(deck).toHaveLength(12);
  });

  it('skips an unknown id defensively', () => {
    expect(buildBattleDeck(['does-not-exist'])).toEqual([]);
  });
});

describe('drawBattleCards (§9.8)', () => {
  function stateWithDeck(drawPile: string[]): GameState {
    const s = baseState();
    s.cardDeck = { drawPile, discardPile: [] };
    return s;
  }

  it('draws the requested count of ordinary Battle Cards into hand', () => {
    const s = stateWithDeck(['01', '02', '03']);
    drawBattleCards(s, 'A', 2);
    expect(s.players.A.hand).toEqual(['01', '02']);
    expect(s.cardDeck!.drawPile).toEqual(['03']);
    expect(s.log.some((e) => e.text.includes('draws Adrenaline'))).toBe(true);
  });

  it('a Mission-type card auto-resolves and redraws for free (net count unaffected)', () => {
    // '18' Score is Mission-type; the redraw after it still nets 2 real cards in hand.
    const s = stateWithDeck(['18', '01', '02']);
    drawBattleCards(s, 'A', 2);
    expect(s.players.A.hand).toEqual(['01', '02']);
    expect(s.cardDeck!.discardPile).toEqual(['18']);
    expect(s.log.some((e) => e.type === 'card' && e.text.includes('Score'))).toBe(true);
  });

  it('uses Mission-specific text when authored, else a generic fallback', () => {
    const s = stateWithDeck(['19', '01']);
    s.missionCardText = { '19': 'A Soviet convoy appears at K09!' };
    drawBattleCards(s, 'A', 1);
    expect(s.log.some((e) => e.text.includes('A Soviet convoy appears at K09!'))).toBe(true);

    const s2 = stateWithDeck(['19', '01']);
    drawBattleCards(s2, 'A', 1);
    expect(s2.log.some((e) => e.text.includes('no Mission-specific text authored'))).toBe(true);
  });

  it('Halt Order (card 20) ends the Mission immediately, no redraw', () => {
    const s = stateWithDeck(['20', '01', '02']);
    drawBattleCards(s, 'A', 2);
    expect(s.phase).toBe('gameOver');
    expect(s.players.A.hand).toEqual([]); // never reached the '01'/'02' draws
    expect(s.cardDeck!.drawPile).toEqual(['01', '02']); // untouched
  });

  it('an emptied deck just stops drawing, no error', () => {
    const s = stateWithDeck(['01']);
    expect(() => drawBattleCards(s, 'A', 5)).not.toThrow();
    expect(s.players.A.hand).toEqual(['01']);
    expect(s.cardDeck!.drawPile).toEqual([]);
  });

  it('no-op entirely when the Mission has no cardConfig/cardDeck', () => {
    const s = baseState();
    expect(() => drawBattleCards(s, 'A', 3)).not.toThrow();
    expect(s.players.A.hand).toEqual([]);
  });
});

describe('canPlayCard (§8.5-8.6)', () => {
  function sceneWithHand(cardId: string): { s: GameState } {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'RIF', 'A', 0, 0, 0);
    s.players.A.hand = [cardId];
    return { s };
  }

  it('denies a card not in hand', () => {
    const { s } = sceneWithHand('02');
    expect(canPlayCard(s, 'A', '01').legal).toBe(false);
  });

  it('denies Mission-type and Artillery-type cards (played automatically / via Plan OBA Strike)', () => {
    const { s } = sceneWithHand('18');
    expect(canPlayCard(s, 'A', '18').legal).toBe(false);
    const { s: s2 } = sceneWithHand('W06');
    expect(canPlayCard(s2, 'A', 'W06').legal).toBe(false);
  });

  it('Green-cost card requires a Unit', () => {
    const { s } = sceneWithHand('01');
    expect(canPlayCard(s, 'A', '01').legal).toBe(false);
    expect(canPlayCard(s, 'A', '01', 'RIF').legal).toBe(true);
  });

  it('Blue-cost card needs no Unit', () => {
    const { s } = sceneWithHand('12'); // Swift Action, Blue
    expect(canPlayCard(s, 'A', '12').legal).toBe(true);
  });

  it('denies playing another side\'s Unit', () => {
    const { s } = sceneWithHand('01');
    addUnit(s, 'ENEMY', 'B', 0, 0, 0);
    expect(canPlayCard(s, 'A', '01', 'ENEMY').legal).toBe(false);
  });

  it('enforces a Weapon Card\'s nation/kind restriction', () => {
    const { s } = sceneWithHand('W01'); // Grenades: German Foot Units only
    expect(canPlayCard(s, 'A', 'W01', 'RIF').legal).toBe(true);
    const soviet = addUnit(s, 'SOV', 'A', 0, 0, 0);
    soviet.nation = 'soviets';
    expect(canPlayCard(s, 'A', 'W01', 'SOV').legal).toBe(false);
  });
});
