/**
 * Top-level layout: setup screen, then the board flanked by track sheets and
 * the inspector / under-cursor / log panels, with global turn controls and the
 * dice / confirm / turn-banner / victory overlays. All state lives in the
 * Zustand store; this component only reads it and fires intents.
 */
import { useEffect, useState } from 'react';
import { useGame } from './state/store';
import { NATIONS } from './data/nations';
import { otherSide } from './engine';
import { ActionChooser } from './ui/ActionChooser';
import { Board } from './ui/Board';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SavesDialog } from './ui/SavesDialog';
import { DiceRoller } from './ui/DiceRoller';
import { GroupPanel } from './ui/GroupPanel';
import { HoverPanel } from './ui/HoverPanel';
import { Inspector } from './ui/Inspector';
import { Log } from './ui/Log';
import { MinesConfirm } from './ui/MinesConfirm';
import { MissionEditor } from './ui/editor/MissionEditor';
import { MapEditor } from './ui/mapEditor/MapEditor';
import { OnlineLobby } from './ui/OnlineLobby';
import { ReinforcementsPanel } from './ui/ReinforcementsPanel';
import { SetupPanel } from './ui/SetupPanel';
import { SetupScreen } from './ui/SetupScreen';
import { TrackSheet } from './ui/TrackSheet';
import { TurnBanner } from './ui/TurnBanner';
import { TurnFlash } from './ui/TurnFlash';
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
  const groupMode = useGame((s) => s.groupMode);
  const toggleGroupMode = useGame((s) => s.toggleGroupMode);
  const toggleMute = useGame((s) => s.toggleMute);
  const setShift = useGame((s) => s.setShift);
  const togglePivotPicker = useGame((s) => s.togglePivotPicker);
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const mode = useGame((s) => s.mode);
  const mySide = useGame((s) => s.mySide);
  const roomCode = useGame((s) => s.roomCode);
  const peerConnected = useGame((s) => s.peerConnected);
  const leaveOnlineRoom = useGame((s) => s.leaveOnlineRoom);
  const screen = useGame((s) => s.screen);
  const closeMissionEditor = useGame((s) => s.closeMissionEditor);
  const closeMapEditor = useGame((s) => s.closeMapEditor);
  const [savesOpen, setSavesOpen] = useState(false);

  // Hold Shift to preview LOS from the hovered hex; release to hide it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.repeat) setShift(true);
      // 'P' with a unit selected: pivot picker (§4.6) — highlights the six
      // neighbor Hexes on the board, click one to pivot toward it.
      if (
        (e.key === 'p' || e.key === 'P') &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        togglePivotPicker();
      }
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
  }, [setShift, togglePivotPicker]);

  if (screen === 'editor') return <MissionEditor onExit={closeMissionEditor} />;
  if (screen === 'mapEditor') return <MapEditor onExit={closeMapEditor} />;

  // M13: still connecting (or the server rejected create/join) — a distinct
  // screen from the normal hotseat menu, not just a blank board.
  if (mode === 'online' && !game) return <OnlineLobby />;
  if (!game) return <SetupScreen />;

  const cs = game.currentSide;
  const nationNameFor = (side: typeof cs) =>
    game.players[side].nations.map((n) => NATIONS[n]?.name ?? n).join(', ');
  const nation = nationNameFor(cs);

  // v3 Stall (§2.8) is taken by a specific Fresh Unit: prefer the selected one,
  // else the side's first Fresh unit. (A Spent unit would need an explicit CAP
  // spend, which goes through the per-unit confirm flow, not this button.)
  const sel = selectedUnitId ? game.units[selectedUnitId] : null;
  const stallUnitId =
    sel && sel.side === cs && sel.status === 'fresh'
      ? sel.id
      : Object.values(game.units).find((u) => u.side === cs && u.status === 'fresh')?.id;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar__turn" data-side={cs}>
          <span className="topbar__dot" data-side={game.phase === 'setup' ? game.setupSide : cs} />
          {game.phase === 'setup' ? (
            <>Pre-Mission Setup — Side {game.setupSide} ({nationNameFor(game.setupSide!)}) places its forces</>
          ) : (
            <>
              Round {game.round}/{game.roundsTotal} — Side {cs} · {nation}
              <em className="topbar__hint">
                {shiftHeld ? ' · LOS: hovered hex' : ' · hold Shift for LOS · Ctrl+click to pick a unit'}
              </em>
            </>
          )}
        </div>
        {/* M13, functional-minimum placeholder — see CLAUDE.md's M13 plan. A
            real visual design may replace this later. */}
        {mode === 'online' && (
          <div className="online-bar">
            You are the {mySide ? nationNameFor(mySide) : '…'}
            {peerConnected
              ? ' · opponent connected'
              : ` · waiting for the ${nationNameFor(otherSide(mySide ?? cs))} to join — room code ${roomCode}`}
            <button onClick={leaveOnlineRoom}>Leave</button>
          </div>
        )}
        <div className="topbar__controls">
          {game.phase !== 'setup' && (
            <>
              <button onClick={() => dispatch({ type: 'PASS' })}>Pass</button>
              <button
                disabled={!stallUnitId}
                title="Stall (§2.8): a unit does nothing but makes a Spent Check and is Stressed"
                onClick={() => stallUnitId && dispatch({ type: 'STALL', unitId: stallUnitId })}
              >
                Stall
              </button>
              {mode !== 'online' && (
                <>
                  <button onClick={undo}>Undo</button>
                  <button onClick={redo}>Redo</button>
                </>
              )}
            </>
          )}
          <button onClick={() => setSavesOpen(true)}>Saves</button>
          <button className={losMode ? 'on' : ''} onClick={toggleLosMode} title="Pin LOS by click (or hold Shift to hover)">
            LOS
          </button>
          {game.phase !== 'setup' && (
            <button className={groupMode ? 'on' : ''} onClick={toggleGroupMode} title="Group Actions (§10): click your Fresh units to build a Group">
              Group
            </button>
          )}
          <button onClick={toggleMute} title="toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
          <button onClick={() => newGame()}>Restart</button>
          <button onClick={quitToMenu}>Menu</button>
        </div>
      </header>

      <aside className="left">
        <TrackSheet side="A" />
        <ReinforcementsPanel side="A" />
        <TrackSheet side="B" />
        <ReinforcementsPanel side="B" />
      </aside>

      <main className="center">
        <div className="board-frame">
          <Board />
          <TurnFlash />
        </div>
        <ActionChooser />
        <DiceRoller />
        <ConfirmDialog />
        <MinesConfirm />
        <TurnBanner />
        <VictoryScreen />
        {savesOpen && <SavesDialog onClose={() => setSavesOpen(false)} />}
      </main>

      <aside className="right">
        {game.phase === 'setup' ? <SetupPanel /> : groupMode ? <GroupPanel /> : <Inspector />}
        <HoverPanel />
        <Log />
      </aside>
    </div>
  );
}
