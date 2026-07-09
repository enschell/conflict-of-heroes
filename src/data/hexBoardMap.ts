/**
 * Bridges engine/hexBoard.ts's pure column/row generator to authored map
 * data: a full board's worth of `MapHexDef`s, defaulting to open terrain,
 * ready for a mission to override individual hexes (terrain/walls/road/...).
 */
import { generateBoardHexes, type BoardPlacement } from '../engine/hexBoard';
import type { MapHexDef, TerrainId } from '../engine/types';

/** All hexes for the given board layout, terrain defaulted to 'open'. */
export function generateOpenBoard(boards: BoardPlacement[]): MapHexDef[] {
  return generateBoardHexes(boards).map((h) => ({
    id: h.id,
    terrain: 'open',
    label: h.label ?? undefined,
    boardNumber: h.boardNumber ?? undefined,
    mapNumber: h.cell.board,
    edgeCut: h.edgeCut,
  }));
}

/**
 * `{ boardNumber: { label: code } }` terrain-authoring JSON -> `MapHexDef[]`
 * overrides on an open board. A hex's terrain and its Road (§5.0.1: negates
 * the terrain's Difficult-Terrain AP cost when moving road-to-road, but
 * defense still reads the underlying terrain — already how movement.ts/
 * combat.ts work, no engine change needed) are independent, so codes compose:
 * `<terrain>` alone, or `<terrain>_road` for the same terrain with a Road
 * through it. `road` alone means Open+Road (mirrors the original Mission 1
 * data's convention). Hexes not mentioned stay plain Open.
 */
export const TERRAIN_CODES: Record<string, { terrain: TerrainId; road?: boolean }> = {
  open: { terrain: 'open' },
  road: { terrain: 'open', road: true },
  light_woods: { terrain: 'woodsLight' },
  light_woods_road: { terrain: 'woodsLight', road: true },
  heavy_woods: { terrain: 'woodsHeavy' },
  heavy_woods_road: { terrain: 'woodsHeavy', road: true },
  wood_building: { terrain: 'buildingWood' },
  wood_building_road: { terrain: 'buildingWood', road: true },
  stone_building: { terrain: 'buildingStone' },
  stone_building_road: { terrain: 'buildingStone', road: true },
  plowed: { terrain: 'plowed' },
  water: { terrain: 'water' },
};

/** hexLabel -> hexId lookup for one board, built from the same generator the map itself uses. */
export function labelLookup(boards: BoardPlacement[]): Map<string, string> {
  const byBoardLabel = new Map<string, string>();
  for (const h of generateBoardHexes(boards)) {
    if (h.label != null) byBoardLabel.set(`${h.cell.board}-${h.label}`, h.id);
  }
  return byBoardLabel;
}

export type TerrainJson = Record<string, Record<string, string>>; // { "1": { "I06": "road", ... } }

/** Apply a terrain-authoring JSON (see TERRAIN_CODES) on top of an open board. */
export function applyTerrainJson(boards: BoardPlacement[], terrainByBoard: TerrainJson): MapHexDef[] {
  const base = generateOpenBoard(boards);
  const byBoardLabel = labelLookup(boards);
  const overridesById = new Map<string, { terrain: TerrainId; road?: boolean }>();
  for (const [boardNum, labels] of Object.entries(terrainByBoard)) {
    for (const [label, code] of Object.entries(labels)) {
      const def = TERRAIN_CODES[code];
      if (!def) throw new Error(`Unknown terrain code "${code}" at board ${boardNum} hex ${label}`);
      const id = byBoardLabel.get(`${boardNum}-${label}`);
      if (!id) throw new Error(`Unknown hex label "${label}" on board ${boardNum}`);
      overridesById.set(id, def);
    }
  }
  return base.map((h) => {
    const o = overridesById.get(h.id);
    if (!o) return h;
    return { ...h, terrain: o.terrain, ...(o.road ? { road: true } : {}) };
  });
}
