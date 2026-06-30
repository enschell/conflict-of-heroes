/**
 * Close combat (rulebook §5.4 / §7.7.3): when an enemy shares your hex you may
 * attack it in CC; you may NOT fire out of the hex; CC is +4FP (−2 for white-box
 * crew weapons) resolved against the target's flank DR.
 */
import { describe, expect, it } from 'vitest';
import { legalActionsForUnit } from '../actions';
import { closeCombatContext } from '../combat';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

describe('close combat', () => {
  it('offers CLOSE_COMBAT (not FIRE) when an enemy shares the hex', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'a', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'e', 'B', 0, 0, 3, 'rifle'); // enemy in the same hex
    addUnit(s, 'far', 'B', 1, 0, 3, 'rifle'); // enemy in the next hex (front arc)

    const acts = legalActionsForUnit(s, 'a');
    expect(acts.some((x) => x.type === 'CLOSE_COMBAT' && x.targetId === 'e')).toBe(true);
    // Cannot fire out of a hex an enemy occupies.
    expect(acts.some((x) => x.type === 'FIRE')).toBe(false);
  });

  it('is +4 FP vs the target flank DR (open terrain)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ fp: { red: 3, blue: 0 } }));
    addHex(s, 0, 0);
    addUnit(s, 'a', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'e', 'B', 0, 0, 0, 'rifle');

    const ctx = closeCombatContext(s, s.units['a']!, s.units['e']!);
    expect(ctx.legal).toBe(true);
    expect(ctx.isFlank).toBe(true);
    expect(ctx.ar).toBe(3 + 4); // AR = Firepower + close-combat +4
    expect(ctx.dr).toBe(11); // flank DR 11 + 0 terrain
  });

  it('white-box (crew-served) FP is −2 in CC', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'mg', fp: { red: 5, blue: 0 }, whiteBoxFp: true }));
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addUnit(s, 'a', 'A', 0, 0, 0, 'mg');
    addUnit(s, 'e', 'B', 0, 0, 0, 'rifle');

    expect(closeCombatContext(s, s.units['a']!, s.units['e']!).ar).toBe(5 - 2);
  });

  it('resolves a CLOSE_COMBAT action through the reducer', () => {
    const s = baseState(2);
    addTemplate(s, rifleTemplate({ fp: { red: 8, blue: 0 } }));
    addHex(s, 0, 0);
    addUnit(s, 'a', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'e', 'B', 0, 0, 0, 'rifle');

    const res = reduce(s, { type: 'CLOSE_COMBAT', attackerId: 'a', targetId: 'e' });
    expect(res.events.some((e) => e.type === 'cc')).toBe(true);
  });

  it('may MOVE into an adjacent enemy hex, and that move coexists with FIRE (§5.4)', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate());
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'a', 'A', 0, 0, 0, 'rifle'); // facing E toward the enemy
    addUnit(s, 'e', 'B', 1, 0, 3, 'rifle'); // enemy in the adjacent hex

    const acts = legalActionsForUnit(s, 'a');
    expect(acts.some((x) => x.type === 'MOVE' && x.toHexId === '1,0')).toBe(true);
    expect(acts.some((x) => x.type === 'FIRE' && x.targetId === 'e')).toBe(true);

    const moved = reduce(s, { type: 'MOVE', unitId: 'a', toHexId: '1,0' });
    expect(moved.state.units['a']?.hexId).toBe('1,0'); // moved into the enemy hex
  });
});
