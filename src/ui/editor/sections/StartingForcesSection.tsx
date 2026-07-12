import { useMemo } from 'react';
import { assembledMap, useEditorStore } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { SIDE_COLOR } from '../../theme';
import { EditorBoard, type EditorMarker } from '../EditorBoard';
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
  const map = useEditorStore((s) => s.map);
  const mapHexes = useMemo(() => assembledMap(map).hexes, [map]);

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
          <EditorBoard hexes={mapHexes} markers={markers} onHexClick={(hex) => placeAtHex(hex)} />
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
    </div>
  );
}
