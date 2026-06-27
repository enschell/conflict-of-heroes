/**
 * "Start of turn N" banner shown when a new round begins. Default: the player
 * must click OK to proceed. Set TURN_BANNER_AUTOFADE = true to instead fade it
 * automatically after 3 seconds.
 */
import { useEffect } from 'react';
import { useGame } from '../state/store';

export const TURN_BANNER_AUTOFADE = false;

export function TurnBanner() {
  const banner = useGame((s) => s.turnBanner);
  const dismiss = useGame((s) => s.dismissTurnBanner);

  useEffect(() => {
    if (banner && TURN_BANNER_AUTOFADE) {
      const t = setTimeout(dismiss, 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [banner, dismiss]);

  if (!banner) return null;

  return (
    <div className="modal-backdrop">
      <div className="turn-banner">
        <div className="turn-banner__title">Start of turn {banner.round}</div>
        {!TURN_BANNER_AUTOFADE && (
          <button className="primary" onClick={dismiss}>
            OK
          </button>
        )}
      </div>
    </div>
  );
}
