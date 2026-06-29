/**
 * Top-level layout: setup screen, then the board flanked by track sheets and
 * the inspector / under-cursor / log panels, with global turn controls and the
 * dice / confirm / turn-banner / victory overlays. All state lives in the
 * Zustand store; this component only reads it and fires intents.
 */
import { useEffect, useState } from 'react';
import { useGame } from './state/store';
import { NATIONS } from './data/nations';
import { ActionChooser } from './ui/ActionChooser';
import { Board } from './ui/Board';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SavesDialog } from './ui/SavesDialog';
import { DiceRoller } from './ui/DiceRoller';
import { HoverPanel } from './ui/HoverPanel';
import { Inspector } from './ui/Inspector';
import { Log } from './ui/Log';
import { SetupScreen } from './ui/SetupScreen';
import { TrackSheet } from './ui/TrackSheet';
import { TurnBanner } from './ui/TurnBanner';
import { VictoryScreen } from './ui/VictoryScreen';

export function App() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const losMode = useGame((s) => s.losMode);
  const shiftHeld = useGame((s) => s.shiftHeld);
  const muted = useGame((s) => s.muted);
  const dispatch = useGame((s) => s.dispatch);
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const toggleLosMode = useGame((s) => s.toggleLosMode);
  const toggleMute = useGame((s) => s.toggleMute);
  const setShift = useGame((s) => s.setShift);
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const [savesOpen, setSavesOpen] = useState(false);

  // Hold Shift to preview LOS from the hovered hex; release to hide it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.repeat) setShift(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(false);
    };
    const blur = () => setShift(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [setShift]);

  if (!game) return <SetupScreen />;

  const cs = game.currentSide;
  const nation = game.players[cs].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');

  // v3 Stall (§2.8) is taken by a specific Unit: prefer the selected unit, else
  // the side's first Fresh unit. The reducer validates legality.
  const sel = selectedUnitId ? game.units[selectedUnitId] : null;
  const stallUnitId =
    sel && sel.side === cs
      ? sel.id
      : Object.values(game.units).find((u) => u.side === cs && u.status === 'fresh')?.id;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar__turn" data-side={cs}>
          <span className="topbar__dot" data-side={cs} />
          Round {game.round}/{game.roundsTotal} — Side {cs} · {nation}
          <em className="topbar__hint">
            {shiftHeld ? ' · LOS: hovered hex' : ' · hold Shift for LOS · Ctrl+click to pick a unit'}
          </em>
        </div>
        <div className="topbar__controls">
          <button onClick={() => dispatch({ type: 'PASS' })}>Pass</button>
          <button
            disabled={!stallUnitId}
            title="Stall (§2.8): a unit does nothing but makes a Spent Check and is Stressed"
            onClick={() => stallUnitId && dispatch({ type: 'STALL', unitId: stallUnitId })}
          >
            Stall
          </button>
          <button onClick={undo}>Undo</button>
          <button onClick={redo}>Redo</button>
          <button onClick={() => setSavesOpen(true)}>Saves</button>
          <button className={losMode ? 'on' : ''} onClick={toggleLosMode} title="Pin LOS by click (or hold Shift to hover)">
            LOS
          </button>
          <button onClick={toggleMute} title="toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
          <button onClick={newGame}>Restart</button>
          <button onClick={quitToMenu}>Menu</button>
        </div>
      </header>

      <aside className="left">
        <TrackSheet side="A" />
        <TrackSheet side="B" />
      </aside>

      <main className="center">
        <Board />
        <ActionChooser />
        <DiceRoller />
        <ConfirmDialog />
        <TurnBanner />
        <VictoryScreen />
        {savesOpen && <SavesDialog onClose={() => setSavesOpen(false)} />}
      </main>

      <aside className="right">
        <Inspector />
        <HoverPanel />
        <Log />
      </aside>
    </div>
  );
}
