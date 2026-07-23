import { describe, expect, it } from 'vitest';
import { MISSION_1 } from '../missions/mission1';
import { MISSION1_MAP, hexIdForLabel } from '../maps/mission1';
import { initGame, legalActions, reduce } from '../../engine';
import type { Action, GameState } from '../../engine/types';

const mapIds = new Set(MISSION1_MAP.map((h) => h.id));

describe('Mission 1 — Partisans (setup)', () => {
  it('uses the real Map 1 board and the v3 mission parameters', () => {
    expect(MISSION_1.hexes).toBe(MISSION1_MAP);
    expect(MISSION_1.roundsTotal).toBe(5);
    expect(MISSION_1.caps).toEqual({ A: 6, B: 7 });
    expect(MISSION_1.firstInitiative).toBe('A'); // German Round-1 initiative
    expect(MISSION_1.startVp).toEqual({ B: 1 }); // Soviets begin with 1 VP
    expect(MISSION_1.vpPerKill).toBe(1); // flat 1 VP per kill
  });

  it('scores the single objective I06 at 1 VP', () => {
    expect(MISSION_1.victoryHexes).toEqual([{ hexId: hexIdForLabel('I06'), vp: 1 }]);
  });

  it('places all units on valid map hexes with known templates', () => {
    const ids = MISSION_1.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    for (const u of MISSION_1.units) {
      expect(mapIds.has(u.hexId)).toBe(true);
      expect(MISSION_1.templates.some((t) => t.id === u.templateId)).toBe(true);
    }
    // German platoon starts entirely as a Round-1 reinforcement (§4.12); only
    // the Soviet partisan setup (Maxim support) is pre-placed at game start.
    expect(MISSION_1.units.filter((u) => u.side === 'A')).toHaveLength(0);
    expect(MISSION_1.units.filter((u) => u.side === 'B')).toHaveLength(4);
  });

  it('is a no-card teaching mission', () => {
    expect('deck' in MISSION_1).toBe(false);
    expect('cards' in MISSION_1).toBe(false);
  });

  it('defines the three reinforcement waves (§4.12) with unique ids and known templates', () => {
    const waves = MISSION_1.reinforcements ?? [];
    expect(waves.map((w) => w.id).sort()).toEqual(
      ['ger-r1-platoon', 'ger-r3-ss-tracker', 'sov-r2-reinforcements'].sort(),
    );
    const allUnitIds = waves.flatMap((w) => w.units.map((u) => u.id));
    expect(new Set(allUnitIds).size).toBe(allUnitIds.length); // unique across waves
    expect(new Set(allUnitIds).size + MISSION_1.units.length).toBe(
      new Set([...allUnitIds, ...MISSION_1.units.map((u) => u.id)]).size,
    ); // no collision with pre-placed unit ids
    for (const w of waves) {
      expect(w.entryHexIds.length).toBeGreaterThan(0);
      for (const h of w.entryHexIds) expect(mapIds.has(h)).toBe(true);
      for (const u of w.units) expect(MISSION_1.templates.some((t) => t.id === u.templateId)).toBe(true);
    }
  });

  it('matches the redesigned setup: German R1 platoon (2 Rifles + 2 MG34) via B01-B12 (column A is entirely half/quarter-hexes)', () => {
    const wave = MISSION_1.reinforcements!.find((w) => w.id === 'ger-r1-platoon')!;
    expect(wave.side).toBe('A');
    expect(wave.earliestRound).toBe(1);
    expect(wave.entryHexIds).toEqual(
      Array.from({ length: 12 }, (_, i) => hexIdForLabel(`B${String(i + 1).padStart(2, '0')}`)),
    );
    // Every entry Hex must be a full Hex (no half/quarter-hex edge cut).
    for (const id of wave.entryHexIds) {
      expect(MISSION1_MAP.find((h) => h.id === id)!.edgeCut).toBeUndefined();
    }
    expect(wave.units.filter((u) => u.templateId === 'ger-rifle')).toHaveLength(2);
    expect(wave.units.filter((u) => u.templateId === 'ger-lmg')).toHaveLength(2);
  });

  it('matches the redesigned setup: German R3 SS Tracker within 2 full Hexes of R01', () => {
    const wave = MISSION_1.reinforcements!.find((w) => w.id === 'ger-r3-ss-tracker')!;
    expect(wave.side).toBe('A');
    expect(wave.earliestRound).toBe(3);
    expect(wave.entryHexIds).toContain(hexIdForLabel('R01'));
    // Every entry Hex must be a full Hex (no half/quarter-hex edge cut).
    for (const id of wave.entryHexIds) {
      expect(MISSION1_MAP.find((h) => h.id === id)!.edgeCut).toBeUndefined();
    }
    expect(wave.units).toEqual([{ id: 'G-ss-pioneer', templateId: 'ger-pioneer-tracker', facing: 0 }]);
  });

  it('matches the redesigned setup: Soviet R2 reinforcements (2 Rifles) at Road Hex R07 (S06 is a half-hex)', () => {
    const wave = MISSION_1.reinforcements!.find((w) => w.id === 'sov-r2-reinforcements')!;
    expect(wave.side).toBe('B');
    expect(wave.earliestRound).toBe(2);
    // §4.12 entry Hexes must be full Hexes — the scenario names S06, but
    // that's a half-hex on the board's true east edge (edgeCut.e on every
    // Hex in column S), so this uses R07, the full-hex Road continuation one
    // Hex inward (verified against MISSION1_MAP directly, not just the
    // wave's own data, so a future regression re-introducing S06 would fail
    // this test even if someone "fixed" only the entryHexIds value).
    expect(wave.entryHexIds).toEqual([hexIdForLabel('R07')]);
    const entryHex = MISSION1_MAP.find((h) => h.id === wave.entryHexIds[0]);
    expect(entryHex?.edgeCut).toBeUndefined();
    expect(entryHex?.road).toBe(true);
    expect(wave.units.filter((u) => u.templateId === 'sov-rifle')).toHaveLength(2);
  });
});

describe('Mission 1 — initial state', () => {
  it('starts the Soviets (B) with the 1-VP no-tie advantage, Germans first', () => {
    const s = initGame(MISSION_1);
    expect(s.phase).toBe('playing');
    expect(s.players.B.vp).toBe(1);
    expect(s.players.A.vp).toBe(0);
    expect(s.vpMarker).toBe(-1); // B leads by 1 (§9.2)
    expect(s.initiativeSide).toBe('A'); // German Round-1 initiative
    expect(s.players.A.capCurrent).toBe(6);
    expect(s.players.B.capCurrent).toBe(7);
  });

  it('starts with 7 Units off-Map awaiting their reinforcement wave (§4.12)', () => {
    const s = initGame(MISSION_1);
    expect(s.reinforcements).toHaveLength(7); // 4 + 1 + 2
    expect(s.units).not.toHaveProperty('G-mg34-1'); // not yet on the Map
    const round1Eligible = s.reinforcements.filter((r) => s.round >= r.earliestRound);
    expect(round1Eligible.map((r) => r.id).sort()).toEqual(
      ['G-mg34-1', 'G-mg34-2', 'G-rifle-1', 'G-rifle-2'].sort(),
    ); // only the Round-1 German platoon is eligible at game start
  });

  it('controls I06 for whoever sits on it (Soviet Maxim is elsewhere at start)', () => {
    const s = initGame(MISSION_1);
    // No unit starts on I06, so it begins uncontrolled.
    expect(s.hexes[hexIdForLabel('I06')]!.features.control).toBeUndefined();
  });
});

const ORDER: Action['type'][] = ['ENTER', 'CLOSE_COMBAT', 'FIRE', 'MOVE', 'RALLY', 'PIVOT', 'STALL', 'PASS'];
function pick(state: GameState): Action {
  const acts = legalActions(state);
  for (const t of ORDER) {
    const found = acts.filter((a) => a.type === t);
    if (found.length) return found[0]!;
  }
  return { type: 'PASS' };
}

describe('Mission 1 — plays to a decision', () => {
  it('reaches gameOver within the round cap with a VP-advantage winner', () => {
    let s = initGame(MISSION_1);
    let steps = 0;
    while (s.phase === 'playing' && steps < 8000) {
      s = reduce(s, pick(s)).state;
      steps += 1;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.round).toBeLessThanOrEqual(MISSION_1.roundsTotal);
    expect(s.winner === 'A' || s.winner === 'B').toBe(true); // no-tie: always a winner
  });
});
