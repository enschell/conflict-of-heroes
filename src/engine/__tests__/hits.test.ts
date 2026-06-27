import { describe, expect, it } from 'vitest';
import { effectiveStats } from '../hits';
import { addTemplate, addUnit, baseState, rifleTemplate } from './helpers';

function withMarker(marker: Parameters<typeof addUnit>[7]) {
  const s = baseState();
  addTemplate(s, rifleTemplate());
  const u = addUnit(s, 'U', 'A', 0, 0, 0, 'rifle', marker);
  return effectiveStats(s, u);
}

describe('hit-marker effects (rulebook §7.5)', () => {
  it('suppressed: −2 red FP, +1 AP to fire', () => {
    const eff = withMarker(['suppressed']);
    expect(eff.fp.red).toBe(3 - 2);
    expect(eff.apToFire).toBe(4 + 1);
  });

  it('pinned: cannot move or pivot', () => {
    const eff = withMarker(['pinned']);
    expect(eff.canMove).toBe(false);
    expect(eff.canPivot).toBe(false);
    expect(eff.canFire).toBe(true);
  });

  it('stunned: only rally allowed', () => {
    const eff = withMarker(['stunned']);
    expect(eff.onlyRally).toBe(true);
    expect(eff.canFire).toBe(false);
    expect(eff.canMove).toBe(false);
  });

  it('cowering: range drops to 1, +2 AP to fire, +1 move cost', () => {
    const eff = withMarker(['cowering']);
    expect(eff.range).toBe(1);
    expect(eff.apToFire).toBe(4 + 2);
    expect(eff.move).toBe(1 + 1);
  });

  it('no marker: stats equal the template', () => {
    const eff = withMarker([]);
    expect(eff.fp.red).toBe(3);
    expect(eff.range).toBe(4);
    expect(eff.canFire).toBe(true);
  });
});
