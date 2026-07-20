/**
 * The reverse of `emitMissionSource.ts`: turns an EXISTING `MissionDef` (any
 * Mission already in the game — hand-authored or Editor-exported) back into
 * Mission Editor authoring state, so "Load Existing Mission" can resume
 * editing it.
 *
 * The one genuinely lossy direction is the Map section: `MissionDef.hexes`
 * is already a flat, fully-ASSEMBLED `MapHexDef[]` (merged/rotated boards
 * baked together) — which catalog map(s) and how they were attached is not
 * preserved in the exported Mission (the export inlines the merged result,
 * not the board-list that produced it). So a loaded Mission's map always
 * comes back as ONE single anchor board — obstacles/fortifications and
 * everything else round-trip exactly, but a multi-board Mission loses its
 * board-list structure (still fully playable/editable, just not
 * re-splittable back into its original board picks). This is registered as a
 * synthetic, session-local entry in `MAP_CATALOG` (id `__loaded_<missionId>`)
 * so the existing `mapId`-reference model (`EditorBoard.mapId`) needs no
 * special case anywhere else in the Map/Starting Forces/Reinforcements/
 * Victory sections — they just see one more catalog map, like any other.
 *
 * Rotation IS preserved, via `MissionDef.mapRotations` (see that field's own
 * comment in `engine/types.ts`) — 0°/180° were already recoverable for free
 * (real axial transforms baked into `hexes`), and 90°/-90° would otherwise
 * silently reset to 0° on every reload since it's a display-only pixel spin
 * with no trace in the merged coordinates. Same "first board wins" caveat as
 * `overlayImage` below for a genuinely multi-board Mission.
 */
import { MAP_CATALOG } from '../maps/catalog';
import type {
  EditorAdvancedState,
  EditorBoard,
  EditorCardsState,
  EditorForcesState,
  EditorFortification,
  EditorInfo,
  EditorInfoSide,
  EditorMapState,
  EditorObstacle,
  EditorReinforcementsState,
  EditorVictoryState,
  EditorWave,
} from '../../state/editorStore';
import type { EditorAuthoredState } from '../../state/editorStore';
import type { MapHexDef, MissionDef, SideId } from '../../engine/types';

function perSideOrFlat(v: number | Partial<Record<SideId, number>> | undefined, side: SideId): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : (v[side] ?? 0);
}

function loadInfoSide(def: MissionDef, side: SideId): EditorInfoSide {
  return {
    nations: def.nations[side] ?? [],
    orders: def.sideOrders?.[side] ?? '',
    instructions: def.missionInstructions?.[side] ?? '',
    caps: def.caps[side] ?? 6,
    vp: def.startVp?.[side] ?? 0,
  };
}

function loadInfo(def: MissionDef): EditorInfo {
  return {
    title: def.name,
    situation: def.situation ?? '',
    sideA: loadInfoSide(def, 'A'),
    sideB: loadInfoSide(def, 'B'),
    roundsTotal: def.roundsTotal,
    initiative: def.firstInitiative ?? 'A',
  };
}

/** Splits a Mission's already-merged hexes back into "clean terrain" (a new
 *  synthetic catalog map) + the obstacles/fortifications overlaid on it —
 *  the Map section's own split, reconstructed. */
function synthesizeMapEntry(def: MissionDef): {
  map: Pick<EditorMapState, 'boards' | 'obstacles' | 'fortifications'>;
} {
  const obstacles: Record<string, EditorObstacle> = {};
  const fortifications: Record<string, EditorFortification> = {};
  const cleanHexes: MapHexDef[] = def.hexes.map((h) => {
    if (h.obstacle) {
      obstacles[h.id] = { kind: h.obstacle.kind, side: h.obstacle.ownerSide, hitNumber: h.obstacle.hitNumber, hidden: h.obstacle.hidden };
    }
    if (h.fortification) {
      fortifications[h.id] = { kind: h.fortification.kind, facing: h.fortification.facing ?? null };
    }
    const { obstacle: _obstacle, fortification: _fortification, ...rest } = h;
    return rest;
  });

  const syntheticId = `__loaded_${def.id}`;
  // The first mapOverlays entry found (if any) — a multi-board Mission with
  // per-board overlays can't keep more than one once flattened to one board;
  // documented as a known follow-up, not silently wrong.
  const overlayImage = def.mapOverlays ? Object.values(def.mapOverlays)[0] : undefined;
  const mapNumber = def.hexes[0]?.mapNumber;
  // Same "first value found" caveat as overlayImage above — a multi-board
  // Mission flattens to one synthetic board, so only one rotation survives.
  const rotation = (mapNumber != null ? def.mapRotations?.[mapNumber] : undefined)
    ?? (def.mapRotations ? Object.values(def.mapRotations)[0] : undefined)
    ?? 0;
  MAP_CATALOG[syntheticId] = {
    id: syntheticId,
    name: `${def.name} (loaded)`,
    hexes: cleanHexes,
    overlayImage,
  };

  const board: EditorBoard = { id: 'board-1', mapId: syntheticId, rotation };
  return { map: { boards: [board], obstacles, fortifications } };
}

function loadForces(def: MissionDef): EditorForcesState {
  return {
    placed: def.units.map((u) => ({ id: u.id, side: u.side, templateId: u.templateId, hexId: u.hexId, facing: u.facing, hidden: u.hidden })),
    search: '',
    nationFilter: 'all',
    armedTemplateId: null,
    armedSide: 'A',
    armedFacing: 0,
    armedHidden: false,
    // Resume with the first loaded Mines token's Hit Number (if any), so a
    // follow-up mine placed in this editing session matches the mission's own.
    mineHitNumber: (def.setupForces ?? []).find((u) => u.mine)?.mine!.hitNumber ?? 8,
    setupPool: (def.setupForces ?? []).map((u) => ({
      id: u.id,
      side: u.side,
      templateId: u.templateId,
      facing: u.facing,
      hidden: u.hidden,
      mine: u.mine,
    })),
    setupFirstSide: def.setupFirstSide ?? 'A',
    setupInstructions: def.setupInstructions ?? '',
  };
}

function loadReinforcements(def: MissionDef): EditorReinforcementsState {
  const waves: Record<SideId, EditorWave[]> = { A: [], B: [] };
  for (const w of def.reinforcements ?? []) {
    waves[w.side].push({
      id: w.id,
      // The authored wave "name" (a display-only label) isn't part of the
      // exported ReinforcementWaveDef at all, so it can't be recovered —
      // fall back to the wave's own id, which is at least stable/unique.
      name: w.id,
      earliestRound: w.earliestRound,
      description: w.entryDescription,
      entryHexIds: w.entryHexIds,
      units: w.units.map((u) => ({ id: u.id, templateId: u.templateId, facing: u.facing, hidden: u.hidden })),
    });
  }
  return { activeSide: 'A', waves, expandedWaveId: null, search: '', nationFilter: 'all', draftFacing: 0, draftHidden: false };
}

function loadVictory(def: MissionDef, hexes: MapHexDef[]): EditorVictoryState {
  const byId = new Map(hexes.map((h) => [h.id, h]));
  return {
    hexes: (def.victoryHexes ?? []).map((vh) => ({
      id: vh.hexId,
      hexLabel: byId.get(vh.hexId)?.label ?? vh.hexId,
      vp: vh.vp,
      control: vh.control ?? 'neutral',
      overrides: vh.roundOverrides?.length ? vh.roundOverrides.map((o) => ({ round: o.round, vp: o.vp })) : undefined,
      awardTiming: vh.awardTiming ?? 'endOfRound',
      awardRounds: vh.awardRounds,
    })),
    vpPerKillA: perSideOrFlat(def.vpPerKill, 'A'),
    vpPerKillB: perSideOrFlat(def.vpPerKill, 'B'),
    vpPerSurvivorA: perSideOrFlat(def.vpPerSurvivor, 'A'),
    vpPerSurvivorB: perSideOrFlat(def.vpPerSurvivor, 'B'),
    unitKillVp: Object.entries(def.unitKillVp ?? {}).map(([unitId, vp]) => ({ unitId, vp })),
    exitZones: (def.exitZones ?? []).map((z) => ({
      id: z.id,
      side: z.side,
      hexIds: z.hexIds,
      vpPerUnit: z.vpPerUnit,
      description: z.description ?? '',
    })),
    activeExitSide: 'A',
    draftHex: '',
    draftVp: 1,
    draftControl: 'neutral',
  };
}

function loadAdvanced(def: MissionDef): EditorAdvancedState {
  const notes = def.advancedNotes;
  return {
    airSupport: { A: notes?.airSupport?.A ?? '', B: notes?.airSupport?.B ?? '' },
    overlays: notes?.overlays ?? [],
  };
}

function loadCards(def: MissionDef): EditorCardsState {
  const cfg = def.cardConfig;
  return {
    battleCardIds: cfg?.battleCardIds ?? [],
    drawPerRound: {
      A: cfg?.drawPerRound?.A ?? { round1: 0, eachRoundAfter: 0 },
      B: cfg?.drawPerRound?.B ?? { round1: 0, eachRoundAfter: 0 },
    },
    initialHand: { A: cfg?.initialHand?.A ?? [], B: cfg?.initialHand?.B ?? [] },
    obaAllowedRounds: cfg?.obaAllowedRounds ?? [],
    missionCardText: Object.fromEntries(
      Object.entries(def.missionCardText ?? {}).filter((e): e is [string, string] => e[1] !== undefined),
    ),
  };
}

/** Build full Mission Editor authoring state from an existing MissionDef. */
export function buildEditorStateFromMission(def: MissionDef): EditorAuthoredState {
  const { map } = synthesizeMapEntry(def);
  return {
    info: loadInfo(def),
    map: { ...map, tool: 'wire', toolSide: 'A', bunkerFacing: 0, minesHitNumber: 8 },
    forces: loadForces(def),
    reinforcements: loadReinforcements(def),
    victory: loadVictory(def, def.hexes),
    advanced: loadAdvanced(def),
    cards: loadCards(def),
  };
}
