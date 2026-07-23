/** Special Units (rulebook §16): Trucks/Wagons, Turreted, Open-Topped, APC Transport Bonus. */
import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import { legalActionsForUnit, modifiedActionCost } from '../actions';
import { isArmoredMarker } from '../../data/hitMarkers';
import { reduce } from '../reducer';
import { updateVictoryHexControl } from '../victory';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

const tankTemplate = (over: Partial<Parameters<typeof rifleTemplate>[0]> = {}) =>
  rifleTemplate({
    id: 'tank',
    name: 'Tank',
    kind: 'vehicle',
    dr: { front: 16, flank: 13, color: 'blue' },
    propulsion: 'tracked',
    bonusMoves: 1,
    ...over,
  });

describe('§16.2 Turreted Vehicles', () => {
  function turretScene(turreted: boolean): GameState {
    const s = baseState();
    addTemplate(s, tankTemplate({ turreted, fp: { red: 5, blue: 5 } }));
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, -1, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0, 'tank'); // facing East (0)
    addUnit(s, 'TGT', 'B', -1, 0, 0, 'rifle'); // directly behind — out of the front arc
    return s;
  }

  it('a non-Turreted Vehicle cannot fire outside its Arc of Fire', () => {
    const s = turretScene(false);
    const ctx = attackContext(s, s.units['ATK']!, s.units['TGT']!);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toMatch(/out of arc/);
  });

  it('a Turreted Vehicle may fire outside its Arc, paying +2AP (§16.2)', () => {
    const s = turretScene(true);
    const ctx = attackContext(s, s.units['ATK']!, s.units['TGT']!);
    expect(ctx.legal).toBe(true);
    expect(ctx.outOfArc).toBe(true);

    const base = s.templates['tank']!.apToFire;
    const cost = modifiedActionCost(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TGT' });
    expect(cost).toBe(base + 2);

    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TGT' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.events.some((e) => e.type === 'spent' && new RegExp(`cost ${base + 2}`).test(e.text))).toBe(
      true,
    );
  });

  it('no arc penalty when firing within the Arc of Fire', () => {
    const s = baseState();
    addTemplate(s, tankTemplate({ turreted: true }));
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0, 'tank');
    addUnit(s, 'TGT', 'B', 1, 0, 0, 'rifle'); // straight ahead — in arc
    const cost = modifiedActionCost(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TGT' });
    expect(cost).toBe(s.templates['tank']!.apToFire);
  });
});

describe('§16.3 Self-Propelled Guns (SPGs)', () => {
  // SPGs get no dedicated code: they're simply any Vehicle without `turreted`,
  // which the §16.2 arc-of-fire check (combat.ts's attackContext) already
  // denies fire outside its Arc for by default. "Must Pivot to Track a
  // Target" (§16.3) is just the ordinary 1AP PIVOT Action (§4.6) — this test
  // exercises the full denied-then-Pivot-then-legal loop with a real
  // non-Turreted vehicle template (matching `ger-pzjg35r`'s own comment).
  it('may only Attack within its Arc of Fire, and must Pivot (a Move Action) to face a new Target', () => {
    const s = baseState();
    addTemplate(s, tankTemplate({ id: 'spg', fp: { red: 2, blue: 7 } })); // turreted left unset
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, -1, 0);
    addUnit(s, 'SPG', 'A', 0, 0, 0, 'spg'); // facing East (0)
    addUnit(s, 'TGT', 'B', -1, 0, 0, 'rifle'); // directly behind — out of arc

    const denied = reduce(s, { type: 'FIRE', attackerId: 'SPG', targetId: 'TGT' });
    expect(denied.events[0]?.type).toBe('illegal');
    expect(denied.events[0]?.text).toMatch(/out of arc/);

    const pivoted = reduce(s, { type: 'PIVOT', unitId: 'SPG', facing: 3 }); // face West, toward TGT
    expect(pivoted.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(pivoted.state.units['SPG']!.facing).toBe(3);

    // Now in-arc: a ranged Attack is legal with no Turreted +2AP surcharge.
    const nextTurnState = { ...pivoted.state, currentSide: 'A' as const }; // PIVOT already handed the turn to B
    const ctx = attackContext(nextTurnState, nextTurnState.units['SPG']!, nextTurnState.units['TGT']!);
    expect(ctx.legal).toBe(true);
    expect(ctx.outOfArc).toBe(false);
  });
});

describe('§16.5 Open-Topped Vehicles', () => {
  function scene(openTopped: boolean, seed = 1): GameState {
    const s = baseState(seed);
    addTemplate(s, rifleTemplate({ id: 'inf', fp: { red: 3, blue: 0 } }));
    addTemplate(s, tankTemplate({ id: 'apc', openTopped, dr: { front: 8, flank: 8, color: 'blue' } }));
    addHex(s, 0, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0, 'inf');
    addUnit(s, 'TGT', 'B', 0, 0, 0, 'apc');
    return s;
  }

  it("treats the target's Flank Defense as red in Close Combat (vs blue normally)", () => {
    const open = scene(true);
    const closed = scene(false);
    expect(closeCombatContext(open, open.units['ATK']!, open.units['TGT']!).fpColor).toBe('red');
    expect(closeCombatContext(closed, closed.units['ATK']!, closed.units['TGT']!).fpColor).toBe('blue');
  });

  it('pulls a Soft Target Hit Marker from red-FP Close Combat, not an Armored one', () => {
    let checked = false;
    for (let seed = 1; seed <= 300 && !checked; seed++) {
      const s = scene(true, seed);
      const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: 'ATK', targetId: 'TGT' });
      const tgt = res.state.units['TGT'];
      if (tgt && tgt.hitMarkers.length === 1) {
        checked = true;
        expect(isArmoredMarker(tgt.hitMarkers[0]!)).toBe(false);
      }
    }
    expect(checked).toBe(true);
  });
});

describe('§16.6 APC Transport Bonus', () => {
  function riderScene(apcTransport: boolean): { s: GameState } {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'rifle', dr: { front: 12, flank: 11, color: 'red' } }));
    addTemplate(s, tankTemplate({ id: 'carrier', apcTransport }));
    addTemplate(s, rifleTemplate({ id: 'gun', fp: { red: 3, blue: 0 } }));
    addHex(s, 0, 0);
    addHex(s, -1, 0);
    addUnit(s, 'CARRIER', 'A', 0, 0, 0, 'carrier');
    const rider = addUnit(s, 'RIDER', 'A', 0, 0, 0, 'rifle');
    rider.carriedBy = 'CARRIER';
    addUnit(s, 'ATK', 'B', -1, 0, 0, 'gun'); // behind the carrier — target's flank
    return { s };
  }

  it('gains +2DR from all flanks for a Soft Target being Transported by an APC', () => {
    const withApc = riderScene(true).s;
    const withoutApc = riderScene(false).s;
    const ctxApc = attackContext(withApc, withApc.units['ATK']!, withApc.units['RIDER']!);
    const ctxPlain = attackContext(withoutApc, withoutApc.units['ATK']!, withoutApc.units['RIDER']!);
    expect(ctxApc.legal).toBe(true);
    expect(ctxPlain.legal).toBe(true);
    expect(ctxApc.isFlank).toBe(true);
    expect(ctxPlain.isFlank).toBe(true);
    expect(ctxPlain.dr).toBe(11); // raw flank DR — no Vehicle Cover leak while Transported (§15.15)
    expect(ctxApc.dr).toBe(13); // +2DR APC Transport Bonus
  });

  it('also applies the +2DR Bonus in Close Combat (attacker sharing the carried Unit\'s hex)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'rifle', dr: { front: 12, flank: 11, color: 'red' } }));
    addTemplate(s, tankTemplate({ id: 'carrier', apcTransport: true }));
    addTemplate(s, rifleTemplate({ id: 'atk', fp: { red: 4, blue: 0 } }));
    addHex(s, 0, 0);
    addUnit(s, 'CARRIER', 'A', 0, 0, 0, 'carrier');
    const rider = addUnit(s, 'RIDER', 'A', 0, 0, 0, 'rifle');
    rider.carriedBy = 'CARRIER';
    addUnit(s, 'ATK', 'B', 0, 0, 0, 'atk'); // same hex — Close Combat
    const ctx = closeCombatContext(s, s.units['ATK']!, s.units['RIDER']!);
    expect(ctx.legal).toBe(true);
    expect(ctx.dr).toBe(11 + 2); // Flank Defense + APC Transport Bonus
  });
});

describe('§16.1 Trucks and Wagons', () => {
  const truckTemplate = (over: Partial<Parameters<typeof rifleTemplate>[0]> = {}) =>
    tankTemplate({
      id: 'truck',
      propulsion: 'wheeled',
      attackMode: 'closeCombatOnly',
      cannotControlHex: true,
      noCapLossOnDestroy: true,
      ...over,
    });

  it('cannot take control of a Hex (§4.4)', () => {
    const s = baseState();
    addTemplate(s, truckTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'TRUCK', 'A', 0, 0, 0, 'truck');
    s.victory.victoryHexes = [{ hexId: '0,0', vp: 1 }];
    updateVictoryHexControl(s);
    expect(s.hexes['0,0']!.features.control).toBeUndefined();
  });

  it('destroyed: does not adjust the CAPs Track but still counts for VP', () => {
    const s = baseState();
    addTemplate(s, truckTemplate({ vp: 2 }));
    addTemplate(s, tankTemplate({ id: 'gun', fp: { red: 50, blue: 50 } }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'TRUCK', 'A', 0, 0, 0, 'truck');
    addUnit(s, 'ATK', 'B', 1, 0, 3, 'gun');
    s.currentSide = 'B';
    const capBefore = s.players.A.capCurrent;
    const lossesBefore = s.players.A.unitLosses;
    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TRUCK' });
    expect(res.state.units['TRUCK']).toBeUndefined(); // destroyed
    expect(res.state.players.A.unitLosses).toBe(lossesBefore); // no CAP-track adjustment
    expect(res.state.players.A.capCurrent).toBe(capBefore);
    expect(res.state.players.B.vp).toBe(2); // still counts for VP
  });

  it('a Truck (closeCombatOnly) may Close Combat but not fire at range', () => {
    const s = baseState();
    addTemplate(s, truckTemplate());
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'TRUCK', 'A', 0, 0, 0, 'truck');
    addUnit(s, 'RANGED', 'B', 1, 0, 3, 'rifle');
    addUnit(s, 'SAMEHEX', 'B', 0, 0, 3, 'rifle');

    const acts = legalActionsForUnit(s, 'TRUCK');
    expect(acts.some((a) => a.type === 'FIRE')).toBe(false);
    expect(acts.some((a) => a.type === 'CLOSE_COMBAT')).toBe(true);

    expect(reduce(s, { type: 'FIRE', attackerId: 'TRUCK', targetId: 'RANGED' }).events[0]?.type).toBe(
      'illegal',
    );
    const cc = reduce(s, { type: 'CLOSE_COMBAT', attackerId: 'TRUCK', targetId: 'SAMEHEX' });
    expect(cc.events.some((e) => e.type === 'illegal')).toBe(false);
  });

  it('a Wagon (attackMode: none) may not attack at all', () => {
    const s = baseState();
    addTemplate(s, tankTemplate({ id: 'wagon', propulsion: 'wheeled', attackMode: 'none' }));
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'WAGON', 'A', 0, 0, 0, 'wagon');
    addUnit(s, 'RANGED', 'B', 1, 0, 3, 'rifle');
    addUnit(s, 'SAMEHEX', 'B', 0, 0, 3, 'rifle');

    const acts = legalActionsForUnit(s, 'WAGON');
    expect(acts.some((a) => a.type === 'FIRE')).toBe(false);
    expect(acts.some((a) => a.type === 'CLOSE_COMBAT')).toBe(false);

    expect(reduce(s, { type: 'FIRE', attackerId: 'WAGON', targetId: 'RANGED' }).events[0]?.type).toBe(
      'illegal',
    );
    expect(
      reduce(s, { type: 'CLOSE_COMBAT', attackerId: 'WAGON', targetId: 'SAMEHEX' }).events[0]?.type,
    ).toBe('illegal');
  });
});
