/**
 * Flat-top board substrate: column/row grid, coordinate labels, board number,
 * and multi-board abutment — see docs/hex_board_spec/README.md (authoritative).
 * Pure, no state; bridges the spec's per-board (c, r) grid to the engine's
 * single shared axial (q, r) space used by hex.ts's adjacency/LOS/arc math.
 *
 * This module is deliberately silent on pixel size (R) and rendering — that
 * lives in ui/hexgeo.ts, same split as hex.ts's unit-scale axialToPixel.
 */
import { hexId } from './hex';
import type { Axial, HexId } from './types';

/** A cell's position on ONE board's local grid (0-indexed; §Column layout). */
export interface ColRow {
  c: number;
  r: number;
}

/** 17 full + 2 half-edge columns = 18 hex-widths (§Resulting dimensions). */
export const BOARD_COLS = 19;
/** Playable row range per column is r = 0..12 pre-clip (§Column layout). */
export const BOARD_ROWS = 12;

const LETTERS = 'ABCDEFGHIJKLMNOPQRS'; // A..S, c = 0..18

/**
 * Column/row -> axial, for a hex on the single nominal board at (gx=0, gy=0).
 * Multi-board placement uses `generateBoardHexes` below instead (the offset
 * isn't a simple per-axis translation — see that function's header comment).
 */
export function colRowToAxial(pos: ColRow): Axial {
  return { q: pos.c, r: pos.r - Math.floor(pos.c / 2) };
}

/** Inverse of `colRowToAxial` (single nominal board only). */
export function axialToColRow(a: Axial): ColRow {
  return { c: a.q, r: a.r + Math.floor(a.q / 2) };
}

/** The upper-left cell of every board — carries the board number, not a coordinate. */
export function isBoardNumberCell(pos: ColRow): boolean {
  return pos.c === 0 && pos.r === 0;
}

/**
 * Coordinate label for a column/row cell (e.g. "A01".."S12"), or `null` for
 * the unlabeled top-edge half-hex on even columns (§Labeling) — callers
 * should check `isBoardNumberCell` first, since c=0,r=0 is the board-number
 * cell, not a coordinate, even though it would otherwise compute as null too.
 */
export function colRowLabel(pos: ColRow): string | null {
  const even = pos.c % 2 === 0;
  if (even && pos.r === 0) return null;
  const num = even ? pos.r : pos.r + 1;
  return LETTERS[pos.c]! + String(num).padStart(2, '0');
}

/** One board's placement on the board-grid (gx increases east, gy south). */
export interface BoardPlacement {
  gx: number;
  gy: number;
  /** The number stamped in the board's upper-left cell (§Labeling). */
  n: number;
}

/** Board-relative half-plane clip flags — see Hex.edgeCut's doc comment (engine/types.ts). */
export interface EdgeCut {
  w?: true;
  e?: true;
  n?: true;
  s?: true;
}

export interface GeneratedHex {
  id: HexId;
  coord: Axial;
  /** null for the board-number cell and the unlabeled top-edge half-hexes. */
  label: string | null;
  /** Set only on the cell that carries the board number. */
  boardNumber: number | null;
  /** Which board (by placement order) first generated this hex, and its local (c, r) on that board. */
  cell: { board: number; c: number; r: number };
  /** Undefined if this hex has no exposed board edge (ordinary full hex). */
  edgeCut?: EdgeCut;
}

/**
 * All hexes for a set of abutted boards, in one shared axial space.
 *
 * The per-board pixel origin is `(gx*boardW, gy*boardH)` (§Multiple boards),
 * but axial isn't a simple per-axis translation of that: the flat-top pixel
 * formula `y = h*(r_axial + q/2)` couples r to q, so shifting a board east
 * (gx) also shifts the r_axial needed to keep the same visual row aligned.
 * Solving `pixelOf(gx,gy,c,r) == pixelFromAxial(q,r_axial) + constant` for
 * every (gx,gy,c,r) gives:
 *   q_global      = gx*18 + c
 *   r_axial_global = gy*12 + r - floor(c/2) - gx*9
 * (verified numerically against the spec's own pixel formula across a 3x3
 * board-grid sweep — every board/cell agrees up to one constant global
 * offset, and shared seam cells from either board resolve to the identical
 * axial id). A board's own edge half-hex is only ever added once: whichever
 * board comes first in `boards` wins the merged seam hex's label/coord.
 *
 * Note: for a deeply irregular (non-rectangular / staggered) board layout,
 * two boards sharing a merged seam hex could in principle disagree about
 * whether one of its *other* edges is exposed (e.g. board A has no northern
 * neighbor but board B, abutting A on the east, does). This generator just
 * takes whichever board wins the label/number priority below as canonical
 * for the whole hex (including its edgeCut) — correct for any layout this
 * project is likely to need (rectangular board grids), not exhaustively
 * correct for arbitrary L-shaped ones.
 */
export function generateBoardHexes(boards: BoardPlacement[]): GeneratedHex[] {
  const has = new Set(boards.map((b) => `${b.gx},${b.gy}`));
  const byId = new Map<HexId, GeneratedHex>();
  for (const b of boards) {
    // Is each of this board's four outer edges exposed (no neighbour board there)?
    const expW = !has.has(`${b.gx - 1},${b.gy}`);
    const expE = !has.has(`${b.gx + 1},${b.gy}`);
    const expN = !has.has(`${b.gx},${b.gy - 1}`);
    const expS = !has.has(`${b.gx},${b.gy + 1}`);
    for (let c = 0; c < BOARD_COLS; c++) {
      // Even columns run r=0..12 (row 0 = the unlabeled top half, row 12 =
      // the bottom half). Odd columns are already flush top/bottom with
      // exactly 12 full hexes (r=0..11) — an r=12 odd-column cell would clip
      // to a zero-area sliver below the board's real bottom edge (§Straight-
      // edge clip's "degenerate slivers... must be discarded") and must not
      // be generated as a playable hex at all, not just hidden visually.
      const even = c % 2 === 0;
      const maxR = even ? BOARD_ROWS : BOARD_ROWS - 1;
      for (let r = 0; r <= maxR; r++) {
        const coord: Axial = {
          q: b.gx * (BOARD_COLS - 1) + c,
          r: b.gy * BOARD_ROWS + r - Math.floor(c / 2) - b.gx * 9,
        };
        const id = hexId(coord.q, coord.r);
        // A merged seam hex is generated once per abutting board (its own
        // half-polygon from each side); at most one side ever has anything
        // to show there (e.g. a board's blank top-edge half can coincide
        // with its EAST neighbor's board-number cell — verified against the
        // reference render, docs/hex_board_spec/two_boards.png). Whichever
        // board contributes real content (a label or the board number) wins;
        // if both do (two different boards' real coordinates sharing one
        // physical hex), the earlier board in `boards` wins, matching
        // "Do not renumber cells across boards" — one board's address is
        // the map's canonical one, not a fresh third label.
        const existing = byId.get(id);
        if (existing && (existing.label != null || existing.boardNumber != null)) continue;
        const pos: ColRow = { c, r };
        const numberCell = isBoardNumberCell(pos);
        const onW = c === 0;
        const onE = c === BOARD_COLS - 1;
        const onN = even && r === 0;
        const onS = even && r === BOARD_ROWS;
        const edgeCut: EdgeCut = {};
        if (onW && expW) edgeCut.w = true;
        if (onE && expE) edgeCut.e = true;
        if (onN && expN) edgeCut.n = true;
        if (onS && expS) edgeCut.s = true;
        byId.set(id, {
          id,
          coord,
          label: numberCell ? null : colRowLabel(pos),
          boardNumber: numberCell ? b.n : null,
          cell: { board: b.n, c, r },
          edgeCut: Object.keys(edgeCut).length ? edgeCut : undefined,
        });
      }
    }
  }
  return [...byId.values()];
}
