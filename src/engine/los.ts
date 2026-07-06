/**
 * Line of sight and arc of fire (rulebook §6.0, §6.1, §12.4–§12.6 elevation).
 *
 * LOS is drawn center-to-center. It is blocked if it crosses any part of a
 * blocking hex — EXCEPT when it runs exactly along the edge shared by two
 * hexes, in which case the least restrictive hex applies (so it is blocked
 * only if BOTH edge hexes block). We implement the edge rule by drawing the
 * line twice, nudged to either side, and comparing.
 *
 * Elevation (§12.4): a hex's obstruction level is its own Elevation, +1 more
 * if it's also LOS-blocking terrain (§12.5). Given the two endpoints' own
 * elevations, `H` is the higher of the two: if the endpoints are tied, an
 * intervening hex blocks only if it's STRICTLY higher than `H` (a true 3-way
 * tie never blocks, at any level — the Plateau Effect is not an L0-only
 * carve-out); otherwise (endpoints differ) it blocks if it's equal to or
 * higher than `H`, per §12.4's literal wording. Validated interactively
 * against the rulebook in `public/hills-los-mockup.html` — port changes here
 * back into that file too if this algorithm is ever revisited.
 */
import {
  LOS_EPS_NEG,
  LOS_EPS_POS,
  idOf,
  isInFrontArc,
  lineDraw,
  parseHexId,
} from './hex';
import { blocksLOS, smokeLevel } from './terrain';
import type { Facing, GameState, HexId } from './types';

/** A hex's LOS obstruction level (§12.4/§12.5): Elevation, +1 if LOS-blocking terrain. */
function losLevel(state: GameState, hexId: HexId): number {
  const hex = state.hexes[hexId];
  if (!hex) return 0;
  return hex.elevation + (blocksLOS(state, hexId) ? 1 : 0);
}

/**
 * Clear line of sight from one hex to another (endpoints excluded). Terrain/
 * elevation blocks per §12.4–§12.5 (see module doc); Smoke adds (§14.3–§14.4):
 * a Heavy Smoke hex on the path blocks LOS outright (at all elevations), and
 * two or more Light Smoke hexes on the path block it too — a single Light
 * Smoke hex does not block (it adds a +1DR bonus instead, computed by
 * `smoke.ts` for combat only).
 */
export function hasLOS(state: GameState, fromId: HexId, toId: HexId): boolean {
  if (fromId === toId) return true;
  const a = parseHexId(fromId);
  const b = parseHexId(toId);
  const elevA = state.hexes[fromId]?.elevation ?? 0;
  const elevB = state.hexes[toId]?.elevation ?? 0;
  const H = Math.max(elevA, elevB);
  const tie = elevA === elevB;
  const blocked = (lvl: number) => (tie ? lvl > H : lvl >= H);
  const lineP = lineDraw(a, b, LOS_EPS_POS);
  const lineM = lineDraw(a, b, LOS_EPS_NEG);
  const n = lineP.length - 1;
  let lightSmokeHexes = 0;
  for (let i = 1; i < n; i++) {
    const hp = idOf(lineP[i]!);
    const hm = idOf(lineM[i]!);
    if (hp === hm) {
      // Definite interior crossing: this hex must be clear.
      if (blocked(losLevel(state, hp))) return false;
      const lvl = smokeLevel(state, hp);
      if (lvl === 2) return false;
      if (lvl === 1) lightSmokeHexes++;
    } else {
      // Running along an edge: least restrictive — blocked only if BOTH block.
      if (blocked(Math.min(losLevel(state, hp), losLevel(state, hm)))) return false;
      const lvl = Math.min(smokeLevel(state, hp), smokeLevel(state, hm));
      if (lvl === 2) return false;
      if (lvl === 1) lightSmokeHexes++;
    }
  }
  if (lightSmokeHexes >= 2) return false;

  // §12.6 Blind Spots: LOS-blocking terrain creates a Blind Spot directly
  // behind it (on the far side from whichever endpoint sits at the High
  // Ground level) — even when the plain elevation test above would otherwise
  // let you see past it. Checked from both ends since High Ground can be tied.
  if (n >= 2) {
    if (elevA === H) {
      const near = idOf(lineP[n - 1]!);
      if (blocksLOS(state, near) && (state.hexes[near]?.elevation ?? 0) + 1 < H) return false;
    }
    if (elevB === H) {
      const near = idOf(lineP[1]!);
      if (blocksLOS(state, near) && (state.hexes[near]?.elevation ?? 0) + 1 < H) return false;
    }
  }

  return true;
}

/** Is `targetId` within the front arc of a unit at `fromId` facing `facing`? */
export function inArc(fromId: HexId, facing: Facing, targetId: HexId): boolean {
  return isInFrontArc(parseHexId(fromId), facing, parseHexId(targetId));
}

/** Can a unit at `fromId`/`facing` see-and-target `targetId` (arc + LOS)? */
export function canSightTarget(
  state: GameState,
  fromId: HexId,
  facing: Facing,
  targetId: HexId,
): boolean {
  return inArc(fromId, facing, targetId) && hasLOS(state, fromId, targetId);
}

export interface VisibilityResult {
  visible: HexId[];
  blocked: HexId[];
}

/**
 * Visibility scan for the LOS overlay UI: every hex on the map, partitioned
 * into those with a clear LOS from `fromId` and those without. Optionally
 * restrict to the front arc when a `facing` is provided.
 */
export function visibleHexesFrom(
  state: GameState,
  fromId: HexId,
  facing?: Facing,
): VisibilityResult {
  const visible: HexId[] = [];
  const blocked: HexId[] = [];
  for (const id of Object.keys(state.hexes)) {
    if (id === fromId) continue;
    const arcOk = facing === undefined || inArc(fromId, facing, id);
    if (arcOk && hasLOS(state, fromId, id)) visible.push(id);
    else blocked.push(id);
  }
  return { visible, blocked };
}
