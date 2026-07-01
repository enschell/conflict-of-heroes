/**
 * Group Actions (rulebook v3 §10). A Group takes ONE Action with a single
 * Spent Check for the whole Group, and Stresses every participant (§10.10).
 *
 * This module holds the pure group helpers (connectivity, group cost pieces);
 * the reducer wires them into the act → one Spent Check → Stress-all flow.
 */
import { HIT_MARKERS } from '../data/hitMarkers';
import { distance, parseHexId } from './hex';
import { effectiveStats, templateOf } from './hits';
import { hasLOS, inArc } from './los';
import { rangeBand } from './range';
import type { GameState, Unit, UnitId } from './types';

/**
 * Do the given Units occupy one continuously-adjacent cluster (§10.2)? Members
 * must *begin* in the same or adjacent hexes (they may separate while moving,
 * §10.3). Two members connect if they share a hex or are neighbours.
 */
export function groupConnected(state: GameState, unitIds: UnitId[]): boolean {
  if (unitIds.length === 0) return false;
  const hexes: string[] = [];
  for (const id of unitIds) {
    const u = state.units[id];
    if (!u) return false;
    hexes.push(u.hexId);
  }
  if (hexes.length === 1) return true;
  // Flood-fill from member 0 over the "same or adjacent hex" relation.
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (let j = 0; j < hexes.length; j++) {
      if (seen.has(j)) continue;
      if (distance(parseHexId(hexes[i]!), parseHexId(hexes[j]!)) <= 1) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === hexes.length;
}

/** Group Stress penalty (§10.11): +1AP if ANY member acted on the previous Turn. */
export function groupStress(units: Unit[]): number {
  return units.some((u) => u.stressed) ? 1 : 0;
}

/** Does any of the Unit's hit markers modify its Firepower (disqualifies support)? */
function hasFirepowerHitMarker(unit: Unit): boolean {
  return unit.hitMarkers.some((t) => {
    const d = HIT_MARKERS[t];
    return (d.fpRedDelta ?? 0) !== 0 || (d.fpBlueDelta ?? 0) !== 0;
  });
}

/**
 * May `supporter` add a +1AR Group Support Bonus for `leader` attacking `target`
 * (§10.6)? Must meet ALL: in the Leader's hex or one of its 6 adjacent hexes; the
 * Target Hex is in the supporter's Fire Zone (arc + LOS) and within Normal Range
 * (not Long); and it has no Hit Marker affecting Firepower. If the Leader is in
 * Close Combat (shares the Target's hex), only same-hex Units may support.
 */
export function isValidSupporter(
  state: GameState,
  leader: Unit,
  supporter: Unit,
  target: Unit,
): boolean {
  if (supporter.id === leader.id || supporter.side !== leader.side) return false;
  if (hasFirepowerHitMarker(supporter)) return false;
  const eff = effectiveStats(state, supporter);
  if (!eff.canFire) return false;
  // §16.1: a Group Attack is always ranged fire, so Wagons/Trucks can't support it either.
  const supMode = templateOf(state, supporter).attackMode;
  if (supMode === 'none' || supMode === 'closeCombatOnly') return false;

  // Close-combat support: only Units sharing the Leader's (= Target's) hex.
  if (target.hexId === leader.hexId) return supporter.hexId === leader.hexId;

  // Ranged support: adjacency to the Leader, then the supporter's own Fire Zone.
  if (distance(parseHexId(leader.hexId), parseHexId(supporter.hexId)) > 1) return false;
  if (!inArc(supporter.hexId, supporter.facing, target.hexId)) return false;
  if (!hasLOS(state, supporter.hexId, target.hexId)) return false;
  const band = rangeBand(
    distance(parseHexId(supporter.hexId), parseHexId(target.hexId)),
    eff.range,
  );
  return band === 'short' || band === 'normal';
}
