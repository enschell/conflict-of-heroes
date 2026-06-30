/** Start screen: begin Mission 1 or resume an autosaved game. */
import { useGame } from '../state/store';
import { hasAuto } from '../state/persistence';
import { MISSION_1 } from '../data/missions/mission1';

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
          <button className="primary" onClick={newGame}>
            Start Mission 1
          </button>
          {canResume && (
            <button onClick={resume}>Resume autosave</button>
          )}
        </div>
      </div>
    </div>
  );
}
