// @vitest-environment jsdom
/**
 * M4 persistence + undo/redo. jsdom gives us a real localStorage.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame, serialize } from '../../engine';
import { MISSION_1 } from '../../data/missions/mission1';
import { ARMOR_SANDBOX } from '../../data/missions/sandbox';
import { legalStep } from './helpers';
import {
  deleteSlot,
  isGameState,
  listSlots,
  loadSlot,
  saveSlot,
} from '../persistence';
import { useGame } from '../store';

afterEach(() => {
  localStorage.clear();
  useGame.setState({ game: null, history: [], future: [] });
});

describe('named slots', () => {
  it('saves, lists, loads, and deletes a slot (round-trips exactly)', () => {
    const game = initGame({ ...MISSION_1, seed: 5 });
    expect(saveSlot('alpha', game)).not.toBeNull();

    const metas = listSlots();
    expect(metas.map((m) => m.name)).toContain('alpha');

    const loaded = loadSlot('alpha');
    expect(loaded).not.toBeNull();
    expect(serialize(loaded!)).toBe(serialize(game)); // bit-for-bit

    deleteSlot('alpha');
    expect(listSlots().map((m) => m.name)).not.toContain('alpha');
    expect(loadSlot('alpha')).toBeNull();
  });

  it('rejects non-game JSON on import validation', () => {
    expect(isGameState({ hello: 'world' })).toBe(false);
    expect(isGameState(initGame({ ...MISSION_1, seed: 1 }))).toBe(true);
  });
});

describe('undo / redo', () => {
  it('undo then redo returns to the same state', () => {
    useGame.getState().newGame();
    const start = serialize(useGame.getState().game!);

    // a PASS is a committed, history-pushing action
    useGame.getState().dispatch({ type: 'PASS' });
    const afterAction = serialize(useGame.getState().game!);
    expect(afterAction).not.toBe(start);

    useGame.getState().undo();
    expect(serialize(useGame.getState().game!)).toBe(start);
    expect(useGame.getState().future.length).toBe(1);

    useGame.getState().redo();
    expect(serialize(useGame.getState().game!)).toBe(afterAction);
    expect(useGame.getState().future.length).toBe(0);
  });

  it('a new action after undo clears the redo stack', () => {
    useGame.getState().newGame();
    useGame.getState().dispatch({ type: 'PASS' });
    useGame.getState().undo();
    expect(useGame.getState().future.length).toBe(1);
    useGame.getState().dispatch({ type: 'PASS' });
    expect(useGame.getState().future.length).toBe(0);
  });

  // Regression: undo/redo used to reset selectedUnitId but not an in-progress
  // vehicle Bonus-Move path or a Group-mode selection. A stale movePath then
  // makes hexClick route every board click into extendMovePath, which silently
  // no-ops without a selection — the board goes completely unresponsive with no
  // visible way to recover (Inspector shows "No unit selected", so the movePath
  // Cancel button isn't even reachable). A stale groupSel is worse: groupMove/
  // groupAttack/groupRally index game.units[id]! with a non-null assertion, so a
  // member id that no longer exists in the time-travelled state crashes the app.
  it('undo clears an in-progress vehicle move-path and Group selection', () => {
    useGame.getState().newGame(ARMOR_SANDBOX);
    useGame.getState().dispatch({ type: 'PASS' }); // give undo() something to revert

    const game = useGame.getState().game!;
    const unit = Object.values(game.units).find((u) => u.side === game.currentSide)!;
    useGame.getState().select(unit.id);
    useGame.getState().extendMovePath(legalStep(game, unit));
    expect(useGame.getState().movePath.length).toBeGreaterThan(0);
    useGame.setState({ groupSel: [unit.id] }); // simulate a stale Group selection

    useGame.getState().undo();
    expect(useGame.getState().movePath).toEqual([]);
    expect(useGame.getState().groupSel).toEqual([]);
  });

  it('redo also clears an in-progress vehicle move-path and Group selection', () => {
    useGame.getState().newGame(ARMOR_SANDBOX);
    useGame.getState().dispatch({ type: 'PASS' });
    useGame.getState().undo();

    const game = useGame.getState().game!;
    const unit = Object.values(game.units).find((u) => u.side === game.currentSide)!;
    useGame.getState().select(unit.id);
    useGame.getState().extendMovePath(legalStep(game, unit));
    useGame.setState({ groupSel: [unit.id] });

    useGame.getState().redo();
    expect(useGame.getState().movePath).toEqual([]);
    expect(useGame.getState().groupSel).toEqual([]);
  });
});

describe('store export/import', () => {
  it('exports current game and imports it back', () => {
    useGame.getState().newGame();
    const text = useGame.getState().exportCurrent();
    expect(text.length).toBeGreaterThan(0);

    useGame.setState({ game: null });
    expect(useGame.getState().importFromText(text)).toBe(true);
    expect(useGame.getState().game).not.toBeNull();

    expect(useGame.getState().importFromText('{"not":"a game"}')).toBe(false);
  });
});
