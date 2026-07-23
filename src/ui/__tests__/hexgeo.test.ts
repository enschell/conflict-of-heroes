import { describe, expect, it } from 'vitest';
import { clipHexPolygon, computeDisplayRotationCluster, hexCenter, hexCorners, polygonCentroid, polygonTopY, type Pt } from '../hexgeo';

function shoelaceArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

describe('hexCorners (flat-top)', () => {
  it('has a vertex due right and due left of center (points, not flats)', () => {
    const c = hexCorners({ x: 0, y: 0 }, 10);
    expect(c.some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    expect(c.some((p) => Math.abs(p.x + 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
  });

  it('full hex area matches the standard hexagon formula (3*sqrt(3)/2 * R^2)', () => {
    const c = hexCorners({ x: 5, y: -5 }, 10);
    expect(shoelaceArea(c)).toBeCloseTo((3 * Math.sqrt(3)) / 2 * 100, 5);
  });
});

describe('clipHexPolygon', () => {
  const size = 10;
  const center = { x: 0, y: 0 };
  const full = hexCorners(center, size);
  const fullArea = shoelaceArea(full);

  it('undefined cut returns the polygon unchanged', () => {
    expect(clipHexPolygon(full, center, undefined)).toEqual(full);
  });

  it('a single-side cut halves the area exactly (clip line passes through center)', () => {
    for (const cut of [{ w: true as const }, { e: true as const }, { n: true as const }, { s: true as const }]) {
      const clipped = clipHexPolygon(full, center, cut);
      expect(shoelaceArea(clipped)).toBeCloseTo(fullArea / 2, 5);
    }
  });

  it('w-cut keeps only the right half (all points x >= center.x)', () => {
    const clipped = clipHexPolygon(full, center, { w: true });
    for (const p of clipped) expect(p.x).toBeGreaterThanOrEqual(-1e-9);
  });

  it('e-cut keeps only the left half (all points x <= center.x)', () => {
    const clipped = clipHexPolygon(full, center, { e: true });
    for (const p of clipped) expect(p.x).toBeLessThanOrEqual(1e-9);
  });

  it('n-cut keeps only the bottom half (all points y >= center.y, screen y-down)', () => {
    const clipped = clipHexPolygon(full, center, { n: true });
    for (const p of clipped) expect(p.y).toBeGreaterThanOrEqual(-1e-9);
  });

  it('s-cut keeps only the top half (all points y <= center.y)', () => {
    const clipped = clipHexPolygon(full, center, { s: true });
    for (const p of clipped) expect(p.y).toBeLessThanOrEqual(1e-9);
  });

  it('a corner (two-side) cut quarters the area', () => {
    const clipped = clipHexPolygon(full, center, { w: true, n: true });
    expect(shoelaceArea(clipped)).toBeCloseTo(fullArea / 4, 5);
    for (const p of clipped) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('polygonCentroid / polygonTopY', () => {
  it('centroid of a full hex is its own center', () => {
    const full = hexCorners({ x: 3, y: 4 }, 10);
    const c = polygonCentroid(full);
    expect(c.x).toBeCloseTo(3, 5);
    expect(c.y).toBeCloseTo(4, 5);
  });

  it('a half-hex centroid shifts toward the kept side', () => {
    const full = hexCorners({ x: 0, y: 0 }, 10);
    const clipped = clipHexPolygon(full, { x: 0, y: 0 }, { w: true }); // keeps right half
    const c = polygonCentroid(clipped);
    expect(c.x).toBeGreaterThan(0);
  });

  it('polygonTopY finds the minimum y', () => {
    const full = hexCorners({ x: 0, y: 0 }, 10);
    expect(polygonTopY(full)).toBeCloseTo(-8.660254, 5); // topmost corners at y = -R*sin(60)
  });
});

describe('computeDisplayRotationCluster', () => {
  const hexesById = {
    '0,0': { id: '0,0', mapNumber: 8 },
    '1,0': { id: '1,0', mapNumber: 8 },
    '0,1': { id: '0,1', mapNumber: 8 },
  };

  it('returns null when mapRotations is empty/undefined', () => {
    expect(computeDisplayRotationCluster(hexesById, undefined)).toBeNull();
    expect(computeDisplayRotationCluster(hexesById, {})).toBeNull();
  });

  it('includes every Hex in the cluster when any entry is present (whole-assembly invariant)', () => {
    const cluster = computeDisplayRotationCluster(hexesById, { 8: 90 });
    expect(cluster).not.toBeNull();
    expect(cluster!.rotation).toBe(90);
    expect([...cluster!.hexIds].sort()).toEqual(Object.keys(hexesById).sort());
  });

  it('pivot is the average screen center of every Hex', () => {
    const cluster = computeDisplayRotationCluster(hexesById, { 8: -90 })!;
    const centers = Object.keys(hexesById).map((id) => hexCenter(id));
    const expected = {
      x: centers.reduce((s, c) => s + c.x, 0) / centers.length,
      y: centers.reduce((s, c) => s + c.y, 0) / centers.length,
    };
    expect(cluster.pivot.x).toBeCloseTo(expected.x, 5);
    expect(cluster.pivot.y).toBeCloseTo(expected.y, 5);
  });

  it('picks the smallest mapNumber\'s rotation value when multiple are recorded', () => {
    const cluster = computeDisplayRotationCluster(hexesById, { 12: -90, 3: 90 })!;
    expect(cluster.rotation).toBe(90);
  });
});
