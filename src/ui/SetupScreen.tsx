/** Start screen: begin Mission 1, the armor sandbox, resume an autosave, or
 *  play online (M13) — create a room and share its code, or join one. */
import { useState } from 'react';
import { useGame } from '../state/store';
import { hasAuto } from '../state/persistence';
import { MISSION_1 } from '../data/missions/mission1';
import { ARMOR_SANDBOX } from '../data/missions/sandbox';
import { FIRE_SUPPORT_SANDBOX } from '../data/missions/fireSupportSandbox';
import { HILLS_SANDBOX } from '../data/missions/hillsSandbox';
import { OBSTACLES_SANDBOX } from '../data/missions/obstaclesSandbox';
import { FORTIFICATIONS_SANDBOX } from '../data/missions/fortificationsSandbox';
import { HEX_BOARD_DEMO } from '../data/missions/hexBoardDemo';

export function SetupScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const createOnlineRoom = useGame((s) => s.createOnlineRoom);
  const joinOnlineRoom = useGame((s) => s.joinOnlineRoom);
  const openMissionEditor = useGame((s) => s.openMissionEditor);
  const canResume = hasAuto();
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="setup">
      <h1>Conflict of Heroes</h1>
      <p className="tagline">Awakening the Bear · browser edition · hotseat &amp; online</p>
      <div className="setup__card">
        <h2>{MISSION_1.name}</h2>
        <p>
          Germans push north into a partisan-held wood. {MISSION_1.roundsTotal} rounds.
          Hold the objective (★ Hex I06) and destroy the enemy for victory points. Pass-and-play:
          both sides share one screen.
        </p>
        <div className="setup__actions">
          <button className="primary" onClick={() => newGame()}>
            Start Mission 1
          </button>
          <button onClick={() => newGame(ARMOR_SANDBOX)}>Armor Sandbox (test)</button>
          <button onClick={() => newGame(FIRE_SUPPORT_SANDBOX)}>Fire Support Sandbox (test)</button>
          <button onClick={() => newGame(HILLS_SANDBOX)}>Hills Sandbox (test)</button>
          <button onClick={() => newGame(OBSTACLES_SANDBOX)}>Obstacles Sandbox (test)</button>
          <button onClick={() => newGame(FORTIFICATIONS_SANDBOX)}>Fortifications Sandbox (test)</button>
          <button onClick={() => newGame(HEX_BOARD_DEMO)}>Hex Board Demo (test)</button>
          {canResume && (
            <button onClick={resume}>Resume autosave</button>
          )}
        </div>
      </div>

      {/* M13, functional-minimum placeholder — see CLAUDE.md's M13 plan. A
          real visual design may replace this section later. */}
      <div className="setup__card">
        <h2>Play Online</h2>
        <p>Play Mission 1 with a friend over the internet — no account needed.</p>
        <div className="setup__actions">
          <button className="primary" onClick={() => createOnlineRoom(MISSION_1.id)}>
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
      </div>

      <div className="setup__card">
        <h2>Mission Editor</h2>
        <p>Author a new Mission — map, starting forces, reinforcements, and victory conditions.</p>
        <div className="setup__actions">
          <button className="primary" onClick={openMissionEditor}>
            Open Mission Editor
          </button>
        </div>
      </div>
    </div>
  );
}
