/**
 * Save/load manager (M4): named localStorage slots plus JSON file export/import.
 * All persistence goes through the store (which threads it past the engine);
 * this component is just the UI.
 */
import { useState } from 'react';
import { useGame } from '../state/store';
import { listSlots, type SlotMeta } from '../state/persistence';

function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function SavesDialog({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game);
  const saveToSlot = useGame((s) => s.saveToSlot);
  const loadFromSlot = useGame((s) => s.loadFromSlot);
  const deleteSlotByName = useGame((s) => s.deleteSlotByName);
  const exportCurrent = useGame((s) => s.exportCurrent);
  const importFromText = useGame((s) => s.importFromText);

  const [slots, setSlots] = useState<SlotMeta[]>(() => listSlots());
  const [name, setName] = useState(game ? `FF1 R${game.round}` : 'save');
  const [msg, setMsg] = useState('');

  const refresh = () => setSlots(listSlots());

  const onSave = () => {
    if (!name.trim()) {
      setMsg('Enter a name first.');
      return;
    }
    setMsg(saveToSlot(name) ? `Saved "${name.trim()}".` : 'Save failed (storage full?).');
    refresh();
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const ok = importFromText(await readFileText(file));
      if (ok) onClose();
      else setMsg('That file is not a valid save.');
    } catch {
      setMsg('Could not read that file.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="saves" onClick={(e) => e.stopPropagation()}>
        <h3>Saves</h3>

        <div className="saves__save">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="save name"
            aria-label="save name"
          />
          <button className="primary" onClick={onSave} disabled={!game}>
            Save
          </button>
        </div>

        <div className="saves__list">
          {slots.length === 0 && <p className="dim">No saved games yet.</p>}
          {slots.map((s) => (
            <div key={s.name} className="saves__row">
              <div className="saves__meta">
                <b>{s.name}</b>
                <span className="dim">
                  {' '}
                  · R{s.round}/{s.roundsTotal}
                  {s.phase === 'gameOver' ? ' · finished' : ''} ·{' '}
                  {new Date(s.savedAt).toLocaleString()}
                </span>
              </div>
              <div className="saves__row-actions">
                <button onClick={() => loadFromSlot(s.name)}>Load</button>
                <button
                  onClick={() => {
                    deleteSlotByName(s.name);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="saves__io">
          <button
            disabled={!game}
            onClick={() => downloadJson(`coh-${name.trim() || 'save'}.json`, exportCurrent())}
          >
            Export to file
          </button>
          <label className="filebtn">
            Import from file
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
          </label>
        </div>

        {msg && <p className="saves__msg">{msg}</p>}
        <button className="link" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  );
}
