/** Start screen: begin Mission 1, the armor sandbox, or resume an autosave. */
import { useGame } from '../state/store';
import { hasAuto } from '../state/persistence';
import { MISSION_1 } from '../data/missions/mission1';
import { ARMOR_SANDBOX } from '../data/missions/sandbox';
import { FIRE_SUPPORT_SANDBOX } from '../data/missions/fireSupportSandbox';
import { HILLS_SANDBOX } from '../data/missions/hillsSandbox';
import { OBSTACLES_SANDBOX } from '../data/missions/obstaclesSandbox';
import { FORTIFICATIONS_SANDBOX } from '../data/missions/fortificationsSandbox';

export function SetupScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const canResume = hasAuto();

  return (
    <div className="setup">
      <h1>Conflict of Heroes</h1>
      <p className="tagline">Awakening the Bear · browser edition · hotseat</p>
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
          {canResume && (
            <button onClick={resume}>Resume autosave</button>
          )}
        </div>
      </div>
    </div>
  );
}
