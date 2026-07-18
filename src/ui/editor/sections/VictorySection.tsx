import { useMemo } from 'react';
import { assembledMap, assembledMapOverlays, assembledRotationClusters, useEditorStore } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { EditorBoardOrError } from '../EditorBoard';

export function VictorySection() {
  const victory = useEditorStore((s) => s.victory);
  const setVictory = useEditorStore((s) => s.setVictory);
  const addVictoryHex = useEditorStore((s) => s.addVictoryHex);
  const removeVictoryHex = useEditorStore((s) => s.removeVictoryHex);
  const updateVictoryHex = useEditorStore((s) => s.updateVictoryHex);
  const toggleVictoryVaries = useEditorStore((s) => s.toggleVictoryVaries);
  const addVictoryOverride = useEditorStore((s) => s.addVictoryOverride);
  const updateVictoryOverride = useEditorStore((s) => s.updateVictoryOverride);
  const removeVictoryOverride = useEditorStore((s) => s.removeVictoryOverride);
  const setUnitKillVp = useEditorStore((s) => s.setUnitKillVp);
  const removeUnitKillVp = useEditorStore((s) => s.removeUnitKillVp);
  const addExitZone = useEditorStore((s) => s.addExitZone);
  const removeExitZone = useEditorStore((s) => s.removeExitZone);
  const updateExitZone = useEditorStore((s) => s.updateExitZone);
  const toggleExitZoneHex = useEditorStore((s) => s.toggleExitZoneHex);
  const placed = useEditorStore((s) => s.forces.placed);
  const waves = useEditorStore((s) => s.reinforcements.waves);
  const map = useEditorStore((s) => s.map);
  const { hexes: mapHexes, error: mapError } = useMemo(() => assembledMap(map), [map]);
  const mapOverlays = useMemo(() => assembledMapOverlays(map), [map]);
  const rotationClusters = useMemo(() => assembledRotationClusters(map), [map]);

  const allUnits = [
    ...placed.map((p) => ({ id: p.id, label: `${UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId} (${p.id})` })),
    ...Object.values(waves)
      .flat()
      .flatMap((w) => w.units.map((u) => ({ id: u.id, label: `${UNIT_TEMPLATES[u.templateId]?.name ?? u.templateId} (${u.id})` }))),
  ];

  return (
    <div className="editor__section">
      <div className="editor__side-cards">
        <div className="editor__stat-card">
          <span className="editor__field-label">VP per enemy Unit destroyed — Side A</span>
          <input
            type="number"
            value={victory.vpPerKillA}
            onChange={(e) => setVictory({ vpPerKillA: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
        <div className="editor__stat-card">
          <span className="editor__field-label">VP per enemy Unit destroyed — Side B</span>
          <input
            type="number"
            value={victory.vpPerKillB}
            onChange={(e) => setVictory({ vpPerKillB: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>
      <p className="editor__caption">Leave 0 to fall back to each Unit's own printed VP value.</p>

      <div className="editor__side-cards">
        <div className="editor__stat-card">
          <span className="editor__field-label">VP per surviving enemy Unit at Mission end — Side A</span>
          <input
            type="number"
            value={victory.vpPerSurvivorA}
            onChange={(e) => setVictory({ vpPerSurvivorA: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
        <div className="editor__stat-card">
          <span className="editor__field-label">VP per surviving enemy Unit at Mission end — Side B</span>
          <input
            type="number"
            value={victory.vpPerSurvivorB}
            onChange={(e) => setVictory({ vpPerSurvivorB: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>

      <h3>Victory Hexes</h3>
      <div className="editor__add-row">
        <input
          type="text"
          placeholder="Hex (e.g. H07)"
          value={victory.draftHex}
          onChange={(e) => setVictory({ draftHex: e.target.value })}
        />
        <input
          type="number"
          value={victory.draftVp}
          onChange={(e) => setVictory({ draftVp: parseInt(e.target.value, 10) || 0 })}
        />
        <select value={victory.draftControl} onChange={(e) => setVictory({ draftControl: e.target.value as typeof victory.draftControl })}>
          <option value="neutral">Neutral</option>
          <option value="A">Side A</option>
          <option value="B">Side B</option>
        </select>
        <button onClick={addVictoryHex}>+ Add Victory Hex</button>
      </div>

      <ul className="editor__victory-list">
        {victory.hexes.map((v) => (
          <li key={v.id} className="editor__victory-row">
            <span className="editor__victory-hex">{v.hexLabel}</span>
            <input type="number" value={v.vp} onChange={(e) => updateVictoryHex(v.id, { vp: parseInt(e.target.value, 10) || 0 })} />
            <select value={v.control} onChange={(e) => updateVictoryHex(v.id, { control: e.target.value as typeof v.control })}>
              <option value="neutral">Neutral</option>
              <option value="A">Side A</option>
              <option value="B">Side B</option>
            </select>
            <select
              value={v.awardTiming}
              onChange={(e) => updateVictoryHex(v.id, { awardTiming: e.target.value as typeof v.awardTiming })}
            >
              <option value="endOfRound">Every Round</option>
              <option value="endOfMission">Once at Mission end</option>
              <option value="specificRounds">Only specific Rounds</option>
            </select>
            {v.awardTiming === 'specificRounds' && (
              <label className="editor__field-label editor__field-label--inline">
                Rounds
                <input
                  type="text"
                  placeholder="e.g. 3, 4, 5"
                  defaultValue={(v.awardRounds ?? []).join(', ')}
                  onBlur={(e) =>
                    updateVictoryHex(v.id, {
                      awardRounds: e.target.value
                        .split(',')
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => Number.isFinite(n) && n > 0),
                    })
                  }
                />
              </label>
            )}
            <button onClick={() => toggleVictoryVaries(v.id)}>{v.overrides ? 'Varies per round ✓' : 'Same every round'}</button>
            <button onClick={() => removeVictoryHex(v.id)}>×</button>
            {v.overrides && (
              <div className="editor__override-panel">
                {v.overrides.map((o, idx) => (
                  <div key={idx} className="editor__override-row">
                    <label>
                      Round
                      <input
                        type="number"
                        min={1}
                        value={o.round}
                        onChange={(e) => updateVictoryOverride(v.id, idx, { round: parseInt(e.target.value, 10) || 1 })}
                      />
                    </label>
                    <label>
                      VP
                      <input
                        type="number"
                        value={o.vp}
                        onChange={(e) => updateVictoryOverride(v.id, idx, { vp: parseInt(e.target.value, 10) || 0 })}
                      />
                    </label>
                    <button onClick={() => removeVictoryOverride(v.id, idx)}>×</button>
                  </div>
                ))}
                <button onClick={() => addVictoryOverride(v.id)}>+ Add round override</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h3>Specific Unit VP</h3>
      <p className="editor__caption">Overrides the general per-kill VP above for one specific Unit's destruction.</p>
      {allUnits.length === 0 ? (
        <p className="editor__empty">No placed or reinforcement units yet.</p>
      ) : (
        <ul className="editor__placed-list">
          {allUnits.map((u) => {
            const entry = victory.unitKillVp.find((k) => k.unitId === u.id);
            return (
              <li key={u.id}>
                {u.label}
                <input
                  type="number"
                  placeholder="VP"
                  value={entry?.vp ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') removeUnitKillVp(u.id);
                    else setUnitKillVp(u.id, parseInt(v, 10) || 0);
                  }}
                />
                {entry && <button onClick={() => removeUnitKillVp(u.id)}>×</button>}
              </li>
            );
          })}
        </ul>
      )}

      <h3>Exit Zones (§4.0)</h3>
      <p className="editor__caption">VP for a side's own Units exiting the Map through designated Hexes.</p>
      <div className="editor__toggle-row">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            className={`editor__toggle${victory.activeExitSide === side ? ' editor__toggle--active' : ''}`}
            onClick={() => setVictory({ activeExitSide: side })}
          >
            Side {side}
          </button>
        ))}
      </div>
      {victory.exitZones
        .filter((z) => z.side === victory.activeExitSide)
        .map((z) => (
          <div key={z.id} className="editor__wave-card">
            <div className="editor__wave-row">
              <label className="editor__field-label">
                Description
                <input
                  type="text"
                  value={z.description}
                  placeholder='e.g. "West edge, Side A only"'
                  onChange={(e) => updateExitZone(z.id, { description: e.target.value })}
                />
              </label>
              <label className="editor__field-label">
                VP per Unit
                <input
                  type="number"
                  value={z.vpPerUnit}
                  onChange={(e) => updateExitZone(z.id, { vpPerUnit: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
              <button onClick={() => removeExitZone(z.id)}>× Remove Zone</button>
            </div>
            <div className="editor__map-board editor__map-board--small">
              <EditorBoardOrError
                error={mapError}
                hexes={mapHexes}
                highlightedHexIds={new Set(z.hexIds)}
                onHexClick={(hex) => toggleExitZoneHex(z.id, hex)}
                mapOverlays={mapOverlays}
                rotationClusters={rotationClusters}
              />
            </div>
            <p className="editor__hex-echo">Exit Hexes: {z.hexIds.join(', ') || '(none selected)'}</p>
          </div>
        ))}
      <button className="primary" onClick={() => addExitZone(victory.activeExitSide)}>
        + Add Exit Zone — Side {victory.activeExitSide}
      </button>
    </div>
  );
}
