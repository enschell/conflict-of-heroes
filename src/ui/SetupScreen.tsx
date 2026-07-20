/** Start screen: pick a mission (details shown at right — selecting never
 *  auto-starts), then play it hotseat or online; sandbox test missions live
 *  in their own left-side panel; the Mission/Map Editors are top buttons. */
import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { hasAuto } from '../state/persistence';
import { NATIONS } from '../data/nations';
import { UNIT_TEMPLATES } from '../data/units';
import { MISSION_1 } from '../data/missions/mission1';
import { ARMOR_SANDBOX } from '../data/missions/sandbox';
import { NEW_MISSION_MISSION } from '../data/missions/new-mission';
import { SOS_MISSION_4_MISSION } from '../data/missions/SoS Mission 4';
import { ATB_FIREFIGHT_9_KV2_MISSION } from '../data/missions/atb-firefight-9-kv2';
import { FIRE_SUPPORT_SANDBOX } from '../data/missions/fireSupportSandbox';
import { HILLS_SANDBOX } from '../data/missions/hillsSandbox';
import { OBSTACLES_SANDBOX } from '../data/missions/obstaclesSandbox';
import { FORTIFICATIONS_SANDBOX } from '../data/missions/fortificationsSandbox';
import { HEX_BOARD_DEMO } from '../data/missions/hexBoardDemo';
import { SETUP_PHASE_SANDBOX } from '../data/missions/setupPhaseSandbox';
import { HIDDEN_UNITS_SANDBOX } from '../data/missions/hiddenUnitsSandbox';
import { CARDS_SANDBOX } from '../data/missions/cardsSandbox';
import { EditorBoard } from './editor/EditorBoard';
import type { RotationCluster } from '../engine';
import type { MissionDef, SideId } from '../engine/types';

const REAL_MISSIONS: MissionDef[] = [MISSION_1, SOS_MISSION_4_MISSION, ATB_FIREFIGHT_9_KV2_MISSION];

const TEST_MISSIONS: MissionDef[] = [
  NEW_MISSION_MISSION,
  ARMOR_SANDBOX,
  FIRE_SUPPORT_SANDBOX,
  HILLS_SANDBOX,
  OBSTACLES_SANDBOX,
  FORTIFICATIONS_SANDBOX,
  HEX_BOARD_DEMO,
  SETUP_PHASE_SANDBOX,
  HIDDEN_UNITS_SANDBOX,
  CARDS_SANDBOX,
];

function templateName(templateId: string): string {
  return UNIT_TEMPLATES[templateId]?.name ?? templateId;
}

/** "2× Rifle Squad, 1× HMG Team" — collapse a unit list into per-template counts. */
function forceSummary(templateIds: string[]): string {
  const counts = new Map<string, number>();
  for (const tid of templateIds) counts.set(tid, (counts.get(tid) ?? 0) + 1);
  return [...counts.entries()].map(([tid, n]) => `${n}× ${templateName(tid)}`).join(', ');
}

function sideName(def: MissionDef, side: SideId): string {
  const nations = (def.nations[side] ?? []).map((n) => NATIONS[n]?.name ?? n).join(', ');
  return `Side ${side} (${nations})`;
}

/** Per-side starting forces: fixed placements + the player-placed Setup Pool, if any. */
function StartingForces({ def }: { def: MissionDef }) {
  return (
    <>
      <h4>Starting Forces</h4>
      {(['A', 'B'] as const).map((side) => {
        const fixed = def.units.filter((u) => u.side === side).map((u) => u.templateId);
        const pool = (def.setupForces ?? []).filter((u) => u.side === side).map((u) => u.templateId);
        if (fixed.length === 0 && pool.length === 0) {
          return (
            <p key={side} className="setup__detail-line">
              <b>{sideName(def, side)}:</b> <span className="dim">none at start</span>
            </p>
          );
        }
        return (
          <p key={side} className="setup__detail-line">
            <b>{sideName(def, side)}:</b>{' '}
            {fixed.length > 0 && forceSummary(fixed)}
            {fixed.length > 0 && pool.length > 0 && '; '}
            {pool.length > 0 && `${forceSummary(pool)} (placed by the player pre-Round 1)`}
          </p>
        );
      })}
    </>
  );
}

function Reinforcements({ def }: { def: MissionDef }) {
  const waves = def.reinforcements ?? [];
  if (waves.length === 0) return null;
  return (
    <>
      <h4>Reinforcements</h4>
      {waves.map((w) => (
        <p key={w.id} className="setup__detail-line">
          <b>Round {w.earliestRound}+ — {sideName(def, w.side)}:</b> {forceSummary(w.units.map((u) => u.templateId))}
        </p>
      ))}
    </>
  );
}

/** Read-only mini board preview (~quarter scale via its container width). */
function MissionMapThumb({ def }: { def: MissionDef }) {
  // A flattened Mission's {90°,-90°} display spin survives only as
  // `mapRotations` (§B) — synthesize the whole-assembly cluster the same way
  // the live Board.tsx does (any entry ⇒ every hex is in the one cluster).
  const rotationClusters = useMemo<RotationCluster[]>(() => {
    const entries = Object.entries(def.mapRotations ?? {});
    if (entries.length === 0) return [];
    const rotation = def.mapRotations![Math.min(...entries.map(([k]) => Number(k)))]!;
    return [{ hexIds: def.hexes.map((h) => h.id), rotation }];
  }, [def]);
  return (
    <div className="setup__map-thumb">
      <EditorBoard hexes={def.hexes} mapOverlays={def.mapOverlays} rotationClusters={rotationClusters} />
    </div>
  );
}

function MissionDetails({ def }: { def: MissionDef }) {
  return (
    <div className="setup__card setup__details">
      <h2>{def.name}</h2>
      <p className="dim">
        {def.roundsTotal} Rounds · CAPs {def.caps.A}/{def.caps.B} · Initiative: {sideName(def, def.firstInitiative ?? 'A')}
      </p>
      {def.situation && <p className="setup__detail-situation">{def.situation}</p>}
      <MissionMapThumb def={def} />
      <StartingForces def={def} />
      <Reinforcements def={def} />
    </div>
  );
}

export function SetupScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const createOnlineRoom = useGame((s) => s.createOnlineRoom);
  const joinOnlineRoom = useGame((s) => s.joinOnlineRoom);
  const openMissionEditor = useGame((s) => s.openMissionEditor);
  const openMapEditor = useGame((s) => s.openMapEditor);
  const canResume = hasAuto();
  const [joinCode, setJoinCode] = useState('');
  const [selectedId, setSelectedId] = useState(MISSION_1.id);
  const [playMode, setPlayMode] = useState<'hotseat' | 'online'>('hotseat');

  const selected = REAL_MISSIONS.find((m) => m.id === selectedId) ?? MISSION_1;

  return (
    <div className="setup">
      <h1>Conflict of Heroes</h1>
      <p className="tagline">Awakening the Bear · browser edition · hotseat &amp; online</p>

      <div className="setup__topbar">
        <button onClick={openMissionEditor}>Mission Editor</button>
        <button onClick={openMapEditor}>Map Editor</button>
      </div>

      <div className="setup__layout">
        <div className="setup__tests">
          <h2>Tests</h2>
          <div className="setup__actions setup__actions--vertical">
            {TEST_MISSIONS.map((m) => (
              <button key={m.id} onClick={() => newGame(m)}>
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="setup__main">
          <div className="setup__card">
            <h2>Missions</h2>
            <p className="dim">Select a mission to see its details, then choose how to play it.</p>
            <div className="setup__actions setup__actions--vertical">
              {REAL_MISSIONS.map((m) => (
                <button
                  key={m.id}
                  className={`setup__mission-btn${m.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(m.id)}
                >
                  {m.name}
                </button>
              ))}
              {canResume && <button onClick={resume}>Resume autosave</button>}
            </div>
          </div>

          <div className="setup__card">
            <h2>Play</h2>
            <div className="setup__actions">
              <button className="primary" onClick={() => newGame(selected)}>
                Local Hotseat
              </button>
              <button
                className={playMode === 'online' ? 'setup__mission-btn is-selected' : ''}
                onClick={() => setPlayMode(playMode === 'online' ? 'hotseat' : 'online')}
              >
                Play Online
              </button>
            </div>
            {playMode === 'online' && (
              <>
                <p className="dim">Play {selected.name} with a friend over the internet — no account needed.</p>
                <div className="setup__actions">
                  <button className="primary" onClick={() => createOnlineRoom(selected.id)}>
                    Create Online Game
                  </button>
                </div>
                <div className="setup__join">
                  <input
                    type="text"
                    placeholder="Room code"
                    value={joinCode}
                    maxLength={8}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <button disabled={!joinCode.trim()} onClick={() => joinOnlineRoom(joinCode.trim())}>
                    Join Game
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <MissionDetails def={selected} />
      </div>
    </div>
  );
}
