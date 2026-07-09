/**
 * Per-side panel: pending reinforcement waves (§4.12) — the units in each
 * wave (graphical badge + name), when/where they may enter, and — once
 * eligible on your Turn — three ways in:
 *   - "Enter now" auto-spreads the whole wave onto the Map as a single Group
 *     Action at its wave-suggested facing (the fast path, unchanged).
 *   - A per-Unit "Place" button arms placement for just that Unit.
 *   - Checkboxes + "Place selected" arms a real Group entry (§4.12: "on the
 *     same or spread out on adjacent entry Hexes") for two or more Units.
 * Either manual path then walks the board through Hex → facing per Unit
 * (store.ts's `placingReinforcementQueue`/`placingReinforcementFacing`) and
 * dispatches one ENTER only once every queued Unit has both.
 */
import { useEffect, useState } from 'react';
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';
import type { SideId, UnitId } from '../engine/types';
import { code } from './UnitCounter';

export function ReinforcementsPanel({ side }: { side: SideId }) {
  const game = useGame((s) => s.game);
  const enterWave = useGame((s) => s.enterWave);
  const startPlaceReinforcements = useGame((s) => s.startPlaceReinforcements);
  const cancelPlaceReinforcements = useGame((s) => s.cancelPlaceReinforcements);
  const useDefaultReinforcementFacing = useGame((s) => s.useDefaultReinforcementFacing);
  const placingReinforcementQueue = useGame((s) => s.placingReinforcementQueue);
  const placingReinforcementFacing = useGame((s) => s.placingReinforcementFacing);
  const [selected, setSelected] = useState<Set<UnitId>>(new Set());

  const isPlacingAny = placingReinforcementQueue.length > 0 || !!placingReinforcementFacing;
  useEffect(() => {
    if (!isPlacingAny) setSelected(new Set());
  }, [isPlacingAny]);

  if (!game) return null;

  const pending = game.reinforcements.filter((r) => r.side === side);
  if (pending.length === 0) return null; // nothing left to show once every wave has arrived

  const waveIds = [...new Set(pending.map((r) => r.waveId))];
  const yourTurn = game.currentSide === side;

  // The Unit currently mid-placement (Hex or facing step), if it's this side's.
  const activeId = placingReinforcementFacing?.unitId ?? placingReinforcementQueue[0];
  const activeReinforcement = activeId ? game.reinforcements.find((r) => r.id === activeId) : undefined;
  const placingThisSide = isPlacingAny && activeReinforcement?.side === side;

  const toggleSelected = (id: UnitId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="panel reinforce">
      <h3>Reinforcements</h3>
      {placingThisSide && (
        <div className="reinforce__status">
          {placingReinforcementFacing ? (
            <>
              <span>
                Choose facing for {game.templates[activeReinforcement!.templateId]?.name ?? activeReinforcement!.templateId} —
                click a highlighted Hex, or
              </span>
              <button className="reinforce__place is-active" onClick={() => useDefaultReinforcementFacing()}>
                Use default facing
              </button>
            </>
          ) : (
            <span>
              Placing {game.templates[activeReinforcement!.templateId]?.name ?? activeReinforcement!.templateId}
              {placingReinforcementQueue.length > 1 ? ` (+${placingReinforcementQueue.length - 1} more queued)` : ''} —
              click a highlighted entry Hex
            </span>
          )}
          <button className="reinforce__place" onClick={() => cancelPlaceReinforcements()}>
            Cancel
          </button>
        </div>
      )}
      {waveIds.map((waveId) => {
        const units = pending.filter((r) => r.waveId === waveId);
        const first = units[0]!;
        const eligible = game.round >= first.earliestRound;
        const selectable = eligible && yourTurn && !isPlacingAny;
        const selectedInWave = units.filter((u) => selected.has(u.id));
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
                const isQueued = placingReinforcementQueue.includes(r.id);
                const isFacing = placingReinforcementFacing?.unitId === r.id;
                return (
                  <div key={r.id} className="reinforce__unit" title={name}>
                    {selectable && units.length > 1 && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelected(r.id)}
                      />
                    )}
                    <span className="reinforce__badge" style={{ background: NATIONS[r.nation]?.color }}>
                      {code(name)}
                    </span>
                    <span className="reinforce__name">{name}</span>
                    {selectable && (
                      <button className="reinforce__place" onClick={() => startPlaceReinforcements([r.id])}>
                        Place
                      </button>
                    )}
                    {(isQueued || isFacing) && (
                      <span className="dim">{isFacing ? 'choosing facing…' : 'queued…'}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {eligible && yourTurn && !isPlacingAny && (
              <div className="reinforce__wave-actions">
                <button className="reinforce__enter" onClick={() => enterWave(waveId)}>
                  Enter now (§4.12)
                </button>
                {selectedInWave.length > 1 && (
                  <button
                    className="reinforce__enter"
                    onClick={() => startPlaceReinforcements(selectedInWave.map((u) => u.id))}
                  >
                    Place selected as Group ({selectedInWave.length})
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
