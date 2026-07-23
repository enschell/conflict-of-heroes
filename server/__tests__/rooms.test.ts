import { describe, expect, it } from 'vitest';
import { RoomManager } from '../rooms';
import { HILLS_SANDBOX } from '../../src/data/missions/hillsSandbox';
import { idOf, neighbors, parseHexId } from '../../src/engine';

/** Deterministic room codes/seeds for tests — real games use Math.random(). */
function testManager() {
  let n = 0;
  return new RoomManager({ genCode: () => `CODE${++n}`, genSeed: () => 12345 });
}

describe('RoomManager.create', () => {
  it('creates a room, assigns the creator Side A, and inits real GameState', () => {
    const mgr = testManager();
    const res = mgr.create(HILLS_SANDBOX, 'sess-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.side).toBe('A');
    expect(res.room.sides.A).toBe('sess-1');
    expect(res.room.sides.B).toBeUndefined();
    expect(res.room.state.currentSide).toBe('A');
    expect(res.room.state.missionId).toBe(HILLS_SANDBOX.id);
  });
});

describe('RoomManager.join', () => {
  it('assigns a fresh session the open Side B seat', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    const res = mgr.join(created.room.code, 'sess-2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.side).toBe('B');
    expect(res.room.sides.B).toBe('sess-2');
  });

  it('rejects a third distinct session once both seats are taken', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    mgr.join(created.room.code, 'sess-2');
    const res = mgr.join(created.room.code, 'sess-3');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/full/i);
  });

  it('reconnect: the same sessionId re-joining gets its existing Side back, not a new seat', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    mgr.join(created.room.code, 'sess-2');
    mgr.setConnected(created.room.code, 'A', false); // sess-1 "disconnected"
    const res = mgr.join(created.room.code, 'sess-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.side).toBe('A');
    expect(res.room.sides.A).toBe('sess-1');
    expect(res.room.sides.B).toBe('sess-2'); // untouched
    expect(res.room.connected.A).toBe(true); // marked reconnected
  });

  it('rejects an unknown room code', () => {
    const mgr = testManager();
    const res = mgr.join('NOPE', 'sess-1');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });
});

describe('RoomManager.applyAction', () => {
  it("advances the room's GameState via the real engine reduce()", () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    mgr.join(created.room.code, 'sess-2');
    expect(created.room.state.currentSide).toBe('A');
    const before = created.room.state; // `room` is a live mutable object — snapshot first
    const res = mgr.applyAction(created.room.code, 'sess-1', { type: 'PASS' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // PASS flips currentSide via the same turn logic hotseat already
    // exercises — just confirm the room's state actually changed (proves
    // reduce() really ran), not the specific rule.
    expect(res.room.state).not.toBe(before);
    expect(res.room.state.log.length).toBeGreaterThan(before.log.length);
  });

  it("rejects an action from the side that isn't currentSide", () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    mgr.join(created.room.code, 'sess-2');
    const before = created.room.state;
    const res = mgr.applyAction(created.room.code, 'sess-2', { type: 'PASS' }); // B, but A goes first
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/turn/i);
    expect(created.room.state).toBe(before); // untouched
  });

  it('rejects an action from a sessionId that never joined the room', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    const res = mgr.applyAction(created.room.code, 'stranger', { type: 'PASS' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not a player/i);
  });

  it('rejects an action for an unknown room', () => {
    const mgr = testManager();
    const res = mgr.applyAction('NOPE', 'sess-1', { type: 'PASS' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });

  it('CHOOSE_FACING bypasses the Turn gate (§4.5/§15.11) but still requires owning the Unit', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    mgr.join(created.room.code, 'sess-2');

    const unit = Object.values(created.room.state.units).find((u) => u.side === 'A')!;
    const candidates = neighbors(parseHexId(unit.hexId)).map(idOf);
    let moveRes;
    for (const toHexId of candidates) {
      if (!created.room.state.hexes[toHexId]) continue;
      moveRes = mgr.applyAction(created.room.code, 'sess-1', { type: 'MOVE', unitId: unit.id, toHexId });
      if (moveRes.ok) break;
    }
    if (!moveRes?.ok) throw new Error('setup failed: no legal Move found for the test Unit');

    // The Move already handed the Turn to Side B...
    expect(moveRes.room.state.currentSide).toBe('B');
    // ...but the mover's free facing-correction window is still open.
    expect(moveRes.room.state.pendingFacingChoices).toContain(unit.id);

    // Side B (not the Unit's owner) may not use A's still-open window.
    const wrongOwner = mgr.applyAction(created.room.code, 'sess-2', {
      type: 'CHOOSE_FACING',
      unitId: unit.id,
      facing: 2,
    });
    expect(wrongOwner.ok).toBe(false);
    if (wrongOwner.ok) return;
    expect(wrongOwner.error).toMatch(/not yours/i);

    // Side A (the actual owner) CAN — even though it's now Side B's Turn.
    // This is the exact bug caught live: a blanket Turn gate blocked this.
    const rightOwner = mgr.applyAction(created.room.code, 'sess-1', {
      type: 'CHOOSE_FACING',
      unitId: unit.id,
      facing: 2,
    });
    expect(rightOwner.ok).toBe(true);
    if (!rightOwner.ok) return;
    expect(rightOwner.room.state.units[unit.id]!.facing).toBe(2);
    expect(rightOwner.room.state.pendingFacingChoices).not.toContain(unit.id);
  });
});

describe('RoomManager.prune', () => {
  it('removes a room only once every Side has been disconnected past the timeout', () => {
    const mgr = testManager();
    const created = mgr.create(HILLS_SANDBOX, 'sess-1');
    if (!created.ok) throw new Error('setup failed');
    const code = created.room.code;

    // Still connected (Side A never disconnected) — never pruned regardless of time.
    expect(mgr.prune(Date.now() + 10_000_000, 1000)).toEqual([]);
    expect(mgr.get(code)).toBeDefined();

    mgr.setConnected(code, 'A', false);
    // Disconnected, but within the timeout window.
    expect(mgr.prune(Date.now() + 500, 1000)).toEqual([]);
    expect(mgr.get(code)).toBeDefined();

    // Disconnected and past the timeout.
    expect(mgr.prune(Date.now() + 10_000, 1000)).toEqual([code]);
    expect(mgr.get(code)).toBeUndefined();
  });
});
