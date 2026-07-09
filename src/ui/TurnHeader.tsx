/**
 * Persistent header directly above the board showing whose Turn it is —
 * distinct from TurnBanner.tsx's transient "Start of turn N" popup (which
 * only fires once per Round and needs a click to dismiss), this never
 * dismisses and updates live the instant the Turn switches sides. Never
 * shows a bare Side letter (matches the convention elsewhere, e.g.
 * VictoryScreen.tsx) — only the nation name(s).
 */
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

export function TurnHeader() {
  const game = useGame((s) => s.game);
  if (!game) return null;

  const cs = game.currentSide;
  const nation = game.players[cs].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');
  // Plural nation names already ending in "s" ("Germans", "Soviets") take a
  // bare apostrophe ("Germans' Turn"), not another "s" ("Germans's Turn").
  const possessive = nation.endsWith('s') ? `${nation}’` : `${nation}’s`;

  return (
    <div className="turn-header" data-side={cs}>
      <span className="turn-header__dot" data-side={cs} />
      {possessive} Turn
    </div>
  );
}
