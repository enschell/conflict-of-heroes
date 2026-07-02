/**
 * Per-side panel: pending reinforcement waves (§4.12) — the units in each
 * wave (graphical badge + name), when/where they may enter, and — once
 * eligible on your Turn — either an "Enter now" button that auto-spreads the
 * whole wave onto the Map as a single Group Action, or a per-Unit "Place"
 * button that arms manual placement: the board highlights that Unit's legal
 * entry Hexes and a click there commits a single-Unit ENTER.
 */
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';
import type { SideId } from '../engine/types';
import { code } from './UnitCounter';

export function ReinforcementsPanel({ side }: { side: SideId }) {
  const game = useGame((s) => s.game);
  const enterWave = useGame((s) => s.enterWave);
  const startPlaceReinforcement = useGame((s) => s.startPlaceReinforcement);
  const cancelPlaceReinforcement = useGame((s) => s.cancelPlaceReinforcement);
  const placingReinforcementId = useGame((s) => s.placingReinforcementId);
  if (!game) return null;

  const pending = game.reinforcements.filter((r) => r.side === side);
  if (pending.length === 0) return null; // nothing left to show once every wave has arrived

  const waveIds = [...new Set(pending.map((r) => r.waveId))];
  const yourTurn = game.currentSide === side;

  return (
    <div className="panel reinforce">
      <h3>Reinforcements</h3>
      {waveIds.map((waveId) => {
        const units = pending.filter((r) => r.waveId === waveId);
        const first = units[0]!;
        const eligible = game.round >= first.earliestRound;
        return (
          <div key={waveId} className={`reinforce__wave ${eligible ? 'is-eligible' : ''}`}>
            <div className="reinforce__cond">
              <span className={`badge ${eligible ? 'badge--adv' : 'badge--muted'}`}>
                {eligible ? 'Available' : `Round ${first.earliestRound}`}
              </span>
              <span className="dim"> enters at {first.entryDescription}</span>
            </div>
            <div className="reinforce__units">
              {units.map((r) => {
                const name = game.templates[r.templateId]?.name ?? r.templateId;
                const placingThis = placingReinforcementId === r.id;
                return (
                  <div key={r.id} className="reinforce__unit" title={name}>
                    <span className="reinforce__badge" style={{ background: NATIONS[r.nation]?.color }}>
                      {code(name)}
                    </span>
                    <span className="reinforce__name">{name}</span>
                    {eligible && yourTurn && !placingThis && (
                      <button className="reinforce__place" onClick={() => startPlaceReinforcement(r.id)}>
                        Place
                      </button>
                    )}
                    {placingThis && (
                      <button className="reinforce__place is-active" onClick={() => cancelPlaceReinforcement()}>
                        Click a hex… Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {eligible && yourTurn && (
              <button className="reinforce__enter" onClick={() => enterWave(waveId)}>
                Enter now (§4.12)
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
