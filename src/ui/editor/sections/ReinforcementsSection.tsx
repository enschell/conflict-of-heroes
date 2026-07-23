/**
 * Reinforcements: Side A's waves in a LEFT column, Side B's in a RIGHT column
 * (user-requested layout — side-by-side instead of a single toggled list, so
 * both sides' waves stay visible at once and vertical scrolling stays short).
 * Each wave's unit picker is restricted to its own side's nations (Mission
 * Info tab), same as the Starting Forces columns.
 */
import { useMemo } from 'react';
import { assembledMap, assembledMapOverlays, assembledRotationClusters, useEditorStore } from '../../../state/editorStore';
import type { EditorWave } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { NATIONS } from '../../../data/nations';
import { hexesConnected } from '../../../engine';
import { SIDE_COLOR } from '../../theme';
import { EditorBoardOrError } from '../EditorBoard';
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
  const nations = useEditorStore((s) => (side === 'A' ? s.info.sideA.nations : s.info.sideB.nations));
  const map = useEditorStore((s) => s.map);
  const { hexes: mapHexes, error: mapError } = useMemo(() => assembledMap(map), [map]);
  const mapOverlays = useMemo(() => assembledMapOverlays(map), [map]);
  const rotationClusters = useMemo(() => assembledRotationClusters(map), [map]);

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
          <div className="editor__wave-row">
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
            <label className="editor__field-label">
              <span>
                <input
                  type="checkbox"
                  checked={reinf.draftHidden}
                  onChange={(e) => setReinf({ draftHidden: e.target.checked })}
                />{' '}
                Hidden (§11)
              </span>
            </label>
          </div>
          <UnitPicker
            search={reinf.search}
            onSearchChange={(search) => setReinf({ search })}
            nationFilter={reinf.nationFilter}
            onNationFilterChange={(nationFilter) => setReinf({ nationFilter })}
            nations={nations}
            onPick={(templateId) => addUnitToWave(side, wave.id, templateId, reinf.draftFacing, reinf.draftHidden)}
            pickLabel="+ Add"
          />
          <h4>In this wave ({wave.units.length})</h4>
          <ul className="editor__placed-list">
            {wave.units.map((u) => (
              <li key={u.id}>
                {UNIT_TEMPLATES[u.templateId]?.name ?? u.templateId} — facing {FACING_LABELS[u.facing]}
                {u.hidden ? ' — hidden' : ''}
                <button onClick={() => removeUnitFromWave(side, wave.id, u.id)}>×</button>
              </li>
            ))}
          </ul>
          <div className="editor__map-board editor__map-board--small">
            <EditorBoardOrError
              error={mapError}
              hexes={mapHexes}
              highlightedHexIds={highlighted}
              onHexClick={(hex) => toggleWaveHex(side, wave.id, hex)}
              mapOverlays={mapOverlays}
              rotationClusters={rotationClusters}
            />
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

function SideWaves({ side }: { side: SideId }) {
  const waves = useEditorStore((s) => s.reinforcements.waves[side]);
  const addWave = useEditorStore((s) => s.addWave);
  const nations = useEditorStore((s) => (side === 'A' ? s.info.sideA.nations : s.info.sideB.nations));
  const nationNames = nations.length ? nations.map((n) => NATIONS[n]?.name ?? n).join(', ') : 'no nations set';

  return (
    <div className="editor__side-col" style={{ borderTopColor: SIDE_COLOR[side] }}>
      <h3 className="editor__side-col-head">
        Side {side} <span className="editor__side-col-nations">({nationNames})</span>
      </h3>
      {waves.length === 0 && <p className="editor__empty">No reinforcement waves for this side.</p>}
      {waves.map((w) => (
        <WaveCard key={w.id} side={side} wave={w} />
      ))}
      <button className="primary" onClick={() => addWave(side)}>
        + Add Wave
      </button>
    </div>
  );
}

export function ReinforcementsSection() {
  return (
    <div className="editor__section">
      <div className="editor__reinf-grid">
        <SideWaves side="A" />
        <SideWaves side="B" />
      </div>
    </div>
  );
}
