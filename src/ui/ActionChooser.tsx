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
  const unload = useGame((s) => s.unload);
  const indirectFire = useGame((s) => s.indirectFire);
  const fireSmoke = useGame((s) => s.fireSmoke);
  const select = useGame((s) => s.select);
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

  // Rules-legal (NOT CAP-gated) for Move/Fire/Close Combat — see the matching
  // comment in store.ts's hexClick: a Spent Unit that can't currently afford
  // an option should still see it offered here; choosing it runs the normal
  // CAP confirm/rejection flow (§3.4). Indirect Fire/Fire Smoke/Load stay
  // CAP-gated via `acts` — they're not part of this fix.
  const moveAp = !unit.carriedBy ? moveCost(game, unit, hexId).ap : null;
  const canMove = moveAp != null;
  const fireCtx = enemy && !unit.carriedBy ? attackContext(game, unit, enemy) : null;
  const canFire = !!fireCtx?.legal;
  const ccCtx = enemy && !unit.carriedBy ? closeCombatContext(game, unit, enemy) : null;
  const canCC = !!ccCtx?.legal;
  const indirectAct = acts.find((a) => a.type === 'INDIRECT_FIRE' && a.targetHexId === hexId);
  const smokeAct = acts.find((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === hexId);
  const loadAct =
    vehicleHere && acts.find((a) => a.type === 'LOAD' && a.vehicleId === vehicleHere.id);
  // §15.9: clicking a carried Unit's own (its Vehicle's) Hex is ambiguous
  // between "unload here" and the normal click-selected-unit-to-deselect
  // behavior — store.ts's hexClick routes that case to this chooser instead
  // of a plain confirm (an adjacent Unload Hex isn't ambiguous, so it just
  // gets a plain "unload here?" confirm, no chooser).
  const carrier = unit.carriedBy ? game.units[unit.carriedBy] : undefined;
  const sameHexUnload =
    carrier && hexId === carrier.hexId ? acts.find((a) => a.type === 'UNLOAD' && a.toHexId === hexId) : undefined;

  const fireHit = fireCtx?.legal ? pct(fireOdds(fireCtx.ar, fireCtx.dr).hit) : null;
  const ccHit = ccCtx?.legal ? pct(fireOdds(ccCtx.ar, ccCtx.dr).hit) : null;

  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <div className="unit-picker" style={{ left: chooser.x, top: chooser.y }}>
      <div className="unit-picker__head">Action @ {hexId}</div>
      {canMove && (
        <button className="unit-picker__row" onClick={() => run(() => move(unit.id, hexId))}>
          ➜ Move here{moveAp != null ? ` (${moveAp} AP)` : ''}
        </button>
      )}
      {canFire && enemy && (
        <button className="unit-picker__row" onClick={() => run(() => fire(unit.id, enemy.id))}>
          ✸ Fire at {enemy.id} ({fireHit}% hit)
        </button>
      )}
      {canCC && enemy && (
        <button className="unit-picker__row cc-btn" onClick={() => run(() => closeCombat(unit.id, enemy.id))}>
          ⚔ Close combat {enemy.id} ({ccHit}% hit)
        </button>
      )}
      {indirectAct && enemy && (
        <button className="unit-picker__row" onClick={() => run(() => indirectFire(unit.id, hexId))}>
          ⤳ Indirect Fire at {enemy.id} (§13.2)
        </button>
      )}
      {smokeAct && (
        <button className="unit-picker__row" onClick={() => run(() => fireSmoke(unit.id, hexId))}>
          ☁ Fire Smoke onto {hexId} (§14.1)
        </button>
      )}
      {loadAct && vehicleHere && (
        <button className="unit-picker__row" onClick={() => run(() => load(unit.id, vehicleHere.id))}>
          🚚 Load onto {vehicleHere.id} (§15.7)
        </button>
      )}
      {sameHexUnload && (
        <button className="unit-picker__row" onClick={() => run(() => unload(unit.id, hexId))}>
          🚚 Unload here (§15.9)
        </button>
      )}
      {sameHexUnload && (
        <button className="unit-picker__row" onClick={() => run(() => select(null))}>
          ✕ Deselect {unit.id}
        </button>
      )}
      <button className="link" onClick={close}>
        cancel
      </button>
    </div>
  );
}
