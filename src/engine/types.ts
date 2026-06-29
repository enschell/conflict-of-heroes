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
}

/** A unit instance on the map. */
export interface Unit {
  id: UnitId;
  side: SideId;
  nation: NationId;
  templateId: string;
  hexId: HexId;
  facing: Facing;
  // v3 cutover note (§A): 'active' is legacy 2nd-ed (7AP activation) and is
  // removed in the step-3 reducer rewrite, when the action economy becomes
  // act → Spent Check → Stress. The Fresh/Spent pair is the v3 model (§2.2).
  status: 'fresh' | 'active' | 'spent';
  /**
   * v3 Stress (§2.6): true once this Unit took an Action; adds +1AP to its next
   * Action Cost if it acts again on this side's very next Turn. Not cumulative;
   * cleared by Passing (§2.7). The step-3 turn loop reads/sets this.
   */
  stressed: boolean;
  /** At most one hit marker (a second hit destroys the unit). */
  hitMarkers: HitType[];
  assignedWeaponCards: CardId[];
}

// ---------------------------------------------------------------------------
// Hit markers
// ---------------------------------------------------------------------------

export type HitType =
  | 'stunned'
  | 'unnerved'
  | 'kia'
  | 'pinned'
  | 'panicked'
  | 'suppressed'
  | 'cowering'
  | 'berserk';

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
  /** The single unit this side currently has activated (null if none). */
  activatedUnitId: UnitId | null;
  /** Action points remaining on the activated unit. */
  ap: number;
  /** True once this side has passed in the current pass cycle. */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Victory
// ---------------------------------------------------------------------------

export interface VictoryConfig {
  /** Victory hexes and the VP each is worth to whoever controls it at game end. */
  victoryHexes: { hexId: HexId; vp: number }[];
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

export type Action =
  | { type: 'ACTIVATE_UNIT'; unitId: UnitId }
  | { type: 'MOVE'; unitId: UnitId; toHexId: HexId; capSpend?: number }
  | { type: 'PIVOT'; unitId: UnitId; facing: Facing; useCap?: boolean }
  | { type: 'FIRE'; attackerId: UnitId; targetId: UnitId; capMod?: number; capSpend?: number }
  | { type: 'CLOSE_COMBAT'; attackerId: UnitId; targetId: UnitId; capMod?: number; capSpend?: number }
  | { type: 'RALLY'; unitId: UnitId; capMod?: number; capSpend?: number }
  | { type: 'MARK_SPENT'; unitId: UnitId }
  | { type: 'STALL'; useCap?: boolean }
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
  firefightId: string;
  victory: VictoryConfig;
  log: GameEvent[];
  /** Winner once phase === 'gameOver' ('A' | 'B' | null for a tie). */
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

export interface FirefightDef {
  id: string;
  name: string;
  roundsTotal: number;
  /** RNG seed — makes the whole game reproducible. */
  seed: number;
  caps: Record<SideId, number>;
  nations: Record<SideId, NationId[]>;
  hexes: MapHexDef[];
  units: UnitPlacement[];
  templates: UnitTemplate[];
  victoryHexes: { hexId: HexId; vp: number }[];
}
