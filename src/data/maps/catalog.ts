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
import type { MapHexDef } from '../../engine/types';

/** A single blank open board, same real dimensions as `MISSION1_MAP`. */
export const BLANK_SINGLE_BOARD: MapHexDef[] = generateOpenBoard([{ gx: 0, gy: 0, n: 1 }]);

export interface MapCatalogEntry {
  id: string;
  name: string;
  hexes: MapHexDef[];
}

export const MAP_CATALOG: Record<string, MapCatalogEntry> = {
  mission1: { id: 'mission1', name: 'Map 1 (Mission 1 — Partisans)', hexes: MISSION1_MAP },
  'blank-single': { id: 'blank-single', name: 'Blank Board', hexes: BLANK_SINGLE_BOARD },
};

export function mapById(id: string): MapCatalogEntry | undefined {
  return MAP_CATALOG[id];
}
