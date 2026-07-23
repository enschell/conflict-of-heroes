import { afterEach, describe, expect, it } from 'vitest';
import { emitMissionSource } from '../emitMissionSource';
import { BLANK_SINGLE_BOARD, MAP_CATALOG } from '../../maps/catalog';
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
      armedHidden: false,
      mineHitNumber: 8,
      setupPool: [],
      setupFirstSide: 'A',
      setupInstructions: '',
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
      draftHidden: false,
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
      airSupport: { A: '', B: '' },
      overlays: [],
    },
    cards: {
      battleCardIds: [],
      drawPerRound: { A: { round1: 2, eachRoundAfter: 1 }, B: { round1: 0, eachRoundAfter: 0 } },
      initialHand: { A: [], B: [] },
      obaAllowedRounds: [],
      missionCardText: {},
    },
  };
}

describe('emitMissionSource', () => {
  afterEach(() => {
    delete MAP_CATALOG['blank-single']!.overlayImage;
  });

  it('omits mapOverlays when no picked board has a saved overlay image', () => {
    const src = emitMissionSource(fixture());
    expect(src).not.toContain('mapOverlays');
  });

  it('inlines a picked board\'s saved overlay image, keyed by its mapNumber', () => {
    MAP_CATALOG['blank-single']!.overlayImage = 'data:image/png;base64,XYZ';
    const src = emitMissionSource(fixture());
    const n = BLANK_SINGLE_BOARD[0]!.mapNumber!;
    expect(src).toContain('mapOverlays:');
    expect(src).toContain(`'${n}': 'data:image/png;base64,XYZ'`);

    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    const plainJs = match![1]!.replace(/\]!/g, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const missionDef = new Function('UNIT_TEMPLATES', `return (${plainJs});`)(UNIT_TEMPLATES) as MissionDef;
    expect(missionDef.mapOverlays).toEqual({ [n]: 'data:image/png;base64,XYZ' });
    const game = initGame(missionDef);
    expect(game.mapOverlays).toEqual({ [n]: 'data:image/png;base64,XYZ' });
  });

  it('omits mapRotations when no board is rotated 90/-90', () => {
    const src = emitMissionSource(fixture());
    expect(src).not.toContain('mapRotations');
  });

  it('records a 90/-90 board rotation, keyed by its mapNumber; 0/180 emit nothing', () => {
    const f = fixture();
    f.map.boards[0]!.rotation = 90;
    const src = emitMissionSource(f);
    const n = BLANK_SINGLE_BOARD[0]!.mapNumber!;
    expect(src).toContain('mapRotations:');
    expect(src).toContain(`'${n}': 90`);

    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    const plainJs = match![1]!.replace(/\]!/g, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const missionDef = new Function('UNIT_TEMPLATES', `return (${plainJs});`)(UNIT_TEMPLATES) as MissionDef;
    expect(missionDef.mapRotations).toEqual({ [n]: 90 });
    expect(initGame(missionDef).mapRotations).toEqual({ [n]: 90 });

    const f180 = fixture();
    f180.map.boards[0]!.rotation = 180;
    expect(emitMissionSource(f180)).not.toContain('mapRotations');
  });

  it('omits setupForces/setupFirstSide/setupInstructions when the pool is empty', () => {
    const src = emitMissionSource(fixture());
    expect(src).not.toContain('setupForces');
    expect(src).not.toContain('setupFirstSide');
  });

  it('emits a real setupForces pool and round-trips through initGame into the setup phase', () => {
    const f = fixture();
    f.forces.setupPool = [
      { id: 'A-setup-1', side: 'A', templateId: 'ger-rifle', facing: 0 },
      { id: 'B-setup-1', side: 'B', templateId: 'sov-rifle', facing: 3 },
    ];
    f.forces.setupFirstSide = 'B';
    f.forces.setupInstructions = 'Side B sets up first, within 3 hexes of the south edge.';
    const src = emitMissionSource(f);
    expect(src).toContain('setupForces:');
    expect(src).toContain("setupFirstSide: 'B'");
    expect(src).toContain('setupInstructions:');

    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    const plainJs = match![1]!.replace(/\]!/g, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const missionDef = new Function('UNIT_TEMPLATES', `return (${plainJs});`)(UNIT_TEMPLATES) as MissionDef;
    expect(missionDef.setupForces).toHaveLength(2);
    const game = initGame(missionDef);
    expect(game.phase).toBe('setup');
    expect(game.setupSide).toBe('B');
    expect(game.setupPool).toHaveLength(2);
  });

  it('exports hidden units and a Mines Setup Pool token (§11), never referencing a fake mines template', () => {
    const f = fixture();
    f.forces.placed[0]!.hidden = true;
    f.forces.setupPool = [
      { id: 'B-mines-1', side: 'B', templateId: 'mines', facing: 0, hidden: true, mine: { hitNumber: 9 } },
      { id: 'B-setup-1', side: 'B', templateId: 'sov-rifle', facing: 3 },
    ];
    // §11: a reinforcement-wave unit can also be authored hidden.
    f.reinforcements.waves.A[0]!.units[0]!.hidden = true;
    const src = emitMissionSource(f);
    // A Mines token's placeholder templateId must never land in the templates
    // import list — `UNIT_TEMPLATES['mines']!` would crash the module at load.
    expect(src).not.toContain("UNIT_TEMPLATES['mines']");
    expect(src).toContain("UNIT_TEMPLATES['sov-rifle']");

    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    const plainJs = match![1]!.replace(/\]!/g, ']');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const missionDef = new Function('UNIT_TEMPLATES', `return (${plainJs});`)(UNIT_TEMPLATES) as MissionDef;
    expect(missionDef.units[0]!.hidden).toBe(true);
    const mineEntry = missionDef.setupForces!.find((u) => u.mine)!;
    expect(mineEntry).toMatchObject({ side: 'B', hidden: true, mine: { hitNumber: 9 } });
    expect(missionDef.reinforcements![0]!.units[0]!.hidden).toBe(true);

    // Play-time round trip: placing the mine during setup writes the hidden
    // Mines obstacle onto the Hex instead of creating a Unit.
    const game = initGame(missionDef);
    expect(game.phase).toBe('setup');
    expect(game.units[missionDef.units[0]!.id]!.hidden).toBe(true);
    const poolMine = game.setupPool!.find((u) => u.mine)!;
    expect(poolMine.mine).toEqual({ hitNumber: 9 });
    // §11: a hidden reinforcement-wave unit stays hidden once `initGame`
    // builds its runtime `ReinforcementUnit` entry.
    const reinforcement = game.reinforcements.find((r) => r.id === 'A-ger-rifle-2')!;
    expect(reinforcement.hidden).toBe(true);
  });

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

  it('a specificRounds award timing emits both awardTiming and awardRounds', () => {
    const f = fixture();
    f.victory.hexes[0]!.awardTiming = 'specificRounds';
    f.victory.hexes[0]!.awardRounds = [3, 4, 5];
    const src = emitMissionSource(f);
    expect(src).toContain("awardTiming: 'specificRounds'");
    expect(src).toContain('awardRounds:');
    expect(src).toContain('3,');
    expect(src).toContain('4,');
    expect(src).toContain('5,');
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
