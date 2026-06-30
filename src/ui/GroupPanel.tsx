/**
 * Group Actions panel (§10). Shown while Group mode is on: click your Fresh
 * units on the board to add/remove them, then take one Group Action — a
 * formation Move (the six arrows), a Group Rally, or a Group Attack (click an
 * enemy hex on the board). One Spent Check resolves for the whole Group.
 */
import { templateOf } from '../engine';
import type { Facing } from '../engine/types';
import { useGame } from '../state/store';

// Arrows ordered by axial direction index 0..5 (E, NE, NW, W, SW, SE).
const DIRS: { facing: Facing; arrow: string }[] = [
  { facing: 2, arrow: '↖' },
  { facing: 1, arrow: '↗' },
  { facing: 3, arrow: '←' },
  { facing: 0, arrow: '→' },
  { facing: 4, arrow: '↙' },
  { facing: 5, arrow: '↘' },
];

export function GroupPanel() {
  const game = useGame((s) => s.game);
  const groupSel = useGame((s) => s.groupSel);
  const groupMove = useGame((s) => s.groupMove);
  const groupRally = useGame((s) => s.groupRally);
  const clearGroup = useGame((s) => s.clearGroup);
  const toggleGroupMember = useGame((s) => s.toggleGroupMember);

  if (!game) return null;

  const members = groupSel.map((id) => game.units[id]).filter((u): u is NonNullable<typeof u> => !!u);
  const allHit = members.length > 0 && members.every((u) => u.hitMarkers.length > 0);

  return (
    <div className="panel">
      <h3>Group Action <span className="dim">· §10</span></h3>

      {members.length === 0 ? (
        <p className="dim">Click your Fresh units on the board to add them to a Group.</p>
      ) : (
        <>
          <div className="group-members">
            {members.map((u) => (
              <button
                key={u.id}
                className="group-chip"
                title="remove from Group"
                onClick={() => toggleGroupMember(u.id)}
              >
                {u.id} <span className="dim">· {templateOf(game, u).name}</span> ✕
              </button>
            ))}
          </div>
          <p className="dim">
            Leader: <b>{members[0]!.id}</b> (first added). Group cost uses the highest member
            move / the leader's attack.
          </p>

          <div className="group-actions">
            <div className="dim">Group Move (formation):</div>
            <div className="pivot-row">
              {DIRS.map(({ facing, arrow }) => (
                <button key={facing} className="icon-btn" onClick={() => groupMove(facing)}>
                  {arrow}
                </button>
              ))}
            </div>

            <button disabled={!allHit} title={allHit ? '' : 'every member needs a Hit Marker'} onClick={groupRally}>
              Group Rally (5 AP)
            </button>
            <p className="dim">Group Attack: click an enemy hex on the board.</p>
            <button onClick={clearGroup}>Clear Group</button>
          </div>
        </>
      )}
    </div>
  );
}
