/**
 * M13 online-play server: one Node process serves the built client (`dist/`)
 * over plain HTTP and relays game Actions over WebSocket. Room/turn logic
 * lives in `rooms.ts` (pure, unit-tested); this file is just the thin
 * transport layer wiring real sockets to it, per the M13 plan.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager, type Room } from './rooms';
import { serveStatic } from './staticServe';
import { missionById } from '../src/data/missions/catalog';
import type { ClientMsg, RoomCode, ServerMsg, SessionId } from '../src/net/protocol';
import type { SideId } from '../src/engine/types';
import { otherSide } from '../src/engine';

function peerConnectedFor(room: Room, side: SideId): boolean {
  return !!room.connected[otherSide(side)];
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const PRUNE_INTERVAL_MS = 10 * 60 * 1000; // sweep every 10 minutes
const ROOM_TIMEOUT_MS = 2 * 60 * 60 * 1000; // GC a room 2h after its last connected Side leaves

const rooms = new RoomManager();

interface SocketMeta {
  roomCode: RoomCode | null;
  sessionId: SessionId | null;
  side: SideId | null;
}

const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastState(roomCode: RoomCode, sockets: Set<WebSocket>): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  const msg: ServerMsg = { type: 'STATE', state: room.state };
  for (const ws of sockets) {
    const meta = socketMeta.get(ws);
    if (meta?.roomCode === roomCode) send(ws, msg);
  }
}

function broadcastPeerStatus(roomCode: RoomCode, side: SideId, connected: boolean, sockets: Set<WebSocket>): void {
  const msg: ServerMsg = { type: 'PEER_STATUS', side, connected };
  for (const ws of sockets) {
    const meta = socketMeta.get(ws);
    if (meta?.roomCode === roomCode && meta.side !== side) send(ws, msg);
  }
}

function startServer(): void {
  const httpServer = createServer((req: IncomingMessage, res) => {
    void serveStatic(DIST_DIR, req.url ?? '/', res);
  });
  const wss = new WebSocketServer({ server: httpServer });
  const sockets = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    sockets.add(ws);
    socketMeta.set(ws, { roomCode: null, sessionId: null, side: null });

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'ERROR', message: 'Malformed message.' });
        return;
      }

      if (msg.type === 'CREATE') {
        const mission = missionById(msg.missionId);
        if (!mission) {
          send(ws, { type: 'ERROR', message: `Unknown Mission "${msg.missionId}".` });
          return;
        }
        const result = rooms.create(mission, msg.sessionId);
        if (!result.ok) {
          send(ws, { type: 'ERROR', message: result.error });
          return;
        }
        socketMeta.set(ws, { roomCode: result.room.code, sessionId: msg.sessionId, side: result.side });
        send(ws, {
          type: 'JOINED',
          roomCode: result.room.code,
          side: result.side,
          state: result.room.state,
          peerConnected: peerConnectedFor(result.room, result.side),
        });
        return;
      }

      if (msg.type === 'JOIN') {
        const result = rooms.join(msg.roomCode, msg.sessionId);
        if (!result.ok) {
          send(ws, { type: 'ERROR', message: result.error });
          return;
        }
        socketMeta.set(ws, { roomCode: result.room.code, sessionId: msg.sessionId, side: result.side });
        send(ws, {
          type: 'JOINED',
          roomCode: result.room.code,
          side: result.side,
          state: result.room.state,
          peerConnected: peerConnectedFor(result.room, result.side),
        });
        broadcastPeerStatus(result.room.code, result.side, true, sockets);
        return;
      }

      if (msg.type === 'ACTION') {
        const result = rooms.applyAction(msg.roomCode, msg.sessionId, msg.action);
        if (!result.ok) {
          send(ws, { type: 'ERROR', message: result.error });
          return;
        }
        // Broadcast the canonical state regardless of whether reduce()
        // itself accepted the Action (an internally-"illegal" Action just
        // re-broadcasts the unchanged state) — self-healing for any client
        // whose local optimistic guess ever drifts (M13 plan).
        broadcastState(msg.roomCode, sockets);
        return;
      }
    });

    ws.on('close', () => {
      sockets.delete(ws);
      const meta = socketMeta.get(ws);
      if (meta?.roomCode && meta.side) {
        rooms.setConnected(meta.roomCode, meta.side, false);
        broadcastPeerStatus(meta.roomCode, meta.side, false, sockets);
      }
    });
  });

  setInterval(() => rooms.prune(Date.now(), ROOM_TIMEOUT_MS), PRUNE_INTERVAL_MS);

  httpServer.listen(PORT, () => {
    console.log(`Conflict of Heroes online server listening on :${PORT}`);
  });
}

startServer();
