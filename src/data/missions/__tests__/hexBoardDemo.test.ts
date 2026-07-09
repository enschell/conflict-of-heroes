import { describe, expect, it } from 'vitest';
import { initGame } from '../../../engine/state';
import { neighbors, parseHexId, idOf } from '../../../engine/hex';
import { HEX_BOARD_DEMO } from '../hexBoardDemo';

// Default config is a single blank board (Mission 1 re-authoring reference
// canvas). The two-board seam-merge scenario this mission also supports
// (TWO_BOARDS=true in hexBoardDemo.ts) is proven independently and
// exhaustively by engine/__tests__/hexBoard.test.ts's coordinate-math tests,
// so it isn't re-tested here — this file just covers whatever the mission's
// current default actually initializes to.
describe('Hex Board Demo mission (single-board default)', () => {
  it('initializes with a single board of 238 hexes', () => {
    const game = initGame(HEX_BOARD_DEMO);
    expect(Object.keys(game.hexes).length).toBe(238);
  });

  it('has exactly one board-number cell, numbered 1', () => {
    const game = initGame(HEX_BOARD_DEMO);
    const numbered = Object.values(game.hexes).filter((h) => h.boardNumber != null);
    expect(numbered.length).toBe(1);
    expect(numbered[0]!.boardNumber).toBe(1);
  });

  it('the victory hex is real and has a full set of real neighbors', () => {
    const game = initGame(HEX_BOARD_DEMO);
    const vh = game.victory.victoryHexes[0]!.hexId;
    expect(game.hexes[vh]).toBeDefined();
    const ns = neighbors(parseHexId(vh)).map(idOf);
    expect(ns.every((id) => game.hexes[id] != null)).toBe(true);
  });
});
