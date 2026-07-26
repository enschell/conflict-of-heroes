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
  /**
   * True when `range` came from a hit marker's `rangeOverride` (Cowering/
   * Berserk, §7.7) rather than the Unit's own template stat — a hard cap,
   * not just a lower baseline. `rangeBand()` must not extend a capped range
   * to 2x for a "long range" shot the way it does for a normal Range stat
   * (a Cowering crew too rattled to aim past point-blank isn't now ALSO
   * newly capable of a longer-ranged shot than it could take a moment
   * earlier — the marker's own text is "Range: Drops to 1," a ceiling, not
   * a new baseline). A real bug, since fixed: before this flag existed,
   * `rangeBand` always doubled whatever `range` it was given, so a Cowering
   * Unit with Range overridden to 1 could still take a "long range" shot at
   * distance 2 (at the normal -2AR penalty) — caught live when a Cowering
   * 45mm AT Gun fired on a Panzer 38(t) 2 Hexes away.
   */
  rangeCapped: boolean;
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
    rangeCapped: false,
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
    if (def.rangeOverride !== undefined) {
      eff.range = def.rangeOverride;
      eff.rangeCapped = true;
    }
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

/**
 * What a Hit does to `target` (§7.4/§7.5): destroyed outright (critical, or it
 * already carried a marker), destroyed by drawing a "killOnDraw" marker (e.g.
 * Destroyed/aDestroyed itself), or marked with the drawn Hit Marker. Pure — the
 * caller applies the pile/RNG/log side effects. Shared by the reducer (which
 * commits it) and the dice-roller UI (which previews it before committing,
 * from the exact same deterministic RNG state, so the two can never disagree).
 */
export type HitOutcome =
  | { kind: 'destroyed-immediate' }
  | { kind: 'destroyed-drawn'; hitType: HitType }
  | { kind: 'marked'; hitType: HitType };

export interface ResolvedHit {
  rng: RngState;
  /** The pile after the draw (only set when a draw actually happened). */
  pile?: HitPile;
  armored: boolean;
  outcome: HitOutcome;
}

export function resolveHit(
  state: GameState,
  target: Unit,
  critical: boolean,
  fpColor: DRColor,
  rng: RngState,
): ResolvedHit {
  const armored = fpColor === 'blue';
  if (critical || target.hitMarkers.length > 0) {
    return { rng, armored, outcome: { kind: 'destroyed-immediate' } };
  }
  const pile0 = armored ? state.hitPiles.vehicle : state.hitPiles.foot;
  const draw = drawHit(rng, pile0);
  const def = HIT_MARKERS[draw.type];
  return {
    rng: draw.rng,
    pile: draw.pile,
    armored,
    outcome: def.killOnDraw
      ? { kind: 'destroyed-drawn', hitType: draw.type }
      : { kind: 'marked', hitType: draw.type },
  };
}
