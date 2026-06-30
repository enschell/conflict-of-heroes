/**
 * SVG geometry for the board: real pointy-top hexagons positioned from the
 * engine's axial→pixel mapping. (The ASCII grid in scripts/ is debug-only;
 * this is the actual visual model — CLAUDE.md §7.)
 */
import { AXIAL_DIRECTIONS, axialToPixel, idOf, neighbors, parseHexId } from '../engine/hex';
import type { GameState, Facing, HexId } from '../engine/types';

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

/** The six corner points of a pointy-top hex around `center`. */
export function hexCorners(center: Pt, size = HEX_SIZE): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return pts;
}

export function pointsAttr(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/** Corner-index pair making up the shared edge in each axial direction 0..5. */
export const EDGE_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // 0 E
  [5, 0], // 1 NE
  [4, 5], // 2 NW
  [3, 4], // 3 W
  [2, 3], // 4 SW
  [1, 2], // 5 SE
];

/** Outward unit vector (pixel space) for a facing direction. */
export function facingVector(facing: Facing): Pt {
  const d = axialToPixel(AXIAL_DIRECTIONS[facing]!);
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
}

/**
 * The one-hex-thick fringe around the board: hexes adjacent to a playable hex
 * that are not themselves playable. Rendered (clipped) as the edge half-hexes.
 */
export function fringeHexes(state: GameState): HexId[] {
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

/** Bounding box (hex-corner inclusive) of just the PLAYABLE hexes — the clip edge. */
export function playableBounds(state: GameState, size = HEX_SIZE): Bounds {
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
  state: GameState,
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
