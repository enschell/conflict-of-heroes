/**
 * §17.10 Mines CAP-choice modal: one row per attacked Unit, a +/- stepper for
 * the owning side's CAP modifier (positive lowers the Hit Number — helps hit
 * an enemy; negative raises it — protects a friendly Unit that blundered
 * into its own field), clamped ±2 and by the owning side's available CAP.
 */
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

export function MinesConfirm() {
  const game = useGame((s) => s.game);
  const pending = useGame((s) => s.pendingMines);
  const adjust = useGame((s) => s.adjustMinesMod);
  const confirm = useGame((s) => s.confirmMines);
  const cancel = useGame((s) => s.cancelMines);
  if (!pending || !game) return null;
  const cap = game.players[pending.ownerSide].capCurrent;
  const ownerNation = game.players[pending.ownerSide].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  return (
    <div className="modal-backdrop">
      <div className="confirm">
        <p>
          Mines Attack triggered (§17.10). {ownerNation} (CAP {cap}) may spend up to 2 CAP per Unit:
        </p>
        {pending.targets.map((t) => {
          const unit = game.units[t.unitId];
          if (!unit) return null;
          // CAP is a single shared pool across every target in this dialog —
          // stepping one target further is only allowed if the OTHERS' spend
          // still leaves enough room in the owner's CAP.
          const spentElsewhere = pending.targets.filter((o) => o.unitId !== t.unitId).reduce((n, o) => n + Math.abs(o.mod), 0);
          const remaining = cap - spentElsewhere;
          return (
            <div key={t.unitId} className="confirm__mines-row">
              <span>
                {t.unitId} — Hit# {t.hitNumber - t.mod}
                {t.mod !== 0 ? ` (${t.mod > 0 ? '+' : ''}${t.mod} CAP)` : ''}
              </span>
              <div className="confirm__mines-stepper">
                <button disabled={t.mod <= -2 || Math.abs(t.mod - 1) > remaining} onClick={() => adjust(t.unitId, -1)}>
                  −
                </button>
                <span>{t.mod}</span>
                <button disabled={t.mod >= 2 || Math.abs(t.mod + 1) > remaining} onClick={() => adjust(t.unitId, 1)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
        <div className="confirm__actions">
          <button className="primary" onClick={confirm}>
            Roll
          </button>
          <button onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
