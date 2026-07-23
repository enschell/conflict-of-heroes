/**
 * Shared unit-catalog picker (Starting Forces + Reinforcements sections):
 * search + nation filter + a scrollable card list. This only picks from the
 * existing `UNIT_TEMPLATES` catalog — it is not a stat-authoring form (a
 * separate tool is planned for that).
 */
import { ALL_UNIT_TEMPLATES } from '../../data/units';
import { NATIONS } from '../../data/nations';
import type { NationId } from '../../engine/types';

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
  /**
   * Restrict the catalog to one SIDE's nations (Mission Info tab's own
   * per-side nation picks) — the side-column layout gives each side its own
   * picker, so Side A's picker should never offer Side B's units. An empty/
   * omitted list means no restriction (and a side with no nations configured
   * yet falls back to the full catalog rather than an empty, confusing list).
   * With exactly one nation the dropdown disappears entirely; with several,
   * its options are limited to just those nations.
   */
  nations?: NationId[];
}

export function UnitPicker({
  search,
  onSearchChange,
  nationFilter,
  onNationFilterChange,
  selectedTemplateId,
  onPick,
  pickLabel,
  nations,
}: UnitPickerProps) {
  const q = search.trim().toLowerCase();
  const sideNations = nations && nations.length > 0 ? nations : null;
  const results = ALL_UNIT_TEMPLATES.filter(
    (t) =>
      (!sideNations || sideNations.includes(t.nation)) &&
      (nationFilter === 'all' || t.nation === nationFilter) &&
      (!q || t.name.toLowerCase().includes(q)),
  );
  const dropdownNations = sideNations
    ? Object.values(NATIONS).filter((n) => sideNations.includes(n.id))
    : Object.values(NATIONS);

  return (
    <div className="editor__unit-picker">
      <input
        type="text"
        placeholder="Search units…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="editor__field"
      />
      {dropdownNations.length > 1 && (
        <select value={nationFilter} onChange={(e) => onNationFilterChange(e.target.value)} className="editor__field">
          <option value="all">{sideNations ? 'All (this side)' : 'All nations'}</option>
          {dropdownNations.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      )}
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
