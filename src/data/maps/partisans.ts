/**
 * "Partisans" — an ORIGINAL map for Firefight 1 (9 columns × 7 rows, axial).
 *
 * Not a reproduction of Academy Games' board: a small Russian hamlet on the
 * east edge (stone/wood buildings), woods to the north-west, a west→east farm
 * road, and two objectives — the central strongpoint (6,3, walled to the west)
 * and the road crossroads (3,3). Germans push in from the west; partisans hold
 * the village.
 *
 * Layout is built procedurally (all 'open') then patched by the tables below,
 * so the terrain is easy to read and edit.
 */
import type { MapHexDef, TerrainId } from '../../engine/types';

const COLS = 9; // q: 0..8
const ROWS = 7; // r: 0..6

/** Non-open terrain, keyed by "q,r". */
const TERRAIN: Record<string, TerrainId> = {
  // North-west woods
  '1,1': 'woodsHeavy',
  '2,1': 'woodsHeavy',
  '2,2': 'woodsHeavy',
  '3,1': 'woodsLight',
  '2,4': 'woodsLight',
  '3,4': 'woodsLight',
  '3,5': 'woodsLight',
  '7,1': 'woodsLight',
  '7,5': 'woodsLight',
  // The hamlet (east-centre)
  '5,2': 'buildingWood',
  '6,2': 'buildingStone',
  '5,3': 'buildingStone',
  '6,3': 'buildingStone', // central strongpoint (objective)
  '7,3': 'buildingWood',
  '6,4': 'buildingWood',
};

/** Hexes that are part of the west→east farm road. */
const ROADS = new Set(['0,3', '1,3', '2,3', '3,3', '4,3']);

/** Wall segments by hex → edge directions (0=E,1=NE,2=NW,3=W,4=SW,5=SE). */
const WALLS: Record<string, number[]> = {
  '6,3': [3], // wall on the west face of the strongpoint
};

export const PARTISANS_MAP: MapHexDef[] = (() => {
  const hexes: MapHexDef[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let q = 0; q < COLS; q++) {
      const id = `${q},${r}`;
      const def: MapHexDef = { id, terrain: TERRAIN[id] ?? 'open' };
      if (ROADS.has(id)) def.road = true;
      if (WALLS[id]) def.walls = WALLS[id];
      hexes.push(def);
    }
  }
  return hexes;
})();

export const PARTISANS_MAP_SIZE = { cols: COLS, rows: ROWS };
