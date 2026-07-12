/**
 * Presentational hex board for the Mission Editor — NOT a reuse of the live
 * `Board.tsx` (which is hardwired to ~15 Zustand selectors and a full
 * `GameState`; see the Mission Editor plan for why). Prop-driven, reuses the
 * same real flat-top geometry (`ui/hexgeo.ts`) and terrain palette
 * (`ui/theme.ts`) so it renders identically to the live board — no
 * placeholder grid.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildHex } from '../../engine';
import type { RotationCluster } from '../../engine';
import { EDGE_CORNERS, clipHexPolygon, hexCenter, hexCorners, playableBounds, pointsAttr, HEX_SIZE } from '../hexgeo';
import { HEX_STROKE, TERRAIN_FILL, WALL_STROKE } from '../theme';
import type { Facing, Hex, HexId, MapHexDef, TerrainId } from '../../engine/types';

/**
 * Terrain artwork for the editor's own board preview — a small, self-contained
 * mapping (not a reuse of `data/hexArt.ts`, which the LIVE game depends on and
 * has an existing `road: '.../road.png'` mismatch — that file doesn't exist on
 * disk, only `road.svg` does). `open.png` is the explicit default/fallback for
 * any terrain without a mapped asset, per the user's request.
 */
const DEFAULT_TERRAIN_ART = '/assets/terrain/open.png';
const EDITOR_TERRAIN_ART: Partial<Record<TerrainId, string>> = {
  open: '/assets/terrain/open.png',
  road: '/assets/terrain/road.svg',
  plowed: '/assets/terrain/plowed.svg',
  water: '/assets/terrain/water.svg',
  woodsLight: '/assets/terrain/lightwoodsv2.png',
  woodsHeavy: '/assets/terrain/woodsHeavyv2.png',
  buildingWood: '/assets/terrain/buildingWood.png',
  buildingStone: '/assets/terrain/buildingStone.png',
};
function artForTerrain(terrain: TerrainId): string {
  return EDITOR_TERRAIN_ART[terrain] ?? DEFAULT_TERRAIN_ART;
}
/** Same proportions Board.tsx's own terrain art uses (a flat-top hex's width). */
const ART_WIDTH = Math.sqrt(3) * HEX_SIZE;

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
  // Unique per mounted EditorBoard instance (several can render at once — the
  // Map section, a Reinforcements wave's mini-board, an Exit Zone card, ...) —
  // combined with each hex's own id below for a globally-unique clipPath id.
  const instanceId = useId();
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

  // Mouse-wheel zoom, centered on the cursor, 0.5x-4x — mirrors Board.tsx's
  // own proven implementation exactly (same StrictMode gotcha applies: never
  // call `setPan` from inside `setZoom`'s updater, since `<StrictMode>`
  // double-invokes it and would compound the pan math — read/write a plain
  // ref and call `setZoom`/`setPan` with already-computed values instead).
  const svgRef = useRef<SVGSVGElement>(null);
  const baseX = bounds.minX - HEX_SIZE * 0.4;
  const baseY = bounds.minY - HEX_SIZE * 0.4;
  const baseWidth = bounds.maxX - bounds.minX + HEX_SIZE * 0.8;
  const baseHeight = bounds.maxY - bounds.minY + HEX_SIZE * 0.8;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: baseX, y: baseY });
  const viewRef = useRef({ zoom, pan });
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const cursor = pt.matrixTransform(ctm.inverse());
      const { zoom: prevZoom, pan: prevPan } = viewRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
      if (nextZoom === prevZoom) return;
      const prevViewW = baseWidth / prevZoom;
      const prevViewH = baseHeight / prevZoom;
      const fracX = (cursor.x - prevPan.x) / prevViewW;
      const fracY = (cursor.y - prevPan.y) / prevViewH;
      const nextViewW = baseWidth / nextZoom;
      const nextViewH = baseHeight / nextZoom;
      const nextPan = { x: cursor.x - fracX * nextViewW, y: cursor.y - fracY * nextViewH };
      setZoom(nextZoom);
      setPan(nextPan);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [baseWidth, baseHeight]);
  viewRef.current = { zoom, pan };

  const viewBox = `${pan.x} ${pan.y} ${baseWidth / zoom} ${baseHeight / zoom}`;

  const renderHex = (hex: Hex, counterRotate?: number) => {
    const { center, corners, pts } = computeHexGeometry(hex);
    const highlighted = highlightedHexIds?.has(hex.id);
    const hexMarkers = markersByHex.get(hex.id) ?? [];
    const art = artForTerrain(hex.terrain);
    const clipId = `${instanceId}-terrain-clip-${hex.id}`;
    return (
      <g key={hex.id}>
        <polygon points={pts} fill={TERRAIN_FILL[hex.terrain]} stroke={HEX_STROKE} strokeWidth={1} />
        <defs>
          <clipPath id={clipId}>
            <polygon points={pointsAttr(corners.map((p) => ({ x: p.x - center.x, y: p.y - center.y })))} />
          </clipPath>
        </defs>
        <g transform={`translate(${center.x},${center.y})`} clipPath={`url(#${clipId})`}>
          <image
            href={art}
            x={-ART_WIDTH / 2}
            y={-HEX_SIZE}
            width={ART_WIDTH}
            height={2 * HEX_SIZE}
            preserveAspectRatio="xMidYMid slice"
            pointerEvents="none"
          />
        </g>
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
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '70vh' }}>
      <g>{plainHexes.map((hex) => renderHex(hex))}</g>
      {[...byCluster.entries()].map(([key, { rotation, pivot, hexes: clusterHexes }]) => (
        <g key={key} transform={`rotate(${rotation} ${pivot.x} ${pivot.y})`}>
          {clusterHexes.map((hex) => renderHex(hex, rotation))}
        </g>
      ))}
    </svg>
  );
}

/**
 * Every screen that shows a board built from `assembledMap()` needs the same
 * "the multi-board config is invalid right now" handling — an empty canvas
 * with no explanation reads as a rendering bug, not a setting to fix (this
 * exact confusion happened live: a missing/mismatched `attachTo` produced a
 * blank board that looked like the terrain-image feature had broken). This
 * wrapper shows a large, impossible-to-miss message in the board's own space
 * instead of silently rendering nothing.
 */
export function EditorBoardOrError({
  error,
  ...boardProps
}: EditorBoardProps & { error: string | null }) {
  if (error) {
    return (
      <div className="editor__map-error">
        <div className="editor__map-error__inner">
          <div className="editor__map-error__title">⚠ Map configuration invalid — nothing to show</div>
          <div className="editor__map-error__detail">{error}</div>
        </div>
      </div>
    );
  }
  return <EditorBoard {...boardProps} />;
}
