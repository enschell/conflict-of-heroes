import { describe, expect, it } from 'vitest';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { idOf, neighbors, parseHexId } from '../../engine/hex';

// Mission 1 is being re-authored onto the new flat-top board substrate
// (CLAUDE.md §B) directly with the user, hex by hex. Terrain content isn't
// final yet (TERRAIN_JSON in maps/mission1.ts starts empty), so this only
// covers what's structurally true right now — add real per-hex terrain
// assertions here once the terrain JSON is filled in.
const byLabel = new Map(MISSION1_MAP.map((h) => [h.label!, h]));
const labelById = new Map(MISSION1_MAP.map((h) => [h.id, h.label!]));

describe('Map 1 (Mission 1 "Partisans", re-authoring in progress)', () => {
  it('is a single full board (238 hexes) with unique coordinates', () => {
    expect(MISSION1_MAP).toHaveLength(238);
    expect(new Set(MISSION1_MAP.map((h) => h.id)).size).toBe(238);
  });

  it('every real (non-null) label is unique, and there is exactly one board-number cell', () => {
    const labels = MISSION1_MAP.map((h) => h.label).filter((l): l is string => l != null);
    expect(new Set(labels).size).toBe(labels.length);
    expect(MISSION1_MAP.filter((h) => h.boardNumber != null)).toHaveLength(1);
  });

  it('hexIdForLabel resolves real labels and round-trips through the same lookup the map itself used', () => {
    const id = hexIdForLabel('I06');
    expect(byLabel.get('I06')!.id).toBe(id);
    expect(() => hexIdForLabel('Z99')).toThrow();
  });

  it('I06 has 6 real neighbors, all present on the map', () => {
    const i06 = parseHexId(hexIdForLabel('I06'));
    const around = neighbors(i06)
      .map((n) => labelById.get(idOf(n)))
      .filter((l): l is string => !!l);
    expect(around).toHaveLength(6);
  });

  it('the key mission hexes referenced by data/missions/mission1.ts all exist on the map', () => {
    for (const label of ['I06', 'S06', 'R01', 'K02', 'M05', 'L08', 'N10']) {
      expect(byLabel.has(label)).toBe(true);
    }
  });
});
