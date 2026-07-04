# CLAUDE.md — Conflict of Heroes (browser edition) — **v3 / 3rd Edition**

Guidance for Claude Code when building this project. Read this first, every session.

> **Source of truth for rules:** the official *Conflict of Heroes: Awakening the Bear*
> **3rd Edition** rulebook (Academy Games). This project migrated from a 2nd-edition (7AP) build
> to **3rd-edition rules only** — the migration is complete; see **§A** below.
>
> **Do not invent rules from memory, and do not read the PDF.** The rulebook has been transcribed
> into a curated, section-by-section reference under **`rules/`**. Routing rule: when implementing
> or changing a mechanic, open **`rules/INDEX.md`**, find the chapter(s) that cover it, and read the
> matching **`rules/NN-*.md`** file(s) first. Cite the v3 section number (`N.M`) in code comments,
> commits, and tests. The `rules/` files are **committed** and authoritative (they replace the old
> gitignored `reference/rulebook.txt`).

---

## A. v3 migration (historical — complete)

This project migrated from a 2nd-edition (7AP-pool) engine to 3rd-edition (threshold-based action
economy) rules. The migration finished long ago — the codebase has been v3-only since M4.5, and
M5–M7 were all built on top of it since. **Never reintroduce 7AP/`ACTIVATE_UNIT`/`MARK_SPENT` logic.**

The full plan (the 2nd→3rd-ed change table, per-module rewrite list, and build order) is preserved
at **`docs/v3-migration-plan.md`** for archaeology — not needed for day-to-day work. Current
mechanics live in `rules/` and this file's §6/§8.

---

## 0. Continuing in a new session (handoff)

This repo is self-describing: a fresh session needs only the code + these docs.

- **Canonical location:** `C:\Users\ensch\Git Repos\conflict-of-heroes` (git repo; remote
  `origin` = https://github.com/enschell/conflict-of-heroes.git; active branch **`v3-migration`**,
  not yet merged to `main` — that's a deliberate later step, not an oversight). **Launch Claude Code
  from this folder** so this CLAUDE.md auto-loads.
- **Orient by reading, in order:** this file (golden rules §3, directory map §4, rules index §6,
  roadmap §8), then `README.md`, then **`rules/INDEX.md`** and the specific `rules/NN-*.md` for
  whatever you're building.
- **Authoring a Mission from the Mission Book PDF:** follow
  `docs/extracting-missions-from-the-mission-book.md`.
- **Verify before changing:** `npm install` (first time), then `npm test` (Vitest),
  `npm run typecheck`, `npm run build`, and `npm run conformance`. All green = known-good baseline.
- **Run it:** `npm run dev` → http://localhost:5173. Windows: Node 24 is at
  `C:\Program Files\nodejs` (not on Git Bash's PATH; in PowerShell prepend it).
- **Current status:** the v3 cutover, M5 (Group Actions + Group Close Combat), M6 (Vehicles +
  **all** of Special Units §16.1–16.7, audited and confirmed complete), and M7 (Mortars + Smoke) are
  all done; real **Mission 1** ("Partisans") plays end-to-end with real reinforcements; conformance
  is at 0 violations. **M8 (Hidden Units) is deliberately deferred to online play** — see §8, it's a
  locked decision, not a gap. **Next up:** M9 (elevation/hills). **§8 has the full detail on every
  milestone — read that, not this bullet, for specifics on how something works or why a decision was
  made.**

---

## 1. What this is

A browser implementation of the tactical hex-and-counter wargame *Conflict of Heroes: Awakening the
Bear* (**3rd edition**). Platoon-sized **Missions**: each counter is an infantry squad, crewed gun,
or vehicle. Players fight over Objectives worth victory points (VPs); the side with **VP Advantage**
at the end wins (the v3 "no-tie" VP track — one side always leads).

**This build's scope (locked decisions):**
- **Hotseat first, online later.** Pass-and-play now; keep the engine network-agnostic so an
  authoritative server + WebSocket rooms can be added later with **no engine changes**.
- **Vertical slice = infantry + vehicles, Mission 1 ("Partisans") playable end-to-end.** Vehicles
  (M6) and Mortars + Smoke (M7) are built; OBA, hidden units, fortifications, mines, hills remain
  **later modules** (roadmap §8) — Hidden Units specifically deferred to online play, see §8.
- **Stack:** Vite + React + TypeScript, **client-only**. SVG hex board. Pure-function rules engine.
  Zustand store. Vitest for tests.
- **Content:** we author our **own** stats/terrain/scenario data and **original simple graphics**.
  **Never** embed Academy Games' map or counter art. Personal-use project.

**Player model — read carefully.** The game is **two opposing sides** ("forces"). Each side is one
or more **nations** (data). *Awakening the Bear* = Germans vs Soviets, but the series adds others.
**Do not hardcode two armies.** A side is the unit of turn-taking; a nation drives unit stats and
army-specific cards. (v3 "Alternate Player Counts" §19 is a later UI/team concern, not an engine
concept yet.)

> **Terminology (v3):** "Mission" not "Firefight"; "Attack Rating / Defense Rating (AR/DR)" not
> "AV/DV"; "Group Action" not "shared activation / firegroup"; "Fresh/Spent" with a **Spent Check**,
> not an AP pool.

---

## 2. Commands

```bash
npm install        # first time
npm test           # Vitest unit tests
npm run play       # interactive hotseat in the terminal (debug grid)
npm run conformance# self-plays games, re-derives each move from the v3 rules, asserts engine agrees
npm run dev        # Vite dev server (SVG board)
npm run build      # production build (tsc --noEmit && vite build)
npm run typecheck  # tsc --noEmit (strict; keep clean)
```

**Windows / Node:** Node 24 at `C:\Program Files\nodejs`, not on Git Bash's PATH. Run npm from
PowerShell, prepending it: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.

---

## 3. Engine golden rules (do not violate)

1. **`src/engine/` is pure TypeScript. No React, no DOM, no browser APIs, no `Date.now()`, no
   `Math.random()`.** Identical in a test, a browser, or a future server.
2. **All randomness goes through the seeded RNG stored *inside* `GameState`** (`engine/rng.ts`):
   `roll2d6`, `rollD6`, **`rollSpentDie`**, `drawHit`. Every roll advances the serialized RNG.
3. **`GameState` is 100% JSON-serializable.** No class instances/functions/`Map`/`Set` in state.
   `JSON.parse(JSON.stringify(state))` must round-trip identically.
4. **The only way to change state is `reduce(state, action) -> { state, events }`** in
   `engine/reducer.ts`. Actions are plain serializable objects; the UI dispatches, never mutates.
5. **Legality lives in the engine** (`legalActions` + per-action validators). The UI renders what's
   legal; it must not duplicate rules.
6. **Animations/sound are pure presentation.** The dice animation visualizes a result the engine
   already computed from the RNG; it must never determine the outcome.

---

## 4. Directory map

```
conflict-of-heroes/
  CLAUDE.md                 # this file (v3 handoff)
  README.md
  rules/                    # ✅ COMMITTED v3 rulebook reference (source of truth)
    INDEX.md                #   routing index → read the right NN-*.md before coding
    00-overview.md … 19-alternate-player-counts.md
  package.json  vite.config.ts  tsconfig.json  index.html
  public/assets/            # original art + dice SFX
  src/
    main.tsx  App.tsx
    engine/                 # PURE rules engine (see §3)
      types.ts              # shared types (GameState, Unit, Hex, Action, GameEvent…)
      state.ts              # GameState shape, initGame(mission), (de)serialize
      rng.ts                # seeded RNG: roll2d6, rollD6, rollSpentDie, drawHit
      spent.ts              # Spent Die [1,1,2,3,3,4,5,5,6,7] + spentCheck(cost)
      stress.ts             # Stress state + "+1AP if acted last Turn"
      hex.ts                # axial math: neighbors, distance, direction, line, arc
      terrain.ts            # terrain table → AP cost, DR mod, blocksLOS, isCover
      los.ts                # line of sight + arc of fire; visibleHexesFrom(hex)
      movement.ts           # move cost, facing, pivot, backwards, roads, walls
      range.ts              # short +3AR (adjacent), long −2AR
      combat.ts             # AR/DR; Hit Number = DR − AR; 2d6 ≥ HN; crit by 4
      hits.ts               # draw marker, apply effects, 2nd hit = destroyed
      rally.ts              # 5AP rally; 2d6 ≥ rally #; +mods; Spent Check after (7.10)
      cap.ts                # reduce cost (−1/CAP, any #; 0AP⇒no check), ±1 d6 (≤2), floor 3
      turn.ts               # Pre-Round Sequence, v3 initiative, act→SpentCheck→Stress, pass/stall
      victory.ts            # VP for kills, objective control, game end (no-tie track)
      actions.ts            # action defs + getLegalActions()
      reducer.ts            # central reduce(state, action) → { state, events }
      groups.ts             # ✅ Group Actions §10: connectivity, support, one Spent Check/group
      reinforcements.ts     # ✅ M2.5/§4.12: legalEntryHexes (off-Map Units, ENTER)
      mortar.ts             # ✅ M7/§13: Direct/Indirect Attack fire zones, Spotter Hex, rollIndirectFire
      smoke.ts              # ✅ M7/§14: Heavy/Light DR/AR, LOS-path bonus, Rally bonus, dissipation
      cards.ts              # (deferred) Battle/Weapon cards §8; OBA (§13.4-13.9) waits on this too
      index.ts              # public engine API surface
      __tests__/            # Vitest
    data/                   # authored content (no logic)
      nations.ts terrainTypes.ts hitMarkers.ts units.ts hexArt.ts
      maps/mission1.ts   missions/mission1.ts   # Mission 1 "Partisans": Map 1 board + setup + reinforcement waves
      missions/sandbox.ts   # non-canonical Armor Sandbox test mission (M6)
      missions/fireSupportSandbox.ts  # non-canonical Fire Support Sandbox test mission (M7)
      cards/                # deferred to the cards milestone
      __tests__/
    state/  store.ts persistence.ts             # Zustand + localStorage saves
    ui/     …  ReinforcementsPanel.tsx  …        # React + SVG (see §7)
  scripts/  play.ts conformance.ts              # terminal driver + v3 conformance audit
```

> **Current state:** engine/data/state/ui/scripts compile and pass under 3rd-ed (v3) rules
> (conformance 0 violations — see §0/§8 for the milestone status). Data is the real **Mission 1** on
> `maps/mission1.ts` + `missions/mission1.ts` (the 2nd-ed `firefights/`/`maps/partisans.ts` are
> deleted), plus the non-canonical `missions/sandbox.ts` (vehicles) and
> `missions/fireSupportSandbox.ts` (mortars/smoke) test missions. `rules/` is the committed source
> of truth.

---

## 5. State model (`engine/types.ts`) — v3

```ts
GameState = {
  rng: RngState                       // seed + counter; advanced on every roll (incl. Spent Die)
  phase: 'setup'|'playing'|'gameOver'
  round: number; roundsTotal: number
  vpMarker: number                    // no-tie track (9.2): signed from A's view; >0 A leads, <0 B leads; never 0
  initiativeSide: SideId; firstInitiativeSide: SideId; currentSide: SideId; consecutivePasses: number
  players: Record<SideId, {
    side: SideId
    nations: NationId[]
    capStart: number; capCurrent: number; unitLosses: number   // capCurrent floored at 3 (7.13)
    vp: number
    hand: CardId[]                    // (cards deferred)
    passed: boolean
    // NOTE v3: no `activatedUnitId`, no `ap` pool.
  }>
  units: Record<UnitId, {
    id: UnitId; side: SideId; nation: NationId; templateId: string
    hexId: HexId; facing: 0|1|2|3|4|5
    status: 'fresh'|'spent'           // v3: no 'active'
    stressed: boolean                 // v3: +1AP next Action; cleared by Passing (2.6/2.7)
    hitMarkers: HitType[]             // hidden info per 7.5
    assignedWeaponCards: CardId[]
    carriedBy?: UnitId                // loaded onto a transport Vehicle (15.6-15.9, M6)
  }>
  hexes: Record<HexId, {
    coord: { q: number; r: number }   // axial; label "B05"/"I06" derived for display (1.0)
    terrain: TerrainId; elevation: number; label?: string
    walls: boolean[]; road: boolean
    features: { control?: SideId; smoke?: 1|2 }
  }>
  hitPiles: { foot: Record<HitType, number>; vehicle: Record<HitType, number> }  // v3: two decks (15.13)
  reinforcements: ReinforcementUnit[] // off-Map Units awaiting an ENTER Action (4.12, real from Mission 1)
  missionId: string
  victory: VictoryConfig
  log: GameEvent[]
  winner?: SideId | null
}
```
(`history`/`future` — the undo/redo stacks — live in the Zustand store, not `GameState` itself.)

**Hex coordinates:** internal math is **axial (q,r)**; the rulebook addresses hexes as
`(Map#)-(ColumnLetter)(Row#)`, e.g. `1-E05` (1.0). Keep a label↔axial mapping in `hex.ts`/map data.

---

## 6. Rules index (cite these) — v3 sections → `rules/` files

When in doubt, open `rules/INDEX.md`. Read the file before implementing; cite `N.M` in code/tests.

| Mechanic | Engine file | v3 § | rules file |
|---|---|---|---|
| Components, setup, hex labels, counter layout | `data/`, `state.ts` | 1.0–1.1 | `rules/01` |
| Turn loop, **Spent Check**, **Stress**, Pass, Stall | `turn.ts`, `spent.ts`, `stress.ts`, `actions.ts` | 2.0–2.8 | `rules/02` |
| CAPs (reduce cost, ±1 d6, 0AP, floor 3, loss) | `cap.ts` | 3.0–3.4, 7.12–7.13 | `rules/03` |
| Position, facing, stacking, movement, terrain cost, roads, **entering the Mission (reinforcements)** | `movement.ts`, `terrain.ts`, `reinforcements.ts`, `reducer.ts` (`ENTER`) | 4.0–4.12 | `rules/04` |
| Fire Zone: arc, LOS, range | `los.ts`, `range.ts`, `hex.ts` | 5.0–5.3 | `rules/05` |
| Combat: DR/AR, soft/armored, flank, terrain, walls, **HN=DR−AR**, stacked, close combat, crewed | `combat.ts` | 6.0–6.12 | `rules/06` |
| Hits, hit markers, critical (+4), 2nd hit, rally, destroyed, CAP loss | `hits.ts`, `rally.ts`, `cap.ts` | 7.0–7.13 | `rules/07` |
| Battle/Weapon cards (Green/Blue cost) | `cards.ts` *(deferred)* | 8.0–8.8 | `rules/08` |
| Round end, **Pre-Round Sequence (10 steps)**, **Initiative (2d6≥7, non-advantage)**, VP no-tie | `turn.ts`, `victory.ts` | 9.0–9.11 | `rules/09` |
| **Group Actions** (one Spent Check; group move = highest; attack = leader +1AR/supporter) | `groups.ts` *(M5)* | 10.0–10.12 | `rules/10` |
| *(later)* hidden units | — | 11.x | `rules/11` |
| *(later)* hills / elevation / LOS-over-levels | — | 12.x | `rules/12` |
| Mortars: Direct/Indirect Attack, Spotter Hex, HE/Air Burst; *(later)* OBA/drift (pending Cards, M12) | `combat.ts`, `mortar.ts` *(M7)* | 13.0–13.3, 13.9 | `rules/13` |
| Smoke: DR/AR, LOS blocking, Rally bonus, dissipation | `smoke.ts`, `los.ts`, `turn.ts`, `rally.ts` *(M7)* | 14.x | `rules/14` |
| **Vehicles**: movement (wheeled/tracked, Bonus Moves), combat specifics, Transport/Towing; *(later)* Towing damaged Vehicles (§15.10) | `movement.ts`, `combat.ts`, `hits.ts`, `reducer.ts` *(M6)* | 15.x | `rules/15` |
| **Special units**: Turreted, Open-Topped, APC Transport Bonus, Trucks/Wagons, Field Guns, Mobile Vehicles (§16.4) | `combat.ts`, `movement.ts`, `reducer.ts`, `actions.ts`, `victory.ts` *(M6)* | 16.x | `rules/16` |
| *(later)* fortifications / trenches / bunkers / obstacles / mines | — | 17.x | `rules/17` |
| *(later)* flamethrowers / pioneers | — | 18.x | `rules/18` |
| *(later)* alternate player counts | — | 19.x | `rules/19` |

### Combat quick-reference (v3 — the math everything hinges on)
- `AR = Firepower(matching the target's DR colour) + AR modifiers` (range, hit-marker FP delta,
  **+1 per Group supporter**, card mods). Red FP vs **soft** (red DR); blue FP vs **armored** (blue DR).
- `DR = Defense(front if attacker in target's arc, else flank) + terrain DR + smoke + wall(+1 if the
  shot crosses a wall bordering the target hex) + fortification + elevation(+1 if target higher)`.
- **`Hit Number = DR − AR`. A `2d6 ≥ Hit Number` is a Hit. Critical (instant kill) if you exceed the
  Hit Number by 4+.** A unit with an existing hit marker that takes another Hit is destroyed.
- Range AR mods: **adjacent +3AR**, **beyond Range (≤2×) −2AR**, **close combat +4AR**
  (**crewed/white-box −2AR in CC**). You may spend **up to 2 CAPs to lower the Hit Number before
  rolling** (3.2).

### Foot / Soft-Target hit markers (`data/hitMarkers.ts`) — counts, effects, rally # (7.x)
*(unchanged from the 2nd-ed deck — it already matches v3's Soft Target deck; "KIA" = "Destroyed")*
- Stunned ×2 — only rally; rally 7
- Unnerved ×2 — no stat effect; rally 7
- Destroyed ×1 — killed on draw
- Pinned ×5 — cannot move/pivot; rally 7
- Panicked ×2 — cannot fire; flank DR +1, front DR −2; rally 8
- Suppressed ×5 — +1 AP to fire; FP −2; rally 7
- Cowering ×2 — +2 AP to fire; +1 AP/hex move/pivot; range→1; DR +1; rally 8
- Berserk ×1 — −1 AP to fire; FP +1; range→1; DR +1; rally 8

**Armored-Target deck ✅ built (`data/hitMarkers.ts`, M6 — `rules/15`):** Stunned ×2 (rally 9),
Destroyed ×1, Immobilized ×5 (no move/pivot; no rally), Light Damage ×4 (no effect; no rally), Gun
Damaged ×2 (cannot fire; no rally), Panicked ×1 (cannot fire; front DR −4; rally 9), Suppressed ×5
(+1AP; red FP −3, blue FP −5; rally 8). Drawn from `hitPiles.vehicle`, keyed by `ArmoredHitType`
(`aStunned`, `aDestroyed`, …) so a marker is self-describing regardless of pile; routed by the
target's DR colour (blue → vehicle pile, red → foot pile).

---

## 7. Conventions

- **Everything is data-driven.** Adding a nation, unit, card, or mission should be a `data/` edit.
  - **Add a unit:** stat template `{ nation, fp:{red,blue}, dr:{front,flank,color}, move, range,
    apToFire, vp, flags, whiteBoxFp? }` in `data/units.ts`. (v3: `apToFire`/`move` are **Spent-Check
    thresholds**, not pool spend.) **Vehicles** (`kind:'vehicle'`) add `propulsion:'wheeled'|'tracked'`
    and `bonusMoves?: number` (§15.1–15.2); any `kind:'vehicle'` template may Transport one foot Unit
    (§15.6) — no separate flag needed. A **Mobile Vehicle** (§16.4, a Wheeled vehicle that also
    carries Track Bonus Move symbols) adds `mobileTrackBonusMoves?: number` alongside its (Wheel)
    `bonusMoves` — those extra Bonus Moves may be spent in any order, may enter Open Terrain
    (a plain Wheeled vehicle's Bonus Moves can't), and ignore Road Congestion. **Special Units (§16):**
    `turreted?` (fire outside Arc, +2AP),
    `openTopped?` (red Flank DR + Soft marker vs red-FP CC), `apcTransport?` (+2DR for a carried Soft
    Target), `cannotControlHex?`/`noCapLossOnDestroy?`/`attackMode?:'closeCombatOnly'|'none'` (Trucks/
    Wagons, §16.1). Field Guns (§16.7) are just `kind:'gun'` + `propulsion:'wheeled'` — already towable
    since Load's damage precondition only applies to `kind:'vehicle'`. **Mortars (§13, M7):**
    `kind:'mortar'` templates add `minRange?` (Minimum Range) and `indirectApToFire?` (Indirect Attack
    Cost, separate from `apToFire`'s Direct cost); every `kind:'mortar'` automatically fires HE (always
    vs Flank DR, Air Burst exception) via `combat.ts`, no extra flag needed. `canFireSmoke?` (any kind)
    marks a Unit that may `FIRE_SMOKE` (§14.0: 80mm+ mortars, Artillery Cards, Pioneers, some Tanks).
  - **Add a card:** `{ id, type:'action'|'bonus'|'mission'|'artillery', cost:{green?,blue?}, effect }`
    in `data/cards/` (v3 Green/Blue cost, 8.5). Effects are engine actions/modifiers, not UI code.
  - **Add a mission:** new file in `data/missions/` with maps, placements (by hex label), starting
    CAPs per side, rounds, victory config, deck, hidden-unit slots.
- **Actions** are plain serializable objects (see `engine/types.ts`'s `Action` union for the exact
  shapes): `MOVE` (unitId, toHexId, optional vehicle `path`, `capCostReduce?`), `PIVOT`, `FIRE`/
  `CLOSE_COMBAT` (attackerId, targetId, `capDiceMod?`, `capCostReduce?`), `RALLY`, `STALL`, `PASS`;
  Group Actions `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY` (§10); Transport `LOAD`/`UNLOAD` (§15.7/
  §15.9); reinforcement `ENTER` (`{ placements: {unitId, hexId, facing?}[] }`, §4.12); Mortar
  `INDIRECT_FIRE` (attackerId, targetHexId, spotterHexId, §13.2) and `FIRE_SMOKE` (unitId, targetHexId,
  optional spotterHexId for Indirect, §14.1). Cards (`PLAY_CARD`) are deferred, not yet a real action
  type.
  **Removed in v3:** `ACTIVATE_UNIT`, `MARK_SPENT` (no activation/pool).
- **Tests:** colocate in `__tests__/`. **Reproduce the v3 red-box examples** from `rules/NN-*.md` as
  fixtures — they are worked rule implementations (Spent Checks, Stress, combat HN, rally, OBA drift,
  bunker DR, etc.) and make excellent oracles.
- **No engine→UI imports.** UI imports engine; never the reverse.

### Requested UI features (all implemented — keep them working)
*(presentation is edition-agnostic; only the readouts change: show **Fresh/Spent + Stress** and the
Spent-Check die instead of a remaining-AP pool)*
- **Real pointy-top hex board** ✅ (`Board.tsx`/`hexgeo.ts`); the square ASCII grid in `play.ts` is
  debug-only.
- **Unit facing (§4.1)** ✅ `UnitCounter.tsx` rotates the whole counter (not an overlay arrow) so its
  **green top-edge bar** (+ a small outward notch) sits flush against whichever of the six hexsides it
  faces — matching the physical counter/rotate-in-place metaphor exactly (a corner is never a legal
  facing). Rotation = `atan2(facingVector) + 90°`, applied via one `<g transform="rotate(...)">`
  wrapping the whole counter, so every printed stat rotates with it, just like flipping a physical chit.
- **Free facing correction (§4.5/§15.11)** ✅ after a Move (solo or Group) or an automatic unload from
  a destroyed Transport, `GameState.pendingFacingChoices` grants the affected Unit(s) a follow-up,
  **0AP/no-Spent-Check** `CHOOSE_FACING` action (`reducer.ts`) — matches "may freely Pivot after
  moving" / "placed facing any direction." Turn-agnostic (a normal Action already handed the turn to
  the other side) and closes the instant any other Action resolves. Store auto-selects the pending
  Unit (plain click-to-select is current-side-only and couldn't reach it); `Inspector.tsx`'s
  arrow-button picker renders outside the `yours`-only gate so it's visible regardless of turn. Regular
  Unload (§15.9) grants the same follow-up. `Board.tsx` also highlights the six neighbor Hexes **blue**
  (`#3a8ee0`) with an on-board "Choose facing" label (rendered last in the SVG so it's always on top) —
  clicking a blue Hex faces that direction, a second way in alongside the arrow picker. Tests:
  `facing-choice.test.ts` + the `transport.test.ts` §15.11 case.
- **Facing already governs both Arc of Fire and Front/Flank DR, and backwards movement already costs
  extra** (verified, no code changes needed): `combat.ts`'s `attackContext` denies a shot outside the
  attacker's own Arc of Fire unless it's Turreted (§16.2, `+2AP`, `outOfArc`/`inArc`), and separately
  picks the target's Front vs Flank DR from whether the attacker sits inside *the target's* arc
  (§6.1/§6.3, `attackerInTargetFront`). `movement.ts`'s `moveCost`/`planVehicleMove` add **+1AP**
  whenever the destination isn't in the mover's own front arc (§4.11/§15.1, `isInFrontArc`) — a
  Backwards Move.
- **Custom per-hex artwork** ✅ via `data/hexArt.ts` (`TERRAIN_ART` + `HEX_ART_OVERRIDES`, SVG
  `clipPath`); `USE_HEX_ART=false` → flat colors.
- **Under-cursor panel** ✅ `HoverPanel.tsx` — terrain rules + half-size unit renders.
- **LOS visibility mode** ✅ hold **Shift** → `los.visibleHexesFrom` shades visible hexes; topbar
  button pins it.
- **Fire-odds popup** ✅ with a unit selected, hovering a target shows hit %/crit % + AR/DR detail
  (`ui/odds.ts`); a shot resolving a stacked hex lists one row per enemy (6.9).
- **Stacked units / selection** ✅ fanned with `×N` badge; click auto-selects a Fresh unit; **Ctrl+
  click** opens `UnitPicker`; click selected to deselect.
- **Action chooser** ✅ `ActionChooser.tsx` when a hex affords >1 action (e.g. move into an enemy
  hex vs close-combat it). **Fixed:** it used to derive "can Move/Fire/CC here" from
  `legalActionsForUnit`'s CAP-gated list, so for a Spent Unit that could afford one option but not the
  other, the unaffordable one silently vanished and the click just executed the sole survivor (no
  chooser). `store.ts`'s `hexClick` and `ActionChooser.tsx` now check **rules legality directly**
  (`moveCost(...).ap`, `attackContext(...).legal`, `closeCombatContext(...).legal` — same as the odds
  popup) so a Spent Unit still gets offered the option; choosing it still runs the normal CAP-confirm
  flow (§3.4). Indirect Fire/Fire Smoke/Load stay CAP-gated (out of scope). See memory
  `conflict-of-heroes-chooser-legality`.
- **Spent-Check / opportunity confirm** ✅ acting with a unit prompts the Spent-Check die flow
  (replaces the old opportunity-spend confirm); `ConfirmDialog`.
- **Turn banner** ✅ `TurnBanner.tsx` "Start of turn N".
- **Readouts + dice in log** ✅ track sheet/inspector show **Fresh/Spent + Stress** and CAPs; the log
  prints the actual 2d6 (fire/rally/initiative) and the Spent-Die result.
- **Animated clickable dice with sound** ✅ `DiceRoller.tsx` — dice show `?` until clicked, then
  settle on the **engine-provided** result (previewed from the seeded RNG, then committed); never
  influences the outcome. Stacked fire rolls one enemy at a time and commits once (6.9). **Add the
  Spent Die as a roll kind.**
- **Dice-roller detail** ✅ `DiceRoller.tsx` now shows, above the dice: an **AR/DR modifier breakdown**
  (`attackContext`/`closeCombatContext`/`rollIndirectFire` return `arMods`/`drMods: Modifier[]` —
  `{label, value, section}` line items that sum to the actual `ar`/`dr`, incl. `value: 0` entries that
  explain an *expected* bonus that didn't apply, e.g. Air Burst zeroing Heavy Woods; tests:
  `combat-mods.test.ts`); the **% to hit/critical** (`odds.ts`'s `oddsForHitNumber`, off the
  already-resolved `AttackRoll.hitNumber` so any CAP dice mod is included); and, once a Hit lands, the
  **resulting Hit Marker's name + effects (or "Destroyed")** via `hits.ts`'s new `resolveHit` (the one
  place that decides a Hit's outcome — `reducer.ts`'s `applyHit` now calls it too, so the dice-roller's
  preview can never disagree with what actually commits; tests: `hits.test.ts`'s `resolveHit` suite,
  incl. a seeded preview-vs-real-`reduce()` check). Cancel button restyled `button.danger` (red bg,
  white text, same shape as `.primary`).
- **Pivoting a loaded Vehicle also pivots its passenger** ✅ (§15.7: rides facing the same direction;
  only Unloading, §15.9, gives it an independent facing choice) — `reducer.ts`'s `doPivot` propagates
  `a.facing` to any `passengerOf(unit.id)` and treats it as a Group Action (one Spent Check for both,
  like Move-with-passenger already did). Test in `transport.test.ts`.
- **Unloading (§15.9) confirms instead of firing silently** ✅ a carried Unit's Unload Hexes render
  green like Move (its only "where can I go" highlight); clicking an adjacent one shows a plain
  "Unload to X?" confirm (`pendingConfirm`); clicking the Vehicle's own Hex is ambiguous with
  click-to-deselect, so that one opens `ActionChooser` with explicit "🚚 Unload here"/"✕ Deselect".
- **Movement & fire SFX** ✅ `sound.ts` synthesizes audio by `template.kind`; mute toggle.

---

## 8. Milestone roadmap

- **M0 — Scaffold** ✅ Vite+React+TS, Vitest; `hex.ts`, `types.ts`, `rng.ts`.
- **M1 — Engine core (infantry, 2nd ed)** ✅ terrain, movement/facing, LOS/arc, combat, hits, rally,
  range, CAP, turn/round, victory, `reduce`, `initGame`, `legalActions`.
- **M2 — Mission 1 content** ✅ real **Map 1** (206 hexes, authored from the Mission Book) +
  "Partisans" (`missions/mission1.ts`: 5 rounds, 7 CAP/side, German Round-1 initiative, Soviets +1
  VP, I06 = 1 VP/round + 1 VP/kill, no cards — a Section-1 teaching Mission). **M2.5 —
  Reinforcements (§4.12)** ✅ real `ENTER` action (`reinforcements.ts`, `ReinforcementsPanel.tsx`),
  not pre-placed.
- **M3 — UI** ✅ Zustand + React/SVG board, dice/SFX, log, setup/victory screens, LOS overlay
  (hold Shift), fire-odds popup, per-hex art, hover panel, turn banner. **M3.3** ✅ Close Combat
  (`CLOSE_COMBAT`, flank DR +4/−2 crewed). **M3.4** ✅ conformance audit (`scripts/conformance.ts`).
- **M4 — Persistence** ✅ named save slots, JSON export/import, undo/redo; RNG travels with saves.
- **★ M4.5 — v3 cutover** ✅ Spent Die/Check, Fresh/Spent + Stress, CAP floor 3, AR/DR combat, v3
  initiative + no-tie VP. See `docs/v3-migration-plan.md` for the historical plan/rationale.
- **M5 — Group Actions (§10)** ✅ `groups.ts` + `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY`, one Spent
  Check per Group (group move = highest member cost; group attack = leader +1AR/supporter). UI:
  "Group" mode (multi-select, formation-move arrows, click-enemy attack). **Group Close Combat
  (§10.6)** landed later — see below; `GROUP_ATTACK` now covers both ranged and Close Combat.
- **M6 — Vehicles + Special Units (§15–16)** ✅ Armored Target hit deck; vehicle movement
  (wheeled/tracked terrain costs, Bonus Moves §15.2) with click-to-build-path UI; vehicle combat
  specifics (no CC terrain bonus, Vehicle Cover); Transport/Towing (`LOAD`/`UNLOAD`, ride-along Group
  Move, click-to-load/unload UI, towing damaged Vehicles). Special Units (§16): Turreted (+2AP
  outside Arc), Open-Topped, APC Transport Bonus, Trucks/Wagons (`attackMode`, no Hex control, no
  CAP loss on destroy). `Armor Sandbox` (`data/missions/sandbox.ts`) test mission; two extra German
  rifles were added later for a Group Close Combat click-through (see §10.6 below).

  **§16.4 Mobile Vehicles** ✅ (landed later, low priority but no longer deferred): a Wheeled Vehicle
  may also carry Track Bonus Move symbols (`mobileTrackBonusMoves` in `data/units.ts`) alongside its
  (Wheel) `bonusMoves`. `movement.ts`'s `classifyBonusStep` tags each Bonus-Move step `'either'`
  (uncongested Road→Road — payable from either budget) or `'track'` (Road Congestion, or entering
  Open Terrain — Track budget only); `planVehicleMove` then checks the required-`'track'` count
  against `mobileTrackBonusMoves` and the remaining flex steps against `bonusMoves` +
  leftover Track budget, so the two symbol types can be spent in any order within a single multi-hex
  Move. Retrofitted the `ger-sdkfz251` half-track (previously modelled as plain Tracked) to
  `propulsion:'wheeled', bonusMoves:1, mobileTrackBonusMoves:1` — the historically-accurate case for
  this unit and now a real, exercised example rather than a theoretical field. `Armor Sandbox` gained
  a `G-sdkfz251` placement on the O02-O03 Road pair (Open terrain at O04) for a live click-through:
  regular Move to O03 (Road→Road) + a Track Bonus Move off-road onto O04, resolved for 1AP total
  (bonus moves are free) — verified in-browser. New coverage in
  `engine/__tests__/mobile-vehicle.test.ts`.

  **§16.5 Open-Topped: added the `ger-pzjg35r` (PzJg 35R) unit** — the rulebook's own worked example
  for this rule ("the PzJg 35R has a red 13DR if attacked by a Soviet Rifle unit in CC"), so it's a
  real, sourced example rather than only the already-existing `ger-sdkfz251`. A Czech 47mm gun on a
  captured French R35 chassis (`kind:'vehicle'`, `propulsion:'tracked'`, no `turreted` flag → a §16.3
  Self-Propelled Gun by default, matching its real casemate mount). Stats: `fp:{red:2,blue:7}`,
  `dr:{front:15,flank:13,color:'blue'}`, `move:1`, `range:8`, `apToFire:4`, `openTopped:true`. Sourced
  from `reference/rulebook.txt` (gitignored local OCR text, §10) Unit List p.38-39: the Flank DR (13)
  and the "disappointing"/slow characterization are textually reliable, but the printed counter's own
  numbers were badly OCR-scrambled (interleaved with a neighboring unit's) — Attack Cost, FP, and
  Front DR are a best-effort reconstruction by elimination against that one confirmed fact, plus a
  user-confirmed Range of 8; see the code comment in `data/units.ts` for the full reasoning. Added to
  `Armor Sandbox` at F04.

  **§16 audit — all subsections confirmed done; two real gaps found and fixed:** §16.1/16.2/16.4 were
  already solid. §16.3 (SPGs) needs no code — it's just the default non-Turreted arc-check + ordinary
  `PIVOT` — added a test labeled as such using `ger-pzjg35r`. §16.5 (Open-Topped) and §16.6 (APC
  Transport Bonus) were **only wired into `closeCombatContext`, not `attackContext` (ranged/HE) or
  `mortar.ts`'s `rollIndirectFire`** — an HE/Mortar attack on an Open-Topped Vehicle didn't flip its
  Flank DR to red, and neither ranged nor Indirect Fire applied the APC +2DR bonus to a carried Soft
  Target, even though neither rule carves out an HE exception. Fixed in both `attackContext` (gated on
  `isHE`) and `rollIndirectFire` (unconditionally HE); also added the likewise-missing
  `vehicleCoverBonus` (§15.15) to `rollIndirectFire`. `vehicleCoverBonus`/`apcTransportBonus` are now
  exported from `combat.ts` for `mortar.ts` to reuse. Tests: `mortar.test.ts`, `special-units.test.ts`.
  §16.7 Field Guns were mechanically correct already (`kind:'gun'` skips the Vehicle-only
  Immobilized/Stunned tow precondition by construction) but untested and single-nation — added
  `sov-atgun45` for parity, 4 tests in `transport.test.ts`, and both `ger-pak40`/`sov-atgun45` now sit
  stacked with their side's Vehicle in `Armor Sandbox` for an immediate same-Hex Load, verified live.

- **M7 — Mortars + Smoke (§13–14) — engine + UI ✅ (Spotter picker deferred):** `mortar.ts` — Direct
  Attacks reuse `FIRE` (min-range denial + HE-always-Flank-DR + Air Burst folded into `combat.ts`'s
  `attackContext` for any `kind: 'mortar'`); Indirect Attacks are a new `INDIRECT_FIRE` action resolved
  via a Spotter Hex (within 2, clear LOS of the Mortar) that supplies LOS while Arc/Range stay keyed to
  the Mortar's own Hex (Spotter Elevation Bonus deferred to 0 pending Hills, M9). `smoke.ts` — Heavy/
  Light DR/AR modifiers, LOS blocking (Heavy always; 2+ Light Hexes on a path; a lone Light Hex adds
  +1DR instead), a Rally +1 bonus, and Pre-Round dissipation (`turn.ts`); a new `FIRE_SMOKE` action
  (Direct or Indirect) places Heavy Smoke instead of attacking — legal on any non-Water Hex whether or
  not a Unit occupies it (§14.0: it targets terrain, so screening an empty advance route is legal, not
  just enemy Hexes — `legalActionsForUnit` enumerates every reachable non-Water Hex, not just
  enemy-occupied ones). UI: `ActionChooser` offers `⤳ Indirect Fire`/`☁ Fire Smoke` alongside Move/
  Fire/Close-Combat when a clicked Hex affords them, auto-picking a
  Spotter Hex (`bestSpotterFor`) through the normal CAP-gate + dice-roll flow; the Board outlines every
  Hex a Mortar can reach — Fire, Indirect Fire, or Fire Smoke — in the same solid red as a normal Fire
  target (a per-action dashed color coding was tried first and wasn't visible enough), and renders an
  actual haze overlay on Hexes that currently have Smoke (`HoverPanel` reports the level too). `Fire
  Support Sandbox`
  (`data/missions/fireSupportSandbox.ts`) is a non-canonical test mission (Mortar+Rifle/side, separated
  by Heavy Woods so Indirect Fire is actually exercised) — both flows verified end-to-end in-browser.
  *Deferred, on purpose:* **OBA (§13.4–13.9)** — it's specified as Artillery Weapon Cards, so it waits
  for the real Cards subsystem (§8, M12) rather than getting a throwaway parallel mechanic now. The
  auto-picked Spotter Hex (locked decision — no manual picker; §13.3 doesn't care which valid Spotter
  Hex is used) always measures Min/Max Range and Arc from the Mortar's own Hex, never the Spotter's.

- **Group Close Combat (§10.6)** ✅ closes the M5 gap: `GROUP_ATTACK` branches on
  `target.hexId === leader.hexId` — Close Combat resolves via `closeCombatContext`/`rollCloseCombat`
  (both gained an `arBonus` param) against the ONE chosen target (not a hex-wide stacked shot, unlike
  ranged Group Attack). `isValidSupporter` (`groups.ts`) restricts Close-Combat support to Units
  sharing the Leader's hex (§10.6); a Truck (`attackMode:'closeCombatOnly'`) may lead or support one
  (only `attackMode:'none'`, Wagons, still can't) — the old blanket "Trucks can't support any Group
  Attack" exclusion only ever applied to the *ranged* case. Covered by 4 new tests in `groups.test.ts`.
  Reused the two extra German rifles now in `Armor Sandbox` (see below) for a live click-through.

  **That click-through surfaced two real store.ts bugs, since fixed (§3.4/§10.1):** (1) `groupAttack`
  used to `dispatch` a `GROUP_ATTACK` straight away with **no dice-roll preview and no CAP-confirm** —
  unlike single-unit Fire/Close Combat, it just resolved instantly with no chance to see odds or
  cancel. Fixed with `requestGroupAttackRoll` (branches ranged/CC, mirrors `requestFireRoll`/
  `requestCcRoll`) and a new `groupCapGate` helper (mirrors `capGate` but for a member list). (2) The
  board-click Group-selection logic (`hexClick`'s `groupMode` branch) filtered to `status==='fresh'`
  only, so a Spent Unit could never even be **added** to a Group at all — not a missing confirm, fully
  unreachable, which is why the user's Group Move test "didn't seem implemented." Broadened to accept
  Spent Units too; `groupMove`/`groupRally` now route through `groupCapGate` as well, and `load`/
  `unload` (which already baked the right `capCostReduce` into their precomputed action) gained a
  matching `confirmPrecomputedCap` step. Both fixes verified live (Armor Sandbox: Group Close Combat
  showed the roll dialog; a two-Spent-member Group Move showed "Spend 3 CAP... CAP 7 → 4" and resolved
  correctly at 0AP). Test coverage stayed at the engine layer (reducer already had this right) — these
  were pure `store.ts`/UI-wiring bugs, not rules bugs.
- **M8 — Hidden Units (§11) — DEFERRED to online play, on purpose, locked decision:** Hidden Units
  are fundamentally secret-information state — one side's Unit positions must not be visible to the
  other — and this build is hotseat: both sides share one screen and one `GameState`, unlike every
  other mechanic so far (CAPs, VP, even off-Map reinforcements, all fully visible to both sides
  simultaneously). There's no "look away" enforcement possible in a single browser tab short of a
  genuine per-player view, which this architecture doesn't have until a real second client exists.
  Build it once M13 (online multiplayer, authoritative server + WebSocket rooms) lands — a server can
  actually withhold a Hidden Unit's Hex from the other client's payload; a shared hotseat screen can't.
  Do not attempt a hotseat-only approximation (e.g. hiding enemy Hidden Units from the board render by
  `currentSide`) — it's trivially defeated by anyone glancing at devtools/state and would need
  rebuilding anyway once the real per-client model exists.
- **Later (additive, v3 order):** M9 elevation/hills (§12) → M10 fortifications/obstacles/mines (§17)
  → M11 flamethrowers/pioneers (§18) → M12 cards (§8, incl. OBA) → **M13 online multiplayer** (host
  the pure engine authoritatively + WebSocket rooms; the client already speaks action objects) →
  **M8 Hidden Units** (§11, now buildable for real).

---

## 9. Technical risks (build with tests early)

1. **Action economy correctness** (§2, 3): cost = base + Stress + terrain + hit-marker − CAP; Spent
   Check passes iff `roll > cost`; 0AP ⇒ no check; Stress is +1AP, not cumulative, cleared by Pass.
   Encode the `rules/02`–`rules/03` red boxes as tests.
2. **LOS geometry** (§5.2): centre-to-centre; blocked if it crosses *any part* of a blocking hex;
   exactly along an edge ⇒ **not** blocked; Units never block LOS; LOS is reversible. Test `rules/05`.
3. **Arc / front-vs-flank** (§4.1, 6.3): facing sectors choose Front vs Flank DR; test all six facings.
4. **Initiative & VP no-tie** (§9.2, 9.11): only the non-advantage side rolls (≥7 first); the VP
   marker flips below 1 — one side always leads. Test the `rules/09` example.

---

## 10. Content & legal note

Author all stats/terrain/scenario data ourselves and render with original simple graphics. Game
**rules and stats** are facts/ideas (fine to implement); **do not copy** Academy Games' artwork, map
images, or counter art. Personal-use project.
