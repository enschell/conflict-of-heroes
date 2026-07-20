/**
 * Hidden Units (§11) — reducer-level integration tests, including the
 * rulebook's own worked examples (`rules/11-hidden-units.md`'s "Examples
 * (red boxes)" section) as oracles, per this project's established
 * red-box-fixture convention.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { legalActionsForUnit } from '../actions';
import { enemiesInHex } from '../combat';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

describe('Worked example: Hiding a Unit (§11.3/§11.4/§11.6)', () => {
  it('a 6AP Hidden Move that fails its Spent Check stays Hidden, marked Spent', () => {
    // Find a seed where the 6AP (5 base + 1 Stress) Spent Check fails —
    // matches the rulebook's own "fails with a 4 roll, becomes spent" beat.
    let found: GameState | null = null;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const s = baseState(seed);
      addTemplate(s, rifleTemplate());
      addHex(s, 0, 0);
      addHex(s, 1, 0);
      const u = addUnit(s, 'RIF', 'A', 0, 0, 0);
      u.stressed = true; // already Stressed from the earlier backward Move, per the example
      const res = reduce(s, { type: 'HIDDEN_MOVE', unitId: 'RIF', toHexId: '0,0' });
      const unit = res.state.units['RIF']!;
      if (unit.status === 'spent') found = res.state;
    }
    expect(found).not.toBeNull();
    const unit = found!.units['RIF']!;
    expect(unit.hidden).toBe(true);
    expect(unit.status).toBe('spent');
  });
});

describe('Worked example: Hidden Movement (§11.3/§11.5)', () => {
  it('Hidden Move into Concealing Terrain stays Hidden even adjacent to the enemy; 5AP -> 3AP via 2 CAPs', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsLight'); // Concealing Terrain, adjacent to the enemy
    addHex(s, 2, 0);
    addUnit(s, 'MTR', 'B', 2, 0, 0); // the enemy Mortar
    const u = addUnit(s, 'RIF', 'A', 0, 0, 0);
    u.hidden = true;

    const before = s.players.A.capCurrent;
    const res = reduce(s, { type: 'HIDDEN_MOVE', unitId: 'RIF', toHexId: '1,0', capCostReduce: 2 });
    const unit = res.state.units['RIF']!;
    expect(unit.hexId).toBe('1,0');
    expect(unit.hidden).toBe(true); // stays hidden — Concealing Terrain
    expect(before - res.state.players.A.capCurrent).toBe(2); // 5AP - 2 CAPs = 3AP
  });
});

describe('Worked example: Revealing a Hidden Unit (§11.1/§11.2)', () => {
  it('a normal Move (not exempt) reveals the Unit immediately, before the Move itself resolves', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0, 'woodsHeavy'); // +1AP Heavy Woods, matching the example's cost breakdown
    const u = addUnit(s, 'RIF', 'A', 0, 0, 3); // facing West — moving East (dir 0) is a Backwards Move
    u.hidden = true;
    u.stressed = true;

    const res = reduce(s, { type: 'MOVE', unitId: 'RIF', toHexId: '1,0' });
    const unit = res.state.units['RIF']!;
    expect(unit.hidden).toBeUndefined(); // revealed
    expect(unit.hexId).toBe('1,0');
    // 1AP Move + 1AP Heavy Woods + 1AP Backwards + 1AP Stress = 4AP here (the
    // rulebook's own 3AP total assumes a forward move; this fixture uses a
    // simplified standalone scene, not the exact multi-turn narrative
    // position, so it checks the MECHANIC — reveal-then-normal-Move-cost —
    // rather than reproducing every narrative detail byte-for-byte).
    const spentLog = res.state.log.find((e) => e.type === 'spent');
    expect(spentLog?.text).toContain('cost 4');
  });

  it('a denied Action never reveals — deny() returns the untouched original state', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    const u = addUnit(s, 'RIF', 'A', 0, 0, 0);
    u.hidden = true;
    // No Hex '1,0' exists — MOVE is illegal for an unrelated reason.
    const res = reduce(s, { type: 'MOVE', unitId: 'RIF', toHexId: '1,0' });
    expect(res.state).toBe(s); // denied — pristine original state returned
    expect(res.state.units['RIF']!.hidden).toBe(true); // never revealed
  });
});

describe('Worked example: Attacking a Hidden Unit / Recon by Fire (§11.7)', () => {
  function scene() {
    const s = baseState(); // currentSide: 'A' — attacker must be Side A
    addTemplate(s, rifleTemplate({ id: 'mmg', fp: { red: 3, blue: 0 }, range: 4 }));
    addTemplate(s, rifleTemplate({ id: 'rif', dr: { front: 12, flank: 11, color: 'red' } }));
    for (let q = 0; q <= 3; q++) addHex(s, q, 0, q === 3 ? 'woodsLight' : 'open');
    const attacker = addUnit(s, 'MMG', 'A', 0, 0, 0, 'mmg'); // facing East
    const target = addUnit(s, 'RIF', 'B', 3, 0, 3, 'rif'); // hidden, facing West (irrelevant until revealed)
    target.hidden = true;
    return { s, attacker, target };
  }

  it('Reveal Number 7 (6 + Light Woods DM 1) reduced to 5 via 2 CAPs; a successful roll reveals and immediately Attacks', () => {
    // Find a seed where the Reveal roll succeeds (>= 5) but the follow-up
    // Attack roll misses (< Hit Number 10) — matches the worked example's
    // own outcome ("rolls an 8 and misses").
    let found: GameState | null = null;
    for (let seed = 1; seed <= 500 && !found; seed++) {
      const scene2 = baseState(seed);
      addTemplate(scene2, rifleTemplate({ id: 'mmg', fp: { red: 3, blue: 0 }, range: 4 }));
      addTemplate(scene2, rifleTemplate({ id: 'rif', dr: { front: 12, flank: 11, color: 'red' } }));
      for (let q = 0; q <= 3; q++) addHex(scene2, q, 0, q === 3 ? 'woodsLight' : 'open');
      addUnit(scene2, 'MMG', 'A', 0, 0, 0, 'mmg');
      const target = addUnit(scene2, 'RIF', 'B', 3, 0, 3, 'rif');
      target.hidden = true;
      const res = reduce(scene2, {
        type: 'RECON_BY_FIRE',
        attackerId: 'MMG',
        targetHexId: '3,0',
        capRevealDiceMod: 2,
      });
      const t = res.state.units['RIF'];
      if (t && t.hidden === undefined) found = res.state; // revealed = the reveal roll succeeded
    }
    expect(found).not.toBeNull();
    const target = found!.units['RIF']!;
    expect(target.hidden).toBeUndefined();
    // Facing toward the attacker (East from the target's Hex) puts the
    // attacker in the Front arc — matches the worked example's Front DR use.
    const reconLog = found!.log.find((e) => e.type === 'recon');
    expect(reconLog?.text).toContain('Reveal# 5'); // 7 - clamp(2) = 5
    const fireLog = found!.log.find((e) => e.type === 'fire');
    expect(fireLog?.text).toContain('Hit# 10'); // 12 front DR + 1 Light Woods - 3 FP = 10
  });

  it('a miss and a hit-against-an-empty-hex log identically — never leaks which happened', () => {
    // A hex with no Unit at all — the Reveal Number roll may succeed or
    // fail, but either way there is nothing to reveal.
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'mmg', fp: { red: 3, blue: 0 }, range: 4 }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addHex(s, 2, 0);
    addUnit(s, 'MMG', 'A', 0, 0, 0, 'mmg');
    const res = reduce(s, { type: 'RECON_BY_FIRE', attackerId: 'MMG', targetHexId: '2,0' });
    const reconLog = res.state.log.find((e) => e.type === 'recon');
    expect(reconLog?.text).toMatch(/no reveal$/);
  });

  it('the two CAP mods are independent — the Hit Number mod does not also apply to the Reveal Number', () => {
    const { s } = scene();
    const res = reduce(s, {
      type: 'RECON_BY_FIRE',
      attackerId: 'MMG',
      targetHexId: '3,0',
      capRevealDiceMod: 0,
      capHitDiceMod: 2,
    });
    const reconLog = res.state.log.find((e) => e.type === 'recon')!;
    expect(reconLog.text).toContain('Reveal# 7'); // unaffected by capHitDiceMod
  });
});

describe('Hidden Units and legalActionsForUnit', () => {
  it('a Hidden Unit is offered ONLY Rally/Stall/Hidden Move, never Move/Fire/Pivot/etc.', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    const u = addUnit(s, 'RIF', 'A', 0, 0, 0, 'rifle', ['pinned']);
    u.hidden = true;
    const acts = legalActionsForUnit(s, 'RIF');
    const types = new Set(acts.map((a) => a.type));
    expect(types.size).toBeGreaterThan(0);
    for (const t of types) expect(['RALLY', 'STALL', 'HIDDEN_MOVE']).toContain(t);
  });

  it('a non-Hidden Unit is offered Hidden Move candidates too (becoming Hidden)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    const u = addUnit(s, 'RIF', 'A', 0, 0, 0);
    expect(u.hidden).toBeUndefined();
    const acts = legalActionsForUnit(s, 'RIF');
    expect(acts.some((a) => a.type === 'HIDDEN_MOVE')).toBe(true);
  });
});

describe('mustReveal sweep — cascade reveal', () => {
  it('revealing one Unit in a Hex cascades to reveal another Hidden Unit stacked there', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    // Two Hidden Units stacked together — legal per §11.1 ("Multiple hidden
    // Units may be in the same area... even if in the same hex").
    const a = addUnit(s, 'A1', 'A', 1, 0, 0);
    a.hidden = true;
    const b = addUnit(s, 'B1', 'A', 1, 0, 0);
    b.hidden = true;
    // A revealed enemy takes a normal Move onto neither Hex — instead, reveal
    // A1 directly via a normal Action, which shares A1's Hex with B1.
    const res = reduce(s, { type: 'STALL', unitId: 'A1' }); // exempt — A1 stays hidden
    expect(res.state.units['A1']!.hidden).toBe(true);
    expect(res.state.units['B1']!.hidden).toBe(true);

    // Now reveal A1 via a genuinely revealing Action (Pivot).
    const res2 = reduce(s, { type: 'PIVOT', unitId: 'A1', facing: 1 });
    expect(res2.state.units['A1']!.hidden).toBeUndefined();
    // B1 shares A1's Hex, which is now non-Hidden -> the sweep reveals it too.
    expect(res2.state.units['B1']!.hidden).toBeUndefined();
  });
});

describe('a Hidden enemy Unit is never a legal target for a normal Attack', () => {
  it('FIRE against a Hidden Unit id is denied (defense-in-depth: attackContext)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    for (let q = 0; q <= 3; q++) addHex(s, q, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0);
    const t = addUnit(s, 'TGT', 'B', 3, 0, 3);
    t.hidden = true;
    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TGT' });
    expect(res.state).toBe(s); // denied
  });

  it('CLOSE_COMBAT against a Hidden Unit id is denied (defense-in-depth: closeCombatContext)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0);
    const t = addUnit(s, 'TGT', 'B', 0, 0, 0);
    t.hidden = true;
    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: 'ATK', targetId: 'TGT' });
    expect(res.state).toBe(s); // denied
  });

  it('legalActionsForUnit never offers FIRE/CLOSE_COMBAT against a Hidden enemy', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'ATK', 'A', 0, 0, 0);
    const t = addUnit(s, 'TGT', 'B', 1, 0, 0);
    t.hidden = true;
    const acts = legalActionsForUnit(s, 'ATK');
    expect(acts.some((a) => a.type === 'FIRE' || a.type === 'CLOSE_COMBAT')).toBe(false);
  });

  it('enemiesInHex (the shared basis for stacked ranged Fire AND Indirect Fire) excludes Hidden Units', () => {
    // Two Hidden Units may legally share a Hex without revealing each other
    // (§11.1) — `enemiesInHex` must exclude BOTH from a stacked-fire
    // resolution, since the attacker doesn't know either is there.
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    const a = addUnit(s, 'A1', 'B', 0, 0, 0);
    a.hidden = true;
    const b = addUnit(s, 'B1', 'B', 0, 0, 0);
    b.hidden = true;
    expect(enemiesInHex(s, 'A', '0,0')).toEqual([]);
  });
});

describe('a Hidden reinforcement Unit entering via ENTER stays Hidden', () => {
  it('ENTER is exempt from the bullet-1 auto-reveal (matches doSetupPlace precedent)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    s.reinforcements.push({
      id: 'R1',
      side: 'A',
      nation: 'germans',
      templateId: 'rifle',
      facing: 0,
      waveId: 'w1',
      earliestRound: 1,
      entryHexIds: ['0,0'],
      entryDescription: 'test',
      hidden: true,
    });
    const res = reduce(s, { type: 'ENTER', placements: [{ unitId: 'R1', hexId: '0,0' }] });
    expect(res.state.units['R1']!.hidden).toBe(true);
  });
});
