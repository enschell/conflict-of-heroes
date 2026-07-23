/**
 * Smoke (rulebook §14.0–§14.4): Heavy/Light Smoke Markers on hexes — the DR/AR
 * combat modifiers, the LOS-path DR bonus, the Rally bonus, and Pre-Round
 * dissipation. LOS blocking itself lives in `los.ts` (hasLOS already denies a
 * shot through Heavy Smoke or 2+ Light Smoke hexes); this module only computes
 * the *bonuses* combat.ts needs once a shot is otherwise legal.
 */
import { idOf, lineDraw, parseHexId, LOS_EPS_NEG, LOS_EPS_POS } from './hex';
import { smokeLevel } from './terrain';
import type { GameState, HexId } from './types';

/** DR bonus for defending while standing in Smoke on your own hex (§14.3–§14.4). */
export function smokeDefenseBonus(state: GameState, hexId: HexId): number {
  const level = smokeLevel(state, hexId);
  return level === 2 ? 2 : level === 1 ? 1 : 0;
}

/** AR penalty for attacking OUT of Smoke you're standing in (§14.3–§14.4). */
export function smokeAttackPenalty(state: GameState, hexId: HexId): number {
  const level = smokeLevel(state, hexId);
  return level === 2 ? -2 : level === 1 ? -1 : 0;
}

/**
 * +1DR if the shot's LOS passes through exactly one Light Smoke hex (§14.4).
 * Only meaningful once `hasLOS` has already confirmed the shot is legal — a
 * path with Heavy Smoke or 2+ Light Smoke hexes would already be blocked, so
 * this can only ever find 0 or 1 (mirrors `hasLOS`'s own edge-tie handling).
 */
export function smokeLosDrBonus(state: GameState, fromId: HexId, toId: HexId): number {
  if (fromId === toId) return 0;
  const a = parseHexId(fromId);
  const b = parseHexId(toId);
  const lineP = lineDraw(a, b, LOS_EPS_POS);
  const lineM = lineDraw(a, b, LOS_EPS_NEG);
  let lightSmokeHexes = 0;
  for (let i = 1; i < lineP.length - 1; i++) {
    const hp = idOf(lineP[i]!);
    const hm = idOf(lineM[i]!);
    const lvl = hp === hm ? smokeLevel(state, hp) : Math.min(smokeLevel(state, hp), smokeLevel(state, hm));
    if (lvl === 1) lightSmokeHexes++;
  }
  return lightSmokeHexes >= 1 ? 1 : 0;
}

/** Rally bonus for being in Smoke, Heavy or Light alike (§7.8/§14.3). */
export function smokeRallyBonus(state: GameState, hexId: HexId): number {
  return smokeLevel(state, hexId) > 0 ? 1 : 0;
}

/** Pre-Round dissipation (§14.4): Heavy Smoke flips to Light; existing Light is removed. */
export function dissipateSmoke(state: GameState): void {
  for (const hex of Object.values(state.hexes)) {
    if (hex.features.smoke === 2) hex.features.smoke = 1;
    else if (hex.features.smoke === 1) delete hex.features.smoke;
  }
}
