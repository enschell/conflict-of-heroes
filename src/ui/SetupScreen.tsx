/** Start screen: begin Firefight 1 or resume an autosaved game. */
import { useGame } from '../state/store';
import { hasAuto } from '../state/persistence';
import { FIREFIGHT_1 } from '../data/firefights/firefight1';

export function SetupScreen() {
  const newGame = useGame((s) => s.newGame);
  const resume = useGame((s) => s.resume);
  const canResume = hasAuto();

  return (
    <div className="setup">
      <h1>Conflict of Heroes</h1>
      <p className="tagline">Awakening the Bear · browser edition · hotseat</p>
      <div className="setup__card">
        <h2>{FIREFIGHT_1.name}</h2>
        <p>
          Germans push west→east into a partisan-held hamlet. {FIREFIGHT_1.roundsTotal} rounds.
          Hold the objectives (★) and destroy the enemy for victory points. Pass-and-play: both
          sides share one screen.
        </p>
        <div className="setup__actions">
          <button className="primary" onClick={newGame}>
            Start Firefight 1
          </button>
          {canResume && (
            <button onClick={resume}>Resume autosave</button>
          )}
        </div>
      </div>
    </div>
  );
}
