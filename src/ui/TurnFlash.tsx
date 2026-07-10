/**
 * Large text flashed over the board announcing whose Turn it is, fading away
 * after 4 seconds — a transient overlay (`pointer-events: none`, never blocks
 * play), not a persistent banner. Fires the instant `game.currentSide` flips
 * (including once on mount, for the Mission's starting side) via a `key={cs}`
 * remount, which restarts the CSS fade animation even if two Turn switches
 * happen in quick succession (a plain visibility toggle wouldn't remount the
 * DOM node a second time while still mid-fade from the first). Never shows a
 * bare Side letter (same convention as `VictoryScreen.tsx`).
 */
import { useEffect, useState } from 'react';
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

const FLASH_MS = 4000;

export function TurnFlash() {
  const game = useGame((s) => s.game);
  const cs = game?.currentSide;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cs) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [cs]);

  if (!game || !cs || !visible) return null;

  const nation = game.players[cs].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');
  // Plural nation names already ending in "s" ("Germans", "Soviets") take a
  // bare apostrophe ("Germans' Turn"), not another "s" ("Germans's Turn").
  const possessive = nation.endsWith('s') ? `${nation}’` : `${nation}’s`;

  return (
    <div className="turn-flash" aria-hidden="true">
      <div className="turn-flash__text" data-side={cs} key={cs}>
        {possessive} Turn
      </div>
    </div>
  );
}
