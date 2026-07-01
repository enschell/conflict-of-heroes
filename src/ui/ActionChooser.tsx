/**
 * Popup shown when clicking a hex affords more than one action for the selected
 * unit — e.g. you can MOVE into an enemy-occupied hex (§5.4) *and* attack the
 * enemy there. Lets the player choose instead of the click guessing.
 */
import {
  attackContext,
  closeCombatContext,
  legalActionsForUnit,
  moveCost,
} from '../engine';
import { useGame } from '../state/store';
import { fireOdds, pct } from './odds';

export function ActionChooser() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const chooser = useGame((s) => s.chooser);
  const move = useGame((s) => s.move);
  const fire = useGame((s) => s.fire);
  const closeCombat = useGame((s) => s.closeCombat);
  const load = useGame((s) => s.load);
  const close = useGame((s) => s.closeChooser);

  if (!game || !chooser || !selectedUnitId || !game.units[selectedUnitId]) return null;
  const unit = game.units[selectedUnitId]!;
  const hexId = chooser.hexId;
  const acts = legalActionsForUnit(game, unit.id);
  const enemy = Object.values(game.units).find(
    (u) => u.hexId === hexId && u.side !== game.currentSide,
  );
  const vehicleHere = Object.values(game.units).find(
    (u) => u.hexId === hexId && u.side === unit.side,
  );

  const moveAct = acts.find((a) => a.type === 'MOVE' && a.toHexId === hexId);
  const fireAct = enemy && acts.find((a) => a.type === 'FIRE' && a.targetId === enemy.id);
  const ccAct = enemy && acts.find((a) => a.type === 'CLOSE_COMBAT' && a.targetId === enemy.id);
  const loadAct =
    vehicleHere && acts.find((a) => a.type === 'LOAD' && a.vehicleId === vehicleHere.id);

  const moveAp = moveAct ? moveCost(game, unit, hexId).ap : null;
  let fireHit: number | null = null;
  if (fireAct && enemy) {
    const c = attackContext(game, unit, enemy);
    fireHit = pct(fireOdds(c.ar, c.dr).hit);
  }
  let ccHit: number | null = null;
  if (ccAct && enemy) {
    const c = closeCombatContext(game, unit, enemy);
    ccHit = pct(fireOdds(c.ar, c.dr).hit);
  }

  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <div className="unit-picker" style={{ left: chooser.x, top: chooser.y }}>
      <div className="unit-picker__head">Action @ {hexId}</div>
      {moveAct && (
        <button className="unit-picker__row" onClick={() => run(() => move(unit.id, hexId))}>
          ➜ Move here{moveAp != null ? ` (${moveAp} AP)` : ''}
        </button>
      )}
      {fireAct && enemy && (
        <button className="unit-picker__row" onClick={() => run(() => fire(unit.id, enemy.id))}>
          ✸ Fire at {enemy.id} ({fireHit}% hit)
        </button>
      )}
      {ccAct && enemy && (
        <button className="unit-picker__row cc-btn" onClick={() => run(() => closeCombat(unit.id, enemy.id))}>
          ⚔ Close combat {enemy.id} ({ccHit}% hit)
        </button>
      )}
      {loadAct && vehicleHere && (
        <button className="unit-picker__row" onClick={() => run(() => load(unit.id, vehicleHere.id))}>
          🚚 Load onto {vehicleHere.id} (§15.7)
        </button>
      )}
      <button className="link" onClick={close}>
        cancel
      </button>
    </div>
  );
}
