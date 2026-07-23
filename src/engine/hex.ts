/**
 * Axial hex-grid math (flat-top — see docs/hex_board_spec/README.md, the
 * authoritative board geometry). Pure, no state.
 *
 * Facing is an index 0..5 into AXIAL_DIRECTIONS. A unit's facing points toward
 * one of its six neighbours; the front arc is that neighbour's direction plus
 * the two adjacent directions (a 180° forward arc — rulebook §5.1, §6.1).
 *
 * The six axial neighbour deltas below are orientation-agnostic (the same
 * six vectors work for either a pointy-top or flat-top rendering — only the
 * pixel projection in `axialToPixel` encodes which one). Direction labels in
 * the comments are the *flat-top* compass reading (a flat-top hex has no
 * direct E/W neighbour — its two horizontal edges are N/S).
 */
import type { Axial, Facing, HexId } from './types';

/** Flat-top neighbour offsets, indexed 0..5. */
export const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, // 0  SE
  { q: 1, r: -1 }, // 1  NE
  { q: 0, r: -1 }, // 2  N
  { q: -1, r: 0 }, // 3  NW
  { q: -1, r: 1 }, // 4  SW
  { q: 0, r: 1 }, // 5  S
];

export function hexId(q: number, r: number): HexId {
  return `${q},${r}`;
}

export function idOf(a: Axial): HexId {
  return hexId(a.q, a.r);
}

export function parseHexId(id: HexId): Axial {
  const parts = id.split(',');
  return { q: Number(parts[0]), r: Number(parts[1]) };
}

export function axialEq(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

export function add(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbor(a: Axial, dir: Facing): Axial {
  return add(a, AXIAL_DIRECTIONS[dir]!);
}

export function neighbors(a: Axial): Axial[] {
  return AXIAL_DIRECTIONS.map((d) => add(a, d));
}

// --- cube helpers ----------------------------------------------------------

interface Cube {
  x: number;
  y: number;
  z: number;
}

function axialToCube(a: Axial): Cube {
  return { x: a.q, z: a.r, y: -a.q - a.r };
}

function cubeToAxial(c: Cube): Axial {
  return { q: c.x, r: c.z };
}

function cubeRound(c: Cube): Cube {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

export function distance(a: Axial, b: Axial): number {
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  return (Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y) + Math.abs(ac.z - bc.z)) / 2;
}

// --- pixel geometry (for arc / direction tests) ----------------------------

export interface Pixel {
  x: number;
  y: number;
}

/** Flat-top axial → pixel (unit size; R=1). Used for board rendering and arc-of-fire geometry. */
export function axialToPixel(a: Axial): Pixel {
  return { x: 1.5 * a.q, y: Math.sqrt(3) * (a.r + a.q / 2) };
}

// --- line drawing (for LOS) ------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Hexes a center-to-center line passes through, inclusive of endpoints.
 * `eps` is a tiny cube-space nudge used to break exact edge ties; los.ts calls
 * this twice (nudged both ways) to implement the "least restrictive" rule.
 */
export function lineDraw(a: Axial, b: Axial, eps: Cube = { x: 0, y: 0, z: 0 }): Axial[] {
  const n = distance(a, b);
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  const aN: Cube = { x: ac.x + eps.x, y: ac.y + eps.y, z: ac.z + eps.z };
  const bN: Cube = { x: bc.x + eps.x, y: bc.y + eps.y, z: bc.z + eps.z };
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push(
      cubeToAxial(
        cubeRound({
          x: lerp(aN.x, bN.x, t),
          y: lerp(aN.y, bN.y, t),
          z: lerp(aN.z, bN.z, t),
        }),
      ),
    );
  }
  return out;
}

// --- arc of fire / front vs flank ------------------------------------------

const ARC_EPS = 1e-9;

/**
 * Is `target` inside `from`'s front arc, given `facing`?
 * Front arc = the forward 180° half-plane (the facing direction + the two
 * adjacent directions). Hexes exactly on the perpendicular boundary, and the
 * unit's own hex, are treated as NOT in the front arc (rulebook §6.1, §7.3).
 */
export function isInFrontArc(from: Axial, facing: Facing, target: Axial): boolean {
  const fvec = axialToPixel(AXIAL_DIRECTIONS[facing]!);
  const fp = axialToPixel(from);
  const tp = axialToPixel(target);
  const rel = { x: tp.x - fp.x, y: tp.y - fp.y };
  const forwardness = rel.x * fvec.x + rel.y * fvec.y;
  return forwardness > ARC_EPS;
}

/** Cube-space epsilon nudges used by los.ts for the edge-tie rule. */
export const LOS_EPS_POS: Cube = { x: 1e-6, y: 2e-6, z: -3e-6 };
export const LOS_EPS_NEG: Cube = { x: -1e-6, y: -2e-6, z: 3e-6 };
