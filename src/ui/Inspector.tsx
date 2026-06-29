/**
 * Selected-unit inspector + action menu. Shows the unit's effective stats and
 * the engine's legal actions as buttons (with a live AV vs DV fire preview).
 * Move/fire are also available by clicking the board. v3: each Action is
 * followed by a Spent Check (§2.5) and Stresses the unit (§2.6).
 */
import { attackContext, closeCombatContext, effectiveStats, legalActionsForUnit, templateOf } from '../engine';
import type { Facing } from '../engine/types';
import { useGame } from '../state/store';

const ARROWS = ['→', '↗', '↖', '←', '↙', '↘'];

export function Inspector() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
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

      <div className="stats-grid">
        <span>Side</span>
        <b>{unit.side}</b>
        <span>Status</span>
        <b>
          {unit.status}
          {unit.stressed ? ' · stressed' : ''}
        </b>
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
          {unit.status === 'spent' && (
            <p className="dim">
              Spent — an Action is only possible by spending CAPs to reduce its
              cost to 0AP (§3.4).
            </p>
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

          {acts.length > 0 && (
            <p className="dim">
              After acting, a Spent Check decides if {unit.id} stays Fresh; the
              unit becomes Stressed (+1AP next Turn).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
