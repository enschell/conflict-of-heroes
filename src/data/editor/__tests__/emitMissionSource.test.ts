import { describe, expect, it } from 'vitest';
import { emitMissionSource } from '../emitMissionSource';
import { BLANK_SINGLE_BOARD } from '../../maps/catalog';
import { UNIT_TEMPLATES } from '../../units';
import { initGame } from '../../../engine/state';
import type { EditorAuthoredState } from '../../../state/editorStore';
import type { MissionDef } from '../../../engine/types';

const hexes = BLANK_SINGLE_BOARD;
const labeledHex = hexes.find((h) => h.label)!;
const [hexA, hexB, hexC, hexD] = hexes.map((h) => h.id);

function fixture(): EditorAuthoredState {
  return {
    info: {
      title: 'Test Mission',
      situation: 'A brief situation.',
      sideA: { nations: ['germans'], orders: 'Attack.', instructions: 'Hold the line.', caps: 6, vp: 0 },
      sideB: { nations: ['soviets'], orders: 'Defend.', instructions: '', caps: 7, vp: 1 },
      roundsTotal: 3,
      initiative: 'A',
    },
    map: {
      boards: [{ id: 'board-1', mapId: 'blank-single', rotation: 0 }],
      tool: 'wire',
      toolSide: 'A',
      bunkerFacing: 0,
      minesHitNumber: 8,
      obstacles: { [hexC!]: { kind: 'mines', side: 'B', hitNumber: 8 } },
      fortifications: { [hexD!]: { kind: 'bunker', facing: 2 } },
    },
    forces: {
      placed: [{ id: 'A-ger-rifle-1', side: 'A', templateId: 'ger-rifle', hexId: hexA!, facing: 0 }],
      search: '',
      nationFilter: 'all',
      armedTemplateId: null,
      armedSide: 'A',
      armedFacing: 0,
    },
    reinforcements: {
      activeSide: 'A',
      waves: {
        A: [
          {
            id: 'wave-1',
            name: 'Wave 1',
            earliestRound: 2,
            description: 'test wave',
            entryHexIds: [hexB!],
            units: [{ id: 'A-ger-rifle-2', templateId: 'ger-rifle', facing: 0 }],
          },
        ],
        B: [],
      },
      expandedWaveId: null,
      search: '',
      nationFilter: 'all',
      draftFacing: 0,
    },
    victory: {
      hexes: [
        {
          id: 'vhex-1',
          hexLabel: labeledHex.label!,
          vp: 2,
          control: 'A',
          overrides: [{ round: 2, vp: 5 }],
          awardTiming: 'endOfRound',
        },
      ],
      vpPerKillA: 3,
      vpPerKillB: 0,
      vpPerSurvivorA: 0,
      vpPerSurvivorB: 0,
      unitKillVp: [],
      exitZones: [],
      activeExitSide: 'A',
      draftHex: '',
      draftVp: 1,
      draftControl: 'neutral',
    },
    advanced: {
      battleCards: { A: { round1: 2, eachRoundAfter: 1 }, B: { round1: 0, eachRoundAfter: 0 } },
      hiddenIds: [],
      obaAllowedRounds: [],
      obaStrikes: [],
      airSupport: { A: '', B: '' },
      overlays: [],
    },
  };
}

describe('emitMissionSource', () => {
  it('produces well-formed, self-contained TypeScript source', () => {
    const src = emitMissionSource(fixture());
    expect(src).toContain("import { UNIT_TEMPLATES } from '../units';");
    expect(src).toContain("import type { MissionDef } from '../../engine/types';");
    expect(src).toContain('export const TEST_MISSION_MISSION: MissionDef = {');
    expect(src).toContain("name: 'Test Mission'");
    expect(src).toContain("templates: [UNIT_TEMPLATES['ger-rifle']!]");
    expect(src).toContain(`hexId: '${hexA}'`);
    expect(src).toContain(`'${hexB}'`); // the reinforcement wave's entry hex
  });

  it('resolves a victory hex label to the real internal hex id', () => {
    const src = emitMissionSource(fixture());
    expect(src).toContain(`hexId: '${labeledHex.id}'`);
    expect(src).toContain('vp: 2');
    expect(src).toContain("control: 'A'");
    expect(src).toContain('roundOverrides:');
  });

  it('throws a clear error for an unresolvable victory hex label', () => {
    const bad = fixture();
    bad.victory.hexes[0]!.hexLabel = 'ZZ99';
    expect(() => emitMissionSource(bad)).toThrow(/Unknown victory hex "ZZ99"/);
  });

  it('emits unitKillVp, vpPerSurvivor, and exitZones when authored', () => {
    const f = fixture();
    f.victory.vpPerSurvivorA = 4;
    f.victory.unitKillVp = [{ unitId: 'A-ger-rifle-1', vp: 9 }];
    f.victory.exitZones = [{ id: 'exit-1', side: 'B', hexIds: [hexB!], vpPerUnit: 2, description: 'east road' }];
    const src = emitMissionSource(f);
    expect(src).toContain('vpPerSurvivor:');
    expect(src).toContain("A: 4");
    expect(src).toContain('unitKillVp:');
    expect(src).toContain("'A-ger-rifle-1': 9");
    expect(src).toContain('exitZones:');
    expect(src).toContain(`'${hexB}'`);
    expect(src).toContain("vpPerUnit: 2");
  });

  it('an endOfMission award timing is emitted; the default endOfRound is omitted', () => {
    const f = fixture();
    f.victory.hexes[0]!.awardTiming = 'endOfMission';
    const src = emitMissionSource(f);
    expect(src).toContain("awardTiming: 'endOfMission'");

    const defaultSrc = emitMissionSource(fixture());
    expect(defaultSrc).not.toContain('awardTiming');
  });

  it('throws a clear error when the Map section has an invalid multi-board configuration', () => {
    const f = fixture();
    f.map.boards.push({ id: 'board-2', mapId: 'blank-single', rotation: 0 }); // no attachTo
    expect(() => emitMissionSource(f)).toThrow(/invalid board configuration/);
  });

  it('round-trips into a real, playable MissionDef via initGame', () => {
    const src = emitMissionSource(fixture());
    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    expect(match).not.toBeNull();
    // Strip the one TS-only construct this generator emits (a non-null
    // assertion after a bracket index) so the object literal is plain JS.
    const plainJs = match![1]!.replace(/\]!/g, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const missionDef = new Function('UNIT_TEMPLATES', `return (${plainJs});`)(UNIT_TEMPLATES) as MissionDef;

    expect(missionDef.name).toBe('Test Mission');
    expect(missionDef.templates.map((t) => t.id)).toEqual(['ger-rifle']);

    const game = initGame(missionDef);
    expect(game.units['A-ger-rifle-1']).toBeDefined();
    expect(game.units['A-ger-rifle-1']!.hexId).toBe(hexA);
    expect(game.reinforcements.some((r) => r.id === 'A-ger-rifle-2')).toBe(true);
    // Starting control seeded from the authored `control` (Mission Editor victory hex).
    expect(game.hexes[labeledHex.id]!.features.control).toBe('A');
    expect(game.players.B.vp).toBe(1); // startVp
  });
});
