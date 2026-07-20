/**
 * Minimal, plain-text Cards (§8) panel — deliberately NOT the deferred
 * card-art/hand-panel UI (CLAUDE.md's Cards section): a name/cost/effect-text
 * row per held card, a "Play" button (Green/Blue cost handled by the store's
 * `playCard`), and a "Target…" button for Artillery Cards that arms OBA
 * targeting (§13.5 — click any Hex on the board next).
 */
import { cardDef } from '../data/cards/catalog';
import { useGame } from '../state/store';
import type { SideId } from '../engine/types';

export function HandPanel({ side }: { side: SideId }) {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const playCard = useGame((s) => s.playCard);
  const armObaCard = useGame((s) => s.armObaCard);
  const armedObaCard = useGame((s) => s.armedObaCard);

  if (!game) return null;
  const hand = game.players[side].hand;
  if (hand.length === 0) return null;

  const selectedUnit = selectedUnitId ? game.units[selectedUnitId] : undefined;
  const unitForPlay = selectedUnit?.side === side ? selectedUnit.id : undefined;

  return (
    <div className="hand-panel">
      <div className="hand-panel__head">Side {side} Hand ({hand.length})</div>
      <ul className="hand-panel__list">
        {hand.map((cardId) => {
          const def = cardDef(cardId);
          if (!def) return null;
          const isArtillery = def.type === 'artillery';
          const costLabel = def.cost
            ? `${def.cost.color === 'green' ? 'Green' : 'Blue'} ${def.cost.amount}${def.cost.color === 'green' ? 'AP' : 'CAP'}`
            : isArtillery
              ? 'OBA'
              : '';
          return (
            <li key={cardId} className="hand-panel__card">
              <div className="hand-panel__name">
                #{def.id} {def.name} <span className="dim">({costLabel})</span>
              </div>
              <div className="hand-panel__effect dim">{def.effectText}</div>
              {isArtillery ? (
                <button
                  className={armedObaCard?.side === side && armedObaCard.cardId === cardId ? 'on' : ''}
                  onClick={() =>
                    armObaCard(armedObaCard?.side === side && armedObaCard.cardId === cardId ? null : { side, cardId })
                  }
                >
                  {armedObaCard?.side === side && armedObaCard.cardId === cardId ? 'Click a target Hex…' : 'Target… (§13.5)'}
                </button>
              ) : (
                <button
                  onClick={() => playCard(side, cardId, def.cost?.color === 'green' ? unitForPlay : undefined)}
                  disabled={def.cost?.color === 'green' && !unitForPlay}
                  title={def.cost?.color === 'green' && !unitForPlay ? 'Select one of your Units first (§8.6)' : undefined}
                >
                  Play
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
