/**
 * Presentational hex board for the Mission Editor — NOT a reuse of the live
 * `Board.tsx` (which is hardwired to ~15 Zustand selectors and a full
 * `GameState`; see the Mission Editor plan for why). Prop-driven, reuses the
 * same real flat-top geometry (`ui/hexgeo.ts`) and terrain palette
 * (`ui/theme.ts`) so it renders identically to the live board — no
 * placeholder grid.
 */
import { useMemo } from 'react';
import { buildHex } from '../../engine';
import type { RotationCluster } from '../../engine';
import { EDGE_CORNERS, clipHexPolygon, hexCenter, hexCorners, playableBounds, pointsAttr, HEX_SIZE } from '../hexgeo';
import { HEX_STROKE, TERRAIN_FILL, WALL_STROKE } from '../theme';
import type { Facing, Hex, HexId, MapHexDef } from '../../engine/types';

export interface EditorMarker {
  hexId: HexId;
  /** A namespaced kind (e.g. 'unit', 'obstacle:mines', 'fortification:bunker') — lets a future
   *  image-backed counter be registered for one specific kind without touching this component. */
  kind: string;
  label: string;
  color: string;
  facing?: Facing;
}

export type MarkerRenderer = (m: EditorMarker, ctx: { cx: number; cy: number; size: number }) => React.ReactNode;

/** Plain colored-circle-and-label badge — today's rendering for every marker kind. */
const renderBadge: MarkerRenderer = (m, { cx, cy, size }) => (
  <g key={`${m.kind}-${m.hexId}-${m.label}`} pointerEvents="none">
    <circle cx={cx} cy={cy - size * 0.15} r={size * 0.42} fill={m.color} stroke="#11150f" strokeWidth={1.5} />
    <text
      x={cx}
      y={cy - size * 0.15}
      fontSize={size * 0.28}
      fill="#0b0d08"
      textAnchor="middle"
      dominantBaseline="central"
      fontWeight={700}
    >
      {m.label}
    </text>
  </g>
);

/**
 * Per-kind marker renderer lookup, keyed by `EditorMarker.kind` (falls back to
 * `renderBadge`). Obstacles/fortifications are expected to get their own
 * image-backed counter later (the same `counterImage` idea `UnitCounter.tsx`
 * uses for units) — when that happens, register it here under its specific
 * `'obstacle:<kind>'`/`'fortification:<kind>'` key instead of changing the
 * render loop below.
 */
const MARKER_RENDERERS: Partial<Record<string, MarkerRenderer>> = {};

function rendererFor(kind: string): MarkerRenderer {
  return MARKER_RENDERERS[kind] ?? renderBadge;
}

export interface EditorBoardProps {
  hexes: MapHexDef[];
  markers?: EditorMarker[];
  highlightedHexIds?: ReadonlySet<HexId>;
  onHexClick?: (hexId: HexId) => void;
  /**
   * §C multi-board rotation: any {90°,-90°}-family cluster from
   * `engine/boardAssembly.ts`'s `rotationClusters()`. {0°,180°} boards need no
   * entry here at all — their axial transform already renders correctly with
   * zero extra pixel work (see that module's header comment). A cluster's
   * hexes are wrapped in one shared `<g transform="rotate(...)">` around the
   * cluster's own center, with labels counter-rotated to stay upright —
   * mirroring `docs/hex_board_spec/Hex Map.dc.html`'s own technique.
   */
  rotationClusters?: RotationCluster[];
}

/** A hex's screen center, corner polygon, and everything needed to render it once. */
function computeHexGeometry(hex: Hex) {
  const center = hexCenter(hex.id);
  const corners = clipHexPolygon(hexCorners(center), center, hex.edgeCut);
  return { center, corners, pts: pointsAttr(corners) };
}

export function EditorBoard({ hexes, markers = [], highlightedHexIds, onHexClick, rotationClusters = [] }: EditorBoardProps) {
  const hexMap = useMemo(() => {
    const m: Record<HexId, Hex> = {};
    for (const h of hexes) m[h.id] = buildHex(h);
    return m;
  }, [hexes]);

  const pseudoState = useMemo(() => ({ hexes: hexMap }), [hexMap]);
  const bounds = useMemo(() => playableBounds(pseudoState, HEX_SIZE), [pseudoState]);

  const markersByHex = useMemo(() => {
    const m = new Map<HexId, EditorMarker[]>();
    for (const mk of markers) {
      const list = m.get(mk.hexId) ?? [];
      list.push(mk);
      m.set(mk.hexId, list);
    }
    return m;
  }, [markers]);

  // Which cluster (if any) each hex belongs to, and that cluster's own pivot
  // (the average screen center of its member hexes) — computed once per
  // `rotationClusters`/`hexMap` change, not per render.
  const clusterOfHex = useMemo(() => {
    const m = new Map<HexId, { rotation: 90 | -90; pivot: { x: number; y: number } }>();
    for (const cluster of rotationClusters) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const id of cluster.hexIds) {
        const h = hexMap[id];
        if (!h) continue;
        const c = hexCenter(h.id);
        sx += c.x;
        sy += c.y;
        n++;
      }
      if (n === 0) continue;
      const pivot = { x: sx / n, y: sy / n };
      for (const id of cluster.hexIds) m.set(id, { rotation: cluster.rotation, pivot });
    }
    return m;
  }, [rotationClusters, hexMap]);

  const viewBox = `${bounds.minX - HEX_SIZE * 0.4} ${bounds.minY - HEX_SIZE * 0.4} ${
    bounds.maxX - bounds.minX + HEX_SIZE * 0.8
  } ${bounds.maxY - bounds.minY + HEX_SIZE * 0.8}`;

  const renderHex = (hex: Hex, counterRotate?: number) => {
    const { center, corners, pts } = computeHexGeometry(hex);
    const highlighted = highlightedHexIds?.has(hex.id);
    const hexMarkers = markersByHex.get(hex.id) ?? [];
    return (
      <g key={hex.id}>
        <polygon points={pts} fill={TERRAIN_FILL[hex.terrain]} stroke={HEX_STROKE} strokeWidth={1} />
        {hex.road && <circle cx={center.x} cy={center.y} r={HEX_SIZE * 0.06} fill="#9c8456" pointerEvents="none" />}
        {hex.walls.map(
          (has, i) =>
            has && (
              <line
                key={i}
                x1={corners[EDGE_CORNERS[i]![0]]?.x ?? center.x}
                y1={corners[EDGE_CORNERS[i]![0]]?.y ?? center.y}
                x2={corners[EDGE_CORNERS[i]![1]]?.x ?? center.x}
                y2={corners[EDGE_CORNERS[i]![1]]?.y ?? center.y}
                stroke={WALL_STROKE}
                strokeWidth={3}
                pointerEvents="none"
              />
            ),
        )}
        {highlighted && <polygon points={pts} fill="#c9a04a" opacity={0.35} pointerEvents="none" />}
        {hex.label && (
          <text
            x={center.x}
            y={center.y + HEX_SIZE * 0.55}
            fontSize={HEX_SIZE * 0.22}
            fill="#c7c2a5"
            textAnchor="middle"
            pointerEvents="none"
            transform={counterRotate ? `rotate(${-counterRotate} ${center.x} ${center.y})` : undefined}
          >
            {hex.label}
          </text>
        )}
        {hexMarkers.map((m) => rendererFor(m.kind)(m, { cx: center.x, cy: center.y, size: HEX_SIZE }))}
        <polygon
          points={pts}
          fill="transparent"
          onClick={() => onHexClick?.(hex.id)}
          style={{ cursor: onHexClick ? 'pointer' : 'default' }}
        />
      </g>
    );
  };

  const plainHexes: Hex[] = [];
  const byCluster = new Map<string, { rotation: 90 | -90; pivot: { x: number; y: number }; hexes: Hex[] }>();
  for (const hex of Object.values(hexMap)) {
    const c = clusterOfHex.get(hex.id);
    if (!c) {
      plainHexes.push(hex);
      continue;
    }
    const key = `${c.rotation}@${c.pivot.x},${c.pivot.y}`;
    const bucket = byCluster.get(key) ?? { rotation: c.rotation, pivot: c.pivot, hexes: [] };
    bucket.hexes.push(hex);
    byCluster.set(key, bucket);
  }

  return (
    <svg viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '70vh' }}>
      <g>{plainHexes.map((hex) => renderHex(hex))}</g>
      {[...byCluster.entries()].map(([key, { rotation, pivot, hexes: clusterHexes }]) => (
        <g key={key} transform={`rotate(${rotation} ${pivot.x} ${pivot.y})`}>
          {clusterHexes.map((hex) => renderHex(hex, rotation))}
        </g>
      ))}
    </svg>
  );
}
