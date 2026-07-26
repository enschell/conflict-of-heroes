/**
 * Live-game turn helper (kept for the duration of the ongoing hotseat game vs
 * the user, branch game-testing — delete once that game ends). Reads a real
 * exported GameState and reports every legal action for every Side-B
 * (Soviet) unit via the actual engine, instead of eyeballing hex distance or
 * clicking through the UI to discover what's legal.
 */
import * as fs from 'node:fs';
import { legalActionsForUnit, templateOf, attackContext, closeCombatContext } from '../src/engine';
import type { GameState } from '../src/engine/types';

const state = JSON.parse(fs.readFileSync(process.argv[2]!, 'utf8')) as GameState;
const mySide = 'B';

console.log(`Round ${state.round}, currentSide ${state.currentSide}, CAP B ${state.players.B.capCurrent}/${state.players.B.capStart}`);
console.log('---');

for (const unit of Object.values(state.units)) {
  if (unit.side !== mySide) continue;
  const tmpl = templateOf(state, unit);
  const acts = legalActionsForUnit(state, unit.id);
  const fireActs = acts.filter((a) => a.type === 'FIRE' || a.type === 'INDIRECT_FIRE');
  // A MOVE into an enemy-occupied Hex is how Close Combat actually gets
  // triggered (§6, closeCombatContext requires same-Hex) — never filter MOVE
  // out entirely without checking whether any of its destinations land on an
  // enemy Unit first (caught live: this script's own earlier filter silently
  // dropped every Close-Combat opportunity by excluding MOVE outright).
  const moveActs = acts.filter((a): a is Extract<typeof a, { type: 'MOVE' }> => a.type === 'MOVE');
  const ccOpportunities = moveActs
    .map((a) => ({ a, occupant: Object.values(state.units).find((u) => u.hexId === a.toHexId && u.side !== unit.side) }))
    .filter((x) => x.occupant);
  const otherActs = acts.filter(
    (a) => a.type !== 'FIRE' && a.type !== 'INDIRECT_FIRE' && a.type !== 'MOVE' && a.type !== 'PIVOT',
  );
  console.log(`${unit.id} (${tmpl.name}) @ ${unit.hexId} — ${unit.status}${unit.stressed ? '+stressed' : ''}${unit.hidden ? ' HIDDEN' : ''}`);
  if (fireActs.length) {
    for (const a of fireActs) {
      const targetId = (a as any).targetId as string | undefined;
      if (targetId && state.units[targetId]) {
        const ctx = attackContext(state, unit, state.units[targetId]!);
        const targetColor = templateOf(state, state.units[targetId]!).dr.color;
        const baseFp = tmpl.fp[targetColor];
        const warn = baseFp === 0 ? '  *** WARNING: 0 base ' + targetColor + ' FP - no real weapon vs this target color, do not fire ***' : '';
        console.log(`  FIRE -> ${targetId}: AR ${ctx.ar} vs DR ${ctx.dr} Hit# ${ctx.hitNumber} marks=${JSON.stringify(state.units[targetId]!.hitMarkers)}${warn}`);
      } else {
        console.log(`  FIRE -> ${targetId ?? (a as any).targetHexId}`);
      }
    }
  } else {
    console.log('  (no Fire targets)');
  }
  if (ccOpportunities.length) {
    for (const { occupant } of ccOpportunities) {
      const ctx = closeCombatContext(state, unit, occupant!);
      console.log(`  CLOSE COMBAT (via Move) -> ${occupant!.id}: AR ${ctx.ar} vs DR ${ctx.dr} Hit# ${ctx.hitNumber} legal=${ctx.legal}`);
    }
  }
  if (otherActs.length) {
    console.log('  other:', [...new Set(otherActs.map((a) => a.type))].join(', '));
  }
}
