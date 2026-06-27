/** Rolling event log (most recent first). */
import { useGame } from '../state/store';

export function Log() {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const entries = game.log.slice(-40).reverse();
  return (
    <div className="panel log">
      <h3>Log</h3>
      <ul>
        {entries.map((e, i) => (
          <li key={i} className={`log__${e.type}`}>
            <span className="dim">R{e.round}</span> {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
