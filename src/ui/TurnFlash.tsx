/**
 * Large text flashed over the board announcing whose Turn it is, fading away
 * after 4 seconds — a transient overlay (`pointer-events: none`, never blocks
 * play), not a persistent banner. Fires once `game.currentSide` has settled
 * (including once on mount, for the Mission's starting side) via a `key={cs}`
 * remount, which restarts the CSS fade animation even if two Turn switches
 * happen in quick succession (a plain visibility toggle wouldn't remount the
 * DOM node a second time while still mid-fade from the first). Never shows a
 * bare Side letter (same convention as `VictoryScreen.tsx`).
 *
 * Deliberately waits out any open `pendingFacingChoices` window before
 * flashing: a normal Move hands the Turn to the other side *before* the
 * mover's free facing-correction pick (§4.5/§15.11) — `currentSide` is
 * already the *next* side while the *previous* side still has that pending
 * choice to make. Flashing the new Turn immediately would read as "it's the
 * other side's Turn now" while the mover still has a decision pending, so
 * this holds off until `pendingFacingChoices` is empty (either the mover
 * explicitly picked a facing, or moved on and let the window close on its
 * own) — then flashes whoever's Turn it actually is at that point.
 */
import { useEffect, useState } from 'react';
import { NATIONS } from '../data/nations';
import { useGame } from '../state/store';

const FLASH_MS = 4000;

export function TurnFlash() {
  const game = useGame((s) => s.game);
  const cs = game?.currentSide;
  const awaitingFacing = (game?.pendingFacingChoices?.length ?? 0) > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!cs || awaitingFacing) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [cs, awaitingFacing]);

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
