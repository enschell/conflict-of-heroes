import { useEditorStore } from '../../../state/editorStore';
import { UNIT_TEMPLATES } from '../../../data/units';

const OVERLAY_OPTIONS = ['Mud Season', 'Winter Snow', 'Night'];

export function AdvancedSection() {
  const advanced = useEditorStore((s) => s.advanced);
  const setBattleCards = useEditorStore((s) => s.setBattleCards);
  const toggleHidden = useEditorStore((s) => s.toggleHidden);
  const toggleObaRound = useEditorStore((s) => s.toggleObaRound);
  const addObaStrike = useEditorStore((s) => s.addObaStrike);
  const updateObaStrike = useEditorStore((s) => s.updateObaStrike);
  const removeObaStrike = useEditorStore((s) => s.removeObaStrike);
  const setAirSupport = useEditorStore((s) => s.setAirSupport);
  const toggleOverlay = useEditorStore((s) => s.toggleOverlay);
  const roundsTotal = useEditorStore((s) => s.info.roundsTotal);
  const placed = useEditorStore((s) => s.forces.placed);
  const waves = useEditorStore((s) => s.reinforcements.waves);

  const allUnits = [
    ...placed.map((p) => ({ id: p.id, label: `${UNIT_TEMPLATES[p.templateId]?.name ?? p.templateId} (${p.id})` })),
    ...Object.values(waves)
      .flat()
      .flatMap((w) => w.units.map((u) => ({ id: u.id, label: `${UNIT_TEMPLATES[u.templateId]?.name ?? u.templateId} (${u.id})` }))),
  ];

  return (
    <div className="editor__section">
      <div className="editor__warning-banner">⚠ Coming later — not yet functional in the game engine</div>

      <h3>Battle Cards</h3>
      <div className="editor__side-cards">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="editor__stat-card">
            <span className="editor__field-label">Side {side}</span>
            <label>
              Round 1 draw
              <input
                type="number"
                value={advanced.battleCards[side].round1}
                onChange={(e) => setBattleCards(side, { round1: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
            <label>
              Each round after
              <input
                type="number"
                value={advanced.battleCards[side].eachRoundAfter}
                onChange={(e) => setBattleCards(side, { eachRoundAfter: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
          </div>
        ))}
      </div>

      <h3>Hidden Units</h3>
      {allUnits.length === 0 ? (
        <p className="editor__empty">No placed or reinforcement units yet.</p>
      ) : (
        <ul className="editor__checklist">
          {allUnits.map((u) => (
            <li key={u.id}>
              <label>
                <input type="checkbox" checked={advanced.hiddenIds.includes(u.id)} onChange={() => toggleHidden(u.id)} />
                {u.label}
              </label>
            </li>
          ))}
        </ul>
      )}

      <h3>Off-Board Artillery (OBA)</h3>
      <p className="editor__field-label">Rounds OBA may be used at all</p>
      <div className="editor__round-checks">
        {Array.from({ length: roundsTotal }, (_, i) => i + 1).map((r) => (
          <label key={r}>
            <input type="checkbox" checked={advanced.obaAllowedRounds.includes(r)} onChange={() => toggleObaRound(r)} />
            {r}
          </label>
        ))}
      </div>
      <h4>Planned Strikes</h4>
      <ul className="editor__placed-list">
        {advanced.obaStrikes.map((o) => (
          <li key={o.id}>
            Planned round
            <input
              type="number"
              min={1}
              value={o.plannedRound}
              onChange={(e) => updateObaStrike(o.id, parseInt(e.target.value, 10) || 1)}
            />
            <span className="editor__caption"> → resolves round {o.plannedRound + 1}</span>
            <button onClick={() => removeObaStrike(o.id)}>×</button>
          </li>
        ))}
      </ul>
      <button onClick={addObaStrike}>+ Add strike</button>

      <h3>Air Support</h3>
      <div className="editor__side-cards">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="editor__stat-card">
            <span className="editor__field-label">Side {side} (provisional)</span>
            <input
              type="number"
              value={advanced.airSupport[side]}
              onChange={(e) => setAirSupport(side, e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
            />
          </div>
        ))}
      </div>

      <h3>Terrain Overlays</h3>
      <p className="editor__caption">
        Map selection, rotation, and abutment are now real features of the Map section (§C) — see there instead.
      </p>
      <div className="editor__round-checks">
        {OVERLAY_OPTIONS.map((name) => (
          <label key={name}>
            <input type="checkbox" checked={advanced.overlays.includes(name)} onChange={() => toggleOverlay(name)} />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}
