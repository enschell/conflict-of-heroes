/** Per-side track sheet: CAP, VP, losses, and Fresh/Stressed unit counts. */
import { vpLeader, vpMargin } from '../engine';
import { useGame } from '../state/store';
import { NATIONS } from '../data/nations';
import type { SideId } from '../engine/types';

export function TrackSheet({ side }: { side: SideId }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const p = game.players[side];
  const active = game.currentSide === side;
  const hasVpAdvantage = vpLeader(game) === side;
  const names = p.nations.map((n) => NATIONS[n]?.name ?? n).join(', ');
  const sideUnits = Object.values(game.units).filter((u) => u.side === side);
  const freshCount = sideUnits.filter((u) => u.status === 'fresh').length;
  const stressedUnit = sideUnits.find((u) => u.stressed);

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
          {hasVpAdvantage && <span className="badge badge--adv">+{vpMargin(game)} adv</span>}
        </div>
        <div>
          Losses <b>{p.unitLosses}</b>
        </div>
        <div>
          Fresh <b>{freshCount}</b>
          <span className="dim">/{sideUnits.length}</span>
        </div>
      </div>
      {stressedUnit && (
        <div className="track__ap">
          <span className="track__ap-label">Stressed: {stressedUnit.id} (+1AP next Turn)</span>
        </div>
      )}
    </div>
  );
}
