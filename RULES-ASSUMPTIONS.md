# Rules assumptions & open rulings — Firefight 1 slice

The M3.4 conformance harness (`npm run conformance`) auto-plays full games and
checks every action's result against an independent re-derivation of the rules.
As of the last run: **4 audits (3 full games + a pivot/stall probe), 0 violations**,
covering activate / move / fire (incl. multi-target stacked fire, §7.5.1) / close-combat /
rally / pivot / stall / mark-spent / pass, including moving *into* an enemy hex and the
"can't fire out of an enemy hex" rule.

The harness verifies the **engine's arithmetic and flow** against *our reading* of
the rules. It does **not** prove designer intent on ambiguous points, and it does
**not** verify our unit stat numbers against the physical counters (those aren't
text-extractable from the PDF — see §"Stat fidelity"). The items below are where a
human ruling is wanted. **All four §A items were ruled on 2026-06-27 (kept; #4 deferred).**

---

## A. Decisions wanted (engine makes a defensible choice the rules leave open)

1. **Close-combat AP cost = the unit's normal fire cost (`apToFire`).** (§7.7.3)
   The rule says CC "requires an AP, CAP, opportunity, or card action" but gives no
   explicit AP number. We charge the same AP it costs that unit to fire.
   **✅ Ruling (2026-06-27): keep** — CC costs the unit's normal fire AP.

2. **Short range applies even when the target is also "within range."** (§7.7.2)
   Any shot at an *adjacent* hex gets +3 FP, regardless of the unit's printed range.
   **✅ Ruling (2026-06-27): keep.**

3. **Victory scoring = kills (immediate) + victory-hex control at game end.** (§2.4–2.5)
   We award destroyed-unit VP immediately and add controlled-hex VP only when the last
   round ends; control flips when a side is the sole occupier. FF1's exact victory
   conditions were authored by us (the scenario card isn't text-extractable), so this
   is our interpretation of "hold the objectives + kill for VP."
   **✅ Ruling (2026-06-27): keep.**

4. **Initiative is rolled 2D6/side with tie re-roll, no CAP modifier.** (§2.1, §3.2.4)
   The rules allow spending up to 2 CAP to modify the initiative roll; we don't expose
   that yet (auto-roll only).
   **✅ Ruling (2026-06-27): fine for the slice — add CAP-to-initiative later.**

---

## B. Known simplifications (deferred features — flag if any should come sooner)

5. ~~**Single-target fire.**~~ **✅ Done (M5).** (§7.5.1) A FIRE action now resolves against
   **all** enemy units stacked in the target's hex — one roll each (deterministic id order,
   RNG threaded so the UI dice preview matches the committed result), for a single fire cost.
   Engine: `rollStackFire`/`enemiesInHex` in `combat.ts`, applied in `reducer.ts doFire`;
   the conformance harness re-derives every sub-roll. (See `combat.test.ts` / `reducer.test.ts`.)

6. **Close-combat reactions / retreat restriction not modeled.** (§7.7.3) A surviving CC
   defender can act on its own turn normally, but we don't enforce the "may not retreat
   into the hex or the two hexes the attacker came from" rule, nor a special immediate
   react prompt. Also the "a unit may CC only one enemy per turn" limit isn't enforced
   (a unit may CC repeatedly across its own AP actions). Deferred.

7. **Outside fire into a CC hex hitting friend & foe alike** (§7.7.3) — not modeled.
   Stacked fire (#5) resolves against every *enemy* in the target hex; it does not also
   hit *friendly* units locked in close combat there. Deferred.

8. **Optional rules off:** Cautious Movement (§5.0.3) and Variable AP Allocation (§3.0.1)
   are optional and not implemented. Backward movement costs +1 AP (§5.2) but we don't
   apply the cautious −1 DM nuance.

9. **CAP uses not yet in the UI:** the engine supports CAP supplementing AP 1:1 (§3.2.1)
   and ±2 dice modifiers (§3.2.3); the UI auto-pays CAP only when AP runs short and does
   not yet let you *choose* to spend CAP on dice or stalls. Engine math is in place.

10. **Not yet implemented at all (later milestones):** action/bonus/event/weapon **cards**
    (§8 — FF1 uses none), **shared activations / firegroups** (§9), vehicles, mortars /
    off-board artillery / smoke, hidden units, fortifications / mines, and hills /
    elevation LOS. The harness reports these as "not exercised," not "passing."

---

## C. Stat fidelity (separate from rules conformance)

Unit counters in the rulebook PDF are graphics, not extractable text, so **our unit
stats (FP/DR/move/range/fire-cost/VP) are original balanced approximations**, grounded
in rulebook prose where numbers appear. The conformance audit proves the *engine applies
the rules correctly to whatever stats it's given* — it does **not** prove our numbers
match the real game. If you have the physical counters, a stat pass is worthwhile.

---

*§A ruled on 2026-06-27 (keep / keep / keep / defer #4). §B/§C remain as noted. Unit stats in
`src/data/units.ts` are placeholders to be replaced with real counter values by the user (§C); no
code changes or test updates are needed when those numbers change.*
