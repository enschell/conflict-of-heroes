/**
 * Art-variant palette for the Map Editor (src/ui/mapEditor/) — sourced from the
 * "Hexagonal Map Generator" design handoff (`design_handoff_hex_map/`, 19 real
 * terrain tile PNGs under `public/assets/terrain/`).
 *
 * IMPORTANT: this is a VISUAL palette, not a new set of mechanical terrain
 * types. CLAUDE.md is explicit that the v3 rulebook (rules/04) defines exactly
 * 8 real terrain types (Open, Plowed Fields, Water, Walls, Light Woods, Heavy
 * Woods, Wood Buildings, Stone Buildings) and that "more terrain types" almost
 * always means art variety, not new mechanics. Every variant below maps onto
 * one of the engine's 8 `TerrainId` values; painting a variant sets the hex's
 * real `terrain` to that value AND stamps `art` with the variant key so the
 * nicer tile renders instead of the generic default (`hexArt.ts`'s
 * `artForHex` prefers `hex.art` when set).
 *
 * Mapping calls, for the record (revisit against rules/04 if any of these
 * turn out to have real distinct mechanics the rulebook actually defines):
 *  - Wheat / Corn / Plowed Field  -> 'plowed' (decorative field dressing)
 *  - Stream / Marsh / Lake        -> 'water' (rules/04 groups "Rivers and
 *    Lakes" as one Water type; Stream/Marsh are treated as thinner/smaller
 *    art on the same mechanics)
 *  - Ford                         -> 'open' (a Ford is specifically the
 *    passable crossing point of a water feature, so it deliberately does NOT
 *    inherit Water's foot-only/+4AP penalty)
 *  - Balka / Small Balka / Anti-Tank Ditch -> 'open' (gully/ditch dressing;
 *    no rules/04 entry defines a distinct mechanical effect for these — purely
 *    decorative until/unless one is found)
 *
 * NOT in this palette (they aren't hex-fill terrain at all):
 *  - "Road" is the engine's independent `road: boolean` field (rules/04:
 *    "Roads work regardless of the center dot") — the Map Editor has its own
 *    dedicated Road tool, not a palette swatch.
 *  - "Walls" are a per-EDGE feature (`Hex.walls`), not a hex fill — the Map
 *    Editor has its own two-click Wall tool.
 *  - "Sloping terrain" / "Steep terrain" are DERIVED from the elevation
 *    difference between neighboring hexes (§12, already fully implemented in
 *    movement.ts/los.ts) — not an intrinsic per-hex tag. The Map Editor paints
 *    a per-hex `elevation` number instead; Sloping/Steep fall out automatically.
 */
import type { TerrainId } from '../engine/types';

export interface TerrainArtVariant {
  /** Matches the PNG filename under public/assets/terrain/ (without extension). */
  key: string;
  label: string;
  terrain: TerrainId;
  url: string;
}

function tile(key: string): string {
  return `/assets/terrain/${key}.png`;
}

/** Fixed palette order, matching the design handoff's terrain vocabulary. */
export const TERRAIN_ART_VARIANTS: TerrainArtVariant[] = [
  { key: 'open', label: 'Open', terrain: 'open', url: tile('open') },
  { key: 'light_woods', label: 'Light Woods', terrain: 'woodsLight', url: tile('lightwoodsv2') },
  { key: 'heavy_woods', label: 'Heavy Woods', terrain: 'woodsHeavy', url: tile('woodsHeavyv2') },
  { key: 'wood_building', label: 'Wood Building', terrain: 'buildingWood', url: tile('wood_building') },
  { key: 'stone_building', label: 'Stone Building', terrain: 'buildingStone', url: tile('stone_building') },
  { key: 'wheat', label: 'Wheat', terrain: 'plowed', url: tile('wheat') },
  { key: 'corn', label: 'Corn', terrain: 'plowed', url: tile('corn') },
  { key: 'plowed_field', label: 'Plowed Field', terrain: 'plowed', url: tile('plowed_field') },
  { key: 'balka', label: 'Balka', terrain: 'open', url: tile('balka') },
  { key: 'small_balka', label: 'Small Balka', terrain: 'open', url: tile('small_balka') },
  { key: 'anti_tank_ditch', label: 'Anti-Tank Ditch', terrain: 'open', url: tile('anti_tank_ditch') },
  { key: 'stream', label: 'Stream', terrain: 'water', url: tile('stream') },
  { key: 'ford', label: 'Ford', terrain: 'open', url: tile('ford') },
  { key: 'marsh', label: 'Marsh', terrain: 'water', url: tile('marsh') },
  { key: 'lake', label: 'Lake', terrain: 'water', url: tile('lake') },
];

const VARIANT_BY_KEY: Record<string, TerrainArtVariant> = Object.fromEntries(
  TERRAIN_ART_VARIANTS.map((v) => [v.key, v]),
);

export function terrainArtVariant(key: string): TerrainArtVariant | undefined {
  return VARIANT_BY_KEY[key];
}

/** Resolve a variant key straight to its tile URL (used by hexArt.ts/EditorBoard.tsx). */
export function terrainArtVariantUrl(key: string): string | undefined {
  return VARIANT_BY_KEY[key]?.url;
}

/** Non-fill tool icons — Road/Walls/Elevation aren't palette swatches (see header), but their
 *  own tool buttons reuse these real tile images for a recognizable icon. */
export const ROAD_TOOL_ICON = tile('road');
export const WALL_TOOL_ICON = tile('walls');
export const SLOPING_TERRAIN_ICON = tile('sloping_terrain');
export const STEEP_TERRAIN_ICON = tile('steep_terrain');
