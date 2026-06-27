/** Board palette — our own scheme (no Academy Games artwork). */
import type { TerrainId } from '../engine/types';

export const TERRAIN_FILL: Record<TerrainId, string> = {
  open: '#3f4a33',
  road: '#7a6745',
  plowed: '#574733',
  water: '#2c4a64',
  woodsLight: '#3a5530',
  woodsHeavy: '#23381d',
  buildingWood: '#7c6a4d',
  buildingStone: '#6a6b74',
};

export const HEX_STROKE = '#11150f';
export const ROAD_STROKE = '#9c8456';
export const WALL_STROKE = '#cbb994';

/** Side accent colors (forces). Unit fills come from the nation registry. */
export const SIDE_COLOR: Record<'A' | 'B', string> = {
  A: '#7d8794',
  B: '#c45b5b',
};
