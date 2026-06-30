/**
 * 2D6 hit probabilities for the fire-odds popup. Pure math, UI-only.
 * Hit if 2D6 >= Hit Number (= DR − AR). Critical at Hit Number + 4 (§6.8).
 */
const WAYS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

/** Probability a 2D6 roll is >= need. */
function pAtLeast(need: number): number {
  if (need <= 2) return 1;
  if (need > 12) return 0;
  let ways = 0;
  for (let s = Math.ceil(need); s <= 12; s++) ways += WAYS[s] ?? 0;
  return ways / 36;
}

export function fireOdds(ar: number, dr: number): { hit: number; crit: number } {
  const hitNumber = dr - ar;
  return { hit: pAtLeast(hitNumber), crit: pAtLeast(hitNumber + 4) };
}

export function pct(p: number): number {
  return Math.round(p * 100);
}
