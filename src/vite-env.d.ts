/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only override for the M13 online server's WebSocket URL — the Vite
   *  dev server (5173) and `tsx server/index.ts` (8787) are different
   *  origins locally; production serves both from one origin (same-origin
   *  default in src/net/client.ts). Set in `.env.local`, e.g.
   *  `VITE_WS_URL=ws://localhost:8787`. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
