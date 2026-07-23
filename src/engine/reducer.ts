/**
 * The central reducer: reduce(state, action) -> { state, events }.
 *
 * This is the ONLY way to mutate game state and is the future online wire
 * format (CLAUDE.md §3.4). It deep-clones the input, mutates the clone, and
 * returns it; all validation happens before any mutation, so a denied action
 * leaves the original state untouched.
 *
 * v3 action economy (§2.0–§2.8): pick one Unit → one Action. The Action Cost is
 * a threshold, not a budget: after the action resolves, roll the Spent Die —
 * `roll > cost` keeps the Unit Fresh, else it becomes Spent. CAPs may lower the
 * cost before the check (to 0AP ⇒ no check, §3.4). Acting Stresses the Unit
 * (+1AP next Turn if reused, §2.6).
 */
import { HIT_MARKERS, isArmoredMarker } from '../data/hitMarkers';
import { CARD_CATALOG } from '../data/cards/catalog';
import { applyUnitLoss, clampCapMod, reduceActionCost } from './cap';
import { canPlayCard } from './cards';
import { attackContext, closeCombatContext, rollAttack, rollCloseCombat, rollStackFire } from './combat';
import {
  canOccupy,
  closeCombatStructureAr,
  destroyFeatureAt,
  destructibleFeatureAt,
  fortificationAt,
  isOccupying,
  rollStructureDestroy,
} from './fortifications';
import { isInFrontArc, parseHexId } from './hex';
import { becomingHiddenCandidates, facingToward, hiddenMoveBase, mustReveal, rollReveal } from './hidden';
import { effectiveStats, resolveHit, returnHitToPile, templateOf } from './hits';
import { groupConnected, groupStress, hexesConnected, isValidSupporter } from './groups';
import { directFireZone, indirectFireZone, rollIndirectFire } from './mortar';
import { directionTo, moveCost, pivotCost, planVehicleMove } from './movement';
import { destroysBarbedWire, minesOwnerSide, minesTargetsFor, rollMinesAttack } from './obstacles';
import { RALLY_AP_COST, rollRally } from './rally';
import { legalEntryHexes } from './reinforcements';
import { legalSetupHexes } from './setup';
import { spentCheck } from './spent';
import { endRound, startRound, switchTurn } from './turn';
import { gainVp, otherSide, updateVictoryHexControl, vpPerKillFor } from './victory';
import type {
  Action,
  DRColor,
  Facing,
  GameEvent,
  GameState,
  ReduceResult,
  SideId,
  Unit,
} from './types';

/**
 * §11.1 bullet 1: which Unit id(s) does `action` act through? Used by
 * `reduce()`'s top-of-function check to auto-reveal any of them that's
 * currently Hidden, before dispatching to the specific `doX` — so every
 * existing Action (MOVE, FIRE, ...) just sees an already-revealed, ordinary
 * Unit and needs no changes of its own. Exhaustive over `Action['type']` by
 * intent (not enforced by the type system, since this only needs to be
 * conservative — including an id that turns out not to be Hidden is a no-op).
 */
function revealCandidateUnitIds(action: Action): string[] {
  switch (action.type) {
    case 'MOVE':
    case 'PIVOT':
    case 'CHOOSE_FACING':
    case 'RALLY':
    case 'STALL':
    case 'FIRE_SMOKE':
    case 'HASTY_DEFENSE':
    case 'REMOVE_HASTY_DEFENSE':
    case 'EXIT':
    case 'HIDDEN_MOVE':
    case 'UNLOAD':
      return [action.unitId];
    case 'FIRE':
    case 'CLOSE_COMBAT':
    case 'INDIRECT_FIRE':
    case 'RECON_BY_FIRE':
      return [action.attackerId];
    case 'GROUP_ATTACK':
      return [action.leaderId, ...action.supporterIds];
    case 'GROUP_RALLY':
      return action.unitIds;
    case 'GROUP_MOVE':
      return action.moves.map((m) => m.unitId);
    case 'LOAD':
      return [action.unitId, action.vehicleId];
    case 'PLAY_CARD':
      return action.unitId ? [action.unitId] : [];
    case 'ENTER':
    case 'SETUP_PLACE':
    case 'PASS':
    case 'PLAN_OBA_STRIKE':
      return [];
  }
}

export function reduce(state: GameState, action: Action): ReduceResult {
  // Pre-Mission Setup phase: ONLY SETUP_PLACE — plus the free CHOOSE_FACING
  // correction a SETUP_PLACE itself grants (`doSetupPlace` opens the same
  // §4.5 `pendingFacingChoices` window a Move does; without this carve-out
  // the placed Unit's facing pick was silently no-op'd until setup ended,
  // caught live) — is legal while it's ongoing. SETUP_PLACE is never legal
  // once it's over (or if the Mission never had one) — everything else
  // behaves exactly as before this feature existed.
  if (state.phase === 'setup') {
    if (action.type !== 'SETUP_PLACE' && action.type !== 'CHOOSE_FACING') return { state, events: [] };
  } else if (state.phase !== 'playing' || action.type === 'SETUP_PLACE') {
    return { state, events: [] };
  }

  const next: GameState = structuredClone(state);
  const events: GameEvent[] = [];

  // §4.5/§15.11: the free-facing-correction window closes as soon as any other
  // Action resolves — only `CHOOSE_FACING` itself is exempt from clearing it.
  if (action.type !== 'CHOOSE_FACING') next.pendingFacingChoices = [];
  const grantFacingChoice = (unitId: string) => {
    next.pendingFacingChoices = [...(next.pendingFacingChoices ?? []), unitId];
  };

  const log = (type: string, text: string, side?: SideId) => {
    const e: GameEvent = { type, round: next.round, side, text };
    events.push(e);
    next.log.push(e);
  };
  const deny = (reason: string): ReduceResult => ({
    state,
    events: [{ type: 'illegal', round: state.round, text: reason }],
  });

  const reveal = (unit: Unit, why: string) => {
    unit.hidden = undefined;
    grantFacingChoice(unit.id);
    log('reveal', `${unit.id} is revealed (${why}, §11.1)`, unit.side);
  };

  // §11.1 bullet 1: any Hidden Unit this Action acts through reveals, UNLESS
  // the Action is one of the rulebook's named exceptions (Stall/Rally/Hidden
  // Move) or a phase-transition Action that deliberately carries `hidden`
  // through untouched (SETUP_PLACE/ENTER — see `doSetupPlace`/`doEnter`).
  // Doing this here, once, means every other `doX` closure below just sees
  // an ordinary, already-revealed Unit and needs no changes of its own.
  const REVEAL_EXEMPT = new Set<string>(['STALL', 'RALLY', 'HIDDEN_MOVE', 'CHOOSE_FACING', 'SETUP_PLACE', 'ENTER']);
  // §8.9 Battle Icon: "Hidden Unit may take this card's Action and remain
  // hidden" — a conditional exemption, unlike every other entry above, since
  // it depends on the SPECIFIC card played, not the Action type alone.
  const cardKeepsHidden = action.type === 'PLAY_CARD' && !!CARD_CATALOG[action.cardId]?.battleIcons?.hidden;
  if (!REVEAL_EXEMPT.has(action.type) && !cardKeepsHidden) {
    for (const id of revealCandidateUnitIds(action)) {
      const u = next.units[id];
      if (u?.hidden) reveal(u, 'took a revealing Action');
    }
  }

  /**
   * §11.1 bullets 2-4: the general post-Action sweep — run once, on every
   * successful (non-denied) Action, right before returning. Checking EVERY
   * currently-Hidden Unit (not just the one(s) `action` touched) is what
   * gives cascade-reveals "for free": e.g. Recon by Fire revealing a Unit in
   * a Hex where other Hidden Units are stacked will, in this SAME sweep, also
   * catch those others' now-true "shares a Hex with a non-Hidden Unit"
   * condition. `deny()` bypasses `finish()` entirely, so illegal/no-op
   * Actions correctly skip this for free too.
   */
  const finish = (): ReduceResult => {
    if (next.phase === 'playing') {
      for (const u of Object.values(next.units)) {
        if (u.hidden && mustReveal(next, u)) reveal(u, 'no longer concealed');
      }
    }
    return { state: next, events };
  };

  // -- shared helpers -------------------------------------------------------

  const resetPassCycle = () => {
    next.consecutivePasses = 0;
    next.players.A.passed = false;
    next.players.B.passed = false;
  };

  /**
   * Plan a cost-bearing action's CAP spend (§3.3–§3.4). `base` already folds in
   * terrain and hit-marker deltas (movement/hits do that); here we add Stress
   * (+1AP, §2.6) then apply the caller's explicit CAP cost-reduction.
   *
   * Note: reduction is NEVER applied automatically. A Spent Unit may act only if
   * the caller explicitly spends enough CAPs (`capCostReduce`) to bring the cost
   * to exactly 0AP (§3.4) — taking a 0AP Action is a deliberate, costly choice,
   * not something that happens silently when a Spent Unit is selected.
   */
  const planCost = (unit: Unit, base: number, requestedReduce: number) => {
    const stress = unit.stressed ? 1 : 0;
    const costBeforeReduce = base + stress;
    const reduce = Math.max(0, Math.trunc(requestedReduce));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduce);
    return { cost, capsSpent };
  };

  /**
   * After an action resolves: roll the Spent Check (skipped at 0AP, §3.4), move
   * the acting side's single Stress Marker onto `unit` (§2.6), break the pass
   * cycle, and hand the turn over.
   */
  const afterAction = (unit: Unit, cost: number) => {
    if (cost > 0) {
      const sc = spentCheck(next.rng, cost);
      next.rng = sc.rng;
      if (!sc.fresh) unit.status = 'spent';
      log(
        'spent',
        `${unit.id} Spent Check: rolled ${sc.roll} vs cost ${cost} -> ${sc.fresh ? 'Fresh' : 'Spent'}`,
        unit.side,
      );
    } else {
      log('spent', `${unit.id} 0AP action — no Spent Check`, unit.side);
    }
    // Stress Marker move (§2.6): at most one stressed Unit per side.
    for (const u of Object.values(next.units)) {
      if (u.side === unit.side) u.stressed = false;
    }
    unit.stressed = true;
    resetPassCycle();
    switchTurn(next);
  };

  /**
   * After a Group Action (§10.10): ONE Spent Check at the group cost — on a fail
   * EVERY member becomes Spent — and ALL members are Stressed regardless (§10.11),
   * so a side may hold several Stress markers. Then break the pass cycle and hand
   * the turn over.
   */
  const afterGroupAction = (members: Unit[], cost: number) => {
    const side = members[0]!.side;
    if (cost > 0) {
      const sc = spentCheck(next.rng, cost);
      next.rng = sc.rng;
      if (!sc.fresh) for (const m of members) m.status = 'spent';
      log(
        'spent',
        `Group Spent Check: rolled ${sc.roll} vs cost ${cost} -> ${sc.fresh ? 'Fresh' : 'Spent'} (whole Group)`,
        side,
      );
    } else {
      log('spent', `Group 0AP action — no Spent Check`, side);
    }
    for (const u of Object.values(next.units)) if (u.side === side) u.stressed = false;
    for (const m of members) m.stressed = true;
    resetPassCycle();
    switchTurn(next);
  };

  // §7.5 / §15.13: a marker returns to the deck it was drawn from.
  const returnMarker = (type: Parameters<typeof returnHitToPile>[1]) => {
    if (isArmoredMarker(type)) next.hitPiles.vehicle = returnHitToPile(next.hitPiles.vehicle, type);
    else next.hitPiles.foot = returnHitToPile(next.hitPiles.foot, type);
  };

  const destroyUnit = (unit: Unit) => {
    for (const hm of unit.hitMarkers) returnMarker(hm);
    // §15.11: a destroyed transport immediately unloads its passenger into the
    // hex (free, any facing) rather than dragging it down.
    const rider = passengerOf(unit.id);
    if (rider) {
      delete rider.carriedBy;
      rider.hexId = unit.hexId;
      grantFacingChoice(rider.id);
      log('unload', `${rider.id} unloaded from destroyed ${unit.id} — facing may be chosen freely (§15.11)`, rider.side);
    }
    // If this unit was itself a passenger, free its carrier's slot.
    if (unit.carriedBy) delete unit.carriedBy;
    const tmpl = templateOf(next, unit);
    const opp = otherSide(unit.side);
    // §9.1: VP to the destroyer — a specific-Unit override (Mission-authored) beats the
    // flat/per-side value, which beats the Unit's own template vp — then step the no-tie marker.
    const killVp = next.victory.unitKillVp?.[unit.id] ?? vpPerKillFor(next.victory, opp) ?? tmpl.vp;
    gainVp(next, opp, killVp);
    // §16.1: destroyed Trucks/Wagons do not adjust the CAPs Track (still count for VP above).
    if (!tmpl.noCapLossOnDestroy) applyUnitLoss(next.players[unit.side]);
    delete next.units[unit.id];
    log('destroyed', `${unit.id} destroyed (+${killVp} VP to ${opp})`, unit.side);
  };

  /** `fpColor` is the attack's resolved colour (§16.5 open-topped may override
   * it to red), so the hit pile is routed by the ATTACK, not just the target's
   * static template colour. */
  const applyHit = (target: Unit, critical: boolean, fpColor: DRColor) => {
    const res = resolveHit(next, target, critical, fpColor, next.rng);
    next.rng = res.rng;
    if (res.outcome.kind === 'destroyed-immediate') {
      destroyUnit(target);
      return;
    }
    if (res.pile) {
      if (res.armored) next.hitPiles.vehicle = res.pile;
      else next.hitPiles.foot = res.pile;
    }
    if (res.outcome.kind === 'destroyed-drawn') {
      returnMarker(res.outcome.hitType);
      destroyUnit(target);
    } else {
      target.hitMarkers = [res.outcome.hitType];
      log('hit', `${target.id} takes a hit: ${res.outcome.hitType}`, target.side);
    }
  };

  /**
   * §17.10: resolve a Mines Attack against every qualifying Unit id in
   * `hexId` (see `minesTargetsFor` — no-op if the Hex has no live Mines),
   * using the caller-supplied per-unit CAP mod (chosen by the Mines' owning
   * side via the store's pre-dispatch confirm dialog).
   */
  const resolveMines = (hexId: string, unitIds: string[], capMods?: Record<string, number>) => {
    const owner = minesOwnerSide(next, hexId);
    // §18.1: a Pioneer, on foot, may enter a Mines Hex without triggering a
    // Mines Attack at all — excluded from the target list entirely, not just
    // given favorable odds.
    const eligibleIds = unitIds.filter((id) => {
      const u = next.units[id];
      return !u || !templateOf(next, u).pioneer;
    });
    for (const { unitId, hitNumber } of minesTargetsFor(next, hexId, eligibleIds)) {
      const target = next.units[unitId];
      if (!target) continue;
      // The Mines' owning side pays for its own Hit Number modification
      // (§17.10) — the store's CAP-choice dialog already gates the player to
      // an affordable mod, but clamp defensively here too rather than trust
      // the UI alone (CLAUDE.md §3: legality lives in the engine).
      let mod = capMods?.[unitId] ?? 0;
      if (mod !== 0 && owner) {
        const ownerPlayer = next.players[owner];
        const affordable = Math.min(Math.abs(mod), ownerPlayer.capCurrent);
        mod = Math.sign(mod) * affordable;
        ownerPlayer.capCurrent -= affordable;
      }
      const roll = rollMinesAttack(next, target, hitNumber, mod);
      next.rng = roll.rng;
      log(
        'mines',
        `${target.id} triggers a Mines Attack: rolled ${roll.dice[0]}+${roll.dice[1]}=${roll.total} ` +
          `vs Hit# ${roll.hitNumber} -> ${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        target.side,
      );
      if (roll.hit) applyHit(target, roll.critical, roll.fpColor);
    }
  };

  // -- action handlers ------------------------------------------------------

  /** The foot Unit currently loaded on `vehicleId`, if any (§15.6). */
  const passengerOf = (vehicleId: string): Unit | undefined =>
    Object.values(next.units).find((u) => u.carriedBy === vehicleId);

  const doMove = (a: Extract<Action, { type: 'MOVE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot move on its own (§15.8)');

    // §17.3 (2nd paragraph): a Unit that begins its Turn in a Hex with a
    // friendly/unoccupied Fortification, but isn't occupying it, may spend a
    // Move Action to occupy it in place — ignoring Difficult Terrain Penalties
    // (there's no hex transition here to charge terrain for in the first place).
    if (a.toHexId === unit.hexId) {
      if (unit.occupyingFortification) return deny('already occupying this Hex’s Fortification');
      if (!a.occupyFortification || !canOccupy(next, unit))
        return deny('nothing to occupy in this Hex (§17.3)');
      const eff = effectiveStats(next, unit);
      const player = next.players[unit.side];
      const { cost, capsSpent } = planCost(unit, eff.move, a.capCostReduce ?? 0);
      if (unit.status === 'spent' && cost > 0)
        return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
      if (player.capCurrent < capsSpent) return deny('not enough CAP');
      player.capCurrent -= capsSpent;
      if (unit.hastyDefense) {
        unit.hastyDefense = false;
        log('hastyDefense', `${unit.id}'s Hasty Defense is stripped by moving (§17.6)`, unit.side);
      }
      unit.occupyingFortification = true;
      // §17.5: a Bunker occupant must face the same direction as the Bunker.
      const fort = fortificationAt(next.hexes[unit.hexId]!);
      if (fort?.kind === 'bunker' && fort.facing != null) unit.facing = fort.facing;
      log('fortification', `${unit.id} occupies the Fortification at ${unit.hexId} (§17.3)`, unit.side);
      afterAction(unit, cost);
      return finish();
    }

    const tmpl = templateOf(next, unit);
    const path = a.path && a.path.length ? a.path : [a.toHexId];

    // Vehicles may chain Bonus Moves (§15.2); foot units take one hex.
    let base: number;
    let finalHexId: string;
    let finalFacing: Facing;
    let wireApRolled: number | undefined; // §17.8: revealed in the log once resolved, not before
    if (tmpl.kind === 'vehicle') {
      const plan = planVehicleMove(next, unit, path);
      if (plan.ap == null) return deny(plan.reason ?? 'illegal move');
      base = plan.ap;
      finalHexId = plan.finalHexId;
      finalFacing = plan.finalFacing;
      if (plan.rng) next.rng = plan.rng;
    } else {
      if (path.length !== 1) return deny('only vehicles may take Bonus Moves');
      const mc = moveCost(next, unit, path[0]!);
      if (mc.ap == null) return deny(mc.reason ?? 'illegal move');
      base = mc.ap;
      finalHexId = path[0]!;
      const dir = directionTo(unit.hexId, finalHexId);
      const forward = isInFrontArc(parseHexId(unit.hexId), unit.facing, parseHexId(finalHexId));
      finalFacing = forward && dir >= 0 ? (dir as Facing) : unit.facing;
      // §17.8: Barbed Wire's 1d6 Move Cost roll (`moveCost` itself rolls the
      // die, matching the "compute then commit the RNG" pattern used by
      // combat's rollStackFire etc.). The result is hidden from the pre-move
      // popup (Board.tsx) but revealed here once the move actually commits.
      if (mc.rng) next.rng = mc.rng;
      wireApRolled = mc.mods?.find((m) => m.random)?.value;
    }
    // §4.5: the mover may pick a facing explicitly; otherwise the direction of
    // travel above is just a default — either way it's still freely correctable
    // afterward via CHOOSE_FACING (see grantFacingChoice below).
    if (a.facing != null) finalFacing = a.facing;

    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, base, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    // §17.6: Moving strips this Unit's own Hasty Defense (own-unit only — a
    // dragged passenger cannot itself hold one, §17.6/doLoad's decision #3).
    if (unit.hastyDefense) {
      unit.hastyDefense = false;
      log('hastyDefense', `${unit.id}'s Hasty Defense is stripped by moving (§17.6)`, unit.side);
    }
    // §17.3: moving away from a Hex always exits any Fortification occupied there.
    unit.occupyingFortification = false;

    unit.hexId = finalHexId;
    unit.facing = finalFacing;
    grantFacingChoice(unit.id);
    // A transporting Vehicle carries its passenger along (§15.8) and the pair
    // makes a single Group Spent Check.
    const passenger = passengerOf(unit.id);
    if (passenger) {
      passenger.hexId = finalHexId;
      passenger.facing = finalFacing;
      grantFacingChoice(passenger.id);
    }
    const bonus = path.length > 1 ? ` (+${path.length - 1} bonus)` : '';
    const wireNote = wireApRolled != null ? `, incl. +${wireApRolled}AP, Barbed Wire (§17.8)` : '';
    log('move', `${unit.id} -> ${finalHexId}${bonus} (cost ${cost}${wireNote})`, unit.side);
    updateVictoryHexControl(next);

    // §17.8: a Tracked Vehicle moving into Barbed Wire destroys it.
    const destHex = next.hexes[finalHexId]!;
    if (tmpl.kind === 'vehicle' && destroysBarbedWire(destHex, tmpl.propulsion ?? 'tracked')) {
      destHex.features.obstacle!.destroyed = true;
      log('obstacle', `Barbed Wire at ${finalHexId} destroyed by ${unit.id}`, unit.side);
    }
    // §17.10: Mines attack every Unit that just moved into the Hex (incl. a
    // Transported passenger riding along). Note: only the FINAL Hex of a
    // multi-hex vehicle Bonus-Move path is checked here — a path that merely
    // passes THROUGH a Mines Hex without ending there isn't handled yet.
    resolveMines(finalHexId, passenger ? [unit.id, passenger.id] : [unit.id], a.minesCapMods);

    // §17.2/17.3: occupy the destination Hex's Fortification — entering never
    // auto-occupies, it's the player's choice (`a.occupyFortification`).
    if (a.occupyFortification && canOccupy(next, unit)) {
      unit.occupyingFortification = true;
      // §17.5: a Bunker occupant must face the same direction as the Bunker —
      // overrides the free facing-choice window `grantFacingChoice` opened
      // above, since the Bunker's lock isn't something to freely correct away.
      const fort = fortificationAt(destHex);
      if (fort?.kind === 'bunker' && fort.facing != null) {
        unit.facing = fort.facing;
        next.pendingFacingChoices = (next.pendingFacingChoices ?? []).filter((id) => id !== unit.id);
      }
      log('fortification', `${unit.id} occupies the Fortification at ${finalHexId} (§17.2/17.3)`, unit.side);
    }

    if (passenger) afterGroupAction([unit, passenger], cost);
    else afterAction(unit, cost);
    return finish();
  };

  const doPivot = (a: Extract<Action, { type: 'PIVOT' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot pivot on its own (§15.8)');
    // §17.5: a Bunker occupant's facing is locked to the Bunker's — Pivot is
    // not offered at all (no no-op-pivot allowed).
    if (isOccupying(next, unit)?.kind === 'bunker')
      return deny('a Bunker occupant may not Pivot — facing is locked to the Bunker (§17.5)');
    const eff = effectiveStats(next, unit);
    if (!eff.canPivot) return deny('unit cannot pivot');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, pivotCost(), a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    unit.facing = a.facing;
    // §17.6: Pivoting also strips this Unit's own Hasty Defense.
    if (unit.hastyDefense) {
      unit.hastyDefense = false;
      log('hastyDefense', `${unit.id}'s Hasty Defense is stripped by pivoting (§17.6)`, unit.side);
    }
    // §15.7: a loaded Unit sits "on top of" its Vehicle, facing the same
    // direction — so pivoting the Vehicle pivots its passenger along with it
    // (the rules don't give the passenger an independent facing choice here;
    // it only gets one when actually Unloaded, §15.9).
    const passenger = passengerOf(unit.id);
    if (passenger) passenger.facing = a.facing;
    log('pivot', `${unit.id} pivots to ${a.facing} (cost ${cost})`, unit.side);
    // §17.10: Mines attack the Unit Pivoting in Place (not its passenger,
    // which isn't itself "Pivoting" — it just rides along).
    resolveMines(unit.hexId, [unit.id], a.minesCapMods);
    if (passenger) afterGroupAction([unit, passenger], cost);
    else afterAction(unit, cost);
    return finish();
  };

  /**
   * Free facing correction (§4.5/§15.11): 0AP, no Spent Check, no turn switch,
   * no `currentSide` check (the window can still be open for the side that
   * just acted, since a normal Action always hands the turn to the other side
   * first). Only legal while `unitId` is in `pendingFacingChoices` — the
   * reducer grants that window itself; a Unit can never just choose to reface
   * for free on a whim.
   */
  const doChooseFacing = (a: Extract<Action, { type: 'CHOOSE_FACING' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (!next.pendingFacingChoices?.includes(a.unitId))
      return deny('no free facing correction is available for this Unit right now');
    unit.facing = a.facing;
    next.pendingFacingChoices = (next.pendingFacingChoices ?? []).filter((id) => id !== a.unitId);
    log('facing', `${unit.id} faces ${a.facing} (free, §4.5/§15.11)`, unit.side);
    return finish();
  };

  /**
   * Hidden Move (§11.3-11.6): one Action covering both becoming Hidden (from
   * `!unit.hidden`) and moving while already Hidden. Flat 5AP base
   * (`hiddenMoveBase`, ignores Terrain Move Penalties per §11.3) — `moveCost`/
   * `planVehicleMove` are reused ONLY for their adjacency/passability signal
   * (`.ap != null`) when already Hidden, never for their own AP number.
   */
  const doHiddenMove = (a: Extract<Action, { type: 'HIDDEN_MOVE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot move on its own (§15.8)');

    if (!unit.hidden) {
      // §11.4 Becoming Hidden: must be able to move, and the destination must
      // be out of ALL non-Hidden enemy LOS.
      if (!effectiveStats(next, unit).canMove) return deny('unit cannot move (current Hit Marker forbids it, §7.5)');
      if (!becomingHiddenCandidates(next, unit).includes(a.toHexId)) {
        return deny(`${a.toHexId} is not a legal Hidden Move destination (§11.4 — must be out of all non-Hidden enemy LOS)`);
      }
    } else {
      // §11.5 Move While Hidden: ordinary adjacency/passability only — staying
      // hidden vs. revealing on arrival is decided by the post-Action sweep in
      // `finish()`, not here.
      const tmpl = templateOf(next, unit);
      const legal =
        tmpl.kind === 'vehicle'
          ? planVehicleMove(next, unit, [a.toHexId]).ap != null
          : moveCost(next, unit, a.toHexId).ap != null;
      if (!legal) return deny('not a legal Hidden Move destination');
    }

    const base = hiddenMoveBase(next, unit);
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, base, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    if (unit.hastyDefense) {
      unit.hastyDefense = false;
      log('hastyDefense', `${unit.id}'s Hasty Defense is stripped by moving (§17.6)`, unit.side);
    }
    unit.occupyingFortification = false;
    unit.hexId = a.toHexId;
    unit.hidden = true;
    log('hiddenMove', `${unit.id} makes a Hidden Move to ${a.toHexId} (cost ${cost}, §11.3)`, unit.side);
    // §17.10: Mines still attack a Hidden Unit entering the Hex, same as any
    // other Move — no special exemption in the rulebook. (Unlike a normal
    // MOVE, this doesn't thread a UI-chosen `minesCapMods` through; a Hidden
    // Move into a live Mines Hex is a rare enough combination that the CAP-
    // choice refinement is left as a follow-up rather than blocking this.)
    resolveMines(a.toHexId, [unit.id]);
    afterAction(unit, cost);
    return finish();
  };

  const doFire = (a: Extract<Action, { type: 'FIRE' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    const target = next.units[a.targetId];
    if (!attacker || !target) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    if (attacker.carriedBy) return deny('a transported Unit cannot attack (§15.8)');
    const attackerTmpl = templateOf(next, attacker);
    // §16.1: Wagons may not attack at all; Trucks may only attack in Close Combat.
    if (attackerTmpl.attackMode === 'none' || attackerTmpl.attackMode === 'closeCombatOnly')
      return deny('this Unit cannot make a ranged Attack (§16.1)');
    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const useFlamethrower = a.useFlamethrower ?? false;
    const ctx = attackContext(next, attacker, target, diceMod, 0, useFlamethrower);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal attack');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    // §16.2: a Turreted Vehicle firing outside its Arc pays a +2AP Attack Cost Penalty.
    const arcPenalty = ctx.outOfArc && attackerTmpl.turreted ? 2 : 0;
    const { cost, capsSpent } = planCost(attacker, eff.apToFire + arcPenalty, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP to fire');
    player.capCurrent -= capNeeded;

    // §7.5.1: one shot at a hex resolves against every enemy stacked there, each
    // with its own roll, for the single fire cost already paid above.
    const stack = rollStackFire(next, attacker, target.hexId, diceMod, 0, useFlamethrower);
    next.rng = stack.rng;
    for (const { targetId, roll } of stack.rolls) {
      log(
        'fire',
        `${attacker.id} fires${useFlamethrower ? ' (Flamethrower, §18.0)' : ''} at ${targetId}: rolled ` +
          `${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr})` +
          `${roll.isFlank ? ' (flank)' : ''} -> ` +
          `${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        attacker.side,
      );
      if (roll.hit) {
        const t = next.units[targetId];
        if (t) applyHit(t, roll.critical, roll.fpColor);
      }
    }
    // §17.11: ranged Fire also resolves a second roll against the target Hex's
    // destructible Fortification/Obstacle, if any — automatic, not a player
    // choice, under this SAME Spent Check (one already-paid-for cost above).
    // Reuses the SAME AR (`ctx.ar`) and CAP dice mod the occupant roll(s) just
    // used; the structure's own DR is a flat `destroyDr`, no terrain/smoke.
    const targetHex = next.hexes[target.hexId];
    const feature = targetHex && destructibleFeatureAt(targetHex);
    if (feature) {
      const structRoll = rollStructureDestroy(next, ctx.ar, feature.destroyDr!, diceMod);
      next.rng = structRoll.rng;
      log(
        'fireStructure',
        `${attacker.id}'s Fire also targets the Fortification/Obstacle at ${target.hexId}: rolled ` +
          `${structRoll.dice[0]}+${structRoll.dice[1]}=${structRoll.total} vs Hit# ${structRoll.hitNumber} ` +
          `(AR ${ctx.ar}) -> ${structRoll.hit ? 'DESTROYED' : 'survives'}`,
        attacker.side,
      );
      if (structRoll.hit) destroyFeatureAt(targetHex!);
    }
    afterAction(attacker, cost);
    return finish();
  };

  /**
   * Recon by Fire (§11.7): attack a suspected Hex in the attacker's Fire
   * Zone. Two independent CAP-modifiable rolls under ONE Spent Check —
   * `capRevealDiceMod` for the Reveal Number, `capHitDiceMod` for the
   * follow-up Attack, deliberately never shared (the rulebook is explicit
   * these don't carry over, unlike §17.11's single-shared-mod double roll).
   * On a miss, or a hit against an empty Hex, the log/return stays symmetric
   * — the attacker learns only pass/fail, never which happened.
   */
  const doReconByFire = (a: Extract<Action, { type: 'RECON_BY_FIRE' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    if (!attacker) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    if (attacker.carriedBy) return deny('a transported Unit cannot attack (§15.8)');
    const attackerTmpl = templateOf(next, attacker);
    if (attackerTmpl.attackMode === 'none' || attackerTmpl.attackMode === 'closeCombatOnly')
      return deny('this Unit cannot make a ranged Attack (§16.1)');
    if (!next.hexes[a.targetHexId]) return deny('no such hex');
    const zone = directFireZone(next, attacker, a.targetHexId);
    if (!zone.legal) return deny(zone.reason ?? 'illegal Recon by Fire target (§11.7)');

    const revealMod = clampCapMod(a.capRevealDiceMod ?? 0);
    const hitMod = clampCapMod(a.capHitDiceMod ?? 0);
    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    const { cost, capsSpent } = planCost(attacker, eff.apToFire, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(revealMod) + Math.abs(hitMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP for Recon by Fire');
    player.capCurrent -= capNeeded;

    const roll = rollReveal(next, a.targetHexId, revealMod);
    next.rng = roll.rng;
    const revealLog = `${attacker.id} Recon by Fire at ${a.targetHexId}: rolled ${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs Reveal# ${roll.hitNumber}`;

    const target = roll.hit
      ? Object.values(next.units).find((u) => u.hexId === a.targetHexId && u.hidden && u.side !== attacker.side)
      : undefined;

    if (!target) {
      // Deliberately the SAME log shape whether the roll failed or it
      // succeeded against an empty Hex — §11.7: "you will not know if you
      // missed a Hidden Unit or if there is not one there."
      log('recon', `${revealLog} -> no reveal`, attacker.side);
      afterAction(attacker, cost);
      return finish();
    }

    // §11.2: the owner picks facing on reveal — approximated here as facing
    // the revealing attacker (matches the worked example's "facing, as they
    // wish, towards the MMG"), resolved synchronously since the follow-up
    // Attack roll needs a real Front/Flank determination.
    target.facing = facingToward(target.hexId, attacker.hexId);
    target.hidden = undefined;
    log('recon', `${revealLog} -> ${target.id} revealed!`, attacker.side);

    const attackRoll = rollAttack(next, attacker, target, hitMod);
    next.rng = attackRoll.rng;
    log(
      'fire',
      `${attacker.id} fires on the just-revealed ${target.id}: rolled ${attackRoll.dice[0]}+${attackRoll.dice[1]}=` +
        `${attackRoll.total} vs Hit# ${attackRoll.hitNumber} (AR ${attackRoll.ar} / DR ${attackRoll.dr})` +
        `${attackRoll.isFlank ? ' (flank)' : ''} -> ${attackRoll.critical ? 'CRITICAL' : attackRoll.hit ? 'hit' : 'miss'}`,
      attacker.side,
    );
    if (attackRoll.hit) applyHit(target, attackRoll.critical, attackRoll.fpColor);

    afterAction(attacker, cost);
    return finish();
  };

  const doCloseCombat = (a: Extract<Action, { type: 'CLOSE_COMBAT' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    if (!attacker) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    if (attacker.carriedBy) return deny('a transported Unit cannot attack (§15.8)');
    // §16.1: Wagons may not attack at all (Trucks may still Close Combat).
    if (templateOf(next, attacker).attackMode === 'none') return deny('this Unit cannot Attack (§16.1)');

    // §17.12: a CC Attack picks ONE target — the occupant Unit or the
    // Fortification/Obstacle itself, never both (unlike ranged Fire's §17.11
    // automatic two rolls). A structure targeted by CC gets no Terrain mods.
    if (a.targetKind === 'structure') {
      const hex = next.hexes[attacker.hexId];
      const feature = hex && destructibleFeatureAt(hex);
      if (!feature) return deny('nothing destructible to Close Combat here (§17.11/17.12)');
      const diceMod = clampCapMod(a.capDiceMod ?? 0);
      const { ar } = closeCombatStructureAr(next, attacker);
      const player = next.players[attacker.side];
      const eff = effectiveStats(next, attacker);
      const { cost, capsSpent } = planCost(attacker, eff.apToFire, a.capCostReduce ?? 0);
      if (attacker.status === 'spent' && cost > 0)
        return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
      const capNeeded = capsSpent + Math.abs(diceMod);
      if (player.capCurrent < capNeeded) return deny('not enough CAP for close combat');
      player.capCurrent -= capNeeded;

      const roll = rollStructureDestroy(next, ar, feature.destroyDr!, diceMod);
      next.rng = roll.rng;
      log(
        'ccStructure',
        `${attacker.id} close-combats the Fortification/Obstacle at ${attacker.hexId}: rolled ` +
          `${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs Hit# ${roll.hitNumber} (AR ${ar}) -> ` +
          `${roll.hit ? 'DESTROYED' : 'survives'}`,
        attacker.side,
      );
      if (roll.hit) destroyFeatureAt(hex!);
      resolveMines(attacker.hexId, [attacker.id], a.minesCapMods);
      afterAction(attacker, cost);
      return finish();
    }

    const target = next.units[a.targetId!];
    if (!target) return deny('no such unit');
    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const useFlamethrower = a.useFlamethrower ?? false;
    const ctx = closeCombatContext(next, attacker, target, 0, useFlamethrower);
    if (!ctx.legal) return deny(ctx.reason ?? 'illegal close combat');

    const player = next.players[attacker.side];
    const eff = effectiveStats(next, attacker);
    const { cost, capsSpent } = planCost(attacker, eff.apToFire, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP for close combat');
    player.capCurrent -= capNeeded;

    const roll = rollCloseCombat(next, attacker, target, diceMod, 0, useFlamethrower);
    next.rng = roll.rng;
    log(
      'cc',
      `${attacker.id} close-combats${useFlamethrower ? ' (Flamethrower, §18.0)' : ''} ${target.id}: rolled ` +
        `${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs flank Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr}) -> ` +
        `${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
      attacker.side,
    );
    if (roll.hit) applyHit(target, roll.critical, roll.fpColor);
    // §17.10: Mines attack the Unit initiating Close Combat here — NOT the
    // Unit defending it (explicitly excluded, since it isn't "initiating").
    resolveMines(attacker.hexId, [attacker.id], a.minesCapMods);
    afterAction(attacker, cost);
    return finish();
  };

  const doIndirectFire = (a: Extract<Action, { type: 'INDIRECT_FIRE' }>): ReduceResult => {
    const attacker = next.units[a.attackerId];
    if (!attacker) return deny('no such unit');
    if (attacker.side !== next.currentSide) return deny('not your turn');
    if (attacker.carriedBy) return deny('a transported Unit cannot attack (§15.8)');
    if (templateOf(next, attacker).kind !== 'mortar') return deny('only Mortars may fire indirectly (§13.2)');
    const minRange = templateOf(next, attacker).minRange ?? 0;
    const zone = indirectFireZone(next, attacker, a.targetHexId, a.spotterHexId, minRange);
    if (!zone.legal) return deny(zone.reason ?? 'illegal indirect attack');

    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const player = next.players[attacker.side];
    const indirectCost = templateOf(next, attacker).indirectApToFire ?? effectiveStats(next, attacker).apToFire;
    const { cost, capsSpent } = planCost(attacker, indirectCost, a.capCostReduce ?? 0);
    if (attacker.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP to fire indirectly');
    player.capCurrent -= capNeeded;

    const result = rollIndirectFire(next, attacker, a.targetHexId, a.spotterHexId, diceMod);
    next.rng = result.rng;
    for (const roll of result.rolls) {
      log(
        'indirectFire',
        `${attacker.id} fires indirectly (spotter ${a.spotterHexId}) at ${roll.targetId}: rolled ` +
          `${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr}) ` +
          `-> ${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        attacker.side,
      );
      if (roll.hit) {
        const t = next.units[roll.targetId];
        if (t) applyHit(t, roll.critical, roll.fpColor);
      }
    }
    afterAction(attacker, cost);
    return finish();
  };

  const doFireSmoke = (a: Extract<Action, { type: 'FIRE_SMOKE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot attack (§15.8)');
    const tmpl = templateOf(next, unit);
    if (!tmpl.canFireSmoke) return deny('this Unit cannot Fire Smoke (§14.0)');
    const minRange = tmpl.minRange ?? 0;
    // §18.1: a Pioneer's Fire Smoke is capped to a max Range of 1 Hex.
    const smokeMaxRange = tmpl.pioneer ? 1 : undefined;
    const indirect = a.spotterHexId != null;
    const zone = indirect
      ? indirectFireZone(next, unit, a.targetHexId, a.spotterHexId!, minRange)
      : directFireZone(next, unit, a.targetHexId, minRange, smokeMaxRange);
    if (!zone.legal) return deny(zone.reason ?? 'illegal Fire Smoke');

    const player = next.players[unit.side];
    const base = indirect ? (tmpl.indirectApToFire ?? tmpl.apToFire) : effectiveStats(next, unit).apToFire;
    const { cost, capsSpent } = planCost(unit, base, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP to fire smoke');
    player.capCurrent -= capsSpent;

    next.hexes[a.targetHexId]!.features.smoke = 2; // §14.1: a fresh Smoke Marker is always Heavy
    log(
      'smoke',
      `${unit.id} fires Smoke ${indirect ? `(indirect, spotter ${a.spotterHexId})` : '(direct)'} onto ${a.targetHexId}`,
      unit.side,
    );
    afterAction(unit, cost);
    return finish();
  };

  const doRally = (a: Extract<Action, { type: 'RALLY' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.hitMarkers.length === 0) return deny('unit has no hit marker');
    const enemyHere = Object.values(next.units).some(
      (u) => u.side !== unit.side && u.hexId === unit.hexId,
    );
    if (enemyHere) return deny('cannot rally with enemy in hex');

    const diceMod = clampCapMod(a.capDiceMod ?? 0);
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, RALLY_AP_COST, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    const capNeeded = capsSpent + Math.abs(diceMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP to rally');
    player.capCurrent -= capNeeded;

    const rr = rollRally(next, unit, diceMod);
    next.rng = rr.rng;
    if (rr.success) {
      const removed = unit.hitMarkers[0]!;
      unit.hitMarkers = [];
      returnMarker(removed);
      log(
        'rally',
        `${unit.id} rallies — rolled ${rr.dice[0]}+${rr.dice[1]}=${rr.roll} · ` +
          `total ${rr.total} >= ${rr.target}`,
        unit.side,
      );
    } else {
      log(
        'rally',
        `${unit.id} fails to rally — rolled ${rr.dice[0]}+${rr.dice[1]}=${rr.roll} · ` +
          `total ${rr.total} < ${rr.target}`,
        unit.side,
      );
    }
    // §7.10: a mandatory Spent Check follows the rally regardless of result —
    // produced here because every cost-bearing action goes through afterAction.
    afterAction(unit, cost);
    return finish();
  };

  const doStall = (a: Extract<Action, { type: 'STALL' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, 1, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    log('stall', `${next.currentSide} stalls with ${unit.id} (cost ${cost})`, next.currentSide);
    afterAction(unit, cost);
    return finish();
  };

  const doPass = (): ReduceResult => {
    const player = next.players[next.currentSide];
    // §2.7: Passing removes the passing side's Stress Marker (opponent keeps theirs).
    for (const u of Object.values(next.units)) {
      if (u.side === next.currentSide) u.stressed = false;
    }
    player.passed = true;
    next.consecutivePasses += 1;
    log('pass', `${next.currentSide} passes`, next.currentSide);
    if (next.consecutivePasses >= 2) {
      log('roundEnd', `Round ${next.round} ends`);
      endRound(next);
      return finish();
    }
    switchTurn(next);
    return finish();
  };

  const doGroupMove = (a: Extract<Action, { type: 'GROUP_MOVE' }>): ReduceResult => {
    if (a.moves.length === 0) return deny('empty group');
    const ids = a.moves.map((m) => m.unitId);
    if (new Set(ids).size !== ids.length) return deny('duplicate group member');
    const members: Unit[] = [];
    for (const id of ids) {
      const u = next.units[id];
      if (!u) return deny('no such unit');
      if (u.side !== next.currentSide) return deny('not your turn');
      members.push(u);
    }
    // §10.2: the Group must BEGIN in one continuously-adjacent cluster.
    if (!groupConnected(next, ids)) return deny('group is not continuously adjacent');

    // §10.4: Group Move cost = the highest individual move cost (movers only).
    let maxMove = 0;
    for (const m of a.moves) {
      if (m.toHexId == null) continue;
      const unit = next.units[m.unitId]!;
      const mc = moveCost(next, unit, m.toHexId);
      if (mc.ap == null) return deny(mc.reason ?? 'illegal move');
      maxMove = Math.max(maxMove, mc.ap);
    }
    const costBeforeReduce = maxMove + groupStress(members); // §10.11
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    // §10.1: a Spent member may join only if the Group cost is 0AP.
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    // Apply each member's move/pivot (members may separate, §10.3).
    for (const m of a.moves) {
      const unit = next.units[m.unitId]!;
      if (m.toHexId != null) {
        const oldHexId = unit.hexId;
        const dir = directionTo(oldHexId, m.toHexId);
        const forward = isInFrontArc(parseHexId(oldHexId), unit.facing, parseHexId(m.toHexId));
        unit.hexId = m.toHexId;
        if (m.facing != null) unit.facing = m.facing;
        else if (forward && dir >= 0) unit.facing = dir as Facing;
        grantFacingChoice(unit.id); // §4.5: free follow-up correction, same as a solo Move
      } else if (m.facing != null) {
        unit.facing = m.facing;
      }
    }
    log(
      'groupMove',
      `${next.currentSide} Group Moves ${ids.join(', ')} (cost ${cost})`,
      next.currentSide,
    );
    updateVictoryHexControl(next);
    afterGroupAction(members, cost);
    return finish();
  };

  const doGroupAttack = (a: Extract<Action, { type: 'GROUP_ATTACK' }>): ReduceResult => {
    const leader = next.units[a.leaderId];
    const target = next.units[a.targetId];
    if (!leader || !target) return deny('no such unit');
    if (leader.side !== next.currentSide) return deny('not your turn');
    if (target.side === leader.side) return deny('friendly target');
    // §10.6: the Leader is in Close Combat iff it shares the Target's hex —
    // only same-hex Units may support a Group Close Combat (isValidSupporter
    // enforces that below).
    const isCloseCombat = target.hexId === leader.hexId;
    const leaderTmpl = templateOf(next, leader);
    // §16.1: Wagons (no attack) may never lead; a Truck (Close-Combat-only)
    // may lead a Group Close Combat, just not a ranged Group Attack.
    if (leaderTmpl.attackMode === 'none') return deny('this Unit cannot Attack (§16.1)');
    if (!isCloseCombat && leaderTmpl.attackMode === 'closeCombatOnly')
      return deny('this Unit cannot make a ranged Attack (§16.1)');

    const capMod = clampCapMod(a.capDiceMod ?? 0);
    const ctx = isCloseCombat
      ? closeCombatContext(next, leader, target)
      : attackContext(next, leader, target, capMod);
    if (!ctx.legal) return deny(ctx.reason ?? (isCloseCombat ? 'illegal close combat' : 'illegal attack'));

    // Validate supporters (§10.6) and de-dup against the leader. In Close
    // Combat, isValidSupporter restricts these to Units sharing the Leader's hex.
    const supIds = [...new Set(a.supporterIds)].filter((id) => id !== a.leaderId);
    const members: Unit[] = [leader];
    for (const id of supIds) {
      const sup = next.units[id];
      if (!sup) return deny('no such supporter');
      if (sup.side !== next.currentSide) return deny('not your turn');
      if (!isValidSupporter(next, leader, sup, target)) return deny(`${id} cannot support this attack`);
      members.push(sup);
    }
    const arBonus = supIds.length; // +1AR per qualifying Supporting Unit (§10.7)

    // §10.8: Group Attack cost = the Leader's Attack Cost (+ Group Stress).
    // §16.2: a Turreted leader firing outside its Arc pays +2AP (ranged only —
    // Close Combat has no Arc of Fire requirement).
    const eff = effectiveStats(next, leader);
    const arcPenalty = !isCloseCombat && ctx.outOfArc && leaderTmpl.turreted ? 2 : 0;
    const costBeforeReduce = eff.apToFire + arcPenalty + groupStress(members);
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    const capNeeded = capsSpent + Math.abs(capMod);
    if (player.capCurrent < capNeeded) return deny('not enough CAP');
    player.capCurrent -= capNeeded;

    if (isCloseCombat) {
      // §7.7.3/§10.6: Close Combat resolves against ONE chosen target, not the
      // whole hex — the leader's AR carries the +1AR-per-supporter bonus.
      const roll = rollCloseCombat(next, leader, target, capMod, arBonus);
      next.rng = roll.rng;
      log(
        'groupCc',
        `Group [${members.map((m) => m.id).join('+')}] close-combats ${target.id}: rolled ` +
          `${roll.dice[0]}+${roll.dice[1]}=${roll.total} vs flank Hit# ${roll.hitNumber} ` +
          `(AR ${roll.ar} / DR ${roll.dr}) -> ${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
        leader.side,
      );
      if (roll.hit) applyHit(target, roll.critical, roll.fpColor);
    } else {
      // §7.5.1: one shot at the hex resolves against every stacked enemy.
      const stack = rollStackFire(next, leader, target.hexId, capMod, arBonus);
      next.rng = stack.rng;
      for (const { targetId, roll } of stack.rolls) {
        log(
          'groupFire',
          `Group [${members.map((m) => m.id).join('+')}] fires at ${targetId}: rolled ${roll.dice[0]}+${roll.dice[1]}=` +
            `${roll.total} vs Hit# ${roll.hitNumber} (AR ${roll.ar} / DR ${roll.dr})` +
            `${roll.isFlank ? ' (flank)' : ''} -> ${roll.critical ? 'CRITICAL' : roll.hit ? 'hit' : 'miss'}`,
          leader.side,
        );
        if (roll.hit) {
          const t = next.units[targetId];
          if (t) applyHit(t, roll.critical, roll.fpColor);
        }
      }
    }
    afterGroupAction(members, cost);
    return finish();
  };

  const doGroupRally = (a: Extract<Action, { type: 'GROUP_RALLY' }>): ReduceResult => {
    if (a.unitIds.length === 0) return deny('empty group');
    const ids = [...new Set(a.unitIds)];
    if (ids.length !== a.unitIds.length) return deny('duplicate group member');
    const members: Unit[] = [];
    for (const id of ids) {
      const u = next.units[id];
      if (!u) return deny('no such unit');
      if (u.side !== next.currentSide) return deny('not your turn');
      members.push(u);
    }
    if (!groupConnected(next, ids)) return deny('group is not continuously adjacent');
    // Every member must be a Hit Unit able to Rally (§7.9): has a rallyable
    // marker and shares no hex with an enemy.
    for (const u of members) {
      if (u.hitMarkers.length === 0) return deny(`${u.id} has no hit marker`);
      if (HIT_MARKERS[u.hitMarkers[0]!].rally <= 0) return deny(`${u.id} cannot rally`);
      if (Object.values(next.units).some((e) => e.side !== u.side && e.hexId === u.hexId))
        return deny(`${u.id} shares a hex with an enemy`);
    }

    const costBeforeReduce = RALLY_AP_COST + groupStress(members); // §10.9 / §10.11
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((u) => u.status === 'spent') && cost > 0)
      return deny('a Group with a Spent Unit must reach 0AP with CAPs (§10.1/§3.4)');
    const player = next.players[next.currentSide];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    // §10.9: roll an INDIVIDUAL Rally Check per member; each success removes its marker.
    for (const u of members) {
      const rr = rollRally(next, u);
      next.rng = rr.rng;
      if (rr.success) {
        const removed = u.hitMarkers[0]!;
        u.hitMarkers = [];
        returnMarker(removed);
        log('rally', `${u.id} rallies — ${rr.dice[0]}+${rr.dice[1]} total ${rr.total} >= ${rr.target}`, u.side);
      } else {
        log('rally', `${u.id} fails to rally — total ${rr.total} < ${rr.target}`, u.side);
      }
    }
    afterGroupAction(members, cost); // §10.10: ONE Group Spent Check
    return finish();
  };

  const doLoad = (a: Extract<Action, { type: 'LOAD' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    const vehicle = next.units[a.vehicleId];
    if (!unit || !vehicle) return deny('no such unit');
    if (unit.side !== next.currentSide || vehicle.side !== unit.side) return deny('not your turn');
    if (unit.carriedBy) return deny('already loaded');
    if (templateOf(next, vehicle).kind !== 'vehicle') return deny('not a Vehicle');
    if (passengerOf(vehicle.id)) return deny('Vehicle already transporting/towing a Unit (§15.6)');
    const unitTmpl = templateOf(next, unit);
    if (unitTmpl.kind === 'vehicle') {
      // §15.10: only a damaged (Immobilized/Stunned) Vehicle may be towed, and a
      // Tracked Vehicle may only be towed by another Tracked Vehicle.
      const marker = unit.hitMarkers[0];
      if (marker !== 'aImmobilized' && marker !== 'aStunned')
        return deny('only an Immobilized or Stunned Vehicle may be towed (§15.10)');
      const towerProp = templateOf(next, vehicle).propulsion ?? 'tracked';
      if ((unitTmpl.propulsion ?? 'tracked') === 'tracked' && towerProp !== 'tracked')
        return deny('a Tracked Vehicle may only be towed by a Tracked Vehicle (§15.10)');
    }

    const sameHex = unit.hexId === vehicle.hexId;
    if (!sameHex && directionTo(unit.hexId, vehicle.hexId) < 0)
      return deny("must be in or adjacent to the Vehicle's hex (§15.7)");

    // §15.7: same-hex load ignores Hit Markers and Terrain (but not Stress);
    // adjacent-hex load pays the full Move Cost into the Vehicle's hex (terrain
    // and Hit-Marker move deltas included), then loads for free.
    let base: number;
    if (sameHex) {
      base = unitTmpl.move;
    } else {
      const mc = moveCost(next, unit, vehicle.hexId);
      if (mc.ap == null) return deny(mc.reason ?? 'illegal move to the Vehicle');
      base = mc.ap;
    }

    const members = [unit, vehicle];
    const costBeforeReduce = base + groupStress(members);
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((m) => m.status === 'spent') && cost > 0)
      return deny('a Spent Unit/Vehicle must reach 0AP with CAPs (§3.4)');
    const player = next.players[unit.side];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    unit.hexId = vehicle.hexId;
    unit.facing = vehicle.facing;
    unit.carriedBy = vehicle.id;
    // §17.6: a transported Unit cannot hold a Hasty Defense (it's normally
    // denied at build time — see doHastyDefense — but strip it here too for
    // the edge case of a Unit that built one, then was Loaded afterward).
    if (unit.hastyDefense) {
      unit.hastyDefense = false;
      log('hastyDefense', `${unit.id}'s Hasty Defense is stripped by loading onto ${vehicle.id} (§17.6)`, unit.side);
    }
    log('load', `${unit.id} loads onto ${vehicle.id} (cost ${cost})`, unit.side);
    afterGroupAction(members, cost); // §15.7 step 3: one Group Spent Check
    return finish();
  };

  const doUnload = (a: Extract<Action, { type: 'UNLOAD' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (!unit.carriedBy) return deny('unit is not loaded');
    const vehicle = next.units[unit.carriedBy];
    if (!vehicle) return deny('carrying Vehicle not found');
    // §15.9: a Stunned Unit cannot Unload.
    if (unit.hitMarkers.some((h) => HIT_MARKERS[h].onlyRally))
      return deny('a Stunned Unit cannot Unload (§15.9)');

    const toHexId = a.toHexId;
    if (!next.hexes[toHexId]) return deny('no such hex');
    const sameHex = toHexId === vehicle.hexId;
    if (!sameHex && directionTo(vehicle.hexId, toHexId) < 0)
      return deny("must unload under the Vehicle or an adjacent hex (§15.9)");

    // §15.9: placing it under the Vehicle enters no new hex (no terrain cost);
    // an adjacent hex pays the full Move Cost (terrain + Stress apply).
    let base: number;
    if (sameHex) {
      base = effectiveStats(next, unit).move;
    } else {
      const mc = moveCost(next, unit, toHexId);
      if (mc.ap == null) return deny(mc.reason ?? 'illegal unload hex');
      base = mc.ap;
    }

    const members = [unit, vehicle];
    const costBeforeReduce = base + groupStress(members);
    const reduceBy = Math.max(0, Math.trunc(a.capCostReduce ?? 0));
    const { cost, capsSpent } = reduceActionCost(costBeforeReduce, reduceBy);
    if (members.some((m) => m.status === 'spent') && cost > 0)
      return deny('a Spent Unit/Vehicle must reach 0AP with CAPs (§3.4)');
    const player = next.players[unit.side];
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    delete unit.carriedBy;
    unit.hexId = toHexId;
    if (a.facing !== undefined) unit.facing = a.facing; // §15.9: any facing
    grantFacingChoice(unit.id); // still freely correctable afterward either way
    log('unload', `${unit.id} unloads from ${vehicle.id} to ${toHexId} (cost ${cost})`, unit.side);
    afterGroupAction(members, cost); // §15.9 step 3: one Group Spent Check
    return finish();
  };

  const doEnter = (a: Extract<Action, { type: 'ENTER' }>): ReduceResult => {
    if (a.placements.length === 0) return deny('empty entry');
    const unitIds = a.placements.map((p) => p.unitId);
    if (new Set(unitIds).size !== unitIds.length) return deny('duplicate unit in entry');

    const entrants: { hexId: string; facing: Facing }[] = [];
    for (const p of a.placements) {
      const r = next.reinforcements.find((x) => x.id === p.unitId);
      if (!r) return deny('no such reinforcement');
      if (r.side !== next.currentSide) return deny('not your turn');
      if (next.round < r.earliestRound)
        return deny(`${r.id} is not available until Round ${r.earliestRound}`);
      if (!next.hexes[p.hexId]) return deny('no such hex');
      if (!legalEntryHexes(next, r).includes(p.hexId))
        return deny(`${p.hexId} is not a legal entry Hex for ${r.id} (§4.12)`);
      entrants.push({ hexId: p.hexId, facing: p.facing ?? r.facing });
    }
    // §4.12: a Group entry (>1 Unit in one Action) must land "on the same or
    // spread out on adjacent entry Hexes" — a single-hex stack or an
    // unbroken same-or-neighbour chain, not scattered hexes.
    if (entrants.length > 1 && !hexesConnected(entrants.map((e) => e.hexId)))
      return deny('a Group entry must be on the same or adjacent entry Hexes (§4.12)');

    // Place each Unit (0AP, §4.12 — the Spent Check/Stress happen below, once
    // for the whole placed Group).
    const placed: Unit[] = [];
    a.placements.forEach((p, i) => {
      const r = next.reinforcements.find((x) => x.id === p.unitId)!;
      const { hexId, facing } = entrants[i]!;
      const unit: Unit = {
        id: r.id,
        side: r.side,
        nation: r.nation,
        templateId: r.templateId,
        hexId,
        facing,
        status: 'fresh',
        stressed: false,
        hitMarkers: [],
        assignedWeaponCards: [],
        hidden: r.hidden || undefined,
      };
      next.units[unit.id] = unit;
      placed.push(unit);
    });
    next.reinforcements = next.reinforcements.filter((r) => !unitIds.includes(r.id));

    log(
      'enter',
      `${unitIds.join('+')} enter${unitIds.length > 1 ? '' : 's'} at ${entrants.map((e) => e.hexId).join(', ')}`,
      next.currentSide,
    );
    updateVictoryHexControl(next);
    // §4.12: 0AP, never a Spent Check, but the Unit(s) are Stressed. Entering as
    // a Group (multiple Units, one Action) reuses the Group-Action Stress-all flow.
    afterGroupAction(placed, 0);
    return finish();
  };

  /**
   * Pre-Mission Setup phase (Mission-configurable): place one `setupPool`
   * Unit onto any empty Hex. Free — no AP, no Spent Check, no Stress, no
   * Turn to hand off (there's no "Turn" yet) — only the facing-correction
   * window (§4.5's mechanism, reused) opens afterward. Once the acting
   * side's pool empties, hand setup to the other side if it still has Units
   * waiting, or finish setup and start the real Round 1.
   */
  const doSetupPlace = (a: Extract<Action, { type: 'SETUP_PLACE' }>): ReduceResult => {
    if (next.phase !== 'setup') return deny('the Setup phase has already ended');
    const pool = next.setupPool ?? [];
    const entry = pool.find((u) => u.id === a.unitId);
    if (!entry) return deny('no such Setup Unit');
    if (entry.side !== next.setupSide) return deny("not your side's turn to set up");
    if (!legalSetupHexes(next).includes(a.hexId)) return deny(`${a.hexId} is not a legal Setup Hex`);

    if (entry.mine) {
      // A Mines token (§17.10): placing it writes the standard Mines obstacle
      // onto the Hex — always hidden (§11's render-layer concealment picks
      // this up like any other hidden feature) — rather than creating a
      // Unit. No facing window (an obstacle has no facing); the engine's
      // existing Mines attack/CAP-mod/destroy mechanics take over unchanged.
      const hex = next.hexes[a.hexId]!;
      if (hex.features.obstacle) return deny(`${a.hexId} already has an Obstacle (§17.0)`);
      if (hex.features.fortification) return deny(`${a.hexId} already has a Fortification (§17.0)`);
      hex.features.obstacle = {
        kind: 'mines',
        hitNumber: entry.mine.hitNumber,
        destroyed: false,
        ownerSide: entry.side,
        hidden: true,
      };
      next.setupPool = pool.filter((u) => u.id !== entry.id);
      log('setup', `Side ${entry.side} places Mines at ${a.hexId} (hidden)`, entry.side);
    } else {
      const unit: Unit = {
        id: entry.id,
        side: entry.side,
        nation: entry.nation,
        templateId: entry.templateId,
        hexId: a.hexId,
        facing: a.facing ?? entry.facing,
        status: 'fresh',
        stressed: false,
        hitMarkers: [],
        assignedWeaponCards: [],
        hidden: entry.hidden || undefined,
      };
      next.units[unit.id] = unit;
      next.setupPool = pool.filter((u) => u.id !== entry.id);
      grantFacingChoice(unit.id);
      log('setup', `${unit.id} sets up at ${a.hexId}`, unit.side);
    }

    const sideDone = !next.setupPool.some((u) => u.side === entry.side);
    if (sideDone) {
      const other = otherSide(entry.side);
      const otherHasMore = next.setupPool.some((u) => u.side === other);
      if (otherHasMore) {
        next.setupSide = other;
        log('setup', `Side ${entry.side} has finished setup — Side ${other} sets up next`);
      } else {
        next.setupSide = undefined;
        updateVictoryHexControl(next);
        log('setup', 'Setup phase complete');
        startRound(next);
      }
    }
    return finish();
  };

  /** §17.6: a Foot Unit spends 5AP to build a Hasty Defense on itself. */
  const doHastyDefense = (a: Extract<Action, { type: 'HASTY_DEFENSE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot build a Hasty Defense (§17.6)');
    const kind = templateOf(next, unit).kind;
    if (kind === 'vehicle' || kind === 'gun') return deny('only Foot Units may build a Hasty Defense (§17.6)');
    if (unit.hastyDefense) return deny('this Unit already has a Hasty Defense');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, 5, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    unit.hastyDefense = true;
    log('hastyDefense', `${unit.id} builds a Hasty Defense (§17.6)`, unit.side);
    afterAction(unit, cost);
    return finish();
  };

  /** §17.6: "a player may freely remove their Hasty Defense at will" — 0AP, no Spent Check, no CAP check. */
  const doRemoveHastyDefense = (a: Extract<Action, { type: 'REMOVE_HASTY_DEFENSE' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (!unit.hastyDefense) return deny('this Unit has no Hasty Defense to remove');
    unit.hastyDefense = false;
    log('hastyDefense', `${unit.id} freely removes its Hasty Defense (§17.6)`, unit.side);
    return finish();
  };

  /**
   * Exit the Map via a Mission-authored exit zone (§4.0 — Mission-specific).
   * Costs the Unit's own move stat as AP, a real Spent Check like a Move.
   * VP goes to the exiting Unit's own side, not the opponent (§9.1, Mission-authored).
   */
  const doExit = (a: Extract<Action, { type: 'EXIT' }>): ReduceResult => {
    const unit = next.units[a.unitId];
    if (!unit) return deny('no such unit');
    if (unit.side !== next.currentSide) return deny('not your turn');
    if (unit.carriedBy) return deny('a transported Unit cannot Exit on its own');
    const eff = effectiveStats(next, unit);
    if (!eff.canMove) return deny('this Unit cannot act (§7.4)');
    const zone = next.exitZones.find((z) => z.side === unit.side && z.hexIds.includes(unit.hexId));
    if (!zone) return deny('this Unit is not on one of its side\'s designated exit Hexes');
    const player = next.players[unit.side];
    const { cost, capsSpent } = planCost(unit, eff.move, a.capCostReduce ?? 0);
    if (unit.status === 'spent' && cost > 0)
      return deny('a Spent unit must spend CAPs to reduce its Action Cost to 0AP (§3.4)');
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;
    delete next.units[unit.id];
    gainVp(next, unit.side, zone.vpPerUnit);
    log('exit', `${unit.id} exits the Map via ${zone.id} (+${zone.vpPerUnit} VP to ${unit.side})`, unit.side);
    afterAction(unit, cost);
    return finish();
  };

  /**
   * Play an Action- or Bonus-type Card (§8.5-8.6). Framework-only scope: this
   * logs the card's full name/cost/effect text and applies only the shared
   * mechanics every card of its type/color shares — the card's own bespoke
   * rules text is NOT mechanically simulated (CLAUDE.md's Cards section).
   * Green cost = an ordinary AP cost (CAP-reducible, Spent-Check-gated, Fresh
   * unless reduced to 0AP); Blue cost = a flat CAP spend, no AP, never a
   * Spent Check, no Unit required. An Action-type card Stresses its Unit and
   * ends the Turn like any other real Action; a Bonus-type card does neither
   * (§8.5: "not themselves Actions") — `currentSide` is left untouched.
   * Deliberately NOT gated on `currentSide` — several cards are explicitly
   * playable "during the opponent's Turn" (§8's Card Catalog), and this
   * engine has no per-card interrupt-timing enforcement (framework scope).
   */
  const doPlayCard = (a: Extract<Action, { type: 'PLAY_CARD' }>): ReduceResult => {
    const check = canPlayCard(next, a.side, a.cardId, a.unitId);
    if (!check.legal || !check.card) return deny(check.reason ?? 'illegal');
    const card = check.card;
    const player = next.players[a.side];
    const unit = a.unitId ? next.units[a.unitId] : undefined;

    let cost = 0;
    let capsSpent = 0;
    if (card.cost!.color === 'green') {
      const planned = planCost(unit!, card.cost!.amount, a.capCostReduce ?? 0);
      cost = planned.cost;
      capsSpent = planned.capsSpent;
      if (unit!.status === 'spent' && cost > 0) {
        return deny("a Spent Unit must spend CAPs to reduce this card's cost to 0AP (§8.6)");
      }
    } else {
      capsSpent = card.cost!.amount; // Blue: the full printed amount is a flat CAP spend (§8.6).
    }
    if (player.capCurrent < capsSpent) return deny('not enough CAP');
    player.capCurrent -= capsSpent;

    log(
      'card',
      `Side ${a.side} plays ${card.name} (#${card.id}${unit ? ` via ${unit.id}` : ''}, ${card.cost!.color === 'green' ? `${cost}AP` : `${capsSpent}CAP`}): ${card.effectText}`,
      a.side,
    );

    // §8.0/§8.2: Battle and Weapon Cards discard when played; Veteran Cards do not.
    if (card.category !== 'veteran') {
      player.hand = player.hand.filter((id) => id !== a.cardId);
      if (card.category === 'battle' && next.cardDeck) next.cardDeck.discardPile.push(a.cardId);
    }

    if (card.cost!.color === 'green') {
      if (cost > 0) {
        const sc = spentCheck(next.rng, cost);
        next.rng = sc.rng;
        if (!sc.fresh) unit!.status = 'spent';
        log('spent', `${unit!.id} Spent Check: rolled ${sc.roll} vs cost ${cost} -> ${sc.fresh ? 'Fresh' : 'Spent'}`, a.side);
      } else {
        log('spent', `${unit!.id} 0AP card — no Spent Check`, a.side);
      }
    }

    if (card.type === 'action') {
      if (unit) {
        for (const u of Object.values(next.units)) if (u.side === a.side) u.stressed = false;
        unit.stressed = true;
      }
      resetPassCycle();
      switchTurn(next);
    }
    return finish();
  };

  /**
   * Activate an Artillery-type Card to plan an OBA Strike (§13.4-13.6): no
   * cost, discards the card, secretly queues `targetHexId` for automatic
   * resolution one Round later (`turn.ts`'s Pre-Round Sequence — see
   * `resolveObaStrike`/`applyResolvedObaStrike`, `engine/cards.ts`).
   * Simplification, documented in CLAUDE.md: the rulebook places this inside
   * the Pre-Round Sequence itself; this engine has no such sub-phase yet, so
   * it's legal any time during the owning side's own Turn instead — free
   * (doesn't end the Turn), since in the real rules this happens entirely
   * outside the Turn structure to begin with.
   */
  const doPlanObaStrike = (a: Extract<Action, { type: 'PLAN_OBA_STRIKE' }>): ReduceResult => {
    if (a.side !== next.currentSide) return deny('not your turn');
    const player = next.players[a.side];
    const card = CARD_CATALOG[a.cardId];
    if (!card || card.type !== 'artillery') return deny('not an Artillery Card');
    if (!player.hand.includes(a.cardId)) return deny('card not in hand');
    if (!next.hexes[a.targetHexId]) return deny('no such hex');
    if (next.obaAllowedRounds && !next.obaAllowedRounds.includes(next.round)) {
      return deny('OBA is not available this Round (§13.4)');
    }
    player.hand = player.hand.filter((id) => id !== a.cardId);
    const resolveRound = next.round + 1;
    next.pendingObaStrikes = [
      ...(next.pendingObaStrikes ?? []),
      { side: a.side, cardId: a.cardId, targetHexId: a.targetHexId, resolveRound },
    ];
    log(
      'oba',
      `Side ${a.side} plans an OBA Strike (${card.name}) on ${a.targetHexId}, resolving Round ${resolveRound} (§13.5)`,
      a.side,
    );
    return finish();
  };

  // -- dispatch -------------------------------------------------------------

  switch (action.type) {
    case 'MOVE':
      return doMove(action);
    case 'PIVOT':
      return doPivot(action);
    case 'CHOOSE_FACING':
      return doChooseFacing(action);
    case 'FIRE':
      return doFire(action);
    case 'CLOSE_COMBAT':
      return doCloseCombat(action);
    case 'INDIRECT_FIRE':
      return doIndirectFire(action);
    case 'FIRE_SMOKE':
      return doFireSmoke(action);
    case 'RALLY':
      return doRally(action);
    case 'STALL':
      return doStall(action);
    case 'GROUP_MOVE':
      return doGroupMove(action);
    case 'GROUP_ATTACK':
      return doGroupAttack(action);
    case 'GROUP_RALLY':
      return doGroupRally(action);
    case 'LOAD':
      return doLoad(action);
    case 'UNLOAD':
      return doUnload(action);
    case 'ENTER':
      return doEnter(action);
    case 'SETUP_PLACE':
      return doSetupPlace(action);
    case 'HASTY_DEFENSE':
      return doHastyDefense(action);
    case 'REMOVE_HASTY_DEFENSE':
      return doRemoveHastyDefense(action);
    case 'EXIT':
      return doExit(action);
    case 'HIDDEN_MOVE':
      return doHiddenMove(action);
    case 'RECON_BY_FIRE':
      return doReconByFire(action);
    case 'PLAY_CARD':
      return doPlayCard(action);
    case 'PLAN_OBA_STRIKE':
      return doPlanObaStrike(action);
    case 'PASS':
      return doPass();
    default:
      return assertNever(action);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
