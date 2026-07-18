/**
 * Pre-Mission Setup phase panel (Mission-configurable): shown while
 * `game.phase === 'setup'`. Lists whichever side currently has the setup
 * turn (`game.setupSide`)'s remaining Setup Pool Units — "Place" arms one
 * (`store.ts`'s `armSetupUnit`), then clicking a highlighted (purple) empty
 * Hex on the board places it (`Board.tsx`'s `hexClick` setup-phase branch).
 * The real facing is chosen afterward via the EXISTING free facing-
 * correction picker (`pendingFacingChoices`) — no separate facing UI needed.
 */
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';
import { code } from './UnitCounter';

export function SetupPanel() {
  const game = useGame((s) => s.game);
  const armedSetupUnitId = useGame((s) => s.armedSetupUnitId);
  const armSetupUnit = useGame((s) => s.armSetupUnit);

  if (!game || game.phase !== 'setup' || !game.setupSide) return null;

  const side = game.setupSide;
  const pool = (game.setupPool ?? []).filter((u) => u.side === side);
  const nationName = game.players[side].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  return (
    <div className="panel reinforce">
      <h3>Pre-Mission Setup</h3>
      <p className="dim">
        Side {side} ({nationName}) places its forces — {pool.length} Unit{pool.length === 1 ? '' : 's'} remaining.
      </p>
      {game.setupInstructions && (
        <p className="setup-panel__instructions">{game.setupInstructions}</p>
      )}
      <div className="reinforce__units">
        {pool.map((u) => {
          const name = game.templates[u.templateId]?.name ?? u.templateId;
          const armed = armedSetupUnitId === u.id;
          return (
            <div key={u.id} className="reinforce__unit" title={name}>
              <span className="reinforce__badge" style={{ background: NATIONS[u.nation]?.color }}>
                {code(name)}
              </span>
              <span className="reinforce__name">{name}</span>
              <button className={`reinforce__place${armed ? ' is-active' : ''}`} onClick={() => armSetupUnit(armed ? null : u.id)}>
                {armed ? 'Cancel' : 'Place'}
              </button>
              {armed && <span className="dim">click a highlighted Hex…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
