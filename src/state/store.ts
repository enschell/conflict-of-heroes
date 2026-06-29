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
  initGame,
  legalActionsForUnit,
  modifiedActionCost,
  reduce,
  rollCloseCombat,
  rollRally,
  rollStackFire,
  serialize,
} from '../engine';
import type { Action, Facing, GameEvent, GameState, HexId, UnitId } from '../engine/types';
import { FIREFIGHT_1 } from '../data/firefights/firefight1';
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

  newGame: () => void;
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

export const useGame = create<Store>((set, get) => {
  /** The unit that performs an action (none for PASS). */
  const actorOf = (action: Action): UnitId | null => {
    switch (action.type) {
      case 'MOVE':
      case 'PIVOT':
      case 'RALLY':
      case 'STALL':
        return action.unitId;
      case 'FIRE':
      case 'CLOSE_COMBAT':
        return action.attackerId;
      default:
        return null;
    }
  };

  /**
   * Gate any action that would spend CAP behind an explicit confirmation (§3.4).
   * Fresh units never spend CAP and proceed directly. A Spent unit may act only
   * by buying its Action Cost down to 0AP with CAPs — so we show how many CAPs
   * that costs and only proceed (with capCostReduce set) once the player accepts.
   */
  const capGate = (action: Action, proceed: (a: Action) => void) => {
    const g = get().game;
    if (!g) return;
    if (action.type === 'PASS') {
      proceed(action); // no actor, never spends CAP
      return;
    }
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
      const fp = roll.av - roll.dice[0] - roll.dice[1]; // static FP (no dice)
      return {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
        detail: `FP ${fp} + 2d6 vs DV ${roll.dv}${roll.isFlank ? ' (flank)' : ''}`,
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
    const fp = roll.av - roll.dice[0] - roll.dice[1]; // static FP (no dice)
    set({
      pendingRoll: {
        action,
        kind: 'fire',
        steps: [
          {
            dice: roll.dice,
            success: roll.hit,
            headline: roll.critical ? 'CRITICAL HIT' : roll.hit ? 'HIT' : 'MISS',
            detail: `close combat · FP ${fp} + 2d6 vs flank DV ${roll.dv}`,
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

    newGame: () => {
      const game = initGame(FIREFIGHT_1);
      saveAuto(game);
      set({
        game,
        selectedUnitId: null,
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

    select: (unitId) => set({ selectedUnitId: unitId }),
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
        const enemy = here.find((u) => u.side !== game.currentSide);
        const canMoveHere = acts.some((a) => a.type === 'MOVE' && a.toHexId === hexId);
        const canFire = !!enemy && acts.some((a) => a.type === 'FIRE' && a.targetId === enemy.id);
        const canCC = !!enemy && acts.some((a) => a.type === 'CLOSE_COMBAT' && a.targetId === enemy.id);
        const optionCount = Number(canMoveHere) + Number(canFire) + Number(canCC);

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

    move: (unitId, toHexId) =>
      capGate({ type: 'MOVE', unitId, toHexId }, (a) => get().dispatch(a)),
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
