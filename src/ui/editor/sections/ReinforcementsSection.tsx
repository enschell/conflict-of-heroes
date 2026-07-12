import { useMemo } from 'react';
import { assembledMap, useEditorStore } from '../../../state/editorStore';
import type { EditorWave } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { hexesConnected } from '../../../engine';
import { EditorBoard } from '../EditorBoard';
import { UnitPicker } from '../UnitPicker';
import { FACING_LABELS } from '../constants';
import type { Facing, SideId } from '../../../engine/types';

function WaveCard({ side, wave }: { side: SideId; wave: EditorWave }) {
  const expandedWaveId = useEditorStore((s) => s.reinforcements.expandedWaveId);
  const toggleExpandWave = useEditorStore((s) => s.toggleExpandWave);
  const removeWave = useEditorStore((s) => s.removeWave);
  const updateWave = useEditorStore((s) => s.updateWave);
  const toggleWaveHex = useEditorStore((s) => s.toggleWaveHex);
  const addUnitToWave = useEditorStore((s) => s.addUnitToWave);
  const removeUnitFromWave = useEditorStore((s) => s.removeUnitFromWave);
  const reinf = useEditorStore((s) => s.reinforcements);
  const setReinf = useEditorStore((s) => s.setReinf);
  const map = useEditorStore((s) => s.map);
  const mapHexes = useMemo(() => assembledMap(map).hexes, [map]);

  const expanded = expandedWaveId === wave.id;
  const connected = hexesConnected(wave.entryHexIds);
  const highlighted = useMemo(() => new Set(wave.entryHexIds), [wave.entryHexIds]);

  return (
    <div className="editor__wave-card">
      <div className="editor__wave-summary">
        <strong>{wave.name}</strong>
        <span>
          Enters round {wave.earliestRound}+ · {wave.entryHexIds.length} entry hex(es) · {wave.units.length} unit(s)
        </span>
        <button onClick={() => toggleExpandWave(wave.id)}>{expanded ? 'Collapse' : 'Edit'}</button>
        <button onClick={() => removeWave(side, wave.id)}>Remove</button>
      </div>
      {expanded && (
        <div className="editor__wave-expanded">
          <div className="editor__wave-row">
            <label className="editor__field-label">
              Name/ID
              <input type="text" value={wave.name} onChange={(e) => updateWave(side, wave.id, { name: e.target.value })} />
            </label>
            <label className="editor__field-label">
              Earliest Round
              <input
                type="number"
                min={1}
                value={wave.earliestRound}
                onChange={(e) => updateWave(side, wave.id, { earliestRound: parseInt(e.target.value, 10) || 1 })}
              />
            </label>
          </div>
          <label className="editor__field-label">
            Entry Description
            <input
              type="text"
              value={wave.description}
              placeholder='e.g. "Road hex R07"'
              onChange={(e) => updateWave(side, wave.id, { description: e.target.value })}
            />
          </label>
          <h4>Add Units</h4>
          <label className="editor__field-label">
            Facing (applies to next Add)
            <select value={reinf.draftFacing} onChange={(e) => setReinf({ draftFacing: parseInt(e.target.value, 10) as Facing })}>
              {FACING_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <UnitPicker
            search={reinf.search}
            onSearchChange={(search) => setReinf({ search })}
            nationFilter={reinf.nationFilter}
            onNationFilterChange={(nationFilter) => setReinf({ nationFilter })}
            onPick={(templateId) => addUnitToWave(side, wave.id, templateId, reinf.draftFacing)}
            pickLabel="+ Add"
          />
          <h4>In this wave ({wave.units.length})</h4>
          <ul className="editor__placed-list">
            {wave.units.map((u) => (
              <li key={u.id}>
                {UNIT_TEMPLATES[u.templateId]?.name ?? u.templateId} — facing {FACING_LABELS[u.facing]}
                <button onClick={() => removeUnitFromWave(side, wave.id, u.id)}>×</button>
              </li>
            ))}
          </ul>
          <div className="editor__map-board editor__map-board--small">
            <EditorBoard hexes={mapHexes} highlightedHexIds={highlighted} onHexClick={(hex) => toggleWaveHex(side, wave.id, hex)} />
          </div>
          <p className="editor__hex-echo">Entry Hexes: {wave.entryHexIds.join(', ') || '(none selected)'}</p>
          {!connected && wave.entryHexIds.length > 1 && (
            <p className="editor__warning">⚠ These entry Hexes are not one connected group (§4.12).</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReinforcementsSection() {
  const activeSide = useEditorStore((s) => s.reinforcements.activeSide);
  const waves = useEditorStore((s) => s.reinforcements.waves);
  const setReinf = useEditorStore((s) => s.setReinf);
  const addWave = useEditorStore((s) => s.addWave);

  return (
    <div className="editor__section">
      <div className="editor__toggle-row">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            className={`editor__toggle${activeSide === side ? ' editor__toggle--active' : ''}`}
            onClick={() => setReinf({ activeSide: side })}
          >
            Side {side}
          </button>
        ))}
      </div>
      {waves[activeSide].map((w) => (
        <WaveCard key={w.id} side={activeSide} wave={w} />
      ))}
      <button className="primary" onClick={() => addWave(activeSide)}>
        + Add Wave — Side {activeSide}
      </button>
    </div>
  );
}
