/**
 * Public engine API. The UI and store import from here, never from internal
 * modules directly.
 */
export * from './types';

export { reduce } from './reducer';
export { initGame, serialize, deserialize } from './state';
export {
  legalActions,
  legalActionsForUnit,
  legalActionsForReinforcement,
  modifiedActionCost,
} from './actions';
export { groupConnected, groupStress, isValidSupporter } from './groups';
export { legalEntryHexes } from './reinforcements';

// Selected pure helpers useful to the UI (e.g. previews, LOS overlay):
export {
  attackContext,
  rollAttack,
  closeCombatContext,
  rollCloseCombat,
  enemiesInHex,
  rollStackFire,
} from './combat';
export type { Modifier, AttackRoll } from './combat';
export type { IndirectAttackRoll } from './mortar';
export { rollRally } from './rally';
export { effectiveStats, templateOf, resolveHit } from './hits';
export type { HitOutcome, ResolvedHit } from './hits';
export { hasLOS, inArc, canSightTarget, visibleHexesFrom } from './los';
export { moveCost, directionTo, pivotCost, planVehicleMove } from './movement';
export { rangeBand, fpRangeModifier } from './range';
export { rallyModifier, RALLY_AP_COST } from './rally';
export {
  bestSpotterFor,
  directFireZone,
  indirectFireZone,
  isValidSpotterHex,
  rollIndirectFire,
} from './mortar';
export { smokeAttackPenalty, smokeDefenseBonus, smokeLosDrBonus, smokeRallyBonus } from './smoke';
export { finalScores, computeWinner, otherSide, vpLeader, vpMargin, gainVp } from './victory';
export {
  AXIAL_DIRECTIONS,
  distance,
  neighbors,
  neighbor,
  idOf,
  hexId,
  parseHexId,
  axialToPixel,
  isInFrontArc,
} from './hex';
