import { describe, expect, it } from 'vitest';
import {
  becomingHiddenCandidates,
  hiddenMoveBase,
  isConcealed,
  isOutOfAllEnemyLOS,
  mustReveal,
  mustRevealAtHex,
  mustRevealForSharedHex,
  revealNumber,
  rollReveal,
} from '../hidden';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

describe('isConcealed (§11.5 Concealing Terrain)', () => {
  it('Defensive Terrain (isCover) counts as concealing', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'woodsLight');
    expect(isConcealed(s, h)).toBe(true);
  });

  it('Open ground with no smoke does not conceal', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'open');
    expect(isConcealed(s, h)).toBe(false);
  });

  it('Heavy Smoke conceals even Open Terrain; Light Smoke does not', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'open');
    s.hexes[h]!.features.smoke = 2;
    expect(isConcealed(s, h)).toBe(true);
    s.hexes[h]!.features.smoke = 1;
    expect(isConcealed(s, h)).toBe(false);
  });
});

describe('isOutOfAllEnemyLOS (§11.4)', () => {
  it('true with no enemies at all', () => {
    const s = baseState();
    const h = addHex(s, 0, 0);
    expect(isOutOfAllEnemyLOS(s, h, 'A')).toBe(true);
  });

  it('false when a non-hidden enemy has LOS', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'E1', 'B', 1, 0, 0);
    expect(isOutOfAllEnemyLOS(s, '0,0', 'A')).toBe(false);
  });

  it('a HIDDEN enemy does not count against staying hidden', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const e = addUnit(s, 'E1', 'B', 1, 0, 0);
    e.hidden = true;
    expect(isOutOfAllEnemyLOS(s, '0,0', 'A')).toBe(true);
  });

  it('false when LOS is blocked by intervening terrain', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsHeavy');
    addHex(s, 2, 0);
    addUnit(s, 'E1', 'B', 2, 0, 0);
    expect(isOutOfAllEnemyLOS(s, '0,0', 'A')).toBe(true);
  });
});

describe('mustRevealAtHex (§11.1 bullets 3-4)', () => {
  function scene(targetTerrain: 'open' | 'woodsLight' = 'open', dist = 1) {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addTemplate(s, rifleTemplate({ id: 'apc', kind: 'vehicle', propulsion: 'wheeled' }));
    for (let q = 0; q <= dist; q++) addHex(s, q, 0, q === dist ? targetTerrain : 'open');
    addUnit(s, 'E1', 'B', 0, 0, 0);
    return s;
  }

  it('Foot unit reveals in Open Terrain within 2 hexes of a non-hidden enemy', () => {
    const s = scene('open', 2);
    const u = addUnit(s, 'H1', 'A', 2, 0, 0);
    expect(mustRevealAtHex(s, u, u.hexId)).toBe(true);
  });

  it('Foot unit stays hidden in Open Terrain beyond 2 hexes', () => {
    const s = scene('open', 3);
    const u = addUnit(s, 'H1', 'A', 3, 0, 0);
    expect(mustRevealAtHex(s, u, u.hexId)).toBe(false);
  });

  it('Foot unit stays hidden in Concealing Terrain even adjacent to the enemy', () => {
    const s = scene('woodsLight', 1);
    const u = addUnit(s, 'H1', 'A', 1, 0, 0);
    expect(mustRevealAtHex(s, u, u.hexId)).toBe(false);
  });

  it('Wheeled/Tracked unit reveals in Open Terrain in LOS regardless of distance', () => {
    const s = scene('open', 3);
    const u = addUnit(s, 'H1', 'A', 3, 0, 0, 'apc');
    expect(mustRevealAtHex(s, u, u.hexId)).toBe(true);
  });

  it('no reveal if no non-hidden enemy has LOS to the hex', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsHeavy');
    addHex(s, 2, 0);
    addUnit(s, 'E1', 'B', 0, 0, 0);
    const u = addUnit(s, 'H1', 'A', 2, 0, 0);
    expect(mustRevealAtHex(s, u, u.hexId)).toBe(false);
  });
});

describe('mustRevealForSharedHex (§11.1 bullet 2)', () => {
  it('reveals when sharing a hex with a non-hidden unit (either side)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'E1', 'B', 0, 0, 0);
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(mustRevealForSharedHex(s, u)).toBe(true);
  });

  it('does NOT reveal when sharing a hex only with other hidden units', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    const e = addUnit(s, 'E1', 'B', 0, 0, 0);
    e.hidden = true;
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(mustRevealForSharedHex(s, u)).toBe(false);
  });
});

describe('mustReveal (combined sweep check)', () => {
  it('true if EITHER the shared-hex or the at-hex condition holds', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'E1', 'B', 0, 0, 0);
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(mustReveal(s, u)).toBe(true);
  });

  it('false when genuinely concealed and alone', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'woodsHeavy');
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(mustReveal(s, u)).toBe(false);
  });
});

describe('revealNumber (§11.7)', () => {
  it('6 + Terrain DR Modifier — matches the worked example (Light Woods, DM +1 -> 7)', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'woodsLight');
    expect(revealNumber(s, h)).toBe(7);
  });

  it('flat 6 on Open Terrain', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'open');
    expect(revealNumber(s, h)).toBe(6);
  });
});

describe('hiddenMoveBase (§11.3)', () => {
  it('flat 5AP with no hit markers', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(hiddenMoveBase(s, u)).toBe(5);
  });

  it('adds a Hit-Marker move-cost delta on top of the flat 5AP', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    const u = addUnit(s, 'H1', 'A', 0, 0, 0, 'rifle', ['cowering']);
    // 'cowering' adds +1AP to move/pivot per data/hitMarkers.ts.
    expect(hiddenMoveBase(s, u)).toBe(6);
  });
});

describe('becomingHiddenCandidates (§11.4)', () => {
  it('the current hex is a valid candidate when a blocking hex shields it from every enemy', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsHeavy'); // blocks LOS from the enemy through to the unit
    addHex(s, 2, 0);
    addUnit(s, 'E1', 'B', 2, 0, 0);
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(becomingHiddenCandidates(s, u)).toContain('0,0');
  });

  it('the current hex is excluded once an enemy has clear LOS to it', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'E1', 'B', 1, 0, 0);
    const u = addUnit(s, 'H1', 'A', 0, 0, 0);
    expect(becomingHiddenCandidates(s, u)).not.toContain('0,0');
  });
});

describe('rollReveal (§11.7)', () => {
  it('Hit Number = revealNumber - clamped CAP mod; reproduces the worked example (7 -> 5 via 2 CAPs)', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'woodsLight');
    const r = rollReveal(s, h, 2);
    expect(r.hitNumber).toBe(5);
  });

  it('CAP mod is clamped to +-2', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'open');
    const r = rollReveal(s, h, 5);
    expect(r.hitNumber).toBe(4); // 6 - clamp(5)=2
  });

  it('never mutates state.rng directly — returns an advanced copy', () => {
    const s = baseState();
    const h = addHex(s, 0, 0, 'open');
    const before = s.rng;
    rollReveal(s, h);
    expect(s.rng).toBe(before);
  });
});
