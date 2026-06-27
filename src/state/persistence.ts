/**
 * Persistence (M4): autosave + named save slots in localStorage, plus a shape
 * check used when importing a save from a file. The full GameState is plain
 * JSON (CLAUDE.md §3), so saving is just stringify/parse — RNG state travels
 * with it, so loads reproduce dice exactly.
 */
import type { GameState } from '../engine/types';

const AUTOSAVE_KEY = 'coh:autosave:v1';
const SLOTS_INDEX_KEY = 'coh:slots:v1';
const slotKey = (name: string) => `coh:slot:v1:${name}`;

// --- autosave ---------------------------------------------------------------

export function saveAuto(state: GameState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable / quota — ignore */
  }
}

export function loadAuto(): GameState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function clearAuto(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAuto(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) != null;
  } catch {
    return false;
  }
}

// --- named slots ------------------------------------------------------------

export interface SlotMeta {
  name: string;
  savedAt: string; // ISO timestamp
  round: number;
  roundsTotal: number;
  firefightId: string;
  phase: string;
}

function readIndex(): SlotMeta[] {
  try {
    const raw = localStorage.getItem(SLOTS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as SlotMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SlotMeta[]): void {
  try {
    localStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Slots, most recently saved first. */
export function listSlots(): SlotMeta[] {
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveSlot(name: string, state: GameState): SlotMeta | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const meta: SlotMeta = {
    name: trimmed,
    savedAt: new Date().toISOString(),
    round: state.round,
    roundsTotal: state.roundsTotal,
    firefightId: state.firefightId,
    phase: state.phase,
  };
  try {
    localStorage.setItem(slotKey(trimmed), JSON.stringify(state));
  } catch {
    return null;
  }
  writeIndex([...readIndex().filter((m) => m.name !== trimmed), meta]);
  return meta;
}

export function loadSlot(name: string): GameState | null {
  try {
    const raw = localStorage.getItem(slotKey(name));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function deleteSlot(name: string): void {
  try {
    localStorage.removeItem(slotKey(name));
  } catch {
    /* ignore */
  }
  writeIndex(readIndex().filter((m) => m.name !== name));
}

// --- import validation ------------------------------------------------------

/** Minimal structural check so a bad/foreign file can't corrupt the app. */
export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const g = value as Partial<GameState>;
  return (
    typeof g.round === 'number' &&
    typeof g.phase === 'string' &&
    !!g.players &&
    !!(g.players as Record<string, unknown>).A &&
    !!(g.players as Record<string, unknown>).B &&
    !!g.units &&
    !!g.hexes &&
    !!g.rng
  );
}
