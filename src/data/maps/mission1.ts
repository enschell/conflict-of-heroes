/**
 * Map 1 — the board for Mission 1 ("Partisans"). Terrain authored from the
 * physical Academy Games Map 1 board (our own data; no art is copied).
 *
 * Coordinate system (matches the rulebook's hex labels):
 *  - 19 rows lettered A (south / bottom) … S (north / top); 12 columns 01–12
 *    running west→east. Rows alternate FULL (B,D,…,R) and HALF-hex (A,C,…,S);
 *    each half-hex row carries one leading UNNAMED half-hex, so its playable
 *    hexes are labelled col 01..12 after it (e.g. I06).
 *  - We map a label to the engine's pointy-top axial (q,r) so that north = up
 *    (smaller r) and east = right (larger q); `axialToPixel` then renders the
 *    rectangular, staggered board correctly.
 *
 * Each character below is one hex for columns 01..12 (west→east):
 *   O = open · R = road (open hex with a road) · L = light woods · H = heavy woods
 *   . = off-board / clipped half-hex (no playable hex)
 */
import type { MapHexDef, TerrainId } from '../../engine/types';

/** Rows north→south (display order); the builder reads them by label. */
const ROWS: Record<string, string> = {
  S: '............',
  R: 'OOOOOOROOOO.',
  Q: 'OLLRRRLOOLL.',
  P: 'OOLRLLOLOLOO',
  O: 'ORROOOLOOOL.',
  N: 'HRLOOOHHLLOO',
  M: 'RRRHHOHHOOO.',
  L: 'RLHRHOOHOOOO',
  K: 'RLHRLOLLLLO.',
  J: 'ROOORLOOOOOR',
  I: 'OOOORROOOLR.',
  H: 'OOOOOORROORO',
  G: 'OOOORHHRRRO.',
  F: 'OLLOORHOLOOO',
  E: 'LLOORLHOLLO.',
  D: 'OLOOROOOOOOO',
  C: 'OOOLROOOLOO.',
  B: 'OOLLROOOOOOO',
  A: 'OOOLOROOOOO.',
};

/** A=0 (south) … S=18 (north). Row r (from top) = 18 − this index. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRS';

const TERRAIN: Record<string, { terrain: TerrainId; road?: boolean }> = {
  O: { terrain: 'open' },
  R: { terrain: 'open', road: true },
  L: { terrain: 'woodsLight' },
  H: { terrain: 'woodsHeavy' },
};

/** Rulebook hex label (e.g. "I06") → engine axial coordinate. */
export function axialForLabel(label: string): { q: number; r: number } {
  const letter = label[0]!;
  const col = Number(label.slice(1));
  const r = 18 - LETTERS.indexOf(letter);
  // Full rows (r odd) are flush; half rows (r even) are offset half a hex.
  const q = r % 2 === 1 ? col - (r - 1) / 2 : col - r / 2;
  return { q, r };
}

/** Engine hex id ("q,r") for a rulebook label. */
export function hexIdForLabel(label: string): string {
  const { q, r } = axialForLabel(label);
  return `${q},${r}`;
}

export const MISSION1_MAP: MapHexDef[] = (() => {
  const hexes: MapHexDef[] = [];
  for (const letter of LETTERS) {
    const row = ROWS[letter];
    if (!row) continue;
    for (let col = 1; col <= 12; col++) {
      const code = row[col - 1];
      if (!code || code === '.') continue;
      const t = TERRAIN[code];
      if (!t) throw new Error(`Map 1: unknown terrain code "${code}" at ${letter}${col}`);
      const label = `${letter}${String(col).padStart(2, '0')}`;
      const def: MapHexDef = { id: hexIdForLabel(label), terrain: t.terrain, label };
      if (t.road) def.road = true;
      hexes.push(def);
    }
  }
  return hexes;
})();
