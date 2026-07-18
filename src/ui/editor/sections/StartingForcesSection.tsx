import { useMemo, useState } from 'react';
import { assembledMap, assembledMapOverlays, assembledRotationClusters, useEditorStore } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { SIDE_COLOR } from '../../theme';
import { EditorBoardOrError, type EditorMarker } from '../EditorBoard';
import { UnitPicker } from '../UnitPicker';
import { FACING_LABELS } from '../constants';
import type { Facing } from '../../../engine/types';

function abbrev(templateId: string): string {
  const name = UNIT_TEMPLATES[templateId]?.name ?? templateId;
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
}

export function StartingForcesSection() {
  const forces = useEditorStore((s) => s.forces);
  const setForces = useEditorStore((s) => s.setForces);
  const armTemplate = useEditorStore((s) => s.armTemplate);
  const placeAtHex = useEditorStore((s) => s.placeAtHex);
  const removePlaced = useEditorStore((s) => s.removePlaced);
  const updatePlacedFacing = useEditorStore((s) => s.updatePlacedFacing);
  const addToSetupPool = useEditorStore((s) => s.addToSetupPool);
  const removeFromSetupPool = useEditorStore((s) => s.removeFromSetupPool);
  const setSetupFirstSide = useEditorStore((s) => s.setSetupFirstSide);
  const setSetupInstructions = useEditorStore((s) => s.setSetupInstructions);
  const map = useEditorStore((s) => s.map);
  const [setupSearch, setSetupSearch] = useState('');
  const [setupNationFilter, setSetupNationFilter] = useState('all');
  const [setupDraftSide, setSetupDraftSide] = useState<'A' | 'B'>('A');
  const [setupDraftFacing, setSetupDraftFacing] = useState<Facing>(0);
  const { hexes: mapHexes, error: mapError } = useMemo(() => assembledMap(map), [map]);
  const mapOverlays = useMemo(() => assembledMapOverlays(map), [map]);
  const rotationClusters = useMemo(() => assembledRotationClusters(map), [map]);

  const markers = useMemo<EditorMarker[]>(() => {
    const byHex = new Map<string, typeof forces.placed>();
    for (const p of forces.placed) {
      const list = byHex.get(p.hexId) ?? [];
      list.push(p);
      byHex.set(p.hexId, list);
    }
    return [...byHex.entries()].map(([hexId, list]) => ({
      hexId,
      kind: 'unit',
      label: list.length > 1 ? `${abbrev(list[0]!.templateId)}+${list.length - 1}` : abbrev(list[0]!.templateId),
      color: SIDE_COLOR[list[0]!.side],
    }));
  }, [forces.placed]);

  const armedName = forces.armedTemplateId ? UNIT_TEMPLATES[forces.armedTemplateId]?.name : null;

  return (
    <div className="editor__section editor__section--map">
      <div className="editor__map-body">
        <div className="editor__map-board">
          <EditorBoardOrError
            error={mapError}
            hexes={mapHexes}
            markers={markers}
            onHexClick={(hex) => placeAtHex(hex)}
            mapOverlays={mapOverlays}
            rotationClusters={rotationClusters}
          />
        </div>
        <div className="editor__map-tools">
          <UnitPicker
            search={forces.search}
            onSearchChange={(search) => setForces({ search })}
            nationFilter={forces.nationFilter}
            onNationFilterChange={(nationFilter) => setForces({ nationFilter })}
            selectedTemplateId={forces.armedTemplateId}
            onPick={(templateId) => armTemplate(templateId)}
          />
          <div className="editor__placement-panel">
            <p className="editor__status-line">
              {armedName ? `Armed: ${armedName} — click a hex to place` : 'Click a unit above to arm it'}
            </p>
            <div className="editor__toggle-row">
              {(['A', 'B'] as const).map((side) => (
                <button
                  key={side}
                  className={`editor__toggle${forces.armedSide === side ? ' editor__toggle--active' : ''}`}
                  onClick={() => setForces({ armedSide: side })}
                >
                  Side {side}
                </button>
              ))}
            </div>
            <label className="editor__field-label">
              Facing
              <select
                value={forces.armedFacing}
                onChange={(e) => setForces({ armedFacing: parseInt(e.target.value, 10) as Facing })}
              >
                {FACING_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
      <table className="editor__table">
        <thead>
          <tr>
            <th>Side</th>
            <th>Unit</th>
            <th>Hex</th>
            <th>Facing</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {forces.placed.map((p) => (
            <tr key={p.id}>
              <td>{p.side}</td>
              <td>{UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId}</td>
              <td>{p.hexId}</td>
              <td>
                <select
                  value={p.facing}
                  onChange={(e) => updatePlacedFacing(p.id, parseInt(e.target.value, 10) as Facing)}
                >
                  {FACING_LABELS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button onClick={() => removePlaced(p.id)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Setup Pool (pre-Mission Setup phase)</h3>
      <p className="editor__caption">
        Instead of a fixed Hex (above), a Unit here is placed by the PLAYER before Round 1 begins:
        one side places its entire pool first, then the other side places its own — then the real
        Round 1/Initiative sequence starts. A Mission may freely mix fixed-location Units and a
        Setup Pool together.
      </p>
      <label className="editor__field-label">
        Sets Up First
        <div className="editor__toggle-row">
          {(['A', 'B'] as const).map((side) => (
            <button
              key={side}
              className={`editor__toggle${forces.setupFirstSide === side ? ' editor__toggle--active' : ''}`}
              onClick={() => setSetupFirstSide(side)}
            >
              Side {side}
            </button>
          ))}
        </div>
      </label>

      <div className="editor__toggle-row">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            className={`editor__toggle${setupDraftSide === side ? ' editor__toggle--active' : ''}`}
            onClick={() => setSetupDraftSide(side)}
          >
            Add to Side {side}
          </button>
        ))}
      </div>
      <label className="editor__field-label">
        Facing (applies to next Add)
        <select value={setupDraftFacing} onChange={(e) => setSetupDraftFacing(parseInt(e.target.value, 10) as Facing)}>
          {FACING_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <UnitPicker
        search={setupSearch}
        onSearchChange={setSetupSearch}
        nationFilter={setupNationFilter}
        onNationFilterChange={setSetupNationFilter}
        onPick={(templateId) => addToSetupPool(setupDraftSide, templateId, setupDraftFacing)}
        pickLabel="+ Add"
      />

      <h4>In the Setup Pool ({forces.setupPool.length})</h4>
      {forces.setupPool.length === 0 ? (
        <p className="editor__empty">No Setup Pool Units yet — this Mission has no pre-Round-1 setup phase.</p>
      ) : (
        <ul className="editor__placed-list">
          {forces.setupPool.map((p) => (
            <li key={p.id}>
              Side {p.side} — {UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId} — facing {FACING_LABELS[p.facing]}
              <button onClick={() => removeFromSetupPool(p.id)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <label className="editor__field-label">
        Setup Instructions
        <textarea
          value={forces.setupInstructions}
          placeholder='e.g. "Side B sets up first, within 3 hexes of the south edge."'
          onChange={(e) => setSetupInstructions(e.target.value)}
        />
      </label>
    </div>
  );
}
