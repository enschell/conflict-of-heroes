import { afterEach, describe, expect, it } from 'vitest';
import { assembledMapOverlays } from '../editorStore';
import type { EditorMapState } from '../editorStore';
import { MAP_CATALOG } from '../../data/maps/catalog';

function baseMap(boards: EditorMapState['boards']): EditorMapState {
  return {
    boards,
    tool: 'wire',
    toolSide: 'A',
    bunkerFacing: 0,
    minesHitNumber: 8,
    obstacles: {},
    fortifications: {},
  };
}

describe('assembledMapOverlays', () => {
  afterEach(() => {
    delete MAP_CATALOG['blank-single']!.overlayImage;
  });

  it('is empty when no picked board has a saved overlay image', () => {
    const map = baseMap([{ id: 'board-1', mapId: 'blank-single', rotation: 0 }]);
    expect(assembledMapOverlays(map)).toEqual({});
  });

  it('keys a picked board\'s overlay image by its own mapNumber', () => {
    MAP_CATALOG['blank-single']!.overlayImage = 'data:image/png;base64,ABC';
    const map = baseMap([{ id: 'board-1', mapId: 'blank-single', rotation: 0 }]);
    const n = MAP_CATALOG['blank-single']!.hexes[0]!.mapNumber!;
    expect(assembledMapOverlays(map)).toEqual({ [n]: 'data:image/png;base64,ABC' });
  });

  it('omits a board whose picked map has no overlay, alongside one that does', () => {
    MAP_CATALOG['blank-single']!.overlayImage = 'data:image/png;base64,ABC';
    const map = baseMap([
      { id: 'board-1', mapId: 'blank-single', rotation: 0 },
      { id: 'board-2', mapId: 'mission1', rotation: 180, attachTo: { boardId: 'board-1', localEdge: 'S', neighborLocalEdge: 'N' } },
    ]);
    const n = MAP_CATALOG['blank-single']!.hexes[0]!.mapNumber!;
    expect(assembledMapOverlays(map)).toEqual({ [n]: 'data:image/png;base64,ABC' });
  });
});
