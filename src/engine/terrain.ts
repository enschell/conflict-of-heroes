/**
 * Terrain helpers — thin accessors over the authored TERRAIN table.
 */
import { TERRAIN } from '../data/terrainTypes';
import type { GameState, Hex, HexId, TerrainDef } from './types';

export function terrainOf(hex: Hex): TerrainDef {
  return TERRAIN[hex.terrain];
}

export function hexById(state: GameState, id: HexId): Hex | undefined {
  return state.hexes[id];
}

/** Does the hex's terrain alone block line of sight through it (§14 Smoke is separate — see los.ts)? */
export function blocksLOS(state: GameState, id: HexId): boolean {
  const hex = state.hexes[id];
  if (!hex) return false;
  return terrainOf(hex).blocksLOS;
}

/** Smoke level on a hex (§14): 0 none, 1 Light, 2 Heavy. */
export function smokeLevel(state: GameState, id: HexId): 0 | 1 | 2 {
  return state.hexes[id]?.features.smoke ?? 0;
}

/** Is the hex cover terrain (rally +1, hidden, etc.)? */
export function isCover(state: GameState, id: HexId): boolean {
  const hex = state.hexes[id];
  if (!hex) return false;
  return terrainOf(hex).isCover;
}

/** Defensive modifier contributed by the hex's terrain. */
export function terrainDM(state: GameState, id: HexId): number {
  const hex = state.hexes[id];
  if (!hex) return 0;
  return terrainOf(hex).dm;
}
