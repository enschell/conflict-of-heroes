/**
 * Map Editor authoring state — a terrain-authoring tool for building a new
 * `MapHexDef[]` board (assigned a Map # and terrain, hex-by-hex), separate
 * from both `state/store.ts` (the live `GameState`-driven store) and
 * `state/editorStore.ts` (the Mission Editor, which only PICKS an existing
 * map by id and paints obstacles/fortifications on top of it — terrain
 * itself was explicitly out of that tool's scope, see its own README).
 *
 * Unlike the Mission Editor's `EditorMapState` (which references catalog
 * maps by id + rotation/attachment), this store holds the raw, directly
 * paintable `MapHexDef[]` for the ONE map currently being authored — a
 * single un-rotated board (`gx:0,gy:0`), matching `data/maps/catalog.ts`'s
 * own observation that every catalog entry is just "some `MapHexDef[]`,
 * however it was produced," with no fixed board size to configure.
 */
import { create } from 'zustand';
import { generateOpenBoard } from '../data/hexBoardMap';
import { mapById } from '../data/maps/catalog';
import { terrainArtVariant } from '../data/terrainArtVariants';
import type { HexId, MapHexDef, TerrainId } from '../engine/types';

/**
 * One of the 8 real terrain types, a decorative art variant (key into
 * `data/terrainArtVariants.ts` — painting one sets both the hex's real
 * `terrain` AND its `art` variant key, e.g. picking "Wheat" paints mechanical
 * `terrain: 'plowed'` with `art: 'wheat'` art), or a non-terrain paint mode.
 */
export type MapPaintTool = TerrainId | { variant: string } | 'roadFlag' | 'elevation' | 'clear';

export type ElevationLevel = 0 | 1 | 2;

function blankHexes(mapNumber: number): MapHexDef[] {
  return generateOpenBoard([{ gx: 0, gy: 0, n: mapNumber }]);
}

export interface MapEditorStore {
  mapName: string;
  mapNumber: number;
  hexes: MapHexDef[];
  tool: MapPaintTool;
  elevationValue: ElevationLevel;
  /** The catalog id this map was loaded from, if any — purely informational. */
  loadedFromId: string | null;
  /**
   * A full-board reference image to trace over (a data: URL from an uploaded
   * file) — purely an editor-local authoring aid, NOT part of the exported
   * `MapHexDef[]` (the author still assigns real terrain per hex via the
   * palette; the overlay is just a backdrop, matching the design handoff's
   * "Overlay mode" rendering technique but layered UNDER the terrain tiles
   * here rather than replacing them, since terrain stays real/authored).
   */
  overlayUrl: string | null;
  /** Independent of whether an overlay is loaded — lets you hide it without
   *  discarding it (e.g. to check the painted terrain without the backdrop). */
  overlayVisible: boolean;

  setMapName: (name: string) => void;
  /** Non-destructive: updates the `mapNumber`/`boardNumber` tag on every
   *  existing hex in place (it's cosmetic identification, not tied to a
   *  hex's id/label/terrain) rather than regenerating the board. */
  setMapNumber: (n: number) => void;
  setTool: (tool: MapPaintTool) => void;
  setElevationValue: (v: ElevationLevel) => void;
  paintHex: (hexId: HexId) => void;
  /** Discards the current board and starts a fresh blank one at the current Map #. */
  newBlankMap: () => void;
  /** Loads an existing catalog map's hexes for continued editing. */
  loadMap: (catalogId: string) => void;
  setOverlayUrl: (url: string | null) => void;
  toggleOverlayVisible: () => void;
  resetMapEditor: () => void;
}

function initial(): Pick<
  MapEditorStore,
  'mapName' | 'mapNumber' | 'hexes' | 'tool' | 'elevationValue' | 'loadedFromId' | 'overlayUrl' | 'overlayVisible'
> {
  return {
    mapName: 'New Map',
    mapNumber: 1,
    hexes: blankHexes(1),
    tool: 'open',
    elevationValue: 1,
    loadedFromId: null,
    overlayUrl: null,
    overlayVisible: true,
  };
}

export const useMapEditorStore = create<MapEditorStore>((set) => ({
  ...initial(),

  setMapName: (name) => set({ mapName: name }),
  setMapNumber: (n) =>
    set((st) => ({
      mapNumber: n,
      hexes: st.hexes.map((h) => ({
        ...h,
        mapNumber: n,
        boardNumber: h.boardNumber != null ? n : undefined,
      })),
    })),
  setTool: (tool) => set({ tool }),
  setElevationValue: (v) => set({ elevationValue: v }),
  paintHex: (hexId) =>
    set((st) => ({
      hexes: st.hexes.map((h) => {
        if (h.id !== hexId) return h;
        if (st.tool === 'clear') return { ...h, terrain: 'open', art: undefined, road: false, elevation: 0 };
        if (st.tool === 'roadFlag') return { ...h, road: !h.road };
        if (st.tool === 'elevation') return { ...h, elevation: st.elevationValue };
        if (typeof st.tool === 'object') {
          const v = terrainArtVariant(st.tool.variant);
          if (!v) return h;
          return { ...h, terrain: v.terrain, art: v.key };
        }
        return { ...h, terrain: st.tool, art: undefined };
      }),
    })),
  // The overlay is now real per-map gameplay art (not just a personal tracing
  // aid), so it travels WITH the board data — a blank map starts with none,
  // and loading an existing map restores exactly its own saved overlay
  // (or none, if it never had one), rather than carrying over whatever was
  // previously on screen.
  newBlankMap: () => set((st) => ({ hexes: blankHexes(st.mapNumber), loadedFromId: null, overlayUrl: null })),
  loadMap: (catalogId) =>
    set((st) => {
      const entry = mapById(catalogId);
      if (!entry) return st;
      const n = entry.hexes[0]?.mapNumber ?? st.mapNumber;
      return {
        mapName: entry.name,
        mapNumber: n,
        hexes: entry.hexes.map((h) => ({ ...h })),
        loadedFromId: entry.id,
        overlayUrl: entry.overlayImage ?? null,
      };
    }),
  setOverlayUrl: (url) => set({ overlayUrl: url }),
  toggleOverlayVisible: () => set((st) => ({ overlayVisible: !st.overlayVisible })),
  resetMapEditor: () => set(initial()),
}));
