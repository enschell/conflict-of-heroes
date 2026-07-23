/**
 * Pure room-management logic for M13 online play — no WebSocket objects in
 * here, so it's unit-testable without real sockets (see __tests__/rooms.test.ts).
 * `server/index.ts` is the thin layer that wires this to actual connections.
 *
 * A Room just wraps a `GameState` (the exact same one `src/engine` produces
 * for hotseat) plus which SessionId currently occupies each Side and whether
 * that Side's socket is currently live. Reconnect is "the same sessionId
 * asks to JOIN a room it already occupies a Side in" — idempotent, no new
 * seat assigned.
 */
import { initGame, reduce } from '../src/engine';
import type { Action, GameEvent, GameState, MissionDef, SideId } from '../src/engine/types';
import type { RoomCode, SessionId } from '../src/net/protocol';

export interface Room {
  code: RoomCode;
  state: GameState;
  /** SessionId currently holding each Side (undefined = open seat). */
  sides: Partial<Record<SideId, SessionId>>;
  /** Whether that Side's socket is currently connected (for PEER_STATUS). */
  connected: Partial<Record<SideId, boolean>>;
  lastActivity: number;
}

const SIDES: SideId[] = ['A', 'B'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids code ambiguity read aloud/typed

function defaultCode(): RoomCode {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** A fresh RNG seed per real online game — reusing a Mission's own hardcoded
 *  test seed (e.g. Mission 1's, used by conformance/demo scripts) would
 *  replay identical dice every game (§B/M13 plan). */
function defaultSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export type CreateResult = { ok: true; room: Room; side: SideId } | { ok: false; error: string };
export type JoinResult = { ok: true; room: Room; side: SideId } | { ok: false; error: string };
export type ActionResult =
  | { ok: true; room: Room; events: GameEvent[] }
  | { ok: false; error: string };

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();

  constructor(
    private opts: { genCode?: () => string; genSeed?: () => number } = {},
  ) {}

  get(code: RoomCode): Room | undefined {
    return this.rooms.get(code);
  }

  create(mission: MissionDef, sessionId: SessionId): CreateResult {
    const genCode = this.opts.genCode ?? defaultCode;
    const genSeed = this.opts.genSeed ?? defaultSeed;
    let code = genCode();
    // Astronomically unlikely, but never silently collide an existing room.
    while (this.rooms.has(code)) code = genCode();
    const room: Room = {
      code,
      state: initGame({ ...mission, seed: genSeed() }),
      sides: { A: sessionId },
      connected: { A: true },
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    return { ok: true, room, side: 'A' };
  }

  join(code: RoomCode, sessionId: SessionId): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: `Room "${code}" not found.` };

    // Reconnect: this session already holds a seat here.
    const existing = SIDES.find((s) => room.sides[s] === sessionId);
    if (existing) {
      room.connected[existing] = true;
      room.lastActivity = Date.now();
      return { ok: true, room, side: existing };
    }

    // Fresh join: take the first open seat.
    const open = SIDES.find((s) => !room.sides[s]);
    if (!open) return { ok: false, error: 'Room is full.' };
    room.sides[open] = sessionId;
    room.connected[open] = true;
    room.lastActivity = Date.now();
    return { ok: true, room, side: open };
  }

  /** Mark a Side's socket connected/disconnected — the Room and its GameState
   *  survive a disconnect untouched, so a later `join()` with the same
   *  sessionId resumes exactly where the game was left. */
  setConnected(code: RoomCode, side: SideId, connected: boolean): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.connected[side] = connected;
    room.lastActivity = Date.now();
  }

  sideOf(code: RoomCode, sessionId: SessionId): SideId | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    return SIDES.find((s) => room.sides[s] === sessionId);
  }

  applyAction(code: RoomCode, sessionId: SessionId, action: Action): ActionResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: `Room "${code}" not found.` };
    const side = SIDES.find((s) => room.sides[s] === sessionId);
    if (!side) return { ok: false, error: 'You are not a player in this room.' };
    // CHOOSE_FACING (§4.5/§15.11's free facing correction) is exempt from
    // the Turn gate below — it's deliberately turn-agnostic (a normal Action
    // always hands the Turn to the other side *before* that window opens),
    // and `reduce()`'s own `doChooseFacing` has no `currentSide` check
    // either. Gating it the same as every other Action here made it
    // undispatchable online (caught live). Every OTHER Action type still
    // needs a real Turn check server-side, even though `reduce()` also
    // checks `unit.side !== currentSide` internally for most of them,
    // because `PASS` has no unit/side field at all (`{ type: 'PASS' }`) —
    // `reduce()` has no caller identity to self-defend it with; skipping
    // this gate entirely would let either side trigger the *other* side's
    // Pass. `doChooseFacing` itself also never checks `unit.side` (only
    // that the Unit is in `pendingFacingChoices`), so it gets its own
    // Unit-ownership check instead of the Turn one — otherwise a client
    // could reface the OTHER side's still-open correction window. See
    // `src/state/store.ts`'s `dispatch` for the client-side half of this
    // same fix.
    if (action.type === 'CHOOSE_FACING') {
      if (room.state.units[action.unitId]?.side !== side) {
        return { ok: false, error: 'That Unit is not yours.' };
      }
    } else if (side !== room.state.currentSide) {
      return { ok: false, error: "It isn't your turn." };
    }
    const result = reduce(room.state, action);
    room.state = result.state;
    room.lastActivity = Date.now();
    return { ok: true, room, events: result.events };
  }

  /** GC rooms with no connected Side for longer than `timeoutMs`. Returns the
   *  removed room codes (so callers can e.g. log it). Cheap O(n) sweep, meant
   *  to be called on an interval, not per-message. */
  prune(now: number, timeoutMs: number): RoomCode[] {
    const removed: RoomCode[] = [];
    for (const [code, room] of this.rooms) {
      const anyConnected = SIDES.some((s) => room.connected[s]);
      if (!anyConnected && now - room.lastActivity > timeoutMs) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
