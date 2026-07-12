/**
 * Mission Editor authoring state — separate from `state/store.ts` (the live
 * `GameState`-driven store) on purpose: this is authoring data, not a game in
 * progress, and mixing the two would bloat/risk the already-large game store
 * for no benefit. Mirrors the approved design's own flat state tree
 * (`docs/design_handoff_mission_editor/Mission Editor.dc.html`'s `state`/
 * setter shape) re-implemented against the real engine types instead of the
 * prototype's placeholder ones.
 */
import { create } from 'zustand';
import { mapById } from '../data/maps/catalog';
import { assembleBoards, rotationClusters as engineRotationClusters } from '../engine';
import type { BoardAssemblyEntry, BoardEdge, Rotation, RotationCluster } from '../engine';
import type { Facing, HexId, MapHexDef, NationId, SideId } from '../engine/types';

export type EditorSection = 'info' | 'map' | 'forces' | 'reinforcements' | 'victory' | 'advanced';

// ---------------------------------------------------------------------------
// Mission Info
// ---------------------------------------------------------------------------

export interface EditorInfoSide {
  nations: NationId[];
  orders: string;
  instructions: string;
  caps: number;
  vp: number;
}

export interface EditorInfo {
  title: string;
  situation: string;
  sideA: EditorInfoSide;
  sideB: EditorInfoSide;
  roundsTotal: number;
  initiative: SideId;
}

function defaultInfoSide(nation: NationId, vp: number): EditorInfoSide {
  return { nations: [nation], orders: '', instructions: '', caps: 6, vp };
}

function defaultInfo(): EditorInfo {
  return {
    title: 'New Mission',
    situation: '',
    sideA: defaultInfoSide('germans', 0),
    sideB: defaultInfoSide('soviets', 0),
    roundsTotal: 5,
    initiative: 'A',
  };
}

// ---------------------------------------------------------------------------
// Map (obstacles/fortifications painted onto a picked catalog map)
// ---------------------------------------------------------------------------

export type MapTool = 'wire' | 'mines' | 'roadblock' | 'trench' | 'bunker' | 'clear';

export interface EditorObstacle {
  kind: 'barbedWire' | 'mines' | 'roadBlock';
  side: SideId;
  /** Mines only (§17.10) — the fixed Hit Number rolled against. Required: an
   *  unset Hit Number defaults to 0 at the engine layer, an always-hits mine. */
  hitNumber?: number;
}
export interface EditorFortification {
  kind: 'trench' | 'bunker';
  facing: Facing | null;
}

/** One placed board in the Mission's assembly (§C multi-board). The first board is the anchor (no `attachTo`). */
export interface EditorBoard {
  id: string;
  mapId: string;
  rotation: Rotation;
  attachTo?: { boardId: string; localEdge: BoardEdge; neighborLocalEdge: BoardEdge };
}

export interface EditorMapState {
  boards: EditorBoard[];
  tool: MapTool;
  toolSide: SideId;
  bunkerFacing: Facing;
  minesHitNumber: number;
  obstacles: Record<HexId, EditorObstacle>;
  fortifications: Record<HexId, EditorFortification>;
}

const TOOL_TO_OBSTACLE: Partial<Record<MapTool, EditorObstacle['kind']>> = {
  wire: 'barbedWire',
  mines: 'mines',
  roadblock: 'roadBlock',
};
const TOOL_TO_FORT: Partial<Record<MapTool, EditorFortification['kind']>> = {
  trench: 'trench',
  bunker: 'bunker',
};

function defaultMap(): EditorMapState {
  return {
    boards: [{ id: 'board-1', mapId: 'mission1', rotation: 0 }],
    tool: 'wire',
    toolSide: 'A',
    bunkerFacing: 0,
    minesHitNumber: 8,
    obstacles: {},
    fortifications: {},
  };
}

/**
 * The Mission's merged hexes (§C: independently-rotated boards assembled into
 * one shared space) with obstacle/fortification overlays painted on top —
 * the single source of truth every other section reads. Pure/derived, not
 * stored in Zustand state itself, since it's fully computable from `boards` +
 * `obstacles` + `fortifications`. Returns `{ hexes: [], error }` (instead of
 * throwing) if the current board configuration is invalid — e.g. a board
 * mid-edit with no `attachTo` chosen yet, or a rejected cross-family/edge-
 * length attachment — so the UI can show a clear message instead of crashing
 * while the author is still configuring it.
 */
function assemblyEntriesFor(map: EditorMapState): BoardAssemblyEntry[] {
  return map.boards.map((b) => ({
    id: b.id,
    hexes: mapById(b.mapId)?.hexes ?? [],
    rotation: b.rotation,
    attachTo: b.attachTo,
  }));
}

export function assembledMap(map: EditorMapState): { hexes: MapHexDef[]; error: string | null } {
  try {
    const merged = assembleBoards(assemblyEntriesFor(map));
    const hexes = merged.map((h) => {
      const obstacle = map.obstacles[h.id];
      const fortification = map.fortifications[h.id];
      return {
        ...h,
        obstacle: obstacle
          ? { kind: obstacle.kind, ownerSide: obstacle.side, hitNumber: obstacle.hitNumber }
          : undefined,
        fortification: fortification
          ? { kind: fortification.kind, facing: fortification.facing ?? undefined }
          : undefined,
      };
    });
    return { hexes, error: null };
  } catch (e) {
    return { hexes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** The {90°,-90°} rotation cluster (if any) for rendering — see `EditorBoard`'s `rotationClusters` prop. */
export function assembledRotationClusters(map: EditorMapState): RotationCluster[] {
  try {
    return engineRotationClusters(assemblyEntriesFor(map));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Starting Forces
// ---------------------------------------------------------------------------

export interface PlacedUnit {
  id: string;
  side: SideId;
  templateId: string;
  hexId: HexId;
  facing: Facing;
}

export interface EditorForcesState {
  placed: PlacedUnit[];
  search: string;
  nationFilter: string; // 'all' | NationId
  armedTemplateId: string | null;
  armedSide: SideId;
  armedFacing: Facing;
}

function defaultForces(): EditorForcesState {
  return { placed: [], search: '', nationFilter: 'all', armedTemplateId: null, armedSide: 'A', armedFacing: 0 };
}

// ---------------------------------------------------------------------------
// Reinforcements
// ---------------------------------------------------------------------------

export interface WaveUnit {
  id: string;
  templateId: string;
  facing: Facing;
}
export interface EditorWave {
  id: string;
  name: string;
  earliestRound: number;
  description: string;
  entryHexIds: HexId[];
  units: WaveUnit[];
}
export interface EditorReinforcementsState {
  activeSide: SideId;
  waves: Record<SideId, EditorWave[]>;
  expandedWaveId: string | null;
  search: string;
  nationFilter: string;
  draftFacing: Facing;
}

function defaultReinforcements(): EditorReinforcementsState {
  return {
    activeSide: 'A',
    waves: { A: [], B: [] },
    expandedWaveId: null,
    search: '',
    nationFilter: 'all',
    draftFacing: 0,
  };
}

// ---------------------------------------------------------------------------
// Victory Conditions
// ---------------------------------------------------------------------------

export interface VictoryOverride {
  round: number;
  vp: number;
}
export interface EditorVictoryHex {
  id: string;
  hexLabel: string;
  vp: number;
  control: 'neutral' | SideId;
  overrides?: VictoryOverride[];
  /** Every Round it's held (default), or once, only at the Mission's final Round-end. Never both. */
  awardTiming: 'endOfRound' | 'endOfMission';
}
/** VP for destroying one SPECIFIC placed/reinforcement Unit, overriding the general per-kill value for it. */
export interface EditorUnitKillVp {
  unitId: string;
  vp: number;
}
export interface EditorExitZone {
  id: string;
  side: SideId;
  hexIds: HexId[];
  vpPerUnit: number;
  description: string;
}
export interface EditorVictoryState {
  hexes: EditorVictoryHex[];
  vpPerKillA: number;
  vpPerKillB: number;
  vpPerSurvivorA: number;
  vpPerSurvivorB: number;
  unitKillVp: EditorUnitKillVp[];
  exitZones: EditorExitZone[];
  activeExitSide: SideId;
  draftHex: string;
  draftVp: number;
  draftControl: 'neutral' | SideId;
}

function defaultVictory(): EditorVictoryState {
  return {
    hexes: [],
    vpPerKillA: 0,
    vpPerKillB: 0,
    vpPerSurvivorA: 0,
    vpPerSurvivorB: 0,
    unitKillVp: [],
    exitZones: [],
    activeExitSide: 'A',
    draftHex: '',
    draftVp: 1,
    draftControl: 'neutral',
  };
}

// ---------------------------------------------------------------------------
// Advanced / Future — inert (see engine `MissionAdvancedNotes`)
// ---------------------------------------------------------------------------

export interface EditorAdvancedState {
  battleCards: Record<SideId, { round1: number; eachRoundAfter: number }>;
  hiddenIds: string[];
  obaAllowedRounds: number[];
  obaStrikes: { id: string; plannedRound: number }[];
  airSupport: Record<SideId, number | ''>;
  /** Terrain overlays (mock options) — the real Map Table (which maps, rotation,
   *  abutment) is now a REAL feature of the Map section itself (§C), not inert. */
  overlays: string[];
}

function defaultAdvanced(): EditorAdvancedState {
  return {
    battleCards: { A: { round1: 0, eachRoundAfter: 0 }, B: { round1: 0, eachRoundAfter: 0 } },
    hiddenIds: [],
    obaAllowedRounds: [],
    obaStrikes: [],
    airSupport: { A: '', B: '' },
    overlays: [],
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let seq = 0;
function genId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

/** `side-templateId-n`, matching the existing hand-authored id convention (e.g. 'G-rifle-1'). */
function nextUnitId(existing: Iterable<string>, side: SideId, templateId: string): string {
  const base = `${side}-${templateId}`;
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export interface EditorStore {
  section: EditorSection;
  setSection: (s: EditorSection) => void;

  info: EditorInfo;
  setInfo: (patch: Partial<EditorInfo>) => void;
  setInfoSide: (side: SideId, patch: Partial<EditorInfoSide>) => void;
  addNation: (side: SideId, nation: NationId) => void;
  removeNation: (side: SideId, nation: NationId) => void;

  map: EditorMapState;
  addBoard: (mapId: string) => void;
  removeBoard: (id: string) => void;
  updateBoard: (id: string, patch: Partial<Omit<EditorBoard, 'id'>>) => void;
  setMapTool: (patch: Partial<Pick<EditorMapState, 'tool' | 'toolSide' | 'bunkerFacing' | 'minesHitNumber'>>) => void;
  paintMapHex: (hexId: HexId) => void;
  removeObstacle: (hexId: HexId) => void;
  removeFortification: (hexId: HexId) => void;

  forces: EditorForcesState;
  setForces: (patch: Partial<EditorForcesState>) => void;
  armTemplate: (templateId: string | null) => void;
  placeAtHex: (hexId: HexId) => void;
  removePlaced: (id: string) => void;
  updatePlacedFacing: (id: string, facing: Facing) => void;

  reinforcements: EditorReinforcementsState;
  setReinf: (patch: Partial<EditorReinforcementsState>) => void;
  addWave: (side: SideId) => void;
  removeWave: (side: SideId, id: string) => void;
  toggleExpandWave: (id: string) => void;
  updateWave: (side: SideId, id: string, patch: Partial<Omit<EditorWave, 'id' | 'units'>>) => void;
  toggleWaveHex: (side: SideId, waveId: string, hexId: HexId) => void;
  addUnitToWave: (side: SideId, waveId: string, templateId: string, facing: Facing) => void;
  removeUnitFromWave: (side: SideId, waveId: string, unitId: string) => void;

  victory: EditorVictoryState;
  setVictory: (patch: Partial<EditorVictoryState>) => void;
  addVictoryHex: () => void;
  removeVictoryHex: (id: string) => void;
  updateVictoryHex: (id: string, patch: Partial<EditorVictoryHex>) => void;
  toggleVictoryVaries: (id: string) => void;
  addVictoryOverride: (id: string) => void;
  updateVictoryOverride: (id: string, idx: number, patch: Partial<VictoryOverride>) => void;
  removeVictoryOverride: (id: string, idx: number) => void;
  setUnitKillVp: (unitId: string, vp: number) => void;
  removeUnitKillVp: (unitId: string) => void;
  addExitZone: (side: SideId) => void;
  removeExitZone: (id: string) => void;
  updateExitZone: (id: string, patch: Partial<Omit<EditorExitZone, 'id' | 'hexIds'>>) => void;
  toggleExitZoneHex: (id: string, hexId: HexId) => void;

  advanced: EditorAdvancedState;
  setAdvanced: (patch: Partial<EditorAdvancedState>) => void;
  setBattleCards: (side: SideId, patch: Partial<EditorAdvancedState['battleCards'][SideId]>) => void;
  toggleHidden: (unitId: string) => void;
  toggleObaRound: (round: number) => void;
  addObaStrike: () => void;
  updateObaStrike: (id: string, plannedRound: number) => void;
  removeObaStrike: (id: string) => void;
  setAirSupport: (side: SideId, round: number | '') => void;
  toggleOverlay: (name: string) => void;

  resetEditor: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  section: 'info',
  setSection: (s) => set({ section: s }),

  info: defaultInfo(),
  setInfo: (patch) => set((st) => ({ info: { ...st.info, ...patch } })),
  setInfoSide: (side, patch) =>
    set((st) => ({
      info: { ...st.info, [side === 'A' ? 'sideA' : 'sideB']: { ...st.info[side === 'A' ? 'sideA' : 'sideB'], ...patch } },
    })),
  addNation: (side, nation) => {
    if (!nation) return;
    const key = side === 'A' ? 'sideA' : 'sideB';
    set((st) => {
      const cur = st.info[key].nations;
      if (cur.includes(nation)) return st;
      return { info: { ...st.info, [key]: { ...st.info[key], nations: [...cur, nation] } } };
    });
  },
  removeNation: (side, nation) => {
    const key = side === 'A' ? 'sideA' : 'sideB';
    set((st) => ({
      info: { ...st.info, [key]: { ...st.info[key], nations: st.info[key].nations.filter((n) => n !== nation) } },
    }));
  },

  map: defaultMap(),
  addBoard: (mapId) =>
    set((st) => {
      if (!mapById(mapId)) return st;
      const id = genId('board-');
      const board: EditorBoard = st.map.boards.length === 0 ? { id, mapId, rotation: 0 } : { id, mapId, rotation: 0 };
      return { map: { ...st.map, boards: [...st.map.boards, board] } };
    }),
  removeBoard: (id) =>
    set((st) => ({
      map: {
        ...st.map,
        boards: st.map.boards
          .filter((b) => b.id !== id)
          // Clear any attachTo pointing at the removed board — surfaces as a
          // clear "needs attachTo" error via `assembledMap` rather than
          // silently leaving a dangling reference.
          .map((b) => (b.attachTo?.boardId === id ? { ...b, attachTo: undefined } : b)),
      },
    })),
  updateBoard: (id, patch) =>
    set((st) => ({
      map: { ...st.map, boards: st.map.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
    })),
  setMapTool: (patch) => set((st) => ({ map: { ...st.map, ...patch } })),
  paintMapHex: (hexId) =>
    set((st) => {
      const { tool, toolSide, bunkerFacing, minesHitNumber } = st.map;
      const obstacles = { ...st.map.obstacles };
      const fortifications = { ...st.map.fortifications };
      if (tool === 'clear') {
        delete obstacles[hexId];
        delete fortifications[hexId];
      } else if (tool === 'wire' || tool === 'mines' || tool === 'roadblock') {
        delete fortifications[hexId];
        obstacles[hexId] = {
          kind: TOOL_TO_OBSTACLE[tool]!,
          side: toolSide,
          ...(tool === 'mines' ? { hitNumber: minesHitNumber } : {}),
        };
      } else if (tool === 'trench' || tool === 'bunker') {
        delete obstacles[hexId];
        fortifications[hexId] = { kind: TOOL_TO_FORT[tool]!, facing: tool === 'bunker' ? bunkerFacing : null };
      }
      return { map: { ...st.map, obstacles, fortifications } };
    }),
  removeObstacle: (hexId) =>
    set((st) => {
      const obstacles = { ...st.map.obstacles };
      delete obstacles[hexId];
      return { map: { ...st.map, obstacles } };
    }),
  removeFortification: (hexId) =>
    set((st) => {
      const fortifications = { ...st.map.fortifications };
      delete fortifications[hexId];
      return { map: { ...st.map, fortifications } };
    }),

  forces: defaultForces(),
  setForces: (patch) => set((st) => ({ forces: { ...st.forces, ...patch } })),
  armTemplate: (templateId) => set((st) => ({ forces: { ...st.forces, armedTemplateId: templateId } })),
  placeAtHex: (hexId) =>
    set((st) => {
      const { armedTemplateId, armedSide, armedFacing } = st.forces;
      if (!armedTemplateId) return st;
      const existingIds = st.forces.placed.map((p) => p.id);
      const id = nextUnitId(existingIds, armedSide, armedTemplateId);
      const entry: PlacedUnit = { id, side: armedSide, templateId: armedTemplateId, hexId, facing: armedFacing };
      return { forces: { ...st.forces, placed: [...st.forces.placed, entry] } };
    }),
  removePlaced: (id) => set((st) => ({ forces: { ...st.forces, placed: st.forces.placed.filter((p) => p.id !== id) } })),
  updatePlacedFacing: (id, facing) =>
    set((st) => ({
      forces: { ...st.forces, placed: st.forces.placed.map((p) => (p.id === id ? { ...p, facing } : p)) },
    })),

  reinforcements: defaultReinforcements(),
  setReinf: (patch) => set((st) => ({ reinforcements: { ...st.reinforcements, ...patch } })),
  addWave: (side) =>
    set((st) => {
      const n = st.reinforcements.waves[side].length + 1;
      const wave: EditorWave = {
        id: genId('wave-'),
        name: `Wave ${n}`,
        earliestRound: 2,
        description: '',
        entryHexIds: [],
        units: [],
      };
      return {
        reinforcements: {
          ...st.reinforcements,
          activeSide: side,
          waves: { ...st.reinforcements.waves, [side]: [...st.reinforcements.waves[side], wave] },
          expandedWaveId: wave.id,
        },
      };
    }),
  removeWave: (side, id) =>
    set((st) => ({
      reinforcements: {
        ...st.reinforcements,
        waves: { ...st.reinforcements.waves, [side]: st.reinforcements.waves[side].filter((w) => w.id !== id) },
        expandedWaveId: st.reinforcements.expandedWaveId === id ? null : st.reinforcements.expandedWaveId,
      },
    })),
  toggleExpandWave: (id) =>
    set((st) => ({
      reinforcements: { ...st.reinforcements, expandedWaveId: st.reinforcements.expandedWaveId === id ? null : id },
    })),
  updateWave: (side, id, patch) =>
    set((st) => ({
      reinforcements: {
        ...st.reinforcements,
        waves: {
          ...st.reinforcements.waves,
          [side]: st.reinforcements.waves[side].map((w) => (w.id === id ? { ...w, ...patch } : w)),
        },
      },
    })),
  toggleWaveHex: (side, waveId, hexId) =>
    set((st) => ({
      reinforcements: {
        ...st.reinforcements,
        waves: {
          ...st.reinforcements.waves,
          [side]: st.reinforcements.waves[side].map((w) => {
            if (w.id !== waveId) return w;
            const has = w.entryHexIds.includes(hexId);
            return { ...w, entryHexIds: has ? w.entryHexIds.filter((h) => h !== hexId) : [...w.entryHexIds, hexId] };
          }),
        },
      },
    })),
  addUnitToWave: (side, waveId, templateId, facing) =>
    set((st) => {
      const wave = st.reinforcements.waves[side].find((w) => w.id === waveId);
      if (!wave) return st;
      const existingIds = [
        ...st.forces.placed.map((p) => p.id),
        ...Object.values(st.reinforcements.waves).flatMap((ws) => ws.flatMap((w) => w.units.map((u) => u.id))),
      ];
      const id = nextUnitId(existingIds, side, templateId);
      return {
        reinforcements: {
          ...st.reinforcements,
          waves: {
            ...st.reinforcements.waves,
            [side]: st.reinforcements.waves[side].map((w) =>
              w.id === waveId ? { ...w, units: [...w.units, { id, templateId, facing }] } : w,
            ),
          },
        },
      };
    }),
  removeUnitFromWave: (side, waveId, unitId) =>
    set((st) => ({
      reinforcements: {
        ...st.reinforcements,
        waves: {
          ...st.reinforcements.waves,
          [side]: st.reinforcements.waves[side].map((w) =>
            w.id === waveId ? { ...w, units: w.units.filter((u) => u.id !== unitId) } : w,
          ),
        },
      },
    })),

  victory: defaultVictory(),
  setVictory: (patch) => set((st) => ({ victory: { ...st.victory, ...patch } })),
  addVictoryHex: () =>
    set((st) => {
      const hexLabel = st.victory.draftHex.trim().toUpperCase();
      if (!hexLabel) return st;
      const entry: EditorVictoryHex = {
        id: genId('vhex-'),
        hexLabel,
        vp: st.victory.draftVp || 0,
        control: st.victory.draftControl,
        awardTiming: 'endOfRound',
      };
      return {
        victory: {
          ...st.victory,
          hexes: [...st.victory.hexes, entry],
          draftHex: '',
          draftVp: 1,
          draftControl: 'neutral',
        },
      };
    }),
  removeVictoryHex: (id) => set((st) => ({ victory: { ...st.victory, hexes: st.victory.hexes.filter((v) => v.id !== id) } })),
  updateVictoryHex: (id, patch) =>
    set((st) => ({
      victory: { ...st.victory, hexes: st.victory.hexes.map((v) => (v.id === id ? { ...v, ...patch } : v)) },
    })),
  toggleVictoryVaries: (id) =>
    set((st) => ({
      victory: {
        ...st.victory,
        hexes: st.victory.hexes.map((v) => (v.id === id ? { ...v, overrides: v.overrides ? undefined : [] } : v)),
      },
    })),
  addVictoryOverride: (id) =>
    set((st) => ({
      victory: {
        ...st.victory,
        hexes: st.victory.hexes.map((v) =>
          v.id === id ? { ...v, overrides: [...(v.overrides ?? []), { round: 2, vp: v.vp }] } : v,
        ),
      },
    })),
  updateVictoryOverride: (id, idx, patch) =>
    set((st) => ({
      victory: {
        ...st.victory,
        hexes: st.victory.hexes.map((v) =>
          v.id === id ? { ...v, overrides: v.overrides?.map((o, i) => (i === idx ? { ...o, ...patch } : o)) } : v,
        ),
      },
    })),
  removeVictoryOverride: (id, idx) =>
    set((st) => ({
      victory: {
        ...st.victory,
        hexes: st.victory.hexes.map((v) =>
          v.id === id ? { ...v, overrides: v.overrides?.filter((_, i) => i !== idx) } : v,
        ),
      },
    })),
  setUnitKillVp: (unitId, vp) =>
    set((st) => {
      const existing = st.victory.unitKillVp.some((u) => u.unitId === unitId);
      const unitKillVp = existing
        ? st.victory.unitKillVp.map((u) => (u.unitId === unitId ? { ...u, vp } : u))
        : [...st.victory.unitKillVp, { unitId, vp }];
      return { victory: { ...st.victory, unitKillVp } };
    }),
  removeUnitKillVp: (unitId) =>
    set((st) => ({ victory: { ...st.victory, unitKillVp: st.victory.unitKillVp.filter((u) => u.unitId !== unitId) } })),
  addExitZone: (side) =>
    set((st) => ({
      victory: {
        ...st.victory,
        activeExitSide: side,
        exitZones: [
          ...st.victory.exitZones,
          { id: genId('exit-'), side, hexIds: [], vpPerUnit: 1, description: '' },
        ],
      },
    })),
  removeExitZone: (id) =>
    set((st) => ({ victory: { ...st.victory, exitZones: st.victory.exitZones.filter((z) => z.id !== id) } })),
  updateExitZone: (id, patch) =>
    set((st) => ({
      victory: { ...st.victory, exitZones: st.victory.exitZones.map((z) => (z.id === id ? { ...z, ...patch } : z)) },
    })),
  toggleExitZoneHex: (id, hexId) =>
    set((st) => ({
      victory: {
        ...st.victory,
        exitZones: st.victory.exitZones.map((z) => {
          if (z.id !== id) return z;
          const has = z.hexIds.includes(hexId);
          return { ...z, hexIds: has ? z.hexIds.filter((h) => h !== hexId) : [...z.hexIds, hexId] };
        }),
      },
    })),

  advanced: defaultAdvanced(),
  setAdvanced: (patch) => set((st) => ({ advanced: { ...st.advanced, ...patch } })),
  setBattleCards: (side, patch) =>
    set((st) => ({
      advanced: { ...st.advanced, battleCards: { ...st.advanced.battleCards, [side]: { ...st.advanced.battleCards[side], ...patch } } },
    })),
  toggleHidden: (unitId) =>
    set((st) => ({
      advanced: {
        ...st.advanced,
        hiddenIds: st.advanced.hiddenIds.includes(unitId)
          ? st.advanced.hiddenIds.filter((k) => k !== unitId)
          : [...st.advanced.hiddenIds, unitId],
      },
    })),
  toggleObaRound: (round) =>
    set((st) => ({
      advanced: {
        ...st.advanced,
        obaAllowedRounds: st.advanced.obaAllowedRounds.includes(round)
          ? st.advanced.obaAllowedRounds.filter((r) => r !== round)
          : [...st.advanced.obaAllowedRounds, round],
      },
    })),
  addObaStrike: () =>
    set((st) => ({
      advanced: { ...st.advanced, obaStrikes: [...st.advanced.obaStrikes, { id: genId('oba-'), plannedRound: 2 }] },
    })),
  updateObaStrike: (id, plannedRound) =>
    set((st) => ({
      advanced: {
        ...st.advanced,
        obaStrikes: st.advanced.obaStrikes.map((o) => (o.id === id ? { ...o, plannedRound } : o)),
      },
    })),
  removeObaStrike: (id) =>
    set((st) => ({ advanced: { ...st.advanced, obaStrikes: st.advanced.obaStrikes.filter((o) => o.id !== id) } })),
  setAirSupport: (side, round) =>
    set((st) => ({ advanced: { ...st.advanced, airSupport: { ...st.advanced.airSupport, [side]: round } } })),
  toggleOverlay: (name) =>
    set((st) => ({
      advanced: {
        ...st.advanced,
        overlays: st.advanced.overlays.includes(name)
          ? st.advanced.overlays.filter((n) => n !== name)
          : [...st.advanced.overlays, name],
      },
    })),

  resetEditor: () =>
    set({
      section: 'info',
      info: defaultInfo(),
      map: defaultMap(),
      forces: defaultForces(),
      reinforcements: defaultReinforcements(),
      victory: defaultVictory(),
      advanced: defaultAdvanced(),
    }),
}));

/** Just the authored data slices (no action functions) — what the TS-source emitter reads. */
export type EditorAuthoredState = Pick<
  EditorStore,
  'info' | 'map' | 'forces' | 'reinforcements' | 'victory' | 'advanced'
>;
