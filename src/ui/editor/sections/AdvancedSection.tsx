import { useEditorStore } from '../../../state/editorStore';
import { BATTLE_CARDS } from '../../../data/cards/battleCards';
import { WEAPON_CARDS } from '../../../data/cards/weaponCards';
import { VETERAN_CARDS } from '../../../data/cards/veteranCards';

const OVERLAY_OPTIONS = ['Mud Season', 'Winter Snow', 'Night'];
const BATTLE_CARD_LIST = Object.values(BATTLE_CARDS);
const WEAPON_AND_VETERAN_LIST = [...Object.values(WEAPON_CARDS), ...Object.values(VETERAN_CARDS)];

export function AdvancedSection() {
  const cards = useEditorStore((s) => s.cards);
  const toggleBattleCardId = useEditorStore((s) => s.toggleBattleCardId);
  const setDrawPerRound = useEditorStore((s) => s.setDrawPerRound);
  const toggleInitialHandCard = useEditorStore((s) => s.toggleInitialHandCard);
  const toggleObaAllowedRound = useEditorStore((s) => s.toggleObaAllowedRound);
  const setMissionCardText = useEditorStore((s) => s.setMissionCardText);

  const advanced = useEditorStore((s) => s.advanced);
  const setAirSupport = useEditorStore((s) => s.setAirSupport);
  const toggleOverlay = useEditorStore((s) => s.toggleOverlay);
  const roundsTotal = useEditorStore((s) => s.info.roundsTotal);

  const missionCardIds = BATTLE_CARD_LIST.filter((c) => c.type === 'mission' && cards.battleCardIds.includes(c.id));

  return (
    <div className="editor__section">
      <h3>Battle Cards (§8.1)</h3>
      <p className="editor__caption">Pick which numbered Battle Cards are included in this Mission's shared deck.</p>
      <div className="editor__round-checks">
        {BATTLE_CARD_LIST.map((c) => (
          <label key={c.id} title={c.effectText}>
            <input type="checkbox" checked={cards.battleCardIds.includes(c.id)} onChange={() => toggleBattleCardId(c.id)} />
            #{c.id} {c.name} (×{c.count})
          </label>
        ))}
      </div>

      <h4>Draw counts per side (§9.8)</h4>
      <div className="editor__side-cards">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="editor__stat-card">
            <span className="editor__field-label">Side {side}</span>
            <label>
              Round 1 draw
              <input
                type="number"
                value={cards.drawPerRound[side].round1}
                onChange={(e) => setDrawPerRound(side, { round1: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
            <label>
              Each round after
              <input
                type="number"
                value={cards.drawPerRound[side].eachRoundAfter}
                onChange={(e) => setDrawPerRound(side, { eachRoundAfter: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
          </div>
        ))}
      </div>

      {missionCardIds.length > 0 && (
        <>
          <h4>Mission-specific text for Mission-icon Cards (§8.7)</h4>
          <p className="editor__caption">These cards print "See Mission Setup" — author the real text here.</p>
          {missionCardIds.map((c) => (
            <label key={c.id} className="editor__field-label">
              #{c.id} {c.name}
              <input
                type="text"
                value={cards.missionCardText[c.id] ?? ''}
                onChange={(e) => setMissionCardText(c.id, e.target.value)}
              />
            </label>
          ))}
        </>
      )}

      <h3>Weapon &amp; Veteran Cards (§8.2/§8.3)</h3>
      <p className="editor__caption">Mission-issued starting hands — each side begins the Mission already holding these (not drawn per-round).</p>
      <div className="editor__side-cards">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className="editor__stat-card">
            <span className="editor__field-label">Side {side}</span>
            <div className="editor__round-checks">
              {WEAPON_AND_VETERAN_LIST.map((c) => (
                <label key={c.id} title={c.effectText}>
                  <input
                    type="checkbox"
                    checked={cards.initialHand[side].includes(c.id)}
                    onChange={() => toggleInitialHandCard(side, c.id)}
                  />
                  #{c.id} {c.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3>Off-Board Artillery (OBA) (§13.4)</h3>
      <p className="editor__field-label">Rounds OBA may be used at all (empty = any Round)</p>
      <div className="editor__round-checks">
        {Array.from({ length: roundsTotal }, (_, i) => i + 1).map((r) => (
          <label key={r}>
            <input type="checkbox" checked={cards.obaAllowedRounds.includes(r)} onChange={() => toggleObaAllowedRound(r)} />
            {r}
          </label>
        ))}
      </div>

      <div className="editor__warning-banner">⚠ Still coming later — Air Support and Terrain Overlays below are not yet functional in the game engine</div>

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
