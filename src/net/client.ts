/**
 * Thin browser WebSocket wrapper for M13 online play. Pure transport — no
 * game logic here at all; `src/state/store.ts` owns what to do with a
 * `ServerMsg` once it arrives. Reconnects with backoff on an unexpected
 * close (e.g. a dropped connection), but never reconnects after `close()` is
 * called deliberately (leaving a room).
 */
import type { ClientMsg, ServerMsg } from './protocol';

/** Same-origin in production (one Render service serves client + WS); in
 *  dev, the Vite dev server (5173) and `tsx server/index.ts` (8787) are two
 *  different origins, so `VITE_WS_URL` (e.g. in `.env.local`) can override. */
function defaultWsUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined;
  if (override) return override;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

const MAX_BACKOFF_MS = 8000;

export class NetClient {
  private ws: WebSocket | null = null;
  private manuallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private messageHandler: ((msg: ServerMsg) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(private url: string = defaultWsUrl()) {}

  connect(): void {
    this.manuallyClosed = false;
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.openHandler?.();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMsg;
        this.messageHandler?.(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.closeHandler?.();
      if (this.manuallyClosed) return;
      const delay = Math.min(500 * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onMessage(cb: (msg: ServerMsg) => void): void {
    this.messageHandler = cb;
  }

  onOpen(cb: () => void): void {
    this.openHandler = cb;
  }

  onClose(cb: () => void): void {
    this.closeHandler = cb;
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
