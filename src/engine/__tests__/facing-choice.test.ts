/**
 * Free facing correction (§4.5 after a Move/Group Move, §15.9 after an Unload,
 * §15.11 after a destroyed Transport auto-unloads its passenger): 0AP, no
 * Spent Check, no turn switch — gated entirely by `pendingFacingChoices`.
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { addHex, addTemplate, addUnit, baseState, rifleTemplate } from './helpers';
import type { GameState } from '../types';

function scene(): GameState {
  const s = baseState(1);
  addTemplate(s, rifleTemplate());
  addHex(s, 0, 0);
  addHex(s, 1, 0);
  addHex(s, 2, 0);
  return s;
}

describe('CHOOSE_FACING (§4.5/§15.11)', () => {
  it('a Move grants a free facing correction for the mover', () => {
    const s = scene();
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'MOVE', unitId: 'R', toHexId: '1,0' });
    expect(res.state.pendingFacingChoices).toEqual(['R']);
  });

  it('CHOOSE_FACING sets the facing for free — no Spent Check, no turn switch', () => {
    const s = scene();
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const moved = reduce(s, { type: 'MOVE', unitId: 'R', toHexId: '1,0' }).state;
    expect(moved.currentSide).toBe('B'); // the Move already handed the turn over

    const res = reduce(moved, { type: 'CHOOSE_FACING', unitId: 'R', facing: 4 });
    expect(res.events.some((e) => e.type === 'illegal')).toBe(false);
    expect(res.state.units['R']!.facing).toBe(4);
    expect(res.state.units['R']!.status).toBe(moved.units['R']!.status); // unchanged
    expect(res.state.currentSide).toBe('B'); // still didn't switch turns
    expect(res.events.some((e) => e.type === 'spent')).toBe(false); // no Spent Check
    expect(res.state.pendingFacingChoices).toEqual([]); // resolved
  });

  it('a MOVE with an explicit facing uses it directly (still freely correctable after)', () => {
    const s = scene();
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'MOVE', unitId: 'R', toHexId: '1,0', facing: 3 });
    expect(res.state.units['R']!.facing).toBe(3);
    expect(res.state.pendingFacingChoices).toEqual(['R']);
  });

  it('denies CHOOSE_FACING for a Unit with no open window', () => {
    const s = scene();
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    const res = reduce(s, { type: 'CHOOSE_FACING', unitId: 'R', facing: 2 });
    expect(res.events[0]?.type).toBe('illegal');
  });

  it('the free-correction window closes as soon as any other Action resolves', () => {
    const s = scene();
    addUnit(s, 'R', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'S', 'B', 2, 0, 3, 'rifle');
    const moved = reduce(s, { type: 'MOVE', unitId: 'R', toHexId: '1,0' }).state;
    expect(moved.pendingFacingChoices).toEqual(['R']);

    // Any other Action (here, the other side Stalling) closes R's window.
    const after = reduce(moved, { type: 'STALL', unitId: 'S' }).state;
    expect(after.pendingFacingChoices).toEqual([]);
    expect(reduce(after, { type: 'CHOOSE_FACING', unitId: 'R', facing: 2 }).events[0]?.type).toBe(
      'illegal',
    );
  });

  it('a Group Move grants a free facing correction to every member that moved', () => {
    const s = scene();
    addUnit(s, 'R1', 'A', 0, 0, 0, 'rifle');
    addUnit(s, 'R2', 'A', 1, 0, 0, 'rifle');
    const res = reduce(s, {
      type: 'GROUP_MOVE',
      moves: [
        { unitId: 'R1', toHexId: '1,0' },
        { unitId: 'R2', toHexId: '2,0' },
      ],
    });
    expect(res.state.pendingFacingChoices).toEqual(expect.arrayContaining(['R1', 'R2']));
  });
});
