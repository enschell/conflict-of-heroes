/**
 * Mission Editor-driven VictoryConfig extensions: a victory hex's authored
 * starting controller (§9.1) and per-Round VP override, plus per-side
 * VP-per-kill. All three are optional/additive — existing Missions that omit
 * them behave exactly as before (covered by the untouched vp-initiative.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../state';
import { endRound } from '../turn';
import { reduce } from '../reducer';
import { vpForRound, vpPerKillFor, vpPerSurvivorFor } from '../victory';
import { baseState, addHex, addTemplate, addUnit, rifleTemplate } from './helpers';
import type { FirefightDef, MapHexDef, VictoryHexDef } from '../types';

function miniDef(over: Partial<FirefightDef> = {}): FirefightDef {
  const hexes: MapHexDef[] = [];
  for (let q = 0; q <= 3; q++) hexes.push({ id: `${q},0`, terrain: 'open' });
  return {
    id: 'm', name: 'Mini', roundsTotal: 5, seed: 1,
    caps: { A: 7, B: 7 }, nations: { A: ['germans'], B: ['soviets'] },
    templates: [rifleTemplate()],
    hexes,
    units: [],
    victoryHexes: [],
    ...over,
  };
}

describe('victory hex starting control (§9.1, Mission Editor authoring)', () => {
  it('seeds an unoccupied victory hex from its authored `control`', () => {
    const s = initGame(miniDef({ victoryHexes: [{ hexId: '2,0', vp: 1, control: 'B' }] }));
    expect(s.hexes['2,0']!.features.control).toBe('B');
  });

  it('a sole occupier still overrides the authored starting control', () => {
    const s = initGame(
      miniDef({
        victoryHexes: [{ hexId: '0,0', vp: 1, control: 'B' }],
        units: [{ id: 'A1', side: 'A', templateId: 'rifle', hexId: '0,0', facing: 0 }],
      }),
    );
    expect(s.hexes['0,0']!.features.control).toBe('A');
  });

  it('omitting `control` leaves an unoccupied victory hex uncontrolled, as before', () => {
    const s = initGame(miniDef({ victoryHexes: [{ hexId: '2,0', vp: 1 }] }));
    expect(s.hexes['2,0']!.features.control).toBeUndefined();
  });
});

describe('vpForRound (§9.1 per-Round VP override)', () => {
  it('falls back to the base `vp` for a Round with no override', () => {
    const vh: VictoryHexDef = { hexId: '0,0', vp: 1, roundOverrides: [{ round: 3, vp: 5 }] };
    expect(vpForRound(vh, 1)).toBe(1);
  });

  it('uses the override value for its specific Round', () => {
    const vh: VictoryHexDef = { hexId: '0,0', vp: 1, roundOverrides: [{ round: 3, vp: 5 }] };
    expect(vpForRound(vh, 3)).toBe(5);
  });

  it('endRound awards the Round-specific override, not the base vp', () => {
    const s = baseState();
    addHex(s, 0, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'A1', 'A', 0, 0, 0);
    s.victory = {
      victoryHexes: [{ hexId: '0,0', vp: 1, roundOverrides: [{ round: 1, vp: 4 }] }],
    };
    s.round = 1;
    s.roundsTotal = 5;
    const beforeVp = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp - beforeVp).toBe(4); // Round 1's override, not the base 1 VP
  });
});

describe('vpPerKillFor (§9.1 per-side VP-per-kill)', () => {
  it('returns undefined when unset (falls back to template vp at the call site)', () => {
    expect(vpPerKillFor({ victoryHexes: [] }, 'A')).toBeUndefined();
  });

  it('a plain number applies to either side equally', () => {
    const v = { victoryHexes: [], vpPerKill: 2 };
    expect(vpPerKillFor(v, 'A')).toBe(2);
    expect(vpPerKillFor(v, 'B')).toBe(2);
  });

  it('the per-side form scores each side independently', () => {
    const v = { victoryHexes: [], vpPerKill: { A: 3, B: 1 } };
    expect(vpPerKillFor(v, 'A')).toBe(3);
    expect(vpPerKillFor(v, 'B')).toBe(1);
  });
});

describe('awardTiming (§9.1 endOfRound vs endOfMission)', () => {
  function scene(awardTiming: VictoryHexDef['awardTiming']) {
    const s = baseState();
    addHex(s, 0, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'A1', 'A', 0, 0, 0);
    s.victory = { victoryHexes: [{ hexId: '0,0', vp: 3, awardTiming }] };
    s.roundsTotal = 2;
    return s;
  }

  it('an endOfMission hex awards nothing on an intermediate Round', () => {
    const s = scene('endOfMission');
    s.round = 1;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp).toBe(before);
    expect(s.phase).toBe('playing'); // Round 1 of 2 — Mission continues
  });

  it('an endOfMission hex awards the full value only at the Mission-ending Round', () => {
    const s = scene('endOfMission');
    s.round = 2; // the last Round
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp - before).toBe(3);
    expect(s.phase).toBe('gameOver');
  });

  it('an endOfRound hex (default) still awards every Round, unaffected', () => {
    const s = scene('endOfRound');
    s.round = 1;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp - before).toBe(3);
  });
});

describe('specificRounds award mode (§9.1, e.g. "VP for K09 in Rounds 3, 4, and 5 only")', () => {
  function scene(awardRounds: number[]) {
    const s = baseState();
    addHex(s, 0, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'A1', 'A', 0, 0, 0);
    s.victory = { victoryHexes: [{ hexId: '0,0', vp: 1, awardTiming: 'specificRounds', awardRounds }] };
    s.roundsTotal = 5;
    return s;
  }

  it('awards nothing on a Round not in the list', () => {
    const s = scene([3, 4, 5]);
    s.round = 1;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp).toBe(before);
  });

  it('awards the vp on every Round that IS in the list', () => {
    const s = scene([3, 4, 5]);
    const before = s.players.A.vp;
    for (const r of [3, 4, 5]) {
      s.round = r;
      endRound(s);
    }
    expect(s.players.A.vp - before).toBe(3); // 1 VP * 3 listed Rounds
  });

  it('still respects a roundOverrides amount on a listed Round', () => {
    const s = baseState();
    addHex(s, 0, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'A1', 'A', 0, 0, 0);
    s.victory = {
      victoryHexes: [
        { hexId: '0,0', vp: 1, awardTiming: 'specificRounds', awardRounds: [3, 4], roundOverrides: [{ round: 4, vp: 9 }] },
      ],
    };
    s.roundsTotal = 5;
    s.round = 4;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp - before).toBe(9);
  });

  it('an unset awardRounds list awards nothing at all (defensive default)', () => {
    const s = scene([]);
    s.round = 3;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp).toBe(before);
  });
});

describe('unitKillVp (§9.1 specific-Unit destruction VP override)', () => {
  it('overrides the general per-kill/template VP for that one Unit', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'target-tmpl', vp: 1 }));
    addTemplate(s, rifleTemplate({ id: 'gun', fp: { red: 50, blue: 0 } }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'TARGET', 'A', 0, 0, 0, 'target-tmpl');
    addUnit(s, 'ATK', 'B', 1, 0, 3, 'gun');
    s.victory = { victoryHexes: [], unitKillVp: { TARGET: 9 } };
    s.currentSide = 'B';
    const before = s.players.B.vp;
    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'TARGET' });
    expect(res.state.units['TARGET']).toBeUndefined();
    expect(res.state.players.B.vp - before).toBe(9); // the override, not the template's vp:1
  });

  it('other Units still use the general vpPerKill/template value', () => {
    const s = baseState();
    addTemplate(s, rifleTemplate({ id: 'other-tmpl', vp: 2 }));
    addTemplate(s, rifleTemplate({ id: 'gun', fp: { red: 50, blue: 0 } }));
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addUnit(s, 'OTHER', 'A', 0, 0, 0, 'other-tmpl');
    addUnit(s, 'ATK', 'B', 1, 0, 3, 'gun');
    s.victory = { victoryHexes: [], unitKillVp: { SOMEONE_ELSE: 9 } };
    s.currentSide = 'B';
    const before = s.players.B.vp;
    const res = reduce(s, { type: 'FIRE', attackerId: 'ATK', targetId: 'OTHER' });
    expect(res.state.players.B.vp - before).toBe(2); // falls back to template vp
  });
});

describe('vpPerSurvivorFor / Mission-end survivor VP', () => {
  it('vpPerSurvivorFor supports plain-number and per-side forms', () => {
    expect(vpPerSurvivorFor({ victoryHexes: [] }, 'A')).toBeUndefined();
    expect(vpPerSurvivorFor({ victoryHexes: [], vpPerSurvivor: 1 }, 'B')).toBe(1);
    expect(vpPerSurvivorFor({ victoryHexes: [], vpPerSurvivor: { A: 2, B: 5 } }, 'B')).toBe(5);
  });

  it('endRound awards VP for enemy Units still on the Map, only at Mission end', () => {
    const s = baseState();
    addHex(s, 0, 0);
    addHex(s, 1, 0);
    addHex(s, 2, 0);
    addTemplate(s, rifleTemplate());
    addUnit(s, 'A1', 'A', 0, 0, 0);
    addUnit(s, 'B1', 'B', 1, 0, 0);
    addUnit(s, 'B2', 'B', 2, 0, 0);
    s.victory = { victoryHexes: [], vpPerSurvivor: { A: 3 } };
    s.roundsTotal = 1;
    s.round = 1;
    const before = s.players.A.vp;
    endRound(s);
    expect(s.players.A.vp - before).toBe(6); // 2 surviving Soviet Units * 3 VP
    expect(s.phase).toBe('gameOver');
  });
});
