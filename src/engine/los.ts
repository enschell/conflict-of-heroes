/**
 * Line of sight and arc of fire (rulebook §6.0, §6.1).
 *
 * LOS is drawn center-to-center. It is blocked if it crosses any part of a
 * blocking hex — EXCEPT when it runs exactly along the edge shared by two
 * hexes, in which case the least restrictive hex applies (so it is blocked
 * only if BOTH edge hexes block). We implement the edge rule by drawing the
 * line twice, nudged to either side, and comparing.
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

/**
 * Clear line of sight from one hex to another (endpoints excluded). Terrain
 * blocks as before; Smoke adds (§14.3–§14.4): a Heavy Smoke hex on the path
 * blocks LOS outright (at all elevations), and two or more Light Smoke hexes
 * on the path block it too — a single Light Smoke hex does not block (it adds
 * a +1DR bonus instead, computed by `smoke.ts` for combat only).
 */
export function hasLOS(state: GameState, fromId: HexId, toId: HexId): boolean {
  if (fromId === toId) return true;
  const a = parseHexId(fromId);
  const b = parseHexId(toId);
  const lineP = lineDraw(a, b, LOS_EPS_POS);
  const lineM = lineDraw(a, b, LOS_EPS_NEG);
  let lightSmokeHexes = 0;
  for (let i = 1; i < lineP.length - 1; i++) {
    const hp = idOf(lineP[i]!);
    const hm = idOf(lineM[i]!);
    if (hp === hm) {
      // Definite interior crossing: this hex must be clear.
      if (blocksLOS(state, hp)) return false;
      const lvl = smokeLevel(state, hp);
      if (lvl === 2) return false;
      if (lvl === 1) lightSmokeHexes++;
    } else {
      // Running along an edge: least restrictive — blocked only if BOTH block.
      if (blocksLOS(state, hp) && blocksLOS(state, hm)) return false;
      const lvl = Math.min(smokeLevel(state, hp), smokeLevel(state, hm));
      if (lvl === 2) return false;
      if (lvl === 1) lightSmokeHexes++;
    }
  }
  return lightSmokeHexes < 2;
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
