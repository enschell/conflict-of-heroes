/**
 * Public engine API. The UI and store import from here, never from internal
 * modules directly.
 */
export * from './types';

export { reduce } from './reducer';
export { initGame, serialize, deserialize } from './state';
export { legalActions, legalActionsForUnit } from './actions';

// Selected pure helpers useful to the UI (e.g. previews, LOS overlay):
export {
  attackContext,
  rollAttack,
  closeCombatContext,
  rollCloseCombat,
  enemiesInHex,
  rollStackFire,
} from './combat';
export { rollRally } from './rally';
export { effectiveStats, templateOf } from './hits';
export { hasLOS, inArc, canSightTarget, visibleHexesFrom } from './los';
export { moveCost, directionTo, pivotCost } from './movement';
export { rangeBand, fpRangeModifier } from './range';
export { rallyModifier, RALLY_AP_COST } from './rally';
export { finalScores, computeWinner, otherSide } from './victory';
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
