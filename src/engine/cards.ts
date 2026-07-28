/**
 * Battle/Weapon/Veteran Cards (§8) and Off-Board Artillery (§13.4-13.9).
 *
 * Follows the project's two established conventions, split by what each
 * function needs:
 *  - PURE roll helpers (mirrors `hidden.ts`/`mortar.ts`): consume `state.rng`,
 *    return the advanced `RngState` alongside the result, never mutate.
 *  - MUTATING state helpers (mirrors `victory.ts`'s `gainVp`/`turn.ts`'s own
 *    style): take `state` explicitly and mutate it in place, pushing directly
 *    to `state.log` — used by `turn.ts`'s Pre-Round Sequence, which has no
 *    access to `reducer.ts`'s private closures (`applyHit`/`destroyUnit`) and
 *    already follows this exact direct-mutation convention itself.
 *
 * Framework-only scope (CLAUDE.md's Cards section): a card's own BESPOKE
 * rules text (e.g. Adrenaline's free action) is never mechanically simulated
 * here — only the shared mechanics every card of its type/category shares
 * (deck construction, draw/discard, Green/Blue cost-paying, Mission-card
 * auto-resolve) plus OBA's real Drift/blast math (§13.4-13.9 is pure rules
 * math, not bespoke per-card text, per the locked decision to build it now).
 */
import { CARD_CATALOG } from '../data/cards/catalog';
import { isArmoredMarker } from '../data/hitMarkers';
import { applyUnitLoss } from './cap';
import { apcTransportBonus, vehicleCoverBonus } from './combat';
import { fortificationDrBonus, hastyDefenseDrBonus } from './fortifications';
import { AXIAL_DIRECTIONS, idOf, neighbor, neighbors, parseHexId } from './hex';
import { effectiveStats, resolveHit, returnHitToPile, templateOf } from './hits';
import { heTerrainDM } from './mortar';
import { roll2d6, rollD6 } from './rng';
import { smokeDefenseBonus } from './smoke';
import { computeWinner, gainVp, otherSide, vpPerKillFor } from './victory';
import type {
  CardDef,
  CardId,
  DRColor,
  Facing,
  GameState,
  HexId,
  NationId,
  RngState,
  SideId,
  Unit,
  UnitId,
} from './types';

// ---------------------------------------------------------------------------
// Deck construction + draw (§8.1, §9.8)
// ---------------------------------------------------------------------------

/** Repeats each id by its catalog `count` (§8.1) — unshuffled; the caller shuffles. */
export function buildBattleDeck(cardIds: CardId[]): CardId[] {
  const out: CardId[] = [];
  for (const id of cardIds) {
    const def = CARD_CATALOG[id];
    if (!def) continue;
    for (let i = 0; i < def.count; i++) out.push(id);
  }
  return out;
}

/**
 * §9.8 Draw Battle Cards, called from `turn.ts`'s Pre-Round Sequence.
 * Mission-type cards auto-resolve on draw (§8.7): log their text, discard,
 * and draw again — the redraw doesn't count against `count` (the original
 * draw obligation still stands). Halt Order (`endsMission`) ends the Mission
 * immediately instead of redrawing. No reshuffle-on-empty rule exists, so an
 * emptied `drawPile` just stops yielding cards, mid-loop, without error.
 */
export function drawBattleCards(state: GameState, side: SideId, count: number): void {
  const deck = state.cardDeck;
  if (!deck) return;
  const player = state.players[side];
  let remaining = count;
  while (remaining > 0 && deck.drawPile.length > 0) {
    const id = deck.drawPile.shift()!;
    remaining -= 1;
    const def = CARD_CATALOG[id];
    if (def?.type === 'mission') {
      const text = state.missionCardText?.[id] ?? 'no Mission-specific text authored for this card';
      state.log.push({
        type: 'card',
        round: state.round,
        side,
        text: `Side ${side} draws Mission Card "${def.name}" (#${id}): ${text}`,
      });
      deck.discardPile.push(id);
      if (def.endsMission) {
        state.phase = 'gameOver';
        state.winner = computeWinner(state);
        state.log.push({
          type: 'missionEnd',
          round: state.round,
          text: `${def.name} drawn — Mission ends immediately (§8.7).`,
        });
        return;
      }
      remaining += 1; // §8.7: "then draw a new Battle Card" — free redraw, not a second draw.
      continue;
    }
    player.hand.push(id);
    state.log.push({
      type: 'card',
      round: state.round,
      side,
      text: `Side ${side} draws ${def?.name ?? id} (#${id})${def ? `: ${def.effectText}` : ''}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Play Card legality (§8.5-8.6)
// ---------------------------------------------------------------------------

export interface PlayCardLegality {
  legal: boolean;
  reason?: string;
  card?: CardDef;
}

/**
 * Coarse legality (mirrors `directFireZone`'s shape) — `reducer.ts`'s
 * `doPlayCard` layers the Fresh-unless-reduced-to-0AP check on top, since
 * that depends on the actual `capCostReduce` chosen, not knowable here.
 */
export function canPlayCard(state: GameState, side: SideId, cardId: CardId, unitId?: UnitId): PlayCardLegality {
  const card = CARD_CATALOG[cardId];
  if (!card) return { legal: false, reason: 'unknown card' };
  if (!state.players[side].hand.includes(cardId)) return { legal: false, reason: 'card not in hand' };
  if (card.type === 'mission') {
    return { legal: false, reason: 'Mission Cards resolve automatically on draw, not played (§8.7)' };
  }
  if (card.type === 'artillery') {
    return { legal: false, reason: 'Artillery Cards are activated via Plan OBA Strike, not Play Card (§13.5)' };
  }
  if (!card.cost) return { legal: false, reason: 'card has no cost configuration' };
  const unit = unitId ? state.units[unitId] : undefined;
  if (card.cost.color === 'green' && !unit) {
    return { legal: false, reason: 'Green-cost cards require a Unit (§8.6)' };
  }
  if (unit && unit.side !== side) return { legal: false, reason: 'not your Unit' };
  if (card.restrictedTo) {
    if (!unit) return { legal: false, reason: 'this card requires a Unit matching its restriction' };
    const tmpl = templateOf(state, unit);
    if (card.restrictedTo.nation && unit.nation !== card.restrictedTo.nation) {
      return { legal: false, reason: `restricted to ${card.restrictedTo.nation}` };
    }
    if (card.restrictedTo.kind && tmpl.kind !== card.restrictedTo.kind) {
      return { legal: false, reason: `restricted to ${card.restrictedTo.kind} Units` };
    }
  }
  return { legal: true, card };
}

// ---------------------------------------------------------------------------
// Off-Board Artillery (§13.4-13.9)
// ---------------------------------------------------------------------------

/** §13.7 Drift Check Number, by nation. Falls back to 4 (the stricter, Soviet
 *  value) for any nation not in this table (e.g. a future 3rd faction). */
const DRIFT_CHECK_NUMBER: Partial<Record<NationId, number>> = {
  germans: 3,
  soviets: 4,
};

/** The lowest (easiest) Drift Check Number among `side`'s own nations. */
function driftCheckNumberFor(state: GameState, side: SideId): number {
  const nums = state.players[side].nations
    .map((n) => DRIFT_CHECK_NUMBER[n])
    .filter((n): n is number => n != null);
  return nums.length ? Math.min(...nums) : 4;
}

/**
 * The documented, engine-internal 1-6 -> `AXIAL_DIRECTIONS` mapping used for
 * an OBA Drift direction roll. The physical Artillery Marker's own printed
 * arrow numbering isn't recoverable from the OCR source this build was
 * transcribed from — this is our own consistent convention, not a
 * reproduction of the card's print art (rules/08's Card Catalog note).
 */
export function driftDirection(rollValue: number): Facing {
  return ((rollValue - 1 + AXIAL_DIRECTIONS.length) % AXIAL_DIRECTIONS.length) as Facing;
}

export interface DriftCheckResult {
  hit: boolean;
  checkNumber: number;
  dice1: number;
  /** 0 if the check succeeded; otherwise the failed roll's own value (§13.7). */
  driftDistance: number;
  directionRoll?: number;
  finalHexId: HexId;
  rng: RngState;
}

/** §13.7: pure — consumes/returns `RngState` like every other roll here. */
export function resolveDriftCheck(
  state: GameState,
  side: SideId,
  targetHexId: HexId,
  capMod = 0,
): DriftCheckResult {
  const checkNumber = driftCheckNumberFor(state, side) - capMod;
  const r1 = rollD6(state.rng);
  if (r1.value >= checkNumber) {
    return { hit: true, checkNumber, dice1: r1.value, driftDistance: 0, finalHexId: targetHexId, rng: r1.rng };
  }
  const driftDistance = r1.value;
  const r2 = rollD6(r1.rng);
  const dir = driftDirection(r2.value);
  let hex = parseHexId(targetHexId);
  for (let i = 0; i < driftDistance; i++) hex = neighbor(hex, dir);
  const driftedId = idOf(hex);
  // Drifting off the map's edge (no rulebook guidance) lands the strike back
  // on the original Target Hex rather than nowhere — a documented simplification.
  const finalHexId = state.hexes[driftedId] ? driftedId : targetHexId;
  return { hit: false, checkNumber, dice1: r1.value, driftDistance, directionRoll: r2.value, finalHexId, rng: r2.rng };
}

export interface ObaAttackRoll {
  targetId: UnitId;
  hexId: HexId;
  ar: number;
  dr: number;
  hitNumber: number;
  dice: [number, number];
  hit: boolean;
  critical: boolean;
  fpColor: DRColor;
}

/**
 * One OBA Attack against `target` (§13.8-13.9): always HE vs Flank Defense,
 * using the Artillery Card's own Firepower (not a Unit stat). No range/
 * elevation/wall AR-DR terms — those model a firing Unit's own position,
 * which OBA (fired off-board) has none of; only target-hex-intrinsic
 * modifiers apply (terrain, smoke, vehicle cover, APC, fortification, hasty
 * defense). `markerHexId` stands in for "attacker position" only for the
 * Bunker in-arc-vs-flank determination (mirrors `mortar.ts` passing its own
 * Spotter Hex for the same purpose).
 */
function rollObaAttack(
  state: GameState,
  target: Unit,
  firepower: { red: number; blue: number },
  markerHexId: HexId,
  rng: RngState,
  capMod = 0,
): { roll: ObaAttackRoll; rng: RngState } {
  const tEff = effectiveStats(state, target);
  const openToppedFlip = templateOf(state, target).openTopped;
  const fpColor: DRColor = openToppedFlip ? 'red' : tEff.dr.color;
  const ar = fpColor === 'red' ? firepower.red : firepower.blue;
  const terrainDr = heTerrainDM(state, target.hexId, fpColor);
  const smokeDr = smokeDefenseBonus(state, target.hexId);
  const coverDr = vehicleCoverBonus(state, target);
  const apcDr = apcTransportBonus(state, target);
  const fortDr = fortificationDrBonus(state, target, markerHexId)?.value ?? 0;
  const hastyDr = hastyDefenseDrBonus(target)?.value ?? 0;
  const dr = tEff.dr.flank + terrainDr + smokeDr + coverDr + apcDr + fortDr + hastyDr;
  const hitNumber = dr - ar - capMod;
  const { value, dice, rng: rolled } = roll2d6(rng);
  return {
    roll: {
      targetId: target.id,
      hexId: target.hexId,
      ar,
      dr,
      hitNumber,
      dice,
      hit: value >= hitNumber,
      critical: value >= hitNumber + 4,
      fpColor,
    },
    rng: rolled,
  };
}

export interface ObaStrikeResolution {
  driftCheck: DriftCheckResult;
  attacks: ObaAttackRoll[];
  rng: RngState;
  /** The marker Hex + its 6 neighbors (§13.8) — a presentation hint carried
   *  onto the "Strike lands" `GameEvent` so the UI can animate/sound the
   *  whole blast at once, not per-Attack. */
  blastHexIds: HexId[];
}

/**
 * Full OBA Strike resolution (§13.6-13.9): Drift Check, then one Attack per
 * non-Hidden Unit in the final marker Hex and its 6 neighbors — INCLUDING
 * friendly Units (§13.8). Pure — the caller (`applyResolvedObaStrike`)
 * commits the results to `state`.
 */
export function resolveObaStrike(
  state: GameState,
  strike: { side: SideId; cardId: CardId; targetHexId: HexId },
  /** §13.7: no interactive CAP-mod UI exists for OBA yet (framework-only
   *  scope) — the live game always resolves at 0. Exposed as a parameter
   *  (applied uniformly to every Attack this Strike triggers) so a future
   *  Cards UI, and this module's own tests reproducing the rulebook's
   *  CAP-modified worked example, don't need a signature change. */
  attackCapMod = 0,
): ObaStrikeResolution {
  const driftCheck = resolveDriftCheck(state, strike.side, strike.targetHexId);
  const card = CARD_CATALOG[strike.cardId];
  const firepower = card?.firepower ?? { red: 0, blue: 0 };
  const blastHexIds = [
    driftCheck.finalHexId,
    ...neighbors(parseHexId(driftCheck.finalHexId)).map(idOf),
  ].filter((id) => state.hexes[id]);
  const targets = Object.values(state.units)
    .filter((u) => blastHexIds.includes(u.hexId) && !u.hidden)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const attacks: ObaAttackRoll[] = [];
  let rng = driftCheck.rng;
  for (const target of targets) {
    const { roll, rng: next } = rollObaAttack(state, target, firepower, driftCheck.finalHexId, rng, attackCapMod);
    attacks.push(roll);
    rng = next;
  }
  return { driftCheck, attacks, rng, blastHexIds };
}

/** Mirrors `reducer.ts`'s private `destroyUnit`, minus the §15.11 passenger-
 *  auto-unload nuance (a Transport destroyed by OBA doesn't auto-unload its
 *  passenger this pass — a rare, documented, flagged simplification, since
 *  duplicating that closure-based logic here isn't worth the coupling). */
function destroyUnitFromOba(state: GameState, unit: Unit): void {
  for (const hm of unit.hitMarkers) {
    if (isArmoredMarker(hm)) state.hitPiles.vehicle = returnHitToPile(state.hitPiles.vehicle, hm);
    else state.hitPiles.foot = returnHitToPile(state.hitPiles.foot, hm);
  }
  const tmpl = templateOf(state, unit);
  const opp = otherSide(unit.side);
  const killVp = state.victory.unitKillVp?.[unit.id] ?? vpPerKillFor(state.victory, opp) ?? tmpl.vp;
  gainVp(state, opp, killVp);
  if (!tmpl.noCapLossOnDestroy) applyUnitLoss(state.players[unit.side]);
  delete state.units[unit.id];
  // Kill-banner presentation fields (see reducer.ts's destroyUnit and
  // types.ts's GameEvent) — no killerUnitId/killerTemplateId/killerSide, same
  // "no attributable attacking Unit" scope decision Mines gets: an OBA Strike
  // is attributed to a played Card, not an on-board Unit (also why this kill
  // never touches `state.unitStats`, unlike reducer.ts's own destroyUnit).
  state.log.push({
    type: 'destroyed',
    round: state.round,
    side: unit.side,
    text: `${unit.id} destroyed by OBA Strike at ${unit.hexId} (+${killVp} VP to ${opp})`,
    killedUnitId: unit.id,
    killedTemplateId: unit.templateId,
    killedSide: unit.side,
    killedHexId: unit.hexId,
    killedMapNumber: state.hexes[unit.hexId]?.mapNumber,
    killerLabel: 'Off-Board Artillery Strike',
  });
}

/**
 * Commits a `resolveObaStrike` result to `state` — logs the Drift Check and
 * every Attack in full (this IS the "text read-out" for OBA, since there's
 * no marker-on-map UI this pass), then applies each Hit via `resolveHit`
 * exactly like `reducer.ts`'s `applyHit` does.
 */
export function applyResolvedObaStrike(
  state: GameState,
  strike: { side: SideId; cardId: CardId; targetHexId: HexId },
  resolution: ObaStrikeResolution,
): void {
  const { driftCheck, attacks, blastHexIds } = resolution;
  const cardName = CARD_CATALOG[strike.cardId]?.name ?? strike.cardId;
  state.log.push({
    type: 'oba',
    round: state.round,
    side: strike.side,
    text: driftCheck.hit
      ? `Side ${strike.side} OBA Strike (${cardName}) targeting ${strike.targetHexId}: Drift Check ${driftCheck.dice1} vs ${driftCheck.checkNumber} -> on target`
      : `Side ${strike.side} OBA Strike (${cardName}) targeting ${strike.targetHexId}: Drift Check ${driftCheck.dice1} vs ${driftCheck.checkNumber} -> missed, drifts ${driftCheck.driftDistance} hex(es) to ${driftCheck.finalHexId}`,
    // Presentation hint (§13.6-13.9's blast radius) so the UI can animate/
    // sound the Strike landing across every affected Hex at once.
    hexIds: blastHexIds,
  });
  state.rng = resolution.rng;
  for (const atk of attacks) {
    const target = state.units[atk.targetId];
    if (!target) continue;
    state.log.push({
      type: 'oba',
      round: state.round,
      side: target.side,
      text: `OBA Attack on ${target.id} @ ${atk.hexId}: AR ${atk.ar} vs DR ${atk.dr} (Hit Number ${atk.hitNumber}), rolled ${atk.dice[0]}+${atk.dice[1]}=${atk.dice[0] + atk.dice[1]} -> ${atk.critical ? 'CRITICAL HIT' : atk.hit ? 'HIT' : 'MISS'}`,
    });
    if (!atk.hit) continue;
    const res = resolveHit(state, target, atk.critical, atk.fpColor, state.rng);
    state.rng = res.rng;
    if (res.outcome.kind === 'destroyed-immediate') {
      destroyUnitFromOba(state, target);
      continue;
    }
    if (res.pile) {
      if (res.armored) state.hitPiles.vehicle = res.pile;
      else state.hitPiles.foot = res.pile;
    }
    if (res.outcome.kind === 'destroyed-drawn') {
      destroyUnitFromOba(state, target);
    } else {
      target.hitMarkers = [res.outcome.hitType];
      state.log.push({
        type: 'hit',
        round: state.round,
        side: target.side,
        text: `${target.id} takes a hit: ${res.outcome.hitType}`,
      });
    }
  }
}

