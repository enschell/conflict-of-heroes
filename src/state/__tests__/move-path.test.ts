// @vitest-environment jsdom
/** Vehicle Bonus-Move path building through the store (§15.2 UI wiring). */
import { afterEach, describe, expect, it } from 'vitest';
import { ARMOR_SANDBOX } from '../../data/missions/sandbox';
import { useGame } from '../store';
import { legalSteps } from './helpers';

afterEach(() => {
  localStorage.clear();
  useGame.setState({ game: null, selectedUnitId: null, movePath: [] });
});

describe('vehicle bonus-move path (store)', () => {
  it('builds a multi-hex path and commits it as one Move', () => {
    useGame.getState().newGame(ARMOR_SANDBOX);
    const g = useGame.getState().game!;
    expect(g.currentSide).toBe('A'); // German (tank owner) has Round-1 initiative
    useGame.getState().select('G-pz3');
    const tank = g.units['G-pz3']!;

    // Prefer a first step that still allows a bonus step, so we exercise a 2-hex path.
    const firsts = legalSteps(g, tank, []);
    expect(firsts.length).toBeGreaterThan(0);
    const step1 = firsts.find((s) => legalSteps(g, tank, [s]).length > 0) ?? firsts[0]!;

    useGame.getState().extendMovePath(step1);
    expect(useGame.getState().movePath).toEqual([step1]);

    const seconds = legalSteps(g, tank, [step1]);
    if (seconds.length) {
      useGame.getState().extendMovePath(seconds[0]!);
      expect(useGame.getState().movePath).toHaveLength(2);
    }

    const path = useGame.getState().movePath;
    const dest = path[path.length - 1]!;
    useGame.getState().commitMovePath();

    const after = useGame.getState().game!;
    expect(after.units['G-pz3']!.hexId).toBe(dest); // the tank ended on the path's final hex
    expect(useGame.getState().movePath).toEqual([]); // path cleared after commit
  });

  it('ignores an illegal path extension', () => {
    useGame.getState().newGame(ARMOR_SANDBOX);
    useGame.getState().select('G-pz3');
    useGame.getState().extendMovePath('999,999'); // not adjacent / not a hex
    expect(useGame.getState().movePath).toEqual([]);
  });

  it('selecting a different unit clears an in-progress path', () => {
    useGame.getState().newGame(ARMOR_SANDBOX);
    const g = useGame.getState().game!;
    useGame.getState().select('G-pz3');
    const step = legalSteps(g, g.units['G-pz3']!, [])[0]!;
    useGame.getState().extendMovePath(step);
    expect(useGame.getState().movePath.length).toBe(1);
    useGame.getState().select('G-rifle');
    expect(useGame.getState().movePath).toEqual([]);
  });
});
