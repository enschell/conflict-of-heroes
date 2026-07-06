/**
 * Zustand store: engine GameState + pure-UI state (selection, hover, LOS, dice,
 * confirms, turn banner, undo). The store NEVER mutates GameState — it only
 * calls engine `reduce` (CLAUDE.md §3). Dice are previewed deterministically
 * from the seeded RNG so the animation lands on the exact committed result.
 */
import { create } from 'zustand';
import {
  attackContext,
  closeCombatContext,
  closeCombatStructureAr,
  destructibleFeatureAt,
  directionTo,
  effectiveStats,
  groupStress,
  idOf,
  type Modifier,
  initGame,
  isValidSupporter,
  legalActionsForUnit,
  legalEntryHexes,
  minesOwnerSide,
  minesTargetsFor,
  modifiedActionCost,
  moveCost,
  neighbor,
  parseHexId,
  planVehicleMove,
  RALLY_AP_COST,
  reduce,
  resolveHit,
  rollCloseCombat,
  rollIndirectFire,
  rollRally,
  rollStackFire,
  rollStructureDestroy,
  serialize,
  templateOf,
  type AttackRoll,
  type IndirectAttackRoll,
} from '../engine';
import type {
  Action,
  Facing,
  GameEvent,
  GameState,
  HexId,
  HitType,
  MissionDef,
  RngState,
  SideId,
  Unit,
  UnitId,
} from '../engine/types';
import { MISSION_1 } from '../data/missions/mission1';
import { isHopelessShot, MAX_CAP_DICE_MOD, oddsForHitNumber, pct } from '../ui/odds';
import { playFire, playMove } from '../ui/sound';
import {
  clearAuto,
  deleteSlot,
  isGameState,
  loadAuto,
  loadSlot,
  saveAuto,
  saveSlot,
} from './persistence';

/** One die-roll the player makes inside a pending action (e.g. one per enemy in
 *  a stacked-fire shot). `detail` is static (no dice values) so it can show
 *  before the roll; `headline`/`success` are revealed once the dice settle. */
export interface RollStep {
  dice: [number, number];
  success: boolean;
  headline: string;
  detail: string;
  label: string;
  /** AR/DR line items (§6.6/§6.1 etc.) for the dice-roller's modifier breakdown. */
  arMods?: Modifier[];
  drMods?: Modifier[];
  /** % to Hit / Critical, from the same Hit Number the roll is actually judged
   *  against (post-CAP-mod) — matches the fire-odds popup's own numbers. */
  hitPct?: number;
  critPct?: number;
  /**
   * If this roll is a Hit, what it does to the target (§7.4/§7.5) — computed
   * with `resolveHit` from the exact RNG state the reducer will later consume,
   * so the preview can never disagree with what actually happens on commit.
   */
  hitEffect?: { destroyed: boolean; hitType?: HitType };
}

export interface PendingRoll {
  /** The single engine action committed after every step is rolled. */
  action: Action;
  kind: 'fire' | 'rally';
  steps: RollStep[];
  /** §3.2: the CAP dice-mod baked into `steps`' dice/results (0 by default).
   *  Adjustable via the DiceRoller's stepper before the FIRST die of the
   *  sequence is rolled; changing it rebuilds `steps` from the same base
   *  action with the new mod, so the preview always matches what a Roll
   *  would actually commit. Undefined (treated as 0/0) for roll kinds that
   *  don't yet build this (e.g. a bare `{action:{type:'PASS'},...}` test
   *  fixture) — every real request*Roll builder always supplies both. */
  capDiceMod?: number;
  /** Max |capDiceMod| available right now: clamped to ±2 (§3.2) and to the
   *  acting side's remaining CAP after whatever this Action's own
   *  `capCostReduce` already reserves. */
  capDiceModMax?: number;
}

export interface Hover {
  id: HexId;
  x: number;
  y: number;
}

interface Picker {
  hexId: HexId;
  unitIds: UnitId[];
  x: number;
  y: number;
}

interface PendingConfirm {
  message: string;
  proceed: () => void;
}

/**
 * §17.10 Mines CAP-choice: a MOVE/PIVOT/CLOSE_COMBAT about to trigger a live
 * Mines Hex pauses here so the Mines' owning side gets an explicit UI element
 * to spend up to 2 CAP per attacked Unit before rolling (never applied
 * silently — same principle as every other CAP-augmentable roll). `mod` is
 * signed: positive lowers the Hit Number (helps hit an enemy), negative
 * raises it (protects a friendly Unit that blundered into its own field).
 */
interface PendingMines {
  /** Whose CAP pays for the Hit Number modification (§17.10) — the Mines' owner, not necessarily the acting side. */
  ownerSide: SideId;
  targets: { unitId: UnitId; hitNumber: number; mod: number }[];
  /** Called with the base action once every target's mod is decided. */
  proceed: (minesCapMods: Record<UnitId, number>) => void;
}

interface ClickOpts {
  ctrl: boolean;
  x: number;
  y: number;
}

interface Store {
  game: GameState | null;
  selectedUnitId: UnitId | null;
  /** Group Actions (§10): when on, board clicks build/act on a unit Group. */
  groupMode: boolean;
  groupSel: UnitId[];
  /** In-progress vehicle Bonus-Move path (§15.2): the hex steps chosen so far. */
  movePath: HexId[];
  /** Manual reinforcement placement (§4.12): the reinforcement Unit awaiting a
   *  click on one of its highlighted legal entry Hexes. */
  placingReinforcementId: UnitId | null;
  losMode: boolean;
  losSource: HexId | null;
  shiftHeld: boolean;
  /** Pivot picker (P key): highlights the six neighbor Hexes of the selected
   *  Unit, blue like the free facing-choice picker, but clicking one issues a
   *  real PIVOT Action (§4.6 — 1AP + Spent Check), not the free correction. */
  pivotPicker: boolean;
  hover: Hover | null;
  picker: Picker | null;
  /** When a clicked hex affords several actions (move-in vs attack), pick one. */
  chooser: { hexId: HexId; x: number; y: number } | null;
  pendingRoll: PendingRoll | null;
  pendingConfirm: PendingConfirm | null;
  pendingMines: PendingMines | null;
  turnBanner: { round: number } | null;
  history: GameState[];
  /** Redo stack (states undone, newest first). */
  future: GameState[];
  lastEvents: GameEvent[];
  muted: boolean;

  newGame: (def?: MissionDef) => void;
  resume: () => void;
  quitToMenu: () => void;

  select: (unitId: UnitId | null) => void;
  setHover: (h: Hover | null) => void;
  setShift: (down: boolean) => void;
  togglePivotPicker: () => void;
  hexClick: (hexId: HexId, opts: ClickOpts) => void;

  dispatch: (action: Action) => void;
  /** `occupy` (§17.2/17.3): also occupy the destination Hex's Trench/Bunker on
   *  arrival, or (when `toHexId === unitId`'s current Hex) occupy it from
   *  within — entering never auto-occupies, it's the player's choice. */
  move: (unitId: UnitId, toHexId: HexId, occupy?: boolean) => void;
  /** `useFlamethrower` (§18.0): attack with a Flamethrower instead of normal Firepower. */
  fire: (attackerId: UnitId, targetId: UnitId, useFlamethrower?: boolean) => void;
  closeCombat: (attackerId: UnitId, targetId: UnitId, useFlamethrower?: boolean) => void;
  /** §17.12: CC against the Hex's Fortification/Obstacle itself, not its occupant. */
  closeCombatStructure: (attackerId: UnitId) => void;
  rally: (unitId: UnitId) => void;
  pivot: (unitId: UnitId, facing: Facing) => void;
  /** Free facing correction (§4.5/§15.11) — only legal while `game.pendingFacingChoices` includes `unitId`. */
  chooseFacing: (unitId: UnitId, facing: Facing) => void;
  load: (unitId: UnitId, vehicleId: UnitId) => void;
  unload: (unitId: UnitId, toHexId: HexId) => void;
  /** §17.6: build a Hasty Defense on this Unit (5AP, CAP-gated like Rally). */
  hastyDefense: (unitId: UnitId) => void;
  /** §17.6: freely remove this Unit's own Hasty Defense — 0AP, no gate. */
  removeHastyDefense: (unitId: UnitId) => void;
  /** Mortar Indirect Attack (§13.2): a Spotter Hex is picked automatically —
   *  the first legal one, via `legalActionsForUnit`/`bestSpotterFor` (§13.3
   *  places no requirement on WHICH legal Spotter Hex is used, so there's no
   *  player choice to expose here; if no legal Spotter Hex exists, this Hex
   *  just isn't a legal Indirect target). */
  indirectFire: (attackerId: UnitId, targetHexId: HexId) => void;
  /** Fire Smoke (§14.1): Direct if the Unit has its own LOS/arc, else Indirect
   *  via the same auto-picked Spotter Hex as `indirectFire`. */
  fireSmoke: (unitId: UnitId, targetHexId: HexId) => void;
  /** Enter every eligible Unit of one reinforcement wave as a single Group Action (§4.12). */
  enterWave: (waveId: string) => void;
  /** Manual per-Unit entry (§4.12): arm placement mode, then a board click on a
   *  highlighted Hex commits a single-Unit ENTER there. */
  startPlaceReinforcement: (unitId: UnitId) => void;
  cancelPlaceReinforcement: () => void;

  toggleGroupMode: () => void;
  toggleGroupMember: (unitId: UnitId) => void;
  clearGroup: () => void;
  groupMove: (dir: Facing) => void;
  groupRally: () => void;
  groupAttack: (targetId: UnitId) => void;

  extendMovePath: (hexId: HexId) => void;
  commitMovePath: () => void;
  clearMovePath: () => void;

  commitRoll: () => void;
  cancelRoll: () => void;
  /** §3.2: adjust the pending roll's CAP dice mod by `delta` (clamped to
   *  ±2 and to `pendingRoll.capDiceModMax`) and rebuild its preview —
   *  only meaningful before the first die of the sequence is rolled. */
  adjustPendingCapMod: (delta: number) => void;
  confirmProceed: () => void;
  confirmCancel: () => void;
  /** §17.10 Mines CAP-choice dialog: adjust one target's mod (clamped ±2),
   *  commit all of them (dispatching the underlying action), or cancel
   *  (abandons the whole Move/Pivot/Close Combat, same as a Confirm cancel). */
  adjustMinesMod: (unitId: UnitId, delta: number) => void;
  confirmMines: () => void;
  cancelMines: () => void;

  openPicker: (hexId: HexId, unitIds: UnitId[], x: number, y: number) => void;
  closePicker: () => void;
  closeChooser: () => void;
  dismissTurnBanner: () => void;

  toggleLosMode: () => void;
  setLosSource: (hexId: HexId) => void;
  undo: () => void;
  redo: () => void;
  saveToSlot: (name: string) => boolean;
  loadFromSlot: (name: string) => void;
  deleteSlotByName: (name: string) => void;
  exportCurrent: () => string;
  importFromText: (text: string) => boolean;
  toggleMute: () => void;
}

const HISTORY_LIMIT = 100;

/** Action types that go through the single-unit CAP-confirm gate below. */
type GateableAction = Extract<
  Action,
  { type: 'MOVE' | 'FIRE' | 'CLOSE_COMBAT' | 'RALLY' | 'PIVOT' | 'INDIRECT_FIRE' | 'FIRE_SMOKE' | 'HASTY_DEFENSE' }
>;

export const useGame = create<Store>((set, get) => {
  /** The unit that performs a gateable action. */
  const actorOf = (action: GateableAction): UnitId =>
    action.type === 'FIRE' || action.type === 'CLOSE_COMBAT' || action.type === 'INDIRECT_FIRE'
      ? action.attackerId
      : action.unitId;

  /**
   * Gate any action that would spend CAP behind an explicit confirmation (§3.4).
   * Fresh units never spend CAP and proceed directly. A Spent unit may act only
   * by buying its Action Cost down to 0AP with CAPs — so we show how many CAPs
   * that costs and only proceed (with capCostReduce set) once the player accepts.
   * (Group Actions, Load/Unload, and Entry are gated differently — see their own
   * dispatch methods — so this only ever sees the five action types above.)
   */
  const capGate = (action: GateableAction, proceed: (a: GateableAction) => void) => {
    const g = get().game;
    if (!g) return;
    const id = actorOf(action);
    const unit = id ? g.units[id] : null;
    if (!unit || unit.status !== 'spent') {
      proceed(action); // Fresh action — no CAP spent.
      return;
    }
    const cost = modifiedActionCost(g, action);
    if (cost == null) {
      proceed(action); // illegal; let reduce report it
      return;
    }
    const cap = g.players[unit.side].capCurrent;
    if (cap < cost) {
      set({
        lastEvents: [
          { type: 'illegal', round: g.round, text: `${id} is Spent and needs ${cost} CAP (only ${cap} left)` },
        ],
      });
      return;
    }
    set({
      pendingConfirm: {
        message:
          `${id} is Spent. Spend ${cost} CAP to take this Action at 0AP (§3.4)? ` +
          `CAP ${cap} → ${cap - cost}.`,
        proceed: () => proceed({ ...action, capCostReduce: cost }),
      },
    });
  };

  /**
   * §17.10: if `hexId` has live Mines and `unitIds` would trigger it (a Move
   * landing there, a Pivot happening there, or a Close Combat initiated
   * there — the caller decides which), pause for the Mines-owning side's
   * explicit CAP choice per attacked Unit before calling `proceed` with the
   * final action (mods baked in as `minesCapMods`). No mines present ⇒
   * proceeds immediately, no dialog.
   */
  const maybeMinesGate = <A extends { minesCapMods?: Record<UnitId, number> }>(
    action: A,
    hexId: HexId,
    unitIds: UnitId[],
    proceed: (a: A) => void,
  ) => {
    const g = get().game;
    if (!g) return;
    const targets = minesTargetsFor(g, hexId, unitIds);
    const owner = minesOwnerSide(g, hexId);
    if (!targets.length || !owner) {
      proceed(action);
      return;
    }
    set({
      pendingMines: {
        ownerSide: owner,
        targets: targets.map((t) => ({ ...t, mod: 0 })),
        proceed: (minesCapMods) => proceed({ ...action, minesCapMods }),
      },
    });
  };

  /**
   * Like `capGate`, but for a Group Action (§10.1/§10.10): if ANY member is
   * Spent, the whole Group may act only by paying CAPs down to a 0AP Group
   * cost — so show that confirmation before proceeding, same as the
   * single-unit flow. `costBeforeCap` is the Group Action Cost (already
   * including Group Stress, §10.11) before any CAP reduction.
   */
  const groupCapGate = (
    members: Unit[],
    costBeforeCap: number,
    onProceed: (capCostReduce: number) => void,
  ) => {
    const g = get().game;
    if (!g) return;
    if (!members.some((u) => u.status === 'spent')) {
      onProceed(0); // every member Fresh — no CAP spent.
      return;
    }
    const side = members[0]!.side;
    const cap = g.players[side].capCurrent;
    if (cap < costBeforeCap) {
      set({
        lastEvents: [
          {
            type: 'illegal',
            round: g.round,
            text: `Group has a Spent Unit and needs ${costBeforeCap} CAP (only ${cap} left)`,
          },
        ],
      });
      return;
    }
    set({
      pendingConfirm: {
        message:
          `A Spent Unit is in this Group. Spend ${costBeforeCap} CAP to take this Action at 0AP ` +
          `(§10.1/§3.4)? CAP ${cap} → ${cap - costBeforeCap}.`,
        proceed: () => onProceed(costBeforeCap),
      },
    });
  };

  /**
   * Load/Unload (§15.7/§15.9) look up an already-precomputed action from
   * `legalActionsForUnit`, which bakes in the exact `capCostReduce` needed
   * when either member is Spent — this only adds the missing "spend N CAP?"
   * confirm before dispatching it (CAPs must never be spent silently).
   */
  const confirmPrecomputedCap = (
    action: Action & { capCostReduce?: number },
    label: string,
    proceed: () => void,
  ) => {
    const g = get().game;
    if (!g || !action.capCostReduce) {
      proceed();
      return;
    }
    const cap = g.players[g.currentSide].capCurrent;
    const cost = action.capCostReduce;
    set({
      pendingConfirm: {
        message: `A Spent Unit/Vehicle is involved. Spend ${cost} CAP to ${label} at 0AP (§3.4)? CAP ${cap} → ${cap - cost}.`,
        proceed,
      },
    });
  };

  /** Common UI reset when a whole new GameState is loaded/imported. */
  const resetForLoad = () => ({
    selectedUnitId: null,
    groupSel: [] as UnitId[],
    movePath: [] as HexId[],
    placingReinforcementId: null,
    history: [] as GameState[],
    future: [] as GameState[],
    picker: null,
    chooser: null,
    pendingRoll: null,
    pendingConfirm: null,
    pendingMines: null,
    turnBanner: null,
    losMode: false,
    losSource: null,
    pivotPicker: false,
    hover: null,
  });

  /**
   * Preview what each Hit in a sequence of rolls will do to its target
   * (§7.4/§7.5), threading the RNG exactly as the reducer's own sequential
   * `applyHit` calls will (all dice first, then hit-marker draws in target
   * order — see `doFire`/`doIndirectFire`) — so it can never disagree with
   * what actually happens once the roll is committed.
   */
  const previewHitEffects = (
    g: GameState,
    rolls: { targetId: UnitId; roll: Pick<AttackRoll | IndirectAttackRoll, 'hit' | 'critical' | 'fpColor'> }[],
    startRng: RngState,
  ): (RollStep['hitEffect'] | undefined)[] => {
    let rng = startRng;
    return rolls.map(({ targetId, roll }) => {
      if (!roll.hit) return undefined;
      const target = g.units[targetId];
      if (!target) return undefined;
      const res = resolveHit(g, target, roll.critical, roll.fpColor, rng);
      rng = res.rng;
      if (res.outcome.kind === 'marked') return { destroyed: false, hitType: res.outcome.hitType };
      if (res.outcome.kind === 'destroyed-drawn') return { destroyed: true, hitType: res.outcome.hitType };
      return { destroyed: true };
    });
  };

  /**
   * §3.2: the max |capDiceMod| a roll may spend right now — clamped to ±2 and
   * to the acting side's CAP remaining after this Action's own
   * `capCostReduce` (already decided via capGate, before the roll preview).
   */
  const capDiceModMaxFor = (g: GameState, sideId: SideId, capCostReduce?: number): number =>
    Math.max(0, Math.min(MAX_CAP_DICE_MOD, g.players[sideId].capCurrent - (capCostReduce ?? 0)));

  const requestFireRoll = (action: Extract<Action, { type: 'FIRE' }>, capDiceMod = 0) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    const target = g.units[action.targetId];
    if (!attacker || !target) return;
    const useFlamethrower = action.useFlamethrower ?? false;
    const ctx = attackContext(g, attacker, target, 0, 0, useFlamethrower);
    if (!ctx.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
      return;
    }
    // §7.5.1: a shot at the target's hex resolves against every enemy stacked
    // there — the player rolls each one in turn (one step per enemy).
    const stack = rollStackFire(g, attacker, target.hexId, capDiceMod, 0, useFlamethrower);
    const hitEffects = previewHitEffects(g, stack.rolls, stack.rng);
    const steps: RollStep[] = stack.rolls.map(({ targetId: tid, roll }, i) => {
      const odds = oddsForHitNumber(roll.hitNumber);
      return {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
        detail: `${useFlamethrower ? 'Flamethrower (§18.0) · ' : ''}AR ${roll.ar} vs DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}${roll.isFlank ? ' (flank)' : ''}`,
        label: `${action.attackerId} ${useFlamethrower ? '🔥' : '→'} ${tid}`,
        arMods: roll.arMods,
        drMods: roll.drMods,
        hitEffect: hitEffects[i],
        hitPct: pct(odds.hit),
        critPct: pct(odds.crit),
      };
    });
    // §17.11: ranged Fire also resolves an automatic second roll against the
    // target Hex's destructible Fortification/Obstacle, if any, under this
    // SAME Spent Check — reuses the same AR (`ctx.ar`) and CAP dice mod as the
    // occupant roll(s). Threaded from `stack.rng` (post-occupant-rolls) so the
    // preview consumes the RNG in the exact order the reducer's `doFire` will.
    const feature = destructibleFeatureAt(g.hexes[target.hexId]!);
    if (feature) {
      const structRoll = rollStructureDestroy({ ...g, rng: stack.rng }, ctx.ar, feature.destroyDr!, capDiceMod);
      const odds = oddsForHitNumber(structRoll.hitNumber);
      steps.push({
        dice: structRoll.dice,
        success: structRoll.hit,
        headline: structRoll.hit ? 'FORTIFICATION DESTROYED' : 'FORTIFICATION SURVIVES',
        detail: `Structure DR ${feature.destroyDr} (flat, no Terrain) vs AR ${ctx.ar} — 2d6 ≥ ${structRoll.hitNumber}`,
        label: `${action.attackerId} → ${target.hexId}'s Fortification/Obstacle`,
        drMods: [{ label: 'Structure Defense (flat)', value: feature.destroyDr!, section: '§17.11' }],
        hitPct: pct(odds.hit),
        critPct: pct(odds.crit),
      });
    }
    if (!steps.length) return;
    const capDiceModMax = capDiceModMaxFor(g, attacker.side, action.capCostReduce);
    set({ pendingRoll: { action: { ...action, capDiceMod }, kind: 'fire', steps, capDiceMod, capDiceModMax } });
  };

  const requestIndirectFireRoll = (action: Extract<Action, { type: 'INDIRECT_FIRE' }>, capDiceMod = 0) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    if (!attacker) return;
    // §13.2: resolves against every enemy in the Target Hex (like §7.5.1 Stacked
    // Fire), one roll per Unit — `rollIndirectFire` itself re-validates legality.
    const result = rollIndirectFire(g, attacker, action.targetHexId, action.spotterHexId, capDiceMod);
    if (!result.rolls.length) return;
    const hitEffects = previewHitEffects(
      g,
      result.rolls.map((roll) => ({ targetId: roll.targetId, roll })),
      result.rng,
    );
    const steps: RollStep[] = result.rolls.map((roll, i) => {
      const odds = oddsForHitNumber(roll.hitNumber);
      return {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
        detail: `Indirect (HE) · AR ${roll.ar} vs flank DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}`,
        label: `${action.attackerId} ⇒ ${roll.targetId}`,
        arMods: roll.arMods,
        drMods: roll.drMods,
        hitEffect: hitEffects[i],
        hitPct: pct(odds.hit),
        critPct: pct(odds.crit),
      };
    });
    const capDiceModMax = capDiceModMaxFor(g, attacker.side, action.capCostReduce);
    set({ pendingRoll: { action: { ...action, capDiceMod }, kind: 'fire', steps, capDiceMod, capDiceModMax } });
  };

  const requestCcRoll = (action: Extract<Action, { type: 'CLOSE_COMBAT' }>, capDiceMod = 0) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    if (!attacker) return;

    // §17.12: CC against the Fortification/Obstacle itself instead of its
    // occupant — a single flat-DR roll, no Terrain modifiers.
    if (action.targetKind === 'structure') {
      const feature = destructibleFeatureAt(g.hexes[attacker.hexId]!);
      if (!feature) {
        set({ lastEvents: [{ type: 'illegal', round: g.round, text: 'nothing destructible here' }] });
        return;
      }
      const { ar } = closeCombatStructureAr(g, attacker);
      const roll = rollStructureDestroy(g, ar, feature.destroyDr!, capDiceMod);
      const odds = oddsForHitNumber(roll.hitNumber);
      const capDiceModMax = capDiceModMaxFor(g, attacker.side, action.capCostReduce);
      set({
        pendingRoll: {
          action: { ...action, capDiceMod },
          kind: 'fire',
          capDiceMod,
          capDiceModMax,
          steps: [
            {
              dice: roll.dice,
              success: roll.hit,
              headline: roll.hit ? 'FORTIFICATION DESTROYED' : 'FORTIFICATION SURVIVES',
              detail: `close combat (§17.12) · Structure DR ${feature.destroyDr} (flat) vs AR ${ar} — 2d6 ≥ ${roll.hitNumber}`,
              label: `${action.attackerId} ⚔ Fortification/Obstacle`,
              drMods: [{ label: 'Structure Defense (flat)', value: feature.destroyDr!, section: '§17.12' }],
              hitPct: pct(odds.hit),
              critPct: pct(odds.crit),
            },
          ],
        },
      });
      return;
    }

    const target = g.units[action.targetId!];
    if (!target) return;
    const useFlamethrower = action.useFlamethrower ?? false;
    const ctx = closeCombatContext(g, attacker, target, 0, useFlamethrower);
    if (!ctx.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
      return;
    }
    const roll = rollCloseCombat(g, attacker, target, capDiceMod, 0, useFlamethrower);
    const [hitEffect] = previewHitEffects(g, [{ targetId: target.id, roll }], roll.rng);
    const ccOdds = oddsForHitNumber(roll.hitNumber);
    const capDiceModMax = capDiceModMaxFor(g, attacker.side, action.capCostReduce);
    set({
      pendingRoll: {
        action: { ...action, capDiceMod },
        kind: 'fire',
        capDiceMod,
        capDiceModMax,
        steps: [
          {
            dice: roll.dice,
            success: roll.hit,
            headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
            detail: `${useFlamethrower ? 'Flamethrower (§18.0) close combat' : 'close combat'} · AR ${roll.ar} vs flank DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}`,
            label: `${action.attackerId} ${useFlamethrower ? '🔥⚔' : '⚔'} ${target.id}`,
            arMods: roll.arMods,
            drMods: roll.drMods,
            hitEffect,
            hitPct: pct(ccOdds.hit),
            critPct: pct(ccOdds.crit),
          },
        ],
      },
    });
  };

  /**
   * Group Attack (§10.5–§10.8), ranged OR Close Combat (§10.6, when the Leader
   * shares the Target's hex) — previews the roll the same way single-unit Fire/
   * Close Combat do, instead of resolving instantly with no confirmation.
   */
  const requestGroupAttackRoll = (
    leaderId: UnitId,
    supporterIds: UnitId[],
    targetId: UnitId,
    capCostReduce: number,
    capDiceMod = 0,
  ) => {
    const g = get().game;
    if (!g) return;
    const leader = g.units[leaderId];
    const target = g.units[targetId];
    if (!leader || !target) return;
    const arBonus = supporterIds.length;
    const isCloseCombat = target.hexId === leader.hexId;
    const action: Action = { type: 'GROUP_ATTACK', leaderId, supporterIds, targetId, capCostReduce, capDiceMod };
    const label = `[${[leaderId, ...supporterIds].join('+')}]`;
    const capDiceModMax = capDiceModMaxFor(g, leader.side, capCostReduce);

    if (isCloseCombat) {
      const ctx = closeCombatContext(g, leader, target, arBonus);
      if (!ctx.legal) {
        set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
        return;
      }
      const roll = rollCloseCombat(g, leader, target, capDiceMod, arBonus);
      const [hitEffect] = previewHitEffects(g, [{ targetId, roll }], roll.rng);
      const groupCcOdds = oddsForHitNumber(roll.hitNumber);
      set({
        pendingRoll: {
          action,
          kind: 'fire',
          capDiceMod,
          capDiceModMax,
          steps: [
            {
              dice: roll.dice,
              success: roll.hit,
              headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
              detail: `Group close combat · AR ${roll.ar} vs flank DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}`,
              label: `${label} ⚔ ${targetId}`,
              arMods: roll.arMods,
              drMods: roll.drMods,
              hitEffect,
              hitPct: pct(groupCcOdds.hit),
              critPct: pct(groupCcOdds.crit),
            },
          ],
        },
      });
      return;
    }

    const ctx = attackContext(g, leader, target, 0, arBonus);
    if (!ctx.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
      return;
    }
    // §7.5.1: one shot at the target's hex resolves against every enemy stacked there.
    const stack = rollStackFire(g, leader, target.hexId, capDiceMod, arBonus);
    if (!stack.rolls.length) return;
    const hitEffects = previewHitEffects(g, stack.rolls, stack.rng);
    const steps: RollStep[] = stack.rolls.map(({ targetId: tid, roll }, i) => {
      const odds = oddsForHitNumber(roll.hitNumber);
      return {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
        detail: `Group AR ${roll.ar} vs DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}${roll.isFlank ? ' (flank)' : ''}`,
        label: `${label} → ${tid}`,
        arMods: roll.arMods,
        drMods: roll.drMods,
        hitEffect: hitEffects[i],
        hitPct: pct(odds.hit),
        critPct: pct(odds.crit),
      };
    });
    set({ pendingRoll: { action, kind: 'fire', steps, capDiceMod, capDiceModMax } });
  };

  const requestRallyRoll = (action: Extract<Action, { type: 'RALLY' }>, capDiceMod = 0) => {
    const g = get().game;
    if (!g) return;
    const unit = g.units[action.unitId];
    if (!unit) return;
    const rr = rollRally(g, unit, capDiceMod);
    if (!rr.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: rr.reason ?? 'illegal' }] });
      return;
    }
    const mod = rr.total - rr.roll; // cover/stacking/CAP modifiers (no dice)
    const capDiceModMax = capDiceModMaxFor(g, unit.side, action.capCostReduce);
    set({
      pendingRoll: {
        action: { ...action, capDiceMod },
        kind: 'rally',
        capDiceMod,
        capDiceModMax,
        steps: [
          {
            dice: rr.dice,
            success: rr.success,
            headline: rr.success ? 'RALLIED' : 'NO RALLY',
            detail: `needs ${rr.target}+ on 2d6${mod ? ` (${mod > 0 ? '+' : ''}${mod} mods)` : ''}`,
            label: `${action.unitId} rallies`,
          },
        ],
      },
    });
  };

  return {
    game: null,
    selectedUnitId: null,
    groupMode: false,
    groupSel: [],
    movePath: [],
    placingReinforcementId: null,
    losMode: false,
    losSource: null,
    shiftHeld: false,
    pivotPicker: false,
    hover: null,
    picker: null,
    chooser: null,
    pendingRoll: null,
    pendingConfirm: null,
    pendingMines: null,
    turnBanner: null,
    history: [],
    future: [],
    lastEvents: [],
    muted: false,

    newGame: (def = MISSION_1) => {
      const game = initGame(def);
      saveAuto(game);
      set({
        game,
        selectedUnitId: null,
        groupMode: false,
        groupSel: [],
        movePath: [],
        placingReinforcementId: null,
        losMode: false,
        losSource: null,
        pivotPicker: false,
        hover: null,
        picker: null,
        chooser: null,
        pendingRoll: null,
        pendingConfirm: null,
        pendingMines: null,
        turnBanner: null,
        history: [],
        future: [],
        lastEvents: [],
      });
    },

    resume: () => {
      const game = loadAuto();
      if (game) set({ game, ...resetForLoad(), lastEvents: [] });
    },

    quitToMenu: () => {
      clearAuto();
      set({ game: null, ...resetForLoad(), losMode: false });
    },

    select: (unitId) => set({ selectedUnitId: unitId, movePath: [], pivotPicker: false }),
    setHover: (h) => set({ hover: h }),
    setShift: (down) => set({ shiftHeld: down }),
    togglePivotPicker: () => set((s) => ({ pivotPicker: s.selectedUnitId ? !s.pivotPicker : false })),

    hexClick: (hexId, opts) => {
      const { game, losMode, selectedUnitId, pendingRoll, pendingConfirm, turnBanner } = get();
      if (!game || pendingRoll || pendingConfirm || turnBanner) return;

      // A board click anywhere dismisses an open action chooser.
      if (get().chooser) {
        set({ chooser: null });
        return;
      }

      // Manual reinforcement placement (§4.12): the click commits this Unit to
      // a legal entry Hex; any other click is ignored (Cancel clears the mode).
      const placingId = get().placingReinforcementId;
      if (placingId) {
        const r = game.reinforcements.find((x) => x.id === placingId);
        if (r && legalEntryHexes(game, r).includes(hexId)) {
          get().dispatch({ type: 'ENTER', placements: [{ unitId: placingId, hexId, facing: r.facing }] });
          set({ placingReinforcementId: null });
        }
        return;
      }

      // Free facing correction (§4.5/§15.11): while the selected Unit has an
      // open CHOOSE_FACING window, clicking one of its six highlighted (blue)
      // neighbor Hexes faces it that way — an alternative to the arrow-button
      // picker in Inspector.tsx, which still works too.
      if (selectedUnitId && game.pendingFacingChoices?.includes(selectedUnitId)) {
        const u = game.units[selectedUnitId];
        const dir = u ? directionTo(u.hexId, hexId) : -1;
        if (dir >= 0) {
          get().chooseFacing(selectedUnitId, dir as Facing);
          return;
        }
      }

      // Pivot picker (P key): clicking one of the six highlighted (blue)
      // neighbor Hexes issues a real PIVOT Action (§4.6) toward it — unlike
      // the free facing-correction above, this costs AP and runs a Spent
      // Check/CAP-confirm via the normal `pivot()` → `capGate` path.
      if (get().pivotPicker && selectedUnitId) {
        const u = game.units[selectedUnitId];
        const dir = u ? directionTo(u.hexId, hexId) : -1;
        set({ pivotPicker: false });
        if (dir >= 0) {
          get().pivot(selectedUnitId, dir as Facing);
        }
        return;
      }

      if (losMode) {
        set({ losSource: hexId });
        return;
      }

      // Group mode (§10): clicks build the Group, or Group-attack an enemy hex.
      if (get().groupMode) {
        const hereU = Object.values(game.units).filter((u) => u.hexId === hexId);
        const enemy = hereU.find((u) => u.side !== game.currentSide);
        if (enemy && get().groupSel.length > 0) {
          get().groupAttack(enemy.id);
          return;
        }
        // §10.1: a Spent Unit may join a Group too (only the resulting Group
        // Action Cost matters — see `groupCapGate`), so don't filter them out
        // of the click-to-add here, or a Spent Unit could never join a Group.
        const ownHere = hereU.filter((u) => u.side === game.currentSide);
        if (ownHere.length) {
          const sel = get().groupSel;
          const allIn = ownHere.every((u) => sel.includes(u.id));
          set({
            groupSel: allIn
              ? sel.filter((id) => !ownHere.some((u) => u.id === id))
              : [...new Set([...sel, ...ownHere.map((u) => u.id)])],
          });
        }
        return;
      }

      // A vehicle Bonus-Move path in progress: clicks extend/commit it (§15.2).
      if (get().movePath.length > 0) {
        get().extendMovePath(hexId);
        return;
      }

      const here = Object.values(game.units).filter((u) => u.hexId === hexId);

      // Ctrl+click on a stacked hex → manual picker.
      if (opts.ctrl && here.length > 1) {
        get().openPicker(hexId, here.map((u) => u.id), opts.x, opts.y);
        return;
      }

      // If a unit is selected, resolve what the click on this hex means.
      const sel = selectedUnitId ? game.units[selectedUnitId] : null;
      if (sel && sel.side === game.currentSide) {
        const acts = legalActionsForUnit(game, sel.id);

        // A Transported/Towed Unit (§15.8) has no Move/Fire of its own — its
        // Unload Hexes (under or adjacent to its Vehicle) render green like a
        // Move (Board.tsx). Clicking one always asks first (Unloading isn't
        // something to trigger by accident): an adjacent Hex is unambiguous
        // (just "unload here?"), but the Vehicle's own Hex is ambiguous with
        // "deselect" (the normal click-selected-unit-to-deselect behavior),
        // so that one opens the chooser instead of a plain confirm.
        if (sel.carriedBy) {
          const unloadAct = acts.find((a) => a.type === 'UNLOAD' && a.toHexId === hexId);
          if (unloadAct) {
            const carrier = game.units[sel.carriedBy];
            if (carrier && hexId === carrier.hexId) {
              set({ chooser: { hexId, x: opts.x, y: opts.y } });
            } else {
              set({
                pendingConfirm: {
                  message: `Unload ${sel.id} to ${hexId}?`,
                  proceed: () => get().unload(sel.id, hexId),
                },
              });
            }
            return;
          }
        }

        const enemy = here.find((u) => u.side !== game.currentSide);
        // Rules-legal (NOT CAP-gated) — mirrors the odds popup's own legality
        // check (Board.tsx's `attackContext`/`closeCombatContext` calls), so a
        // Spent Unit that merely lacks enough CAP *right now* still gets
        // OFFERED the choice instead of the option silently vanishing;
        // fire()/move()/closeCombat() already run the CAP confirm/rejection
        // flow themselves once chosen (§3.4). `legalActionsForUnit`'s CAP
        // gating would otherwise make a click default straight to whichever
        // single action happened to be affordable — e.g. auto-Move a Spent
        // Vehicle that also had a legal (but not-yet-CAP-affordable) shot.
        const canMoveHere = !sel.carriedBy && moveCost(game, sel, hexId).ap != null;
        // §3.2: a shot that can never Hit even with the max 2-CAP dice mod is
        // blocked here — not a rules illegality (the reducer would still
        // accept it if dispatched directly), just a UI convenience so a click
        // can't walk the player into a guaranteed-wasted Action/dice roll.
        const fireCtx = enemy && !sel.carriedBy ? attackContext(game, sel, enemy) : null;
        const canFire = !!fireCtx?.legal && !isHopelessShot(fireCtx.hitNumber);
        const ccCtx = enemy && !sel.carriedBy ? closeCombatContext(game, sel, enemy) : null;
        const canCC = !!ccCtx?.legal && !isHopelessShot(ccCtx.hitNumber);
        // §17.2/17.3: a distinct "move here AND occupy" option — the same Hex
        // may also just be a plain move target (`canMoveHere` above) when the
        // Unit chooses not to occupy. Reuses `legalActionsForUnit`'s own
        // enumeration (which already covers both the adjacent-arrival case and
        // the same-hex occupy-from-within case) rather than re-deriving it.
        const canOccupyFortification = acts.some(
          (a) => a.type === 'MOVE' && a.toHexId === hexId && a.occupyFortification,
        );
        // §17.12: CC against the Hex's Fortification/Obstacle itself — only
        // possible in the Unit's OWN Hex (CC always shares a Hex) and mutually
        // exclusive with attacking an occupant there (`canCC` above).
        const canAttackFortification =
          hexId === sel.hexId &&
          !sel.carriedBy &&
          templateOf(game, sel).attackMode !== 'none' &&
          !!destructibleFeatureAt(game.hexes[hexId]!);
        // Mortar Indirect Attack (§13.2) — an Attack, so only vs an enemy-
        // occupied Hex (an alternative to normal Fire, e.g. when it's out of
        // the Mortar's own LOS but a Spotter Hex can still see it).
        const canIndirectFire =
          !!enemy && acts.some((a) => a.type === 'INDIRECT_FIRE' && a.targetHexId === hexId);
        // Fire Smoke (§14.0) targets terrain, not a Unit — legal on ANY Hex a
        // Mortar can reach (occupied or not, e.g. to screen your own advance).
        const canFireSmoke = acts.some((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === hexId);
        // Load (§15.7): clicking a hex with an eligible friendly Vehicle (same
        // hex or adjacent) may mean "just move/stack here" as well as "load onto
        // it" — offer both via the chooser when ambiguous (§5.4-style choice).
        const loadVehicleId = here.find(
          (u) => u.side === sel.side && acts.some((a) => a.type === 'LOAD' && a.vehicleId === u.id),
        )?.id;
        const canLoad = !!loadVehicleId;
        const optionCount =
          Number(canMoveHere) +
          Number(canFire) +
          Number(canCC) +
          Number(canOccupyFortification) +
          Number(canAttackFortification) +
          Number(canIndirectFire) +
          Number(canFireSmoke) +
          Number(canLoad);

        // Several things are possible here (e.g. move INTO an enemy hex vs attack
        // it) → let the player choose (§5.4). Otherwise do the single option.
        if (optionCount > 1) {
          set({ chooser: { hexId, x: opts.x, y: opts.y } });
          return;
        }
        if (canMoveHere) {
          get().move(sel.id, hexId);
          return;
        }
        if (canOccupyFortification) {
          get().move(sel.id, hexId, true);
          return;
        }
        if (canAttackFortification) {
          get().closeCombatStructure(sel.id);
          return;
        }
        if (canFire && enemy) {
          get().fire(sel.id, enemy.id);
          return;
        }
        if (canCC && enemy) {
          get().closeCombat(sel.id, enemy.id);
          return;
        }
        if (canIndirectFire) {
          get().indirectFire(sel.id, hexId);
          return;
        }
        if (canFireSmoke) {
          get().fireSmoke(sel.id, hexId);
          return;
        }
        if (canLoad && loadVehicleId) {
          get().load(sel.id, loadVehicleId);
          return;
        }
        // Click the already-selected unit → deselect.
        if (here.some((u) => u.id === sel.id)) {
          set({ selectedUnitId: null });
          return;
        }
      }

      // Selection: prefer this side's unspent unit; popup if more than one.
      const own = here.filter((u) => u.side === game.currentSide);
      if (own.length === 0) {
        set({ selectedUnitId: null });
        return;
      }
      const unspent = own.filter((u) => u.status !== 'spent');
      if (unspent.length === 1) {
        set({ selectedUnitId: unspent[0]!.id });
      } else if (unspent.length > 1) {
        get().openPicker(hexId, unspent.map((u) => u.id), opts.x, opts.y);
      } else {
        set({ selectedUnitId: own[0]!.id }); // all spent — select for inspection
      }
    },

    dispatch: (action) => {
      const { game, history } = get();
      if (!game) return;
      const res = reduce(game, action);
      const illegal = res.events.length === 1 && res.events[0]?.type === 'illegal';
      if (illegal) {
        set({ lastEvents: res.events });
        return;
      }
      // Pure-presentation SFX based on the action just committed.
      if (action.type === 'MOVE') {
        const u = game.units[action.unitId];
        const kind = u ? game.templates[u.templateId]?.kind : undefined;
        if (kind) playMove(kind, get().muted);
      } else if (action.type === 'FIRE' || action.type === 'CLOSE_COMBAT') {
        const u = game.units[action.attackerId];
        const kind = u ? game.templates[u.templateId]?.kind : undefined;
        if (kind) playFire(kind, get().muted);
      }
      // §4.5/§15.11: right after a Move/Unload grants a free facing correction,
      // auto-select the Unit awaiting it — it just switched control to the
      // other side, so normal click-to-select (current-side-only) couldn't
      // reach it otherwise. The most recently granted Unit wins if several.
      const pending = res.state.pendingFacingChoices;
      const selectedUnitId = pending?.length
        ? pending[pending.length - 1]!
        : get().selectedUnitId && res.state.units[get().selectedUnitId!]
          ? get().selectedUnitId
          : null;
      const advancedRound = res.state.round > game.round && res.state.phase === 'playing';
      saveAuto(res.state);
      set({
        game: res.state,
        history: [...history, game].slice(-HISTORY_LIMIT),
        future: [], // a fresh action invalidates the redo stack
        lastEvents: res.events,
        selectedUnitId,
        turnBanner: advancedRound ? { round: res.state.round } : get().turnBanner,
      });
    },

    move: (unitId, toHexId, occupy) => {
      const g = get().game;
      const u = g?.units[unitId];
      // Vehicles build a Bonus-Move path (§15.2); foot units move one hex.
      // (A same-hex occupy-from-within Move, §17.3, is never a Vehicle Move —
      // `canOccupy` already denies Vehicles — so this branch is unreachable then.)
      if (g && u && g.templates[u.templateId]?.kind === 'vehicle' && toHexId !== u.hexId) {
        get().extendMovePath(toHexId);
        return;
      }
      capGate({ type: 'MOVE', unitId, toHexId, occupyFortification: occupy }, (a) => {
        const action = a as Extract<Action, { type: 'MOVE' }>;
        const game = get().game;
        const passenger = game ? Object.values(game.units).find((x) => x.carriedBy === unitId) : undefined;
        maybeMinesGate(action, toHexId, passenger ? [unitId, passenger.id] : [unitId], (a2) => get().dispatch(a2));
      });
    },
    fire: (attackerId, targetId, useFlamethrower) =>
      capGate({ type: 'FIRE', attackerId, targetId, useFlamethrower }, (a) =>
        requestFireRoll(a as Extract<Action, { type: 'FIRE' }>),
      ),
    closeCombat: (attackerId, targetId, useFlamethrower) =>
      capGate({ type: 'CLOSE_COMBAT', attackerId, targetId, useFlamethrower }, (a) => {
        const action = a as Extract<Action, { type: 'CLOSE_COMBAT' }>;
        const hexId = get().game?.units[attackerId]?.hexId;
        if (!hexId) return;
        maybeMinesGate(action, hexId, [attackerId], (a2) => requestCcRoll(a2));
      }),
    closeCombatStructure: (attackerId) =>
      capGate({ type: 'CLOSE_COMBAT', attackerId, targetKind: 'structure' }, (a) => {
        const action = a as Extract<Action, { type: 'CLOSE_COMBAT' }>;
        const hexId = get().game?.units[attackerId]?.hexId;
        if (!hexId) return;
        maybeMinesGate(action, hexId, [attackerId], (a2) => requestCcRoll(a2));
      }),
    rally: (unitId) =>
      capGate({ type: 'RALLY', unitId }, (a) =>
        requestRallyRoll(a as Extract<Action, { type: 'RALLY' }>),
      ),
    pivot: (unitId, facing) =>
      capGate({ type: 'PIVOT', unitId, facing }, (a) => {
        const action = a as Extract<Action, { type: 'PIVOT' }>;
        const hexId = get().game?.units[unitId]?.hexId;
        if (!hexId) return;
        maybeMinesGate(action, hexId, [unitId], (a2) => get().dispatch(a2));
      }),
    // Free, 0AP, no Spent Check — bypasses capGate entirely (that's only for
    // Spent-Unit CAP costs, which don't apply here).
    chooseFacing: (unitId, facing) => get().dispatch({ type: 'CHOOSE_FACING', unitId, facing }),

    // §17.6: build a Hasty Defense — no roll, so straight through capGate to dispatch (like pivot's structure, minus the Mines gate: building one never moves/pivots into a Mines Hex).
    hastyDefense: (unitId) =>
      capGate({ type: 'HASTY_DEFENSE', unitId }, (a) => get().dispatch(a)),
    // §17.6 "at will": 0AP, no Spent Check, no CAP gate at all.
    removeHastyDefense: (unitId) => get().dispatch({ type: 'REMOVE_HASTY_DEFENSE', unitId }),

    // Load/Unload (§15.7/§15.9) are Group Actions: legalActionsForUnit already
    // bakes in the right capCostReduce when either the Unit or the Vehicle is
    // Spent (matching how GROUP_MOVE/GROUP_RALLY/GROUP_ATTACK are dispatched
    // below), so we look up and dispatch the exact precomputed action.
    load: (unitId, vehicleId) => {
      const g = get().game;
      if (!g) return;
      const act = legalActionsForUnit(g, unitId).find(
        (a): a is Extract<Action, { type: 'LOAD' }> => a.type === 'LOAD' && a.vehicleId === vehicleId,
      );
      if (act) confirmPrecomputedCap(act, `Load onto ${vehicleId} (§15.7)`, () => get().dispatch(act));
    },
    unload: (unitId, toHexId) => {
      const g = get().game;
      if (!g) return;
      const act = legalActionsForUnit(g, unitId).find(
        (a): a is Extract<Action, { type: 'UNLOAD' }> => a.type === 'UNLOAD' && a.toHexId === toHexId,
      );
      if (act) confirmPrecomputedCap(act, `Unload to ${toHexId} (§15.9)`, () => get().dispatch(act));
    },

    // Indirect Fire/Fire Smoke (§13.2/§14.1) look up the exact precomputed
    // action `legalActionsForUnit` already offers for this Target Hex — which
    // picks a Spotter Hex via `bestSpotterFor` (the first legal one) — then run
    // it through the same CAP-confirm gate as FIRE/CLOSE_COMBAT. An explicit
    // "let the player choose a different Spotter Hex" picker is a follow-up.
    indirectFire: (attackerId, targetHexId) => {
      const g = get().game;
      if (!g) return;
      const act = legalActionsForUnit(g, attackerId).find(
        (a): a is Extract<Action, { type: 'INDIRECT_FIRE' }> =>
          a.type === 'INDIRECT_FIRE' && a.targetHexId === targetHexId,
      );
      if (act) capGate(act, (a) => requestIndirectFireRoll(a as Extract<Action, { type: 'INDIRECT_FIRE' }>));
    },
    fireSmoke: (unitId, targetHexId) => {
      const g = get().game;
      if (!g) return;
      const act = legalActionsForUnit(g, unitId).find(
        (a): a is Extract<Action, { type: 'FIRE_SMOKE' }> =>
          a.type === 'FIRE_SMOKE' && a.targetHexId === targetHexId,
      );
      if (act) capGate(act, (a) => get().dispatch(a));
    },

    enterWave: (waveId) => {
      const g = get().game;
      if (!g) return;
      const units = g.reinforcements.filter(
        (r) => r.waveId === waveId && r.side === g.currentSide && g.round >= r.earliestRound,
      );
      if (units.length === 0) return;
      // §4.12: Group entry — one Action places every eligible Unit of the wave.
      // Spread them across distinct legal entry hexes when there are enough
      // (e.g. a whole platoon along a 12-hex edge row); only stack (§4.3) when
      // the wave has fewer legal hexes than Units (e.g. a single named hex).
      const placements = units.map((r, i) => {
        const legal = legalEntryHexes(g, r);
        const hexId = legal.length ? legal[i % legal.length]! : r.entryHexIds[0]!;
        return { unitId: r.id, hexId, facing: r.facing };
      });
      get().dispatch({ type: 'ENTER', placements });
    },

    startPlaceReinforcement: (unitId) => {
      const g = get().game;
      if (!g) return;
      const r = g.reinforcements.find((x) => x.id === unitId);
      if (!r || r.side !== g.currentSide || g.round < r.earliestRound) return;
      set({
        placingReinforcementId: unitId,
        selectedUnitId: null,
        groupMode: false,
        groupSel: [],
        movePath: [],
      });
    },
    cancelPlaceReinforcement: () => set({ placingReinforcementId: null }),

    toggleGroupMode: () =>
      set((s) => ({ groupMode: !s.groupMode, groupSel: [], selectedUnitId: null })),
    clearGroup: () => set({ groupSel: [] }),
    toggleGroupMember: (unitId) => {
      const { game, groupSel } = get();
      if (!game) return;
      const u = game.units[unitId];
      if (!u || u.side !== game.currentSide) return;
      const already = groupSel.includes(unitId);
      // Removing an existing member (the panel's ✕ chip) is always allowed,
      // even if it's Spent; adding one THIS way stays Fresh-only (a Spent Unit
      // still joins fine via a board click alongside Fresh ones, §10.1) so a
      // stray click here can't silently pull a CAP-costing Unit into the Group.
      if (!already && u.status !== 'fresh') return;
      set({
        groupSel: already
          ? groupSel.filter((id) => id !== unitId)
          : [...groupSel, unitId],
      });
    },
    groupMove: (dir) => {
      const { game, groupSel } = get();
      if (!game || groupSel.length === 0) return;
      const members = groupSel.map((id) => game.units[id]!);
      // Formation move: each member steps one hex in `dir` if legal, else stays (§10.2).
      const moves = groupSel.map((id) => {
        const u = game.units[id]!;
        const to = idOf(neighbor(parseHexId(u.hexId), dir));
        if (game.hexes[to] && moveCost(game, u, to).ap != null) return { unitId: id, toHexId: to };
        return { unitId: id };
      });
      // §10.4: Group Move cost = the highest individual mover's Move Cost.
      let maxMove = 0;
      for (const m of moves) {
        if (m.toHexId == null) continue;
        const mc = moveCost(game, game.units[m.unitId]!, m.toHexId);
        if (mc.ap != null) maxMove = Math.max(maxMove, mc.ap);
      }
      const costBeforeCap = maxMove + groupStress(members); // §10.11
      set({ groupSel: [] });
      groupCapGate(members, costBeforeCap, (capCostReduce) =>
        get().dispatch({ type: 'GROUP_MOVE', moves, capCostReduce }),
      );
    },
    groupRally: () => {
      const { game, groupSel } = get();
      if (!game || groupSel.length === 0) return;
      const members = groupSel.map((id) => game.units[id]!);
      const costBeforeCap = RALLY_AP_COST + groupStress(members); // §10.9/§10.11
      set({ groupSel: [] });
      groupCapGate(members, costBeforeCap, (capCostReduce) =>
        get().dispatch({ type: 'GROUP_RALLY', unitIds: groupSel, capCostReduce }),
      );
    },
    groupAttack: (targetId) => {
      const { game, groupSel } = get();
      if (!game || groupSel.length === 0) return;
      const leaderId = groupSel[0]!;
      const leader = game.units[leaderId];
      const target = game.units[targetId];
      if (!leader || !target) return;
      // Only qualifying supporters add +1AR (§10.6); the engine re-validates.
      const supporterIds = groupSel
        .slice(1)
        .filter((id) => isValidSupporter(game, leader, game.units[id]!, target));
      const members = [leader, ...supporterIds.map((id) => game.units[id]!)];
      const isCloseCombat = target.hexId === leader.hexId;
      const arBonus = supporterIds.length;
      const ctx = isCloseCombat
        ? closeCombatContext(game, leader, target, arBonus)
        : attackContext(game, leader, target, 0, arBonus);
      const eff = effectiveStats(game, leader);
      // §16.2: a Turreted leader firing outside its Arc pays +2AP (ranged only).
      const arcPenalty = !isCloseCombat && ctx.legal && ctx.outOfArc && templateOf(game, leader).turreted ? 2 : 0;
      const costBeforeCap = eff.apToFire + arcPenalty + groupStress(members);
      set({ groupSel: [] });
      groupCapGate(members, costBeforeCap, (capCostReduce) =>
        requestGroupAttackRoll(leaderId, supporterIds, targetId, capCostReduce),
      );
    },

    extendMovePath: (hexId) => {
      const g = get().game;
      const sel = get().selectedUnitId;
      const unit = g && sel ? g.units[sel] : null;
      if (!g || !unit) return;
      const path = get().movePath;
      // Clicking the current end commits the move; a fresh empty path with a
      // repeat click does nothing.
      if (path.length && hexId === path[path.length - 1]) {
        get().commitMovePath();
        return;
      }
      // Accept the step only if the whole extended path is a legal vehicle move.
      const candidate = [...path, hexId];
      if (planVehicleMove(g, unit, candidate).ap != null) set({ movePath: candidate });
    },
    commitMovePath: () => {
      const path = get().movePath;
      const sel = get().selectedUnitId;
      if (!path.length || !sel) return;
      set({ movePath: [] });
      capGate(
        { type: 'MOVE', unitId: sel, toHexId: path[path.length - 1]!, path },
        (a) => {
          const action = a as Extract<Action, { type: 'MOVE' }>;
          const game = get().game;
          const passenger = game ? Object.values(game.units).find((x) => x.carriedBy === sel) : undefined;
          maybeMinesGate(action, action.toHexId, passenger ? [sel, passenger.id] : [sel], (a2) => get().dispatch(a2));
        },
      );
    },
    clearMovePath: () => set({ movePath: [] }),

    commitRoll: () => {
      const { pendingRoll } = get();
      if (!pendingRoll) return;
      const action = pendingRoll.action;
      set({ pendingRoll: null });
      get().dispatch(action);
    },
    cancelRoll: () => set({ pendingRoll: null }),
    adjustPendingCapMod: (delta) => {
      const p = get().pendingRoll;
      if (!p) return;
      const max = p.capDiceModMax ?? 0;
      const current = p.capDiceMod ?? 0;
      const next = Math.max(-max, Math.min(max, current + delta));
      if (next === current) return;
      // Rebuild the same base action's preview with the new mod — reuses
      // whichever request*Roll built it in the first place, so the rebuilt
      // steps/odds/dice are computed exactly the same way as the original.
      switch (p.action.type) {
        case 'FIRE':
          requestFireRoll(p.action, next);
          break;
        case 'CLOSE_COMBAT':
          requestCcRoll(p.action, next);
          break;
        case 'RALLY':
          requestRallyRoll(p.action, next);
          break;
        case 'INDIRECT_FIRE':
          requestIndirectFireRoll(p.action, next);
          break;
        case 'GROUP_ATTACK':
          requestGroupAttackRoll(p.action.leaderId, p.action.supporterIds, p.action.targetId, p.action.capCostReduce ?? 0, next);
          break;
      }
    },

    confirmProceed: () => {
      const c = get().pendingConfirm;
      set({ pendingConfirm: null });
      c?.proceed();
    },
    confirmCancel: () => set({ pendingConfirm: null }),

    adjustMinesMod: (unitId, delta) =>
      set((s) => {
        if (!s.pendingMines) return s;
        return {
          pendingMines: {
            ...s.pendingMines,
            targets: s.pendingMines.targets.map((t) =>
              t.unitId === unitId ? { ...t, mod: Math.max(-2, Math.min(2, t.mod + delta)) } : t,
            ),
          },
        };
      }),
    confirmMines: () => {
      const p = get().pendingMines;
      if (!p) return;
      set({ pendingMines: null });
      const mods: Record<string, number> = {};
      for (const t of p.targets) mods[t.unitId] = t.mod;
      p.proceed(mods);
    },
    cancelMines: () => set({ pendingMines: null }),

    openPicker: (hexId, unitIds, x, y) => set({ picker: { hexId, unitIds, x, y } }),
    closePicker: () => set({ picker: null }),
    closeChooser: () => set({ chooser: null }),
    dismissTurnBanner: () => set({ turnBanner: null }),

    toggleLosMode: () => set((s) => ({ losMode: !s.losMode, losSource: null, selectedUnitId: null })),
    setLosSource: (hexId) => set({ losSource: hexId }),

    undo: () => {
      const { history, game } = get();
      if (history.length === 0 || !game) return;
      const prev = history[history.length - 1]!;
      saveAuto(prev);
      set({
        game: prev,
        history: history.slice(0, -1),
        future: [game, ...get().future],
        selectedUnitId: null,
        // Time-travel invalidates any in-progress action assembly (an
        // uncommitted vehicle Bonus-Move path, a Group-mode selection) — both
        // reference units/state from the pre-undo timeline, so keeping them
        // stale either silently swallows every board click afterward (movePath
        // routes clicks to extendMovePath, which no-ops without a selection) or
        // crashes a Group action on a member id that may no longer exist.
        movePath: [],
        groupSel: [],
        placingReinforcementId: null,
        pendingRoll: null,
        pendingConfirm: null,
        chooser: null,
        turnBanner: null,
        lastEvents: [{ type: 'undo', round: prev.round, text: 'Undid last action' }],
      });
    },

    redo: () => {
      const { future, game } = get();
      if (future.length === 0 || !game) return;
      const next = future[0]!;
      saveAuto(next);
      set({
        game: next,
        future: future.slice(1),
        history: [...get().history, game].slice(-HISTORY_LIMIT),
        selectedUnitId: null,
        movePath: [], // see undo() — stale in-progress action state must not survive time-travel
        groupSel: [],
        placingReinforcementId: null,
        pendingRoll: null,
        pendingConfirm: null,
        chooser: null,
        turnBanner: null,
        lastEvents: [{ type: 'redo', round: next.round, text: 'Redid action' }],
      });
    },

    saveToSlot: (name) => {
      const { game } = get();
      if (!game) return false;
      return saveSlot(name, game) != null;
    },

    loadFromSlot: (name) => {
      const g = loadSlot(name);
      if (!g) return;
      saveAuto(g);
      set({ ...resetForLoad(), game: g, lastEvents: [{ type: 'load', round: g.round, text: `Loaded "${name}"` }] });
    },

    deleteSlotByName: (name) => deleteSlot(name),

    exportCurrent: () => {
      const { game } = get();
      return game ? serialize(game) : '';
    },

    importFromText: (text) => {
      try {
        const parsed: unknown = JSON.parse(text);
        if (!isGameState(parsed)) return false;
        saveAuto(parsed);
        set({ ...resetForLoad(), game: parsed, lastEvents: [{ type: 'load', round: parsed.round, text: 'Imported a save' }] });
        return true;
      } catch {
        return false;
      }
    },

    toggleMute: () => set((s) => ({ muted: !s.muted })),
  };
});
