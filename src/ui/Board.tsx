/**
 * The SVG hex board — the real visual model (flat-top hexagons, per
 * docs/hex_board_spec/README.md). Renders per-hex artwork clipped into the
 * hexagon, terrain/roads/walls/objectives, board-edge half/quarter-hexes and
 * coordinate labels/board numbers, the selected unit's legal move/fire
 * highlights, the LOS overlay (hold Shift to see LOS from the hovered hex),
 * and all unit counters (stacked units fanned out). Hovering a targetable
 * enemy shows a fire-odds popup; Ctrl+click a stacked hex opens a unit
 * picker. Clicks/hover route through the store.
 */
import { useEffect, useRef, useState } from 'react';
import { attackContext, directionTo, distance, effectiveStats, fortificationAt, legalActionsForUnit, legalEntryHexes, moveCost, neighbor, neighbors, parseHexId, idOf, planVehicleMove, templateOf, visibleHexesFrom } from '../engine';
import type { Action, Facing, FortificationKind, Unit } from '../engine/types';
import { useGame } from '../state/store';
import { artForHex } from '../data/hexArt';
import { fireOdds, isHopelessShot, pct } from './odds';
import {
  EDGE_CORNERS,
  HEX_SIZE,
  clipHexPolygon,
  computeLayout,
  fringeHexes,
  hexCenter,
  hexCorners,
  playableBounds,
  pointsAttr,
  polygonCentroid,
  polygonTopY,
} from './hexgeo';
import { HEX_STROKE, ROAD_STROKE, TERRAIN_FILL, WALL_STROKE } from './theme';
import { UnitCounter } from './UnitCounter';
import { UnitPicker } from './UnitPicker';

export function Board() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const groupSel = useGame((s) => s.groupSel);
  const groupMoveQueue = useGame((s) => s.groupMoveQueue);
  const movePath = useGame((s) => s.movePath);
  const placingReinforcementQueue = useGame((s) => s.placingReinforcementQueue);
  const placingReinforcementFacing = useGame((s) => s.placingReinforcementFacing);
  const placingReinforcementDone = useGame((s) => s.placingReinforcementDone);
  const losMode = useGame((s) => s.losMode);
  const losSource = useGame((s) => s.losSource);
  const shiftHeld = useGame((s) => s.shiftHeld);
  const pivotPicker = useGame((s) => s.pivotPicker);
  const hover = useGame((s) => s.hover);
  const picker = useGame((s) => s.picker);
  const setHover = useGame((s) => s.setHover);
  const hexClick = useGame((s) => s.hexClick);
  const closePicker = useGame((s) => s.closePicker);

  // Mouse-wheel zoom, centered on the cursor. `zoom`/`pan` directly drive the
  // <svg>'s own `viewBox` below (zoom=1, pan={0,0} is exactly today's fixed
  // viewBox — a no-op for anyone who never scrolls). A plain `onWheel` JSX
  // prop can't reliably `preventDefault()` (React attaches wheel listeners
  // as passive by default), so this attaches a real, non-passive native
  // listener once via a ref instead. `viewRef`/`layoutRef` carry the latest
  // zoom/pan/layout-size into that stable listener without needing to
  // reattach it every render (and without calling `setPan` *from inside*
  // `setZoom`'s updater function, which — with `<StrictMode>`, main.tsx —
  // gets double-invoked to catch exactly this kind of impurity; caught live:
  // the double-invoke compounded the pan math and the point under the
  // cursor visibly drifted instead of staying put. Reading/writing plain
  // refs and calling `setZoom`/`setPan` with already-computed values instead
  // of updater functions sidesteps that entirely).
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const layoutRef = useRef({ width: 0, height: 0 });
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
      // Cursor position in the CURRENT viewBox's user-space coordinates —
      // this is the point that must stay fixed under the cursor.
      const cursor = pt.matrixTransform(ctm.inverse());
      const { zoom: prevZoom, pan: prevPan } = viewRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15; // scroll up = zoom in
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
      if (nextZoom === prevZoom) return;
      const { width, height } = layoutRef.current;
      const prevViewW = width / prevZoom;
      const prevViewH = height / prevZoom;
      const fracX = (cursor.x - prevPan.x) / prevViewW;
      const fracY = (cursor.y - prevPan.y) / prevViewH;
      const nextViewW = width / nextZoom;
      const nextViewH = height / nextZoom;
      const nextPan = { x: cursor.x - fracX * nextViewW, y: cursor.y - fracY * nextViewH };
      setZoom(nextZoom);
      setPan(nextPan);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  if (!game) return null;

  // Non-playable edge hexes, drawn (clipped) as the board's half-hex border.
  const fringe = fringeHexes(game);
  const layout = computeLayout(game, HEX_SIZE, HEX_SIZE * 0.7, fringe);
  layoutRef.current = { width: layout.width, height: layout.height };
  viewRef.current = { zoom, pan };
  const bounds = playableBounds(game, HEX_SIZE); // clip edge for the fringe
  const clipPoints = pointsAttr(hexCorners({ x: 0, y: 0 }));
  const artW = Math.sqrt(3) * HEX_SIZE;

  // Hold Shift → LOS from the hovered hex; else the pinned LOS-mode source.
  const losActive = shiftHeld && hover ? hover.id : losMode ? losSource : null;

  // Selected unit's legal move/fire highlights (hidden while showing LOS).
  const moveTargets = new Set<string>();
  const fireTargets = new Set<string>();
  // Mortar Indirect Attack (§13.2) / Fire Smoke (§14.1) target Hexes.
  const indirectFireTargets = new Set<string>();
  const smokeTargets = new Set<string>();
  // Load (§15.7) / Unload (§15.9) hexes — highlighted alongside Move so a
  // player can see where clicking will load onto or unload from a Vehicle.
  const transportTargets = new Set<string>();
  if (!losActive && selectedUnitId && game.units[selectedUnitId]) {
    for (const a of legalActionsForUnit(game, selectedUnitId)) {
      if (a.type === 'MOVE') moveTargets.add(a.toHexId);
      if (a.type === 'FIRE') {
        const t = game.units[a.targetId];
        if (t) fireTargets.add(t.hexId);
      }
      if (a.type === 'INDIRECT_FIRE') indirectFireTargets.add(a.targetHexId);
      if (a.type === 'FIRE_SMOKE') smokeTargets.add(a.targetHexId);
      if (a.type === 'LOAD') {
        const v = game.units[a.vehicleId];
        if (v) transportTargets.add(v.hexId);
      }
      // Unload hexes render green like Move (the carried Unit has no MOVE
      // actions of its own, so this is the only "where can I go" highlight it
      // gets) — clicking one asks for confirmation rather than unloading
      // silently (store.ts's hexClick).
      if (a.type === 'UNLOAD') moveTargets.add(a.toHexId);
    }
  }

  // General Group Move (§10.2/§10.3): the front-of-queue member's own legal
  // destination Hexes, highlighted the same green as a normal single-Unit
  // Move — reuses `moveTargets` directly rather than a parallel Set, so the
  // rendering below needs no changes at all.
  if (!losActive && groupMoveQueue.length > 0) {
    const activeUnit = game.units[groupMoveQueue[0]!];
    if (activeUnit) {
      for (const n of neighbors(parseHexId(activeUnit.hexId))) {
        const nid = idOf(n);
        if (game.hexes[nid] && moveCost(game, activeUnit, nid).ap != null) moveTargets.add(nid);
      }
    }
  }

  // Vehicle Bonus-Move path (§15.2): the chosen steps + the legal next steps.
  const pathSet = new Set(movePath);
  const nextSteps = new Set<string>();
  if (!losActive && selectedUnitId && game.units[selectedUnitId]) {
    const sel = game.units[selectedUnitId]!;
    if (templateOf(game, sel).kind === 'vehicle') {
      const from = movePath.length ? movePath[movePath.length - 1]! : sel.hexId;
      for (const n of neighbors(parseHexId(from))) {
        const nid = idOf(n);
        if (!game.hexes[nid] || pathSet.has(nid)) continue;
        if (planVehicleMove(game, sel, [...movePath, nid]).ap != null) nextSteps.add(nid);
      }
    }
  }

  // Manual/Group reinforcement placement (§4.12): the front-of-queue Unit's
  // legal entry Hexes (hidden once it has a Hex and is awaiting a facing —
  // the facing highlight below takes over at that point).
  const entryTargets = new Set<string>();
  if (!placingReinforcementFacing && placingReinforcementQueue.length > 0) {
    const r = game.reinforcements.find((x) => x.id === placingReinforcementQueue[0]);
    if (r) {
      // §4.12 Group entry: once at least one Unit has a Hex, only offer
      // Hexes connected to what's already placed — the reducer's own
      // `hexesConnected` check would reject anything else, so restrict the
      // picker up front rather than letting the player pick a scattered Hex
      // and only find out it's illegal after choosing a facing too.
      const alreadyPlaced = placingReinforcementDone.map((d) => d.hexId);
      for (const h of legalEntryHexes(game, r)) {
        if (
          alreadyPlaced.length === 0 ||
          alreadyPlaced.some((p) => p === h || distance(parseHexId(p), parseHexId(h)) <= 1)
        ) {
          entryTargets.add(h);
        }
      }
    }
  }
  // While a just-placed reinforcement Unit awaits its facing choice, keep its
  // chosen Hex highlighted the same purple — clicking it again keeps the
  // wave's default facing (store.ts's hexClick).
  if (placingReinforcementFacing) entryTargets.add(placingReinforcementFacing.hexId);

  // Free facing correction (§4.5/§15.11): the six neighbor Hexes of a Unit
  // awaiting CHOOSE_FACING, clickable to face that direction (the arrow-button
  // picker in Inspector.tsx still works too — this is an additional way in).
  // Also reused for the Pivot picker (P key, §4.6): same blue highlight, but
  // clicking issues a real (AP-costed) PIVOT instead — see store.ts's
  // `hexClick`, which branches on `pivotPicker` independently of this render.
  // And reused a third time for a reinforcement Unit awaiting its placement
  // facing (`placingReinforcementFacing`) — no live Unit exists yet for that
  // one, so this works off a bare Hex id rather than a Unit.
  const facingTargets = new Set<string>();
  const facingChoiceUnit =
    selectedUnitId && game.pendingFacingChoices?.includes(selectedUnitId) ? game.units[selectedUnitId] : null;
  const pivotPickerUnit = pivotPicker && selectedUnitId ? game.units[selectedUnitId] : null;
  // General Group Move (§10.2/§10.3): the front-of-queue member's own Hex
  // gets the same floating label as the pickers above, but NOT the blue
  // neighbor overlay — its legal destinations are already the ordinary green
  // moveTargets highlight (added below), so a second blue overlay on the
  // same hexes would just look muddy.
  const activeGroupMoveUnit = groupMoveQueue.length > 0 ? (game.units[groupMoveQueue[0]!] ?? null) : null;
  const facingHighlightHex: string | null =
    placingReinforcementFacing?.hexId ??
    facingChoiceUnit?.hexId ??
    pivotPickerUnit?.hexId ??
    activeGroupMoveUnit?.hexId ??
    null;
  const facingHighlightLabel = placingReinforcementFacing
    ? 'Choose facing (or click here for default)'
    : facingChoiceUnit
      ? 'Choose facing'
      : pivotPickerUnit
        ? 'Pivot (P)'
        : 'Move Group member (or click here to leave in place)';
  if (facingHighlightHex && !activeGroupMoveUnit) {
    for (const n of neighbors(parseHexId(facingHighlightHex))) {
      const nid = idOf(n);
      if (game.hexes[nid]) facingTargets.add(nid);
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
  type OddsRow = { targetId: string; ar: number; dr: number; hitNumber: number; flank: boolean; hit: number; crit: number; hopeless: boolean };
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
      const o = fireOdds(ctx.ar, ctx.dr);
      rows.push({
        targetId: enemy.id,
        ar: ctx.ar,
        dr: ctx.dr,
        hitNumber: ctx.hitNumber,
        flank: ctx.isFlank,
        hit: o.hit,
        crit: o.crit,
        // §3.2: even a full 2-CAP dice mod can't ever exceed a natural 12, so
        // this is a genuinely impossible shot, not just an unlikely one.
        hopeless: isHopelessShot(ctx.hitNumber),
      });
    }
    return rows.length ? { x: hover.x, y: hover.y, targets: rows } : null;
  })();

  // Move-cost popup when hovering a legal Move-target hex with a unit selected
  // (§4.7/§12.2): itemizes every AP modifier, not just the total. Independent
  // of the fire-odds popup above — both can render at once for the same hex.
  const moveCostPopup: {
    x: number;
    y: number;
    hexId: string;
    knownAp: number;
    hasRandom: boolean;
    mods: { label: string; value: number; random?: boolean }[];
    willStripHastyDefense: boolean;
    /** §17.3: this is the occupy-from-within case (hovering the Unit's own
     *  Hex), not a real Move — the popup should say "Occupy X", not "Move to X". */
    occupyKind?: FortificationKind;
  } | null = (() => {
    if (!hover || !selectedUnitId || !game.units[selectedUnitId] || !moveTargets.has(hover.id)) return null;
    const sel = game.units[selectedUnitId]!;
    if (sel.side !== game.currentSide) return null;

    // §17.3 (2nd paragraph): hovering the Unit's own Hex is the occupy-from-
    // within Move — `moveCost()` only understands adjacent Hexes (it returns
    // null, "not adjacent", for this case), so read the AP cost from the
    // engine's own legal-action list instead of calling it.
    // §2.6: Stress adds +1AP to the next Action Cost — `moveCost()` (and the
    // occupy-from-within branch below) only compute the Move's own terrain/
    // backwards/wall/elevation component; Stress is folded in later by the
    // reducer's `planCost`, so the popup has to add it itself or it silently
    // under-reports the real cost for a Stressed Unit.
    const stressMod: { label: string; value: number; random?: boolean; section: string }[] = sel.stressed
      ? [{ label: 'Stress', value: 1, section: '§2.6' }]
      : [];

    if (hover.id === sel.hexId) {
      const occupyAct = legalActionsForUnit(game, sel.id).find(
        (a): a is Extract<Action, { type: 'MOVE' }> =>
          a.type === 'MOVE' && a.toHexId === sel.hexId && a.occupyFortification === true,
      );
      if (!occupyAct) return null;
      const fort = fortificationAt(game.hexes[hover.id]!);
      const occMods = [{ label: 'Move', value: effectiveStats(game, sel).move, section: '§4.5' }, ...stressMod];
      return {
        x: hover.x,
        y: hover.y,
        hexId: hover.id,
        knownAp: occMods.reduce((n, m) => n + m.value, 0),
        hasRandom: false,
        mods: occMods,
        willStripHastyDefense: false,
        occupyKind: fort?.kind,
      };
    }

    const cost = moveCost(game, sel, hover.id);
    if (cost.ap == null) return null;
    const mods = [...(cost.mods ?? []), ...stressMod];
    // §17.8 Barbed Wire's 1d6 is deterministic from the seeded RNG (so `cost.ap`
    // is already the real, exact number), but the popup deliberately hides it
    // until the move actually executes — same "don't spoil the roll" principle
    // as the dice-roller showing "?" before a click (CLAUDE.md §7).
    const hasRandom = mods.some((m) => m.random);
    const knownAp = mods.filter((m) => !m.random).reduce((n, m) => n + m.value, 0);
    // §17.6: Moving always strips this Unit's own Hasty Defense — warn before
    // the click, since the marker's +1DR is easy to forget about mid-game.
    return { x: hover.x, y: hover.y, hexId: hover.id, knownAp, hasRandom, mods, willStripHastyDefense: !!sel.hastyDefense };
  })();

  // Illegal-move popup: hovering an adjacent Hex the selected Unit CANNOT
  // move into shows why, citing the same rule `moveCost`/`planVehicleMove`
  // already denied it for — rather than the hex just doing nothing.
  const moveIllegalPopup: { x: number; y: number; hexId: string; reason: string } | null = (() => {
    if (!hover || !selectedUnitId || !game.units[selectedUnitId] || moveTargets.has(hover.id)) return null;
    const sel = game.units[selectedUnitId]!;
    if (sel.side !== game.currentSide || sel.carriedBy) return null;
    if (directionTo(sel.hexId, hover.id) < 0) return null; // only adjacent Hexes are a real "why not"
    const cost = moveCost(game, sel, hover.id);
    if (cost.ap != null || !cost.reason) return null;
    return { x: hover.x, y: hover.y, hexId: hover.id, reason: cost.reason };
  })();

  return (
    <>
      <svg
        ref={svgRef}
        className="board"
        viewBox={`${pan.x} ${pan.y} ${layout.width / zoom} ${layout.height / zoom}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="hexclip">
            <polygon points={clipPoints} />
          </clipPath>
          {/* Cuts the fringe hexes at the playable board edge → half-hexes. */}
          <clipPath id="boardclip">
            <rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.maxX - bounds.minX}
              height={bounds.maxY - bounds.minY}
            />
          </clipPath>
        </defs>
        <g transform={`translate(${layout.offset.x},${layout.offset.y})`}>
          {/* Edge half-hexes (non-playable), clipped to the board rectangle. */}
          <g clipPath="url(#boardclip)" pointerEvents="none">
            {fringe.map((id) => {
              const pts = pointsAttr(hexCorners(hexCenter(id)));
              return (
                <polygon
                  key={`fr-${id}`}
                  className="hex-fringe"
                  points={pts}
                  fill={TERRAIN_FILL.open}
                  stroke={HEX_STROKE}
                  strokeWidth={1}
                  opacity={0.45}
                />
              );
            })}
          </g>
          {ids.map((id) => {
            const hex = game.hexes[id]!;
            const c = hexCenter(id);
            // Board-edge half/quarter-hexes (docs/hex_board_spec/README.md
            // §Straight-edge clip) — clipped once here, every highlight/
            // outline/click-target overlay below reuses these same `pts` so
            // none of them spill past the hex's actual rendered shape.
            const corners = hexCorners(c);
            const clipped = hex.edgeCut ? clipHexPolygon(corners, c, hex.edgeCut) : corners;
            const pts = pointsAttr(clipped);
            const art = artForHex(hex);
            const losDim = visible ? !visible.has(id) && id !== losActive : false;
            const artClipId = hex.edgeCut ? `hexclip-${id}` : 'hexclip';
            return (
              <g key={id}>
                {hex.edgeCut && (
                  <defs>
                    <clipPath id={artClipId}>
                      <polygon points={pointsAttr(clipped.map((p) => ({ x: p.x - c.x, y: p.y - c.y })))} />
                    </clipPath>
                  </defs>
                )}
                <polygon points={pts} fill={TERRAIN_FILL[hex.terrain]} />
                {art && (
                  <g transform={`translate(${c.x},${c.y})`} clipPath={`url(#${artClipId})`}>
                    <image href={art} x={-artW / 2} y={-HEX_SIZE} width={artW} height={2 * HEX_SIZE} preserveAspectRatio="xMidYMid slice" />
                  </g>
                )}
                {/* Coordinate label (small, top-centered) or board number (large,
                    accent) — §Labeling. Rendered on top of art/terrain, below
                    the interactive overlays that follow. */}
                {hex.boardNumber != null ? (
                  <text
                    x={polygonCentroid(clipped).x}
                    y={polygonCentroid(clipped).y}
                    fontSize={HEX_SIZE * 0.75}
                    fontWeight={700}
                    fill="#b0442c"
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    {hex.boardNumber}
                  </text>
                ) : (
                  hex.label && (
                    <text
                      x={polygonCentroid(clipped).x}
                      y={polygonTopY(clipped) + HEX_SIZE * 0.2}
                      fontSize={HEX_SIZE * 0.22}
                      fill={HEX_STROKE}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {hex.label}
                    </text>
                  )
                )}
                {/* Smoke (§14): Heavy is denser/whiter than Light, both block/haze the hex. */}
                {hex.features.smoke === 2 && (
                  <polygon points={pts} fill="#e8ecef" opacity={0.72} pointerEvents="none" />
                )}
                {hex.features.smoke === 1 && (
                  <polygon points={pts} fill="#e8ecef" opacity={0.4} pointerEvents="none" />
                )}
                {losDim && <polygon points={pts} fill="#0b0d08" opacity={0.62} />}
                {visible?.has(id) && <polygon points={pts} fill="#7CFC8C" opacity={0.18} />}
                {nextSteps.size === 0 && moveTargets.has(id) && <polygon points={pts} fill="#5ad17a" opacity={0.28} stroke="#5ad17a" strokeWidth={2} />}
                {nextSteps.has(id) && <polygon points={pts} fill="#5ad17a" opacity={0.2} stroke="#5ad17a" strokeWidth={2} strokeDasharray="4 3" />}
                {transportTargets.has(id) && <polygon points={pts} fill="none" stroke="#e0a83a" strokeWidth={3} strokeDasharray="2 3" />}
                {facingTargets.has(id) && <polygon points={pts} fill="#3a8ee0" opacity={0.32} stroke="#3a8ee0" strokeWidth={2} />}
                {entryTargets.has(id) && <polygon points={pts} fill="#c77dff" opacity={0.3} stroke="#c77dff" strokeWidth={2} strokeDasharray="4 3" />}
                {pathSet.has(id) && (
                  <>
                    <polygon points={pts} fill="#4aa3ff" opacity={0.32} stroke="#4aa3ff" strokeWidth={2} />
                    <text x={c.x} y={c.y} fontSize={HEX_SIZE * 0.5} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight={700} pointerEvents="none">
                      {movePath.indexOf(id) + 1}
                    </text>
                  </>
                )}
                {(fireTargets.has(id) || indirectFireTargets.has(id) || smokeTargets.has(id)) && (
                  <polygon points={pts} fill="none" stroke="#ff5a5a" strokeWidth={3} />
                )}
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

          {/* Elevation (§12.1): a small ▲/▲▲ glyph per Hill Hex so Steep drop-offs are legible. */}
          {ids.map((id) => {
            const hex = game.hexes[id]!;
            if (!hex.elevation) return null;
            const c = hexCenter(id);
            return (
              <text
                key={`elev-${id}`}
                x={c.x}
                y={c.y - HEX_SIZE * 0.62}
                fontSize={HEX_SIZE * 0.32}
                fill="#5a4322"
                textAnchor="middle"
                fontWeight={700}
                pointerEvents="none"
              >
                {hex.elevation === 2 ? '▲▲' : '▲'}
              </text>
            );
          })}

          {/* Obstacles (§17.7): a short label per Hex — Mines are NOT hidden in
              this build (locked decision, mirrors the Hidden Units deferral —
              a hotseat render-layer hide would be trivially defeated). */}
          {ids.map((id) => {
            const obstacle = game.hexes[id]?.features.obstacle;
            if (!obstacle) return null;
            const c = hexCenter(id);
            const label = obstacle.kind === 'barbedWire' ? 'WIRE' : obstacle.kind === 'mines' ? 'MINES' : 'BLOCK';
            return (
              <text
                key={`obstacle-${id}`}
                x={c.x}
                y={c.y + HEX_SIZE * 0.68}
                fontSize={HEX_SIZE * 0.24}
                fill={obstacle.destroyed ? '#888' : '#b23a3a'}
                textAnchor="middle"
                fontWeight={700}
                textDecoration={obstacle.destroyed ? 'line-through' : undefined}
                pointerEvents="none"
              >
                {label}
              </text>
            );
          })}

          {/* Fortifications (§17.1): Trenches/Bunkers, same label styling as
              Obstacles above but blue rather than red. Hasty Defense markers
              are per-Unit, not a Hex feature — rendered on the counter itself. */}
          {ids.map((id) => {
            const fort = game.hexes[id]?.features.fortification;
            if (!fort) return null;
            const c = hexCenter(id);
            const label = fort.kind === 'trench' ? 'TRENCH' : 'BUNKER';
            return (
              <text
                key={`fort-${id}`}
                x={c.x}
                y={c.y + HEX_SIZE * 0.68}
                fontSize={HEX_SIZE * 0.24}
                fill={fort.destroyed ? '#888' : '#3a6ab2'}
                textAnchor="middle"
                fontWeight={700}
                textDecoration={fort.destroyed ? 'line-through' : undefined}
                pointerEvents="none"
              >
                {label}
              </text>
            );
          })}

          {/* §17.5 Bunker Arc of Fire: highlight the 3 frontal hexsides (facing
              ±1) a Bunker occupant may fire out of / be attacked "within Arc"
              through, so it's visible at a glance without hovering/selecting. */}
          {ids.map((id) => {
            const fort = game.hexes[id]?.features.fortification;
            if (!fort || fort.kind !== 'bunker' || fort.destroyed || fort.facing == null) return null;
            const corners = hexCorners(hexCenter(id));
            const arcDirs = [((fort.facing + 5) % 6) as Facing, fort.facing, ((fort.facing + 1) % 6) as Facing];
            return arcDirs.map((dir) => {
              const [i, j] = EDGE_CORNERS[dir]!;
              const p1 = corners[i]!;
              const p2 = corners[j]!;
              return (
                <line
                  key={`bunker-arc-${id}-${dir}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#4fd1e8"
                  strokeWidth={5}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              );
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
                    inGroup={groupSel.includes(u.id)}
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

          {/* Rendered last so it's always above every Hex fill and Unit counter. */}
          {facingHighlightHex && (
            <g pointerEvents="none">
              {(() => {
                const c = hexCenter(facingHighlightHex);
                // Width scales with the label text so longer variants (e.g.
                // the Group Move one) don't get clipped — same ratio the
                // original two-case hardcoded 2.6/4.6 split already implied.
                const w = HEX_SIZE * Math.max(2.6, facingHighlightLabel.length * 0.11);
                const h = HEX_SIZE * 0.6;
                const ty = c.y - HEX_SIZE * 1.55;
                return (
                  <>
                    <rect
                      x={c.x - w / 2}
                      y={ty - h / 2}
                      width={w}
                      height={h}
                      rx={h / 3}
                      fill="#3a8ee0"
                      stroke="#0b0d08"
                      strokeWidth={1}
                    />
                    <text
                      x={c.x}
                      y={ty}
                      fontSize={HEX_SIZE * 0.32}
                      fill="#fff"
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {facingHighlightLabel}
                    </text>
                  </>
                );
              })()}
            </g>
          )}
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
              {t.hopeless ? (
                <div className="fire-odds__big fire-odds__hopeless">Cannot hit — even with CAP (§3.2)</div>
              ) : (
                <>
                  <div className="fire-odds__big">{pct(t.hit)}% to hit</div>
                  <div className="dim">incl. {pct(t.crit)}% critical (instant kill)</div>
                </>
              )}
              <div className="fire-odds__detail">
                AR {t.ar} vs DR {t.dr} — 2d6 ≥ {t.hitNumber}
                {t.flank ? ' (flank)' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {moveCostPopup && (
        <div
          className="move-cost"
          style={{ left: moveCostPopup.x + 16, top: moveCostPopup.y - 16, transform: 'translateY(-100%)' }}
        >
          <div className="move-cost__head">
            {moveCostPopup.occupyKind
              ? `Occupy ${moveCostPopup.occupyKind === 'trench' ? 'Trench' : 'Bunker'} (§17.3)`
              : `Move to ${moveCostPopup.hexId}`}{' '}
            — {moveCostPopup.knownAp} AP{moveCostPopup.hasRandom ? ' + ?' : ''}
          </div>
          {moveCostPopup.mods.map((m, i) => (
            <div key={i} className="move-cost__row">
              <span>{m.label}</span>
              <span>
                {m.random ? '?' : `${m.value >= 0 ? '+' : ''}${m.value}`}
              </span>
            </div>
          ))}
          {moveCostPopup.willStripHastyDefense && (
            <div className="move-cost__row move-cost__warning">
              ⚠ Moving will remove this Unit's Hasty Defense (§17.6)
            </div>
          )}
        </div>
      )}

      {moveIllegalPopup && (
        <div
          className="move-illegal"
          style={{ left: moveIllegalPopup.x + 16, top: moveIllegalPopup.y - 16, transform: 'translateY(-100%)' }}
        >
          <div className="move-illegal__head">Cannot move to {moveIllegalPopup.hexId}</div>
          <div className="move-illegal__reason">{moveIllegalPopup.reason}</div>
        </div>
      )}

      {picker && (
        <UnitPicker game={game} hexId={picker.hexId} unitIds={picker.unitIds} x={picker.x} y={picker.y} onClose={closePicker} />
      )}
    </>
  );
}
