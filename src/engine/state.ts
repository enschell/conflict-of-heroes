/**
 * Game state construction and (de)serialization.
 */
import { makeFootHitPile } from '../data/hitMarkers';
import { makeRng } from './rng';
import { startRound } from './turn';
import type {
  FirefightDef,
  GameState,
  Hex,
  HitPile,
  PlayerState,
  SideId,
  Unit,
  UnitTemplate,
} from './types';

function buildHex(def: FirefightDef['hexes'][number]): Hex {
  const walls = new Array(6).fill(false) as boolean[];
  for (const w of def.walls ?? []) walls[w] = true;
  const parts = def.id.split(',');
  return {
    id: def.id,
    coord: { q: Number(parts[0]), r: Number(parts[1]) },
    label: def.label,
    terrain: def.terrain,
    elevation: def.elevation ?? 0,
    walls,
    road: def.road ?? false,
    features: {},
  };
}

function buildPlayer(side: SideId, def: FirefightDef): PlayerState {
  return {
    side,
    nations: def.nations[side],
    capStart: def.caps[side],
    capCurrent: def.caps[side],
    unitLosses: 0,
    vp: 0,
    hand: [],
    activatedUnitId: null,
    ap: 0,
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

  const footPile: HitPile = makeFootHitPile();

  const state: GameState = {
    rng: makeRng(def.seed),
    phase: 'setup',
    round: 1,
    roundsTotal: def.roundsTotal,
    initiativeSide: 'A',
    currentSide: 'A',
    consecutivePasses: 0,
    players: { A: buildPlayer('A', def), B: buildPlayer('B', def) },
    units,
    templates,
    hexes,
    // Vehicle markers are a later module; reuse the foot pile shape for now.
    hitPiles: { foot: footPile, vehicle: makeFootHitPile() },
    firefightId: def.id,
    victory: { victoryHexes: def.victoryHexes },
    log: [],
  };

  // Set victory-hex control to the initial sole occupier, then start round 1.
  for (const vh of state.victory.victoryHexes) {
    const occ = Object.values(state.units).filter((u) => u.hexId === vh.hexId);
    const sides = new Set(occ.map((u) => u.side));
    if (sides.size === 1) {
      const hex = state.hexes[vh.hexId];
      if (hex) hex.features.control = [...sides][0];
    }
  }

  startRound(state);
  return state;
}

/** Serialize to a JSON string (state is plain data; safe to round-trip). */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}
