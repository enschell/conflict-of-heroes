/**
 * Popup shown when clicking a hex affords more than one action for the selected
 * unit — e.g. you can MOVE into an enemy-occupied hex (§5.4) *and* attack the
 * enemy there. Lets the player choose instead of the click guessing.
 */
import {
  attackContext,
  closeCombatContext,
  destructibleFeatureAt,
  legalActionsForUnit,
  moveCost,
} from '../engine';
import { useGame } from '../state/store';
import { fireOdds, isHopelessShot, pct } from './odds';

const FORTIFICATION_NAMES: Record<string, string> = {
  trench: 'Trench',
  bunker: 'Bunker',
  barbedWire: 'Barbed Wire',
  mines: 'Mines',
  roadBlock: 'Road Block',
};

export function ActionChooser() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const chooser = useGame((s) => s.chooser);
  const move = useGame((s) => s.move);
  const fire = useGame((s) => s.fire);
  const closeCombat = useGame((s) => s.closeCombat);
  const closeCombatStructure = useGame((s) => s.closeCombatStructure);
  const load = useGame((s) => s.load);
  const unload = useGame((s) => s.unload);
  const indirectFire = useGame((s) => s.indirectFire);
  const fireSmoke = useGame((s) => s.fireSmoke);
  const hiddenMove = useGame((s) => s.hiddenMove);
  const reconByFire = useGame((s) => s.reconByFire);
  const select = useGame((s) => s.select);
  const close = useGame((s) => s.closeChooser);

  if (!game || !chooser || !selectedUnitId || !game.units[selectedUnitId]) return null;
  const unit = game.units[selectedUnitId]!;
  const hexId = chooser.hexId;
  const acts = legalActionsForUnit(game, unit.id);
  const enemy = Object.values(game.units).find(
    (u) => u.hexId === hexId && u.side !== game.currentSide,
  );
  // §15.7: the friendly Vehicle in this Hex this Unit may Load onto — matched
  // against the engine's own LOAD enumeration (same lookup store.ts's hexClick
  // uses for its `canLoad`), never the selected Unit itself.
  //
  // This previously took "the first friendly Unit in the Hex" with no Vehicle
  // check and no self-exclusion: when the loading Unit itself sorted first
  // (e.g. a Gun stacked with its tow Truck), `vehicleHere` was that Unit, so
  // `loadAct`'s `vehicleId` match always failed and the Load button silently
  // vanished — while store.ts still counted the Load, so the chooser opened
  // WITHOUT it. Caught live: a FlaK 88 stacked with its Opel could never be
  // limbered, and the misclick spent the Truck on a Hidden Move instead.
  const vehicleHere = Object.values(game.units).find(
    (u) =>
      u.hexId === hexId &&
      u.side === unit.side &&
      u.id !== unit.id &&
      acts.some((a) => a.type === 'LOAD' && a.vehicleId === u.id),
  );

  // Rules-legal (NOT CAP-gated) for Move/Fire/Close Combat — see the matching
  // comment in store.ts's hexClick: a Spent Unit that can't currently afford
  // an option should still see it offered here; choosing it runs the normal
  // CAP confirm/rejection flow (§3.4). Indirect Fire/Fire Smoke/Load stay
  // CAP-gated via `acts` — they're not part of this fix.
  const moveAp = !unit.carriedBy ? moveCost(game, unit, hexId).ap : null;
  const canMove = moveAp != null;
  // §2.6: Stress adds +1AP to the next Action Cost — `moveCost()` only knows
  // the Move's own terrain/backwards/wall component, so add it here for
  // display (same gap as Board.tsx's move-cost popup had).
  const moveApDisplay = moveAp != null ? moveAp + (unit.stressed ? 1 : 0) : null;
  // §3.2: a shot with no chance to Hit even with the max 2-CAP dice mod is
  // excluded here too — same UI convenience as store.ts's hexClick, not a
  // rules illegality.
  const fireCtx = enemy && !unit.carriedBy ? attackContext(game, unit, enemy) : null;
  const canFire = !!fireCtx?.legal && !isHopelessShot(fireCtx.hitNumber);
  const ccCtx = enemy && !unit.carriedBy ? closeCombatContext(game, unit, enemy) : null;
  const canCC = !!ccCtx?.legal && !isHopelessShot(ccCtx.hitNumber);
  const indirectAct = acts.find((a) => a.type === 'INDIRECT_FIRE' && a.targetHexId === hexId);
  const smokeAct = acts.find((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === hexId);
  const hiddenMoveAct = acts.find((a) => a.type === 'HIDDEN_MOVE' && a.toHexId === hexId);
  const reconByFireAct = acts.find((a) => a.type === 'RECON_BY_FIRE' && a.targetHexId === hexId);
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

  // §17.2/17.3: a Move into (or, same-hex, occupy-from-within) this Hex may
  // also occupy its Trench/Bunker — a separate choice from a plain Move here.
  const occupyAct = acts.find(
    (a): a is Extract<typeof a, { type: 'MOVE' }> =>
      a.type === 'MOVE' && a.toHexId === hexId && a.occupyFortification === true,
  );
  const occupyKind = game.hexes[hexId]?.features.fortification?.kind;
  // §17.12: CC against the Fortification/Obstacle itself — only in the Unit's
  // own Hex, and mutually exclusive with attacking an occupant there.
  const structureFeature =
    hexId === unit.hexId && !unit.carriedBy ? destructibleFeatureAt(game.hexes[hexId]!) : undefined;
  const structureKind =
    game.hexes[hexId]?.features.fortification?.kind ?? game.hexes[hexId]?.features.obstacle?.kind;

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
          ➜ Move here{moveApDisplay != null ? ` (${moveApDisplay} AP)` : ''}
        </button>
      )}
      {occupyAct && (
        <button className="unit-picker__row" onClick={() => run(() => move(unit.id, hexId, true))}>
          🛡 Move & occupy {occupyKind ? FORTIFICATION_NAMES[occupyKind] : 'Fortification'} (§17.2/17.3)
        </button>
      )}
      {structureFeature && (
        <button className="unit-picker__row cc-btn" onClick={() => run(() => closeCombatStructure(unit.id))}>
          ⚔ Close combat the {structureKind ? FORTIFICATION_NAMES[structureKind] : 'Fortification/Obstacle'} (§17.12)
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
      {hiddenMoveAct && (
        <button className="unit-picker__row" onClick={() => run(() => hiddenMove(unit.id, hexId))}>
          🫥 {unit.hidden ? 'Hidden Move here' : 'Become Hidden here'} (§11.3)
        </button>
      )}
      {reconByFireAct && (
        <button className="unit-picker__row" onClick={() => run(() => reconByFire(unit.id, hexId))}>
          🔎 Recon by Fire at {hexId} (§11.7)
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
