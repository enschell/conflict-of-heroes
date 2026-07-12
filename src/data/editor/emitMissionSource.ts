/**
 * Turns Mission Editor authoring state into a real, self-contained
 * TypeScript `MissionDef` source file — matching the existing hand-authored
 * convention (e.g. `data/missions/hillsSandbox.ts`) rather than a JSON blob.
 * Map hexes/unit placements/reinforcement waves are inlined as literal data;
 * only `UNIT_TEMPLATES` is imported by reference, so the mission stays in
 * sync with the real catalog instead of duplicating stat data.
 */
import { assembledMap } from '../../state/editorStore';
import type { EditorAuthoredState } from '../../state/editorStore';
import type { ExitZoneDef, HexId, MapHexDef, SideId, VictoryHexDef } from '../../engine/types';

// ---------------------------------------------------------------------------
// A tiny JS-value -> TypeScript-source pretty printer. `raw(code)` escapes a
// value out of quoting/escaping so real code (an identifier expression, e.g.
// `UNIT_TEMPLATES['ger-rifle']!`) can be spliced in verbatim.
// ---------------------------------------------------------------------------

const RAW = Symbol('raw');
interface RawCode {
  [RAW]: true;
  code: string;
}
function raw(code: string): RawCode {
  return { [RAW]: true, code };
}
function isRaw(v: unknown): v is RawCode {
  return !!v && typeof v === 'object' && RAW in (v as object);
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function toSource(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (isRaw(value)) return value.code;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${padIn}${toSource(v, indent + 1)}`).join(',\n');
    return `[\n${items},\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const lines = entries
      .map(([k, v]) => `${padIn}${IDENT.test(k) ? k : quote(k)}: ${toSource(v, indent + 1)}`)
      .join(',\n');
    return `{\n${lines},\n${pad}}`;
  }
  throw new Error(`emitMissionSource: cannot serialize value of type ${typeof value}`);
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return s || 'mission';
}

/** Every distinct template id referenced by this mission's placements/reinforcements. */
function collectTemplateIds(state: EditorAuthoredState): string[] {
  const ids = new Set<string>();
  for (const p of state.forces.placed) ids.add(p.templateId);
  for (const side of ['A', 'B'] as const) {
    for (const w of state.reinforcements.waves[side]) {
      for (const u of w.units) ids.add(u.templateId);
    }
  }
  return [...ids];
}

/** `hexLabel` ("H07") or an existing "q,r" id -> the real internal HexId. */
function resolveHexId(labelOrId: string, map: MapHexDef[]): HexId {
  const byLabel = new Map<string, HexId>();
  for (const h of map) if (h.label) byLabel.set(h.label.toUpperCase(), h.id);
  const key = labelOrId.trim().toUpperCase();
  const byLabelHit = byLabel.get(key);
  if (byLabelHit) return byLabelHit;
  if (map.some((h) => h.id === labelOrId)) return labelOrId;
  throw new Error(`Unknown victory hex "${labelOrId}" — no hex on the picked map has that label or id.`);
}

function buildHexes(state: EditorAuthoredState): MapHexDef[] {
  const { hexes, error } = assembledMap(state.map);
  if (error) throw new Error(`Cannot export — the Map section has an invalid board configuration: ${error}`);
  return hexes;
}

function buildVictoryHexes(state: EditorAuthoredState, hexes: MapHexDef[]): VictoryHexDef[] {
  return state.victory.hexes.map((v) => ({
    hexId: resolveHexId(v.hexLabel, hexes),
    vp: v.vp,
    control: v.control === 'neutral' ? undefined : (v.control as SideId),
    roundOverrides: v.overrides?.length ? v.overrides.map((o) => ({ round: o.round, vp: o.vp })) : undefined,
    awardTiming: v.awardTiming === 'endOfRound' ? undefined : v.awardTiming,
  }));
}

function buildExitZones(state: EditorAuthoredState): ExitZoneDef[] | undefined {
  const zones = state.victory.exitZones.filter((z) => z.hexIds.length > 0);
  if (zones.length === 0) return undefined;
  return zones.map((z) => ({
    id: z.id,
    side: z.side,
    hexIds: z.hexIds,
    vpPerUnit: z.vpPerUnit,
    description: z.description || undefined,
  }));
}

function buildAdvancedNotes(state: EditorAuthoredState) {
  const { advanced } = state;
  const anyBattleCards = (['A', 'B'] as const).some(
    (s) => advanced.battleCards[s].round1 !== 0 || advanced.battleCards[s].eachRoundAfter !== 0,
  );
  const anyAirSupport = advanced.airSupport.A !== '' || advanced.airSupport.B !== '';
  const notes = {
    battleCards: anyBattleCards ? advanced.battleCards : undefined,
    hiddenUnitIds: advanced.hiddenIds.length ? advanced.hiddenIds : undefined,
    obaAllowedRounds: advanced.obaAllowedRounds.length ? advanced.obaAllowedRounds : undefined,
    obaStrikes: advanced.obaStrikes.length
      ? advanced.obaStrikes.map((o) => ({ id: o.id, plannedRound: o.plannedRound }))
      : undefined,
    airSupport: anyAirSupport
      ? { A: advanced.airSupport.A === '' ? undefined : advanced.airSupport.A, B: advanced.airSupport.B === '' ? undefined : advanced.airSupport.B }
      : undefined,
    overlays: advanced.overlays.length ? advanced.overlays : undefined,
  };
  const hasAny = Object.values(notes).some((v) => v !== undefined);
  return hasAny ? notes : undefined;
}

/** Produce the full, self-contained TypeScript `MissionDef` source text. */
export function emitMissionSource(state: EditorAuthoredState): string {
  const { info } = state;
  const id = slugify(info.title);
  const seed = Date.now();
  const templateIds = collectTemplateIds(state);

  const startVp: Partial<Record<SideId, number>> = {};
  if (info.sideA.vp) startVp.A = info.sideA.vp;
  if (info.sideB.vp) startVp.B = info.sideB.vp;

  const vpPerKill: Partial<Record<SideId, number>> = {};
  if (state.victory.vpPerKillA) vpPerKill.A = state.victory.vpPerKillA;
  if (state.victory.vpPerKillB) vpPerKill.B = state.victory.vpPerKillB;

  const vpPerSurvivor: Partial<Record<SideId, number>> = {};
  if (state.victory.vpPerSurvivorA) vpPerSurvivor.A = state.victory.vpPerSurvivorA;
  if (state.victory.vpPerSurvivorB) vpPerSurvivor.B = state.victory.vpPerSurvivorB;

  const unitKillVp: Record<string, number> = {};
  for (const entry of state.victory.unitKillVp) unitKillVp[entry.unitId] = entry.vp;

  const sideOrders: Partial<Record<SideId, string>> = {};
  if (info.sideA.orders) sideOrders.A = info.sideA.orders;
  if (info.sideB.orders) sideOrders.B = info.sideB.orders;

  const missionInstructions: Partial<Record<SideId, string>> = {};
  if (info.sideA.instructions) missionInstructions.A = info.sideA.instructions;
  if (info.sideB.instructions) missionInstructions.B = info.sideB.instructions;

  const reinforcements = (['A', 'B'] as const).flatMap((side) =>
    state.reinforcements.waves[side].map((w) => ({
      id: w.id,
      side,
      earliestRound: w.earliestRound,
      entryHexIds: w.entryHexIds,
      entryDescription: w.description,
      units: w.units.map((u) => ({ id: u.id, templateId: u.templateId, facing: u.facing })),
    })),
  );

  const hexes = buildHexes(state);

  const missionDef = {
    id,
    name: info.title,
    roundsTotal: info.roundsTotal,
    seed,
    caps: { A: info.sideA.caps, B: info.sideB.caps },
    nations: { A: info.sideA.nations, B: info.sideB.nations },
    firstInitiative: info.initiative,
    startVp: Object.keys(startVp).length ? startVp : undefined,
    vpPerKill: Object.keys(vpPerKill).length ? vpPerKill : undefined,
    unitKillVp: Object.keys(unitKillVp).length ? unitKillVp : undefined,
    vpPerSurvivor: Object.keys(vpPerSurvivor).length ? vpPerSurvivor : undefined,
    hexes,
    units: state.forces.placed.map((p) => ({ id: p.id, side: p.side, templateId: p.templateId, hexId: p.hexId, facing: p.facing })),
    reinforcements: reinforcements.length ? reinforcements : undefined,
    exitZones: buildExitZones(state),
    templates: raw(`[${templateIds.map((tid) => `UNIT_TEMPLATES[${quote(tid)}]!`).join(', ')}]`),
    victoryHexes: buildVictoryHexes(state, hexes),
    situation: info.situation || undefined,
    sideOrders: Object.keys(sideOrders).length ? sideOrders : undefined,
    missionInstructions: Object.keys(missionInstructions).length ? missionInstructions : undefined,
    advancedNotes: buildAdvancedNotes(state),
  };

  const constName = id.toUpperCase().replace(/-/g, '_') + '_MISSION';

  return `/**
 * ${info.title || 'Untitled Mission'}
 * Generated by the Mission Editor — a self-contained Mission definition.
 *
 * To make this Mission playable:
 *  1. Drop this file into src/data/missions/.
 *  2. Import \`${constName}\` and add a button for it in src/ui/SetupScreen.tsx.
 *  3. Optionally register it in src/data/missions/catalog.ts for online play.
 */
import { UNIT_TEMPLATES } from '../units';
import type { MissionDef } from '../../engine/types';

export const ${constName}: MissionDef = ${toSource(missionDef)};
`;
}

/** Generate the source and trigger a browser download of it. */
export function downloadMissionSource(state: EditorAuthoredState): void {
  let source: string;
  try {
    source = emitMissionSource(state);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
    return;
  }
  const blob = new Blob([source], { type: 'text/typescript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(state.info.title)}.ts`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
