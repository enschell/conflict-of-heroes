/**
 * Mission Editor shell: sidebar nav + top bar (Export always visible) + the
 * active section. Field-by-field behavior per
 * `docs/design_handoff_mission_editor/README.md`, ported onto the real engine
 * types instead of the design's placeholder ones.
 */
import { useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import type { EditorSection } from '../../state/editorStore';
import { MISSION_CATALOG } from '../../data/missions/catalog';
import { MissionInfoSection } from './sections/MissionInfoSection';
import { MapSection } from './sections/MapSection';
import { StartingForcesSection } from './sections/StartingForcesSection';
import { ReinforcementsSection } from './sections/ReinforcementsSection';
import { VictorySection } from './sections/VictorySection';
import { AdvancedSection } from './sections/AdvancedSection';
import { downloadMissionSource } from '../../data/editor/emitMissionSource';

const NAV: { id: EditorSection; label: string; soon?: boolean }[] = [
  { id: 'info', label: 'Mission Info' },
  { id: 'map', label: 'Map' },
  { id: 'forces', label: 'Starting Forces' },
  { id: 'reinforcements', label: 'Reinforcements' },
  { id: 'victory', label: 'Victory Conditions' },
  { id: 'advanced', label: 'Advanced', soon: true },
];

export function MissionEditor({ onExit }: { onExit: () => void }) {
  const section = useEditorStore((s) => s.section);
  const setSection = useEditorStore((s) => s.setSection);
  const title = useEditorStore((s) => s.info.title);
  const loadMission = useEditorStore((s) => s.loadMission);
  const [loadPick, setLoadPick] = useState(Object.keys(MISSION_CATALOG)[0] ?? '');

  const sectionLabel = NAV.find((n) => n.id === section)?.label ?? section;

  return (
    <div className="editor">
      <aside className="editor__sidebar">
        <div className="editor__brand">MISSION EDITOR</div>
        <div className="editor__mission-title">{title || 'Untitled Mission'}</div>
        <div className="editor__draft-caption">[ draft // unsaved ]</div>
        <nav className="editor__nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`editor__nav-row${section === n.id ? ' editor__nav-row--active' : ''}${
                n.soon ? ' editor__nav-row--soon' : ''
              }`}
              onClick={() => setSection(n.id)}
            >
              {n.label}
              {n.soon && <span className="editor__soon-badge">SOON</span>}
            </button>
          ))}
        </nav>

        <div className="editor__section" style={{ padding: '0 0.9rem' }}>
          <label className="editor__field-label">
            Load Existing Mission
            <select value={loadPick} onChange={(e) => setLoadPick(e.target.value)}>
              {Object.values(MISSION_CATALOG).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="editor__toggle"
            disabled={!loadPick}
            onClick={() => {
              if (
                window.confirm(
                  'Load this Mission for editing? This discards any unsaved changes in the editor. ' +
                    'Note: the Map section will show one merged board (rotation/multi-board structure ' +
                    "isn't recoverable from an exported Mission) — everything else round-trips exactly.",
                )
              ) {
                loadMission(loadPick);
              }
            }}
          >
            Load for Editing
          </button>
        </div>

        <div style={{ flex: 1 }} />
        <button className="editor__exit" onClick={onExit}>
          ← Exit Editor
        </button>
      </aside>
      <main className="editor__main">
        <div className="editor__topbar">
          <span className="editor__topbar-label">// SECTION: {sectionLabel.toUpperCase()}</span>
          <button className="editor__export" onClick={() => downloadMissionSource(useEditorStore.getState())}>
            Export Mission
          </button>
        </div>
        <div className="editor__content">
          {section === 'info' && <MissionInfoSection />}
          {section === 'map' && <MapSection />}
          {section === 'forces' && <StartingForcesSection />}
          {section === 'reinforcements' && <ReinforcementsSection />}
          {section === 'victory' && <VictorySection />}
          {section === 'advanced' && <AdvancedSection />}
        </div>
      </main>
    </div>
  );
}
