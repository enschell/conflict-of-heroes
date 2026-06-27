/** Per-side track sheet: CAP, VP, losses, and the activated unit / AP. */
import { useGame } from '../state/store';
import { NATIONS } from '../data/nations';
import type { SideId } from '../engine/types';

export function TrackSheet({ side }: { side: SideId }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const p = game.players[side];
  const active = game.currentSide === side;
  const names = p.nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  return (
    <div className={`track ${active ? 'track--active' : ''}`} data-side={side}>
      <div className="track__head">
        <span className="track__dot" data-side={side} />
        Side {side} · {names}
        {active && <span className="badge">turn</span>}
        {p.passed && <span className="badge badge--muted">passed</span>}
      </div>
      <div className="track__stats">
        <div>
          CAP <b>{p.capCurrent}</b>
          <span className="dim">/{p.capStart}</span>
        </div>
        <div>
          VP <b>{p.vp}</b>
        </div>
        <div>
          Losses <b>{p.unitLosses}</b>
        </div>
        <div>
          Active <b>{p.activatedUnitId ?? '—'}</b>
        </div>
      </div>
      {p.activatedUnitId && (
        <div className="track__ap">
          <span className="track__ap-num">{p.ap}</span>
          <span className="track__ap-label">/7 AP left · {p.activatedUnitId}</span>
        </div>
      )}
    </div>
  );
}
