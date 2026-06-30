import { describe, expect, it } from 'vitest';
import { MISSION1_MAP, axialForLabel, hexIdForLabel } from '../maps/mission1';
import { idOf, neighbors, parseHexId } from '../../engine/hex';

const byLabel = new Map(MISSION1_MAP.map((h) => [h.label!, h]));
const labelById = new Map(MISSION1_MAP.map((h) => [h.id, h.label!]));

describe('Map 1 (Mission 1 "Partisans")', () => {
  it('has the authored 206 playable hexes with unique coordinates', () => {
    expect(MISSION1_MAP).toHaveLength(206);
    expect(new Set(MISSION1_MAP.map((h) => h.id)).size).toBe(206);
    expect(new Set(MISSION1_MAP.map((h) => h.label)).size).toBe(206);
  });

  it('maps labels to the engine pointy-top axial system (north = up)', () => {
    expect(axialForLabel('I06')).toEqual({ q: 1, r: 10 });
    expect(hexIdForLabel('I06')).toBe('1,10');
    // A full row (R, r=1) and the south full row (B, r=17) keep cols ordered W→E.
    expect(axialForLabel('R01').q).toBeLessThan(axialForLabel('R12').q);
    // North (R, r=1) sits above south (B, r=17): smaller r = higher up.
    expect(axialForLabel('R07').r).toBeLessThan(axialForLabel('B07').r);
  });

  it('places the named mission hexes on the right terrain', () => {
    expect(byLabel.get('I06')).toMatchObject({ terrain: 'open', road: true }); // objective on the road
    expect(byLabel.get('R07')).toMatchObject({ terrain: 'open', road: true }); // Soviet R2 road entry
    expect(byLabel.get('K02')!.terrain).toBe('woodsLight'); // Maxim
    expect(byLabel.get('L08')!.terrain).toBe('woodsHeavy'); // Rifle
    expect(byLabel.get('M05')!.terrain).toBe('woodsHeavy');
    expect(byLabel.get('N10')!.terrain).toBe('woodsLight');
  });

  it('I06 borders the staggered neighbours H05/H06, I05/I07, J05/J06', () => {
    const i06 = parseHexId(hexIdForLabel('I06'));
    const around = neighbors(i06)
      .map((n) => labelById.get(idOf(n)))
      .filter((l): l is string => !!l)
      .sort();
    expect(around).toEqual(['H05', 'H06', 'I05', 'I07', 'J05', 'J06']);
  });

  it('only uses terrain types the engine knows', () => {
    const ok = new Set(['open', 'woodsLight', 'woodsHeavy']);
    for (const h of MISSION1_MAP) expect(ok.has(h.terrain)).toBe(true);
  });
});
