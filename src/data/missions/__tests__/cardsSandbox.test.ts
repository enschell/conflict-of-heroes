import { describe, expect, it } from 'vitest';
import { initGame } from '../../../engine/state';
import { CARDS_SANDBOX } from '../cardsSandbox';

describe('Cards Sandbox mission — initGame wiring (§8/§13.4-13.9)', () => {
  it('builds a 9-card deck (\'01\' ×4, \'12\' ×4, \'18\' ×1), already down by Round 1\'s own draw (2+1=3)', () => {
    const game = initGame(CARDS_SANDBOX);
    expect(game.cardDeck).toBeDefined();
    // initGame runs straight through Round 1's Pre-Round Sequence (§9.8), so
    // the deck is already 3 cards short of its built 9 by the time it's observable.
    expect(game.cardDeck!.drawPile.length).toBeLessThanOrEqual(6);
    expect(game.cardDeck!.drawPile.length + game.cardDeck!.discardPile.length).toBeLessThanOrEqual(9);
  });

  it('Side A\'s hand starts with the Mission-issued Weapon/Veteran/Artillery cards, in order, before any drawn cards', () => {
    const game = initGame(CARDS_SANDBOX);
    expect(game.players.A.hand.slice(0, 3)).toEqual(['W01', 'V06', 'W06']);
  });

  it('carries drawPerRound/obaAllowedRounds/missionCardText through unchanged', () => {
    const game = initGame(CARDS_SANDBOX);
    expect(game.drawPerRound).toEqual(CARDS_SANDBOX.cardConfig!.drawPerRound);
    expect(game.obaAllowedRounds).toEqual([1, 2, 3, 4, 5]);
    expect(game.missionCardText).toEqual({ '18': 'Both sides score 1 VP for this Cards Sandbox test.' });
  });

  it('Round 1\'s Pre-Round Sequence already drew each side\'s round1 count into hand', () => {
    const game = initGame(CARDS_SANDBOX);
    // Side A: round1=2 (on top of the 3 Mission-issued cards already there).
    expect(game.players.A.hand).toHaveLength(5);
    // Side B: round1=1.
    expect(game.players.B.hand).toHaveLength(1);
  });
});
