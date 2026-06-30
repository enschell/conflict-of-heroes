/**
 * Hits, hit markers and effective stats (rulebook §7.4, §7.5).
 *
 * A unit holds at most one hit marker; a second hit destroys it. Effective
 * stats = template stats modified by the current hit marker.
 */
import { HIT_MARKERS } from '../data/hitMarkers';
import { randInt } from './rng';
import type {
  DRColor,
  GameState,
  HitPile,
  HitType,
  RngState,
  Unit,
  UnitTemplate,
} from './types';

export interface EffectiveStats {
  fp: { red: number; blue: number };
  dr: { front: number; flank: number; color: DRColor };
  move: number;
  range: number;
  apToFire: number;
  canMove: boolean;
  canPivot: boolean;
  canFire: boolean;
  /** Stunned: the unit may take no action other than rally. */
  onlyRally: boolean;
}

export function templateOf(state: GameState, unit: Unit): UnitTemplate {
  const t = state.templates[unit.templateId];
  if (!t) throw new Error(`Unknown template: ${unit.templateId}`);
  return t;
}

/** Template stats modified by the unit's current hit marker (if any). */
export function effectiveStats(state: GameState, unit: Unit): EffectiveStats {
  const t = templateOf(state, unit);
  const eff: EffectiveStats = {
    fp: { red: t.fp.red, blue: t.fp.blue },
    dr: { front: t.dr.front, flank: t.dr.flank, color: t.dr.color },
    move: t.move,
    range: t.range,
    apToFire: t.apToFire,
    canMove: true,
    canPivot: true,
    canFire: true,
    onlyRally: false,
  };

  for (const hitType of unit.hitMarkers) {
    const def = HIT_MARKERS[hitType];
    eff.fp.red += def.fpRedDelta ?? 0;
    eff.fp.blue += def.fpBlueDelta ?? 0;
    eff.dr.front += def.frontDrDelta ?? 0;
    eff.dr.flank += def.flankDrDelta ?? 0;
    eff.move += def.moveCostDelta ?? 0;
    eff.apToFire += def.apToFireDelta ?? 0;
    if (def.rangeOverride !== undefined) eff.range = def.rangeOverride;
    if (def.cannotMove) eff.canMove = false;
    if (def.cannotPivot) eff.canPivot = false;
    if (def.cannotFire) eff.canFire = false;
    if (def.onlyRally) {
      eff.onlyRally = true;
      eff.canMove = false;
      eff.canPivot = false;
      eff.canFire = false;
    }
  }
  return eff;
}

/** Total markers remaining in a pile. */
function pileTotal(pile: HitPile): number {
  return Object.values(pile).reduce((a, b) => a + b, 0);
}

/** Draw a random hit marker from a pile (weighted by counts). */
export function drawHit(
  rng: RngState,
  pile: HitPile,
): { type: HitType; pile: HitPile; rng: RngState } {
  const total = pileTotal(pile);
  const { value, rng: next } = randInt(rng, 1, Math.max(total, 1));
  let acc = 0;
  const entries = Object.entries(pile) as [HitType, number][];
  for (const [type, count] of entries) {
    acc += count;
    if (value <= acc && count > 0) {
      return { type, pile: { ...pile, [type]: count - 1 }, rng: next };
    }
  }
  // Pile empty fallback — should not occur in normal play.
  return { type: 'unnerved', pile, rng: next };
}

/** Return a unit's hit marker(s) back to the foot pile. */
export function returnHitToPile(pile: HitPile, type: HitType): HitPile {
  return { ...pile, [type]: pile[type] + 1 };
}
