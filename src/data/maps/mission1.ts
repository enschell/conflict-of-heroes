/**
 * Map 1 — the board for Mission 1 ("Partisans"). Re-authored onto the new
 * flat-top board substrate (docs/hex_board_spec/README.md, CLAUDE.md §B)
 * directly with the user, hex by hex, via the JSON terrain-authoring format
 * (see data/hexBoardMap.ts's applyTerrainJson/TERRAIN_CODES). Single board
 * (board 1), nominal orientation — a locked decision, not a placeholder.
 *
 * TERRAIN_JSON is the live source of truth as terrain is authored; hexes not
 * yet mentioned default to Open (generateOpenBoard's base fill).
 */
import { applyTerrainJson, labelLookup, type TerrainJson } from '../hexBoardMap';
import type { BoardPlacement } from '../../engine/hexBoard';
import type { MapHexDef } from '../../engine/types';

export const MISSION1_BOARDS: BoardPlacement[] = [{ gx: 0, gy: 0, n: 1 }];

const TERRAIN_JSON: TerrainJson = {
  '1': {
    I05: 'road',
    I06: 'road',
    H07: 'road',
    N01: 'heavy_woods',
    J01: 'road',
    K01: 'road',
    L01: 'road',
    M01: 'road',
    N02: 'road',
    O02: 'road',
    O03: 'road',
    P04: 'road',
    Q04: 'road',
    Q05: 'road',
    Q06: 'road',
    R07: 'road',
    S06: 'road',
    L02: 'light_woods',
    N03: 'light_woods',
    M02: 'road',
    M03: 'road',
    L04: 'heavy_woods',
    K04: 'road',
    J05: 'road',
    L03: 'heavy_woods',
    K03: 'heavy_woods',
    K02: 'light_woods',
    M04: 'heavy_woods',
    L05: 'heavy_woods',
    K05: 'light_woods',
    J06: 'light_woods',
    H08: 'road',
    G08: 'road',
    F10: 'road',
    F09: 'light_woods',
    F07: 'heavy_woods',
    E07: 'heavy_woods',
    E09: 'light_woods',
    K07: 'light_woods',
    L08: 'heavy_woods',
    M07: 'heavy_woods',
    N08: 'heavy_woods',
    M08: 'heavy_woods',
    P08: 'light_woods',
    Q07: 'light_woods',
    Q10: 'light_woods',
    P06: 'light_woods',
    P05: 'light_woods',
    Q03: 'light_woods',
    P03: 'light_woods',
    Q02: 'light_woods',
    E01: 'heavy_woods',
    D02: 'light_woods',
    C04: 'light_woods',
    G06: 'heavy_woods',
    F06: 'road',
    E05: 'road',
    D05: 'road',
    C05: 'road',
    B06: 'road',
    A06: 'road',
    B04: 'light_woods',
    B05: 'light_woods',
    E06: 'light_woods',
    H06: 'road',
    G05: 'road',
    O07: 'light_woods',
    I10: 'light_woods',
    E10: 'light_woods',
    G09: 'road',
    C09: 'light_woods',
    G07: 'heavy_woods',
    N07: 'heavy_woods',
    N09: 'light_woods',
    N10: 'light_woods',
    G10: 'road',
    H11: 'road',
    I11: 'road',
    J12: 'road',
  },
};

export const MISSION1_MAP: MapHexDef[] = applyTerrainJson(MISSION1_BOARDS, TERRAIN_JSON);

const LOOKUP = labelLookup(MISSION1_BOARDS);

/** Mission 1 hex label (board 1, e.g. "I06") -> engine hex id ("q,r"). */
export function hexIdForLabel(label: string): string {
  const id = LOOKUP.get(`1-${label}`);
  if (!id) throw new Error(`Mission 1: unknown hex label "${label}"`);
  return id;
}
