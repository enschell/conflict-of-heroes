/**
 * Popup to choose which unit to select in a hex — used both for Ctrl+click on a
 * stacked hex and for a normal click when several unspent friendly units share
 * the hex.
 */
import { templateOf } from '../engine';
import type { GameState, UnitId } from '../engine/types';
import { useGame } from '../state/store';

interface Props {
  game: GameState;
  hexId: string;
  unitIds: UnitId[];
  x: number;
  y: number;
  onClose: () => void;
}

export function UnitPicker({ game, hexId, unitIds, x, y, onClose }: Props) {
  const select = useGame((s) => s.select);
  const units = unitIds.map((id) => game.units[id]).filter((u): u is NonNullable<typeof u> => !!u);

  return (
    <div className="unit-picker" style={{ left: x, top: y }}>
      <div className="unit-picker__head">Units in {hexId}</div>
      {units.map((u) => (
        <button
          key={u.id}
          className="unit-picker__row"
          onClick={() => {
            select(u.id);
            onClose();
          }}
        >
          <span className="track__dot" data-side={u.side} />
          {u.id} · {templateOf(game, u).name}
          <span className="dim">
            {' '}
            ({u.side}, {u.status})
          </span>
        </button>
      ))}
      <button className="link" onClick={onClose}>
        cancel
      </button>
    </div>
  );
}
