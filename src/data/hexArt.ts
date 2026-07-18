/**
 * Hex artwork mapping. The board renders an image clipped into each hexagon.
 *
 * To use your OWN art: drop an image (svg/png/jpg/webp) under `public/assets/`
 * and either
 *   - change a terrain's default in TERRAIN_ART, or
 *   - pin a specific hex in HEX_ART_OVERRIDES (per-hex wins over terrain).
 * Paths are URLs from the web root (Vite serves `public/` at `/`). No editor
 * needed — this is the programmatic mapping the art flows through.
 */
import type { Hex, HexId, TerrainId } from '../engine/types';
import { terrainArtVariantUrl } from './terrainArtVariants';

/** Master switch: set to false to fall back to flat terrain colors. */
export const USE_HEX_ART = true;

/** Default artwork per terrain type (our own original tiles). */
export const TERRAIN_ART: Record<TerrainId, string> = {
  open: '/assets/terrain/open.png',
  road: '/assets/terrain/road.png',
  plowed: '/assets/terrain/plowed.svg',
  water: '/assets/terrain/water.svg',
  woodsLight: '/assets/terrain/lightwoodsv2.png',
  woodsHeavy: '/assets/terrain/woodsHeavyv2.png',
  buildingWood: '/assets/terrain/buildingWood.png',
  buildingStone: '/assets/terrain/buildingStone.png',
};

/**
 * Per-hex overrides keyed by axial hex id ("q,r"). Use this to give a specific
 * hex bespoke art (e.g. the stone church). Example:
 *   '3,2': '/assets/terrain/custom/church.png',
 */
export const HEX_ART_OVERRIDES: Record<HexId, string> = {};

/**
 * Resolve the art URL for a hex: a Map-Editor-authored `hex.art` variant wins
 * first (see `data/terrainArtVariants.ts`), then a hand-pinned per-hex
 * override, then the plain terrain default.
 */
export function artForHex(hex: Hex): string | null {
  if (!USE_HEX_ART) return null;
  const variant = hex.art ? terrainArtVariantUrl(hex.art) : undefined;
  return variant ?? HEX_ART_OVERRIDES[hex.id] ?? TERRAIN_ART[hex.terrain] ?? null;
}
