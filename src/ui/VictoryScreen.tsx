/** Game-over overlay: final scores + winner. */
import { finalScores } from '../engine';
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

export function VictoryScreen() {
  const game = useGame((s) => s.game);
  const newGame = useGame((s) => s.newGame);
  if (!game || game.phase !== 'gameOver') return null;

  const scores = finalScores(game);
  const winner = game.winner;
  const label = (side: 'A' | 'B') =>
    game.players[side].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  return (
    <div className="modal-backdrop">
      <div className="victory">
        <h2>{winner ? `Side ${winner} wins!` : 'A draw (both lose)'}</h2>
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
