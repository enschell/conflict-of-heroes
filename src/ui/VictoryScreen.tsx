/** Game-over overlay: VP-Advantage winner (§9.3) + gross scores. */
import { finalScores, vpLeader, vpMargin } from '../engine';
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

export function VictoryScreen() {
  const game = useGame((s) => s.game);
  const newGame = useGame((s) => s.newGame);
  if (!game || game.phase !== 'gameOver') return null;

  const scores = finalScores(game);
  const winner = vpLeader(game); // v3: no ties — the VP-Advantage holder wins
  const margin = vpMargin(game);
  const label = (side: 'A' | 'B') =>
    game.players[side].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  return (
    <div className="modal-backdrop">
      <div className="victory">
        <h2>Side {winner} wins!</h2>
        <p className="victory__adv">VP Advantage: Side {winner} +{margin}</p>
        <div className="victory__scores">
          <div>
            Side A · {label('A')}: <b>{scores.A} VP</b>
          </div>
          <div>
            Side B · {label('B')}: <b>{scores.B} VP</b>
          </div>
        </div>
        <button className="primary" onClick={newGame}>
          New game
        </button>
      </div>
    </div>
  );
}
