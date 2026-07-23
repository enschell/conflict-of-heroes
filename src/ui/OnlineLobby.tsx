/**
 * M13 online play, pre-game screen: shown while `mode === 'online'` and no
 * `game` has arrived yet (still connecting, or the server rejected the
 * create/join). Functional-minimum placeholder — see CLAUDE.md's M13 plan;
 * a real visual design may replace this.
 */
import { useGame } from '../state/store';

export function OnlineLobby() {
  const netError = useGame((s) => s.netError);
  const leaveOnlineRoom = useGame((s) => s.leaveOnlineRoom);

  return (
    <div className="setup">
      <h1>Conflict of Heroes</h1>
      <p className="tagline">Awakening the Bear · browser edition · online</p>
      <div className="setup__card">
        {netError ? (
          <>
            <h2>Couldn't join</h2>
            <p>{netError}</p>
          </>
        ) : (
          <>
            <h2>Connecting…</h2>
            <p>Setting up your online game.</p>
          </>
        )}
        <div className="setup__actions">
          <button onClick={leaveOnlineRoom}>Back to menu</button>
        </div>
      </div>
    </div>
  );
}
