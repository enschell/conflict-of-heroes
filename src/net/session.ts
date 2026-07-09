/**
 * Opaque per-browser SessionId (M13) — persisted in localStorage so a
 * reconnecting tab (refresh, dropped connection) rejoins the same seat in a
 * room instead of being treated as a third player. Not tied to any account;
 * a real auth layer could replace/augment this later without changing the
 * room/message protocol (see src/net/protocol.ts).
 */
const KEY = 'coh:sessionId:v1';

export function getSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
