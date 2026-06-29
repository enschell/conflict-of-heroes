/** Test helpers for building small, controlled game states. */
import { makeFootHitPile } from '../../data/hitMarkers';
import { makeRng } from '../rng';
import type {
  Facing,
  GameState,
  HitType,
  PlayerState,
  SideId,
  TerrainId,
  Unit,
  UnitTemplate,
} from '../types';

function player(side: SideId): PlayerState {
  return {
    side,
    nations: [side === 'A' ? 'germans' : 'soviets'],
    capStart: 5,
    capCurrent: 5,
    unitLosses: 0,
    vp: 0,
    hand: [],
    activatedUnitId: null,
    ap: 0,
    passed: false,
  };
}

export function baseState(seed = 1): GameState {
  return {
    rng: makeRng(seed),
    phase: 'playing',
    round: 1,
    roundsTotal: 5,
    initiativeSide: 'A',
    currentSide: 'A',
    consecutivePasses: 0,
    players: { A: player('A'), B: player('B') },
    units: {},
    templates: {},
    hexes: {},
    hitPiles: { foot: makeFootHitPile(), vehicle: makeFootHitPile() },
    firefightId: 'test',
    victory: { victoryHexes: [] },
    log: [],
  };
}

export function addHex(
  s: GameState,
  q: number,
  r: number,
  terrain: TerrainId = 'open',
  opts: { walls?: number[]; road?: boolean; elevation?: number } = {},
): string {
  const id = `${q},${r}`;
  const walls: boolean[] = new Array(6).fill(false);
  for (const w of opts.walls ?? []) walls[w] = true;
  s.hexes[id] = {
    id,
    coord: { q, r },
    terrain,
    elevation: opts.elevation ?? 0,
    walls,
    road: opts.road ?? false,
    features: {},
  };
  return id;
}

export function rifleTemplate(over: Partial<UnitTemplate> = {}): UnitTemplate {
  return {
    id: 'rifle',
    nation: 'germans',
    name: 'Rifle',
    kind: 'infantry',
    fp: { red: 3, blue: 0 },
    dr: { front: 12, flank: 11, color: 'red' },
    move: 1,
    range: 4,
    apToFire: 4,
    vp: 1,
    unburdened: true,
    ...over,
  };
}

export function addTemplate(s: GameState, t: UnitTemplate): string {
  s.templates[t.id] = t;
  return t.id;
}

export function addUnit(
  s: GameState,
  id: string,
  side: SideId,
  q: number,
  r: number,
  facing: Facing,
  templateId = 'rifle',
  hitMarkers: HitType[] = [],
): Unit {
  const u: Unit = {
    id,
    side,
    nation: 'germans',
    templateId,
    hexId: `${q},${r}`,
    facing,
    status: 'fresh',
    stressed: false,
    hitMarkers,
    assignedWeaponCards: [],
  };
  s.units[id] = u;
  return u;
}
