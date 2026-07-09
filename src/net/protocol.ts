/**
 * Shared WebSocket message protocol between the browser client
 * (`src/net/client.ts`, `src/state/store.ts`) and the Node server
 * (`server/index.ts`, `server/rooms.ts`) — same TS source imported by both,
 * so the two sides can never silently drift out of sync on message shape.
 *
 * `GameState` is the only game data that ever crosses the wire (M13 plan,
 * CLAUDE.md §3): it's already 100% JSON-serializable and carries its own
 * seeded RNG, so a client just replaces its local `game` with whatever
 * `STATE` delivers — no separate diff/patch protocol needed.
 */
import type { Action, GameState, SideId } from '../engine/types';

/** Opaque per-browser identifier (crypto-random, stored in localStorage) —
 *  lets a reconnecting tab rejoin the seat it already held in a room. Not
 *  tied to any account; a real auth layer could replace/augment this later
 *  without changing the rest of the protocol. */
export type SessionId = string;
export type RoomCode = string;

export type ClientMsg =
  | { type: 'CREATE'; missionId: string; sessionId: SessionId }
  | { type: 'JOIN'; roomCode: RoomCode; sessionId: SessionId }
  | { type: 'ACTION'; roomCode: RoomCode; sessionId: SessionId; action: Action };

export type ServerMsg =
  | { type: 'JOINED'; roomCode: RoomCode; side: SideId; state: GameState; peerConnected: boolean }
  | { type: 'STATE'; state: GameState }
  | { type: 'PEER_STATUS'; side: SideId; connected: boolean }
  | { type: 'ERROR'; message: string };
