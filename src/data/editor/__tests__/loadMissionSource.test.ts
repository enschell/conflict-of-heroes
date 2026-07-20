import { describe, expect, it } from 'vitest';
import { buildEditorStateFromMission } from '../loadMissionSource';
import { emitMissionSource } from '../emitMissionSource';
import { assembledMap } from '../../../state/editorStore';
import { MISSION_1 } from '../../missions/mission1';
import { SETUP_PHASE_SANDBOX } from '../../missions/setupPhaseSandbox';
import { MAP_CATALOG } from '../../maps/catalog';

describe('buildEditorStateFromMission (Load Existing Mission)', () => {
  it('loads Mission Info (title, sides, rounds, initiative)', () => {
    const st = buildEditorStateFromMission(MISSION_1);
    expect(st.info.title).toBe(MISSION_1.name);
    expect(st.info.roundsTotal).toBe(MISSION_1.roundsTotal);
    expect(st.info.sideA.caps).toBe(MISSION_1.caps.A);
    expect(st.info.sideB.caps).toBe(MISSION_1.caps.B);
    expect(st.info.sideA.nations).toEqual(MISSION_1.nations.A);
    expect(st.info.initiative).toBe(MISSION_1.firstInitiative ?? 'A');
  });

  it('loads fixed Starting Forces placements exactly', () => {
    const st = buildEditorStateFromMission(MISSION_1);
    expect(st.forces.placed).toHaveLength(MISSION_1.units.length);
    for (const u of MISSION_1.units) {
      const loaded = st.forces.placed.find((p) => p.id === u.id);
      expect(loaded).toMatchObject({ side: u.side, templateId: u.templateId, hexId: u.hexId, facing: u.facing });
    }
  });

  it('registers a synthetic MAP_CATALOG entry whose assembled hexes match the original mission exactly (terrain, obstacles, fortifications)', () => {
    const st = buildEditorStateFromMission(MISSION_1);
    const { hexes, error } = assembledMap(st.map);
    expect(error).toBeNull();
    expect(hexes).toHaveLength(MISSION_1.hexes.length);
    const byId = new Map(MISSION_1.hexes.map((h) => [h.id, h]));
    for (const h of hexes) {
      const original = byId.get(h.id)!;
      expect(h.terrain).toBe(original.terrain);
      expect(h.obstacle).toEqual(original.obstacle);
      expect(h.fortification).toEqual(original.fortification);
    }
    // A synthetic entry was actually registered (not just an in-memory fluke).
    expect(MAP_CATALOG[`__loaded_${MISSION_1.id}`]).toBeDefined();
  });

  it('loads reinforcement waves, grouped correctly by side', () => {
    const st = buildEditorStateFromMission(MISSION_1);
    const originalBySide = { A: 0, B: 0 } as Record<'A' | 'B', number>;
    for (const w of MISSION_1.reinforcements ?? []) originalBySide[w.side] += 1;
    expect(st.reinforcements.waves.A).toHaveLength(originalBySide.A);
    expect(st.reinforcements.waves.B).toHaveLength(originalBySide.B);
  });

  it('loads victory hexes with real labels resolved from the mission map', () => {
    const st = buildEditorStateFromMission(MISSION_1);
    expect(st.victory.hexes.length).toBe(MISSION_1.victoryHexes.length);
    for (const vh of st.victory.hexes) {
      // A real label was resolved (not just the raw "q,r" id), since Mission 1 is on the labeled substrate.
      expect(vh.hexLabel).not.toContain(',');
    }
  });

  it('loads setupForces/setupFirstSide/setupInstructions from a Mission that has them', () => {
    const st = buildEditorStateFromMission(SETUP_PHASE_SANDBOX);
    expect(st.forces.setupPool).toHaveLength(SETUP_PHASE_SANDBOX.setupForces!.length);
    expect(st.forces.setupFirstSide).toBe('B');
    expect(st.forces.setupInstructions).toBe(SETUP_PHASE_SANDBOX.setupInstructions);
  });

  it('loads a specificRounds victory hex (awardTiming + awardRounds) correctly', () => {
    const st = buildEditorStateFromMission(SETUP_PHASE_SANDBOX);
    const vh = st.victory.hexes[0]!;
    expect(vh.awardTiming).toBe('specificRounds');
    expect(vh.awardRounds).toEqual([3, 4, 5]);
  });

  it('restores a 90/-90 board rotation from mapRotations; defaults to 0 when absent', () => {
    const withRotation: typeof MISSION_1 = { ...MISSION_1, mapRotations: { [MISSION_1.hexes[0]!.mapNumber!]: -90 } };
    const st = buildEditorStateFromMission(withRotation);
    expect(st.map.boards[0]!.rotation).toBe(-90);

    const st2 = buildEditorStateFromMission(MISSION_1);
    expect(st2.map.boards[0]!.rotation).toBe(0);
  });

  it('re-exporting a loaded Mission produces valid, round-trippable TypeScript source', () => {
    const st = buildEditorStateFromMission(SETUP_PHASE_SANDBOX);
    const src = emitMissionSource(st);
    expect(src).toContain(`name: '${SETUP_PHASE_SANDBOX.name}'`);
    expect(src).toContain("setupFirstSide: 'B'");
    const match = src.match(/export const \w+: MissionDef = ([\s\S]*);\s*$/);
    expect(match).not.toBeNull();
  });

  it('round-trips cardConfig and missionCardText (§8/§13.4-13.9)', () => {
    const withCards: typeof MISSION_1 = {
      ...MISSION_1,
      cardConfig: {
        battleCardIds: ['01', '02', '18'],
        drawPerRound: { A: { round1: 2, eachRoundAfter: 1 }, B: { round1: 1, eachRoundAfter: 1 } },
        initialHand: { A: ['W01'], B: [] },
        obaAllowedRounds: [3, 4],
      },
      missionCardText: { '18': 'Both sides score 2VP for holding K09.' },
    };
    const st = buildEditorStateFromMission(withCards);
    expect(st.cards.battleCardIds).toEqual(['01', '02', '18']);
    expect(st.cards.drawPerRound.A).toEqual({ round1: 2, eachRoundAfter: 1 });
    expect(st.cards.initialHand.A).toEqual(['W01']);
    expect(st.cards.obaAllowedRounds).toEqual([3, 4]);
    expect(st.cards.missionCardText['18']).toBe('Both sides score 2VP for holding K09.');

    const src = emitMissionSource(st);
    expect(src).toContain('cardConfig:');
    expect(src).toContain('battleCardIds:');
    expect(src).toContain("'01'");
    expect(src).toContain("'18'");
    expect(src).toContain('missionCardText:');
    expect(src).toContain('Both sides score 2VP for holding K09.');
  });
});
