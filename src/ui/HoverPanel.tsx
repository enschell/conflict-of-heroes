/**
 * Right-sidebar "under cursor" panel (replaces the floating tooltip): the
 * terrain of the hovered hex with its rules, and the units in that hex rendered
 * just like the board but at half size (click one to select it).
 */
import { templateOf } from '../engine';
import type { GameState, Unit } from '../engine/types';
import { TERRAIN } from '../data/terrainTypes';
import { artForHex } from '../data/hexArt';
import { useGame } from '../state/store';
import { UnitCounter } from './UnitCounter';

const OBSTACLE_NAMES: Record<string, string> = {
  barbedWire: 'Barbed Wire',
  mines: 'Mines',
  roadBlock: 'Road Block',
};

const FORTIFICATION_NAMES: Record<string, string> = {
  trench: 'Trench',
  bunker: 'Bunker',
};

function MiniCounter({ game, unit }: { game: GameState; unit: Unit }) {
  const select = useGame((s) => s.select);
  const size = 18; // half of HEX_SIZE (36)
  const box = size * 2.2;
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ cursor: 'pointer' }}>
      <UnitCounter
        game={game}
        unit={unit}
        center={{ x: box / 2, y: box / 2 }}
        size={size}
        selected={false}
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
  const units = hover ? Object.values(game.units).filter((u) => u.hexId === hover.id) : [];
  const t = hex ? TERRAIN[hex.terrain] : null;
  const art = hex ? artForHex(hex) : null;

  return (
    <div className="panel">
      <h3>Under cursor</h3>
      {!hex || !t ? (
        <p className="dim">Hover a hex to inspect terrain and units.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div className="stats-grid" style={{ flex: 1 }}>
              <span>Hex</span>
              <b>{hex.id}</b>
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
            <div className="dim">Units here: {units.length || 'none'}</div>
            <div className="hover-units__row">
              {units.map((u) => (
                <div key={u.id} className="hover-units__cell" title={`${u.id} · ${templateOf(game, u).name}`}>
                  <MiniCounter game={game} unit={u} />
                  <div className="hover-units__id">{u.id}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
