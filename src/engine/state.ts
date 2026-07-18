/**
 * Game state construction and (de)serialization.
 */
import { makeArmoredHitPile, makeFootHitPile } from '../data/hitMarkers';
import { makeRng } from './rng';
import { startRound } from './turn';
import type {
  FirefightDef,
  GameState,
  Hex,
  HitPile,
  PlayerState,
  ReinforcementUnit,
  SetupPoolUnit,
  SideId,
  Unit,
  UnitTemplate,
} from './types';

/** Authored `MapHexDef` -> runtime `Hex` (also reused by the Mission Editor's board preview). */
export function buildHex(def: FirefightDef['hexes'][number]): Hex {
  const walls = new Array(6).fill(false) as boolean[];
  for (const w of def.walls ?? []) walls[w] = true;
  const parts = def.id.split(',');
  return {
    id: def.id,
    coord: { q: Number(parts[0]), r: Number(parts[1]) },
    label: def.label,
    boardNumber: def.boardNumber,
    mapNumber: def.mapNumber,
    edgeCut: def.edgeCut,
    terrain: def.terrain,
    art: def.art,
    elevation: def.elevation ?? 0,
    walls,
    road: def.road ?? false,
    features: {
      obstacle: def.obstacle ? { ...def.obstacle, destroyed: false } : undefined,
      fortification: def.fortification ? { ...def.fortification, destroyed: false } : undefined,
    },
  };
}

function buildPlayer(side: SideId, def: FirefightDef): PlayerState {
  return {
    side,
    nations: def.nations[side],
    capStart: def.caps[side],
    capCurrent: def.caps[side],
    unitLosses: 0,
    vp: def.startVp?.[side] ?? 0, // §9.2 starting VP (e.g. Mission 1: Soviets 1)
    hand: [],
    passed: false,
  };
}

/** Build a fresh game from a firefight definition and begin round 1. */
export function initGame(def: FirefightDef): GameState {
  const hexes: Record<string, Hex> = {};
  for (const h of def.hexes) hexes[h.id] = buildHex(h);

  const units: Record<string, Unit> = {};
  for (const p of def.units) {
    units[p.id] = {
      id: p.id,
      side: p.side,
      nation: def.templates.find((t) => t.id === p.templateId)?.nation ?? p.side,
      templateId: p.templateId,
      hexId: p.hexId,
      facing: p.facing,
      status: 'fresh',
      stressed: false,
      hitMarkers: [],
      assignedWeaponCards: [],
    };
  }

  const templates: Record<string, UnitTemplate> = {};
  for (const t of def.templates) templates[t.id] = t;

  // §4.12: Units that begin off the Map, waiting for their Mission-specified
  // Round/entry Hexes.
  const reinforcements: ReinforcementUnit[] = [];
  for (const wave of def.reinforcements ?? []) {
    for (const u of wave.units) {
      reinforcements.push({
        id: u.id,
        side: wave.side,
        nation: templates[u.templateId]?.nation ?? wave.side,
        templateId: u.templateId,
        facing: u.facing,
        waveId: wave.id,
        earliestRound: wave.earliestRound,
        entryHexIds: wave.entryHexIds,
        entryDescription: wave.entryDescription,
      });
    }
  }

  // Pre-Mission Setup phase (Mission-configurable): a pool of Units each side
  // places onto any empty Hex before Round 1 — empty for every Mission that
  // doesn't use this, in which case setup is skipped entirely (unchanged
  // behavior from before this feature existed).
  const setupPool: SetupPoolUnit[] = (def.setupForces ?? []).map((u) => ({
    id: u.id,
    side: u.side,
    nation: templates[u.templateId]?.nation ?? u.side,
    templateId: u.templateId,
    facing: u.facing,
  }));

  const footPile: HitPile = makeFootHitPile();

  const firstInitiativeSide: SideId = def.firstInitiative ?? 'A';
  const players = { A: buildPlayer('A', def), B: buildPlayer('B', def) };
  // No-tie marker (§9.2): start from the starting-VP difference; if even, the
  // side WITHOUT Round-1 Initiative holds the opening 1-VP advantage.
  const startNet = players.A.vp - players.B.vp;
  const vpMarker = startNet !== 0 ? startNet : firstInitiativeSide === 'A' ? -1 : 1;

  const state: GameState = {
    rng: makeRng(def.seed),
    phase: 'setup',
    round: 1,
    roundsTotal: def.roundsTotal,
    initiativeSide: firstInitiativeSide,
    firstInitiativeSide,
    vpMarker,
    currentSide: firstInitiativeSide,
    consecutivePasses: 0,
    players,
    units,
    templates,
    hexes,
    // Soft Target (foot) and Armored Target (vehicle) draw piles (§7.5, §15.13).
    hitPiles: { foot: footPile, vehicle: makeArmoredHitPile() },
    reinforcements,
    exitZones: def.exitZones ?? [],
    missionId: def.id,
    mapOverlays: def.mapOverlays ?? {},
    mapRotations: def.mapRotations ?? {},
    setupPool,
    // The authored "goes first" side, UNLESS it has nothing to place (then
    // skip straight to whichever side actually has pool Units) — a side with
    // an empty pool has no legal SETUP_PLACE at all, so it can never be left
    // "current" with nothing to do.
    setupSide: (() => {
      const first = def.setupFirstSide ?? 'A';
      if (setupPool.some((u) => u.side === first)) return first;
      const other: SideId = first === 'A' ? 'B' : 'A';
      return setupPool.some((u) => u.side === other) ? other : undefined;
    })(),
    setupInstructions: def.setupInstructions,
    victory: {
      victoryHexes: def.victoryHexes,
      vpPerKill: def.vpPerKill,
      unitKillVp: def.unitKillVp,
      vpPerSurvivor: def.vpPerSurvivor,
    },
    log: [],
  };

  // Set victory-hex control: the Mission-authored starting owner is the
  // default, then the initial sole occupier (§9.1) overrides it if a Unit is
  // actually present — then start round 1.
  for (const vh of state.victory.victoryHexes) {
    if (vh.control) {
      const hex = state.hexes[vh.hexId];
      if (hex) hex.features.control = vh.control;
    }
  }
  for (const vh of state.victory.victoryHexes) {
    const occ = Object.values(state.units).filter((u) => u.hexId === vh.hexId);
    const sides = new Set(occ.map((u) => u.side));
    if (sides.size === 1) {
      const hex = state.hexes[vh.hexId];
      if (hex) hex.features.control = [...sides][0];
    }
  }

  // A Mission with a real setup phase leaves `phase: 'setup'`/`setupSide` in
  // place instead — `reducer.ts`'s `doSetupPlace` calls `startRound` itself
  // once both sides have finished placing their pool.
  if (!state.setupSide) startRound(state);
  return state;
}

/** Serialize to a JSON string (state is plain data; safe to round-trip). */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}
