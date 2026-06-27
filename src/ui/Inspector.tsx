/**
 * Selected-unit inspector + action menu. Shows the unit's effective stats and
 * the engine's legal actions as buttons (with a live AV vs DV fire preview).
 * Move/fire are also available by clicking the board. Opportunity actions are
 * confirmed via the store before they commit.
 */
import { attackContext, closeCombatContext, effectiveStats, legalActionsForUnit, templateOf } from '../engine';
import type { Facing } from '../engine/types';
import { useGame } from '../state/store';

const ARROWS = ['→', '↗', '↖', '←', '↙', '↘'];

export function Inspector() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const dispatch = useGame((s) => s.dispatch);
  const fire = useGame((s) => s.fire);
  const closeCombat = useGame((s) => s.closeCombat);
  const rally = useGame((s) => s.rally);
  const pivot = useGame((s) => s.pivot);

  if (!game) return null;
  if (!selectedUnitId || !game.units[selectedUnitId]) {
    return (
      <div className="panel">
        <h3>No unit selected</h3>
        <p className="dim">Click one of Side {game.currentSide}'s units to select it.</p>
      </div>
    );
  }

  const unit = game.units[selectedUnitId]!;
  const tmpl = templateOf(game, unit);
  const eff = effectiveStats(game, unit);
  const yours = unit.side === game.currentSide;
  const acts = yours ? legalActionsForUnit(game, unit.id) : [];
  const player = game.players[unit.side];
  const isActivated = player.activatedUnitId === unit.id;

  const canActivate = acts.some((a) => a.type === 'ACTIVATE_UNIT');
  const canMarkSpent = acts.some((a) => a.type === 'MARK_SPENT');
  const canPivot = acts.some((a) => a.type === 'PIVOT');
  const canRally = acts.some((a) => a.type === 'RALLY');
  const hasMove = acts.some((a) => a.type === 'MOVE');
  const fireActs = acts.filter((a): a is Extract<typeof a, { type: 'FIRE' }> => a.type === 'FIRE');
  const ccActs = acts.filter(
    (a): a is Extract<typeof a, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT',
  );

  return (
    <div className="panel">
      <h3>
        {unit.id} <span className="dim">· {tmpl.name}</span>
      </h3>

      {isActivated && (
        <div className="ap-readout">
          <span className="ap-readout__num">{player.ap}</span>
          <span className="ap-readout__label">AP remaining (of 7)</span>
        </div>
      )}

      <div className="stats-grid">
        <span>Side</span>
        <b>{unit.side}</b>
        <span>Status</span>
        <b>{isActivated ? 'activated' : unit.status}</b>
        <span>Hex / facing</span>
        <b>
          {unit.hexId} {ARROWS[unit.facing]}
        </b>
        <span>Firepower</span>
        <b>
          {eff.fp.red}
          {eff.fp.blue ? ` / ${eff.fp.blue}b` : ''}
        </b>
        <span>Defense</span>
        <b>
          {eff.dr.front}f / {eff.dr.flank}k ({eff.dr.color})
        </b>
        <span>Move · Range</span>
        <b>
          {tmpl.move} · {eff.range}
        </b>
        <span>Fire cost · VP</span>
        <b>
          {eff.apToFire} AP · {tmpl.vp}
        </b>
      </div>

      {unit.hitMarkers[0] && <p className="hit-note">Hit: {unit.hitMarkers[0]}</p>}

      {!yours && <p className="dim">This is the other side's unit.</p>}

      {yours && (
        <div className="actions">
          {canActivate && (
            <button className="primary" onClick={() => dispatch({ type: 'ACTIVATE_UNIT', unitId: unit.id })}>
              Activate (7 AP)
            </button>
          )}
          {isActivated && canMarkSpent && (
            <button onClick={() => dispatch({ type: 'MARK_SPENT', unitId: unit.id })}>End activation</button>
          )}
          {canRally && <button onClick={() => rally(unit.id)}>Rally (5 AP)</button>}
          {hasMove && <p className="dim">Move: click a highlighted green hex.</p>}

          {fireActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Fire targets:</div>
              {fireActs.map((a) => {
                const tgt = game.units[a.targetId]!;
                const ctx = attackContext(game, unit, tgt);
                return (
                  <button key={a.targetId} onClick={() => fire(unit.id, a.targetId)}>
                    → {a.targetId}: FP {ctx.baseFP}+2d6 vs DV {ctx.defenseValue}
                    {ctx.isFlank ? ' (flank)' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {ccActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Close combat (enemy in your hex):</div>
              {ccActs.map((a) => {
                const tgt = game.units[a.targetId]!;
                const ctx = closeCombatContext(game, unit, tgt);
                return (
                  <button key={a.targetId} className="cc-btn" onClick={() => closeCombat(unit.id, a.targetId)}>
                    ⚔ {a.targetId}: FP {ctx.baseFP}+2d6 vs flank DV {ctx.defenseValue}
                  </button>
                );
              })}
            </div>
          )}

          {canPivot && (
            <div className="pivot-row">
              <span className="dim">Pivot:</span>
              {ARROWS.map((arrow, f) => (
                <button key={f} className="icon-btn" disabled={f === unit.facing} onClick={() => pivot(unit.id, f as Facing)}>
                  {arrow}
                </button>
              ))}
            </div>
          )}

          {!canActivate && !isActivated && acts.length > 0 && (
            <p className="dim">Fresh unit — actions here are opportunity actions (you'll be asked to confirm; the unit is spent after).</p>
          )}
        </div>
      )}
    </div>
  );
}
