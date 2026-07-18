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
import { ARMOR_SANDBOX } from '../../data/missions/sandbox';
import { templateOf } from '../../engine';

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
    const html = render();
    expect(html).toContain('Missions');
    expect(html).toContain('Mission 1');
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
    // Mission 1's German platoon starts as a Round-1 reinforcement (no on-map
    // Units yet, §4.12) — use the Armor Sandbox, which has both sides on-map
    // from the start, to exercise the Inspector's per-unit action rendering.
    useGame.getState().newGame(ARMOR_SANDBOX);
    const g = useGame.getState().game!;
    const own = Object.values(g.units).find((u) => u.side === g.currentSide)!;
    useGame.getState().select(own.id);
    const html = render();
    // Inspector's header no longer prints the raw unit id or a "Spent Check"
    // note (both lived in a paragraph that's since been removed) — assert on
    // the unit's name (still the header) and its Move action prompt instead.
    expect(html).toContain(templateOf(g, own).name);
    expect(html).toContain('Move:');
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
    // v3: the winner is the VP-Advantage holder (positive marker = Side A).
    const finished = { ...useGame.getState().game!, phase: 'gameOver' as const, vpMarker: 3 };
    useGame.setState({ game: finished });
    expect(render()).toContain('Germans win!'); // Mission 1's Side A nation — no bare "Side A" text
  });

  it('renders a mapOverlays image as real gameplay art, replacing per-hex tiles', () => {
    useGame.getState().newGame();
    const game = useGame.getState().game!;
    const mapNumber = Object.values(game.hexes).find((h) => h.mapNumber != null)!.mapNumber!;
    const overlayUrl = 'data:image/png;base64,FAKEOVERLAYDATA';
    useGame.setState({ game: { ...game, mapOverlays: { [mapNumber]: overlayUrl } } });
    const html = render();
    expect(html).toContain(overlayUrl);
    // Mission 1 is one single board (every hex shares mapNumber 1), so
    // covering it with an overlay replaces per-hex terrain tiles entirely —
    // no `/assets/terrain/` tile art should remain.
    expect(html).not.toContain('/assets/terrain/');
  });

  it('shows the under-cursor hover panel with terrain of the hovered hex', () => {
    useGame.getState().newGame();
    const someHex = Object.keys(useGame.getState().game!.hexes)[0]!;
    useGame.setState({ hover: { id: someHex, x: 0, y: 0 } });
    const html = render();
    expect(html).toContain('Terrain in Hex');
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
