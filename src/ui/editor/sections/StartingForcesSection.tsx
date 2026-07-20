/**
 * Starting Forces: the board in the middle, Side A's whole authoring column
 * on the LEFT and Side B's on the RIGHT (user-requested layout — side-by-side
 * instead of stacked, so each side's fixed placements AND Setup Pool stay
 * visually together and vertical scrolling stays short). Each column owns ONE
 * unit picker restricted to that side's nations (Mission Info tab), with a
 * destination toggle choosing whether a picked unit is armed for on-map
 * placement or added straight to the side's Setup Pool.
 */
import { useMemo, useState } from 'react';
import { MINE_ARM_ID, assembledMap, assembledMapOverlays, assembledRotationClusters, useEditorStore } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';
import { NATIONS } from '../../../data/nations';
import { SIDE_COLOR } from '../../theme';
import { EditorBoardOrError, type EditorMarker } from '../EditorBoard';
import { UnitPicker } from '../UnitPicker';
import { FACING_LABELS } from '../constants';
import type { Facing, SideId } from '../../../engine/types';

function abbrev(templateId: string): string {
  const name = UNIT_TEMPLATES[templateId]?.name ?? templateId;
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
}

const OBSTACLE_BADGE: Record<string, string> = { barbedWire: 'WIRE', mines: 'MINES', roadBlock: 'BLOCK' };

/** One side's full authoring column: picker + destination + lists. */
function SideColumn({ side }: { side: SideId }) {
  const forces = useEditorStore((s) => s.forces);
  const setForces = useEditorStore((s) => s.setForces);
  const removePlaced = useEditorStore((s) => s.removePlaced);
  const updatePlacedFacing = useEditorStore((s) => s.updatePlacedFacing);
  const addToSetupPool = useEditorStore((s) => s.addToSetupPool);
  const addMineToSetupPool = useEditorStore((s) => s.addMineToSetupPool);
  const removeFromSetupPool = useEditorStore((s) => s.removeFromSetupPool);
  const nations = useEditorStore((s) => (side === 'A' ? s.info.sideA.nations : s.info.sideB.nations));

  // Per-column drafts: each side keeps its own facing/hidden/destination, so
  // working one side never disturbs the other's settings.
  const [dest, setDest] = useState<'map' | 'pool'>('map');
  const [facing, setFacing] = useState<Facing>(0);
  const [hidden, setHidden] = useState(false);
  const [search, setSearch] = useState('');
  const [nationFilter, setNationFilter] = useState('all');

  const armsThisSide = forces.armedSide === side && forces.armedTemplateId != null;
  const nationNames = nations.length ? nations.map((n) => NATIONS[n]?.name ?? n).join(', ') : 'no nations set';

  const pick = (templateId: string) => {
    if (dest === 'pool') {
      addToSetupPool(side, templateId, facing, hidden);
      return;
    }
    // Arm-toggle for on-map placement; facing/hidden ride along so a later
    // board click places with exactly what this column currently shows.
    if (armsThisSide && forces.armedTemplateId === templateId) {
      setForces({ armedTemplateId: null });
    } else {
      setForces({ armedTemplateId: templateId, armedSide: side, armedFacing: facing, armedHidden: hidden });
    }
  };

  const pickMine = () => {
    if (dest === 'pool') {
      addMineToSetupPool(side);
      return;
    }
    if (armsThisSide && forces.armedTemplateId === MINE_ARM_ID) {
      setForces({ armedTemplateId: null });
    } else {
      setForces({ armedTemplateId: MINE_ARM_ID, armedSide: side });
    }
  };

  const placed = forces.placed.filter((p) => p.side === side);
  const pool = forces.setupPool.filter((p) => p.side === side);

  return (
    <div className="editor__side-col" style={{ borderTopColor: SIDE_COLOR[side] }}>
      <h3 className="editor__side-col-head">
        Side {side} <span className="editor__side-col-nations">({nationNames})</span>
      </h3>

      <div className="editor__toggle-row">
        <button
          className={`editor__toggle${dest === 'map' ? ' editor__toggle--active' : ''}`}
          onClick={() => setDest('map')}
          title="Pick a unit, then click a board hex to place it at a fixed location"
        >
          Place on Map
        </button>
        <button
          className={`editor__toggle${dest === 'pool' ? ' editor__toggle--active' : ''}`}
          onClick={() => setDest('pool')}
          title="Picked units go into this side's Setup Pool — the player places them before Round 1"
        >
          Setup Pool
        </button>
      </div>

      <div className="editor__wave-row">
        <label className="editor__field-label">
          Facing
          <select
            value={facing}
            onChange={(e) => {
              const f = parseInt(e.target.value, 10) as Facing;
              setFacing(f);
              if (armsThisSide) setForces({ armedFacing: f });
            }}
          >
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
              checked={hidden}
              onChange={(e) => {
                setHidden(e.target.checked);
                if (armsThisSide) setForces({ armedHidden: e.target.checked });
              }}
            />{' '}
            Hidden (§11)
          </span>
        </label>
      </div>

      <div className="editor__wave-row">
        <button
          className={`editor__toggle${dest === 'map' && armsThisSide && forces.armedTemplateId === MINE_ARM_ID ? ' editor__toggle--active' : ''}`}
          onClick={pickMine}
        >
          {dest === 'pool' ? '+ Mines → pool' : 'Mines'} (hidden)
        </button>
        <label className="editor__field-label">
          Mines Hit# (§17.10)
          <input
            type="number"
            min={2}
            max={12}
            value={forces.mineHitNumber}
            onChange={(e) => setForces({ mineHitNumber: parseInt(e.target.value, 10) || 8 })}
          />
        </label>
      </div>

      <UnitPicker
        search={search}
        onSearchChange={setSearch}
        nationFilter={nationFilter}
        onNationFilterChange={setNationFilter}
        nations={nations}
        selectedTemplateId={dest === 'map' && armsThisSide ? forces.armedTemplateId : null}
        onPick={pick}
        pickLabel={dest === 'pool' ? '+ Add' : undefined}
      />

      <h4>Placed on map ({placed.length})</h4>
      {placed.length === 0 ? (
        <p className="editor__empty">None yet — arm a unit above, then click a hex.</p>
      ) : (
        <ul className="editor__placed-list">
          {placed.map((p) => (
            <li key={p.id}>
              {UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId}
              {p.hidden ? ' (hidden)' : ''} — {p.hexId}
              <select value={p.facing} onChange={(e) => updatePlacedFacing(p.id, parseInt(e.target.value, 10) as Facing)}>
                {FACING_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <button onClick={() => removePlaced(p.id)}>×</button>
            </li>
          ))}
        </ul>
      )}

      <h4>Setup Pool ({pool.length})</h4>
      {pool.length === 0 ? (
        <p className="editor__empty">Empty — no pre-Round-1 placement for this side.</p>
      ) : (
        <ul className="editor__placed-list">
          {pool.map((p) => (
            <li key={p.id}>
              {p.mine
                ? `Mines (Hit# ${p.mine.hitNumber})`
                : `${UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId} — facing ${FACING_LABELS[p.facing]}`}
              {p.hidden ? ' — hidden' : ''}
              <button onClick={() => removeFromSetupPool(p.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StartingForcesSection() {
  const forces = useEditorStore((s) => s.forces);
  const placeAtHex = useEditorStore((s) => s.placeAtHex);
  const setSetupFirstSide = useEditorStore((s) => s.setSetupFirstSide);
  const setSetupInstructions = useEditorStore((s) => s.setSetupInstructions);
  const map = useEditorStore((s) => s.map);
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
    const list: EditorMarker[] = [...byHex.entries()].map(([hexId, units]) => ({
      hexId,
      kind: 'unit',
      label: units.length > 1 ? `${abbrev(units[0]!.templateId)}+${units.length - 1}` : abbrev(units[0]!.templateId),
      color: SIDE_COLOR[units[0]!.side],
      // Real counter artwork on the authoring board (same UnitCounter as live
      // play) — stacks show the first unit's counter + the ×N badge.
      unit: { templateId: units[0]!.templateId, side: units[0]!.side, facing: units[0]!.facing, count: units.length },
    }));
    // Obstacles too (shared record with the Map section's paint tool), so a
    // Mines token placed from THIS tab is visible here, not only on the Map
    // tab — hidden mines get a '?' suffix as the authoring-side reminder.
    for (const [hexId, ob] of Object.entries(map.obstacles)) {
      list.push({
        hexId,
        kind: `obstacle:${ob.kind}`,
        label: ob.hidden ? `${OBSTACLE_BADGE[ob.kind] ?? ob.kind}?` : (OBSTACLE_BADGE[ob.kind] ?? ob.kind),
        color: SIDE_COLOR[ob.side],
      });
    }
    return list;
  }, [forces.placed, map.obstacles]);

  const armedName =
    forces.armedTemplateId === MINE_ARM_ID
      ? `Mines (Hit# ${forces.mineHitNumber}, hidden)`
      : forces.armedTemplateId
        ? UNIT_TEMPLATES[forces.armedTemplateId]?.name
        : null;

  return (
    <div className="editor__section editor__section--map">
      <div className="editor__forces-grid">
        <SideColumn side="A" />
        <div>
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
          <p className="editor__status-line editor__forces-status">
            {armedName
              ? `Armed for Side ${forces.armedSide}: ${armedName} — click a hex to place`
              : 'Pick a unit in a side column ("Place on Map") to arm it, then click a hex'}
          </p>
        </div>
        <SideColumn side="B" />
      </div>

      <h3>Pre-Mission Setup</h3>
      <p className="editor__caption">
        A Setup Pool unit has no fixed Hex — the PLAYER places it before Round 1 begins: one side
        places its entire pool first, then the other side places its own, then the real Round 1/
        Initiative sequence starts. A Mission may freely mix fixed-location units and a Setup Pool.
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
