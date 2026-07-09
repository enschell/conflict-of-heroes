/**
 * Core shared types for the Conflict of Heroes engine.
 *
 * Everything here is plain, JSON-serializable data (no classes, no functions,
 * no Map/Set). See CLAUDE.md §3 (engine golden rules).
 */

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/** Axial hex coordinate. Internal math uses these (see hex.ts). */
export interface Axial {
  q: number;
  r: number;
}

/** Canonical hex key, `${q},${r}`. Used to index `GameState.hexes`. */
export type HexId = string;

/** Facing as an axial direction index 0..5 (see hex.ts AXIAL_DIRECTIONS). */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Sides & nations
// ---------------------------------------------------------------------------

/**
 * A *side* is one of the two opposing forces and is the unit of turn-taking.
 * A side is composed of one or more *nations* (data). Do not hardcode armies.
 */
export type SideId = 'A' | 'B';

/** e.g. 'germans', 'soviets'. Drives unit stat templates and cards. */
export type NationId = string;

export type UnitId = string;
export type CardId = string;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export type TerrainId =
  | 'open'
  | 'road'
  | 'buildingStone'
  | 'buildingWood'
  | 'plowed'
  | 'water'
  | 'woodsLight'
  | 'woodsHeavy';

/** Defensive properties of a terrain type (rulebook §4.0 / §5.0 table). */
export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** Additional AP cost to move into a hex of this terrain. */
  apCost: number;
  /** Defensive modifier added to a unit's DR while in this terrain. */
  dm: number;
  /** Does this terrain block line of sight through the hex? */
  blocksLOS: boolean;
  /** Does this terrain count as "cover" (rally +1, hidden, etc.)? */
  isCover: boolean;
  /** Passable only by unburdened foot units / boats (e.g. water). */
  footOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** red = soft/dispersed target (men); blue = armored target (vehicles). */
export type DRColor = 'red' | 'blue';

export type UnitKind = 'infantry' | 'mg' | 'mortar' | 'gun' | 'vehicle';

/** A unit stat template (authored data, keyed by nation). */
export interface UnitTemplate {
  id: string;
  nation: NationId;
  name: string;
  kind: UnitKind;
  /** Firepower: red = HE/bullets, blue = armor-piercing. */
  fp: { red: number; blue: number };
  /** Defense rating: front + flank, with the target color. */
  dr: { front: number; flank: number; color: DRColor };
  /** Red movement cost (APs to move 1 open hex). */
  move: number;
  /** Range in hexes. */
  range: number;
  /** AP cost to fire. */
  apToFire: number;
  /** Victory points awarded to the opponent when this unit is destroyed. */
  vp: number;
  /** Unburdened foot units have a move cost of 2 or less (rulebook §1.1). */
  unburdened: boolean;
  /**
   * FP printed in a white box (crew-served weapons): in close combat this unit
   * gets −2FP instead of the usual +4 (rulebook §7.7.3).
   */
  whiteBoxFp?: boolean;
  /** Vehicle propulsion (§15.1): wheeled (green Move Cost) or tracked (blue). */
  propulsion?: 'wheeled' | 'tracked';
  /** Vehicle Bonus Move symbols (§15.2): extra hexes per Move Action at no AP. */
  bonusMoves?: number;
  /**
   * Mobile Vehicle (§16.4): a Wheeled Vehicle that ALSO has Track Bonus Move
   * symbols alongside its (Wheel) `bonusMoves`. These extra Bonus Moves may be
   * used in any order and, unlike Wheel Bonus Moves, may enter Open Terrain and
   * are not blocked by Road Congestion.
   */
  mobileTrackBonusMoves?: number;
  // -- Special Units (§16) --
  /** Turreted Vehicle (§16.2): may Attack outside its Arc of Fire (+2AP Attack Cost). */
  turreted?: boolean;
  /**
   * Open-Topped Vehicle (§16.5): vs HE/Flamethrower/red-FP Close Combat/Sniper,
   * its blue Flank Defense is treated as red and pulls a Soft Target Hit Marker.
   */
  openTopped?: boolean;
  /** APC (§16.6, red-shield icon): a Soft Target it Transports gains +2DR from all flanks. */
  apcTransport?: boolean;
  /** Trucks/Wagons (§16.1) cannot take control of a Hex. */
  cannotControlHex?: boolean;
  /** Trucks/Wagons (§16.1): destroyed, does not adjust the CAPs Track (still counts for VP). */
  noCapLossOnDestroy?: boolean;
  /**
   * Attack restriction (§16.1): Trucks may only attack in Close Combat; Wagons
   * may not attack at all. Undefined = normal (ranged + close combat).
   */
  attackMode?: 'closeCombatOnly' | 'none';
  // -- Mortars & Smoke (§13.0–§13.3, §14.0) --
  /**
   * Minimum Range (§13.1/§13.2, mortars): a Direct or Indirect Attack may not
   * target a Hex closer than this. `kind: 'mortar'` also always resolves its
   * FIRE/INDIRECT_FIRE Attacks vs the target's Flank Defense (HE, §13.9).
   */
  minRange?: number;
  /** Indirect Attack Cost (§13.0), separate from `apToFire`'s Direct Attack Cost. */
  indirectApToFire?: number;
  /** May Fire Smoke (§14.0: mortars 80mm+, Artillery Cards, Pioneers, some Tanks). */
  canFireSmoke?: boolean;
  // -- Flamethrowers & Pioneers (§18.0–§18.1) --
  /**
   * Foot or Vehicle Unit marked with a Flamethrower symbol (§18.0): may
   * choose to Attack (ranged FIRE, max Range 1, or CLOSE_COMBAT) with the
   * Flamethrower instead of its normal Firepower — see `useFlamethrower` on
   * those Actions. Flat 3 Red/3 Blue Firepower, always vs Flank Defense,
   * ignores ALL DR modifiers except Smoke.
   */
  hasFlamethrower?: boolean;
  /**
   * Pioneer Unit (§18.1): follows all Foot Unit rules, with three exceptions
   * — may enter a Mines Hex without triggering a Mines Attack (`resolveMines`
   * skips it); its Fire Smoke Action is capped to Range 1 (vs its own
   * `range`/Mortar-style Max Range otherwise); and (redundantly with
   * `hasFlamethrower`, which every Pioneer also sets) it may attack with a
   * Flamethrower. Distinct from `hasFlamethrower` because a Flame Tank has
   * the flamethrower without being a Pioneer (no Mines immunity, no
   * Range-1-capped Smoke).
   */
  pioneer?: boolean;
  /**
   * Prototype (UI counter redesign, unshipped): a `public/assets/units/...`
   * path to art rendered as the counter's background in place of the plain
   * nation-color fill. Only set on units used to live-preview the new
   * layout — not a general content field yet.
   */
  counterImage?: string;
}

/** A unit instance on the map. */
export interface Unit {
  id: UnitId;
  side: SideId;
  nation: NationId;
  templateId: string;
  hexId: HexId;
  facing: Facing;
  /** v3 (§2.2): a Unit is Fresh or Spent (no 7AP activation). */
  status: 'fresh' | 'spent';
  /**
   * v3 Stress (§2.6): true once this Unit took an Action; adds +1AP to its next
   * Action Cost if it acts again on this side's very next Turn. Not cumulative;
   * cleared by Passing (§2.7). The step-3 turn loop reads/sets this.
   */
  stressed: boolean;
  /** At most one hit marker (a second hit destroys the unit). */
  hitMarkers: HitType[];
  assignedWeaponCards: CardId[];
  /** If loaded onto a transport Vehicle (§15.6–15.9): the carrying Vehicle's id. */
  carriedBy?: UnitId;
  /** §17.2/17.3: true while this Unit is occupying (not merely standing atop)
   *  its Hex's Trench/Bunker Fortification. */
  occupyingFortification?: boolean;
  /** §17.6: a Hasty Defense this Unit itself built (5AP Action). Per-Unit, not
   *  a Hex feature — multiple Units in one Hex may each hold their own, and it
   *  is stripped the instant this Unit Moves, Pivots, or is destroyed (or
   *  removed at will, for free, via `REMOVE_HASTY_DEFENSE`). A transported
   *  Unit cannot build one (§17.6 describes fortifying one's own position). */
  hastyDefense?: boolean;
}

// ---------------------------------------------------------------------------
// Reinforcements (§4.12): Units that begin off the Map and enter later.
// ---------------------------------------------------------------------------

/**
 * A not-yet-placed Unit waiting to enter the Map (§4.12). Same identity as a
 * Unit, minus `hexId`/status/hit state (it has none of those until it enters).
 */
export interface ReinforcementUnit {
  id: UnitId;
  side: SideId;
  nation: NationId;
  templateId: string;
  /** The Mission's suggested facing on entry; an ENTER placement may override it. */
  facing: Facing;
  /** Which authored wave this belongs to (for display/grouping only). */
  waveId: string;
  /** May enter starting this Round, or any later Round (player's choice, §4.12). */
  earliestRound: number;
  /** Full entry Hexes the Mission specifies for this wave (an edge row, a named hex, or an area). */
  entryHexIds: HexId[];
  /** Human-readable entry condition for display, e.g. "Road Hex R07" (authored, not derived). */
  entryDescription: string;
}

// ---------------------------------------------------------------------------
// Hit markers
// ---------------------------------------------------------------------------

/** Soft Target (foot) hit markers (§7.5). */
export type SoftHitType =
  | 'stunned'
  | 'unnerved'
  | 'kia'
  | 'pinned'
  | 'panicked'
  | 'suppressed'
  | 'cowering'
  | 'berserk';

/**
 * Armored Target (vehicle) hit markers (§15.13). Distinct ids (prefixed `a`) so
 * a marker is self-describing — its own effects and rally number — regardless of
 * which draw pile it came from.
 */
export type ArmoredHitType =
  | 'aStunned'
  | 'aDestroyed'
  | 'aImmobilized'
  | 'aLightDamage'
  | 'aGunDamaged'
  | 'aPanicked'
  | 'aSuppressed';

export type HitType = SoftHitType | ArmoredHitType;

/** Definition of a foot hit marker (rulebook §7.5). */
export interface HitMarkerDef {
  type: HitType;
  /** How many copies are in the foot hit-marker pile. */
  count: number;
  /** 2D6 roll needed to rally this marker off (0 = cannot rally / N/A). */
  rally: number;
  /** Killed immediately when drawn. */
  killOnDraw?: boolean;
  // Stat modifiers applied while this marker is on the unit:
  apToFireDelta?: number;
  fpRedDelta?: number;
  fpBlueDelta?: number;
  frontDrDelta?: number;
  flankDrDelta?: number;
  moveCostDelta?: number;
  rangeOverride?: number;
  // Ability restrictions:
  cannotMove?: boolean;
  cannotPivot?: boolean;
  cannotFire?: boolean;
  /** Unit may take no action other than rallying. */
  onlyRally?: boolean;
}

/** A multiset of remaining hit markers in a pile (type -> count). */
export type HitPile = Record<HitType, number>;

// ---------------------------------------------------------------------------
// Obstacles (§17.7-§17.10: Barbed Wire, Mines, Road Block)
// ---------------------------------------------------------------------------

export type ObstacleKind = 'barbedWire' | 'mines' | 'roadBlock';

export interface ObstacleState {
  kind: ObstacleKind;
  /** Mines only (§17.10): the fixed Hit Number rolled against any Unit that
   *  moves into, Pivots in, or initiates Close Combat in this Hex. */
  hitNumber?: number;
  /** §17.11: the Defense Rating needed to destroy this Obstacle by Attack;
   *  absent = not destructible. */
  destroyDr?: number;
  destroyed: boolean;
  /** The side that placed this Obstacle — for Mines (§17.10), this is whose
   *  CAP pays for the up-to-2 Hit Number modification before rolling. */
  ownerSide: SideId;
}

// ---------------------------------------------------------------------------
// Fortifications (§17.1-§17.6: Trenches, Bunkers; Hasty Defenses are per-Unit,
// see Unit.hastyDefense above, not a Hex feature)
// ---------------------------------------------------------------------------

export type FortificationKind = 'trench' | 'bunker';

export interface FortificationState {
  kind: FortificationKind;
  /** Bunkers only (§17.1/17.5): the red Facing that locks the occupant's own
   *  facing and Arc of Fire. Undefined for Trenches (occupant may face any
   *  direction, §17.4). */
  facing?: Facing;
  /** §17.11: the Defense Rating needed to destroy this Fortification by ranged
   *  Attack; absent = not destructible. Black DR (§17.1) — effective vs both
   *  Red and Blue Firepower, so this is a flat number with no color. */
  destroyDr?: number;
  destroyed: boolean;
}

// ---------------------------------------------------------------------------
// Hexes (runtime board state)
// ---------------------------------------------------------------------------

export interface Hex {
  id: HexId;
  coord: Axial;
  /** Optional display label, e.g. "J10". */
  label?: string;
  /**
   * Set only on a board's upper-left cell (docs/hex_board_spec/README.md
   * §Labeling) — that cell carries this number instead of a coordinate
   * label, so `label` is unset there even though it renders text too.
   */
  boardNumber?: number;
  /**
   * Which board (by its §Labeling number, e.g. 1) this hex belongs to — set
   * on EVERY hex generated by `hexBoard.ts`'s `generateBoardHexes` (unlike
   * `boardNumber` above, which is only on the one corner cell that renders
   * the big graphic). Lets UI code address a hex the same way the rulebook
   * does, "(Map #)-(Column Letter & Row #)" (§1.0, e.g. "1-E05") — see
   * `HoverPanel.tsx`'s "Map N, LABEL" display. Undefined on hand-authored
   * maps that predate the flat-top substrate (the non-canonical sandboxes).
   */
  mapNumber?: number;
  /**
   * Which of this hex's own board-relative sides are a genuinely exposed
   * board edge (no abutting board there) and so get clipped to a
   * half/quarter-hex polygon (§Straight-edge clip). Board-relative, NOT
   * keyed by hex facing: the board's west/east clip lines pass through a
   * hex's center but don't align with any single one of its six edges (they
   * cross two), while north/south clip lines happen to coincide with the
   * hex's own N/S edges — so `w`/`e`/`n`/`s` are their own compass axis, one
   * independent half-plane cut each, matching the spec's own xL/xR/yT/yB
   * clip-box model. A merged/shared seam edge is NOT cut (it renders as
   * part of a full hex) and so is absent here. Undefined (or all-false)
   * means "ordinary full hex, no board-edge clipping."
   */
  edgeCut?: { w?: true; e?: true; n?: true; s?: true };
  terrain: TerrainId;
  elevation: number;
  /** Wall on edge in direction i (0..5). Length 6. */
  walls: boolean[];
  /** This hex is part of a road network. */
  road: boolean;
  features: {
    /** Side currently controlling this (victory) hex. */
    control?: SideId;
    /** Smoke level: 1 = +1DM, 2 = +2DM (later module). */
    smoke?: 1 | 2;
    /** §17.7 Obstacle occupying this Hex (Barbed Wire, Mines, Road Block). */
    obstacle?: ObstacleState;
    /** §17.1 Fortification occupying this Hex (Trench, Bunker). Only one of
     *  `obstacle`/`fortification` may be set at a time (§17.0). */
    fortification?: FortificationState;
  };
}

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/** Serializable RNG state (mulberry32). Advanced on every roll. */
export interface RngState {
  /** uint32 internal state. */
  state: number;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerState {
  side: SideId;
  nations: NationId[];
  capStart: number;
  capCurrent: number;
  /** Number of this side's units destroyed (permanently lowers CAP). */
  unitLosses: number;
  vp: number;
  hand: CardId[];
  /** True once this side has passed in the current pass cycle. */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Victory
// ---------------------------------------------------------------------------

export interface VictoryConfig {
  /** Objective hexes and the VP each is worth to its controller at end of Round (§9.1). */
  victoryHexes: { hexId: HexId; vp: number }[];
  /** Flat VP awarded per enemy Unit destroyed; falls back to the unit's template vp. */
  vpPerKill?: number;
}

// ---------------------------------------------------------------------------
// Events / log
// ---------------------------------------------------------------------------

export interface GameEvent {
  type: string;
  round: number;
  side?: SideId;
  text: string;
}

// ---------------------------------------------------------------------------
// Actions (the only way to mutate state; also the future wire format)
// ---------------------------------------------------------------------------

// v3 CAP fields (§3.2–§3.4): `capCostReduce` lowers the Action Cost before the
// Spent Check (any number, −1 each, can reach 0AP ⇒ no check); `capDiceMod`
// shifts a d6 Number Check by ±1 each (≤2). Both spend CAPs.
export type Action =
  // `path` (vehicles, §15.2): the multi-hex Bonus-Move sequence (each hex
  // adjacent to the last); when set, `toHexId` is its final hex. Foot moves omit it.
  // `minesCapMods` (§17.10): if the destination/current Hex has live Mines, the
  // owning side's chosen CAP dice-mod per attacked Unit id (UnitId -> mod,
  // clamped ±2); resolved by the UI (a CAP-choice dialog) before dispatch,
  // since the choice belongs to the Mines' owner, not necessarily the acting side.
  | {
      type: 'MOVE';
      unitId: UnitId;
      toHexId: HexId;
      path?: HexId[];
      facing?: Facing;
      capCostReduce?: number;
      minesCapMods?: Record<UnitId, number>;
      /** §17.2/17.3: occupy the destination Hex's Trench/Bunker on arrival —
       *  entering never auto-occupies, it's the player's choice. Also used
       *  for the same-Hex "occupy from within" Move (`toHexId === unitId`'s
       *  current Hex) when a Unit began its Turn in the Hex without occupying. */
      occupyFortification?: boolean;
    }
  | { type: 'PIVOT'; unitId: UnitId; facing: Facing; capCostReduce?: number; minesCapMods?: Record<UnitId, number> }
  // Free facing correction (§4.5 after a Move, §15.11 unloaded from a destroyed
  // Transport): 0AP, no Spent Check, no turn switch. Legal ONLY while `unitId`
  // appears in `GameState.pendingFacingChoices` (the engine grants this window
  // right after the Move/Unload/destroy-unload that put the Unit in a new Hex;
  // it closes as soon as any other Action resolves).
  | { type: 'CHOOSE_FACING'; unitId: UnitId; facing: Facing }
  | {
      type: 'FIRE';
      attackerId: UnitId;
      targetId: UnitId;
      capDiceMod?: number;
      capCostReduce?: number;
      /** §18.0: attack with a Flamethrower instead of normal Firepower —
       *  only legal for a `hasFlamethrower` Unit, max Range 1. */
      useFlamethrower?: boolean;
    }
  | {
      type: 'CLOSE_COMBAT';
      attackerId: UnitId;
      /** Omitted when `targetKind === 'structure'` (§17.12). */
      targetId?: UnitId;
      /** §17.12: a CC Attack picks ONE target — the occupant Unit or the
       *  Fortification/Obstacle itself, never both. Defaults to 'unit'. */
      targetKind?: 'unit' | 'structure';
      capDiceMod?: number;
      capCostReduce?: number;
      minesCapMods?: Record<UnitId, number>;
      /** §18.0: attack with a Flamethrower instead of normal Firepower —
       *  only legal for a `hasFlamethrower` Unit. */
      useFlamethrower?: boolean;
    }
  | { type: 'RALLY'; unitId: UnitId; capDiceMod?: number; capCostReduce?: number }
  | { type: 'STALL'; unitId: UnitId; capCostReduce?: number }
  // Mortar Indirect Attack (§13.2–§13.3): targets a Hex the Mortar can't see
  // itself, using a Spotter Hex (within 2 Hexes and clear LOS of the Mortar)
  // for LOS instead. Resolves like Stacked Fire (§7.5.1) against every enemy
  // in the Target Hex — always vs Flank Defense (HE, §13.9).
  | {
      type: 'INDIRECT_FIRE';
      attackerId: UnitId;
      targetHexId: HexId;
      spotterHexId: HexId;
      capDiceMod?: number;
      capCostReduce?: number;
    }
  // Fire Smoke (§14.1): instead of an Attack, a Mortar places a Heavy Smoke
  // Marker on the Target Hex — Direct (own LOS) or Indirect (via a Spotter Hex).
  | {
      type: 'FIRE_SMOKE';
      unitId: UnitId;
      targetHexId: HexId;
      spotterHexId?: HexId;
      capCostReduce?: number;
    }
  // Group Move (§10.2–§10.4): one Action for a continuously-adjacent Group; each
  // member may move to an adjacent hex and/or pivot, or stay. Cost = the highest
  // member move cost; one Spent Check for the Group.
  | {
      type: 'GROUP_MOVE';
      moves: { unitId: UnitId; toHexId?: HexId; facing?: Facing }[];
      capCostReduce?: number;
    }
  // Group Attack (§10.5–§10.8): a leader fires at a target with support from
  // adjacent units (+1AR each); cost = the leader's Attack Cost; one Spent Check.
  | {
      type: 'GROUP_ATTACK';
      leaderId: UnitId;
      supporterIds: UnitId[];
      targetId: UnitId;
      capDiceMod?: number;
      capCostReduce?: number;
    }
  // Group Rally (§10.9): same/adjacent Hit Units Rally as one Action — an
  // individual Rally Check per Unit, but a single Group Spent Check at 5AP.
  | { type: 'GROUP_RALLY'; unitIds: UnitId[]; capCostReduce?: number }
  // Transport (§15.7/§15.9): a foot Unit loads onto / unloads from a Vehicle —
  // a Group Move with a single Group Spent Check for the pair.
  | { type: 'LOAD'; unitId: UnitId; vehicleId: UnitId; capCostReduce?: number }
  | { type: 'UNLOAD'; unitId: UnitId; toHexId: HexId; facing?: Facing; capCostReduce?: number }
  // Entering the Mission (§4.12): 0AP, never a Spent Check (but the Unit is
  // Stressed). Reinforcements may enter as a Group — one Action placing several
  // Units on their entry Hexes at once.
  | { type: 'ENTER'; placements: { unitId: UnitId; hexId: HexId; facing?: Facing }[] }
  // Hasty Defense (§17.6): a Foot Unit spends 5AP to build one on itself (not
  // transported, not already marked). Stripped by this Unit's own Move/Pivot/
  // destruction (§5's doMove/doPivot), or removed at will for free (below).
  | { type: 'HASTY_DEFENSE'; unitId: UnitId; capCostReduce?: number }
  // §17.6 "a player may freely remove their Hasty Defense at will": 0AP, no
  // Spent Check, no CAP check — mirrors CHOOSE_FACING's no-cost immediacy.
  | { type: 'REMOVE_HASTY_DEFENSE'; unitId: UnitId }
  | { type: 'PASS' };

export type ActionType = Action['type'];

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GamePhase = 'setup' | 'playing' | 'gameOver';

export interface GameState {
  /** Seeded RNG; advanced on every dice roll. Makes saves/replays deterministic. */
  rng: RngState;
  phase: GamePhase;
  round: number;
  roundsTotal: number;
  /** Side that won initiative this round (took the first turn). */
  initiativeSide: SideId;
  /** Side with first-Turn Initiative in Round 1 (mission-defined, §2.0). */
  firstInitiativeSide: SideId;
  /**
   * The v3 "no-tie" VP track marker (§9.2): a signed VP Advantage from Side A's
   * perspective — `> 0` means A leads by that many, `< 0` means B leads. It is
   * never 0 (one side always holds VP Advantage); gaining VP steps it one space,
   * skipping 0 when it would flip sides. `vpLeader`/`vpMargin` derive from it.
   */
  vpMarker: number;
  /** Side whose turn it currently is. */
  currentSide: SideId;
  /** Consecutive passes; 2 ends the round. */
  consecutivePasses: number;
  players: Record<SideId, PlayerState>;
  units: Record<UnitId, Unit>;
  /** Unit stat templates referenced by units (kept in state so saves are self-contained). */
  templates: Record<string, UnitTemplate>;
  hexes: Record<HexId, Hex>;
  hitPiles: { foot: HitPile; vehicle: HitPile };
  /** Units waiting to enter the Map (§4.12); removed here and added to `units` on ENTER. */
  reinforcements: ReinforcementUnit[];
  missionId: string;
  victory: VictoryConfig;
  log: GameEvent[];
  /** Winner once phase === 'gameOver'. v3 has no ties — always the VP-Advantage holder (§9.3). */
  winner?: SideId | null;
  /**
   * Units still eligible for a free, no-cost `CHOOSE_FACING` (§4.5, §15.11):
   * populated by a Move/Group Move (the mover, per member), an Unload, or a
   * destroyed Transport's auto-unloaded passenger. Cleared at the start of
   * `reduce` for any Action other than `CHOOSE_FACING` — the window is open
   * until the next Action, by either side.
   */
  pendingFacingChoices?: UnitId[];
}

/** Result of reducing an action: the next state plus emitted events. */
export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Scenario / firefight definitions (authored data → initGame)
// ---------------------------------------------------------------------------

export interface MapHexDef {
  id: HexId;
  terrain: TerrainId;
  elevation?: number;
  /** Edge indices (0..5) that have a wall. */
  walls?: number[];
  road?: boolean;
  label?: string;
  /** See Hex.boardNumber — set only on a board's upper-left cell. */
  boardNumber?: number;
  /** See Hex.mapNumber — set on every hex of a generated board. */
  mapNumber?: number;
  /** See Hex.edgeCut — board-relative half-plane clip flags for this hex. */
  edgeCut?: Hex['edgeCut'];
  /** §17.7 Obstacle placed here at setup (`destroyed` always starts false). */
  obstacle?: { kind: ObstacleKind; hitNumber?: number; destroyDr?: number; ownerSide: SideId };
  /** §17.1 Fortification placed here at setup (`destroyed` always starts false). */
  fortification?: { kind: FortificationKind; facing?: Facing; destroyDr?: number };
}

export interface UnitPlacement {
  id: UnitId;
  side: SideId;
  templateId: string;
  hexId: HexId;
  facing: Facing;
}

/** A Mission-authored reinforcement wave: a set of Units + when/where they may enter (§4.12). */
export interface ReinforcementWaveDef {
  id: string;
  side: SideId;
  /** May enter starting this Round, or any later Round (player's choice). */
  earliestRound: number;
  /** Full entry Hexes the Mission specifies (an edge row, a single named hex, or an area). */
  entryHexIds: HexId[];
  /** Human-readable entry condition for display, e.g. "Road Hex R07" (authored, not derived). */
  entryDescription: string;
  units: { id: UnitId; templateId: string; facing: Facing }[];
}

export interface MissionDef {
  id: string;
  name: string;
  roundsTotal: number;
  /** RNG seed — makes the whole game reproducible. */
  seed: number;
  caps: Record<SideId, number>;
  nations: Record<SideId, NationId[]>;
  /** Side with Round-1 Initiative (§2.0). Defaults to 'A' if omitted. */
  firstInitiative?: SideId;
  /** Starting VP per side (§9.2), e.g. Mission 1: Soviets begin with 1 VP. */
  startVp?: Partial<Record<SideId, number>>;
  /** Flat VP per enemy Unit destroyed (§9.1); falls back to template vp if unset. */
  vpPerKill?: number;
  hexes: MapHexDef[];
  units: UnitPlacement[];
  /** Units that begin off-Map and enter later (§4.12). */
  reinforcements?: ReinforcementWaveDef[];
  templates: UnitTemplate[];
  victoryHexes: { hexId: HexId; vp: number }[];
}

/** @deprecated 2nd-ed name; use {@link MissionDef}. */
export type FirefightDef = MissionDef;

// ---------------------------------------------------------------------------
// UI-facing modifier breakdowns (combat.ts, mortar.ts, movement.ts)
// ---------------------------------------------------------------------------

/**
 * One line-item contributing to an AR/DR/AP total — for hover popups and the
 * dice-roller UI, so a player can see not just the number but why it's there
 * and where the rule lives. `value` is signed (already the sign it
 * contributes with); a `value` of 0 is still worth listing when it explains
 * an EXPECTED bonus that didn't apply (e.g. Air Burst zeroing Heavy Woods,
 * §13.9).
 */
export interface Modifier {
  label: string;
  value: number;
  section: string;
  /**
   * True if `value` was determined by a die roll the UI should keep hidden
   * until the Action actually executes (e.g. Barbed Wire's §17.8 1d6 Move
   * Cost) — the engine still needs the real (already-rolled, deterministic-
   * from-the-seeded-RNG) number for correctness, but a preview popup should
   * render it as unknown rather than spoiling the roll, same principle as
   * the dice-roller showing "?" until clicked.
   */
  random?: boolean;
}
