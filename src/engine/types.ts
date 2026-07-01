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
// Hexes (runtime board state)
// ---------------------------------------------------------------------------

export interface Hex {
  id: HexId;
  coord: Axial;
  /** Optional display label, e.g. "J10". */
  label?: string;
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
  | { type: 'MOVE'; unitId: UnitId; toHexId: HexId; path?: HexId[]; capCostReduce?: number }
  | { type: 'PIVOT'; unitId: UnitId; facing: Facing; capCostReduce?: number }
  | {
      type: 'FIRE';
      attackerId: UnitId;
      targetId: UnitId;
      capDiceMod?: number;
      capCostReduce?: number;
    }
  | {
      type: 'CLOSE_COMBAT';
      attackerId: UnitId;
      targetId: UnitId;
      capDiceMod?: number;
      capCostReduce?: number;
    }
  | { type: 'RALLY'; unitId: UnitId; capDiceMod?: number; capCostReduce?: number }
  | { type: 'STALL'; unitId: UnitId; capCostReduce?: number }
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
