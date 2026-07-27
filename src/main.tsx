import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useGame } from './state/store';
import * as engine from './engine';
import './styles.css';

// Dev-only console/automation hook — never ships in a production build
// (import.meta.env.DEV is statically false there, so bundlers dead-code-strip
// this whole block). Lets a live game be driven by dispatching real engine
// Actions directly (window.__gameStore.getState().move(id, hex), .dispatch(...),
// etc.) instead of simulating UI clicks — the store's own action methods
// already are the single source of truth the UI itself calls. `window.__engine`
// exposes the same pure functions (legalActionsForUnit, attackContext, ...) so
// legality can be checked in-browser too, with no file export/download needed.
if (import.meta.env.DEV) {
  (window as unknown as { __gameStore: typeof useGame }).__gameStore = useGame;
  (window as unknown as { __engine: typeof engine }).__engine = engine;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
