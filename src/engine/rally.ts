/**
 * Rallying hit markers off a unit (rulebook §7.6).
 * Cost 5 AP. Roll 2D6 ≥ the marker's rally number, with +1 for cover terrain
 * and +1 per friendly un-hit unit stacked in the same hex.
 */
import { HIT_MARKERS } from '../data/hitMarkers';
import { roll2d6 } from './rng';
import { smokeRallyBonus } from './smoke';
import { isCover } from './terrain';
import type { GameState, RngState, Unit } from './types';

export const RALLY_AP_COST = 5;

export function rallyModifier(state: GameState, unit: Unit): number {
  let mod = 0;
  if (isCover(state, unit.hexId)) mod += 1;
  mod += smokeRallyBonus(state, unit.hexId); // §7.8/§14.3
  for (const u of Object.values(state.units)) {
    if (u.id !== unit.id && u.side === unit.side && u.hexId === unit.hexId && u.hitMarkers.length === 0) {
      mod += 1;
    }
  }
  return mod;
}

export interface RallyRoll {
  legal: boolean;
  reason?: string;
  target: number;
  roll: number;
  dice: [number, number];
  total: number;
  success: boolean;
  rng: RngState;
}

export function rollRally(state: GameState, unit: Unit, capMod = 0): RallyRoll {
  const base = {
    target: 0,
    roll: 0,
    dice: [0, 0] as [number, number],
    total: 0,
    success: false,
    rng: state.rng,
  };
  if (unit.hitMarkers.length === 0) return { legal: false, reason: 'no hit marker', ...base };

  const enemyHere = Object.values(state.units).some(
    (u) => u.side !== unit.side && u.hexId === unit.hexId,
  );
  if (enemyHere) return { legal: false, reason: 'enemy unit in hex', ...base };

  const def = HIT_MARKERS[unit.hitMarkers[0]!];
  if (def.rally <= 0) return { legal: false, reason: 'cannot rally', ...base };

  const { value, dice, rng } = roll2d6(state.rng);
  const total = value + rallyModifier(state, unit) + capMod;
  return {
    legal: true,
    target: def.rally,
    roll: value,
    dice,
    total,
    success: total >= def.rally,
    rng,
  };
}
