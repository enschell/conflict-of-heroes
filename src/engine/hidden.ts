/**
 * Hidden Units (§11) — pure helpers, following `fortifications.ts`/
 * `obstacles.ts`'s established shape (doc-commented per rulebook section,
 * imported piecemeal into `reducer.ts`/`actions.ts`, no state mutation
 * except where explicitly noted).
 *
 * A render-layer-only concealment mechanism sits on top of this (Board.tsx/
 * HoverPanel.tsx hide a hidden enemy Unit from the shared hotseat screen
 * entirely) — that's a UI concern, not modeled here. This file is only the
 * rules: when a Unit must reveal, what counts as Concealing Terrain, the
 * Hidden Move Action Cost, and the Recon by Fire Reveal Number roll.
 */
import { clampCapMod } from './cap';
import { AXIAL_DIRECTIONS, axialToPixel, distance, idOf, neighbors, parseHexId } from './hex';
import { effectiveStats, templateOf } from './hits';
import { hasLOS } from './los';
import { moveCost, planVehicleMove } from './movement';
import { roll2d6 } from './rng';
import { isCover, smokeLevel, terrainDM } from './terrain';
import type { Facing, GameState, HexId, RngState, SideId, Unit } from './types';

/**
 * §11.5: Concealing Terrain = Defensive Terrain (`isCover`, §6.4) OR Heavy
 * Smoke in any terrain. This single predicate is what makes §11.5's "stays
 * hidden in Concealing Terrain even adjacent to the enemy" fall out of
 * §11.1's reveal conditions directly, rather than needing a separate rule —
 * see `mustRevealAtHex` below.
 */
export function isConcealed(state: GameState, hexId: HexId): boolean {
  return isCover(state, hexId) || smokeLevel(state, hexId) === 2;
}

/**
 * §11.4: is `hexId` out of LOS of every non-Hidden enemy Unit of `ownSide`?
 * `hasLOS` is symmetric and arc-independent (confirmed in `los.ts`), so this
 * is just "no non-Hidden enemy has LOS from their Hex to this one."
 */
export function isOutOfAllEnemyLOS(state: GameState, hexId: HexId, ownSide: SideId): boolean {
  return !Object.values(state.units).some(
    (enemy) => enemy.side !== ownSide && !enemy.hidden && hasLOS(state, enemy.hexId, hexId),
  );
}

/**
 * §11.1 bullets 3-4: must a Hidden `unit` reveal by virtue of sitting at
 * `hexId` right now? Wheeled/Tracked Units have no distance term (reveal the
 * moment they're in Open/non-Concealing Terrain in ANY enemy's LOS); Foot
 * (and Gun) Units are additionally safe beyond 2 Hexes from every such enemy.
 */
export function mustRevealAtHex(state: GameState, unit: Unit, hexId: HexId): boolean {
  if (isConcealed(state, hexId)) return false;
  const isVehicle = templateOf(state, unit).kind === 'vehicle';
  for (const enemy of Object.values(state.units)) {
    if (enemy.side === unit.side || enemy.hidden) continue;
    if (!hasLOS(state, enemy.hexId, hexId)) continue;
    if (isVehicle) return true;
    if (distance(parseHexId(hexId), parseHexId(enemy.hexId)) <= 2) return true;
  }
  return false;
}

/** §11.1 bullet 2: must `unit` reveal because it shares its Hex with any non-Hidden Unit? */
export function mustRevealForSharedHex(state: GameState, unit: Unit): boolean {
  return Object.values(state.units).some((other) => other.id !== unit.id && other.hexId === unit.hexId && !other.hidden);
}

/**
 * The combined §11.1 bullet 2/3/4 check — called once per Hidden Unit by
 * `reducer.ts`'s post-action sweep (`finish()`) after every successful
 * Action, so a change made by ANY Unit (an enemy stepping into LOS, a
 * friendly landing on this Hex) is caught, not just the acting Unit's own.
 * Bullets 1 (took a revealing Action) and 5 (Recon by Fire) are handled
 * directly by `reduce()`/`doReconByFire`, not here.
 */
export function mustReveal(state: GameState, unit: Unit): boolean {
  return mustRevealForSharedHex(state, unit) || mustRevealAtHex(state, unit, unit.hexId);
}

/**
 * §11.7: Reveal Number for an Attack against `hexId` — 6 + Terrain DR
 * Modifier (§6.4), before any CAP adjustment (the reducer applies
 * `clampCapMod` separately, mirroring `fortifications.ts`'s `rollStructureDestroy`).
 */
export function revealNumber(state: GameState, hexId: HexId): number {
  return 6 + terrainDM(state, hexId);
}

/**
 * §11.3: Hidden Move's flat 5AP base, plus any Hit-Marker move-cost delta
 * the Unit is currently carrying (isolated by diffing `effectiveStats` against
 * the template's own `move`) — Stress is folded in later by the reducer's
 * existing `planCost`, same as every other Action. Terrain penalties are
 * explicitly ignored per §11.3, so no terrain lookup happens here at all.
 */
export function hiddenMoveBase(state: GameState, unit: Unit): number {
  const delta = effectiveStats(state, unit).move - templateOf(state, unit).move;
  return 5 + delta;
}

/**
 * §11.4: legal destinations for becoming Hidden — the Unit's own Hex, or any
 * existing, genuinely enterable neighbor Hex — filtered to those out of all
 * non-Hidden enemy LOS. "Ignores Terrain Move Penalties" (§11.3) means the AP
 * *cost* is waived, not that fundamentally impassable terrain (e.g. deep
 * Water for a non-swimmer) becomes enterable — so neighbor candidates are
 * additionally checked via `moveCost`/`planVehicleMove` purely as a
 * passability signal (their AP numbers are irrelevant here). The current Hex
 * needs no such check — the Unit is already legally there.
 * (Whether the CURRENT Hex needs its own LOS check before even considering
 * neighbors is genuinely ambiguous in the rulebook text; treating "stay in
 * place" as just one candidate destination, filtered the same way as any
 * other, is simpler and matches the one worked example, which only ever
 * exercises that case.)
 */
export function becomingHiddenCandidates(state: GameState, unit: Unit): HexId[] {
  const isVehicle = templateOf(state, unit).kind === 'vehicle';
  const passable = (hexId: HexId): boolean =>
    isVehicle ? planVehicleMove(state, unit, [hexId]).ap != null : moveCost(state, unit, hexId).ap != null;
  const candidates = [
    unit.hexId,
    ...neighbors(parseHexId(unit.hexId))
      .map(idOf)
      .filter((hexId) => state.hexes[hexId] && passable(hexId)),
  ];
  return candidates.filter((hexId) => isOutOfAllEnemyLOS(state, hexId, unit.side));
}

export interface RevealRoll {
  hitNumber: number;
  dice: [number, number];
  total: number;
  hit: boolean;
  rng: RngState;
}

/**
 * §11.7: roll to reveal a suspected Hidden Unit at `hexId`. Mirrors
 * `fortifications.ts`'s `rollStructureDestroy`/`obstacles.ts`'s
 * `rollMinesAttack` shape exactly — owns its own `roll2d6`/RNG advance,
 * never self-assigned (the caller commits `rng` into real state).
 */
export function rollReveal(state: GameState, hexId: HexId, capMod = 0): RevealRoll {
  const hitNumber = revealNumber(state, hexId) - clampCapMod(capMod);
  const { value, dice, rng } = roll2d6(state.rng);
  return { hitNumber, dice, total: value, hit: value >= hitNumber, rng };
}

/**
 * §11.2/§11.7: which of the 6 facings, from `fromId`, points most directly
 * toward `toId`? Used only for Recon by Fire's synchronous reveal, where the
 * worked example has the owner face the revealed Unit "towards" its
 * attacker — a reasonable stand-in for genuine free-form player choice
 * within one synchronous Action, and geometrically correct at any distance
 * (unlike `movement.ts`'s `directionTo`, which only resolves adjacent hexes).
 */
export function facingToward(fromId: HexId, toId: HexId): Facing {
  const from = axialToPixel(parseHexId(fromId));
  const to = axialToPixel(parseHexId(toId));
  const rel = { x: to.x - from.x, y: to.y - from.y };
  let best: Facing = 0;
  let bestDot = -Infinity;
  for (let d = 0; d < 6; d++) {
    const v = axialToPixel(AXIAL_DIRECTIONS[d]!);
    const dot = v.x * rel.x + v.y * rel.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = d as Facing;
    }
  }
  return best;
}
