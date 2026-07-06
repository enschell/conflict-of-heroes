/**
 * Selected-unit inspector + action menu. Shows the unit's effective stats and
 * the engine's legal actions as buttons (with a live AR vs DR fire preview).
 * Move/fire are also available by clicking the board. v3: each Action is
 * followed by a Spent Check (§2.5) and Stresses the unit (§2.6).
 */
import { attackContext, closeCombatContext, directionTo, effectiveStats, legalActionsForUnit, RALLY_AP_COST, templateOf } from '../engine';
import { isHopelessShot } from './odds';
import { HIT_MARKERS, hitMarkerEffects, markerName } from '../data/hitMarkers';
import type { Facing, GameState, Unit } from '../engine/types';
import { useGame } from '../state/store';
import { UnitCounter } from './UnitCounter';
import { HEX_SIZE } from './hexgeo';

const ARROWS = ['→', '↗', '↖', '←', '↙', '↘'];

// 1.5x board scale — 2x forced the header text to wrap and pushed the rest
// of the panel down, so this dropped down a tier (see .inspector-counter).
const INSPECTOR_COUNTER_SIZE = HEX_SIZE * 1.5;
const INSPECTOR_COUNTER_BOX = INSPECTOR_COUNTER_SIZE * 2.2;

function InspectorCounter({ game, unit }: { game: GameState; unit: Unit }) {
  return (
    <div className="inspector-counter">
      <svg
        viewBox={`0 0 ${INSPECTOR_COUNTER_BOX} ${INSPECTOR_COUNTER_BOX}`}
        style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }}
      >
        <UnitCounter
          game={game}
          unit={unit}
          center={{ x: INSPECTOR_COUNTER_BOX / 2, y: INSPECTOR_COUNTER_BOX / 2 }}
          size={INSPECTOR_COUNTER_SIZE}
          selected={false}
          ignoreFacing
          onClick={() => {}}
        />
      </svg>
    </div>
  );
}

export function Inspector() {
  const game = useGame((s) => s.game);
  const selectedUnitId = useGame((s) => s.selectedUnitId);
  const fire = useGame((s) => s.fire);
  const closeCombat = useGame((s) => s.closeCombat);
  const rally = useGame((s) => s.rally);
  const hastyDefense = useGame((s) => s.hastyDefense);
  const removeHastyDefense = useGame((s) => s.removeHastyDefense);
  const pivot = useGame((s) => s.pivot);
  const chooseFacing = useGame((s) => s.chooseFacing);
  const load = useGame((s) => s.load);
  const unload = useGame((s) => s.unload);
  const movePath = useGame((s) => s.movePath);
  const commitMovePath = useGame((s) => s.commitMovePath);
  const clearMovePath = useGame((s) => s.clearMovePath);

  if (!game) return null;
  if (!selectedUnitId || !game.units[selectedUnitId]) {
    return (
      <div className="panel">
        <h3>No unit selected</h3>
        <p className="dim">Click one of Side {game.currentSide}'s units to select it.</p>
      </div>
    );
  }

  const unit = game.units[selectedUnitId]!;
  const tmpl = templateOf(game, unit);
  const eff = effectiveStats(game, unit);
  const player = game.players[unit.side];
  const yours = unit.side === game.currentSide;
  const acts = yours ? legalActionsForUnit(game, unit.id) : [];

  const canPivot = acts.some((a) => a.type === 'PIVOT');
  const hasMove = acts.some((a) => a.type === 'MOVE');
  const isVehicle = tmpl.kind === 'vehicle';

  // Rally eligibility (§7.6–7.10). A Hit Unit may Rally unless its marker is
  // "No Rally" or it shares a hex with an enemy (§7.9). A Spent Hit Unit may
  // still Rally by spending CAPs to reach 0AP (§3.4 — see the §7.10 red box).
  const marker = unit.hitMarkers[0];
  const enemyHere = Object.values(game.units).some(
    (u) => u.side !== unit.side && u.hexId === unit.hexId,
  );
  const rallyable = !!marker && HIT_MARKERS[marker].rally > 0 && !enemyHere;
  const rallyCost = RALLY_AP_COST + (unit.stressed ? 1 : 0); // AP (Fresh) or CAP-to-0AP (Spent)
  const spentRally = unit.status === 'spent';
  const rallyAffordable = !spentRally || player.capCurrent >= rallyCost;

  // Hasty Defense (§17.6): a Foot Unit may build one (5AP) if it doesn't
  // already have one; it may always be removed at will, for free.
  const hastyDefenseAct = acts.find((a) => a.type === 'HASTY_DEFENSE');
  const hastyDefenseCost = 5 + (unit.stressed ? 1 : 0);
  const hastyDefenseAffordable = unit.status !== 'spent' || player.capCurrent >= hastyDefenseCost;
  // §3.2: exclude a target no CAP could ever make hittable — same UI
  // convenience as store.ts's hexClick/ActionChooser.tsx, not a rules change.
  const fireActs = acts
    .filter((a): a is Extract<typeof a, { type: 'FIRE' }> => a.type === 'FIRE')
    .filter((a) => {
      const tgt = game.units[a.targetId];
      return tgt && !isHopelessShot(attackContext(game, unit, tgt, 0, 0, a.useFlamethrower).hitNumber);
    });
  const ccActs = acts
    .filter((a): a is Extract<typeof a, { type: 'CLOSE_COMBAT' }> => a.type === 'CLOSE_COMBAT')
    .filter((a) => {
      const tgt = a.targetId ? game.units[a.targetId] : undefined;
      return tgt && !isHopelessShot(closeCombatContext(game, unit, tgt, 0, a.useFlamethrower).hitNumber);
    });
  // Transport (§15.6–15.10): Load onto an eligible Vehicle, or Unload from the
  // one carrying this Unit (a foot Unit or a towed, damaged Vehicle).
  const loadActs = acts.filter((a): a is Extract<typeof a, { type: 'LOAD' }> => a.type === 'LOAD');
  const unloadActs = acts.filter((a): a is Extract<typeof a, { type: 'UNLOAD' }> => a.type === 'UNLOAD');
  const carrier = unit.carriedBy ? game.units[unit.carriedBy] : undefined;

  return (
    <div className="panel">
      <div className="inspector-header">
        <div className="inspector-header__text">
          <h3>{tmpl.name}</h3>
          <div className="stats-grid">
            <span>Side</span>
            <b>{unit.side}</b>
            <span>Status</span>
            <b>
              {unit.status}
              {unit.stressed ? ' · stressed' : ''}
            </b>
            <span>Hex / facing</span>
            <b>
              {unit.hexId} {ARROWS[unit.facing]}
            </b>
            <span>Firepower</span>
            <b>
              {eff.fp.red}
              {eff.fp.blue ? ` / ${eff.fp.blue}b` : ''}
            </b>
            <span>Defense</span>
            <b>
              {eff.dr.front}f / {eff.dr.flank}k ({eff.dr.color})
            </b>
            <span>Move · Range</span>
            <b>
              {eff.move} · {eff.range}
            </b>
            <span>Fire cost · VP</span>
            <b>
              {eff.apToFire} AP · {tmpl.vp}
            </b>
          </div>
        </div>
        <InspectorCounter game={game} unit={unit} />
      </div>

      {unit.hitMarkers[0] && (
        <div className="hit-note">
          <div className="hit-note__title">Hit: {markerName(unit.hitMarkers[0])}</div>
          <ul className="hit-note__effects">
            {hitMarkerEffects(HIT_MARKERS[unit.hitMarkers[0]]).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {game.pendingFacingChoices?.includes(unit.id) && (
        <div className="pivot-row facing-choice">
          <span className="dim">Choose facing (free, §4.5/§15.11):</span>
          {ARROWS.map((arrow, f) => (
            <button
              key={f}
              className="icon-btn"
              disabled={f === unit.facing}
              onClick={() => chooseFacing(unit.id, f as Facing)}
            >
              {arrow}
            </button>
          ))}
        </div>
      )}

      {!yours && <p className="dim">This is the other side's unit.</p>}

      {yours && (
        <div className="actions">
          {unit.status === 'spent' && (
            <p className="dim">
              Spent — an Action only possible by spending CAPs to reduce
              cost to 0AP (§3.4).
            </p>
          )}
          {rallyable && !spentRally && (
            <button onClick={() => rally(unit.id)}>Rally ({rallyCost} AP)</button>
          )}
          {rallyable && spentRally && rallyAffordable && (
            <button onClick={() => rally(unit.id)}>Rally — spend {rallyCost} CAP → 0AP (§3.4)</button>
          )}
          {rallyable && spentRally && !rallyAffordable && (
            <button disabled title="Not enough CAP to reach 0AP">
              Rally needs {rallyCost} CAP (have {player.capCurrent})
            </button>
          )}
          {unit.hastyDefense && (
            <button onClick={() => removeHastyDefense(unit.id)}>
              Remove Hasty Defense (free, §17.6)
            </button>
          )}
          {hastyDefenseAct && !spentRally && (
            <button onClick={() => hastyDefense(unit.id)}>Build Hasty Defense ({hastyDefenseCost} AP, §17.6)</button>
          )}
          {hastyDefenseAct && spentRally && hastyDefenseAffordable && (
            <button onClick={() => hastyDefense(unit.id)}>
              Build Hasty Defense — spend {hastyDefenseCost} CAP → 0AP (§3.4)
            </button>
          )}
          {hastyDefenseAct && spentRally && !hastyDefenseAffordable && (
            <button disabled title="Not enough CAP to reach 0AP">
              Hasty Defense needs {hastyDefenseCost} CAP (have {player.capCurrent})
            </button>
          )}
          {hasMove && !isVehicle && <p className="dim">Move: click a highlighted green hex.</p>}
          {hasMove && isVehicle && movePath.length === 0 && (
            <p className="dim">
              Move: click hexes to build a path (1 Move + {(tmpl.bonusMoves ?? 0) + (tmpl.mobileTrackBonusMoves ?? 0)}{' '}
              Bonus Move
              {(tmpl.bonusMoves ?? 0) + (tmpl.mobileTrackBonusMoves ?? 0) === 1 ? '' : 's'}, §15.2
              {tmpl.mobileTrackBonusMoves ? '/§16.4' : ''}), then confirm.
            </p>
          )}
          {isVehicle && movePath.length > 0 && (
            <div className="move-path">
              <span className="dim">Path: {movePath.length} hex{movePath.length === 1 ? '' : 'es'}</span>
              <div className="move-path__actions">
                <button className="primary" onClick={() => commitMovePath()}>
                  Move
                </button>
                <button onClick={() => clearMovePath()}>Cancel</button>
              </div>
            </div>
          )}

          {fireActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Fire targets:</div>
              {fireActs.map((a) => {
                const tgt = game.units[a.targetId]!;
                const ctx = attackContext(game, unit, tgt, 0, 0, a.useFlamethrower);
                return (
                  <button
                    key={`${a.targetId}-${a.useFlamethrower ? 'ft' : 'n'}`}
                    onClick={() => fire(unit.id, a.targetId, a.useFlamethrower)}
                  >
                    {a.useFlamethrower ? '🔥' : '→'} {a.targetId}
                    {a.useFlamethrower ? ' (Flamethrower)' : ''}: AR {ctx.ar} vs DR {ctx.dr} — 2d6 ≥ {ctx.hitNumber}
                    {ctx.isFlank ? ' (flank)' : ''}
                  </button>
                );
              })}
            </div>
          )}

          {ccActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Close combat (enemy in your hex):</div>
              {ccActs.map((a) => {
                // legalActionsForUnit never enumerates a targetKind:'structure'
                // CLOSE_COMBAT (that's a store-level explicit-choice action,
                // §17.12) — every entry here always targets a Unit.
                const targetId = a.targetId!;
                const tgt = game.units[targetId]!;
                const ctx = closeCombatContext(game, unit, tgt, 0, a.useFlamethrower);
                return (
                  <button
                    key={`${targetId}-${a.useFlamethrower ? 'ft' : 'n'}`}
                    className="cc-btn"
                    onClick={() => closeCombat(unit.id, targetId, a.useFlamethrower)}
                  >
                    {a.useFlamethrower ? '🔥⚔' : '⚔'} {targetId}
                    {a.useFlamethrower ? ' (Flamethrower)' : ''}: AR {ctx.ar} vs flank DR {ctx.dr} — 2d6 ≥ {ctx.hitNumber}
                  </button>
                );
              })}
            </div>
          )}

          {canPivot && (
            <div className="pivot-row">
              <span className="dim">Pivot:</span>
              {ARROWS.map((arrow, f) => (
                <button key={f} className="icon-btn" disabled={f === unit.facing} onClick={() => pivot(unit.id, f as Facing)}>
                  {arrow}
                </button>
              ))}
            </div>
          )}

          {loadActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Load onto (§15.7 — or click the amber-outlined hex):</div>
              {loadActs.map((a) => (
                <button key={a.vehicleId} onClick={() => load(unit.id, a.vehicleId)}>
                  🚚 Load onto {a.vehicleId}
                </button>
              ))}
            </div>
          )}

          {unloadActs.length > 0 && (
            <div className="fire-list">
              <div className="dim">Unload (§15.9 — or click the amber-outlined hex):</div>
              {unloadActs.map((a) => {
                const sameHex = carrier && a.toHexId === carrier.hexId;
                const dir = carrier && !sameHex ? directionTo(carrier.hexId, a.toHexId) : -1;
                const label = sameHex ? 'under Vehicle' : dir >= 0 ? ARROWS[dir] : a.toHexId;
                return (
                  <button key={a.toHexId} onClick={() => unload(unit.id, a.toHexId)}>
                    🚚 Unload {label}
                  </button>
                );
              })}
            </div>
          )}

          {acts.length > 0 && (
            <p className="dim">
              After acting, a Spent Check decides if {unit.id} stays Fresh; the
              unit becomes Stressed (+1AP next Turn).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
