/**
 * Hex Board Demo — a NON-canonical proving ground for the new flat-top board
 * substrate (docs/hex_board_spec/README.md), not from the Mission Book.
 *
 * Two variants, toggled by `TWO_BOARDS`:
 *  - Two boards abutted east-west, entirely open terrain, units placed
 *    straddling the board 1 / board 2 seam specifically to exercise the
 *    multi-board adjacency merge (Move/Pivot/Fire across the seam must
 *    resolve exactly like any other neighboring hex — see
 *    engine/__tests__/hexBoard.test.ts for the underlying coordinate-math
 *    proof; this mission is the live/visual click-through counterpart).
 *  - A single blank board (all open, no units) — reference canvas for
 *    re-authoring Mission 1 onto the new grid (labels visible, no clutter).
 */
import { generateBoardHexes } from '../../engine/hexBoard';
import type { MissionDef } from '../../engine/types';
import { generateOpenBoard } from '../hexBoardMap';
import { UNIT_TEMPLATES } from '../units';

const TWO_BOARDS = false;

const BOARDS = TWO_BOARDS
  ? [
      { gx: 0, gy: 0, n: 1 },
      { gx: 1, gy: 0, n: 2 },
    ]
  : [{ gx: 0, gy: 0, n: 1 }];

const HEXES = generateOpenBoard(BOARDS);

// Look up specific cells by (board, c, r) for unit placement, straddling the
// board 1 <-> board 2 seam (board 1's c=17/c=18 next to board 2's c=0/c=1).
const cells = generateBoardHexes(BOARDS);
const byCell = new Map(cells.map((h) => [`${h.cell.board}-${h.cell.c}-${h.cell.r}`, h]));
const at = (board: number, c: number, r: number) => byCell.get(`${board}-${c}-${r}`)!.id;

const UNITS = TWO_BOARDS
  ? [
      // Germans (A) on board 1, a couple hexes back from the seam, facing SE (0)
      // toward it — G-seam sits directly adjacent to the seam column.
      { id: 'G-rifle', side: 'A' as const, templateId: 'ger-rifle', hexId: at(1, 15, 6), facing: 0 as const },
      { id: 'G-seam', side: 'A' as const, templateId: 'ger-rifle', hexId: at(1, 17, 6), facing: 0 as const },
      // Soviets (B) on board 2, mirrored, facing NW (3) back toward the seam.
      { id: 'S-seam', side: 'B' as const, templateId: 'sov-rifle', hexId: at(2, 1, 6), facing: 3 as const },
      { id: 'S-rifle', side: 'B' as const, templateId: 'sov-rifle', hexId: at(2, 3, 6), facing: 3 as const },
    ]
  : [];

const templates = [...new Set(UNITS.map((u) => u.templateId))].map((id) => {
  const t = UNIT_TEMPLATES[id];
  if (!t) throw new Error(`Hex Board Demo references unknown unit template: ${id}`);
  return t;
});

export const HEX_BOARD_DEMO: MissionDef = {
  id: 'demo-hex-board',
  name: 'Hex Board Demo (test)',
  roundsTotal: 5,
  seed: 220726,
  caps: { A: 7, B: 7 },
  nations: { A: ['germans'], B: ['soviets'] },
  firstInitiative: 'A',
  vpPerKill: 1,
  hexes: HEXES,
  units: UNITS,
  templates,
  victoryHexes: TWO_BOARDS ? [{ hexId: at(1, 18, 6), vp: 1 }] : [{ hexId: at(1, 9, 6), vp: 1 }],
};
