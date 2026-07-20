/**
 * Map Editor: a terrain-authoring tool. Assign a Map # and name, then paint
 * the 8 real terrain types (+ the independent Road-network flag and
 * Elevation) hex-by-hex onto a single blank board. Exports a self-contained
 * `MapHexDef[]` TS source file — drop it into `data/maps/` and register it in
 * `data/maps/catalog.ts` to make it pickable from the Mission Editor's Map
 * section and usable in real Missions/gameplay.
 *
 * Reuses the same `EditorBoard` (real flat-top rendering, terrain art,
 * zoom/pan) the Mission Editor already built, and the same "Field Manual"
 * visual system (`.editor__*` classes in `styles.css`) for a consistent
 * look — this tool has no design handoff of its own (none existed for
 * terrain authoring), so it was built to match that established style.
 */
import { useMemo, useState } from 'react';
import { useMapEditorStore } from '../../state/mapEditorStore';
import type { MapPaintTool, ElevationLevel } from '../../state/mapEditorStore';
import { MAP_CATALOG } from '../../data/maps/catalog';
import { TERRAIN } from '../../data/terrainTypes';
import { TERRAIN_ART_VARIANTS } from '../../data/terrainArtVariants';
import { TERRAIN_FILL } from '../theme';
import { EditorBoard } from '../editor/EditorBoard';
import { downloadMapSource } from '../../data/editor/emitMapSource';
import type { TerrainId } from '../../engine/types';

const TERRAIN_TOOLS: TerrainId[] = Object.keys(TERRAIN) as TerrainId[];
const ELEVATIONS: ElevationLevel[] = [0, 1, 2];

function Swatch({ terrain }: { terrain: TerrainId }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        marginRight: '0.4rem',
        verticalAlign: 'middle',
        background: TERRAIN_FILL[terrain],
        border: '1px solid #11150f',
      }}
    />
  );
}

function ArtSwatch({ url }: { url: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 18,
        height: 18,
        marginRight: '0.4rem',
        verticalAlign: 'middle',
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '1px solid #11150f',
      }}
    />
  );
}

function toolsEqual(a: MapPaintTool, b: MapPaintTool): boolean {
  if (typeof a === 'object' && typeof b === 'object') return a.variant === b.variant;
  return a === b;
}

export function MapEditor({ onExit }: { onExit: () => void }) {
  const mapName = useMapEditorStore((s) => s.mapName);
  const mapNumber = useMapEditorStore((s) => s.mapNumber);
  const hexes = useMapEditorStore((s) => s.hexes);
  const tool = useMapEditorStore((s) => s.tool);
  const elevationValue = useMapEditorStore((s) => s.elevationValue);
  const loadedFromId = useMapEditorStore((s) => s.loadedFromId);
  const setMapName = useMapEditorStore((s) => s.setMapName);
  const setMapNumber = useMapEditorStore((s) => s.setMapNumber);
  const setTool = useMapEditorStore((s) => s.setTool);
  const setElevationValue = useMapEditorStore((s) => s.setElevationValue);
  const paintHex = useMapEditorStore((s) => s.paintHex);
  const newBlankMap = useMapEditorStore((s) => s.newBlankMap);
  const loadMap = useMapEditorStore((s) => s.loadMap);
  const overlayUrl = useMapEditorStore((s) => s.overlayUrl);
  const overlayVisible = useMapEditorStore((s) => s.overlayVisible);
  const setOverlayUrl = useMapEditorStore((s) => s.setOverlayUrl);
  const toggleOverlayVisible = useMapEditorStore((s) => s.toggleOverlayVisible);

  const handleOverlayFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setOverlayUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const [loadPick, setLoadPick] = useState(Object.keys(MAP_CATALOG)[0] ?? '');

  const placedTerrainCount = useMemo(
    () => hexes.filter((h) => h.terrain !== 'open' || !!h.art || h.road || (h.elevation ?? 0) !== 0).length,
    [hexes],
  );

  const activeToolLabel =
    typeof tool === 'object'
      ? (TERRAIN_ART_VARIANTS.find((v) => v.key === tool.variant)?.label ?? tool.variant)
      : tool === 'roadFlag'
        ? 'Road (network)'
        : tool === 'elevation'
          ? 'Elevation'
          : tool === 'clear'
            ? 'Clear / Erase'
            : TERRAIN[tool].name;

  return (
    <div className="editor">
      <aside className="editor__sidebar">
        <div className="editor__brand">MAP EDITOR</div>
        <div className="editor__mission-title">
          {mapName || 'Untitled Map'} — Map #{mapNumber}
        </div>
        <div className="editor__draft-caption">
          {loadedFromId ? `[ editing "${loadedFromId}" // unsaved ]` : '[ new map // unsaved ]'}
        </div>

        <div className="editor__section" style={{ padding: '0 0.9rem' }}>
          <label className="editor__field-label">
            Map Name
            <input type="text" value={mapName} onChange={(e) => setMapName(e.target.value)} />
          </label>
          <label className="editor__field-label">
            Map # (§1.0 — the board-corner number)
            <input
              type="number"
              min={1}
              value={mapNumber}
              onChange={(e) => setMapNumber(parseInt(e.target.value, 10) || 1)}
            />
          </label>

          <button
            className="editor__toggle"
            onClick={() => {
              if (window.confirm('Start a new blank map? This discards the current unsaved terrain.')) newBlankMap();
            }}
          >
            + New Blank Map
          </button>

          <label className="editor__field-label" style={{ marginTop: '0.8rem' }}>
            Load Existing Map
            <select value={loadPick} onChange={(e) => setLoadPick(e.target.value)}>
              {Object.values(MAP_CATALOG).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="editor__toggle"
            disabled={!loadPick}
            onClick={() => {
              if (window.confirm('Load this map for editing? This discards the current unsaved terrain.')) loadMap(loadPick);
            }}
          >
            Load for Editing
          </button>

          <label className="editor__field-label" style={{ marginTop: '0.8rem' }}>
            Overlay Image (real gameplay art — exported with the map)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleOverlayFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <em className="editor__caption">
            Stretched to fill the whole board and clipped to its hex silhouette, so any resolution
            works — but match the board's real playable aspect ratio, ~1.30:1 (e.g. ~1600×1232px
            or ~1300×1000px), to avoid losing any edge of your image. Export Map downloads this as a
            real, separate image file alongside the .ts source (not embedded) — see the exported
            file's header comment for where to save it.
          </em>
          {overlayUrl && (
            <div className="editor__toggle-row">
              <button
                className={`editor__toggle${overlayVisible ? ' editor__toggle--active' : ''}`}
                onClick={toggleOverlayVisible}
              >
                {overlayVisible ? 'Hide Overlay' : 'Show Overlay'}
              </button>
              <button className="editor__toggle" onClick={() => setOverlayUrl(null)}>
                Remove Overlay
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <button className="editor__exit" onClick={onExit}>
          ← Exit Editor
        </button>
      </aside>
      <main className="editor__main">
        <div className="editor__topbar">
          <span className="editor__topbar-label">// TERRAIN AUTHORING — TOOL: {activeToolLabel.toUpperCase()}</span>
          <button className="editor__export" onClick={() => downloadMapSource({ mapName, mapNumber, hexes, overlayUrl })}>
            Export Map
          </button>
        </div>
        <div className="editor__content">
          <div className="editor__section">
            <em className="editor__caption">
              Terrain, the Road network flag, and Elevation are independent per-hex properties — e.g. a Road may run
              through Heavy Woods, or a hex may be both Elevation 2 and Water. Obstacles and Fortifications are painted
              in the Mission Editor's own Map section, on top of a map picked from here.
            </em>
            <div className="editor__map-body">
              <div className="editor__map-board">
                <EditorBoard
                  hexes={hexes}
                  onHexClick={paintHex}
                  overlay={overlayUrl && overlayVisible ? { url: overlayUrl } : null}
                />
              </div>
              <div className="editor__map-tools">
                <h3>Terrain</h3>
                <div className="editor__tool-group">
                  {TERRAIN_TOOLS.map((t) => (
                    <button
                      key={t}
                      className={`editor__tool-btn${tool === t ? ' editor__tool-btn--active' : ''}`}
                      onClick={() => setTool(t as MapPaintTool)}
                    >
                      <Swatch terrain={t} />
                      {TERRAIN[t].name}
                    </button>
                  ))}
                </div>

                <h3>Terrain Art Variants</h3>
                <em className="editor__caption">
                  Decorative flavor on top of the terrain above — e.g. "Wheat" paints real{' '}
                  <strong>Plowed Field</strong> terrain with a wheat-field tile instead of the generic one. Picking a
                  variant sets both the mechanical terrain and the art in one click.
                </em>
                <div className="editor__tool-group">
                  {TERRAIN_ART_VARIANTS.map((v) => (
                    <button
                      key={v.key}
                      className={`editor__tool-btn${toolsEqual(tool, { variant: v.key }) ? ' editor__tool-btn--active' : ''}`}
                      onClick={() => setTool({ variant: v.key })}
                    >
                      <ArtSwatch url={v.url} />
                      {v.label}
                    </button>
                  ))}
                </div>

                <h3>Other</h3>
                <div className="editor__tool-group">
                  <button
                    className={`editor__tool-btn${tool === 'roadFlag' ? ' editor__tool-btn--active' : ''}`}
                    onClick={() => setTool('roadFlag')}
                  >
                    Road (network) — toggle
                  </button>
                  <button
                    className={`editor__tool-btn${tool === 'elevation' ? ' editor__tool-btn--active' : ''}`}
                    onClick={() => setTool('elevation')}
                  >
                    Elevation
                  </button>
                  <button
                    className={`editor__tool-btn${tool === 'clear' ? ' editor__tool-btn--active' : ''}`}
                    onClick={() => setTool('clear')}
                  >
                    Clear / Erase
                  </button>
                </div>

                {tool === 'elevation' && (
                  <div className="editor__toggle-row">
                    {ELEVATIONS.map((lvl) => (
                      <button
                        key={lvl}
                        className={`editor__toggle${elevationValue === lvl ? ' editor__toggle--active' : ''}`}
                        onClick={() => setElevationValue(lvl)}
                      >
                        L{lvl}
                      </button>
                    ))}
                  </div>
                )}

                <h3>Painted ({placedTerrainCount})</h3>
                <em className="editor__caption">
                  Hexes with any non-default terrain, a Road, or Elevation ≠ 0. Click a hex on the board with a tool
                  selected above to paint it.
                </em>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
