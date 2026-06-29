/**
 * A unit counter drawn on the SVG board: nation-colored square showing fire
 * cost / move cost / firepower / defense, a facing arrow, fresh-vs-spent
 * shading, hit-marker badge, and a selection ring.
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import { effectiveStats, templateOf } from '../engine';
import type { GameState, Unit } from '../engine/types';
import { NATIONS } from '../data/nations';
import { SIDE_COLOR } from './theme';
import { facingVector, type Pt } from './hexgeo';

function code(name: string): string {
  const n = name.toUpperCase();
  if (n.startsWith('RIFLE')) return 'RIF';
  if (n.startsWith('SMG')) return 'SMG';
  if (n.startsWith('LMG')) return 'LMG';
  if (n.startsWith('HMG')) return 'HMG';
  if (n.startsWith('PIONEER')) return 'PIO';
  if (n.startsWith('MAXIM')) return 'MMG';
  if (n.startsWith('PARTISAN')) return 'PAR';
  return n.slice(0, 3);
}

interface Props {
  game: GameState;
  unit: Unit;
  center: Pt;
  size: number;
  selected: boolean;
  /** True if this unit holds its side's Stress Marker (amber outline, §2.6). */
  stressed?: boolean;
  onClick: (e: ReactMouseEvent) => void;
}

export function UnitCounter({ game, unit, center, size, selected, stressed = false, onClick }: Props) {
  const tmpl = templateOf(game, unit);
  const eff = effectiveStats(game, unit);
  const s = size * 1.42; // counter side
  const half = s / 2;
  const x = center.x - half;
  const y = center.y - half;
  const fill = NATIONS[unit.nation]?.color ?? '#555';
  const accent = SIDE_COLOR[unit.side];
  const spent = unit.status === 'spent';
  const hit = unit.hitMarkers[0];

  // Facing arrow
  const fv = facingVector(unit.facing);
  const perp = { x: -fv.y, y: fv.x };
  const tip: Pt = { x: center.x + fv.x * half * 1.18, y: center.y + fv.y * half * 1.18 };
  const b1: Pt = { x: center.x + fv.x * half * 0.72 + perp.x * 5, y: center.y + fv.y * half * 0.72 + perp.y * 5 };
  const b2: Pt = { x: center.x + fv.x * half * 0.72 - perp.x * 5, y: center.y + fv.y * half * 0.72 - perp.y * 5 };

  const fs = size * 0.27;
  const pad = size * 0.12;

  return (
    <g className="counter" onClick={onClick} style={{ cursor: 'pointer' }} opacity={spent ? 0.55 : 1}>
      <polygon
        points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
        fill={accent}
        stroke="#000"
        strokeWidth={0.5}
      />
      <rect
        x={x}
        y={y}
        width={s}
        height={s}
        rx={size * 0.14}
        fill={fill}
        stroke={selected ? '#ffd24a' : accent}
        strokeWidth={selected ? 3 : 1.5}
      />
      {stressed && (
        <rect
          x={x - 3}
          y={y - 3}
          width={s + 6}
          height={s + 6}
          rx={size * 0.18}
          fill="none"
          stroke="#ff8c00"
          strokeWidth={3}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
      {spent && (
        <line x1={x} y1={y + s} x2={x + s} y2={y} stroke="#0008" strokeWidth={2} />
      )}
      {/* fire cost (top-left), move cost (top-right) */}
      <text x={x + pad} y={y + fs + pad * 0.4} fontSize={fs} fill="#0e0e0e" fontWeight={700}>
        {eff.apToFire}
      </text>
      <text x={x + s - pad} y={y + fs + pad * 0.4} fontSize={fs} fill="#e9e9e9" textAnchor="end">
        {tmpl.move}
      </text>
      {/* unit code (centre) */}
      <text
        x={center.x}
        y={center.y + fs * 0.35}
        fontSize={fs * 1.08}
        fill="#fff"
        fontWeight={700}
        textAnchor="middle"
      >
        {code(tmpl.name)}
      </text>
      {/* firepower (bottom-left, red), defense (bottom-right, colored) */}
      <text x={x + pad} y={y + s - pad * 0.6} fontSize={fs} fill="#ff7b7b" fontWeight={700}>
        {eff.fp.red}
      </text>
      <text
        x={x + s - pad}
        y={y + s - pad * 0.6}
        fontSize={fs}
        fill={eff.dr.color === 'blue' ? '#7bb6ff' : '#ff9d6e'}
        fontWeight={700}
        textAnchor="end"
      >
        {eff.dr.front}
      </text>
      {hit && (
        <g>
          <rect x={center.x - fs * 1.1} y={y - fs * 0.5} width={fs * 2.2} height={fs} rx={2} fill="#b91c1c" />
          <text
            x={center.x}
            y={y + fs * 0.32}
            fontSize={fs * 0.8}
            fill="#fff"
            fontWeight={700}
            textAnchor="middle"
          >
            {hit.slice(0, 4).toUpperCase()}
          </text>
        </g>
      )}
    </g>
  );
}
