import { useEditorStore } from '../../../state/editorStore';
import { NATIONS } from '../../../data/nations';
import type { SideId } from '../../../engine/types';

function SideCard({ side }: { side: SideId }) {
  const sideState = useEditorStore((s) => (side === 'A' ? s.info.sideA : s.info.sideB));
  const initiative = useEditorStore((s) => s.info.initiative);
  const setInfoSide = useEditorStore((s) => s.setInfoSide);
  const addNation = useEditorStore((s) => s.addNation);
  const removeNation = useEditorStore((s) => s.removeNation);

  const available = Object.values(NATIONS).filter((n) => !sideState.nations.includes(n.id));

  return (
    <div className={`editor__side-card editor__side-card--${side}`}>
      <div className="editor__side-head">
        <span className="editor__side-swatch" />
        <span className="editor__side-label">SIDE {side}</span>
        {initiative === side && <span className="editor__initiative-badge">INITIATIVE R1</span>}
      </div>
      <div className="editor__side-stats">
        <label className="editor__stat-box">
          <span>CAPs</span>
          <input
            type="number"
            value={sideState.caps}
            onChange={(e) => setInfoSide(side, { caps: parseInt(e.target.value, 10) || 0 })}
          />
        </label>
        <label className="editor__stat-box">
          <span>VP</span>
          <input
            type="number"
            value={sideState.vp}
            onChange={(e) => setInfoSide(side, { vp: parseInt(e.target.value, 10) || 0 })}
          />
        </label>
      </div>
      <div className="editor__nation-chips">
        {sideState.nations.map((n) => (
          <span key={n} className="editor__chip">
            {NATIONS[n]?.name ?? n}
            <button onClick={() => removeNation(side, n)}>×</button>
          </span>
        ))}
        {available.length > 0 && (
          <select value="" onChange={(e) => e.target.value && addNation(side, e.target.value)}>
            <option value="">+ ADD NATION</option>
            {available.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="editor__field-label">
        Side Orders
        <input
          type="text"
          value={sideState.orders}
          onChange={(e) => setInfoSide(side, { orders: e.target.value })}
        />
      </label>
      <label className="editor__field-label">
        Mission Instructions
        <textarea
          value={sideState.instructions}
          onChange={(e) => setInfoSide(side, { instructions: e.target.value })}
        />
      </label>
    </div>
  );
}

export function MissionInfoSection() {
  const info = useEditorStore((s) => s.info);
  const setInfo = useEditorStore((s) => s.setInfo);

  return (
    <div className="editor__section">
      <input
        className="editor__title-input"
        type="text"
        value={info.title}
        onChange={(e) => setInfo({ title: e.target.value })}
        placeholder="Mission title"
      />
      <label className="editor__field-label">
        General Situation
        <textarea
          value={info.situation}
          onChange={(e) => setInfo({ situation: e.target.value })}
          placeholder="Mission flavor / situation text…"
        />
      </label>
      <div className="editor__side-cards">
        <SideCard side="A" />
        <SideCard side="B" />
      </div>
      <div className="editor__bottom-row">
        <div className="editor__stat-card">
          <span className="editor__field-label">Rounds Total</span>
          <input
            type="number"
            className="editor__big-number"
            value={info.roundsTotal}
            min={1}
            onChange={(e) => setInfo({ roundsTotal: parseInt(e.target.value, 10) || 1 })}
          />
        </div>
        <div className="editor__initiative-picker">
          <span className="editor__field-label">Round 1 Initiative</span>
          <div className="editor__toggle-row">
            {(['A', 'B'] as const).map((side) => (
              <button
                key={side}
                className={`editor__toggle${info.initiative === side ? ' editor__toggle--active' : ''}`}
                onClick={() => setInfo({ initiative: side })}
              >
                Side {side}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
