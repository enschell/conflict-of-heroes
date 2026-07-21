/**
 * Synthesized sound effects via the Web Audio API — no binary assets shipped.
 * Dice rattle (rolls), movement (infantry march vs vehicle rumble), and weapon
 * fire (rifle / MG burst / cannon). All respect the mute flag. Sound is pure
 * presentation; it never affects engine outcomes.
 */
import type { UnitKind } from '../engine/types';

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A decaying filtered-noise burst (footstep, crack, tread clank). */
function noise(a: AudioContext, start: number, dur: number, gain: number, lowpass?: number): void {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const g = a.createGain();
  g.gain.value = gain;
  if (lowpass) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f);
    f.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(a.destination);
  src.start(start);
}

/** A short tone with an attack/decay envelope. */
function tone(
  a: AudioContext,
  start: number,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
): void {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Tumbling-dice rattle. */
export function playDice(muted: boolean): void {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  const now = a.currentTime;
  for (let i = 0; i < 5; i++) noise(a, now + i * 0.06 + Math.random() * 0.015, 0.045, 0.16);
}

/** Movement: marching footsteps for foot units, engine rumble for vehicles. */
export function playMove(kind: UnitKind, muted: boolean): void {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  const now = a.currentTime;

  if (kind === 'vehicle') {
    // Low engine rumble with a vibrato + clanking treads.
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const lfo = a.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 10;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.12);
    g.gain.setValueAtTime(0.13, now + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    o.connect(lp);
    lp.connect(g);
    g.connect(a.destination);
    o.start(now);
    o.stop(now + 1.25);
    lfo.start(now);
    lfo.stop(now + 1.25);
    for (let i = 0; i < 6; i++) noise(a, now + i * 0.18, 0.05, 0.05, 1600);
  } else {
    // Marching: a few muffled footfalls.
    for (let i = 0; i < 5; i++) noise(a, now + i * 0.16, 0.06, 0.14, 500);
  }
}

/** A falling-shell whistle: a tone sweeping from high to low pitch. */
function whistle(a: AudioContext, start: number, dur: number, gain: number): void {
  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1500, start);
  o.frequency.exponentialRampToValueAtTime(280, start + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.15);
  g.gain.linearRampToValueAtTime(gain * 0.8, start + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** A single explosive boom: a sub-bass thump + a broadband noise crack. */
function boom(a: AudioContext, start: number, gain: number): void {
  tone(a, start, 55, 0.55, gain, 'sine');
  tone(a, start, 110, 0.3, gain * 0.5, 'triangle');
  noise(a, start, 0.35, gain * 0.9, 700);
  noise(a, start + 0.03, 0.5, gain * 0.4); // rumbling debris tail, no lowpass
}

/**
 * Off-Board Artillery Strike landing (§13.6-13.9): one or more falling-shell
 * whistles overlapping into a barrage of booms — matches `applyResolvedObaStrike`'s
 * blast radius (a handful of Hexes hit "at once"), not a single Attack sound.
 */
export function playObaStrike(muted: boolean): void {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  const now = a.currentTime;
  const shellCount = 3;
  for (let i = 0; i < shellCount; i++) {
    const whistleStart = now + i * 0.08;
    const whistleDur = 0.5 + Math.random() * 0.15;
    whistle(a, whistleStart, whistleDur, 0.1);
    boom(a, whistleStart + whistleDur, 0.35 - i * 0.05);
  }
}

/** Weapon fire: rifle crack, MG burst, or cannon boom. */
export function playFire(kind: UnitKind, muted: boolean): void {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  const now = a.currentTime;

  if (kind === 'vehicle' || kind === 'gun' || kind === 'mortar') {
    tone(a, now, 70, 0.5, 0.3, 'sine'); // boom
    noise(a, now, 0.25, 0.3, 900);
  } else if (kind === 'mg') {
    for (let i = 0; i < 6; i++) noise(a, now + i * 0.07, 0.04, 0.18, 3200); // burst
  } else {
    noise(a, now, 0.12, 0.26, 3500); // rifle crack
    tone(a, now, 180, 0.12, 0.08, 'square');
  }
}
