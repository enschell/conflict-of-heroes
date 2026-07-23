import { useMemo, useState } from 'react';
import { assembledMap, assembledMapOverlays, assembledRotationClusters, useEditorStore } from '../../../state/editorStore';
import type { EditorBoard as EditorBoardEntry, MapTool } from '../../../state/editorStore';
import { MAP_CATALOG, mapById } from '../../../data/maps/catalog';
import { SIDE_COLOR } from '../../theme';
import { EditorBoardOrError, type EditorMarker } from '../EditorBoard';
import { FACING_LABELS } from '../constants';
import type { Facing } from '../../../engine/types';
import type { BoardEdge, Rotation } from '../../../engine';

const TOOLS: { id: MapTool; label: string; obstacle?: boolean; fort?: boolean }[] = [
  { id: 'wire', label: 'Barbed Wire', obstacle: true },
  { id: 'mines', label: 'Mines', obstacle: true },
  { id: 'roadblock', label: 'Road Block', obstacle: true },
  { id: 'trench', label: 'Trench', fort: true },
  { id: 'bunker', label: 'Bunker', fort: true },
  { id: 'clear', label: 'Clear / Erase' },
];

const OBSTACLE_BADGE: Record<string, string> = { barbedWire: 'WIRE', mines: 'MINE', roadBlock: 'RDBLK' };
const FORT_BADGE: Record<string, string> = { trench: 'TRNCH', bunker: 'BNKR' };
const ROTATIONS: Rotation[] = [0, 90, -90, 180];
const EDGES: BoardEdge[] = ['N', 'S', 'E', 'W'];

function BoardRow({ board, isAnchor, otherBoards }: { board: EditorBoardEntry; isAnchor: boolean; otherBoards: EditorBoardEntry[] }) {
  const updateBoard = useEditorStore((s) => s.updateBoard);
  const removeBoard = useEditorStore((s) => s.removeBoard);

  return (
    <div className="editor__board-row">
      <select value={board.mapId} onChange={(e) => updateBoard(board.id, { mapId: e.target.value })}>
        {Object.values(MAP_CATALOG).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="editor__field-label editor__field-label--inline">
        Rotation
        <select
          value={board.rotation}
          onChange={(e) => updateBoard(board.id, { rotation: parseInt(e.target.value, 10) as Rotation })}
        >
          {ROTATIONS.map((r) => (
            <option key={r} value={r}>
              {r}°
            </option>
          ))}
        </select>
      </label>
      {!isAnchor && (
        <>
          <label className="editor__field-label editor__field-label--inline">
            Attach to
            <select
              value={board.attachTo?.boardId ?? ''}
              onChange={(e) =>
                updateBoard(board.id, {
                  attachTo: {
                    boardId: e.target.value,
                    localEdge: board.attachTo?.localEdge ?? 'W',
                    neighborLocalEdge: board.attachTo?.neighborLocalEdge ?? 'E',
                  },
                })
              }
            >
              <option value="">(choose a board)</option>
              {otherBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({MAP_CATALOG[b.mapId]?.name ?? b.mapId})
                </option>
              ))}
            </select>
          </label>
          <label className="editor__field-label editor__field-label--inline">
            This board's edge
            <select
              value={board.attachTo?.localEdge ?? 'W'}
              onChange={(e) =>
                updateBoard(board.id, {
                  attachTo: {
                    boardId: board.attachTo?.boardId ?? '',
                    localEdge: e.target.value as BoardEdge,
                    neighborLocalEdge: board.attachTo?.neighborLocalEdge ?? 'E',
                  },
                })
              }
            >
              {EDGES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="editor__field-label editor__field-label--inline">
            touches its edge
            <select
              value={board.attachTo?.neighborLocalEdge ?? 'E'}
              onChange={(e) =>
                updateBoard(board.id, {
                  attachTo: {
                    boardId: board.attachTo?.boardId ?? '',
                    localEdge: board.attachTo?.localEdge ?? 'W',
                    neighborLocalEdge: e.target.value as BoardEdge,
                  },
                })
              }
            >
              {EDGES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <button onClick={() => removeBoard(board.id)}>× Remove Board</button>
    </div>
  );
}

export function MapSection() {
  const map = useEditorStore((s) => s.map);
  const addBoard = useEditorStore((s) => s.addBoard);
  const setMapTool = useEditorStore((s) => s.setMapTool);
  const paintMapHex = useEditorStore((s) => s.paintMapHex);
  const removeObstacle = useEditorStore((s) => s.removeObstacle);
  const removeFortification = useEditorStore((s) => s.removeFortification);
  const [addMapId, setAddMapId] = useState(Object.keys(MAP_CATALOG)[0]!);

  const activeTool = TOOLS.find((t) => t.id === map.tool);
  const { hexes, error } = useMemo(() => assembledMap(map), [map]);
  const clusters = useMemo(() => assembledRotationClusters(map), [map]);
  const mapOverlays = useMemo(() => assembledMapOverlays(map), [map]);

  const markers = useMemo<EditorMarker[]>(() => {
    const list: EditorMarker[] = [];
    for (const [hexId, ob] of Object.entries(map.obstacles)) {
      list.push({ hexId, kind: `obstacle:${ob.kind}`, label: OBSTACLE_BADGE[ob.kind] ?? ob.kind, color: SIDE_COLOR[ob.side] });
    }
    for (const [hexId, ft] of Object.entries(map.fortifications)) {
      const label = FORT_BADGE[ft.kind] ?? ft.kind;
      list.push({
        hexId,
        kind: `fortification:${ft.kind}`,
        label: ft.kind === 'bunker' && ft.facing != null ? `${label} ${FACING_LABELS[ft.facing]}` : label,
        color: '#c9a04a',
      });
    }
    return list;
  }, [map.obstacles, map.fortifications]);

  const placedCount = Object.keys(map.obstacles).length + Object.keys(map.fortifications).length;

  return (
    <div className="editor__section editor__section--map">
      <h3>Boards ({map.boards.length})</h3>
      {map.boards.map((b, i) => (
        <BoardRow key={b.id} board={b} isAnchor={i === 0} otherBoards={map.boards.filter((x) => x.id !== b.id)} />
      ))}
      <div className="editor__board-row">
        <select value={addMapId} onChange={(e) => setAddMapId(e.target.value)}>
          {Object.values(MAP_CATALOG).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => addBoard(addMapId)} disabled={!mapById(addMapId)}>
          + Add Board
        </button>
      </div>
      <em className="editor__caption">
        Real boards — terrain painting is a separate, not-yet-built tool. Multiple boards may be independently
        rotated and abutted (§C); 0°/180° boards freely mix with each other, and 90°/-90° boards freely mix with
        each other, but a {'{0°,180°}'} board can never directly touch a {'{90°,-90°}'} board.
      </em>
      <div className="editor__map-body">
        <div className="editor__map-board">
          <EditorBoardOrError
            error={error}
            hexes={hexes}
            markers={markers}
            onHexClick={paintMapHex}
            rotationClusters={clusters}
            mapOverlays={mapOverlays}
          />
        </div>
        <div className="editor__map-tools">
          <div className="editor__tool-group">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`editor__tool-btn${map.tool === t.id ? ' editor__tool-btn--active' : ''}`}
                onClick={() => setMapTool({ tool: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          {activeTool?.obstacle && (
            <div className="editor__toggle-row">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  className={`editor__toggle${map.toolSide === side ? ' editor__toggle--active' : ''}`}
                  onClick={() => setMapTool({ toolSide: side })}
                >
                  Side {side}
                </button>
              ))}
            </div>
          )}
          {map.tool === 'mines' && (
            <label className="editor__field-label">
              Mines Hit Number (§17.10)
              <input
                type="number"
                value={map.minesHitNumber}
                onChange={(e) => setMapTool({ minesHitNumber: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
          )}
          {map.tool === 'bunker' && (
            <label className="editor__field-label">
              Bunker Facing
              <select
                value={map.bunkerFacing}
                onChange={(e) => setMapTool({ bunkerFacing: parseInt(e.target.value, 10) as Facing })}
              >
                {FACING_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h3>Placed ({placedCount})</h3>
          <ul className="editor__placed-list">
            {Object.entries(map.obstacles).map(([hexId, ob]) => (
              <li key={hexId}>
                {hexId} — {OBSTACLE_BADGE[ob.kind]} (Side {ob.side})
                {ob.kind === 'mines' ? `, Hit Number ${ob.hitNumber}` : ''}
                <button onClick={() => removeObstacle(hexId)}>×</button>
              </li>
            ))}
            {Object.entries(map.fortifications).map(([hexId, ft]) => (
              <li key={hexId}>
                {hexId} — {FORT_BADGE[ft.kind]}
                {ft.kind === 'bunker' && ft.facing != null ? ` facing ${FACING_LABELS[ft.facing]}` : ''}
                <button onClick={() => removeFortification(hexId)}>×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
