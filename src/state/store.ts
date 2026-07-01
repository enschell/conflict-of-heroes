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
  idOf,
  initGame,
  isValidSupporter,
  legalActionsForUnit,
  legalEntryHexes,
  modifiedActionCost,
  moveCost,
  neighbor,
  parseHexId,
  planVehicleMove,
  reduce,
  rollCloseCombat,
  rollRally,
  rollStackFire,
  serialize,
} from '../engine';
import type { Action, Facing, GameEvent, GameState, HexId, MissionDef, UnitId } from '../engine/types';
import { MISSION_1 } from '../data/missions/mission1';
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
}

export interface PendingRoll {
  /** The single engine action committed after every step is rolled. */
  action: Action;
  kind: 'fire' | 'rally';
  steps: RollStep[];
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
  losMode: boolean;
  losSource: HexId | null;
  shiftHeld: boolean;
  hover: Hover | null;
  picker: Picker | null;
  /** When a clicked hex affords several actions (move-in vs attack), pick one. */
  chooser: { hexId: HexId; x: number; y: number } | null;
  pendingRoll: PendingRoll | null;
  pendingConfirm: PendingConfirm | null;
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
  hexClick: (hexId: HexId, opts: ClickOpts) => void;

  dispatch: (action: Action) => void;
  move: (unitId: UnitId, toHexId: HexId) => void;
  fire: (attackerId: UnitId, targetId: UnitId) => void;
  closeCombat: (attackerId: UnitId, targetId: UnitId) => void;
  rally: (unitId: UnitId) => void;
  pivot: (unitId: UnitId, facing: Facing) => void;
  load: (unitId: UnitId, vehicleId: UnitId) => void;
  unload: (unitId: UnitId, toHexId: HexId) => void;
  /** Enter every eligible Unit of one reinforcement wave as a single Group Action (§4.12). */
  enterWave: (waveId: string) => void;

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
  confirmProceed: () => void;
  confirmCancel: () => void;

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
  { type: 'MOVE' | 'FIRE' | 'CLOSE_COMBAT' | 'RALLY' | 'PIVOT' }
>;

export const useGame = create<Store>((set, get) => {
  /** The unit that performs a gateable action. */
  const actorOf = (action: GateableAction): UnitId =>
    action.type === 'FIRE' || action.type === 'CLOSE_COMBAT' ? action.attackerId : action.unitId;

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

  /** Common UI reset when a whole new GameState is loaded/imported. */
  const resetForLoad = () => ({
    selectedUnitId: null,
    groupSel: [] as UnitId[],
    movePath: [] as HexId[],
    history: [] as GameState[],
    future: [] as GameState[],
    picker: null,
    chooser: null,
    pendingRoll: null,
    pendingConfirm: null,
    turnBanner: null,
    losMode: false,
    losSource: null,
    hover: null,
  });

  const requestFireRoll = (action: Extract<Action, { type: 'FIRE' }>) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    const target = g.units[action.targetId];
    if (!attacker || !target) return;
    const ctx = attackContext(g, attacker, target);
    if (!ctx.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
      return;
    }
    // §7.5.1: a shot at the target's hex resolves against every enemy stacked
    // there — the player rolls each one in turn (one step per enemy).
    const stack = rollStackFire(g, attacker, target.hexId);
    if (!stack.rolls.length) return;
    const steps: RollStep[] = stack.rolls.map(({ targetId: tid, roll }) => {
      return {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
        detail: `AR ${roll.ar} vs DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}${roll.isFlank ? ' (flank)' : ''}`,
        label: `${action.attackerId} → ${tid}`,
      };
    });
    set({ pendingRoll: { action, kind: 'fire', steps } });
  };

  const requestCcRoll = (action: Extract<Action, { type: 'CLOSE_COMBAT' }>) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    const target = g.units[action.targetId];
    if (!attacker || !target) return;
    const ctx = closeCombatContext(g, attacker, target);
    if (!ctx.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: ctx.reason ?? 'illegal' }] });
      return;
    }
    const roll = rollCloseCombat(g, attacker, target);
    set({
      pendingRoll: {
        action,
        kind: 'fire',
        steps: [
          {
            dice: roll.dice,
            success: roll.hit,
            headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
            detail: `close combat · AR ${roll.ar} vs flank DR ${roll.dr} — 2d6 ≥ ${roll.hitNumber}`,
            label: `${action.attackerId} ⚔ ${action.targetId}`,
          },
        ],
      },
    });
  };

  const requestRallyRoll = (action: Extract<Action, { type: 'RALLY' }>) => {
    const g = get().game;
    if (!g) return;
    const unit = g.units[action.unitId];
    if (!unit) return;
    const rr = rollRally(g, unit);
    if (!rr.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: rr.reason ?? 'illegal' }] });
      return;
    }
    const mod = rr.total - rr.roll; // cover/stacking/CAP modifiers (no dice)
    set({
      pendingRoll: {
        action,
        kind: 'rally',
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
    losMode: false,
    losSource: null,
    shiftHeld: false,
    hover: null,
    picker: null,
    chooser: null,
    pendingRoll: null,
    pendingConfirm: null,
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
        losMode: false,
        losSource: null,
        hover: null,
        picker: null,
        chooser: null,
        pendingRoll: null,
        pendingConfirm: null,
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

    select: (unitId) => set({ selectedUnitId: unitId, movePath: [] }),
    setHover: (h) => set({ hover: h }),
    setShift: (down) => set({ shiftHeld: down }),

    hexClick: (hexId, opts) => {
      const { game, losMode, selectedUnitId, pendingRoll, pendingConfirm, turnBanner } = get();
      if (!game || pendingRoll || pendingConfirm || turnBanner) return;

      // A board click anywhere dismisses an open action chooser.
      if (get().chooser) {
        set({ chooser: null });
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
        const ownFresh = hereU.filter((u) => u.side === game.currentSide && u.status === 'fresh');
        if (ownFresh.length) {
          const sel = get().groupSel;
          const allIn = ownFresh.every((u) => sel.includes(u.id));
          set({
            groupSel: allIn
              ? sel.filter((id) => !ownFresh.some((u) => u.id === id))
              : [...new Set([...sel, ...ownFresh.map((u) => u.id)])],
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

        // A Transported/Towed Unit (§15.8) has no Move/Fire of its own — a click
        // on one of its Unload hexes (under or adjacent to its Vehicle) is
        // unambiguous, so Unload immediately (§15.9).
        if (sel.carriedBy) {
          const unloadAct = acts.find((a) => a.type === 'UNLOAD' && a.toHexId === hexId);
          if (unloadAct) {
            get().unload(sel.id, hexId);
            return;
          }
        }

        const enemy = here.find((u) => u.side !== game.currentSide);
        const canMoveHere = acts.some((a) => a.type === 'MOVE' && a.toHexId === hexId);
        const canFire = !!enemy && acts.some((a) => a.type === 'FIRE' && a.targetId === enemy.id);
        const canCC = !!enemy && acts.some((a) => a.type === 'CLOSE_COMBAT' && a.targetId === enemy.id);
        // Load (§15.7): clicking a hex with an eligible friendly Vehicle (same
        // hex or adjacent) may mean "just move/stack here" as well as "load onto
        // it" — offer both via the chooser when ambiguous (§5.4-style choice).
        const loadVehicleId = here.find(
          (u) => u.side === sel.side && acts.some((a) => a.type === 'LOAD' && a.vehicleId === u.id),
        )?.id;
        const canLoad = !!loadVehicleId;
        const optionCount = Number(canMoveHere) + Number(canFire) + Number(canCC) + Number(canLoad);

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
        if (canFire && enemy) {
          get().fire(sel.id, enemy.id);
          return;
        }
        if (canCC && enemy) {
          get().closeCombat(sel.id, enemy.id);
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
      const selectedUnitId =
        get().selectedUnitId && res.state.units[get().selectedUnitId!] ? get().selectedUnitId : null;
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

    move: (unitId, toHexId) => {
      const g = get().game;
      const u = g?.units[unitId];
      // Vehicles build a Bonus-Move path (§15.2); foot units move one hex.
      if (g && u && g.templates[u.templateId]?.kind === 'vehicle') {
        get().extendMovePath(toHexId);
        return;
      }
      capGate({ type: 'MOVE', unitId, toHexId }, (a) => get().dispatch(a));
    },
    fire: (attackerId, targetId) =>
      capGate({ type: 'FIRE', attackerId, targetId }, (a) =>
        requestFireRoll(a as Extract<Action, { type: 'FIRE' }>),
      ),
    closeCombat: (attackerId, targetId) =>
      capGate({ type: 'CLOSE_COMBAT', attackerId, targetId }, (a) =>
        requestCcRoll(a as Extract<Action, { type: 'CLOSE_COMBAT' }>),
      ),
    rally: (unitId) =>
      capGate({ type: 'RALLY', unitId }, (a) =>
        requestRallyRoll(a as Extract<Action, { type: 'RALLY' }>),
      ),
    pivot: (unitId, facing) =>
      capGate({ type: 'PIVOT', unitId, facing }, (a) => get().dispatch(a)),

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
      if (act) get().dispatch(act);
    },
    unload: (unitId, toHexId) => {
      const g = get().game;
      if (!g) return;
      const act = legalActionsForUnit(g, unitId).find(
        (a): a is Extract<Action, { type: 'UNLOAD' }> => a.type === 'UNLOAD' && a.toHexId === toHexId,
      );
      if (act) get().dispatch(act);
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

    toggleGroupMode: () =>
      set((s) => ({ groupMode: !s.groupMode, groupSel: [], selectedUnitId: null })),
    clearGroup: () => set({ groupSel: [] }),
    toggleGroupMember: (unitId) => {
      const { game, groupSel } = get();
      if (!game) return;
      const u = game.units[unitId];
      // A Group is built from your own Fresh Units (§10.1).
      if (!u || u.side !== game.currentSide || u.status !== 'fresh') return;
      set({
        groupSel: groupSel.includes(unitId)
          ? groupSel.filter((id) => id !== unitId)
          : [...groupSel, unitId],
      });
    },
    groupMove: (dir) => {
      const { game, groupSel } = get();
      if (!game || groupSel.length === 0) return;
      // Formation move: each member steps one hex in `dir` if legal, else stays (§10.2).
      const moves = groupSel.map((id) => {
        const u = game.units[id]!;
        const to = idOf(neighbor(parseHexId(u.hexId), dir));
        if (game.hexes[to] && moveCost(game, u, to).ap != null) return { unitId: id, toHexId: to };
        return { unitId: id };
      });
      get().dispatch({ type: 'GROUP_MOVE', moves });
      set({ groupSel: [] });
    },
    groupRally: () => {
      const { groupSel } = get();
      if (groupSel.length === 0) return;
      get().dispatch({ type: 'GROUP_RALLY', unitIds: groupSel });
      set({ groupSel: [] });
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
      get().dispatch({ type: 'GROUP_ATTACK', leaderId, supporterIds, targetId });
      set({ groupSel: [] });
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
        (a) => get().dispatch(a),
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

    confirmProceed: () => {
      const c = get().pendingConfirm;
      set({ pendingConfirm: null });
      c?.proceed();
    },
    confirmCancel: () => set({ pendingConfirm: null }),

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
