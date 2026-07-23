# v3 Migration Plan (historical — the cutover is complete)

> Archived from `CLAUDE.md` §A once the migration finished and later milestones (M5–M7) had been
> built on top of it for a while. Kept for archaeology — if you're doing day-to-day work, you almost
> certainly want `CLAUDE.md` and `rules/` instead, not this file.

The 2nd→3rd edition change was **not** a tweak; it replaced the **action economy**, which most of
the engine hangs off. Everything below is the plan the migration was cut over by. **Never
reintroduce 7AP/`ACTIVATE_UNIT`/`MARK_SPENT` logic** — this document explains what replaced it and
why, not a design to revisit.

## What changed (and the one-line "why")

| Area | 2nd ed (original code) | 3rd ed (target) | v3 § |
|---|---|---|---|
| **Action economy** | each Unit has a **7AP pool**; you `ACTIVATE_UNIT`, spend `player.ap`, interleave free "opportunity" actions, `MARK_SPENT` | **no pool.** Pick **one Unit → one Action**; Action Cost is a **threshold**, not a budget | 2.0–2.5 |
| **Spent Check** | none (units just run out of AP) | after an Action, roll the **Spent Die**; **roll > cost → Fresh, else → Spent** | 2.5 |
| **Spent Die** | n/a | weighted **d10 = [1,1,2,3,3,4,5,5,6,7]** | 2.5 |
| **Stress** | **did not exist** | **+1AP** to cost if the Unit acted on your **previous** Turn; not cumulative; cleared by Passing | 2.6 |
| **Pass / Stall** | pass/stall present | Pass = free, **clears Stress**; Stall = **1AP**, do nothing, Spent Check, Stresses; both Pass → Round ends | 2.7, 2.8 |
| **CAPs** | supplement AP / CAP action / ≤2 dice mod / track loss | reduce Action Cost **before** a Spent Check (**any number, −1 each**); 0AP ⇒ **no check**; ±1 d6 (≤2); lost on death; **floor of 3** | 3.0–3.4, 7.12, 7.13 |
| **Combat math** | `AV = FP + 2d6 + CAP ≥ DV`, crit at `+4` | `Hit Number = DR − AR`; `2d6 ≥ Hit Number`; crit by 4 | 6.0, 6.8 |
| **Initiative** | both sides roll 2d6, higher first (reroll ties) | **only the side WITHOUT VP Advantage** rolls 2d6; **≥ 7 ⇒ goes first**, else opponent does | 9.11 |
| **Round reset** | flip spent→fresh; CAP = start − losses | adds: **CAP floor 3**, clear Stress, (later) smoke dissipation + artillery steps | 9.4–9.7 |
| **Groups** | planned as "shared activation / 7AP firegroup" (**not built**) | **Group Actions**: one Action, **one** Spent Check for the group; group move cost = **highest** member; group attack = leader **+1AR per supporter** | 10.0–10.12 |

> **Algebra note (good news):** v2's `AV = FP + 2d6 ≥ DV` is identical to v3's `2d6 ≥ DR − AR`
> (with `AR` playing the FP role), and the `+4` critical is unchanged. `combat.ts` ported with a
> rename, not a rewrite. Same for the range modifiers (short **+3AR** adjacent, long **−2AR**,
> close combat **+4AR**, crewed **−2AR** in CC) and the **hit-marker table** (the foot markers
> already matched the v3 **Soft Target** deck).

## Per-module punch list — keep / rename / rewrite / new

**Ported almost as-is (renamed AV/DV→AR/DR, FP→Firepower→AR, re-verified values vs `rules/`):**
`hex.ts`, `terrain.ts`, `los.ts`, `range.ts`, `movement.ts`, `combat.ts`, `hits.ts`, `victory.ts`,
`rng.ts`, all of `data/` (stats/terrain/maps/`hitMarkers.ts`), all of `ui/`, `state/`, and the
`scripts/` geometry.

**Rewritten (the v3 cutover):**
- `types.ts` — `PlayerState`: dropped `activatedUnitId` and `ap`. `Unit.status`: `'fresh'|'spent'`
  (deleted `'active'`); added `stressed: boolean`. (CAP/loss/vp/hand/nation fields stayed.)
- `actions.ts` — deleted `ACTIVATE_UNIT` / `MARK_SPENT`; every unit Action (`MOVE`/`FIRE`/`RALLY`/
  `PIVOT`/`CLOSE_COMBAT`) became self-contained and followed by a Spent Check. Added CAP fields to
  actions: `{ capCostReduce?, capDiceMod? }`. Re-derived `legalActions` from "is this Unit Fresh, or
  Spent-but-affordable-to-0AP-with-CAPs".
- `cap.ts` — new spend model: `reduceActionCost(cost, caps)` (−1 each, any number, can reach 0AP ⇒
  skip Spent Check), kept `clampCapMod` for ±1 d6 (≤2); added the **floor-3** to `applyUnitLoss`/reset.
- `turn.ts` — `startRound` = the v3 **Pre-Round Sequence** (flip spent→fresh keeping markers+facing,
  CAP reset with floor 3, clear Stress, then v3 **initiative**: non-advantage side rolls 2d6 ≥ 7).
  The per-Action turn step: cost = base + Stress + terrain + hit-marker mods − CAP; Spent Check;
  set `stressed`; switch side. Pass clears the acting side's Stress.
- `reducer.ts` — rewired `doMove/doFire/doRally/...` to the "act → Spent Check → Stress" flow;
  dropped activation bookkeeping; kept events/log.
- `rally.ts` — kept 5AP + roll `2d6 ≥ Rally Number`, but added the **mandatory Spent Check after
  the rally regardless of result** (7.10), let Stress raise the 5AP, and expanded modifiers
  (fortifications, heavy smoke, +1 per friendly un-hit unit — cumulative).

**New modules:**
- `spent.ts` — the Spent Die `[1,1,2,3,3,4,5,5,6,7]` + `spentCheck(rng, cost) → {fresh, roll, rng}`
  (pass iff `roll > cost`). Oracle for tests = the Spent Chance table in `rules/03`.
- `stress.ts` — set/clear Stress, and the "+1AP if acted last Turn" cost contribution.

**Re-keyed data to v3 (as each relevant module landed):** unit counters use Fresh/Spent sides and
attack/move cost as **check thresholds**; added the **Armored Target** hit-marker deck for vehicles
(M6); card lists and hit-marker counts per the v3 back-matter.

## Migration build order (each step = green tests before the next)

0. **Pin rules:** commit `rules/` + `rules/INDEX.md`; delete/quarantine 2nd-ed rules notes and the
   old `RULES-ASSUMPTIONS.md` rulings that v3 now answers (re-open only genuine v3 ambiguities).
1. **`spent.ts`** (Spent Die + Spent Check). Test against the 20/30/50/60/80/90/100% table (`rules/03`).
2. **State model** (`types.ts`): Fresh/Spent + `stressed`; migrate `state.ts`/`initGame`.
3. **Action economy** (`turn.ts`/`actions.ts`/`reducer.ts`/`cap.ts`): act → Spent Check → Stress;
   Pass/Stall; round-end on consecutive Pass. **This was the cutover.** Ported the rulebook's
   red-box examples in `rules/02` and `rules/03` as fixtures.
4. **CAPs** integrated into the cost path + d6 checks (floor 3 on reset/loss).
5. **Combat/Hits/Rally** renamed to AR/DR; added the post-rally Spent Check; re-verified all numbers
   against `rules/06`–`rules/07` (and their red boxes — ready-made test cases).
6. **Round controller / Initiative / VP** to v3 (`rules/09`).
7. **Re-scoped M5 → Group Actions (§10)**. Then resumed later modules in v3 order.

The conformance harness (`scripts/conformance.ts`) was — and still is — the safety net: it
re-derives every move against the `rules/` tables, so the engine stays continuously checked.
