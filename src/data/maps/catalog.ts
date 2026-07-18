/**
 * Map catalog: id -> MapHexDef[], for anything that needs to pick a map by a
 * stable string id rather than importing a map module directly — currently
 * only the Mission Editor's "choose an existing map" picker. Every entry is
 * the same real 19-column(18 hex-wide)/12-row single-board size
 * (`engine/hexBoard.ts`'s `BOARD_COLS`/`BOARD_ROWS`) as Mission 1's own map —
 * there's no "board size" to configure, `generateOpenBoard` already produces
 * exactly that.
 */
import { generateOpenBoard } from '../hexBoardMap';
import { MISSION1_MAP } from './mission1';
import { MAP_7_MAP } from './map-7';
import { ATB_MAP_1_MAP } from './atb-map-1';
import { ATB_MAP_1_OVERLAY } from './atb-map-1';
import { MAP_1_MISSION_1_PARTISANS_MAP } from './map-1-mission-1-partisans';
import { MAP_8_MAP, MAP_8_OVERLAY } from './map-8';
import { MAP_1_MISSION_1_PARTISANS_OVERLAY } from './map-1-mission-1-partisans';
import type { MapHexDef } from '../../engine/types';


/** A single blank open board, same real dimensions as `MISSION1_MAP`. */
export const BLANK_SINGLE_BOARD: MapHexDef[] = generateOpenBoard([{ gx: 0, gy: 0, n: 1 }]);

export interface MapCatalogEntry {
  id: string;
  name: string;
  hexes: MapHexDef[];
  /**
   * "Overlay mode" (Map Editor, CLAUDE.md §D): a single hand-painted/traced
   * image, stretched across this board and clipped to its hex silhouette,
   * used as the REAL gameplay art in place of per-hex terrain tiles — the
   * terrain each hex mechanically has (movement/LOS/DR) is unaffected and
   * still comes from `hexes` above. Set only when the map was authored with
   * a reference overlay in the Map Editor.
   */
  overlayImage?: string;
}

export const MAP_CATALOG: Record<string, MapCatalogEntry> = {
  mission1: { id: 'mission1', name: 'Map 1 (Mission 1 — Partisans)', hexes: MISSION1_MAP },
  'blank-single': { id: 'blank-single', name: 'Blank Board', hexes: BLANK_SINGLE_BOARD },
  'map-7': { id: 'map-7', name: "Map 7", hexes: MAP_7_MAP },
  'atb-map-1': { id: 'atb-map-1', name: "AtB Map 1", hexes: ATB_MAP_1_MAP, overlayImage: ATB_MAP_1_OVERLAY },
  'map-1-mission-1-partisans': { id: 'map-1-mission-1-partisans', name: "Map 1 (Mission 1 — Partisans)", hexes: MAP_1_MISSION_1_PARTISANS_MAP, overlayImage: MAP_1_MISSION_1_PARTISANS_OVERLAY },
  'map-8': { id: 'map-8', name: "Map 8", hexes: MAP_8_MAP, overlayImage: MAP_8_OVERLAY },
};

export function mapById(id: string): MapCatalogEntry | undefined {
  return MAP_CATALOG[id];
}
