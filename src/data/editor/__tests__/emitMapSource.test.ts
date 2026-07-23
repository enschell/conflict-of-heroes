import { describe, expect, it } from 'vitest';
import { emitMapSource } from '../emitMapSource';
import { generateOpenBoard } from '../../hexBoardMap';
import type { MapHexDef } from '../../../engine/types';

function fixtureHexes(): MapHexDef[] {
  const hexes = generateOpenBoard([{ gx: 0, gy: 0, n: 3 }]);
  const first = hexes[0]!;
  return hexes.map((h) => (h.id === first.id ? { ...h, terrain: 'woodsHeavy', road: true, elevation: 2 } : h));
}

describe('emitMapSource', () => {
  it('produces well-formed, self-contained TypeScript source', () => {
    const src = emitMapSource({ mapName: 'Test Map', mapNumber: 3, hexes: fixtureHexes() });
    expect(src).toContain("import type { MapHexDef } from '../../engine/types';");
    expect(src).toContain('export const TEST_MAP_MAP: MapHexDef[] = [');
    expect(src).toContain("terrain: 'woodsHeavy'");
    expect(src).toContain('road: true');
    expect(src).toContain('elevation: 2');
  });

  it('falls back to a generic name when the map has none', () => {
    const src = emitMapSource({ mapName: '', mapNumber: 1, hexes: fixtureHexes() });
    expect(src).toContain('export const MAP_MAP: MapHexDef[] = [');
  });

  it('round-trips into a real, usable MapHexDef[] via eval', () => {
    const hexes = fixtureHexes();
    const src = emitMapSource({ mapName: 'Test Map', mapNumber: 3, hexes });
    const match = src.match(/export const \w+: MapHexDef\[\] = ([\s\S]*);\s*$/);
    expect(match).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const result = new Function(`return (${match![1]});`)() as MapHexDef[];
    expect(result.length).toBe(hexes.length);
    expect(result.find((h) => h.terrain === 'woodsHeavy')).toBeDefined();
    expect(result.every((h) => h.mapNumber === 3)).toBe(true);
  });

  it('omits the overlay export entirely when no overlay was set', () => {
    const src = emitMapSource({ mapName: 'Test Map', mapNumber: 3, hexes: fixtureHexes() });
    expect(src).not.toContain('_OVERLAY');
  });

  it('emits a real overlay export as a public/assets/maps/ path, NOT the embedded data URI', () => {
    const src = emitMapSource({
      mapName: 'Test Map',
      mapNumber: 3,
      hexes: fixtureHexes(),
      overlayUrl: 'data:image/png;base64,ABC123',
    });
    expect(src).toContain('export const TEST_MAP_OVERLAY: string = ');
    expect(src).toContain("'/assets/maps/test-map.png'");
    expect(src).not.toContain('data:image/png;base64,ABC123');
    expect(src).toContain('overlayImage: TEST_MAP_OVERLAY');
    expect(src).toContain('Save the downloaded overlay image');
    expect(src).toContain('public/assets/maps/');
    // The hexes MapHexDef[] export must still round-trip cleanly (it's the
    // LAST statement in the file specifically so this simple extraction
    // still finds only its own value, not the overlay constant above it).
    const match = src.match(/export const \w+: MapHexDef\[\] = ([\s\S]*);\s*$/);
    expect(match).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const result = new Function(`return (${match![1]});`)() as MapHexDef[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('derives the right file extension from the overlay data URL\'s MIME type', () => {
    const jpegSrc = emitMapSource({
      mapName: 'Test Map',
      mapNumber: 3,
      hexes: fixtureHexes(),
      overlayUrl: 'data:image/jpeg;base64,ABC123',
    });
    expect(jpegSrc).toContain("'/assets/maps/test-map.jpg'");

    const unknownSrc = emitMapSource({
      mapName: 'Test Map',
      mapNumber: 3,
      hexes: fixtureHexes(),
      overlayUrl: 'not-a-real-data-url',
    });
    expect(unknownSrc).toContain("'/assets/maps/test-map.png'");
  });
});
