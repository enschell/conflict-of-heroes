/**
 * Board substrate (docs/hex_board_spec/README.md, authoritative). Locks in
 * the column/row <-> axial embedding, labels, and — most importantly — that
 * the resulting axial adjacency graph really matches the flat-top board's
 * visual neighbor relationships (odd-q offset), not just internal
 * round-trip consistency.
 */
import { describe, expect, it } from 'vitest';
import { neighbor } from '../hex';
import {
  BOARD_COLS,
  BOARD_ROWS,
  axialToColRow,
  colRowLabel,
  colRowToAxial,
  generateBoardHexes,
  isBoardNumberCell,
} from '../hexBoard';
import type { Facing } from '../types';

const DIR = { SE: 0, NE: 1, N: 2, NW: 3, SW: 4, S: 5 } as const;

describe('colRowToAxial / axialToColRow (single board)', () => {
  it('round-trips', () => {
    for (let c = 0; c < BOARD_COLS; c++) {
      for (let r = 0; r <= BOARD_ROWS; r++) {
        const a = colRowToAxial({ c, r });
        expect(axialToColRow(a)).toEqual({ c, r });
      }
    }
  });
});

describe('adjacency matches the flat-top odd-q offset table', () => {
  // N/S never depend on column parity.
  it('N/S', () => {
    for (const c of [0, 1, 4, 5, 18]) {
      for (const r of [1, 5, 11]) {
        const a = colRowToAxial({ c, r });
        expect(axialToColRow(neighbor(a, DIR.N as Facing))).toEqual({ c, r: r - 1 });
        expect(axialToColRow(neighbor(a, DIR.S as Facing))).toEqual({ c, r: r + 1 });
      }
    }
  });

  it('even column: NE/SE/NW/SW step to (c±1, r-1) / (c±1, r)', () => {
    for (const c of [0, 2, 8, 18]) {
      for (const r of [1, 5, 11]) {
        const a = colRowToAxial({ c, r });
        expect(axialToColRow(neighbor(a, DIR.NE as Facing))).toEqual({ c: c + 1, r: r - 1 });
        expect(axialToColRow(neighbor(a, DIR.SE as Facing))).toEqual({ c: c + 1, r });
        expect(axialToColRow(neighbor(a, DIR.NW as Facing))).toEqual({ c: c - 1, r: r - 1 });
        expect(axialToColRow(neighbor(a, DIR.SW as Facing))).toEqual({ c: c - 1, r });
      }
    }
  });

  it('odd column: NE/SE/NW/SW step to (c±1, r) / (c±1, r+1)', () => {
    for (const c of [1, 3, 9, 17]) {
      for (const r of [1, 5, 10]) {
        const a = colRowToAxial({ c, r });
        expect(axialToColRow(neighbor(a, DIR.NE as Facing))).toEqual({ c: c + 1, r });
        expect(axialToColRow(neighbor(a, DIR.SE as Facing))).toEqual({ c: c + 1, r: r + 1 });
        expect(axialToColRow(neighbor(a, DIR.NW as Facing))).toEqual({ c: c - 1, r });
        expect(axialToColRow(neighbor(a, DIR.SW as Facing))).toEqual({ c: c - 1, r: r + 1 });
      }
    }
  });
});

describe('colRowLabel', () => {
  it('even column: r=0 unlabeled, r=1..12 -> 01..12', () => {
    expect(colRowLabel({ c: 0, r: 0 })).toBeNull();
    expect(colRowLabel({ c: 0, r: 1 })).toBe('A01');
    expect(colRowLabel({ c: 0, r: 12 })).toBe('A12');
    expect(colRowLabel({ c: 18, r: 12 })).toBe('S12');
  });

  it('odd column: r=0..11 -> 01..12 (no unlabeled half)', () => {
    expect(colRowLabel({ c: 1, r: 0 })).toBe('B01');
    expect(colRowLabel({ c: 1, r: 11 })).toBe('B12');
  });

  it('board-number cell (c=0,r=0) is a coordinate-label null too, but callers must special-case it', () => {
    expect(isBoardNumberCell({ c: 0, r: 0 })).toBe(true);
    expect(colRowLabel({ c: 0, r: 0 })).toBeNull();
  });
});

describe('generateBoardHexes (single board)', () => {
  const hexes = generateBoardHexes([{ gx: 0, gy: 0, n: 1 }]);

  it('produces 10 even columns x13 rows + 9 odd columns x12 rows = 238 hexes', () => {
    expect(hexes.length).toBe(10 * 13 + 9 * 12);
  });

  it('has exactly one board-number cell, numbered 1', () => {
    const numbered = hexes.filter((h) => h.boardNumber != null);
    expect(numbered.length).toBe(1);
    expect(numbered[0]!.boardNumber).toBe(1);
    expect(numbered[0]!.cell).toEqual({ board: 1, c: 0, r: 0 });
  });

  it('every non-number, non-unlabeled-half cell has a unique label', () => {
    const labels = hexes.map((h) => h.label).filter((l): l is string => l != null);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('A01');
    expect(labels).toContain('S12');
    expect(labels).not.toContain('A00');
  });

  it('drops the degenerate odd-column r=12 sliver (never generates it)', () => {
    const oddR12 = hexes.filter((h) => h.cell.c % 2 === 1 && h.cell.r === 12);
    expect(oddR12).toHaveLength(0);
  });

  const byColRow = new Map(hexes.map((h) => [`${h.cell.c},${h.cell.r}`, h]));
  const cut = (c: number, r: number) => byColRow.get(`${c},${r}`)!.edgeCut;

  it('edge cuts: only the board-relative side actually on that edge is cut', () => {
    expect(cut(0, 5)).toEqual({ w: true }); // west edge, interior row
    expect(cut(18, 5)).toEqual({ e: true }); // east edge, interior row
    expect(cut(4, 0)).toEqual({ n: true }); // even column, top half
    expect(cut(4, 12)).toEqual({ s: true }); // even column, bottom half
  });

  it('corner cells are cut on both axes (quarter-hex)', () => {
    expect(cut(0, 0)).toEqual({ w: true, n: true }); // board-number cell
    expect(cut(18, 0)).toEqual({ e: true, n: true });
    expect(cut(0, 12)).toEqual({ w: true, s: true });
    expect(cut(18, 12)).toEqual({ e: true, s: true });
  });

  it('odd columns and interior even rows have no edge cut at all', () => {
    expect(cut(1, 5)).toBeUndefined();
    expect(cut(1, 0)).toBeUndefined();
    expect(cut(1, 11)).toBeUndefined();
    expect(cut(4, 5)).toBeUndefined();
  });
});

describe('generateBoardHexes (two boards abutted east-west)', () => {
  const hexes = generateBoardHexes([
    { gx: 0, gy: 0, n: 1 },
    { gx: 1, gy: 0, n: 2 },
  ]);

  it('merges the shared seam column into single hexes (not double-counted)', () => {
    // Two independent 238-hex boards would be 476; the shared c=18/c=0 seam
    // column (13 even-column cells) is counted once, not twice.
    expect(hexes.length).toBe(238 + 238 - 13);
  });

  it('the merged seam is never w/e-cut, only n/s where genuinely exposed', () => {
    const byId = new Map(hexes.map((h) => [h.id, h]));
    // Board 1's c=18 (east edge) merges with board 2's c=0 (west edge) at
    // every row — verified against docs/hex_board_spec/two_boards.png, where
    // the seam renders as full hexes, not a visible half-hex seam.
    for (let r = 0; r <= BOARD_ROWS; r++) {
      const seam = byId.get(colRowToAxial({ c: 18, r }).q + ',' + colRowToAxial({ c: 18, r }).r)!;
      expect(seam.edgeCut?.w).toBeUndefined();
      expect(seam.edgeCut?.e).toBeUndefined();
    }
    // The board-number cell itself (board 1's c=18,r=0 / board 2's c=0,r=0,
    // the exact case caught against the reference render) keeps its n-cut
    // (still a real top-of-board edge) but not w/e (merged).
    const numberSeam = hexes.find((h) => h.boardNumber === 2)!;
    expect(numberSeam.edgeCut).toEqual({ n: true });
  });

  it("board 2's board-number cell is a distinct hex from board 1's", () => {
    const numbered = hexes.filter((h) => h.boardNumber != null);
    expect(numbered.map((h) => h.boardNumber).sort()).toEqual([1, 2]);
    expect(numbered[0]!.id).not.toBe(numbered[1]!.id);
  });

  it('board 1 (placed first) keeps the seam hex’s label, not board 2’s', () => {
    const board1East = colRowToAxial({ c: 18, r: 6 });
    const seamId = `${board1East.q},${board1East.r}`;
    const seam = hexes.find((h) => h.id === seamId)!;
    expect(seam.cell.board).toBe(1);
    expect(seam.label).toBe('S06');
  });
});

describe('generateBoardHexes (two boards abutted north-south)', () => {
  const hexes = generateBoardHexes([
    { gx: 0, gy: 0, n: 1 },
    { gx: 0, gy: 1, n: 2 },
  ]);

  it('merges the shared seam row (10 even-column bottom/top halves)', () => {
    expect(hexes.length).toBe(238 + 238 - 10);
  });
});
