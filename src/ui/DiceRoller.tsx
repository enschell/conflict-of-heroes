/**
 * Animated, clickable dice (rulebook rolls visualized). The OUTCOME is decided
 * by the seeded RNG in GameState — this only animates to that pre-computed
 * result, so saves/replays stay deterministic (CLAUDE.md §3.6). Plays a
 * synthesized dice sound unless muted.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { playDice } from './sound';

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** value 0 (or out of range) renders an unrolled die showing "?". */
function Die({ value }: { value: number }) {
  const s = 56;
  const m = 12;
  const step = (s - 2 * m) / 2;
  const pips = PIPS[value];
  return (
    <svg width={s} height={s} className="die">
      <rect x={1} y={1} width={s - 2} height={s - 2} rx={10} fill="#f4f1e9" stroke="#1b1b1b" strokeWidth={2} />
      {pips ? (
        pips.map(([cx, cy], i) => (
          <circle key={i} cx={m + cx * step} cy={m + cy * step} r={5} fill="#1b1b1b" />
        ))
      ) : (
        <text x={s / 2} y={s / 2 + 1} textAnchor="middle" dominantBaseline="central" fontSize={28} fontWeight={800} fill="#1b1b1b">
          ?
        </text>
      )}
    </svg>
  );
}

export function DiceRoller() {
  const pending = useGame((s) => s.pendingRoll);
  const commit = useGame((s) => s.commitRoll);
  const cancel = useGame((s) => s.cancelRoll);
  const muted = useGame((s) => s.muted);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'done'>('ready');
  const [faces, setFaces] = useState<[number, number]>([0, 0]); // 0 = "?" (unrolled)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A fresh pending action resets to its first step, dice hidden.
  useEffect(() => {
    setStepIndex(0);
    setPhase('ready');
    setFaces([0, 0]);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [pending]);

  if (!pending) return null;
  const steps = pending.steps;
  const step = steps[stepIndex];
  if (!step) return null;
  const isLast = stepIndex >= steps.length - 1;

  const roll = () => {
    if (phase !== 'ready') return;
    setPhase('rolling');
    playDice(muted);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      if (n >= 13) {
        if (timer.current) clearInterval(timer.current);
        setFaces(step.dice);
        setPhase('done');
      } else {
        setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      }
    }, 55);
  };

  // Advance to the next die, or commit the (single) engine action after the last.
  const advance = () => {
    if (isLast) {
      commit();
      return;
    }
    setStepIndex((i) => i + 1);
    setPhase('ready');
    setFaces([0, 0]);
  };

  return (
    <div className="modal-backdrop">
      <div className="dice-modal">
        <div className="dice-label">
          {step.label}
          {steps.length > 1 ? ` — target ${stepIndex + 1} of ${steps.length}` : ''}
        </div>
        <div className="dice-detail">{step.detail}</div>
        <div className="dice-row" onClick={roll} role="button" title="Roll the dice">
          <Die value={faces[0]} />
          <Die value={faces[1]} />
        </div>
        {phase === 'ready' && <button className="primary" onClick={roll}>Roll dice</button>}
        {phase === 'rolling' && <div className="dim">rolling…</div>}
        {phase === 'done' && (
          <>
            <div className={`outcome ${step.success ? 'outcome--hit' : 'outcome--miss'}`}>
              {step.headline}
            </div>
            <button className="primary" onClick={advance}>{isLast ? 'Continue' : 'Next target ▸'}</button>
          </>
        )}
        {phase === 'ready' && <button className="link" onClick={cancel}>cancel</button>}
      </div>
    </div>
  );
}
