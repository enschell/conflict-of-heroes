import { beforeEach, describe, expect, it } from 'vitest';
import { useMapEditorStore } from '../mapEditorStore';

function hex(id: string) {
  return useMapEditorStore.getState().hexes.find((h) => h.id === id)!;
}

describe('mapEditorStore', () => {
  beforeEach(() => {
    useMapEditorStore.getState().resetMapEditor();
  });

  it('starts with a blank, fully-open board at Map #1', () => {
    const { hexes, mapNumber, mapName } = useMapEditorStore.getState();
    expect(mapNumber).toBe(1);
    expect(mapName).toBe('New Map');
    expect(hexes.length).toBeGreaterThan(0);
    expect(hexes.every((h) => h.terrain === 'open' && !h.road)).toBe(true);
  });

  it('paints the selected terrain onto a clicked hex only', () => {
    const someId = useMapEditorStore.getState().hexes[10]!.id;
    useMapEditorStore.getState().setTool('woodsHeavy');
    useMapEditorStore.getState().paintHex(someId);
    expect(hex(someId).terrain).toBe('woodsHeavy');
    const otherId = useMapEditorStore.getState().hexes[11]!.id;
    expect(hex(otherId).terrain).toBe('open');
  });

  it('toggles the independent road flag without touching terrain', () => {
    const id = useMapEditorStore.getState().hexes[3]!.id;
    useMapEditorStore.getState().setTool('woodsLight');
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().setTool('roadFlag');
    useMapEditorStore.getState().paintHex(id);
    expect(hex(id).terrain).toBe('woodsLight');
    expect(hex(id).road).toBe(true);
    // Toggling again flips it back off.
    useMapEditorStore.getState().paintHex(id);
    expect(hex(id).road).toBe(false);
  });

  it('paints elevation using the selected level', () => {
    const id = useMapEditorStore.getState().hexes[5]!.id;
    useMapEditorStore.getState().setTool('elevation');
    useMapEditorStore.getState().setElevationValue(2);
    useMapEditorStore.getState().paintHex(id);
    expect(hex(id).elevation).toBe(2);
  });

  it('clear resets terrain, road, and elevation on that hex', () => {
    const id = useMapEditorStore.getState().hexes[7]!.id;
    useMapEditorStore.getState().setTool('water');
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().setTool('roadFlag');
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().setTool('elevation');
    useMapEditorStore.getState().setElevationValue(1);
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().setTool('clear');
    useMapEditorStore.getState().paintHex(id);
    const h = hex(id);
    expect(h.terrain).toBe('open');
    expect(h.road).toBe(false);
    expect(h.elevation).toBe(0);
  });

  it('paints an art variant, setting both mechanical terrain and the art key', () => {
    const id = useMapEditorStore.getState().hexes[8]!.id;
    useMapEditorStore.getState().setTool({ variant: 'wheat' });
    useMapEditorStore.getState().paintHex(id);
    const h = hex(id);
    // "Wheat" is decorative on top of real Plowed Field terrain (see
    // data/terrainArtVariants.ts's header comment for the full mapping).
    expect(h.terrain).toBe('plowed');
    expect(h.art).toBe('wheat');
  });

  it('painting a plain mechanical terrain after an art variant clears the stale art key', () => {
    const id = useMapEditorStore.getState().hexes[9]!.id;
    useMapEditorStore.getState().setTool({ variant: 'lake' });
    useMapEditorStore.getState().paintHex(id);
    expect(hex(id).art).toBe('lake');
    useMapEditorStore.getState().setTool('woodsHeavy');
    useMapEditorStore.getState().paintHex(id);
    expect(hex(id).terrain).toBe('woodsHeavy');
    expect(hex(id).art).toBeUndefined();
  });

  it('clear also removes a painted art variant', () => {
    const id = useMapEditorStore.getState().hexes[6]!.id;
    useMapEditorStore.getState().setTool({ variant: 'balka' });
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().setTool('clear');
    useMapEditorStore.getState().paintHex(id);
    const h = hex(id);
    expect(h.terrain).toBe('open');
    expect(h.art).toBeUndefined();
  });

  it('setMapNumber updates every hex tag in place without touching terrain/labels/ids', () => {
    const id = useMapEditorStore.getState().hexes[2]!.id;
    useMapEditorStore.getState().setTool('plowed');
    useMapEditorStore.getState().paintHex(id);
    const before = useMapEditorStore.getState().hexes.map((h) => h.id);
    useMapEditorStore.getState().setMapNumber(7);
    const st = useMapEditorStore.getState();
    expect(st.mapNumber).toBe(7);
    expect(st.hexes.map((h) => h.id)).toEqual(before);
    expect(st.hexes.every((h) => h.mapNumber === 7)).toBe(true);
    expect(hex(id).terrain).toBe('plowed');
    // Only the corner cell carries a displayed boardNumber.
    const cornerCells = st.hexes.filter((h) => h.boardNumber != null);
    expect(cornerCells.length).toBe(1);
    expect(cornerCells[0]!.boardNumber).toBe(7);
  });

  it('starts with no overlay, visible by default', () => {
    const { overlayUrl, overlayVisible } = useMapEditorStore.getState();
    expect(overlayUrl).toBeNull();
    expect(overlayVisible).toBe(true);
  });

  it('sets and toggles the reference overlay independently of terrain painting', () => {
    useMapEditorStore.getState().setOverlayUrl('data:image/png;base64,abc');
    expect(useMapEditorStore.getState().overlayUrl).toBe('data:image/png;base64,abc');
    expect(useMapEditorStore.getState().overlayVisible).toBe(true);
    useMapEditorStore.getState().toggleOverlayVisible();
    expect(useMapEditorStore.getState().overlayVisible).toBe(false);
    useMapEditorStore.getState().toggleOverlayVisible();
    expect(useMapEditorStore.getState().overlayVisible).toBe(true);
    useMapEditorStore.getState().setOverlayUrl(null);
    expect(useMapEditorStore.getState().overlayUrl).toBeNull();
  });

  it('newBlankMap clears any loaded overlay (a blank board has no saved art)', () => {
    useMapEditorStore.getState().setOverlayUrl('data:image/png;base64,xyz');
    useMapEditorStore.getState().newBlankMap();
    expect(useMapEditorStore.getState().overlayUrl).toBeNull();
  });

  it('loadMap restores the loaded catalog map\'s own overlay (or clears it if it has none)', () => {
    useMapEditorStore.getState().setOverlayUrl('data:image/png;base64,stale');
    // mission1 has no saved overlayImage in the real catalog — loading it
    // should discard the stale overlay, not keep it around.
    useMapEditorStore.getState().loadMap('mission1');
    expect(useMapEditorStore.getState().overlayUrl).toBeNull();
  });

  it('newBlankMap discards painted terrain but keeps the current Map #', () => {
    const id = useMapEditorStore.getState().hexes[1]!.id;
    useMapEditorStore.getState().setMapNumber(4);
    useMapEditorStore.getState().setTool('buildingStone');
    useMapEditorStore.getState().paintHex(id);
    useMapEditorStore.getState().newBlankMap();
    const st = useMapEditorStore.getState();
    expect(st.mapNumber).toBe(4);
    expect(st.hexes.every((h) => h.terrain === 'open')).toBe(true);
  });
});
