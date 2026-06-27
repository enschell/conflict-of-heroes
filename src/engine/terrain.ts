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

/** Does the hex block line of sight through it? Smoke is a later module. */
export function blocksLOS(state: GameState, id: HexId): boolean {
  const hex = state.hexes[id];
  if (!hex) return false;
  return terrainOf(hex).blocksLOS;
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
