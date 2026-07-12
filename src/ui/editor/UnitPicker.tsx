/**
 * Shared unit-catalog picker (Starting Forces + Reinforcements sections):
 * search + nation filter + a scrollable card list. This only picks from the
 * existing `UNIT_TEMPLATES` catalog — it is not a stat-authoring form (a
 * separate tool is planned for that).
 */
import { ALL_UNIT_TEMPLATES } from '../../data/units';
import { NATIONS } from '../../data/nations';

export interface UnitPickerProps {
  search: string;
  onSearchChange: (v: string) => void;
  nationFilter: string; // 'all' | NationId
  onNationFilterChange: (v: string) => void;
  /** Highlights this card as "armed"/selected — arm-then-click-hex mode (Starting Forces). */
  selectedTemplateId?: string | null;
  onPick: (templateId: string) => void;
  /** If set, each card gets an inline button with this label (Reinforcements' "+ Add") instead
   *  of the whole card being clickable/armable. */
  pickLabel?: string;
}

export function UnitPicker({
  search,
  onSearchChange,
  nationFilter,
  onNationFilterChange,
  selectedTemplateId,
  onPick,
  pickLabel,
}: UnitPickerProps) {
  const q = search.trim().toLowerCase();
  const results = ALL_UNIT_TEMPLATES.filter(
    (t) => (nationFilter === 'all' || t.nation === nationFilter) && (!q || t.name.toLowerCase().includes(q)),
  );

  return (
    <div className="editor__unit-picker">
      <input
        type="text"
        placeholder="Search units…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="editor__field"
      />
      <select value={nationFilter} onChange={(e) => onNationFilterChange(e.target.value)} className="editor__field">
        <option value="all">All nations</option>
        {Object.values(NATIONS).map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      <div className="editor__unit-list">
        {results.length === 0 && <p className="editor__empty">No units match.</p>}
        {results.map((t) => {
          const armed = selectedTemplateId === t.id;
          return (
            <div
              key={t.id}
              className={`editor__unit-card${armed ? ' editor__unit-card--armed' : ''}`}
              style={{ borderLeftColor: NATIONS[t.nation]?.color ?? '#8b8871' }}
              onClick={pickLabel ? undefined : () => onPick(t.id)}
            >
              <div className="editor__unit-card-head">
                <span className="editor__unit-name">{t.name}</span>
                <span className="editor__unit-nation">{NATIONS[t.nation]?.name ?? t.nation}</span>
              </div>
              <div className="editor__unit-stats">
                FP {t.fp.red}
                {t.fp.blue ? `/${t.fp.blue}` : ''} · DR {t.dr.front}/{t.dr.flank} · MV {t.move} · RNG {t.range} · VP{' '}
                {t.vp}
              </div>
              {pickLabel && (
                <button className="editor__unit-add" onClick={() => onPick(t.id)}>
                  {pickLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
