/**
 * PLAY_CARD / PLAN_OBA_STRIKE (§8.5-8.6, §13.5) — reducer-level integration:
 * cost paths, discard rules, Action-vs-Bonus turn/Stress consequences, the
 * Hidden Units battle-icon exemption, and full Pre-Round-Sequence OBA wiring.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { CARD_CATALOG } from '../../data/cards/catalog';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function scene() {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  addHex(s, 0, 0);
  addHex(s, 1, 0);
  const rif = addUnit(s, 'RIF', 'A', 0, 0, 0);
  return { s, rif };
}

describe('PLAY_CARD — Green cost (§8.6)', () => {
  it('a Fresh Unit pays AP + a Spent Check; failing it becomes Spent, still Stressed', () => {
    const { s } = scene();
    s.players.A.hand = ['03']; // Follow Me!, Green 2
    let found: ReturnType<typeof reduce> | null = null;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s2 = { ...s, rng: { state: seed } };
      const res = reduce(s2, { type: 'PLAY_CARD', side: 'A', cardId: '03', unitId: 'RIF' });
      if (res.state.units['RIF']!.status === 'spent') found = res;
    }
    expect(found).not.toBeNull();
    const unit = found!.state.units['RIF']!;
    expect(unit.status).toBe('spent');
    expect(unit.stressed).toBe(true);
    expect(found!.state.players.A.hand).not.toContain('03'); // Battle Card discards
    expect(found!.state.currentSide).toBe('B'); // Action-type card ends the Turn
  });

  it('denies a Spent Unit playing at nonzero cost without CAPs to zero it', () => {
    const { s, rif } = scene();
    rif.status = 'spent';
    s.players.A.hand = ['03'];
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '03', unitId: 'RIF' });
    expect(res.events[0]!.type).toBe('illegal');
  });

  it('a Spent Unit reduced to 0AP with CAPs may play with no Spent Check', () => {
    const { s, rif } = scene();
    rif.status = 'spent';
    s.players.A.hand = ['03'];
    s.players.A.capCurrent = 5;
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '03', unitId: 'RIF', capCostReduce: 2 });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['RIF']!.status).toBe('spent'); // unchanged — no check ran
    expect(res.state.players.A.capCurrent).toBe(3);
  });
});

describe('PLAY_CARD — Blue cost (§8.6)', () => {
  it('needs no Unit, spends CAPs directly, no Spent Check', () => {
    const s = baseState();
    s.players.A.hand = ['12']; // Swift Action, Blue 1
    s.players.A.capCurrent = 5;
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '12' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.players.A.capCurrent).toBe(4);
    expect(res.state.players.A.hand).not.toContain('12');
  });
});

describe('PLAY_CARD — Action vs Bonus turn/Stress consequences (§8.5)', () => {
  it('a Bonus-type card does not Stress or end the Turn', () => {
    const { s } = scene();
    s.players.A.hand = ['13']; // Luck!, Bonus, Green 0
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '13', unitId: 'RIF' });
    expect(res.state.units['RIF']!.stressed).toBe(false);
    expect(res.state.currentSide).toBe('A'); // unchanged — not an Action
  });

  it('an Action-type card Stresses its Unit and ends the Turn', () => {
    const { s } = scene();
    s.players.A.hand = ['01']; // Adrenaline, Action, Green 0
    const rif2 = addUnit(s, 'RIF2', 'A', 0, 0, 0);
    rif2.status = 'spent'; // Adrenaline is played BY a Spent Unit per its own text
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '01', unitId: 'RIF2' });
    expect(res.state.units['RIF2']!.stressed).toBe(true);
    expect(res.state.currentSide).toBe('B');
  });
});

describe('PLAY_CARD — discard rules (§8.0/§8.2)', () => {
  it('a Battle Card is removed from hand and pushed to the shared discard pile', () => {
    const { s } = scene();
    s.players.A.hand = ['13'];
    s.cardDeck = { drawPile: [], discardPile: [] };
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '13', unitId: 'RIF' });
    expect(res.state.players.A.hand).toEqual([]);
    expect(res.state.cardDeck!.discardPile).toEqual(['13']);
  });

  it('a Veteran Card is NOT discarded when played', () => {
    const { s } = scene();
    s.players.A.hand = ['V06']; // Iron Will, Green 0
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: 'V06', unitId: 'RIF' });
    expect(res.state.players.A.hand).toEqual(['V06']);
  });
});

describe('PLAY_CARD — Hidden Units battle icon exemption (§8.9/§11.1)', () => {
  it('a card with the Hidden battle icon lets a Hidden Unit play without revealing', () => {
    const original = CARD_CATALOG['13']!.battleIcons;
    // Synthetic test-only flag — no real card is confirmed to carry this icon
    // yet (rules/08's Card Catalog note); this only verifies the mechanism.
    CARD_CATALOG['13']!.battleIcons = { hidden: true };
    try {
      const { s, rif } = scene();
      rif.hidden = true;
      s.players.A.hand = ['13'];
      const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '13', unitId: 'RIF' });
      expect(res.state.units['RIF']!.hidden).toBe(true);
    } finally {
      CARD_CATALOG['13']!.battleIcons = original;
    }
  });

  it('a card WITHOUT the Hidden battle icon reveals a Hidden Unit that plays it', () => {
    const { s, rif } = scene();
    rif.hidden = true;
    s.players.A.hand = ['13']; // Luck! — no Hidden battle icon in the real catalog
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '13', unitId: 'RIF' });
    expect(res.state.units['RIF']!.hidden).toBeUndefined();
  });
});

describe('PLAY_CARD — restrictedTo denial (Weapon Cards)', () => {
  it('denies a Soviet Unit playing a German-only Weapon Card', () => {
    const { s, rif } = scene();
    rif.nation = 'soviets';
    s.players.A.hand = ['W01']; // Grenades: German Foot Units only
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: 'W01', unitId: 'RIF' });
    expect(res.events[0]!.type).toBe('illegal');
  });
});

describe('legalActionsForUnit — PLAY_CARD enumeration', () => {
  it('offers a Green-cost card in hand that this Unit qualifies for', () => {
    const { s } = scene();
    s.players.A.hand = ['01'];
    const acts = legalActionsForUnit(s, 'RIF');
    expect(acts.some((a) => a.type === 'PLAY_CARD' && a.cardId === '01')).toBe(true);
  });

  it('does not offer a Weapon Card this Unit is restricted away from', () => {
    const { s, rif } = scene();
    rif.nation = 'soviets';
    s.players.A.hand = ['W01'];
    const acts = legalActionsForUnit(s, 'RIF');
    expect(acts.some((a) => a.type === 'PLAY_CARD')).toBe(false);
  });
});

describe('Mission Card auto-resolve does not reach PLAY_CARD (§8.7)', () => {
  it('a Mission-type card is denied by canPlayCard/doPlayCard if dispatched directly', () => {
    const { s } = scene();
    s.players.A.hand = ['18']; // Score — should never be in a hand in practice, but denial must hold
    const res = reduce(s, { type: 'PLAY_CARD', side: 'A', cardId: '18', unitId: 'RIF' });
    expect(res.events[0]!.type).toBe('illegal');
  });
});

describe('PLAN_OBA_STRIKE + full Pre-Round Sequence resolution (§13.5-13.6)', () => {
  it('planning queues a strike for round+1, discards the card; it resolves automatically when that Round starts', () => {
    const s = baseState();
    s.roundsTotal = 5;
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'HMG', 'A', 0, 0, 0);
    s.players.A.hand = ['W06'];

    const planned = reduce(s, { type: 'PLAN_OBA_STRIKE', side: 'A', cardId: 'W06', targetHexId: '0,0' });
    expect(planned.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(planned.state.players.A.hand).not.toContain('W06');
    expect(planned.state.pendingObaStrikes).toEqual([
      { side: 'A', cardId: 'W06', targetHexId: '0,0', resolveRound: 2 },
    ]);

    // Both sides Pass consecutively -> Round 1 ends -> Round 2's Pre-Round
    // Sequence (startRound) should resolve the strike planned above.
    const firstPass = reduce(planned.state, { type: 'PASS' });
    const secondPass = reduce(firstPass.state, { type: 'PASS' });
    expect(secondPass.state.round).toBe(2);
    expect(secondPass.state.pendingObaStrikes).toEqual([]); // consumed
    expect(secondPass.state.log.some((e) => e.type === 'oba' && e.text.includes('Drift Check'))).toBe(true);
  });
});
