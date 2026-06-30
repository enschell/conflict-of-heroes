// @vitest-environment jsdom
/**
 * Smoke test: the whole UI tree renders in a real DOM without throwing (catches
 * runtime undefined-access bugs that typecheck/build can't). Uses react-dom
 * client rendering under jsdom, so zustand reads live state and localStorage
 * (autosave) exists.
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { SavesDialog } from '../SavesDialog';
import { useGame } from '../../state/store';

function render(): string {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => root.render(<App />));
  const html = el.innerHTML;
  root.unmount();
  el.remove();
  return html;
}

afterEach(() => {
  useGame.setState({
    game: null,
    selectedUnitId: null,
    pendingRoll: null,
    pendingConfirm: null,
    turnBanner: null,
    picker: null,
    hover: null,
    shiftHeld: false,
    losMode: false,
  });
});

describe('UI renders', () => {
  it('shows the setup screen before a game starts', () => {
    useGame.setState({ game: null });
    expect(render()).toContain('Start Firefight 1');
  });

  it('renders the board + panels in-game', () => {
    useGame.getState().newGame();
    const html = render();
    expect(html).toContain('Round 1/5');
    expect(html).toContain('Side A');
    expect(html).toContain('<svg'); // the SVG hex board
    expect(html).toContain('/assets/terrain/'); // hex artwork is mapped in
    expect(html).toContain('No unit selected');
  });

  it('renders the inspector with actions for a selected unit', () => {
    useGame.getState().newGame();
    const g = useGame.getState().game!;
    const own = Object.values(g.units).find((u) => u.side === g.currentSide)!;
    useGame.getState().select(own.id);
    const html = render();
    expect(html).toContain(own.id);
    expect(html).toContain('Spent Check'); // v3 inspector note (no more Activate)
  });

  it('renders the dice modal when a roll is pending', () => {
    useGame.getState().newGame();
    useGame.setState({
      pendingRoll: {
        action: { type: 'PASS' },
        kind: 'fire',
        steps: [
          {
            dice: [3, 4],
            success: true,
            headline: 'HIT',
            detail: 'AR 6 vs DR 12 — 2d6 ≥ 6',
            label: 'test roll',
          },
        ],
      },
    });
    const html = render();
    expect(html).toContain('Roll dice');
    expect(html).toContain('test roll');
  });

  it('renders the victory overlay at game over', () => {
    useGame.getState().newGame();
    const finished = { ...useGame.getState().game!, phase: 'gameOver' as const, winner: 'A' as const };
    useGame.setState({ game: finished });
    expect(render()).toContain('Side A wins');
  });

  it('shows the under-cursor hover panel with terrain of the hovered hex', () => {
    useGame.getState().newGame();
    const someHex = Object.keys(useGame.getState().game!.hexes)[0]!;
    useGame.setState({ hover: { id: someHex, x: 0, y: 0 } });
    const html = render();
    expect(html).toContain('Under cursor');
    expect(html).toContain(someHex);
  });

  it('shows the "Start of turn N" banner', () => {
    useGame.getState().newGame();
    useGame.setState({ turnBanner: { round: 3 } });
    expect(render()).toContain('Start of turn 3');
  });

  it('shows the opportunity-action confirm dialog', () => {
    useGame.getState().newGame();
    useGame.setState({ pendingConfirm: { message: 'opportunity-confirm-test', proceed: () => {} } });
    expect(render()).toContain('opportunity-confirm-test');
  });

  it('renders the saves dialog', () => {
    useGame.getState().newGame();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    flushSync(() => root.render(<SavesDialog onClose={() => {}} />));
    const html = el.innerHTML;
    root.unmount();
    el.remove();
    expect(html).toContain('Saves');
    expect(html).toContain('Export to file');
  });
});
