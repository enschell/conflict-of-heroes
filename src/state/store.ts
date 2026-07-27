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
  directFireZone,
  directionTo,
  effectiveStats,
  facingToward,
  groupStress,
  idOf,
  type Modifier,
  initGame,
  isValidSupporter,
  legalActionsForUnit,
  legalEntryHexes,
  legalSetupHexes,
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
  rollAttack,
  rollCloseCombat,
  rollIndirectFire,
  rollRally,
  rollReveal,
  rollStackFire,
  rollStructureDestroy,
  serialize,
  templateOf,
  type AttackRoll,
  type IndirectAttackRoll,
} from '../engine';
import type {
  Action,
  CardId,
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
import { CARD_CATALOG } from '../data/cards/catalog';
import { MISSION_1 } from '../data/missions/mission1';
import { isHopelessShot, MAX_CAP_DICE_MOD, oddsForHitNumber, pct } from '../ui/odds';
import { playFire, playMove } from '../ui/sound';
import { NetClient } from '../net/client';
import { getSessionId } from '../net/session';
import type { ServerMsg } from '../net/protocol';
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
  kind: 'fire' | 'rally' | 'recon';
  steps: RollStep[];
  /** §3.2: the CAP dice-mod baked into `steps`' dice/results (0 by default).
   *  Adjustable via the DiceRoller's stepper before the FIRST die of the
   *  sequence is rolled; changing it rebuilds `steps` from the same base
   *  action with the new mod, so the preview always matches what a Roll
   *  would actually commit. Undefined (treated as 0/0) for roll kinds that
   *  don't yet build this (e.g. a bare `{action:{type:'PASS'},...}` test
   *  fixture) — every real request*Roll builder always supplies both.
   *  For `kind: 'recon'` specifically, this means the Hit Number mod
   *  (§11.7's follow-up Attack roll) — see `capRevealDiceMod` below for the
   *  Reveal Number's OWN, deliberately independent mod. */
  capDiceMod?: number;
  /**
   * §11.7 Recon by Fire ONLY: the Reveal Number's own CAP mod, independent
   * of `capDiceMod` (the rulebook is explicit these don't carry over to each
   * other). Undefined for every other `kind`.
   */
  capRevealDiceMod?: number;
  capRevealDiceModMax?: number;
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
  /** General Group Move (§10.2/§10.3): members of `groupSel` still awaiting a
   *  per-unit destination choice (front = the one currently highlighted on
   *  the board). Empty unless `startGroupMoveIndividually` armed it. */
  groupMoveQueue: UnitId[];
  /** Finished per-member choices (a Hex, or none = stays in place),
   *  accumulated until the queue empties, then dispatched as one
   *  GROUP_MOVE. */
  groupMoveDone: { unitId: UnitId; toHexId?: HexId }[];
  /** In-progress vehicle Bonus-Move path (§15.2): the hex steps chosen so far. */
  movePath: HexId[];
  /** Manual/Group reinforcement placement (§4.12): the reinforcement Units still
   *  awaiting a Hex (front of queue is the one currently highlighted on the
   *  board). Placing one Unit is a 1-element queue; a Group entry queues
   *  several, all placed under one eventual ENTER Action. */
  placingReinforcementQueue: UnitId[];
  /** The Unit that just got a Hex and is now awaiting a facing choice (the six
   *  neighbor Hexes highlight blue, same as the free facing-correction picker;
   *  clicking the placement Hex itself keeps the wave's suggested facing). */
  placingReinforcementFacing: { unitId: UnitId; hexId: HexId } | null;
  /** Finished placements (Hex + facing decided), accumulated until the queue
   *  empties, then dispatched as one ENTER Action (§4.12 Group entry). */
  placingReinforcementDone: { unitId: UnitId; hexId: HexId; facing: Facing }[];
  /** Pre-Mission Setup phase (`game.phase === 'setup'`): the Setup Pool Unit
   *  currently armed for placement — clicking a legal (empty) Hex places it. */
  armedSetupUnitId: UnitId | null;
  /** §13.5: an Artillery Card armed from the Hand panel — clicking any Hex on
   *  the Map plans an OBA Strike there (no LOS/Spotter restriction, §13.5). */
  armedObaCard: { side: SideId; cardId: CardId } | null;
  losMode: boolean;
  losSource: HexId | null;
  shiftHeld: boolean;
  /** Pivot picker (P key): highlights the six neighbor Hexes of the selected
   *  Unit, blue like the free facing-choice picker, but clicking one issues a
   *  real PIVOT Action (§4.6 — 1AP + Spent Check), not the free correction. */
  pivotPicker: boolean;
  hover: Hover | null;
  picker: Picker | null;
  /** When a clicked hex affords several actions (move-in vs attack), pick one.
   *  `ctrl` records whether the click that opened it was a Ctrl+click — the
   *  Hidden Move/Recon by Fire/Fire Smoke options are only ever legal to
   *  OFFER (not just legal to the engine) when it was, so a plain click can't
   *  accidentally reveal/attempt one of these deliberately-secondary actions. */
  chooser: { hexId: HexId; x: number; y: number; ctrl: boolean } | null;
  pendingRoll: PendingRoll | null;
  pendingConfirm: PendingConfirm | null;
  pendingMines: PendingMines | null;
  turnBanner: { round: number } | null;
  history: GameState[];
  /** Redo stack (states undone, newest first). */
  future: GameState[];
  lastEvents: GameEvent[];
  muted: boolean;

  /** M13 online play. 'hotseat' (default) is the existing pass-and-play mode
   *  — completely untouched by any of the online fields/methods below. */
  mode: 'hotseat' | 'online';
  /** Which Side this browser is allowed to act as (only meaningful once
   *  `JOINED` — set alongside `roomCode`). */
  mySide: SideId | null;
  roomCode: string | null;
  /** Is the OTHER Side's socket currently connected? */
  peerConnected: boolean;
  netError: string | null;

  /** 'menu' (default) is the normal SetupScreen/OnlineLobby/game flow, entirely
   *  untouched by the Mission Editor. 'editor' shows the Mission Editor and
   *  'mapEditor' shows the Map Editor (terrain authoring) instead — sibling
   *  screens with their own state (`state/editorStore.ts`/
   *  `state/mapEditorStore.ts`), not `GameState` variants. */
  screen: 'menu' | 'editor' | 'mapEditor';
  openMissionEditor: () => void;
  closeMissionEditor: () => void;
  openMapEditor: () => void;
  closeMapEditor: () => void;

  newGame: (def?: MissionDef) => void;
  resume: () => void;
  quitToMenu: () => void;
  /** Create a new online room for the given Mission id (see
   *  `data/missions/catalog.ts`), becoming Side A. */
  createOnlineRoom: (missionId: string) => void;
  /** Join an existing online room by its code — becomes whichever Side is
   *  still open, or reconnects to the Side this browser already held. */
  joinOnlineRoom: (roomCode: string) => void;
  /** Disconnect and return to the hotseat/online choice menu. */
  leaveOnlineRoom: () => void;

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
  /** Exit the Map via a Mission-authored exit zone (§4.0) — costs this Unit's own move stat, CAP-gated like Hasty Defense. */
  exit: (unitId: UnitId) => void;
  /** Hidden Move (§11.3-11.6): become Hidden, or move while already Hidden. */
  hiddenMove: (unitId: UnitId, toHexId: HexId) => void;
  /** Recon by Fire (§11.7): attack a suspected Hex — routes through `requestReconRoll`
   *  for its own two-roll preview, not a direct dispatch. */
  reconByFire: (attackerId: UnitId, targetHexId: HexId) => void;
  /** Play an Action/Bonus-type Card (§8.5-8.6) from `side`'s hand — NOT
   *  necessarily `currentSide` (several cards are playable on either side's
   *  hand regardless of whose Turn it is, §8's Card Catalog). `unitId` is
   *  required for a Green-cost card, optional for Blue-cost. */
  playCard: (side: SideId, cardId: CardId, unitId?: UnitId) => void;
  /** §13.5: arm (or disarm, pass `null`) an Artillery Card from `side`'s hand — the next board click plans its Strike. */
  armObaCard: (card: { side: SideId; cardId: CardId } | null) => void;
  /** §13.5: plan an OBA Strike targeting `targetHexId`, resolving one Round later. */
  planObaStrike: (side: SideId, cardId: CardId, targetHexId: HexId) => void;
  /** Pre-Mission Setup phase: arm (or disarm, pass `null`) a Setup Pool Unit for placement. */
  armSetupUnit: (unitId: UnitId | null) => void;
  /** Places the given Setup Pool Unit at `hexId` — free, no CAP gate, no Spent Check. */
  placeSetupUnit: (unitId: UnitId, hexId: HexId) => void;
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
  /** Manual/Group entry (§4.12): arm placement mode for one or more reinforcement
   *  Units. Board clicks then walk each Unit through Hex → facing in turn; once
   *  every Unit in `unitIds` has both, all of them enter as ONE ENTER Action
   *  (a real Group entry when `unitIds.length > 1`, §4.12's adjacency rule is
   *  enforced by the reducer via `hexesConnected`). */
  startPlaceReinforcements: (unitIds: UnitId[]) => void;
  cancelPlaceReinforcements: () => void;
  /** Keep the wave-suggested facing for the Unit currently awaiting a facing
   *  choice (`placingReinforcementFacing`) — the board-click alternative to
   *  clicking one of the six highlighted neighbor Hexes. */
  useDefaultReinforcementFacing: () => void;
  /** Explicit facing choice for the Unit currently awaiting one — advances the
   *  queue to the next Unit, or dispatches the accumulated Group ENTER once
   *  every queued Unit has a Hex + facing. */
  chooseReinforcementFacing: (facing: Facing) => void;

  toggleGroupMode: () => void;
  toggleGroupMember: (unitId: UnitId) => void;
  clearGroup: () => void;
  /** Formation Group Move (§10.2 shortcut): every member steps one hex in
   *  `dir` if legal, else stays in place. Fast path for the common case —
   *  `startGroupMoveIndividually` below is the general one (§10.3: members
   *  may split apart to different Hexes, which a single shared direction
   *  can't express). */
  groupMove: (dir: Facing) => void;
  /** General Group Move (§10.2/§10.3): arms a per-member destination queue —
   *  the board highlights the front member's own legal move Hexes; clicking
   *  one assigns that member's destination (or click the member's own Hex to
   *  leave it in place, §10.2's "or not move and just Pivot"), advancing to
   *  the next member. Dispatches one GROUP_MOVE once every member has a
   *  choice. */
  startGroupMoveIndividually: () => void;
  cancelGroupMoveIndividually: () => void;
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
  /** §11.7 ONLY: adjusts the Reveal Number's own CAP mod, independent of `adjustPendingCapMod`. */
  adjustPendingRevealMod: (delta: number) => void;
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

/** M13 online play: the live WebSocket connection, if any. Deliberately kept
 *  outside Zustand's reactive state — it's a side-effecting object, not
 *  serializable data (CLAUDE.md §3's "GameState is 100% JSON-serializable"
 *  is about `game`, not this transport handle). At most one at a time; a new
 *  create/join always closes the previous one first. */
let netClient: NetClient | null = null;

/** Action types that go through the single-unit CAP-confirm gate below. */
type GateableAction = Extract<
  Action,
  {
    type:
      | 'MOVE'
      | 'FIRE'
      | 'CLOSE_COMBAT'
      | 'RALLY'
      | 'PIVOT'
      | 'INDIRECT_FIRE'
      | 'FIRE_SMOKE'
      | 'HASTY_DEFENSE'
      | 'EXIT'
      | 'HIDDEN_MOVE'
      | 'RECON_BY_FIRE';
  }
>;

export const useGame = create<Store>((set, get) => {
  /** The unit that performs a gateable action. */
  const actorOf = (action: GateableAction): UnitId =>
    action.type === 'FIRE' || action.type === 'CLOSE_COMBAT' || action.type === 'INDIRECT_FIRE' || action.type === 'RECON_BY_FIRE'
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
   * Shared by `groupMove` (the formation-shift shortcut) and
   * `startGroupMoveIndividually`'s per-member queue below: §10.4's cost
   * (the highest mover's own Move Cost) + §10.11 Stress, then the normal
   * Group CAP-confirm gate before dispatching one GROUP_MOVE.
   */
  const submitGroupMove = (moves: { unitId: UnitId; toHexId?: HexId }[]) => {
    const g = get().game;
    if (!g) return;
    const members = moves.map((m) => g.units[m.unitId]).filter((u): u is Unit => !!u);
    let maxMove = 0;
    for (const m of moves) {
      if (m.toHexId == null) continue;
      const mc = moveCost(g, g.units[m.unitId]!, m.toHexId);
      if (mc.ap != null) maxMove = Math.max(maxMove, mc.ap);
    }
    const costBeforeCap = maxMove + groupStress(members);
    groupCapGate(members, costBeforeCap, (capCostReduce) =>
      get().dispatch({ type: 'GROUP_MOVE', moves, capCostReduce }),
    );
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
    groupMoveQueue: [] as UnitId[],
    groupMoveDone: [] as { unitId: UnitId; toHexId?: HexId }[],
    movePath: [] as HexId[],
    placingReinforcementQueue: [],
    placingReinforcementFacing: null,
    placingReinforcementDone: [],
    armedSetupUnitId: null,
    armedObaCard: null,
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
   * Apply a `reduce()` result as the new canonical `game`, with the same
   * presentation side effects hotseat has always had (SFX, the §4.5/§15.11
   * free-facing-choice and §2.6 Stressed-unit auto-select, the round-advance
   * turn banner) — factored out of `dispatch` so M13's online path (which
   * applies the identical result optimistically, see `dispatch` below) gets
   * them too, without duplicating the logic. `persist`/`trackHistory` are
   * off for online play: the server is the source of truth there, not
   * localStorage autosave or local Undo/Redo (M13 plan — Undo/Redo are
   * disabled entirely in online mode for v1).
   */
  const applyReduceResult = (
    prevGame: GameState,
    action: Action,
    res: { state: GameState; events: GameEvent[] },
    opts: { persist: boolean; trackHistory: boolean },
  ) => {
    if (action.type === 'MOVE') {
      const u = prevGame.units[action.unitId];
      const kind = u ? prevGame.templates[u.templateId]?.kind : undefined;
      if (kind) playMove(kind, get().muted);
    } else if (action.type === 'FIRE' || action.type === 'CLOSE_COMBAT') {
      const u = prevGame.units[action.attackerId];
      const kind = u ? prevGame.templates[u.templateId]?.kind : undefined;
      if (kind) playFire(kind, get().muted);
    }
    const pending = res.state.pendingFacingChoices;
    const turnChangedTo = res.state.currentSide !== prevGame.currentSide ? res.state.currentSide : null;
    // The free §4.5/§15.11 facing-correction window is turn-agnostic (it can
    // be open for either side, almost always the side that just finished its
    // own Turn), so it still wins selection priority. Otherwise (user
    // request): deselect entirely once it becomes a new side's Turn, rather
    // than auto-selecting that side's Stressed unit — the incoming player
    // picks their own first unit. This has to be re-checked on every Action,
    // not just the one where `currentSide` itself flips — a facing window
    // that opens on the flipping Action stays selected on THAT dispatch (no
    // new turnChangedTo yet), and would otherwise linger un-deselected once
    // it closes a dispatch or two later, since by then the Turn had already
    // changed on an earlier Action.
    const stillOwnedByCurrentSide = (() => {
      const cur = get().selectedUnitId;
      const curUnit = cur ? res.state.units[cur] : null;
      return curUnit && curUnit.side === res.state.currentSide ? cur : null;
    })();
    const selectedUnitId = pending?.length ? pending[pending.length - 1]! : stillOwnedByCurrentSide;
    const advancedRound = res.state.round > prevGame.round && res.state.phase === 'playing';
    if (opts.persist) saveAuto(res.state);
    set({
      game: res.state,
      ...(opts.trackHistory
        ? { history: [...get().history, prevGame].slice(-HISTORY_LIMIT), future: [] }
        : {}),
      lastEvents: res.events,
      selectedUnitId,
      // Group mode is per-Turn, not a standing preference — reset it (and any
      // in-progress group selection/queue) the moment the Turn changes sides.
      ...(turnChangedTo
        ? { groupMode: false, groupSel: [], groupMoveQueue: [], groupMoveDone: [] }
        : {}),
      turnBanner: advancedRound ? { round: res.state.round } : get().turnBanner,
    });
  };

  /**
   * M13 online play: react to a message from the server. `JOINED` seats this
   * browser in a room; `STATE` is the authoritative result of ANY Action in
   * the room (this client's own, just-optimistically-applied one, or the
   * opponent's) — reconciling is a plain overwrite, no diffing needed, since
   * `GameState` is already the single source of truth `dispatch` itself
   * works off. Deliberately lighter than `applyReduceResult` above: no SFX
   * here (the acting client's own optimistic apply already played its cue;
   * re-playing it on the server echo would double it up, and the opponent
   * not hearing a cue for the other player's move is an acceptable v1 gap
   * for this functional-minimum online pass, CLAUDE.md M13 plan).
   */
  const handleServerMsg = (msg: ServerMsg) => {
    switch (msg.type) {
      case 'JOINED':
        set({
          mySide: msg.side,
          roomCode: msg.roomCode,
          game: msg.state,
          peerConnected: msg.peerConnected,
          netError: null,
        });
        break;
      case 'STATE': {
        const prevGame = get().game;
        const advancedRound = prevGame
          ? msg.state.round > prevGame.round && msg.state.phase === 'playing'
          : false;
        const turnChangedTo = prevGame && msg.state.currentSide !== prevGame.currentSide ? msg.state.currentSide : null;
        // Same "still owned by the currently-acting side" check as hotseat's
        // applyReduceResult — re-checked on every STATE message, not just the
        // one where currentSide itself flips (see that function's own
        // comment for why a single turnChangedTo check isn't enough).
        const cur = get().selectedUnitId;
        const curUnit = cur ? msg.state.units[cur] : null;
        set({
          game: msg.state,
          selectedUnitId: curUnit && curUnit.side === msg.state.currentSide ? cur : null,
          // Same per-Turn Group-mode reset as hotseat's applyReduceResult.
          ...(turnChangedTo
            ? { groupMode: false, groupSel: [], groupMoveQueue: [], groupMoveDone: [] }
            : {}),
          turnBanner: advancedRound ? { round: msg.state.round } : get().turnBanner,
        });
        break;
      }
      case 'PEER_STATUS':
        set({ peerConnected: msg.connected });
        break;
      case 'ERROR':
        set({ netError: msg.message });
        break;
    }
  };

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

  /**
   * §11.7 Recon by Fire: a 1- or 2-step preview. Step 1 is always the Reveal
   * Number roll; step 2 (the follow-up Attack) only appears when that roll
   * succeeds AND a Hidden enemy Unit actually occupies the target Hex —
   * mirrors `doReconByFire`'s own conditional-second-roll shape exactly,
   * threading the RNG from `roll.rng` so the preview can never disagree with
   * what commits. `revealMod`/`hitMod` are independent (§11.7 — CAPs spent on
   * one never carry to the other), unlike every other multi-roll Action here.
   */
  const requestReconRoll = (
    action: Extract<Action, { type: 'RECON_BY_FIRE' }>,
    revealMod = 0,
    hitMod = 0,
  ) => {
    const g = get().game;
    if (!g) return;
    const attacker = g.units[action.attackerId];
    if (!attacker) return;
    const zone = directFireZone(g, attacker, action.targetHexId);
    if (!zone.legal) {
      set({ lastEvents: [{ type: 'illegal', round: g.round, text: zone.reason ?? 'illegal' }] });
      return;
    }
    const roll = rollReveal(g, action.targetHexId, revealMod);
    const revealOdds = oddsForHitNumber(roll.hitNumber);
    const steps: RollStep[] = [
      {
        dice: roll.dice,
        success: roll.hit,
        headline: roll.hit ? 'REVEAL SUCCEEDS' : 'NO REVEAL',
        detail: `Reveal Number ${roll.hitNumber} (6 + Terrain DR Mod) — 2d6 ≥ ${roll.hitNumber}`,
        label: `${action.attackerId} recons ${action.targetHexId}`,
        hitPct: pct(revealOdds.hit),
      },
    ];
    const target = roll.hit
      ? Object.values(g.units).find((u) => u.hexId === action.targetHexId && u.hidden && u.side !== attacker.side)
      : undefined;
    if (target) {
      // §11.2: preview with the SAME "face the revealer" facing `doReconByFire`
      // will assign on commit, so the AR/DR/Hit Number shown here matches.
      const previewTarget: Unit = { ...target, facing: facingToward(target.hexId, attacker.hexId) };
      const attackRoll = rollAttack({ ...g, rng: roll.rng }, attacker, previewTarget, hitMod);
      const hitEffects = previewHitEffects(g, [{ targetId: target.id, roll: attackRoll }], attackRoll.rng);
      const odds = oddsForHitNumber(attackRoll.hitNumber);
      steps.push({
        dice: attackRoll.dice,
        success: attackRoll.hit,
        headline: attackRoll.critical ? 'CRITICAL HIT' : attackRoll.hit ? 'HIT' : 'MISS',
        detail: `${target.id} revealed! AR ${attackRoll.ar} vs DR ${attackRoll.dr} — 2d6 ≥ ${attackRoll.hitNumber}${attackRoll.isFlank ? ' (flank)' : ''}`,
        label: `${action.attackerId} → ${target.id}`,
        arMods: attackRoll.arMods,
        drMods: attackRoll.drMods,
        hitEffect: hitEffects[0],
        hitPct: pct(odds.hit),
        critPct: pct(odds.crit),
      });
    }
    const capDiceModMax = capDiceModMaxFor(g, attacker.side, action.capCostReduce);
    set({
      pendingRoll: {
        action: { ...action, capRevealDiceMod: revealMod, capHitDiceMod: hitMod },
        kind: 'recon',
        steps,
        capDiceMod: hitMod,
        capDiceModMax,
        capRevealDiceMod: revealMod,
        capRevealDiceModMax: capDiceModMax,
      },
    });
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
    groupMoveQueue: [],
    groupMoveDone: [],
    movePath: [],
    placingReinforcementQueue: [],
    placingReinforcementFacing: null,
    placingReinforcementDone: [],
    armedSetupUnitId: null,
    armedObaCard: null,
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
    mode: 'hotseat',
    mySide: null,
    roomCode: null,
    peerConnected: false,
    netError: null,

    screen: 'menu',
    openMissionEditor: () => set({ screen: 'editor' }),
    closeMissionEditor: () => set({ screen: 'menu' }),
    openMapEditor: () => set({ screen: 'mapEditor' }),
    closeMapEditor: () => set({ screen: 'menu' }),

    newGame: (def = MISSION_1) => {
      netClient?.close();
      netClient = null;
      const game = initGame(def);
      saveAuto(game);
      set({
        game,
        selectedUnitId: null,
        groupMode: false,
        groupSel: [],
        groupMoveQueue: [],
        groupMoveDone: [],
        movePath: [],
        placingReinforcementQueue: [],
        placingReinforcementFacing: null,
        placingReinforcementDone: [],
        armedSetupUnitId: null,
    armedObaCard: null,
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
        mode: 'hotseat',
        mySide: null,
        roomCode: null,
        peerConnected: false,
        netError: null,
      });
    },

    resume: () => {
      netClient?.close();
      netClient = null;
      const game = loadAuto();
      if (game) {
        set({
          game,
          ...resetForLoad(),
          lastEvents: [],
          mode: 'hotseat',
          mySide: null,
          roomCode: null,
          peerConnected: false,
          netError: null,
        });
      }
    },

    quitToMenu: () => {
      netClient?.close();
      netClient = null;
      clearAuto();
      set({
        game: null,
        ...resetForLoad(),
        losMode: false,
        mode: 'hotseat',
        mySide: null,
        roomCode: null,
        peerConnected: false,
        netError: null,
      });
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

      // §13.5 Plan an OBA Strike: an armed Artillery Card is targeted at
      // ANY Hex on the Map (no restriction unless the Mission adds one at
      // resolution time) — click anywhere to secretly queue the Strike.
      const armedOba = get().armedObaCard;
      if (armedOba) {
        get().planObaStrike(armedOba.side, armedOba.cardId, hexId);
        return;
      }

      // Pre-Mission Setup phase: only two clicks mean anything while this is
      // ongoing — choosing the just-placed Unit's facing, or placing the next
      // armed Setup Pool Unit onto a legal (empty) Hex.
      if (game.phase === 'setup') {
        // The free facing-correction window a SETUP_PLACE grants (§4.5's
        // existing mechanism) — same logic as the normal-play branch further
        // down, which this early-return otherwise makes unreachable (caught
        // live: the "Choose facing" callout appeared after placing, but no
        // click could actually set the facing until setup ended).
        if (selectedUnitId && game.pendingFacingChoices?.includes(selectedUnitId)) {
          const u = game.units[selectedUnitId];
          const dir = u ? directionTo(u.hexId, hexId) : -1;
          if (dir >= 0) {
            get().chooseFacing(selectedUnitId, dir as Facing);
            return;
          }
        }
        const armed = get().armedSetupUnitId;
        if (armed) {
          // A Mines token additionally can't land on an existing structure
          // (§17.0) — mirror `doSetupPlace`'s own validation in the picker.
          const entry = game.setupPool?.find((u) => u.id === armed);
          if (legalSetupHexes(game, !!entry?.mine).includes(hexId)) {
            get().placeSetupUnit(armed, hexId);
          }
        }
        return;
      }

      // Manual/Group reinforcement placement (§4.12): walk the queue Hex →
      // facing → (next Unit or dispatch). Any other click while armed is
      // ignored (Cancel/useDefaultReinforcementFacing clear the mode).
      const placingFacing = get().placingReinforcementFacing;
      if (placingFacing) {
        if (hexId === placingFacing.hexId) {
          get().useDefaultReinforcementFacing();
          return;
        }
        const dir = directionTo(placingFacing.hexId, hexId);
        if (dir >= 0) get().chooseReinforcementFacing(dir as Facing);
        return;
      }
      const placingQueue = get().placingReinforcementQueue;
      if (placingQueue.length > 0) {
        const placingId = placingQueue[0]!;
        const r = game.reinforcements.find((x) => x.id === placingId);
        if (r && legalEntryHexes(game, r).includes(hexId)) {
          set({
            placingReinforcementQueue: placingQueue.slice(1),
            placingReinforcementFacing: { unitId: placingId, hexId },
          });
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

      // General Group Move (§10.2/§10.3): walk the queue Hex → (next member or
      // dispatch). The active (front) member's own Hex means "leave it in
      // place" (§10.2: "or not move and just Pivot in Place"); any other
      // clicked Hex must be one of ITS OWN legal move destinations — clicking
      // a hex only legal for a different member is ignored, matching the
      // free-facing/pivot pickers' "ignore anything that isn't a valid choice
      // for the currently-armed thing" pattern.
      const gmQueue = get().groupMoveQueue;
      if (gmQueue.length > 0) {
        const activeId = gmQueue[0]!;
        const unit = game.units[activeId];
        if (!unit) {
          set({ groupMoveQueue: gmQueue.slice(1) });
          return;
        }
        let choice: { unitId: UnitId; toHexId?: HexId } | null = null;
        if (hexId === unit.hexId) {
          choice = { unitId: activeId };
        } else if (moveCost(game, unit, hexId).ap != null) {
          choice = { unitId: activeId, toHexId: hexId };
        }
        if (!choice) return; // not a legal destination for this member — ignore
        const nextQueue = gmQueue.slice(1);
        const nextDone = [...get().groupMoveDone, choice];
        if (nextQueue.length > 0) {
          set({ groupMoveQueue: nextQueue, groupMoveDone: nextDone });
        } else {
          set({ groupMoveQueue: [], groupMoveDone: [], groupSel: [] });
          submitGroupMove(nextDone);
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

      // §11 Hidden Units: a hidden enemy Unit must not leak into the stacked-
      // unit picker either — same visibility predicate as Board.tsx's own
      // `unitsByHex` filter.
      const here = Object.values(game.units).filter(
        (u) => u.hexId === hexId && (!u.hidden || u.side === game.currentSide),
      );

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
              set({ chooser: { hexId, x: opts.x, y: opts.y, ctrl: opts.ctrl } });
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
        // Ctrl+click only — a deliberately-secondary action, not offered on a
        // plain click (user request: keep the popup free of Recon by
        // Fire/Become Hidden/Fire Smoke unless the click was Ctrl+held).
        const canFireSmoke =
          opts.ctrl && acts.some((a) => a.type === 'FIRE_SMOKE' && a.targetHexId === hexId);
        // Load (§15.7): clicking a hex with an eligible friendly Vehicle (same
        // hex or adjacent) may mean "just move/stack here" as well as "load onto
        // it" — offer both via the chooser when ambiguous (§5.4-style choice).
        const loadVehicleId = here.find(
          (u) => u.side === sel.side && acts.some((a) => a.type === 'LOAD' && a.vehicleId === u.id),
        )?.id;
        const canLoad = !!loadVehicleId;
        // §11.3-11.6 Hidden Move — a Hex-targeted option like Move, offered
        // whether becoming Hidden or already Hidden and moving. Ctrl+click
        // only, same reasoning as `canFireSmoke` above.
        const canHiddenMove =
          opts.ctrl && acts.some((a) => a.type === 'HIDDEN_MOVE' && a.toHexId === hexId);
        // §11.7 Recon by Fire — a Hex-targeted Attack, legal on any Hex in the
        // Fire Zone regardless of whether an enemy is known to be there.
        // Ctrl+click only, same reasoning as `canFireSmoke` above.
        const canReconByFire =
          opts.ctrl && acts.some((a) => a.type === 'RECON_BY_FIRE' && a.targetHexId === hexId);
        const optionCount =
          Number(canMoveHere) +
          Number(canFire) +
          Number(canCC) +
          Number(canOccupyFortification) +
          Number(canAttackFortification) +
          Number(canIndirectFire) +
          Number(canFireSmoke) +
          Number(canLoad) +
          Number(canHiddenMove) +
          Number(canReconByFire);

        // Several things are possible here (e.g. move INTO an enemy hex vs attack
        // it) → let the player choose (§5.4). Otherwise do the single option.
        if (optionCount > 1) {
          set({ chooser: { hexId, x: opts.x, y: opts.y, ctrl: opts.ctrl } });
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
        if (canHiddenMove) {
          get().hiddenMove(sel.id, hexId);
          return;
        }
        if (canReconByFire) {
          get().reconByFire(sel.id, hexId);
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
      } else if (own.length > 1) {
        // All Spent, but more than one own Unit here (e.g. a Vehicle towing a
        // Spent passenger) — still needs a picker, or the second Unit can
        // never be reached by a plain click (only via the undiscoverable
        // Ctrl+click picker above). Caught live: a Spent Truck carrying a
        // Spent Maxim always silently selected the Maxim (`own[0]`), so the
        // Truck itself — the only one with a real CAP-affordable Move —
        // could never be selected to actually move it.
        get().openPicker(hexId, own.map((u) => u.id), opts.x, opts.y);
      } else {
        set({ selectedUnitId: own[0]!.id }); // all spent — select for inspection
      }
    },

    dispatch: (action) => {
      const { game, mode } = get();
      if (!game) return;

      if (mode === 'online') {
        // Cheap local turn gate — but NOT for CHOOSE_FACING. §4.5/§15.11's
        // free facing correction is deliberately turn-agnostic (a normal
        // Action always hands the Turn to the other side *before* that
        // window opens, and `reduce()`'s own `doChooseFacing` has no
        // `currentSide` check at all) — gating it the same as every other
        // Action here made it undispatchable online (caught live: a Move
        // committed fine, but its follow-up facing picker silently refused
        // to fire). Every OTHER Action type still needs this gate client-side
        // even though `reduce()` itself also checks `unit.side !==
        // currentSide` internally, because `PASS` has no unit/side field at
        // all (`{ type: 'PASS' }`) — `reduce()` has no caller identity to
        // self-defend it with, so skipping this gate entirely would let
        // either side trigger the *other* side's Pass.
        if (action.type === 'CHOOSE_FACING') {
          // `doChooseFacing` itself never checks `unit.side` (only that the
          // Unit is actually in `pendingFacingChoices`) — harmless on one
          // shared hotseat screen, but online this Unit-ownership check is
          // the only thing stopping a client from refacing the OTHER side's
          // still-open correction window.
          if (game.units[action.unitId]?.side !== get().mySide) return;
        } else if (get().mySide !== game.currentSide) {
          return;
        }
        const res = reduce(game, action);
        const illegal = res.events.length === 1 && res.events[0]?.type === 'illegal';
        if (illegal) {
          set({ lastEvents: res.events });
          return;
        }
        // Optimistic apply for instant feedback (M13 plan: "optimistic for
        // the actor") — persist/history are off online, the server is the
        // source of truth, not localStorage/local Undo.
        applyReduceResult(game, action, res, { persist: false, trackHistory: false });
        const roomCode = get().roomCode;
        if (roomCode) netClient?.send({ type: 'ACTION', roomCode, sessionId: getSessionId(), action });
        return;
      }

      const res = reduce(game, action);
      const illegal = res.events.length === 1 && res.events[0]?.type === 'illegal';
      if (illegal) {
        set({ lastEvents: res.events });
        return;
      }
      applyReduceResult(game, action, res, { persist: true, trackHistory: true });
    },

    createOnlineRoom: (missionId) => {
      netClient?.close();
      const sessionId = getSessionId();
      const client = new NetClient();
      netClient = client;
      client.onMessage(handleServerMsg);
      client.onClose(() => set({ peerConnected: false }));
      client.onOpen(() => client.send({ type: 'CREATE', missionId, sessionId }));
      client.connect();
      set({
        game: null,
        ...resetForLoad(),
        mode: 'online',
        mySide: null,
        roomCode: null,
        peerConnected: false,
        netError: null,
      });
    },

    joinOnlineRoom: (roomCode) => {
      netClient?.close();
      const sessionId = getSessionId();
      const client = new NetClient();
      netClient = client;
      client.onMessage(handleServerMsg);
      client.onClose(() => set({ peerConnected: false }));
      client.onOpen(() => client.send({ type: 'JOIN', roomCode, sessionId }));
      client.connect();
      set({
        game: null,
        ...resetForLoad(),
        mode: 'online',
        mySide: null,
        roomCode: null,
        peerConnected: false,
        netError: null,
      });
    },

    leaveOnlineRoom: () => {
      netClient?.close();
      netClient = null;
      set({
        game: null,
        ...resetForLoad(),
        mode: 'hotseat',
        mySide: null,
        roomCode: null,
        peerConnected: false,
        netError: null,
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
    // §4.0: Exit the Map via a designated exit zone — no roll, straight through capGate to dispatch.
    exit: (unitId) => capGate({ type: 'EXIT', unitId }, (a) => get().dispatch(a)),
    // §11.3: Hidden Move — no roll to preview (Spent Check happens the same
    // way any other Action's does, via `dispatch`), straight through capGate.
    hiddenMove: (unitId, toHexId) =>
      capGate({ type: 'HIDDEN_MOVE', unitId, toHexId }, (a) => get().dispatch(a)),
    // §11.7: Recon by Fire routes through `requestReconRoll` for its own
    // two-roll (Reveal Number, then conditionally an Attack) preview —
    // mirrors `fire`/`closeCombat` routing through `requestFireRoll` rather
    // than dispatching straight to `reduce`.
    reconByFire: (attackerId, targetHexId) =>
      capGate({ type: 'RECON_BY_FIRE', attackerId, targetHexId }, (a) =>
        requestReconRoll(a as Extract<Action, { type: 'RECON_BY_FIRE' }>),
      ),

    // §8.5-8.6: Play Card doesn't fit `capGate`'s shape exactly (a Blue-cost
    // card needs no Unit at all, and never cares about Fresh/Spent), so this
    // is its own small CAP-confirm gate rather than extending `GateableAction`.
    playCard: (side, cardId, unitId) => {
      const g = get().game;
      if (!g) return;
      const action: Extract<Action, { type: 'PLAY_CARD' }> = { type: 'PLAY_CARD', side, cardId, unitId };
      const card = CARD_CATALOG[cardId];
      const unit = unitId ? g.units[unitId] : undefined;
      if (card?.cost?.color === 'green' && unit?.status === 'spent') {
        const cost = modifiedActionCost(g, action);
        if (cost == null) {
          get().dispatch(action);
          return;
        }
        const cap = g.players[unit.side].capCurrent;
        if (cap < cost) {
          set({ lastEvents: [{ type: 'illegal', round: g.round, text: `${unit.id} is Spent and needs ${cost} CAP (only ${cap} left)` }] });
          return;
        }
        set({
          pendingConfirm: {
            message: `${unit.id} is Spent. Spend ${cost} CAP to play this card at 0AP (§8.6)? CAP ${cap} → ${cap - cost}.`,
            proceed: () => get().dispatch({ ...action, capCostReduce: cost }),
          },
        });
        return;
      }
      get().dispatch(action);
    },
    // §13.5: arm an Artillery Card — the next board click (any Hex) plans its Strike.
    armObaCard: (card) => set({ armedObaCard: card }),
    planObaStrike: (side, cardId, targetHexId) => {
      const g = get().game;
      if (!g) return;
      get().dispatch({ type: 'PLAN_OBA_STRIKE', side, cardId, targetHexId });
      set({ armedObaCard: null });
    },

    // Pre-Mission Setup phase: arm a Setup Pool Unit, then a board click on a
    // legal Hex places it — free, no CAP gate, no roll, straight to dispatch.
    armSetupUnit: (unitId) => set({ armedSetupUnitId: unitId }),
    placeSetupUnit: (unitId, hexId) => {
      get().dispatch({ type: 'SETUP_PLACE', unitId, hexId });
      set({ armedSetupUnitId: null });
    },

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

    startPlaceReinforcements: (unitIds) => {
      const g = get().game;
      if (!g) return;
      const eligible = unitIds.filter((id) => {
        const r = g.reinforcements.find((x) => x.id === id);
        return r && r.side === g.currentSide && g.round >= r.earliestRound;
      });
      if (eligible.length === 0) return;
      set({
        placingReinforcementQueue: eligible,
        placingReinforcementFacing: null,
        placingReinforcementDone: [],
        armedSetupUnitId: null,
    armedObaCard: null,
        selectedUnitId: null,
        groupMode: false,
        groupSel: [],
        groupMoveQueue: [],
        groupMoveDone: [],
        movePath: [],
      });
    },
    cancelPlaceReinforcements: () =>
      set({ placingReinforcementQueue: [], placingReinforcementFacing: null, placingReinforcementDone: [] }),

    useDefaultReinforcementFacing: () => {
      const placing = get().placingReinforcementFacing;
      if (!placing) return;
      const g = get().game;
      const r = g?.reinforcements.find((x) => x.id === placing.unitId);
      get().chooseReinforcementFacing((r?.facing ?? 0) as Facing);
    },

    chooseReinforcementFacing: (facing) => {
      const { placingReinforcementFacing: placing, placingReinforcementQueue: queue, placingReinforcementDone: done } = get();
      if (!placing) return;
      const nextDone = [...done, { unitId: placing.unitId, hexId: placing.hexId, facing }];
      if (queue.length > 0) {
        set({ placingReinforcementFacing: null, placingReinforcementDone: nextDone });
        return;
      }
      // Every queued Unit now has a Hex + facing — dispatch the whole batch as
      // one ENTER Action (a real Group entry when nextDone.length > 1, §4.12).
      // Board.tsx's entry-Hex highlighting only ever offers Hexes connected to
      // whatever's already placed, so the reducer's own §4.12 adjacency check
      // should always agree — but don't just assume that and clear state
      // before dispatching (CLAUDE.md §3.5: legality lives in the engine,
      // the UI must still check rather than blindly trust its own picker);
      // if the reducer disagrees anyway, reopen the queue instead of silently
      // dropping the Units.
      get().dispatch({ type: 'ENTER', placements: nextDone });
      const { lastEvents } = get();
      const illegal = lastEvents.length === 1 && lastEvents[0]?.type === 'illegal';
      set(
        illegal
          ? { placingReinforcementQueue: nextDone.map((d) => d.unitId), placingReinforcementFacing: null, placingReinforcementDone: [] }
          : { placingReinforcementQueue: [], placingReinforcementFacing: null, placingReinforcementDone: [] },
      );
    },

    toggleGroupMode: () =>
      set((s) => ({
        groupMode: !s.groupMode,
        groupSel: [],
        groupMoveQueue: [],
        groupMoveDone: [],
        selectedUnitId: null,
      })),
    clearGroup: () => set({ groupSel: [], groupMoveQueue: [], groupMoveDone: [] }),
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
      // Formation move: each member steps one hex in `dir` if legal, else stays (§10.2).
      const moves = groupSel.map((id) => {
        const u = game.units[id]!;
        const to = idOf(neighbor(parseHexId(u.hexId), dir));
        if (game.hexes[to] && moveCost(game, u, to).ap != null) return { unitId: id, toHexId: to };
        return { unitId: id };
      });
      set({ groupSel: [] });
      submitGroupMove(moves);
    },

    startGroupMoveIndividually: () => {
      const { groupSel } = get();
      if (groupSel.length === 0) return;
      set({ groupMoveQueue: groupSel, groupMoveDone: [] });
    },
    cancelGroupMoveIndividually: () => set({ groupMoveQueue: [], groupMoveDone: [] }),

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
        case 'RECON_BY_FIRE':
          // This stepper means the Hit Number mod for 'recon' — the Reveal
          // Number's own mod (`capRevealDiceMod`) is untouched here.
          requestReconRoll(p.action, p.capRevealDiceMod ?? 0, next);
          break;
      }
    },
    // §11.7 ONLY: the Reveal Number's own stepper, independent of
    // `adjustPendingCapMod` (which means the Hit Number mod for this kind).
    adjustPendingRevealMod: (delta) => {
      const p = get().pendingRoll;
      if (!p || p.kind !== 'recon' || p.action.type !== 'RECON_BY_FIRE') return;
      const max = p.capRevealDiceModMax ?? 0;
      const current = p.capRevealDiceMod ?? 0;
      const next = Math.max(-max, Math.min(max, current + delta));
      if (next === current) return;
      requestReconRoll(p.action, next, p.capDiceMod ?? 0);
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
      const { history, game, mode } = get();
      if (mode === 'online' || history.length === 0 || !game) return;
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
        groupMoveQueue: [],
        groupMoveDone: [],
        placingReinforcementQueue: [],
        placingReinforcementFacing: null,
        placingReinforcementDone: [],
        armedSetupUnitId: null,
    armedObaCard: null,
        pendingRoll: null,
        pendingConfirm: null,
        chooser: null,
        turnBanner: null,
        lastEvents: [{ type: 'undo', round: prev.round, text: 'Undid last action' }],
      });
    },

    redo: () => {
      const { future, game, mode } = get();
      if (mode === 'online' || future.length === 0 || !game) return;
      const next = future[0]!;
      saveAuto(next);
      set({
        game: next,
        future: future.slice(1),
        history: [...get().history, game].slice(-HISTORY_LIMIT),
        selectedUnitId: null,
        movePath: [], // see undo() — stale in-progress action state must not survive time-travel
        groupSel: [],
        groupMoveQueue: [],
        groupMoveDone: [],
        placingReinforcementQueue: [],
        placingReinforcementFacing: null,
        placingReinforcementDone: [],
        armedSetupUnitId: null,
    armedObaCard: null,
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
