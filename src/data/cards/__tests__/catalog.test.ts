import { describe, expect, it } from 'vitest';
import { BATTLE_CARDS } from '../battleCards';
import { WEAPON_CARDS } from '../weaponCards';
import { VETERAN_CARDS } from '../veteranCards';
import { CARD_CATALOG, cardDef } from '../catalog';

const ALL = [BATTLE_CARDS, WEAPON_CARDS, VETERAN_CARDS];

describe('Card catalog integrity', () => {
  it('every entry\'s own id matches its record key', () => {
    for (const table of ALL) {
      for (const [key, def] of Object.entries(table)) {
        expect(def.id).toBe(key);
      }
    }
  });

  it('no id collides across Battle/Weapon/Veteran tables', () => {
    const seen = new Set<string>();
    for (const table of ALL) {
      for (const id of Object.keys(table)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('CARD_CATALOG merges all three tables and cardDef() resolves every id', () => {
    for (const table of ALL) {
      for (const id of Object.keys(table)) {
        expect(cardDef(id)).toBe(table[id]);
      }
    }
    expect(Object.keys(CARD_CATALOG)).toHaveLength(
      Object.keys(BATTLE_CARDS).length + Object.keys(WEAPON_CARDS).length + Object.keys(VETERAN_CARDS).length,
    );
  });

  it('cardDef() returns undefined for an unknown id', () => {
    expect(cardDef('does-not-exist')).toBeUndefined();
  });

  it('every card has a positive count and non-empty name/effectText', () => {
    for (const def of Object.values(CARD_CATALOG)) {
      expect(def.count).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.effectText.length).toBeGreaterThan(0);
    }
  });

  it('every mission-type card is flagged missionSpecific and has no cost', () => {
    for (const def of Object.values(CARD_CATALOG)) {
      if (def.type === 'mission') {
        expect(def.missionSpecific).toBe(true);
        expect(def.cost).toBeUndefined();
      }
    }
  });

  it('every artillery-type card has firepower and no PLAY_CARD cost', () => {
    for (const def of Object.values(CARD_CATALOG)) {
      if (def.type === 'artillery') {
        expect(def.firepower).toBeDefined();
        expect(def.cost).toBeUndefined();
      }
    }
  });

  it('every action/bonus-type card has a cost', () => {
    for (const def of Object.values(CARD_CATALOG)) {
      if (def.type === 'action' || def.type === 'bonus') {
        expect(def.cost).toBeDefined();
      }
    }
  });

  it('only Veteran-category cards belong to the VETERAN_CARDS table', () => {
    for (const def of Object.values(VETERAN_CARDS)) {
      expect(def.category).toBe('veteran');
    }
    for (const def of Object.values(BATTLE_CARDS)) {
      expect(def.category).toBe('battle');
    }
    for (const def of Object.values(WEAPON_CARDS)) {
      expect(def.category).toBe('weapon');
    }
  });

  it('Battle Card 01-13 example from §8.1 red box resolves to real defs with the right counts', () => {
    // "This deck will thus include all four copies of Battle Card 01, eight of Card 02..."
    expect(BATTLE_CARDS['01']!.count).toBe(4);
    expect(BATTLE_CARDS['02']!.count).toBe(8);
  });
});
