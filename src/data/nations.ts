/**
 * Nation registry (rulebook §1.1; CLAUDE.md "multi-nation" requirement).
 *
 * A *side* (A/B) is the unit of turn-taking; a side fields one or more *nations*.
 * Nations are pure data so the series' later armies (US, British, French,
 * Japanese) can be added here without touching engine code. Colors are for the
 * future SVG UI counters — our own scheme, not Academy Games' artwork.
 */
import type { NationId } from '../engine/types';

export interface NationDef {
  id: NationId;
  name: string;
  /** Primary counter fill (CSS color). */
  color: string;
  /** Darker accent for borders/text. */
  accent: string;
}

export const NATIONS: Record<NationId, NationDef> = {
  germans: { id: 'germans', name: 'Germans', color: '#5b6470', accent: '#23272e' },
  soviets: { id: 'soviets', name: 'Soviets', color: '#9b2c2c', accent: '#5e1a1a' },
};

export function nationDef(id: NationId): NationDef | undefined {
  return NATIONS[id];
}
