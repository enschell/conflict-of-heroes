/** Generic confirm modal — currently used to confirm opportunity actions. */
import { useGame } from '../state/store';

export function ConfirmDialog() {
  const pending = useGame((s) => s.pendingConfirm);
  const proceed = useGame((s) => s.confirmProceed);
  const cancel = useGame((s) => s.confirmCancel);
  if (!pending) return null;

  return (
    <div className="modal-backdrop">
      <div className="confirm">
        <p>{pending.message}</p>
        <div className="confirm__actions">
          <button className="primary" onClick={proceed}>
            Yes, continue
          </button>
          <button onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
