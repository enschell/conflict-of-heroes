/**
 * Multi-board Mission assembly: combine several independently-rotated boards
 * (each a `MapHexDef[]` in its own local, un-rotated axial space — e.g. from
 * `data/hexBoardMap.ts`'s `generateOpenBoard`/`applyTerrainJson`, or
 * `data/maps/mission1.ts`'s `MISSION1_MAP`) into one merged, globally-adjacent
 * `MapHexDef[]` for a real Mission.
 *
 * The hard constraint this module encodes (derived and numerically verified —
 * see CLAUDE.md §C for the full derivation): **a hexagon only has 6-fold
 * rotational symmetry, not 4-fold.** A genuine 90°/-90° rotation of a board's
 * own axial coordinates that both preserves adjacency and doesn't mirror the
 * authored content does not exist — verified two ways (group theory; a direct
 * counterexample rotating one real board's coordinates broke 432 real
 * adjacencies and created 396 fake ones). The only two REAL axial-coordinate
 * rotations available are:
 *   - **0°**: identity — the one and only correct transform for a 0°-tagged board.
 *   - **180°**: the exact cube-coordinate identity `(q,r) -> (-q,-r)` (180° is
 *     3×60°, a genuine hex-tiling symmetry — no approximation) — the one and
 *     only correct transform for a 180°-tagged board.
 * **90°/-90° have no axial-coordinate equivalent at all.** Neither represents
 * anything "real," so a 90°/-90°-tagged board is free to use EITHER of the
 * two real transforms internally (whichever one makes its requested
 * attachment actually merge) — this module tries both and uses whichever
 * succeeds. The user-visible 90° vs -90° distinction (which way it actually
 * *looks* rotated) is a DISPLAY-ONLY pixel spin layered on top, applied
 * entirely by the rendering layer (`ui/hexgeo.ts`); this module never touches
 * pixels.
 *
 * Separately, **user-facing rotation families are {0°,180°} and {90°,-90°}**
 * (confirmed with the user) — two boards may only be DIRECTLY attached if
 * they're in the same family. This is NOT the same partition as the internal
 * transform choice above (a 90°-tagged board might internally use identity OR
 * negation depending on what its neighbor needs) — it's a separate,
 * explicitly-enforced rule, because a {0°,180°} board sitting directly next
 * to a {90°,-90°} board would visually show one of them tilted a quarter-turn
 * relative to the other, even on an internally-adjacency-consistent merge —
 * never a coherent-looking battlefield, so it's rejected outright.
 *
 * Verified numerically (not just derived): negation preserves every one of a
 * real board's 1,302 known-adjacent pairs exactly (0 missing, 0 spurious),
 * and the E-W/N-S abutment translations this module discovers by search
 * reproduce the existing single-board-family formulas exactly — E-W merges
 * 13 cells (the full boundary column), N-S merges only 10 (the EVEN columns'
 * boundary half-hex; odd columns are already full top-to-bottom and merely
 * sit adjacent, not merged — an initial 19-cell assumption was wrong and
 * caught live via a full-board collision check, see `onLocalEdge`'s own
 * comment) — see `engine/__tests__/boardAssembly.test.ts`.
 */
import { hexId, parseHexId } from './hex';
import { BOARD_COLS, BOARD_ROWS, axialToColRow } from './hexBoard';
import type { Axial, Facing, HexId, MapHexDef } from './types';

export type Rotation = 0 | 90 | -90 | 180;
export type BoardEdge = 'N' | 'S' | 'E' | 'W';

export interface BoardAssemblyEntry {
  id: string;
  /** This board's own hexes, in its own LOCAL (un-rotated, un-translated) axial space. */
  hexes: MapHexDef[];
  rotation: Rotation;
  /** Omitted only for the first (anchor) entry. */
  attachTo?: { boardId: string; localEdge: BoardEdge; neighborLocalEdge: BoardEdge };
}

/** The user-facing rotation family — only same-family boards may directly attach (see module header). */
function userFamily(rotation: Rotation): 'upright' | 'quarter' {
  return rotation === 0 || rotation === 180 ? 'upright' : 'quarter';
}

interface Transform {
  negated: boolean;
  fn: (a: Axial) => Axial;
}
const IDENTITY: Transform = { negated: false, fn: (a) => a };
const NEGATE: Transform = { negated: true, fn: (a) => ({ q: -a.q, r: -a.r }) };

/**
 * Which axial transform(s) a board tagged `rotation` may use. 0°/180° each
 * have exactly one correct transform; 90°/-90° have no real one, so both
 * candidates are offered — the merge step below tries each in turn.
 */
function candidateTransforms(rotation: Rotation): Transform[] {
  if (rotation === 0) return [IDENTITY];
  if (rotation === 180) return [NEGATE];
  return [IDENTITY, NEGATE];
}

/** 180°-class rotation permutes the six neighbour directions by 3 (opposite) — walls/facing follow. */
function shiftDirIndex(i: number, negated: boolean): number {
  return negated ? (i + 3) % 6 : i;
}

/**
 * Is this hex (by its LOCAL, un-rotated column/row) one of the cells that
 * actually MERGES with a neighbor along the board's given local edge?
 *
 * E/W edges are always a single column (c=0 or c=18 — both even), and every
 * one of those 13 cells is a genuine boundary half-hex that merges with its
 * neighbor's matching half (confirmed: matches the existing single-family
 * `generateBoardHexes` E-W merge exactly, 13/13).
 *
 * N/S edges are NOT uniform: only EVEN columns have a boundary half-hex that
 * merges (10 of the 19 columns); ODD columns are already full top-to-bottom
 * (`generateBoardHexes`'s own comment: "Odd (offset) columns: render as 12
 * full hexes, already flush top and bottom") and so are merely ADJACENT to,
 * not identical with, the neighboring board's cell in that column — verified
 * against the existing `generateBoardHexes` N-S merge, which is exactly 10
 * cells, not 19 (a wrong assumption caught and fixed during derivation — see
 * CLAUDE.md §C).
 */
function onLocalEdge(localCoord: Axial, edge: BoardEdge): boolean {
  const { c, r } = axialToColRow(localCoord);
  const even = c % 2 === 0;
  const bottomR = even ? BOARD_ROWS : BOARD_ROWS - 1;
  switch (edge) {
    case 'W':
      return c === 0;
    case 'E':
      return c === BOARD_COLS - 1;
    case 'N':
      return r === 0 && even;
    case 'S':
      return r === bottomR && even;
  }
}

/**
 * The translation that makes `newCells` (already axial-transformed, not yet
 * translated) exactly coincide with `existingCells` (already in the shared
 * merged space) — a true bijection (same count, every cell pairs with exactly
 * one on the other side), matching the existing single-family abutment's own
 * "half-hexes merge into one full hex" behavior. Returns `null` if no such
 * translation exists (incompatible edge lengths, or this transform candidate
 * doesn't line up — the caller tries the next candidate).
 */
function findMergeTranslation(existingCells: Axial[], newCells: Axial[]): Axial | null {
  if (existingCells.length === 0 || existingCells.length !== newCells.length) return null;
  const existingSet = new Set(existingCells.map((e) => hexId(e.q, e.r)));
  const anchor = newCells[0]!;
  for (const candidate of existingCells) {
    const t: Axial = { q: candidate.q - anchor.q, r: candidate.r - anchor.r };
    const shifted = newCells.map((n) => ({ q: n.q + t.q, r: n.r + t.r }));
    const shiftedSet = new Set(shifted.map((s) => hexId(s.q, s.r)));
    if (shiftedSet.size === existingCells.length && shifted.every((s) => existingSet.has(hexId(s.q, s.r)))) {
      return t;
    }
  }
  return null;
}

interface Placed {
  /** Original local axial coord (pre-transform/translation) — used to test edge membership. */
  local: Axial;
  /** Final absolute axial coord in the shared merged space. */
  abs: Axial;
  def: MapHexDef;
}

/** Apply one candidate transform (axial + wall/facing index shift) to a board's own local hexes, no translation yet. */
function transformBoard(
  hexes: MapHexDef[],
  transform: Transform,
): { local: Axial; transformed: Axial; def: MapHexDef }[] {
  return hexes.map((h) => {
    const local = parseHexId(h.id);
    const walls = h.walls?.map((w) => shiftDirIndex(w, transform.negated));
    const fortification = h.fortification
      ? {
          ...h.fortification,
          facing:
            h.fortification.facing != null
              ? (shiftDirIndex(h.fortification.facing, transform.negated) as Facing)
              : undefined,
        }
      : undefined;
    return {
      local,
      transformed: transform.fn(local),
      // v1 scope: `edgeCut` (board-edge half-hex visual clipping) is dropped
      // on every merged hex — purely cosmetic, and hand-authored missions
      // already render fine without it (CLAUDE.md §B). `label`/`boardNumber`/
      // `mapNumber` are kept as authoring metadata as-is; they may repeat
      // across merged boards (a known v1 cosmetic limitation, not a
      // gameplay one — a future pass could relabel post-merge).
      def: { ...h, walls, fortification, edgeCut: undefined },
    };
  });
}

/** Shared merge logic — returns each board's own final placement, keyed by board id. */
function computePlacement(entries: BoardAssemblyEntry[]): Map<string, Placed[]> {
  if (entries.length === 0) return new Map();
  const anchor = entries[0]!;
  if (anchor.attachTo) throw new Error(`Board "${anchor.id}" is the anchor (first entry) and must not set attachTo.`);

  const placed = new Map<string, Placed[]>();
  // The anchor has no neighbor to satisfy — its first candidate transform
  // (identity for 0°/90°, the forced negation for 180°) is used unconditionally.
  const anchorTransform = candidateTransforms(anchor.rotation)[0]!;
  placed.set(
    anchor.id,
    transformBoard(anchor.hexes, anchorTransform).map(({ local, transformed, def }) => ({ local, abs: transformed, def })),
  );

  for (const entry of entries.slice(1)) {
    if (!entry.attachTo) throw new Error(`Board "${entry.id}" needs attachTo (only the first board is the anchor).`);
    const neighbor = entries.find((e) => e.id === entry.attachTo!.boardId);
    if (!neighbor) throw new Error(`Board "${entry.id}" attaches to unknown board "${entry.attachTo.boardId}".`);
    const neighborPlaced = placed.get(neighbor.id);
    if (!neighborPlaced) {
      throw new Error(`Board "${entry.id}" attaches to "${neighbor.id}", which isn't placed yet — reorder entries.`);
    }
    if (userFamily(entry.rotation) !== userFamily(neighbor.rotation)) {
      throw new Error(
        `Board "${entry.id}" (${entry.rotation}°) cannot directly abut "${neighbor.id}" (${neighbor.rotation}°) — ` +
          `only boards in the same rotation family ({0°,180°} or {90°,-90°}) may share an edge.`,
      );
    }

    const existingEdge = neighborPlaced
      .filter((p) => onLocalEdge(p.local, entry.attachTo!.neighborLocalEdge))
      .map((p) => p.abs);

    // Every other already-placed board's absolute cells — used below to make
    // sure a candidate translation doesn't ALSO collide somewhere it
    // shouldn't (the edge-only bijection check above is necessary but not
    // sufficient: a translation can satisfy it while still overlapping the
    // rest of the board wholesale — caught live during derivation, see
    // CLAUDE.md §C).
    const allPlacedSoFar = [...placed.values()].flat();
    const allPlacedIds = new Set(allPlacedSoFar.map((p) => hexId(p.abs.q, p.abs.r)));
    const expectedMergeCount = existingEdge.length;

    let merged: { local: Axial; abs: Axial; def: MapHexDef }[] | null = null;
    for (const transform of candidateTransforms(entry.rotation)) {
      const transformed = transformBoard(entry.hexes, transform);
      const newEdge = transformed.filter((t) => onLocalEdge(t.local, entry.attachTo!.localEdge)).map((t) => t.transformed);
      const translation = findMergeTranslation(existingEdge, newEdge);
      if (!translation) continue;
      const candidateMerged = transformed.map(({ local, transformed: t, def }) => ({
        local,
        abs: { q: t.q + translation.q, r: t.r + translation.r },
        def,
      }));
      const totalCollisions = candidateMerged.filter((c) => allPlacedIds.has(hexId(c.abs.q, c.abs.r))).length;
      // Only the intended seam should collide — anything else means this
      // translation also overlaps unrelated territory and must be rejected.
      if (totalCollisions === expectedMergeCount) {
        merged = candidateMerged;
        break;
      }
    }
    if (!merged) {
      throw new Error(
        `Cannot merge board "${entry.id}" onto "${neighbor.id}": no translation makes the requested edges ` +
          `(${entry.attachTo.localEdge} <-> ${entry.attachTo.neighborLocalEdge}) coincide exactly without ` +
          `also overlapping unrelated territory — check the edge lengths match (only same-length edges may abut).`,
      );
    }
    placed.set(entry.id, merged);
  }
  return placed;
}

/** Merge several independently-rotated/abutted boards into one Mission's `hexes`. */
export function assembleBoards(entries: BoardAssemblyEntry[]): MapHexDef[] {
  const placed = computePlacement(entries);
  const byId = new Map<HexId, MapHexDef>();
  for (const cells of placed.values()) {
    for (const { abs, def } of cells) {
      const id = hexId(abs.q, abs.r);
      // First board placed wins a merged seam hex's authored content (mirrors
      // `generateBoardHexes`'s own "earlier board wins" merge priority).
      if (byId.has(id)) continue;
      byId.set(id, { ...def, id });
    }
  }
  return [...byId.values()];
}

export interface RotationCluster {
  hexIds: HexId[];
  /** The display spin the rendering layer should apply to this whole cluster. */
  rotation: 90 | -90;
}

/**
 * The {90°,-90°}-family cluster, if any, with every hex id that belongs to
 * it — {0°,180°} boards need no rendering entry at all (their axial transform
 * already renders correctly with zero extra pixel work, see module header).
 * Used by the rendering layer (`ui/hexgeo.ts`/`EditorBoard.tsx`) to apply one
 * shared pixel-space rotation, pivoted around the cluster's own center, so a
 * quarter-turned assembly stays visually self-consistent.
 *
 * Only ever returns zero or one cluster: every non-anchor board must attach
 * to an already-placed one of the SAME rotation family (`assembleBoards`
 * rejects cross-family attachment), so by induction the whole `entries` tree
 * is one single family — there is no way to end up with two independent
 * quarter-family groups (or a mix of families) within one assembly.
 *
 * v1 simplification: if individual boards within the one quarter-family tree
 * are tagged with different quarter values (one 90°, its attached neighbor
 * -90° — both "quarter family," merge cleanly per the module header), the
 * whole assembly's display spin uses the anchor's own value — a mission
 * author who wants a single coherent quarter-turn should tag every board the
 * same way.
 */
export function rotationClusters(entries: BoardAssemblyEntry[]): RotationCluster[] {
  if (entries.length === 0 || userFamily(entries[0]!.rotation) !== 'quarter') return [];
  const placed = computePlacement(entries);
  const hexIds = new Set<HexId>();
  for (const cells of placed.values()) for (const p of cells) hexIds.add(hexId(p.abs.q, p.abs.r));
  return [{ hexIds: [...hexIds], rotation: entries[0]!.rotation as 90 | -90 }];
}
