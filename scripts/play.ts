/**
 * Terminal driver for the M1 engine — the way to "play" before the SVG UI (M3).
 *
 *   npm run play          interactive hotseat in the terminal
 *   npm run demo          auto-plays a full game and prints the log
 *
 * It renders an ASCII board, lists the engine's legal actions, and applies your
 * choice through reduce(). It also showcases the LOS overlay (`los <hex>`) and
 * save/load — all driven by the same pure engine the real UI will use.
 */
import * as readline from 'node:readline/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { stdin, stdout, argv } from 'node:process';
import {
  attackContext,
  deserialize,
  distance,
  initGame,
  legalActions,
  moveCost,
  parseHexId,
  reduce,
  serialize,
  visibleHexesFrom,
} from '../src/engine/index';
import type { Action, GameState } from '../src/engine/types';
import { MISSION_1 } from '../src/data/missions/mission1';

const SCENARIO = MISSION_1;

const ARROWS = ['→', '↗', '↖', '←', '↙', '↘'];

// Short, fixed-width board tokens (G1..G5 / S1..S5) so long unit ids don't
// overflow a cell. The roster maps each token back to its full unit id.
function unitTokens(state: GameState): Record<string, string> {
  const tokens: Record<string, string> = {};
  const counters: Record<string, number> = {};
  for (const u of Object.values(state.units).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const init = (u.nation[0] ?? u.side).toUpperCase();
    counters[init] = (counters[init] ?? 0) + 1;
    tokens[u.id] = `${init}${counters[init]}`;
  }
  return tokens;
}
const TERRAIN_GLYPH: Record<string, string> = {
  open: '·',
  road: '=',
  buildingStone: 'B',
  buildingWood: 'b',
  plowed: '≈',
  water: '~',
  woodsLight: 'w',
  woodsHeavy: 'W',
};

// Board layout: a plain aligned grid keyed by axial (q,r) — the same coords you
// type for `los`, move targets, etc. (Hex adjacency isn't drawn; it's always
// authoritative in the numbered action menu.)
const CELL_W = 5; // width of one hex cell, in characters
const GUTTER = 5; // left margin for the "r<N>" row label

function renderBoard(state: GameState): string {
  const coords = Object.keys(state.hexes).map(parseHexId);
  const qs = coords.map((c) => c.q);
  const rs = coords.map((c) => c.r);
  const minQ = Math.min(...qs);
  const maxQ = Math.max(...qs);
  const minR = Math.min(...rs);
  const maxR = Math.max(...rs);

  const tokens = unitTokens(state);
  const unitAt: Record<string, string> = {};
  for (const u of Object.values(state.units)) {
    const hit = u.hitMarkers.length ? '!' : '';
    unitAt[u.hexId] = `${tokens[u.id]}${ARROWS[u.facing]}${hit}`;
  }
  const vh = new Set(state.victory.victoryHexes.map((v) => v.hexId));

  // Column header (q values), aligned to the even (non-inset) rows.
  let header = ' '.repeat(GUTTER);
  for (let q = minQ; q <= maxQ; q++) header += `q${q}`.padEnd(CELL_W);
  const lines = [header];

  for (let r = minR; r <= maxR; r++) {
    let line = `r${r}`.padEnd(GUTTER);
    for (let q = minQ; q <= maxQ; q++) {
      const hex = state.hexes[`${q},${r}`];
      const cell = hex
        ? (unitAt[`${q},${r}`] ?? TERRAIN_GLYPH[hex.terrain] + (vh.has(`${q},${r}`) ? '*' : ''))
        : '';
      line += cell.padEnd(CELL_W);
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

const LEGEND =
  'legend: · open  w/W woods  B/b building  ~ water  = road  ≈ plowed  * objective\n' +
  '        unit = id + facing (→↗↖←↙↘); trailing ! = hit. Grid is square; hex\n' +
  '        adjacency is shown in the numbered action menu.\n' +
  '        coords are axial q,r (column,row) — type them for `los`, etc.';

function renderStatus(state: GameState): string {
  const p = state.players;
  const lines = [
    `Round ${state.round}/${state.roundsTotal}   turn: Side ${state.currentSide}` +
      `   (initiative: ${state.initiativeSide})`,
    `  A Germans  CAP ${p.A.capCurrent}/${p.A.capStart}  VP ${p.A.vp}` +
      (p.A.activatedUnitId ? `  [active ${p.A.activatedUnitId}, ${p.A.ap} AP]` : ''),
    `  B Soviets  CAP ${p.B.capCurrent}/${p.B.capStart}  VP ${p.B.vp}` +
      (p.B.activatedUnitId ? `  [active ${p.B.activatedUnitId}, ${p.B.ap} AP]` : ''),
  ];
  const tokens = unitTokens(state);
  const roster = Object.values(state.units)
    .map(
      (u) =>
        `    ${tokens[u.id]!.padEnd(3)} ${u.id} (${u.side}) @${u.hexId} ${ARROWS[u.facing]} ${u.status}` +
        (u.hitMarkers.length ? ` [${u.hitMarkers.join(',')}]` : ''),
    )
    .join('\n');
  return lines.join('\n') + '\n' + roster;
}

function describe(state: GameState, a: Action): string {
  switch (a.type) {
    case 'ACTIVATE_UNIT':
      return `Activate ${a.unitId} (7 AP)`;
    case 'MOVE': {
      const u = state.units[a.unitId]!;
      return `Move ${a.unitId} → ${a.toHexId} (${moveCost(state, u, a.toHexId).ap} AP)`;
    }
    case 'FIRE': {
      const ctx = attackContext(state, state.units[a.attackerId]!, state.units[a.targetId]!);
      return (
        `Fire ${a.attackerId} → ${a.targetId}: ` +
        `${ctx.baseFP}+2d6 vs DV ${ctx.defenseValue}${ctx.isFlank ? ' (FLANK)' : ''}`
      );
    }
    case 'RALLY':
      return `Rally ${a.unitId}`;
    case 'PIVOT':
      return `Pivot ${a.unitId} to face ${ARROWS[a.facing]}`;
    case 'MARK_SPENT':
      return `End ${a.unitId}'s activation`;
    case 'STALL':
      return 'Stall (spend 1)';
    case 'PASS':
      return 'Pass';
  }
}

function gameOverText(state: GameState): string {
  const w = state.winner;
  return `\n*** GAME OVER — ${w ? `Side ${w} wins` : 'tie (both lose)'} ` +
    `(A ${state.players.A.vp} VP, B ${state.players.B.vp} VP) ***`;
}

function printEvents(events: { type: string; side?: string; text: string }[]) {
  for (const e of events) {
    if (e.type === 'illegal') console.log(`  ✗ ${e.text}`);
    else console.log(`  • ${e.text}`);
  }
}

// --- simple auto-player for demo mode --------------------------------------

function chooseAuto(state: GameState): Action {
  const acts = legalActions(state);
  const fires = acts.filter((a): a is Extract<Action, { type: 'FIRE' }> => a.type === 'FIRE');
  if (fires.length) {
    let best = fires[0]!;
    let bestScore = -Infinity;
    for (const f of fires) {
      const ctx = attackContext(state, state.units[f.attackerId]!, state.units[f.targetId]!);
      const score = ctx.baseFP - ctx.defenseValue + (ctx.isFlank ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }
  const player = state.players[state.currentSide];
  if (!player.activatedUnitId) {
    const act = acts.find((a) => a.type === 'ACTIVATE_UNIT');
    if (act) return act;
  }
  const moves = acts.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  if (moves.length) {
    const enemies = Object.values(state.units).filter((u) => u.side !== state.currentSide);
    if (enemies.length) {
      let best = moves[0]!;
      let bestDist = Infinity;
      for (const m of moves) {
        const d = Math.min(
          ...enemies.map((e) => distance(parseHexId(m.toHexId), parseHexId(e.hexId))),
        );
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    }
    return moves[0]!;
  }
  return { type: 'PASS' };
}

function runDemo() {
  let state = initGame(SCENARIO);
  console.log('=== Conflict of Heroes — M1 engine demo (auto-played) ===');
  console.log(LEGEND + '\n');
  console.log(renderStatus(state));
  console.log('\n' + renderBoard(state));
  let prevRound = state.round;
  let steps = 0;
  while (state.phase === 'playing' && steps < 800) {
    const action = chooseAuto(state);
    const res = reduce(state, action);
    state = res.state;
    printEvents(res.events);
    if (state.round !== prevRound && state.phase === 'playing') {
      prevRound = state.round;
      console.log(`\n=== Round ${state.round} ===`);
      console.log(renderStatus(state));
      console.log('\n' + renderBoard(state));
    }
    steps++;
  }
  console.log(gameOverText(state));
}

// --- interactive hotseat ---------------------------------------------------

async function runInteractive() {
  let state = initGame(SCENARIO);
  const history: GameState[] = [];
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('=== Conflict of Heroes — M1 hotseat ===');
  console.log(LEGEND);
  console.log("\nType an action number, or: pass | stall | undo | los <q,r> | save [f] | load [f] | help | quit\n");

  while (state.phase === 'playing') {
    console.log(renderStatus(state));
    console.log('\n' + renderBoard(state));

    const acts = legalActions(state);
    acts.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}. ${describe(state, a)}`));

    const input = (await rl.question(`\nSide ${state.currentSide} > `)).trim();
    const [cmd, arg] = input.split(/\s+/, 2);

    if (cmd === 'quit' || cmd === 'q') break;
    if (cmd === 'help' || cmd === 'h') {
      console.log('Enter the number of an action, or: pass, stall, undo, los <q,r>, save [file], load [file], quit');
      continue;
    }
    if (cmd === 'undo' || cmd === 'u') {
      const prev = history.pop();
      if (prev) state = prev;
      else console.log('  (nothing to undo)');
      continue;
    }
    if (cmd === 'los') {
      if (!arg || !state.hexes[arg]) {
        console.log('  usage: los <q,r>  (an existing hex)');
      } else {
        const vis = visibleHexesFrom(state, arg);
        console.log(`  visible from ${arg}: ${vis.visible.sort().join(' ') || '(none)'}`);
        console.log(`  blocked:        ${vis.blocked.sort().join(' ') || '(none)'}`);
      }
      continue;
    }
    if (cmd === 'save') {
      const file = arg || 'savegame.json';
      writeFileSync(file, serialize(state));
      console.log(`  saved → ${file}`);
      continue;
    }
    if (cmd === 'load') {
      const file = arg || 'savegame.json';
      try {
        state = deserialize(readFileSync(file, 'utf8'));
        console.log(`  loaded ← ${file}`);
      } catch {
        console.log(`  could not read ${file}`);
      }
      continue;
    }
    if (cmd === 'pass' || cmd === 'p') {
      history.push(state);
      const res = reduce(state, { type: 'PASS' });
      state = res.state;
      printEvents(res.events);
      continue;
    }
    if (cmd === 'stall') {
      history.push(state);
      const res = reduce(state, { type: 'STALL' });
      state = res.state;
      printEvents(res.events);
      continue;
    }

    const n = Number(cmd);
    if (!Number.isInteger(n) || n < 1 || n > acts.length) {
      console.log('  ? unknown command (type "help")');
      continue;
    }
    history.push(state);
    const res = reduce(state, acts[n - 1]!);
    state = res.state;
    printEvents(res.events);
  }

  if (state.phase === 'gameOver') console.log(gameOverText(state));
  rl.close();
}

if (argv.includes('--demo')) {
  runDemo();
} else {
  void runInteractive();
}
