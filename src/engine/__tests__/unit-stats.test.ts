/**
 * Per-Unit combat stats (`GameState.unitStats`, `types.ts`'s `UnitStatEntry`)
 * — tracked by `reducer.ts`'s `applyHit`/`destroyUnit` via the `recordFired`/
 * `recordTargeted`/`ensureStats` helpers. Covers: fired/fired-upon counts
 * (hit-independent), a kill's full record shape, Mines' deliberate exclusion
 * from `unitStats` (still gets a kill-banner event, just no attacker
 * attribution), and Group Attack crediting the Leader only.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { Action } from '../types';

describe('per-Unit combat stats (GameState.unitStats)', () => {
  it('records timesFired/timesFiredUpon on every Fire attempt, hit or miss', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle');

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.unitStats?.['A1']?.timesFired).toBe(1);
    // Whether B1 survived the shot or not, it was targeted exactly once.
    const targetStillAlive = !!res.state.units['B1'];
    const targetStats = res.state.unitStats?.['B1'];
    expect(targetStats?.timesFiredUpon).toBe(1);
    if (targetStillAlive) expect(targetStats?.timesHit).toBe(0);
  });

  it('records a full kill on the attacker: hits, hitsGiven.destroyed, and the kill record', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'big', fp: { red: 50, blue: 0 } })); // guaranteed critical
    addTemplate(s, rifleTemplate({ id: 'rifle', vp: 2 }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    addUnit(s, 'A1', 'A', 0, 0, 0, 'big');
    addUnit(s, 'B1', 'B', 1, 0, 3, 'rifle');

    const res = reduce(s, { type: 'FIRE', attackerId: 'A1', targetId: 'B1' });
    expect(res.state.units['B1']).toBeUndefined(); // destroyed

    const attackerStats = res.state.unitStats?.['A1'];
    expect(attackerStats?.timesFired).toBe(1);
    expect(attackerStats?.hits).toBe(1);
    expect(attackerStats?.hitsGiven.destroyed).toBe(1);
    expect(attackerStats?.kills).toEqual([
      {
        targetId: 'B1',
        targetTemplateId: 'rifle',
        targetSide: 'B',
        hexId: '1,0',
        mapNumber: undefined,
        round: 1,
      },
    ]);

    // The killed Unit's OWN stats entry still exists (keyed by id, independent
    // of the Unit record itself being deleted) and reflects it was hit.
    const targetStats = res.state.unitStats?.['B1'];
    expect(targetStats?.timesFiredUpon).toBe(1);
    expect(targetStats?.timesHit).toBe(1);

    // Kill-banner presentation fields on the 'destroyed' GameEvent.
    const destroyedEvent = res.events.find((e) => e.type === 'destroyed');
    expect(destroyedEvent?.killedUnitId).toBe('B1');
    expect(destroyedEvent?.killedTemplateId).toBe('rifle');
    expect(destroyedEvent?.killedSide).toBe('B');
    expect(destroyedEvent?.killedHexId).toBe('1,0');
    expect(destroyedEvent?.killerUnitId).toBe('A1');
    expect(destroyedEvent?.killerTemplateId).toBe('big');
    expect(destroyedEvent?.killerSide).toBe('A');
    expect(destroyedEvent?.killerLabel).toBeUndefined();
  });

  it('a Mines kill is excluded from unitStats entirely, but the kill-banner event names the cause', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'veh', kind: 'vehicle', move: 1, dr: { front: 14, flank: 12, color: 'blue' }, propulsion: 'tracked' }));
    addHex(s, 0, 0, 'open');
    addHex(s, 1, 0, 'open');
    s.hexes['1,0']!.features.obstacle = { kind: 'mines', hitNumber: 2, destroyed: false, ownerSide: 'B' };
    // Pre-marked (Light Damage — no move restriction, unlike Stunned/
    // Immobilized): ANY hit (guaranteed here, Hit# 2 vs a minimum 2d6 roll of
    // 2) destroys it outright regardless of critical (hits.ts's resolveHit).
    addUnit(s, 'V', 'A', 0, 0, 0, 'veh', ['aLightDamage']);

    const res = reduce(s, { type: 'MOVE', unitId: 'V', toHexId: '1,0' });
    expect(res.state.units['V']).toBeUndefined(); // destroyed by its own side's Mines

    expect(res.state.unitStats?.['V']).toBeUndefined();
    const destroyedEvent = res.events.find((e) => e.type === 'destroyed');
    expect(destroyedEvent?.killedUnitId).toBe('V');
    expect(destroyedEvent?.killerUnitId).toBeUndefined();
    expect(destroyedEvent?.killerLabel).toBe('Mines');
  });

  it('a Group Attack credits stats to the Leader only, not the supporters', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'hmg', fp: { red: 5, blue: 0 }, range: 9, apToFire: 2 }));
    addTemplate(s, rifleTemplate({ id: 'rifle', fp: { red: 3, blue: 0 }, range: 5 }));
    for (let q = -1; q <= 4; q++) for (let r = -1; r <= 1; r++) addHex(s, q, r);
    addUnit(s, 'HMG', 'A', 0, 0, 0, 'hmg');
    addUnit(s, 'S1', 'A', 1, 0, 0, 'rifle');
    addUnit(s, 'S2', 'A', 0, 1, 0, 'rifle');
    addUnit(s, 'T', 'B', 3, 0, 3, 'rifle');

    const groupAttack: Action = {
      type: 'GROUP_ATTACK',
      leaderId: 'HMG',
      supporterIds: ['S1', 'S2'],
      targetId: 'T',
    };
    const res = reduce(s, groupAttack);
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);

    expect(res.state.unitStats?.['HMG']?.timesFired).toBe(1);
    expect(res.state.unitStats?.['S1']).toBeUndefined();
    expect(res.state.unitStats?.['S2']).toBeUndefined();
    expect(res.state.unitStats?.['T']?.timesFiredUpon).toBe(1);
  });
});
