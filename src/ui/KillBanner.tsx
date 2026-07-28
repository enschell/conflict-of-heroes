/**
 * A transient banner shown whenever a Unit is destroyed: its counter (via the
 * real `UnitCounter`, same as everywhere else) plus text naming what killed
 * it and at which Hex — pinned to the top of the board area, left for a Side
 * A loss / right for a Side B loss (the destroyed Unit's OWN side, so "your"
 * losses always land on "your" side of the screen).
 *
 * Watches `game.log` for newly-appended 'destroyed' entries — similar
 * detection shape to Board.tsx's OBA-Strike watcher (a round transition
 * always also opens TurnBanner's blocking "Start of turn N" modal, so firing
 * immediately would flash entirely underneath it, unseen — draining waits
 * for TurnBanner to stop blocking). Unlike an OBA Strike, though, a kill has
 * NO guaranteed relationship to a round transition — it can happen from any
 * ordinary Fire/CC Action, most of which never touch `turnBanner` at all, so
 * the draining effect can't rely on `turnBanner` alone to re-run for the
 * common case.
 *
 * The queued kills live in a REF (`queueRef`), not React state — deliberately.
 * A real, live bug caught here: an earlier version stored the queue as state
 * and cleared it (`setQueue([])`) from inside the SAME effect that reads it,
 * with that same state also in the effect's own dependency array. That create
 * a feedback loop — `setQueue([])` changes `queue`, which re-runs the effect,
 * whose CLEANUP (React always cleans up before re-running a changed-deps
 * effect) then cancelled every timer the just-finished run had scheduled,
 * including the "hide after SHOWN_MS" timer for a kill that had only just
 * started displaying — so the banner would show, then never disappear (stuck
 * at the CSS animation's final opacity: 0 forever, confirmed live: the DOM
 * node itself never went away no matter how long the wait). Fixed by using a
 * plain `tick` counter purely as the re-run SIGNAL — bumped whenever a new
 * kill is queued — while the actual data lives in a ref the effect mutates
 * directly; the effect no longer touches its own dependencies, so it can't
 * re-trigger (and self-cancel) itself. The "hide" timer is also deliberately
 * left OUT of the cleanup-tracked `timers` array (its own `cur?.key === key`
 * check already makes it safe to fire late/redundantly), so a NEW kill
 * arriving while an OLDER one is still visible can't cancel the older one's
 * scheduled hide either.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameEvent, HitType, SideId, Unit } from '../engine/types';
import { useGame } from '../state/store';
import { SIDE_COLOR } from './theme';
import { UnitCounter } from './UnitCounter';
import { HEX_SIZE } from './hexgeo';

const BOX = HEX_SIZE * 1.5 * 2.2; // matches HoverPanel.tsx's MiniCounter sizing

const STAGGER_MS = 1200;
const SHOWN_MS = 3200;

type QueuedKill = GameEvent & { type: 'destroyed'; killedUnitId: string };

export function KillBanner() {
  const game = useGame((s) => s.game);
  const turnBanner = useGame((s) => s.turnBanner);

  const lastLogLenRef = useRef(game?.log.length ?? 0);
  const queueRef = useRef<QueuedKill[]>([]);
  const [tick, setTick] = useState(0); // bumped to signal "queueRef grew" — not itself read
  const [shown, setShown] = useState<{ event: QueuedKill; key: number } | null>(null);

  useEffect(() => {
    const log = game?.log;
    if (!log) return;
    const prevLen = lastLogLenRef.current;
    lastLogLenRef.current = log.length;
    if (log.length <= prevLen) return; // shrank (undo) or unchanged
    const newKills = log
      .slice(prevLen)
      .filter((e): e is QueuedKill => e.type === 'destroyed' && !!e.killedUnitId);
    if (newKills.length) {
      queueRef.current.push(...newKills);
      setTick((t) => t + 1);
    }
  }, [game?.log]);

  useEffect(() => {
    if (turnBanner) return undefined; // still showing "Start of turn N" — wait for the player's OK
    const toShow = queueRef.current;
    if (toShow.length === 0) return undefined;
    queueRef.current = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    toShow.forEach((event, i) => {
      timers.push(
        setTimeout(() => {
          const key = Date.now() + i;
          setShown({ event, key });
          setTimeout(() => setShown((cur) => (cur?.key === key ? null : cur)), SHOWN_MS);
        }, i * STAGGER_MS),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [turnBanner, tick]);

  if (!game || !shown) return null;
  const { event, key } = shown;
  const side = event.killedSide as SideId;

  const killedTmpl = event.killedTemplateId ? game.templates[event.killedTemplateId] : undefined;
  const killerTmpl = event.killerTemplateId ? game.templates[event.killerTemplateId] : undefined;
  const hexLabel = (event.killedHexId && game.hexes[event.killedHexId]?.label) ?? event.killedHexId ?? '?';
  const killerText = killerTmpl ? `${killerTmpl.name} (${event.killerUnitId})` : (event.killerLabel ?? 'unknown cause');

  // A synthetic Unit — the real one is already deleted from game.units — just
  // enough for UnitCounter to render (it only reads game.templates via its
  // own templateOf/effectiveStats, never the live game.units record).
  const pseudoUnit: Unit = {
    id: event.killedUnitId,
    side,
    nation: killedTmpl?.nation ?? '',
    templateId: event.killedTemplateId ?? '',
    hexId: event.killedHexId ?? '',
    facing: 0,
    status: 'fresh',
    stressed: false,
    hitMarkers: [] as HitType[],
    assignedWeaponCards: [],
  };

  return (
    <div className={`kill-banner kill-banner--${side === 'A' ? 'left' : 'right'}`} aria-hidden="true">
      <div className="kill-banner__card" key={key} style={{ borderColor: SIDE_COLOR[side] }}>
        <svg viewBox={`0 0 ${BOX} ${BOX}`} className="kill-banner__counter">
          <UnitCounter
            game={game}
            unit={pseudoUnit}
            center={{ x: BOX / 2, y: BOX / 2 }}
            size={HEX_SIZE * 1.5}
            selected={false}
            ignoreFacing
            onClick={() => {}}
          />
        </svg>
        <div className="kill-banner__text">
          <div className="kill-banner__name">{killedTmpl?.name ?? event.killedTemplateId} destroyed</div>
          <div className="kill-banner__detail">
            by {killerText} at {hexLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
