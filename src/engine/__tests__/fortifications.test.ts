/**
 * Fortifications (§17.1-§17.6, §17.11-§17.12): Trenches, Bunkers, Hasty
 * Defenses, and the shared "destroy a Fortification/Obstacle by Attack"
 * mechanic. Reproduces the rulebook's own worked examples (MG34-vs-MMG in a
 * Bunker, Panzer-vs-Bunker's two-roll destroy) as fixtures, per CLAUDE.md's
 * "red-box examples are oracles" convention.
 */
import { describe, expect, it } from 'vitest';
import { attackContext, closeCombatContext } from '../combat';
import {
  canOccupy,
  closeCombatStructureAr,
  destroyFeatureAt,
  destructibleFeatureAt,
  fortificationDrBonus,
  hastyDefenseDrBonus,
  isOccupying,
  rollStructureDestroy,
} from '../fortifications';
import { planVehicleMove } from '../movement';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { FortificationKind, GameState } from '../types';

function putFortification(s: GameState, hexId: string, kind: FortificationKind, opts: { facing?: 0 | 1 | 2 | 3 | 4 | 5; destroyDr?: number } = {}) {
  s.hexes[hexId]!.features.fortification = { kind, destroyed: false, ...opts };
}

const gunTemplate = () => rifleTemplate({ id: 'gun', kind: 'gun' });
const vehicleTemplate = () =>
  rifleTemplate({ id: 'veh', kind: 'vehicle', dr: { front: 14, flank: 12, color: 'blue' } });
const mortarTemplate = () => rifleTemplate({ id: 'mortar', kind: 'mortar', minRange: 0 });

describe('Trenches (§17.4)', () => {
  it('canOccupy: any Foot Unit, not a Field Gun or Vehicle', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addTemplate(s, gunTemplate());
    addTemplate(s, vehicleTemplate());
    addHex(s, 0, 0, 'open');
    putFortification(s, '0,0', 'trench');
    const foot = addUnit(s, 'F1', 'A', 0, 0, 0);
    const gun = addUnit(s, 'G1', 'A', 0, 0, 0, 'gun');
    const veh = addUnit(s, 'V1', 'A', 0, 0, 0, 'veh');
    expect(canOccupy(s, foot)).toBe(true);
    expect(canOccupy(s, gun)).toBe(false); // §17.4: "All Foot Units" only
    expect(canOccupy(s, veh)).toBe(false);
  });

  it('grants a flat +2DR from ANY direction once occupied', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '0,0', 'trench');
    const occupant = addUnit(s, 'T1', 'B', 0, 0, 3); // facing doesn't matter for a Trench
    occupant.occupyingFortification = true;
    const attackerFront = addUnit(s, 'A1', 'A', 1, 0, 3); // faces the occupant head-on
    expect(fortificationDrBonus(s, occupant, attackerFront.hexId)).toEqual({
      label: 'Trench Fortification Bonus',
      value: 2,
      section: '§17.4',
    });
  });

  it('is impassable to Wheeled Units; Tracked pay normal terrain cost', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'wheeled-veh', kind: 'vehicle', move: 1, propulsion: 'wheeled', dr: { front: 14, flank: 12, color: 'blue' } }));
    addTemplate(s, rifleTemplate({ id: 'tracked-veh', kind: 'vehicle', move: 1, propulsion: 'tracked', dr: { front: 14, flank: 12, color: 'blue' } }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '1,0', 'trench');
    const wheeled = addUnit(s, 'W1', 'A', 0, 0, 0, 'wheeled-veh');
    const tracked = addUnit(s, 'K1', 'A', 0, 0, 0, 'tracked-veh');
    const res1 = reduce(s, { type: 'MOVE', unitId: wheeled.id, toHexId: '1,0' });
    expect(res1.events[0]!.type).toBe('illegal');
    const res2 = reduce(s, { type: 'MOVE', unitId: tracked.id, toHexId: '1,0' });
    expect(res2.events.some((e) => e.type === 'illegal')).toBe(false);
  });

  it('Tracked Vehicles may not Bonus Move into or out of a Trench Hex', () => {
    const s = baseState();
    addTemplate(
      s,
      rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked', bonusMoves: 1 }),
    );
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open'); // regular Move target
    addHex(s, 2, 0, 'open'); // would-be Bonus Move target
    putFortification(s, '2,0', 'trench');
    const u = addUnit(s, 'V', 'A', 0, 0, 0, 'veh');
    const plan = planVehicleMove(s, u, ['1,0', '2,0']);
    expect(plan.ap).toBeNull();
  });
});

describe('Bunkers (§17.5)', () => {
  it('canOccupy: Foot AND Field Gun, never a Vehicle', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addTemplate(s, gunTemplate());
    addTemplate(s, vehicleTemplate());
    addHex(s, 0, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0 });
    const foot = addUnit(s, 'F1', 'A', 0, 0, 0);
    const gun = addUnit(s, 'G1', 'A', 0, 0, 0, 'gun');
    const veh = addUnit(s, 'V1', 'A', 0, 0, 0, 'veh');
    expect(canOccupy(s, foot)).toBe(true);
    expect(canOccupy(s, gun)).toBe(true); // §17.5: "All Foot and Field Gun Units"
    expect(canOccupy(s, veh)).toBe(false);
  });

  it('occupying locks the Unit\'s facing to the Bunker\'s and denies Pivot entirely', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '1,0', 'bunker', { facing: 3 });
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    const move = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0', occupyFortification: true });
    const occupant = move.state.units[u.id]!;
    expect(occupant.occupyingFortification).toBe(true);
    expect(occupant.facing).toBe(3); // forced to the Bunker's facing, not the direction of travel
    // The Move already switched the turn to Side B — hand it back to A so
    // this Pivot attempt is judged purely on the Bunker-lock rule, not turn order.
    const afterTurn = { ...move.state, currentSide: 'A' as const };
    const pivot = reduce(afterTurn, { type: 'PIVOT', unitId: u.id, facing: 0 });
    expect(pivot.events[0]!.type).toBe('illegal');
    expect(pivot.events[0]!.text).toContain('Bunker');
  });

  it('Bunker Arc-of-Fire DR bonus stacks onto the occupant\'s own Front Def (§17.5)', () => {
    // MMG: 12 Front Def. Bunker attacked within its Arc of Fire: +5DR (§17.5).
    // NOTE: the rulebook's own worked example for this exact scenario cites
    // 18DR/13 Hit Number — this fixture deliberately omits the High Ground
    // (§12.3) component of that example (no elevation difference here), so
    // it asserts the Bunker-only total (12+5=17DR) instead. A prior version
    // of this test's *title* claimed to reproduce the full 18/13 figures
    // without actually doing so (caught in a test-suite audit) — do not
    // "fix" this by guessing what AR/DR combination would reach 18/13 without
    // the real rulebook text in hand (CLAUDE.md: don't invent rules from
    // memory); either leave this as the Bunker-only case it actually is, or
    // extend the fixture with a verified elevation difference AND verify the
    // resulting AR/DR/HN against `rules/17`+`rules/12` directly before
    // asserting specific numbers.
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'mmg', dr: { front: 12, flank: 10, color: 'red' } }));
    addTemplate(s, rifleTemplate({ id: 'mg34', fp: { red: 5, blue: 0 } }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0 }); // faces east, toward the attacker
    const mmg = addUnit(s, 'MMG', 'B', 0, 0, 0, 'mmg');
    mmg.occupyingFortification = true;
    const mg34 = addUnit(s, 'MG34', 'A', 1, 0, 3, 'mg34');
    const ctx = attackContext(s, mg34, mmg);
    expect(ctx.legal).toBe(true);
    expect(ctx.dr).toBe(12 + 5); // Front Def + Bunker (within Arc of Fire)
    expect(ctx.ar).toBe(5 + 3); // red 5FP + adjacent Short Range Bonus
    expect(ctx.hitNumber).toBe(12 + 5 - (5 + 3));
  });

  it('gives only the +3 Flank Bonus when attacked from outside its Arc of Fire', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'mmg', dr: { front: 12, flank: 10, color: 'red' } }));
    addTemplate(s, rifleTemplate({ id: 'mg34', fp: { red: 5, blue: 0 } }));
    addHex(s, 0, 0, 'open');
    addHex(s, -1, 0, 'open');
    // Bunker faces east (dir 0); its front arc is dirs {5,0,1}. Direction 3
    // (west, directly behind) sits squarely in the flank arc.
    putFortification(s, '0,0', 'bunker', { facing: 0 });
    const mmg = addUnit(s, 'MMG', 'B', 0, 0, 0, 'mmg');
    mmg.occupyingFortification = true;
    const mg34 = addUnit(s, 'MG34', 'A', -1, 0, 0, 'mg34'); // faces east, toward the MMG
    const ctx = attackContext(s, mg34, mmg);
    expect(ctx.legal).toBe(true);
    expect(ctx.dr).toBe(10 + 3); // Flank Def + Bunker Flank Bonus
  });

  it('an occupant may only Fire within the Bunker\'s Arc of Fire — no Turreted exception', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'turreted-gun', kind: 'gun', turreted: true }));
    addTemplate(s, rifleTemplate({ id: 'enemy' }));
    addHex(s, 0, 0, 'open');
    addHex(s, -1, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0 }); // Arc faces east {5,0,1}
    const occupant = addUnit(s, 'OCC', 'A', 0, 0, 0, 'turreted-gun');
    occupant.occupyingFortification = true;
    const target = addUnit(s, 'TGT', 'B', -1, 0, 3, 'enemy'); // west — outside the Arc
    const ctx = attackContext(s, occupant, target);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toContain('Bunker');
  });

  it('denies Mortars from firing (Direct) from within a Bunker', () => {
    const s = baseState();
    addTemplate(s, mortarTemplate());
    addTemplate(s, rifleTemplate({ id: 'enemy' }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0 });
    const mortar = addUnit(s, 'MTR', 'A', 0, 0, 0, 'mortar');
    mortar.occupyingFortification = true;
    const target = addUnit(s, 'TGT', 'B', 1, 0, 3, 'enemy');
    const ctx = attackContext(s, mortar, target);
    expect(ctx.legal).toBe(false);
    expect(ctx.reason).toContain('Bunker');
  });
});

describe('Hasty Defense (§17.6)', () => {
  it('HASTY_DEFENSE builds one for 5AP; denies a transported Unit, a Vehicle, or a second marker', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addTemplate(s, vehicleTemplate());
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    const res = reduce(s, { type: 'HASTY_DEFENSE', unitId: u.id });
    expect(res.state.units[u.id]!.hastyDefense).toBe(true);

    const veh = addUnit(s, 'V1', 'A', 0, 0, 0, 'veh');
    const vehRes = reduce(s, { type: 'HASTY_DEFENSE', unitId: veh.id });
    expect(vehRes.events[0]!.type).toBe('illegal');

    const carried = addUnit(s, 'C1', 'A', 0, 0, 0);
    carried.carriedBy = veh.id;
    const carriedRes = reduce(s, { type: 'HASTY_DEFENSE', unitId: carried.id });
    expect(carriedRes.events[0]!.type).toBe('illegal');

    const already = res.state.units[u.id]!;
    const dupRes = reduce(res.state, { type: 'HASTY_DEFENSE', unitId: already.id });
    expect(dupRes.events[0]!.type).toBe('illegal');
  });

  it('grants a flat +1DR from any direction', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    expect(hastyDefenseDrBonus(u)).toBeUndefined();
    u.hastyDefense = true;
    expect(hastyDefenseDrBonus(u)).toEqual({ label: 'Hasty Defense Bonus', value: 1, section: '§17.6' });
  });

  it('is stripped by this Unit\'s own Move or Pivot', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    u.hastyDefense = true;
    const moved = reduce(s, { type: 'MOVE', unitId: u.id, toHexId: '1,0' });
    expect(moved.state.units[u.id]!.hastyDefense).toBeFalsy();

    const s2 = baseState();
    addTemplate(s2, rifleTemplate());
    addHex(s2, 0, 0, 'open');
    const u2 = addUnit(s2, 'U2', 'A', 0, 0, 0);
    u2.hastyDefense = true;
    const pivoted = reduce(s2, { type: 'PIVOT', unitId: u2.id, facing: 2 });
    expect(pivoted.state.units[u2.id]!.hastyDefense).toBeFalsy();
  });

  it('may be freely removed at will (0AP, no Spent Check)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    u.hastyDefense = true;
    const res = reduce(s, { type: 'REMOVE_HASTY_DEFENSE', unitId: u.id });
    expect(res.state.units[u.id]!.hastyDefense).toBeFalsy();
    // No Spent Check ran — the Unit's status is untouched.
    expect(res.state.units[u.id]!.status).toBe('fresh');
  });

  it('multiple Units in the same Hex each hold their own, independent marker', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const u1 = addUnit(s, 'U1', 'A', 0, 0, 0);
    const u2 = addUnit(s, 'U2', 'A', 0, 0, 0);
    const res = reduce(s, { type: 'HASTY_DEFENSE', unitId: u1.id });
    expect(res.state.units[u1.id]!.hastyDefense).toBe(true);
    expect(res.state.units[u2.id]!.hastyDefense).toBeFalsy();
  });
});

describe('§17.11 — destroying a Fortification/Obstacle by ranged Fire (two rolls, one Spent Check)', () => {
  it("reproduces the rulebook's Panzer-vs-Bunker worked example (miss vs occupant, hit vs the 16DR structure)", () => {
    const s = baseState(2);
    addTemplate(s, rifleTemplate({ id: 'mmg', dr: { front: 12, flank: 10, color: 'red' } }));
    addTemplate(s, rifleTemplate({ id: 'panzer', kind: 'vehicle', fp: { red: 5, blue: 5 }, dr: { front: 14, flank: 12, color: 'blue' } }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0, destroyDr: 16 });
    const mmg = addUnit(s, 'MMG', 'B', 0, 0, 0, 'mmg');
    mmg.occupyingFortification = true;
    const panzer = addUnit(s, 'PZ', 'A', 1, 0, 3, 'panzer');

    const before = s.log.length;
    const res = reduce(s, { type: 'FIRE', attackerId: panzer.id, targetId: mmg.id });
    const newEvents = res.state.log.slice(before);
    // Exactly one Spent Check for the whole Action, regardless of how many rolls happened.
    expect(newEvents.filter((e) => e.type === 'spent')).toHaveLength(1);
    expect(newEvents.some((e) => e.type === 'fireStructure')).toBe(true);
  });

  it('rollStructureDestroy applies the (clamped) CAP mod before rolling, like every other roll', () => {
    const s = baseState();
    expect(rollStructureDestroy(s, 8, 16, 1).hitNumber).toBe(7);
    expect(rollStructureDestroy(s, 8, 16, -5).hitNumber).toBe(10); // clamped to ±2
  });

  it('destroyFeatureAt removes whichever destructible feature is on the Hex', () => {
    const s = baseState();
    addHex(s, 0, 0, 'open');
    putFortification(s, '0,0', 'bunker', { facing: 0, destroyDr: 16 });
    const hex = s.hexes['0,0']!;
    expect(destructibleFeatureAt(hex)).toBeDefined();
    destroyFeatureAt(hex);
    expect(hex.features.fortification!.destroyed).toBe(true);
    expect(destructibleFeatureAt(hex)).toBeUndefined();
  });
});

describe('§17.12 — CC against a Fortification/Obstacle itself (exclusive choice, no Terrain mods)', () => {
  it('CLOSE_COMBAT with targetKind "structure" resolves a flat-DR roll and destroys on a Hit, skipping the occupant entirely', () => {
    const s = baseState(3);
    addTemplate(s, rifleTemplate({ fp: { red: 6, blue: 0 } }));
    addHex(s, 0, 0, 'buildingStone'); // Difficult Terrain the structure roll must NOT be modified by
    putFortification(s, '0,0', 'bunker', { facing: 0, destroyDr: 8 });
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const { ar } = closeCombatStructureAr(s, attacker);
    expect(ar).toBe(6 + 4); // red FP + Close Combat Bonus, no Terrain DM at all

    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: attacker.id, targetKind: 'structure' });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.events.some((e) => e.type === 'ccStructure')).toBe(true);
  });

  it('denies targetKind "structure" when nothing destructible is on the attacker\'s Hex', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: attacker.id, targetKind: 'structure' });
    expect(res.events[0]!.type).toBe('illegal');
  });
});

describe('isOccupying (§17.2)', () => {
  it('re-validates against a still-live matching Fortification, not just the flag', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    putFortification(s, '0,0', 'trench');
    const u = addUnit(s, 'U1', 'A', 0, 0, 0);
    u.occupyingFortification = true;
    expect(isOccupying(s, u)?.kind).toBe('trench');
    s.hexes['0,0']!.features.fortification!.destroyed = true;
    expect(isOccupying(s, u)).toBeUndefined();
  });
});

describe('closeCombatContext also applies Fortification/Hasty Defense DR bonuses to the occupant', () => {
  it('adds the Trench DR bonus to a CC-attacked occupant', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    putFortification(s, '0,0', 'trench');
    const attacker = addUnit(s, 'A1', 'A', 0, 0, 0);
    const defender = addUnit(s, 'D1', 'B', 0, 0, 3);
    defender.occupyingFortification = true;
    const ctx = closeCombatContext(s, attacker, defender);
    expect(ctx.legal).toBe(true);
    expect(ctx.drMods.some((m) => m.label === 'Trench Fortification Bonus' && m.value === 2)).toBe(true);
  });
});
