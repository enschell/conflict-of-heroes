# Rules assumptions & open items — v3 (post-cutover)

> **Status note:** this file predates the v3 cutover and was never fully retired per
> `CLAUDE.md` §A.3 step 0. Most of its original items (2nd-ed AP/activation model,
> "no vehicles/Group Actions yet", invented Firefight-1 victory conditions) are now
> **obsolete** — the v3 cutover, M5 Group Actions, M6 Vehicles + Special Units, and
> real Mission 1 (with reinforcements, §4.12) are all built; see `CLAUDE.md` §0/§8 for
> current status. This rewrite keeps only what's still genuinely open under v3.

## Still open / simplified

1. **CAP dice-modifier has no UI control.** The engine supports `capDiceMod` on
   `FIRE`/`CLOSE_COMBAT`/`RALLY` (§3.2: spend up to 2 CAPs to shift a d6/2d6 Number
   Check by ±1 each) and `clampCapMod` enforces the ≤2 limit — but no UI component
   lets the player choose to spend CAP this way; it's always 0 today. The CAP-to-0AP
   cost-reduction flow (§3.3–§3.4) *does* have a UI (the Spent-unit confirm dialog).

2. **Close-combat reactions / retreat restriction not modeled** (§6.11-adjacent). A
   surviving CC defender can act normally on its own Turn; we don't enforce a
   "may not retreat toward the attacker" restriction or a special immediate-react
   prompt, nor a "one CC per Unit per Turn" limit (a Unit may CC repeatedly across
   separate Turns/Actions). Deferred — not currently blocking any authored Mission.

3. **Outside fire into a Close-Combat hex hits enemies only, not co-located friendlies.**
   Stacked fire (§7.5.1) resolves against every *enemy* Unit in the target hex; it does
   not also risk hitting a friendly Unit locked in Close Combat there. Deferred.

4. **Group close combat not implemented.** Group Actions (§10) cover Move/Attack
   (ranged)/Rally; a Group taking Close Combat together is not yet built (`groups.ts`
   validates ranged-only for `GROUP_ATTACK`). Noted in `CLAUDE.md`'s M5 roadmap entry.

5. **§16.4 Mobile Vehicles** (combined wheeled + tracked Bonus Moves) not implemented —
   narrow vehicle subtype (historically half-tracks); no currently authored unit needs
   it. Noted in `CLAUDE.md`'s M6 roadmap entry.

6. **Reinforcement entry is auto-placed per wave, not per-hex.** The `ReinforcementsPanel`'s
   "Enter now" places a whole wave in one click, spreading Units across distinct legal
   entry Hexes automatically; there's no manual "click this specific entry Hex for this
   specific Unit" flow yet (a future refinement, `CLAUDE.md` §0).

## Stat fidelity (unchanged concern)

Unit counters in the rulebook PDF are graphics for most Missions, not extractable text,
so **most unit stats (FP/DR/move/range/fire-cost/VP) remain original balanced
approximations**, except where a Mission's Commander's Forces panel or Round Track prints
the value in plain text (Mission 1's forces, CAPs, VP, and reinforcement composition were
read directly off the Mission Book and are exact — see `docs/extracting-missions-from-
the-mission-book.md`). The conformance audit (`npm run conformance`) proves the *engine
applies the rules correctly to whatever stats it's given* — it does not independently
verify every unit's numbers against the physical counters.
