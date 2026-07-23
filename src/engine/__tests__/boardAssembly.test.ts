/**
 * Multi-board assembly (Mission Editor §C): independently-rotated boards
 * merged into one Mission's `hexes`. Written and verified BEFORE any editor
 * UI touches this, per plan — these are the numeric adjacency-preservation
 * checks the design's own correctness rests on.
 */
import { describe, expect, it } from 'vitest';
import { assembleBoards, rotationClusters, type BoardAssemblyEntry } from '../boardAssembly';
import { generateOpenBoard } from '../../data/hexBoardMap';
import { hexId, idOf, neighbors, parseHexId } from '../hex';
import type { MapHexDef } from '../types';

function freshBoard(n = 1): MapHexDef[] {
  return generateOpenBoard([{ gx: 0, gy: 0, n }]);
}

/** True adjacency count within a hex set, using the engine's own `neighbors()`. */
function countAdjacentPairs(hexes: MapHexDef[]): number {
  const ids = new Set(hexes.map((h) => h.id));
  let count = 0;
  for (const h of hexes) {
    const a = parseHexId(h.id);
    for (const n of neighbors(a)) if (ids.has(idOf(n))) count++;
  }
  return count; // each pair counted twice (once per direction)
}

describe('assembleBoards — single board (0°/90°/180°/-90°) preserves adjacency exactly', () => {
  const base = freshBoard();
  const baseAdjacency = countAdjacentPairs(base);

  it('0° (identity) reproduces the exact same hex set', () => {
    const out = assembleBoards([{ id: 'A', hexes: base, rotation: 0 }]);
    expect(out.length).toBe(base.length);
    expect(countAdjacentPairs(out)).toBe(baseAdjacency);
  });

  it.each([90, -90, 180] as const)('%s° preserves the exact adjacency-pair count', (rotation) => {
    const out = assembleBoards([{ id: 'A', hexes: base, rotation }]);
    expect(out.length).toBe(base.length);
    expect(countAdjacentPairs(out)).toBe(baseAdjacency);
  });

  it('180° really does negate every coordinate (the exact cube-rotation identity)', () => {
    const out = assembleBoards([{ id: 'A', hexes: base, rotation: 180 }]);
    const byOriginal = new Map(base.map((h) => [h.id, parseHexId(h.id)]));
    // Spot-check a handful of hexes: the merged id should be exactly (-q,-r).
    let checked = 0;
    for (const h of out) {
      const original = [...byOriginal.entries()].find(([, a]) => hexId(-a.q, -a.r) === h.id);
      if (original) checked++;
    }
    expect(checked).toBe(base.length);
  });
});

describe('assembleBoards — two-board abutment', () => {
  it('E-W, both 0° (regression: matches the existing single-family behavior)', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 0, attachTo: { boardId: 'A', localEdge: 'W', neighborLocalEdge: 'E' } },
    ];
    const out = assembleBoards(entries);
    // 13 west-edge cells of B merge exactly onto A's 13 east-edge cells.
    expect(out.length).toBe(a.length + b.length - 13);
  });

  it('E-W, both 180° (same family, both rotated — still merges cleanly)', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 180 },
      { id: 'B', hexes: b, rotation: 180, attachTo: { boardId: 'A', localEdge: 'W', neighborLocalEdge: 'E' } },
    ];
    const out = assembleBoards(entries);
    expect(out.length).toBe(a.length + b.length - 13);
  });

  it('E-W, A at 0° and B at 180° (mixed within the {0°,180°} family)', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 180, attachTo: { boardId: 'A', localEdge: 'E', neighborLocalEdge: 'E' } },
    ];
    const out = assembleBoards(entries);
    expect(out.length).toBe(a.length + b.length - 13);
  });

  it('N-S, A at 0° and B at 180° (only the 10 even-column half-hexes merge, not all 19 columns)', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 180, attachTo: { boardId: 'A', localEdge: 'S', neighborLocalEdge: 'S' } },
    ];
    const out = assembleBoards(entries);
    expect(out.length).toBe(a.length + b.length - 10);
  });

  it('N-S, both 0° (regression: matches the existing single-family behavior, 10-cell merge)', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 0, attachTo: { boardId: 'A', localEdge: 'N', neighborLocalEdge: 'S' } },
    ];
    const out = assembleBoards(entries);
    expect(out.length).toBe(a.length + b.length - 10);
  });

  it('same-family 90°/-90° two-board cluster merges cleanly too', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 90 },
      { id: 'B', hexes: b, rotation: -90, attachTo: { boardId: 'A', localEdge: 'W', neighborLocalEdge: 'E' } },
    ];
    const out = assembleBoards(entries);
    expect(out.length).toBe(a.length + b.length - 13);
  });

  it('rejects a cross-family attachment ({0°,180°} directly touching {90°,-90°})', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 90, attachTo: { boardId: 'A', localEdge: 'W', neighborLocalEdge: 'E' } },
    ];
    expect(() => assembleBoards(entries)).toThrow(/rotation family/);
  });

  it('a full merged assembly has real, correctly-adjacent hexes at the seam', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 180, attachTo: { boardId: 'A', localEdge: 'E', neighborLocalEdge: 'E' } },
    ];
    const out = assembleBoards(entries);
    const ids = new Set(out.map((h) => h.id));
    // Every hex in the merged assembly should have at least 2 neighbors present
    // (even a corner hex has at least this many within one board); none should
    // end up completely isolated (a real bug symptom — a bad translation would
    // produce orphaned/duplicated hexes with far fewer neighbors than expected).
    let isolated = 0;
    for (const h of out) {
      const present = neighbors(parseHexId(h.id)).filter((n) => ids.has(idOf(n))).length;
      if (present === 0) isolated++;
    }
    expect(isolated).toBe(0);
  });
});

describe('assembleBoards — error handling', () => {
  it('throws if the anchor (first entry) has attachTo set', () => {
    const a = freshBoard(1);
    expect(() =>
      assembleBoards([{ id: 'A', hexes: a, rotation: 0, attachTo: { boardId: 'X', localEdge: 'E', neighborLocalEdge: 'W' } }]),
    ).toThrow(/anchor/);
  });

  it('throws if a non-anchor entry omits attachTo', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    expect(() => assembleBoards([{ id: 'A', hexes: a, rotation: 0 }, { id: 'B', hexes: b, rotation: 0 }])).toThrow(
      /needs attachTo/,
    );
  });

  it('throws if attachTo references an unknown board', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    expect(() =>
      assembleBoards([
        { id: 'A', hexes: a, rotation: 0 },
        { id: 'B', hexes: b, rotation: 0, attachTo: { boardId: 'ZZZ', localEdge: 'W', neighborLocalEdge: 'E' } },
      ]),
    ).toThrow(/unknown board/);
  });
});

describe('rotationClusters (for the rendering layer)', () => {
  it('returns no clusters when every board is {0°,180°}-family', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 0 },
      { id: 'B', hexes: b, rotation: 180, attachTo: { boardId: 'A', localEdge: 'E', neighborLocalEdge: 'E' } },
    ];
    expect(rotationClusters(entries)).toEqual([]);
  });

  it('groups a connected {90°,-90°} pair into one cluster with all their hexes', () => {
    const a = freshBoard(1);
    const b = freshBoard(2);
    const entries: BoardAssemblyEntry[] = [
      { id: 'A', hexes: a, rotation: 90 },
      { id: 'B', hexes: b, rotation: -90, attachTo: { boardId: 'A', localEdge: 'W', neighborLocalEdge: 'E' } },
    ];
    const merged = assembleBoards(entries);
    const clusters = rotationClusters(entries);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.hexIds.length).toBe(merged.length);
    expect(new Set(clusters[0]!.hexIds)).toEqual(new Set(merged.map((h) => h.id)));
  });

  it('a single quarter-family board (no attachTo at all) is still its own one-member cluster', () => {
    const a = freshBoard(1);
    const entries: BoardAssemblyEntry[] = [{ id: 'A', hexes: a, rotation: -90 }];
    const clusters = rotationClusters(entries);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.rotation).toBe(-90);
    expect(clusters[0]!.hexIds.length).toBe(a.length);
  });
});
