/**
 * The SVG hex board — the real visual model (true pointy-top hexagons). Renders
 * per-hex artwork clipped into the hexagon, terrain/roads/walls/objectives, the
 * selected unit's legal move/fire highlights, the LOS overlay (hold Shift to see
 * LOS from the hovered hex), and all unit counters (stacked units fanned out).
 * Hovering a targetable enemy shows a fire-odds popup; Ctrl+click a stacked hex
 * opens a unit picker. Clicks/hover route through the store.
 */
import { attackContext, legalActionsForUnit, neighbor, parseHexId, idOf, visibleHexesFrom } from '../engine';
import type { Facing, Unit } from '../engine/types';
import { useGame } from '../state/store';
import { artForHex } from '../data/hexArt';
import { fireOdds, pct } from './odds';
import {
  EDGE_CORNERS,
  HEX_SIZE,
  computeLayout,
  hexCenter,
  hexCorners,
  pointsAttr,
} from './hexgeo';
import { HEX_STROKE, ROAD_STROKE, TERRAIN_FILL, WALL_STROKE } from './theme';
import { UnitCounter } from './UnitCounter';
import { UnitPicker } from './UnitPicker';

export function Board() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const losMode = useGame((s) => s.losMode);
  const losSource = useGame((s) => s.losSource);
  const shiftHeld = useGame((s) => s.shiftHeld);
  const hover = useGame((s) => s.hover);
  const picker = useGame((s) => s.picker);
  const setHover = useGame((s) => s.setHover);
  const hexClick = useGame((s) => s.hexClick);
  const closePicker = useGame((s) => s.closePicker);

  if (!game) return null;

  const layout = computeLayout(game, HEX_SIZE);
  const clipPoints = pointsAttr(hexCorners({ x: 0, y: 0 }));
  const artW = Math.sqrt(3) * HEX_SIZE;

  // Hold Shift → LOS from the hovered hex; else the pinned LOS-mode source.
  const losActive = shiftHeld && hover ? hover.id : losMode ? losSource : null;

  // Selected unit's legal move/fire highlights (hidden while showing LOS).
  const moveTargets = new Set<string>();
  const fireTargets = new Set<string>();
  if (!losActive && selectedUnitId && game.units[selectedUnitId]) {
    for (const a of legalActionsForUnit(game, selectedUnitId)) {
      if (a.type === 'MOVE') moveTargets.add(a.toHexId);
      if (a.type === 'FIRE') {
        const t = game.units[a.targetId];
        if (t) fireTargets.add(t.hexId);
      }
    }
  }

  let visible: Set<string> | null = null;
  if (losActive && game.hexes[losActive]) visible = new Set(visibleHexesFrom(game, losActive).visible);

  const objectives = new Map(game.victory.victoryHexes.map((v) => [v.hexId, v.vp]));
  const ids = Object.keys(game.hexes);

  const unitsByHex = new Map<string, Unit[]>();
  for (const u of Object.values(game.units)) {
    const arr = unitsByHex.get(u.hexId) ?? [];
    arr.push(u);
    unitsByHex.set(u.hexId, arr);
  }

  // Fire-odds popup when hovering a hex with a selected attacker. A shot resolves
  // the whole hex (§7.5.1), so show one row per targetable enemy (in the same
  // deterministic id order the engine rolls them).
  type OddsRow = { targetId: string; fp: number; dv: number; flank: boolean; hit: number; crit: number };
  const odds: { x: number; y: number; targets: OddsRow[] } | null = (() => {
    if (!hover || !selectedUnitId || !game.units[selectedUnitId]) return null;
    const sel = game.units[selectedUnitId]!;
    if (sel.side !== game.currentSide) return null;
    const enemies = (unitsByHex.get(hover.id) ?? [])
      .filter((u) => u.side !== game.currentSide)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rows: OddsRow[] = [];
    for (const enemy of enemies) {
      const ctx = attackContext(game, sel, enemy);
      if (!ctx.legal) continue;
      const o = fireOdds(ctx.baseFP, ctx.defenseValue);
      rows.push({ targetId: enemy.id, fp: ctx.baseFP, dv: ctx.defenseValue, flank: ctx.isFlank, hit: o.hit, crit: o.crit });
    }
    return rows.length ? { x: hover.x, y: hover.y, targets: rows } : null;
  })();

  return (
    <>
      <svg
        className="board"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="hexclip">
            <polygon points={clipPoints} />
          </clipPath>
        </defs>
        <g transform={`translate(${layout.offset.x},${layout.offset.y})`}>
          {ids.map((id) => {
            const hex = game.hexes[id]!;
            const c = hexCenter(id);
            const pts = pointsAttr(hexCorners(c));
            const art = artForHex(hex);
            const losDim = visible ? !visible.has(id) && id !== losActive : false;
            return (
              <g key={id}>
                <polygon points={pts} fill={TERRAIN_FILL[hex.terrain]} />
                {art && (
                  <g transform={`translate(${c.x},${c.y})`} clipPath="url(#hexclip)">
                    <image href={art} x={-artW / 2} y={-HEX_SIZE} width={artW} height={2 * HEX_SIZE} preserveAspectRatio="xMidYMid slice" />
                  </g>
                )}
                {losDim && <polygon points={pts} fill="#0b0d08" opacity={0.62} />}
                {visible?.has(id) && <polygon points={pts} fill="#7CFC8C" opacity={0.18} />}
                {moveTargets.has(id) && <polygon points={pts} fill="#5ad17a" opacity={0.28} stroke="#5ad17a" strokeWidth={2} />}
                {fireTargets.has(id) && <polygon points={pts} fill="none" stroke="#ff5a5a" strokeWidth={3} />}
                {id === losActive && <polygon points={pts} fill="none" stroke="#ffd24a" strokeWidth={3} />}
                <polygon points={pts} fill="transparent" stroke={HEX_STROKE} strokeWidth={1} />
                <polygon
                  points={pts}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => hexClick(id, { ctrl: e.ctrlKey, x: e.clientX, y: e.clientY })}
                  onMouseEnter={(e) => setHover({ id, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover({ id, x: e.clientX, y: e.clientY })}
                />
              </g>
            );
          })}

          {ids.map((id) => {
            const hex = game.hexes[id]!;
            if (!hex.road) return null;
            const a = parseHexId(id);
            const c = hexCenter(id);
            return ([0, 1, 5] as Facing[]).map((dir) => {
              const nId = idOf(neighbor(a, dir));
              if (!game.hexes[nId]?.road) return null;
              const nc = hexCenter(nId);
              return <line key={`${id}-r${dir}`} x1={c.x} y1={c.y} x2={nc.x} y2={nc.y} stroke={ROAD_STROKE} strokeWidth={6} strokeLinecap="round" pointerEvents="none" />;
            });
          })}

          {ids.map((id) => {
            const hex = game.hexes[id]!;
            const corners = hexCorners(hexCenter(id));
            return hex.walls.map((has, dir) => {
              if (!has) return null;
              const [i, j] = EDGE_CORNERS[dir]!;
              const p1 = corners[i]!;
              const p2 = corners[j]!;
              return <line key={`${id}-w${dir}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={WALL_STROKE} strokeWidth={5} strokeLinecap="round" pointerEvents="none" />;
            });
          })}

          {[...objectives.entries()].map(([id, vp]) => {
            const c = hexCenter(id);
            const ctrl = game.hexes[id]?.features.control;
            const ring = ctrl === 'A' ? '#9fb0c4' : ctrl === 'B' ? '#e08a8a' : '#e9c46a';
            return (
              <g key={`obj-${id}`} pointerEvents="none">
                <circle cx={c.x} cy={c.y} r={HEX_SIZE * 0.82} fill="none" stroke={ring} strokeWidth={3} strokeDasharray="5 4" />
                <text x={c.x} y={c.y - HEX_SIZE * 0.52} fontSize={HEX_SIZE * 0.3} fill={ring} textAnchor="middle" fontWeight={700}>★{vp}</text>
              </g>
            );
          })}

          {[...unitsByHex.entries()].flatMap(([hexId, list]) => {
            const c = hexCenter(hexId);
            const n = list.length;
            const ordered = [...list].sort((a, b) => (a.id === selectedUnitId ? 1 : 0) - (b.id === selectedUnitId ? 1 : 0));
            const nodes = ordered.map((u) => {
              const k = list.indexOf(u);
              const off = n > 1 ? (k - (n - 1) / 2) * 10 : 0;
              return (
                <g key={u.id} onMouseMove={(e) => setHover({ id: u.hexId, x: e.clientX, y: e.clientY })}>
                  <UnitCounter
                    game={game}
                    unit={u}
                    center={{ x: c.x + off, y: c.y + off }}
                    size={HEX_SIZE}
                    selected={u.id === selectedUnitId}
                    stressed={u.stressed}
                    onClick={(e) => hexClick(u.hexId, { ctrl: e.ctrlKey, x: e.clientX, y: e.clientY })}
                  />
                </g>
              );
            });
            if (n > 1) {
              nodes.push(
                <g key={`${hexId}-stack`} pointerEvents="none">
                  <circle cx={c.x + HEX_SIZE * 0.7} cy={c.y - HEX_SIZE * 0.7} r={HEX_SIZE * 0.28} fill="#000a" />
                  <text x={c.x + HEX_SIZE * 0.7} y={c.y - HEX_SIZE * 0.62} fontSize={HEX_SIZE * 0.3} fill="#fff" textAnchor="middle" fontWeight={700}>×{n}</text>
                </g>,
              );
            }
            return nodes;
          })}
        </g>
      </svg>

      {odds && (
        <div className="fire-odds" style={{ left: odds.x + 16, top: odds.y + 16 }}>
          <div className="fire-odds__head">
            {odds.targets.length > 1
              ? `Fire at hex — ${odds.targets.length} units (one shot)`
              : `Fire at ${odds.targets[0]!.targetId}`}
          </div>
          {odds.targets.map((t) => (
            <div key={t.targetId} className="fire-odds__row">
              {odds.targets.length > 1 && <div className="fire-odds__who">{t.targetId}</div>}
              <div className="fire-odds__big">{pct(t.hit)}% to hit</div>
              <div className="dim">incl. {pct(t.crit)}% critical (instant kill)</div>
              <div className="fire-odds__detail">
                FP {t.fp} + 2d6 vs DV {t.dv}
                {t.flank ? ' (flank)' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {picker && (
        <UnitPicker game={game} hexId={picker.hexId} unitIds={picker.unitIds} x={picker.x} y={picker.y} onClose={closePicker} />
      )}
    </>
  );
}
