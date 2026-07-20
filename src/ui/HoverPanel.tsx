/**
 * Right-sidebar "under cursor" panel (replaces the floating tooltip): the
 * terrain of the hovered hex with its rules, and the units in that hex rendered
 * just like the board, at the same full size (click one to select it).
 */
import type { CSSProperties } from 'react';
import { templateOf } from '../engine';
import type { GameState, Hex, Unit } from '../engine/types';
import { TERRAIN } from '../data/terrainTypes';
import { artForHex } from '../data/hexArt';
import { useGame } from '../state/store';
import { UnitCounter } from './UnitCounter';
import { HEX_SIZE } from './hexgeo';

const OBSTACLE_NAMES: Record<string, string> = {
  barbedWire: 'Barbed Wire',
  mines: 'Mines',
  roadBlock: 'Road Block',
};

const FORTIFICATION_NAMES: Record<string, string> = {
  trench: 'Trench',
  bunker: 'Bunker',
};

/**
 * The rulebook's own "(Map #)-(Column Letter & Row #)" address (§1.0, e.g.
 * "1-E05") as "Map 1, E05" — falls back to the raw internal hex id for
 * hand-authored maps that predate the flat-top substrate (the non-canonical
 * sandboxes), which never got `label`/`mapNumber` set.
 */
function hexDisplayLabel(hex: Hex): string {
  if (hex.label && hex.mapNumber != null) return `Map ${hex.mapNumber}, ${hex.label}`;
  if (hex.boardNumber != null) return `Map ${hex.boardNumber}`; // the board-number cell itself, no coordinate
  return hex.id;
}

// 1.5x board scale — this is an inspector view, not a board tile. Cells are
// flex items with this as their `flex-basis` and `flex-wrap: nowrap` (see
// .hover-units__row in styles.css): 1-2 units render at this literal size,
// and flexbox's own shrink algorithm only kicks in once a 3rd would actually
// overflow the row, shrinking all three just enough to still fit.
const MINI_SIZE = HEX_SIZE * 1.5;
const MINI_BOX = MINI_SIZE * 2.2;

/** Splits units into rows of at most `size` — a 5-Unit stack is 3+2 rows, a 9-Unit stack is 3+3+3. */
function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

function MiniCounter({ game, unit }: { game: GameState; unit: Unit }) {
  const select = useGame((s) => s.select);
  return (
    <svg
      viewBox={`0 0 ${MINI_BOX} ${MINI_BOX}`}
      style={{ cursor: 'pointer', width: '100%', aspectRatio: '1 / 1', display: 'block' }}
    >
      <UnitCounter
        game={game}
        unit={unit}
        center={{ x: MINI_BOX / 2, y: MINI_BOX / 2 }}
        size={MINI_SIZE}
        selected={false}
        ignoreFacing
        onClick={() => select(unit.id)}
      />
    </svg>
  );
}

export function HoverPanel() {
  const game = useGame((s) => s.game);
  const hover = useGame((s) => s.hover);
  if (!game) return null;

  const hex = hover ? game.hexes[hover.id] : undefined;
  // §11 Hidden Units: same concealment predicate as Board.tsx's own
  // `unitsByHex` filter — a hidden enemy Unit must not leak through this
  // panel either, since it renders the same information (art, stats).
  const activeSide = game.phase === 'setup' ? game.setupSide : game.currentSide;
  const units = hover
    ? Object.values(game.units).filter((u) => u.hexId === hover.id && (!u.hidden || u.side === activeSide))
    : [];
  const t = hex ? TERRAIN[hex.terrain] : null;
  const art = hex ? artForHex(hex) : null;

  return (
    <div className="panel">
      <h3>Terrain in Hex</h3>
      {!hex || !t ? (
        <p className="dim">Hover a hex to inspect terrain and units.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div className="stats-grid" style={{ flex: 1 }}>
              <span>Hex</span>
              <b>{hexDisplayLabel(hex)}</b>
              <span>Elevation</span>
              <b>{hex.elevation === 2 ? 'L2 Hill ▲▲' : hex.elevation === 1 ? 'L1 Hill ▲' : 'L0 Ground'}</b>
              <span>Terrain</span>
              <b>{t.name}</b>
              <span>Move into</span>
              <b>+{t.apCost} AP</b>
              <span>Defensive mod</span>
              <b>
                {t.dm >= 0 ? '+' : ''}
                {t.dm} DM
              </b>
              <span>Blocks LOS</span>
              <b>{t.blocksLOS ? 'Yes' : 'No'}</b>
              <span>Cover terrain</span>
              <b>{t.isCover ? 'Yes' : 'No'}</b>
              {hex.features.smoke && (
                <>
                  <span>Smoke (§14)</span>
                  <b>{hex.features.smoke === 2 ? 'Heavy (+2DR / −2AR, blocks LOS)' : 'Light (+1DR / −1AR)'}</b>
                </>
              )}
              {hex.features.obstacle && (
                <>
                  <span>Obstacle (§17)</span>
                  <b>
                    {OBSTACLE_NAMES[hex.features.obstacle.kind]}
                    {hex.features.obstacle.destroyed ? ' (destroyed)' : ''}
                    {hex.features.obstacle.kind === 'mines' && !hex.features.obstacle.destroyed
                      ? ` — Hit# ${hex.features.obstacle.hitNumber ?? 0}`
                      : ''}
                  </b>
                </>
              )}
              {hex.features.fortification && (
                <>
                  <span>Fortification (§17)</span>
                  <b>
                    {FORTIFICATION_NAMES[hex.features.fortification.kind]}
                    {hex.features.fortification.destroyed ? ' (destroyed)' : ''}
                    {hex.features.fortification.kind === 'bunker' && hex.features.fortification.facing != null
                      ? ` — faces ${hex.features.fortification.facing}`
                      : ''}
                  </b>
                  <span>Occupying</span>
                  <b>
                    {units.filter((u) => u.occupyingFortification).map((u) => u.id).join(', ') || 'none'}
                  </b>
                </>
              )}
            </div>
            {art && (
              <img
                src={art}
                alt={t.name}
                style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 'var(--radius, 4px)', flexShrink: 0 }}
              />
            )}
          </div>
          <div className="hover-units">
            <div className="hover-units__heading">Units in Hex: {units.length || 'none'}</div>
            {chunk(units, 3).map((row, i) => (
              <div
                key={i}
                className="hover-units__row"
                style={{ '--mini-box': `${MINI_BOX}px` } as CSSProperties}
              >
                {row.map((u) => (
                  <div key={u.id} className="hover-units__cell" title={`${u.id} · ${templateOf(game, u).name}`}>
                    <MiniCounter game={game} unit={u} />
                    <div className="hover-units__id">{u.id}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
