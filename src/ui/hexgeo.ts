/**
 * SVG geometry for the board: real flat-top hexagons positioned from the
 * engine's axial→pixel mapping, per docs/hex_board_spec/README.md (the
 * authoritative board geometry — half-hex edges, labels, board number,
 * multi-board abutment). The ASCII grid in scripts/ is debug-only; this is
 * the actual visual model.
 */
import { AXIAL_DIRECTIONS, axialToPixel, idOf, neighbors, parseHexId } from '../engine/hex';
import type { GameState, Facing, Hex, HexId } from '../engine/types';

export const HEX_SIZE = 36; // circumradius in px

export interface Pt {
  x: number;
  y: number;
}

/** Pixel centre of a hex (engine unit geometry scaled by `size`). */
export function hexCenter(id: HexId, size = HEX_SIZE): Pt {
  const p = axialToPixel(parseHexId(id));
  return { x: p.x * size, y: p.y * size };
}

/** The six corner points of a flat-top hex around `center` (vertices at 0°, 60°, ... 300°). */
export function hexCorners(center: Pt, size = HEX_SIZE): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return pts;
}

export function pointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * Corner-index pair making up the shared edge in each axial direction 0..5
 * (flat-top: SE, NE, N, NW, SW, S — see engine/hex.ts). Unchanged from the
 * old pointy-top values: the relationship between "facing index" and "which
 * pair of corner indices bounds that edge" is preserved by construction
 * (both corner numbering and facing numbering rotate together) even though
 * the actual angle each index represents changed — verified by direct
 * derivation, not assumed.
 */
export const EDGE_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // 0 SE
  [5, 0], // 1 NE
  [4, 5], // 2 N
  [3, 4], // 3 NW
  [2, 3], // 4 SW
  [1, 2], // 5 S
];

/** Outward unit vector (pixel space) for a facing direction. */
export function facingVector(facing: Facing): Pt {
  const d = axialToPixel(AXIAL_DIRECTIONS[facing]!);
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

// --- board-edge half/quarter-hex clipping (§Straight-edge clip) -----------

function clipHalfPlane(poly: Pt[], inside: (p: Pt) => boolean, intersect: (a: Pt, b: Pt) => Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ina = inside(a);
    const inb = inside(b);
    if (ina) {
      out.push(a);
      if (!inb) out.push(intersect(a, b));
    } else if (inb) {
      out.push(intersect(a, b));
    }
  }
  return out;
}

function intersectX(a: Pt, b: Pt, x: number): Pt {
  const t = (x - a.x) / (b.x - a.x);
  return { x, y: a.y + t * (b.y - a.y) };
}

function intersectY(a: Pt, b: Pt, y: number): Pt {
  const t = (y - a.y) / (b.y - a.y);
  return { x: a.x + t * (b.x - a.x), y };
}

/**
 * Clip a hex's corner polygon against its own board-relative edge cuts
 * (`Hex.edgeCut`, engine/types.ts). Every clip line passes exactly through
 * the hex's own `center` — verified: the spec's board-boundary coordinates
 * (xL/xR/yT/yB) equal the affected edge hexes' own cx/cy exactly — so no
 * board origin/size is needed here, just this one hex's center. `w`/`e` keep
 * the right/left half respectively (the board's vertical clip lines cross
 * two hex edges, not one — see engine/hexBoard.ts); `n`/`s` keep the
 * bottom/top half (these do coincide with the hex's own N/S edges).
 */
export function clipHexPolygon(corners: Pt[], center: Pt, cut: Hex['edgeCut']): Pt[] {
  if (!cut) return corners;
  let poly = corners;
  if (cut.w) poly = clipHalfPlane(poly, (p) => p.x >= center.x, (a, b) => intersectX(a, b, center.x));
  if (cut.e) poly = clipHalfPlane(poly, (p) => p.x <= center.x, (a, b) => intersectX(a, b, center.x));
  if (cut.n) poly = clipHalfPlane(poly, (p) => p.y >= center.y, (a, b) => intersectY(a, b, center.y));
  if (cut.s) poly = clipHalfPlane(poly, (p) => p.y <= center.y, (a, b) => intersectY(a, b, center.y));
  return poly;
}

/** Centroid of a (possibly clipped) polygon — labels center on this, not the full hex's center. */
export function polygonCentroid(poly: Pt[]): Pt {
  const n = poly.length || 1;
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / n, y: y / n };
}

/** Topmost y of a polygon — coordinate labels sit just below this (§Labeling). */
export function polygonTopY(poly: Pt[]): number {
  return Math.min(...poly.map((p) => p.y));
}

/**
 * The one-hex-thick fringe around the board: hexes adjacent to a playable hex
 * that are not themselves playable. Rendered (clipped) as decorative filler
 * for irregular (non-rectangular) maps — the new board-spec's own boundary
 * is already a clean rectangle via `edgeCut`, so this matters only for
 * hand-authored maps that don't fill a whole board.
 */
export function fringeHexes(state: Pick<GameState, 'hexes'>): HexId[] {
  const playable = new Set(Object.keys(state.hexes));
  const fringe = new Set<HexId>();
  for (const id of playable) {
    for (const n of neighbors(parseHexId(id))) {
      const nid = idOf(n);
      if (!playable.has(nid)) fringe.add(nid);
    }
  }
  return [...fringe];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The TRUE tight bounding box of the union of every hex's own (edge-clipped) polygon — unlike
 * `playableBounds` below (which uses each hex's full UNCLIPPED ±size box, deliberately generous so
 * a half/quarter-hex silhouette is never cut off by too-tight an SVG viewBox), this is the exact
 * rectangle the real rendered board occupies. A board-edge hex is only ever half/quarter of its
 * full box (`edgeCut`), so `playableBounds`' box is measurably BIGGER than the real silhouette on
 * every clipped side — the wrong basis for stretching a full-board overlay image: an image sized to
 * `playableBounds` gets stretched across that bigger box, then clipped down to the real (smaller)
 * silhouette, silently losing a real margin of the source image forever. Use this for anything that
 * must exactly match the visible board (overlay image sizing); keep `playableBounds` for viewport/
 * viewBox fitting, where the extra margin is intentional.
 */
export function tightHexBounds(hexes: Iterable<Pick<Hex, 'id' | 'edgeCut'>>, size = HEX_SIZE): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hex of hexes) {
    const center = hexCenter(hex.id, size);
    const corners = clipHexPolygon(hexCorners(center, size), center, hex.edgeCut);
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * "Overlay mode" real gameplay art (Map Editor, CLAUDE.md §D): one entry per
 * distinct `mapNumber` that has a saved overlay image — the sub-bounds and
 * union-of-clipped-hex-polygons needed to stretch+clip that ONE image behind
 * just that board's own hexes (not the whole multi-board assembly, so a
 * Mission with only some boards overlaid doesn't smear one board's art
 * across another's). Shared by `Board.tsx` (the live game) and
 * `EditorBoard.tsx` (Mission Editor previews) so the algorithm can't drift
 * between the two call sites.
 */
export interface MapOverlayGroup {
  mapNumber: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hexIds: HexId[];
  clipPolygons: string[];
}

export function computeMapOverlayGroups(
  hexesById: Record<HexId, Pick<Hex, 'id' | 'mapNumber' | 'edgeCut'>>,
  mapOverlays: Record<number, string> | undefined,
  size = HEX_SIZE,
): MapOverlayGroup[] {
  if (!mapOverlays || !Object.keys(mapOverlays).length) return [];
  const idsByNumber = new Map<number, HexId[]>();
  for (const hex of Object.values(hexesById)) {
    if (hex.mapNumber != null && mapOverlays[hex.mapNumber]) {
      const arr = idsByNumber.get(hex.mapNumber) ?? [];
      arr.push(hex.id);
      idsByNumber.set(hex.mapNumber, arr);
    }
  }
  const groups: MapOverlayGroup[] = [];
  for (const [mapNumber, hexIds] of idsByNumber) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const clipPolygons: string[] = [];
    for (const id of hexIds) {
      const hex = hexesById[id]!;
      const c = hexCenter(id, size);
      const corners = hexCorners(c, size);
      const clipped = hex.edgeCut ? clipHexPolygon(corners, c, hex.edgeCut) : corners;
      // Bound by the CLIPPED corners actually shown, not the full unclipped hex box — a
      // board-edge hex's real footprint is only half/quarter of that box (see `tightHexBounds`'s
      // own doc comment above). Using the bigger unclipped box here stretches the image across
      // more area than the clip-path ever reveals, silently losing a real margin of the image.
      for (const p of clipped) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      clipPolygons.push(pointsAttr(clipped));
    }
    groups.push({ mapNumber, url: mapOverlays[mapNumber]!, x: minX, y: minY, width: maxX - minX, height: maxY - minY, hexIds, clipPolygons });
  }
  return groups;
}

export interface DisplayRotationCluster {
  hexIds: Set<HexId>;
  rotation: 90 | -90;
  pivot: Pt;
}

/**
 * Reconstructs a {90°,-90°} display-rotation cluster from a flattened, live
 * `GameState`/`MissionDef` — the counterpart to `engine/boardAssembly.ts`'s
 * `rotationClusters()`, which needs the ORIGINAL per-board entry list
 * (hexes/rotation/attachTo) that only the Mission Editor still has. Once
 * exported, only `mapRotations: Record<mapNumber, 90|-90>` survives (see that
 * field's own comment in `engine/types.ts`) — but that's enough, because
 * `boardAssembly.ts` proves every board in one Mission assembly is always the
 * SAME rotation family (a quarter-family board can only ever attach to
 * another quarter-family board, and the whole assembly is one connected
 * tree) — so "any entry in `mapRotations` at all" already implies EVERY hex
 * in the Mission belongs to the one cluster, with no per-mapNumber filtering
 * needed. The one piece of real information lost by flattening is WHICH
 * board was the anchor (whose own rotation value the real `rotationClusters`
 * uses when boards are mixed 90°/-90° within one tree) — this picks the
 * smallest `mapNumber`'s value instead, which is exactly correct whenever
 * every board was tagged the same way (the documented, recommended
 * authoring practice) and only an approximation in the rare mixed-tag case.
 */
export function computeDisplayRotationCluster(
  hexesById: Record<HexId, Pick<Hex, 'id' | 'mapNumber'>>,
  mapRotations: Record<number, 90 | -90> | undefined,
  size = HEX_SIZE,
): DisplayRotationCluster | null {
  if (!mapRotations || !Object.keys(mapRotations).length) return null;
  const rotation = mapRotations[Math.min(...Object.keys(mapRotations).map(Number))]!;
  const hexIds = new Set<HexId>();
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const hex of Object.values(hexesById)) {
    hexIds.add(hex.id);
    const c = hexCenter(hex.id, size);
    sx += c.x;
    sy += c.y;
    n++;
  }
  if (n === 0) return null;
  return { hexIds, rotation, pivot: { x: sx / n, y: sy / n } };
}

/** Bounding box (hex-corner inclusive) of just the PLAYABLE hexes — the clip edge. */
export function playableBounds(state: Pick<GameState, 'hexes'>, size = HEX_SIZE): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of Object.keys(state.hexes)) {
    const c = hexCenter(id, size);
    minX = Math.min(minX, c.x - size);
    maxX = Math.max(maxX, c.x + size);
    minY = Math.min(minY, c.y - size);
    maxY = Math.max(maxY, c.y + size);
  }
  return { minX, minY, maxX, maxY };
}

export interface Layout {
  width: number;
  height: number;
  offset: Pt;
  size: number;
}

/**
 * Bounding box + translate offset so the whole map fits the SVG viewBox. `extra`
 * ids (e.g. the fringe) are included so half-hexes drawn outside the playable
 * area aren't cut off by the viewBox.
 */
export function computeLayout(
  state: Pick<GameState, 'hexes'>,
  size = HEX_SIZE,
  pad = size * 0.7,
  extra: HexId[] = [],
): Layout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of [...Object.keys(state.hexes), ...extra]) {
    const c = hexCenter(id, size);
    minX = Math.min(minX, c.x - size);
    maxX = Math.max(maxX, c.x + size);
    minY = Math.min(minY, c.y - size);
    maxY = Math.max(maxY, c.y + size);
  }
  if (!Number.isFinite(minX)) return { width: 100, height: 100, offset: { x: 0, y: 0 }, size };
  return {
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    offset: { x: pad - minX, y: pad - minY },
    size,
  };
}
