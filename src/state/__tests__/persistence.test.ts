// @vitest-environment jsdom
/**
 * M4 persistence + undo/redo. jsdom gives us a real localStorage.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame, serialize } from '../../engine';
import { FIREFIGHT_1 } from '../../data/firefights/firefight1';
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
    const game = initGame({ ...FIREFIGHT_1, seed: 5 });
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
    expect(isGameState(initGame({ ...FIREFIGHT_1, seed: 1 }))).toBe(true);
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
