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

## B. Hex board migration (flat-top substrate — done; Mission 1 re-authored on it)

The board's geometry was migrated from **pointy-top** to **flat-top** hexes, per
**`docs/hex_board_spec/README.md`** (authoritative — geometry, labels, rotation, and multi-board
abutment; not to be re-derived from memory). This isn't a departure from the rulebook's own
convention — `rules/01-game-components.md`'s **"(Map #)–(Column Letter & Row #)"** citation (e.g.
"1-E05") is the *same* scheme as the new spec's `A01`..`S12` + board number; only the board number's
presentation changed (a large graphic in its own cell, not a text prefix). Status:

- **Substrate — done:** `engine/hex.ts`'s `axialToPixel` is flat-top. `engine/hexBoard.ts` bridges
  the spec's per-board column/row grid (`A01`..`S12` labels, the board-number cell, multi-board seam
  merging into one shared axial space) to the engine's existing axial adjacency math — see its
  header comment for the derivation (the naive per-axis board-pitch translation is **wrong**; the
  flat-top pixel formula couples `r` to `q`, so a corrected embedding was needed and is proven
  numerically + by test). `ui/hexgeo.ts` draws flat-top hexes with real half/quarter-hex edge
  clipping (`clipHexPolygon`, Sutherland–Hodgman against each hex's own center — every board clip
  line passes exactly through the affected hex's center, verified). `Board.tsx` renders the clipped
  polygons, per-hex coordinate labels, and the large board-number cell. Proven by a non-canonical
  `Hex Board Demo` mission (`data/missions/hexBoardDemo.ts` — a `TWO_BOARDS` flag toggles between a
  blank single-board reference canvas and two boards abutted east-west with units straddling the
  seam) and `engine/__tests__/hexBoard.test.ts` / `ui/__tests__/hexgeo.test.ts` /
  `data/missions/__tests__/hexBoardDemo.test.ts`.
- **Mission 1 — done, re-authored from scratch onto the new grid** (not reprojected — a locked
  decision; reprojecting the old pointy-top `q,r` data would keep adjacency correct but visually
  scramble the intended battlefield shape, since it's a different linear projection, not a
  rotation). Real terrain, reinforcements, CAPs (6 German / 7 Soviet), starting units, and the
  victory hex were rebuilt hex-by-hex directly with the user. Authoring workflow, reusable for future
  missions: `data/hexBoardMap.ts`'s `applyTerrainJson(boards, json)` takes a
  `{ boardNumber: { label: code } }` JSON map (`TERRAIN_CODES` for the valid code strings, incl.
  `<terrain>_road` compounds like `heavy_woods_road` — a Road doesn't change the hex's terrain for
  defense purposes, only negates its Difficult-Terrain movement cost road-to-road, §5.0.1 — already
  how `movement.ts`/`combat.ts` work, no engine change needed for that) on top of
  `generateOpenBoard`'s all-open base; unmentioned hexes stay Open. See `data/maps/mission1.ts` for
  the live example. The rulebook's own terrain table (`rules/04`) has exactly 8 types, all already
  implemented — "more terrain types" almost always means art variety
  (`data/hexArt.ts`'s per-hex `HEX_ART_OVERRIDES`), not a new mechanical type.
- **Sandboxes — all fixed now.** `sandbox.ts` (Armor) and `fireSupportSandbox.ts` were already fine —
  both reuse `data/maps/mission1.ts`'s real `MISSION1_MAP`, so they got the flat-top substrate for
  free. `hillsSandbox.ts`, `obstaclesSandbox.ts`, and `fortificationsSandbox.ts` each originally
  placed their own small custom grid via raw `hexId(q, r)` — correct for the old pointy-top renderer,
  but a sheared parallelogram under flat-top (adjacency was never wrong, just the visual shape).
  Fixed identically in all three: every hex, unit, and the victory hex now goes through a local
  `at(c, r)` helper that calls `engine/hexBoard.ts`'s `colRowToAxial({ c, r })` (the same column/
  row→axial formula the real board substrate uses — column parity shifts axial `r` by
  `-floor(c/2)`) instead of the raw axial pair. Nothing else about any of the three missions changed
  — same terrain/CAP/unit/obstacle/fortification data, same `R{row}C{col}` labels (no need for real
  `A01`-style labels or a board-number cell on a non-canonical test map). Verified live for all three
  (board renders as a proper rectangle in each) plus Mission 1/Armor/Fire-Support-Sandbox as a
  regression check: the **hold-Shift LOS-preview overlay** (`Board.tsx`'s `losActive`/
  `visibleHexesFrom`) still lights up correctly on every one of the 6 missions — it was never actually
  at risk (LOS is pure axial-index math, orientation-agnostic, same reasoning as §B's closing
  paragraph below), but worth confirming after touching mission coordinate data since a coordinate
  bug could in principle corrupt adjacency, unlike a pure-rendering bug. Also reverified the
  mission-specific LOS set-pieces these sandboxes exist to demonstrate still hold post-fix: Hills
  Sandbox's G-hilltop→S-rifle downhill shot, G-mesa↔S-mesa same-level sightline, and the §12.6 Blind
  Spot pair (R2C6 hidden from the ridge peak, R2C7 visible beyond it) all reproduced correctly.
- **Rotation is still not built** — see memory `conflict-of-heroes-hex-board-rotation` for the
  locked requirements (labels always render upright; only same-length board edges abut) to apply
  whenever a real mission needs it.
- **Three real gotchas found live-testing Mission 1, all worth remembering:**
  1. **The literal board-edge column/row is never a valid "full Hex" entry edge.** Column A (or S,
     or row 1/12) is entirely half/quarter-hexes by construction (`edgeCut` is set on every cell) —
     there is no such thing as "a full Hex on the boundary column." A §4.12 entry requirement like
     "enters along the west edge" means the **first full column in from the boundary** (column B,
     not A) — exactly mirroring how the original Mission 1 already used Row B, not Row A, for its
     south edge. Caught because a unit was allowed to enter onto a half-hex; the fix was in mission
     data (`WEST_EDGE` in `data/missions/mission1.ts`), not the engine — `legalEntryHexes` doesn't
     filter for full hexes on its own, callers must build entry-hex lists that already exclude them
     (see `withinPlayableFullHex` in that same file for the pattern).
  2. **§4.12 Stress-on-entry was already correct, not a bug** — worth noting only because it's easy
     to *suspect* it's broken when something else nearby (the half-hex entry, above) actually is.
     `reducer.ts`'s `doEnter` → `afterGroupAction(placed, 0)` applies Stress unconditionally
     regardless of the 0AP cost, and `engine/__tests__/reinforcements.test.ts` already had a
     passing test for exactly this. Don't re-fix what isn't broken — verify against the existing
     test/code first.
  3. **The SAME half-hex-entry bug (#1) recurred on the Soviet side, later, even after #1 was
     documented right here.** `sov-r2-reinforcements`' `entryHexIds` used the scenario's own named
     Hex, `S06` — but column S is the board's literal east edge, so S06 has `edgeCut: {e: true}`
     just like every column-A hex does. Fixing #1 for the German west-edge wave didn't prompt a check
     of every OTHER wave's entry hex in the same mission for the identical mistake. Fixed the same
     way: the nearest full-Hex neighbor that's still on the Road (`R07` — its other full neighbor,
     `R06`, isn't on the Road, so it wouldn't have preserved "Road Hex"), verified via
     `neighbors()`/`edgeCut` directly rather than assumed. **Lesson: when a mission-authoring rule
     like this gets caught once, grep the SAME mission's other `entryHexIds` (or any other
     hex-label reference) for the same class of mistake immediately — don't wait for each one to be
     independently reported.**
- **Group reinforcement entry — done.** §4.12 allows multiple Reinforcement Units to enter together
  as a Group (10.2) in one Action (no Spent Check, one shared Stress-all outcome), with each Unit
  free to choose its own facing. Engine: `groups.ts` exports `hexesConnected(hexIds)` (extracted from
  its existing `groupConnected` flood-fill, "same-or-neighbour chain" relation), and `reducer.ts`'s
  `doEnter` now denies a multi-placement `ENTER` whose Hexes aren't `hexesConnected` — §4.12's "same
  or adjacent entry Hexes" is enforced, not just per-hex legality (`reinforcements.test.ts` covers
  both a connected and a scattered case). UI: `store.ts` replaced the old single-unit
  `placingReinforcementId` with a queue (`placingReinforcementQueue`/`placingReinforcementFacing`/
  `placingReinforcementDone`) — `startPlaceReinforcements(unitIds)` arms one or more Units, and each
  walks Hex → facing → (next Unit or dispatch) in turn; the final ENTER only fires once every queued
  Unit has both. `ReinforcementsPanel.tsx` gained per-unit checkboxes + a wave-level "Place selected
  as Group" button alongside the existing one-at-a-time `Place` button and the fast-path "Enter now"
  (unchanged, still auto-spreads at the wave's default facing with no per-unit choice — the deliberate
  quick option). `Board.tsx` reuses the existing blue six-neighbor facing-highlight machinery
  (previously keyed off a live `Unit`, now generalized to work off a bare Hex id since a
  mid-placement reinforcement has none yet) — clicking the placement Hex itself keeps the default
  facing, clicking a neighbor sets that direction. **A real bug caught during live testing, since
  fixed:** the entry-Hex highlight for the 2nd+ queued Unit initially still offered the wave's *full*
  legal-entry set, not just Hexes connected to what was already placed — a user could click two
  non-adjacent Hexes, walk both through a facing choice, and only then have the final ENTER silently
  denied by the reducer's `hexesConnected` check, with the queue/facing state already optimistically
  cleared (so the Units silently reappeared in the panel with zero error feedback). Fixed two ways:
  (1) `Board.tsx`'s entry-Hex highlighting now intersects with "connected to `placingReinforcementDone`"
  once at least one Unit has a Hex, so an illegal pick is never offered in the first place; (2)
  `store.ts`'s `chooseReinforcementFacing` no longer clears placement state *before* dispatching —
  it checks `lastEvents` for an `illegal` result and reopens the queue instead of silently dropping
  the Units if the reducer ever disagrees (defense in depth, per CLAUDE.md §3's "legality lives in the
  engine, not the UI's own assumptions"). Verified live in-browser: two German Rifle Squads entered
  together at adjacent west-edge Hexes as one Group Action ("Group 0AP action — no Spent Check").
  **Live preview counter while placing** ✅ (follow-up): a queued reinforcement Unit isn't a real
  `Unit` (in `game.units`) until the whole ENTER dispatches, so with no extra handling nothing would
  render on the board until every queued Unit had both a Hex *and* a facing — the user had to place
  blind. `Board.tsx` now synthesizes a preview `Unit` (fresh, no hit markers, not carried) the instant
  a Hex is chosen: while `placingReinforcementFacing` is open it renders at the wave's suggested
  facing, and once `chooseReinforcementFacing`/`useDefaultReinforcementFacing` commits, the *next*
  render reads the real facing straight out of `placingReinforcementDone` — a plain re-render "snap"
  to whatever the store says, the same mechanism the real §4.5 free-facing-correction picker already
  uses elsewhere, not a new animation/interpolation system. Preview `Unit`s merge straight into the
  same `unitsByHex` map real ones use, so stacking/fan-out and the transition to the real `Unit` once
  ENTER actually dispatches both come for free with zero extra code. Verified live: a single-Unit
  placement shows the counter immediately on Hex click and updates the instant a facing is chosen; a
  two-Unit Group placement keeps the first member's counter visible (read from
  `placingReinforcementDone`) while the second is still being placed, and both settle into real
  `Unit`s with no flicker/duplication once the Group ENTER commits.
- **Why the engine itself needed no changes for the geometry swap:** `engine/hex.ts`'s adjacency
  (`neighbor`/`distance`/`lineDraw`) and `movement.ts`'s wall-crossing (`wallBetween`) are pure
  axial-index arithmetic with **zero pixel/orientation dependency** — only `axialToPixel` (used
  solely for the arc-of-fire forward/flank dot-product test, itself orientation-invariant by
  construction) and the UI rendering layer needed to change. If you're ever tempted to "fix" a
  movement/facing/LOS bug by touching hex orientation math, it's almost certainly not an
  orientation problem.

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
  **all** of Special Units §16.1–16.7, audited and confirmed complete), M7 (Mortars + Smoke), and
  **M9 (Hills/Elevation §12)** are all done; real **Mission 1** ("Partisans") plays end-to-end with
  real reinforcements; conformance is at 0 violations. **M8 (Hidden Units) is deliberately deferred
  to online play** — see §8, it's a locked decision, not a gap. **M10 (Fortifications and Obstacles
  §17) is complete** (both Phases — Obstacles and Fortifications, incl. §17.11/17.12 destroying one by
  Attack), and **M11 (Flamethrowers + Pioneers §18) is complete** too. **The roadmap order was then
  deliberately swapped** (user decision): **M13 (online multiplayer) built ahead of M12 (Cards)** —
  see §8's M13 entry for full detail — because Cards need real per-client secret info (a hidden hand)
  that only online play can actually provide; M12/OBA remain the only unbuilt v3 combat module,
  now scheduled after M13. **§8 has the full detail on every milestone — read that, not this bullet,
  for specifics on how something works or why a decision was made.** Separately from the v3/M-numbered
  roadmap, **the board geometry itself was migrated pointy-top → flat-top — see §B**: the substrate
  is done, and **every mission/sandbox has been re-authored onto it** (Mission 1 with real terrain,
  reinforcements, CAPs, starting units directly with the user; the five non-canonical sandboxes via
  the `colRowToAxial` coordinate fix, all verified live incl. the hold-Shift LOS overlay) — it's all
  live, playable content now, not placeholders. §B also has live-tested gotchas (an entry-edge-hex
  trap, the Group-reinforcement-entry UI build, and the sandbox coordinate fixes) worth reading before
  touching reinforcements/entry-hex/mission-authoring code again.

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
  (M6), Mortars + Smoke (M7), Hills/Elevation (M9), Fortifications and Obstacles (M10 — Barbed Wire,
  Mines, Road Block, Trenches, Bunkers, Hasty Defenses), and Flamethrowers + Pioneers (M11) are all
  built; OBA and hidden units remain **later modules** (roadmap §8) — Hidden Units specifically
  deferred to online play, see §8.
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
  render.yaml               # ✅ M13 step 4 prep: one Render Blueprint (build+start commands, PORT
                             #   already read by server/index.ts) — deploying it still needs the user's
                             #   own Render account, see §8's M13 entry
  public/assets/            # original art + dice SFX
  server/                   # ✅ M13: Node online-play server (see §8's M13 entry) — separate from
                             #   the client-only `src/`, but shares its engine/protocol code directly
    index.ts                #   HTTP static-serve (dist/) + WebSocket relay, wires rooms.ts + engine
    staticServe.ts           #   serveStatic(distDir, url, res) — extracted from index.ts so it's
                             #   independently testable (distDir is a param, not a module constant)
    rooms.ts                #   pure RoomManager (create/join/reconnect/turn-gate) — unit-tested, no real sockets
    __tests__/               #   Vitest, included via tsconfig.json's/vite.config.ts's "server" entries
  src/
    main.tsx  App.tsx
    net/                    # ✅ M13: client↔server WebSocket layer (see §8's M13 entry)
      protocol.ts           #   ClientMsg/ServerMsg — same TS source imported by src/ AND server/
      client.ts             #   NetClient: thin ws wrapper, reconnect-with-backoff, no game logic
      session.ts            #   getSessionId() — opaque per-browser id in localStorage, for reconnect
    engine/                 # PURE rules engine (see §3)
      types.ts              # shared types (GameState, Unit, Hex, Action, GameEvent…)
      state.ts              # GameState shape, initGame(mission), (de)serialize
      rng.ts                # seeded RNG: roll2d6, rollD6, rollSpentDie, drawHit
      spent.ts              # Spent Die [1,1,2,3,3,4,5,5,6,7] + spentCheck(cost)
      stress.ts             # Stress state + "+1AP if acted last Turn"
      hex.ts                # axial math (flat-top, §B): neighbors, distance, direction, line, arc
      hexBoard.ts            # ✅ §B: column/row↔axial bridge, A01-S12 labels, board number, multi-board merge
      terrain.ts            # terrain table → AP cost, DR mod, blocksLOS, isCover
      los.ts                # LOS + arc of fire; visibleHexesFrom(hex); ✅ M9 elevation (§12.4-12.6)
      movement.ts           # move cost, facing, pivot, backwards, roads, walls, ✅ M9 elevation (§12.2)
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
      obstacles.ts          # ✅ M10 Phase 1/§17.7-17.10: rollMinesAttack, minesTargetsFor/OwnerSide, destroysBarbedWire
      fortifications.ts     # ✅ M10 Phase 2/§17.1-17.6,17.11-17.12: canOccupy, fortificationDrBonus, rollStructureDestroy
      cards.ts              # (deferred) Battle/Weapon cards §8; OBA (§13.4-13.9) waits on this too
      index.ts              # public engine API surface
      __tests__/            # Vitest
    data/                   # authored content (no logic)
      nations.ts terrainTypes.ts hitMarkers.ts units.ts hexArt.ts
      hexBoardMap.ts         # ✅ §B: generateOpenBoard/applyTerrainJson — engine/hexBoard.ts's generator → MapHexDef[]
      maps/mission1.ts   missions/mission1.ts   # Mission 1 "Partisans": re-authored on the new flat-top grid (§B) + setup/reinforcement waves
      missions/sandbox.ts   # non-canonical Armor Sandbox test mission (M6) — reuses MISSION1_MAP, already flat-top
      missions/fireSupportSandbox.ts  # non-canonical Fire Support Sandbox test mission (M7) — reuses MISSION1_MAP too
      missions/hillsSandbox.ts  # non-canonical Hills Sandbox test mission (M9) — own map, real hills; ✅ re-authored onto flat-top via colRowToAxial (§B)
      missions/obstaclesSandbox.ts  # non-canonical Obstacles Sandbox test mission (M10 Phase 1) — own map; ✅ same colRowToAxial fix
      missions/fortificationsSandbox.ts  # non-canonical Fortifications Sandbox test mission (M10 Phase 2) — own map; ✅ same colRowToAxial fix
      missions/hexBoardDemo.ts  # ✅ §B: proves the new flat-top/multi-board substrate — 2 boards, units on the seam
      missions/catalog.ts    # ✅ M13: id -> MissionDef lookup — the online server only ever receives a `missionId` string, never a client-supplied MissionDef
      cards/                # deferred to the cards milestone
      __tests__/
    state/  store.ts persistence.ts             # Zustand + localStorage saves; store.ts also owns M13's online dispatch fork (see §8's M13 entry)
    ui/     …  ReinforcementsPanel.tsx  MinesConfirm.tsx  …  # React + SVG (see §7)
  scripts/  play.ts conformance.ts              # terminal driver + v3 conformance audit
  public/hills-los-mockup.html  # ✅ kept in repo: interactive §12 LOS validator/reference (M9)
```

> **Current state:** engine/data/state/ui/scripts compile and pass under 3rd-ed (v3) rules
> (conformance 0 violations — see §0/§8 for the milestone status). Data is the real **Mission 1** on
> `maps/mission1.ts` + `missions/mission1.ts` (the 2nd-ed `firefights/`/`maps/partisans.ts` are
> deleted), plus the non-canonical `missions/sandbox.ts` (vehicles), `missions/fireSupportSandbox.ts`
> (mortars/smoke), `missions/hillsSandbox.ts` (elevation), `missions/obstaclesSandbox.ts`
> (Obstacles), `missions/fortificationsSandbox.ts` (Fortifications), and `missions/hexBoardDemo.ts`
> (§B's new flat-top/multi-board substrate) test missions. `rules/` is the committed source of truth.

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
    occupyingFortification?: boolean  // occupying (not just standing atop) a Trench/Bunker (17.2/17.3, M10 Phase 2)
    hastyDefense?: boolean            // per-Unit marker, not a Hex feature (17.6, M10 Phase 2)
  }>
  hexes: Record<HexId, {
    coord: { q: number; r: number }   // flat-top axial (§B); label "B05"/"A01" derived for display (1.0)
    terrain: TerrainId; elevation: number; label?: string
    boardNumber?: number              // §B: set only on a board's upper-left cell (large, not a coord)
    edgeCut?: { w?: true; e?: true; n?: true; s?: true }  // §B: which board-relative sides are a real exposed edge (half/quarter-hex clip); a merged multi-board seam has none
    walls: boolean[]; road: boolean
    features: {
      control?: SideId; smoke?: 1|2
      obstacle?: { kind: 'barbedWire'|'mines'|'roadBlock'; hitNumber?: number; destroyDr?: number; destroyed: boolean; ownerSide: SideId }  // 17.7-17.10, M10 Phase 1
      fortification?: { kind: 'trench'|'bunker'; facing?: 0|1|2|3|4|5; destroyDr?: number; destroyed: boolean }  // 17.1-17.6, M10 Phase 2
    }
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
| **Hills/elevation**: move cost (Sloping ±1AP, Steep ±2AP incl. vehicle Steep-impassable-off-road), elevation-aware LOS (Plateau Effect, Blind Spots), Elevation Combat Bonus | `movement.ts`, `los.ts`, `combat.ts` *(M9)* | 12.x | `rules/12` |
| Mortars: Direct/Indirect Attack, Spotter Hex, HE/Air Burst, Spotter Hex Elevation Bonus (M9); *(later)* OBA/drift (pending Cards, M12) | `combat.ts`, `mortar.ts` *(M7/M9)* | 13.0–13.3, 13.9 | `rules/13` |
| Smoke: DR/AR, LOS blocking, Rally bonus, dissipation | `smoke.ts`, `los.ts`, `turn.ts`, `rally.ts` *(M7)* | 14.x | `rules/14` |
| **Vehicles**: movement (wheeled/tracked, Bonus Moves), combat specifics, Transport/Towing; *(later)* Towing damaged Vehicles (§15.10) | `movement.ts`, `combat.ts`, `hits.ts`, `reducer.ts` *(M6)* | 15.x | `rules/15` |
| **Special units**: Turreted, Open-Topped, APC Transport Bonus, Trucks/Wagons, Field Guns, Mobile Vehicles (§16.4) | `combat.ts`, `movement.ts`, `reducer.ts`, `actions.ts`, `victory.ts` *(M6)* | 16.x | `rules/16` |
| **Obstacles + Fortifications** ✅: Barbed Wire (1d6 Move Cost, foot only, hidden from the pre-move popup until executed), Mines (fixed Hit Number attack on Move/Pivot/CC, owner-side CAP-modifiable, **always visible** — mirrors the M8 Hidden Units rationale), Road Block (impassable to Wheeled even on a Road) — impassable-to-Wheeled + no-Bonus-Move-in/out for all three (M10 Phase 1); Trenches (foot only, +2DR any direction, impassable to Wheeled), Bunkers (foot + Field Gun, facing/Arc-of-Fire locked on occupy, no Pivot, +5DR in-arc/+3DR flank, denies Mortar fire), Hasty Defenses (per-Unit, not a Hex feature, 5AP build/free removal, +1DR, stripped by that Unit's own Move/Pivot), and §17.11/17.12 destroying a Fortification/Obstacle (ranged Fire: automatic two rolls under one Spent Check; CC: an exclusive occupant-or-structure choice) (M10 Phase 2) | `movement.ts`, `combat.ts`, `mortar.ts`, `obstacles.ts`, `fortifications.ts`, `reducer.ts`, `state.ts` *(M10)* | 17.x | `rules/17` |
| **Flamethrowers + Pioneers** ✅: a `hasFlamethrower` Unit may choose the Flamethrower profile on a FIRE/CLOSE_COMBAT Attack instead of its normal Firepower — flat 3 red/3 blue FP, max Range 1 (ranged) or same-Hex (CC), always vs Flank DR, ignores ALL DR modifiers except Smoke (Terrain/Wall/Vehicle-Cover/APC/Elevation/Fortification/Hasty-Defense all zeroed); a `pioneer` Unit additionally ignores Mines Attacks entirely and caps its own Fire Smoke to Range 1 | `combat.ts`, `mortar.ts`, `reducer.ts`, `actions.ts` *(M11)* | 18.x | `rules/18` |
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
    **Flamethrowers + Pioneers (§18, M11):** `hasFlamethrower?` (Foot or Vehicle) lets a FIRE/
    CLOSE_COMBAT Action set `useFlamethrower: true` for a flat 3 red/3 blue FP, max Range 1 profile
    that always hits Flank DR and ignores every DR modifier but Smoke; `pioneer?` (Foot only) adds the
    §18.1 exceptions on top — immune to Mines Attacks, and its own `canFireSmoke` is capped to Range 1
    regardless of the Unit's normal (longer) Range. **Counter art (prototype):** `counterImage?: string`
    (a `public/assets/units/...` path) swaps a Unit's board/HoverPanel/Inspector counter from the plain
    nation-color+text rendering to the redesigned image-backed layout — see `UnitCounter.tsx` under
    "Requested UI features" below. Opt-in per template; omit the field to keep the old rendering.
  - **Add a card:** `{ id, type:'action'|'bonus'|'mission'|'artillery', cost:{green?,blue?}, effect }`
    in `data/cards/` (v3 Green/Blue cost, 8.5). Effects are engine actions/modifiers, not UI code.
  - **Add a mission:** new file in `data/missions/` with maps, placements (by hex label), starting
    CAPs per side, rounds, victory config, deck, hidden-unit slots. To build the map on the new §B
    flat-top substrate (real `A01`..`S12` labels, board number, correct multi-board merging), start
    from `data/hexBoardMap.ts`'s `generateOpenBoard(boards)` (open terrain everywhere) and override
    individual hexes' `terrain`/`walls`/`road`/etc. by `id` — see `data/missions/hexBoardDemo.ts`.
    Hand-authoring a bespoke irregular map (Mission 1's/the sandboxes' current approach) still works
    exactly as before; it just won't have `label`/`boardNumber`/`edgeCut` set.
- **Actions** are plain serializable objects (see `engine/types.ts`'s `Action` union for the exact
  shapes): `MOVE` (unitId, toHexId, optional vehicle `path`, `capCostReduce?`, `minesCapMods?`),
  `PIVOT` (`capCostReduce?`, `minesCapMods?`), `FIRE`/`CLOSE_COMBAT` (attackerId, targetId,
  `capDiceMod?`, `capCostReduce?`; `CLOSE_COMBAT` also `minesCapMods?`), `RALLY`, `STALL`, `PASS`;
  Group Actions `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY` (§10); Transport `LOAD`/`UNLOAD` (§15.7/
  §15.9); reinforcement `ENTER` (`{ placements: {unitId, hexId, facing?}[] }`, §4.12); Mortar
  `INDIRECT_FIRE` (attackerId, targetHexId, spotterHexId, §13.2) and `FIRE_SMOKE` (unitId, targetHexId,
  optional spotterHexId for Indirect, §14.1). `minesCapMods` (`Record<UnitId, number>`, §17.10) is
  resolved by the store's Mines CAP-choice dialog (`MinesConfirm.tsx`) *before* dispatch — the Mines'
  owning side may not be the acting side, so this can't reuse the normal `capDiceMod` pre-roll flow.
  Cards (`PLAY_CARD`) are deferred, not yet a real action type.
  **Removed in v3:** `ACTIVATE_UNIT`, `MARK_SPENT` (no activation/pool).
- **Tests:** colocate in `__tests__/`. **Reproduce the v3 red-box examples** from `rules/NN-*.md` as
  fixtures — they are worked rule implementations (Spent Checks, Stress, combat HN, rally, OBA drift,
  bunker DR, etc.) and make excellent oracles.
- **No engine→UI imports.** UI imports engine; never the reverse.

### Requested UI features (all implemented — keep them working)
*(presentation is edition-agnostic; only the readouts change: show **Fresh/Spent + Stress** and the
Spent-Check die instead of a remaining-AP pool)*
- **Real hex board** ✅ (`Board.tsx`/`hexgeo.ts`) — **flat-top** as of §B's migration (was pointy-top);
  the square ASCII grid in `play.ts` is debug-only. Board-edge half/quarter-hexes, coordinate labels
  (`A01`..`S12`), and the board-number cell are all real (§B) — a mission using
  `data/hexBoardMap.ts`'s generator gets them for free; hand-authored missions (Mission 1, the
  sandboxes) don't set `Hex.edgeCut`/`boardNumber` and so render as plain full hexes with no labels,
  same as before §B.
- **Mouse-wheel zoom, centered on the cursor** ✅ `Board.tsx` drives the `<svg>`'s own `viewBox`
  directly from `zoom`/`pan` state (default `zoom=1, pan={0,0}` = today's fixed viewBox exactly, a
  no-op for anyone who never scrolls) — no CSS transform needed. A real native `wheel` listener
  (attached once via a ref) computes the cursor's position in the *current* viewBox's user-space via
  `getScreenCTM().inverse()`, then solves for the new `pan` that keeps that exact point fixed under
  the cursor at the new zoom level; clamped to `[0.5, 4]×`. **A real bug caught and fixed before
  shipping:** the first version computed the new `pan` via `setPan(...)` called *from inside*
  `setZoom`'s functional-updater callback — impure (a `setState` call is a side effect), and
  `<StrictMode>` (`main.tsx`) deliberately double-invokes updater functions to catch exactly this,
  which visibly made the zoom drift off the cursor instead of staying put. Fixed by reading/writing a
  plain ref (`viewRef`, kept current every render) instead of nested updater functions — `setZoom`/
  `setPan` are now called with already-computed plain values, never a function with a side effect
  inside it. Verified via `getScreenCTM()`-based round-trip checks (dispatch a wheel event, re-measure
  the same screen point in SVG-space, confirm it hasn't moved) at both zoom-in and zoom-out, plus
  confirmed the `[0.5, 4]×` clamp holds under repeated ticks (must be dispatched with a settle/RAF
  between each in tests — firing several synchronously in one JS turn without waiting starves the
  ref of updates between them and under-counts, a test-methodology gotcha, not a real one: actual
  browser wheel events always arrive as separate tasks).
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
- **Turn flash** ✅ `TurnFlash.tsx` — large text ("{Nation}'s Turn") flashed over the board and faded
  out over 4s via a CSS `@keyframes` animation (fade in → hold → fade out), firing the instant
  `currentSide` flips (including once on mount, for the Mission's starting side). **First shipped as
  a persistent banner** (`TurnHeader.tsx`, a colored bar permanently above the board) **— replaced on
  user request** for this large-fade-over-the-map version instead; `TurnHeader.tsx`/`.board-wrap`/
  `.turn-header*` CSS were deleted outright, not kept alongside. `position: absolute; inset: 0;`
  within `.center` (already `position: relative`) so it overlays just the board area, not the
  sidebars; `pointer-events: none` so it never blocks play while fading. Never a bare Side letter
  (same convention as `VictoryScreen.tsx`); handles a plural nation name already ending in "s"
  ("Germans", "Soviets") with a bare apostrophe ("Germans' Turn") rather than a double-s
  ("Germans's Turn"). Remounts via `key={cs}` on the animated element specifically so two Turn
  switches in quick succession (e.g. two passes back-to-back) each restart the fade from scratch —
  a plain visibility boolean toggling true→true across a rapid double-switch wouldn't force React to
  remount the DOM node, so the CSS animation wouldn't restart. **Verification note:** a live 4-second
  fade is hard to catch with a single `preview_screenshot` call (tool round-trip latency alone can
  exceed the window) — verified instead with one atomic `preview_eval` script that clicks and then
  polls `getComputedStyle(...).opacity` at several timestamps *within the same call*, showing the
  expected 0 → 1 → 1 → 0 → (unmounted) progression precisely; don't trust a screenshot's absence of
  the flash as evidence of a bug without confirming via timestamped opacity polling first.
  **A real bug shipped and caught live on the real deploy, since fixed:** the text didn't fade in
  place — it appeared somewhere off from the board's own center and stayed until the next Turn
  switch (only *looked* like "doesn't fade," since the unmount timer was actually firing correctly
  the whole time; the symptom was purely positional). Root cause: `.turn-flash`'s `position: absolute;
  inset: 0;` was scoped to `.center`, not to the board itself — `.center` is a flex ROW with
  `align-items: flex-start` and no explicit height, so it can be (and on a tall viewport, was)
  noticeably TALLER than `<Board/>`'s own rendered box (the SVG's `max-height` cap leaves empty space
  below it that `.center` still occupies). Centering the flash text within `.center`'s full height
  landed it well below the board's own visual center, by an amount that depends on viewport size —
  invisible on some window sizes, glaringly wrong on others, which is exactly the "why does this only
  break sometimes" fingerprint of a size-mismatch bug. Fixed with a new `.board-frame` (`position:
  relative`, no explicit height — shrink-wraps to the SVG's own intrinsic height) wrapping *just*
  `<Board/>` and `<TurnFlash/>` in `App.tsx`, so `inset: 0` now sizes to the board's own box
  precisely, verified by comparing `getBoundingClientRect()` of `.board-frame`/`.turn-flash` against
  `.board` directly (now identical) rather than trusting a screenshot. **Lesson: this bug was
  completely invisible in the local dev-server preview at the window size already in use for earlier
  testing, and only surfaced on the actual deployed build at the user's own (different) window size —
  when a UI bug report doesn't reproduce in the same tool/window session that shipped the feature,
  actually reproduce it in a fresh production build (`npm run build && npm start`, not the Vite dev
  server) rather than assuming the report is stale/cached; a `position: absolute` element's sizing
  bugs are inherently viewport/container-size-dependent and can pass every check at one window size
  while being obviously wrong at another.** **Follow-up, user preference:** repositioned from
  vertically centered on the board to pinned at the board's top edge (`align-items: flex-start` +
  `padding-top`, was `align-items: center`) — doesn't sit on top of units/terrain mid-board this way.
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
- **Move-cost hover popup** ✅ (M9) hovering a legal Move-target hex with a unit selected shows a
  green-bordered popup itemizing every AP modifier (`movement.ts`'s `MoveCostResult.mods: Modifier[]`
  — base Move, terrain, Backwards, Wall Crossing, Sloping/Steep Terrain, only pushed when non-zero),
  not just the total — mirrors the fire-odds popup's positioning/pattern but grows **upward** from the
  cursor so the two never overlap when a hex is both a move target and shows fire-odds. `Modifier` now
  lives in `engine/types.ts` (moved out of `combat.ts`, which re-exported it) since `movement.ts`,
  `combat.ts`, and `mortar.ts` all need the identical shape. **(M10)** `Modifier` gained a `random?`
  flag: Barbed Wire's §17.8 1d6 is deterministic from the seeded RNG (so the engine already knows the
  real number), but the popup deliberately renders it as `?` and folds it out of the displayed total
  (`Move to X — N AP + ?`) rather than spoiling the roll — the same "hide it until executed" principle
  as the dice-roller. The real value IS logged once the move commits (`reducer.ts`'s `doMove`: "incl.
  +NAP, Barbed Wire (§17.8)").
- **Illegal-move popup** ✅ (M10) hovering an *adjacent* Hex the selected Unit cannot enter shows a
  red-bordered popup with `moveCost`'s own `reason` string (`Board.tsx`'s `moveIllegalPopup`) — every
  `reason` in `movement.ts` now cites its rulebook section (e.g. "impassable due to Barbed Wire
  (§17.8)", "impassable due to Road Block (§17.9)", "Steep terrain impassable to vehicles (§15.3,
  §12.2)") instead of a bare phrase.
- **Pivot picker (P key)** ✅ pressing **P** with a unit selected highlights its six neighbor Hexes
  blue (reusing the same on-board highlight/label as the free facing-choice picker, `Board.tsx`'s
  `facingHighlightUnit`) — clicking one issues a real **PIVOT** Action (§4.6, AP-costed, runs the
  normal Spent Check/CAP-confirm via `pivot()`), unlike the free correction. Store: `pivotPicker:
  boolean` + `togglePivotPicker()`; `store.ts`'s `hexClick` branches on it before the normal click
  logic, mirroring the existing `pendingFacingChoices` branch but calling `pivot()` instead of
  `chooseFacing()`.
- **Mines CAP-choice dialog** ✅ (M10 Phase 1) a MOVE/PIVOT/CLOSE_COMBAT about to trigger a live Mines
  Hex (§17.10) pauses before dispatch — `store.ts`'s `maybeMinesGate` previews targets via
  `minesTargetsFor`/`minesOwnerSide`, then `MinesConfirm.tsx` shows one row per attacked Unit with a
  ±CAP stepper (clamped to ±2 **and** to the owner's remaining CAP, shared across every row in the
  dialog) before the roll — CAPs are never spent silently (see memory `conflict-of-heroes-cap-confirm`).
  The dialog names the owning side's **nation** (e.g. "Soviets"), not the bare side letter. Confirming
  bakes the chosen mods into `minesCapMods` and dispatches the real action; the reducer still clamps
  defensively (CLAUDE.md §3: legality lives in the engine, never trust the UI alone).
- **Fortifications UI** ✅ (M10 Phase 2) `ActionChooser.tsx` gains two more rows when they're genuine
  choices: "🛡 Move & occupy {Trench/Bunker}" alongside a plain "Move here" (occupying is never
  automatic, §17.2/17.3), and "⚔ Close combat the {Fortification/Obstacle}" alongside attacking its
  occupant (§17.12's exclusive either/or). Ranged Fire's §17.11 two-roll destroy needs **no new
  DiceRoller UI** — `store.ts`'s `requestFireRoll` just appends one more `RollStep` (built from
  `rollStructureDestroy`, threaded off the post-occupant-roll RNG) to the same multi-step "Next
  target ▸ / Continue" flow already used for stacked fire (§6.9). `Inspector.tsx` gets a Rally-style
  self-targeted "Build Hasty Defense (5AP)" / "Remove Hasty Defense (free)" button pair;
  `HoverPanel.tsx` and `Board.tsx` show Fortification info/labels the same way Obstacles already do.
  `UnitCounter.tsx` badges: "HD" (Hasty Defense) and, for occupancy, **"TRENCH"/"BUNK"** — kind-
  specific, not a generic "FORT" (looked up live from `game.hexes[unit.hexId].features.fortification`,
  so it's always in sync). No new `MinesConfirm`-style dialog — the structure roll's CAP dice-mod is
  the attacker's own, already gated through the ordinary single-attacker CAP-confirm flow.
  **Follow-up fixes from user testing:** (1) `Board.tsx`'s move-cost hover popup didn't fire for the
  same-hex occupy-from-within case at all — `moveCost()` returns null ("not adjacent") for
  `toHexId === unit.hexId`, so the popup silently bailed; it now special-cases that hex (reading the
  AP cost from `legalActionsForUnit`'s own occupy entry instead) and shows "Occupy Trench/Bunker
  (§17.3) — N AP". (2) A Bunker's Arc of Fire is now drawn directly on the board — the 3 frontal
  hexsides (facing ±1) highlighted in cyan on every live Bunker Hex, unconditionally (not hover-gated),
  using the same `EDGE_CORNERS`/`hexCorners` approach `Board.tsx` already uses for Walls.
- **Stress in AP popups** ✅ two small pre-existing gaps, not Fortification-specific but caught while
  testing them: `Board.tsx`'s move-cost hover popup and `ActionChooser.tsx`'s "Move here (N AP)"
  button both computed their AP total straight from `moveCost()`, which only knows the Move's own
  terrain/backwards/wall/elevation component — Stress's +1AP (§2.6) is folded in later by the
  reducer's `planCost`, so a Stressed Unit's displayed cost silently under-reported by 1AP. Both now
  add an explicit `{ label: 'Stress', value: 1, section: '§2.6' }` line (Board's popup) or just the
  extra +1 (ActionChooser's compact button label) when `unit.stressed`.
- **Hopeless-shot block + CAP dice-mod stepper** ✅ two related general-combat fixes (not
  Fortification-specific, but surfaced by a Fortification live-test — an MMG had a 0% chance to hit a
  Panzer). `ui/odds.ts`'s new `isHopelessShot(hitNumber)` — true only if `hitNumber − 2 > 12`, i.e.
  unhittable even at the max §3.2 CAP dice mod (a **UI-only** convenience gate, not a rules change —
  the reducer still accepts the Action if dispatched directly). Wired into `Board.tsx`'s hover-odds
  popup (shows "Cannot hit — even with CAP (§3.2)" instead of "0% to hit"), `store.ts`'s `hexClick`
  (`canFire`/`canCC` no longer true for a hopeless target — click falls through to deselect instead of
  opening the dice roller), `ActionChooser.tsx` (same), and `Inspector.tsx` (filters hopeless targets
  out of the Fire/Close-Combat button lists). Separately: **there was no UI at all to set a CAP dice
  mod for FIRE/CLOSE_COMBAT/RALLY/INDIRECT_FIRE/GROUP_ATTACK** before this — `capDiceMod` existed on
  the `Action` types and the reducer honored it, but nothing in the UI ever set it to anything but 0.
  Fixed by parameterizing `store.ts`'s `request*Roll` builders to accept `capDiceMod` (rebuildable),
  adding `PendingRoll.capDiceMod`/`capDiceModMax` (max = min(2, remaining CAP after the Action's own
  `capCostReduce`)) and a new `adjustPendingCapMod(delta)` store action, and a +/− stepper in
  `DiceRoller.tsx` (reusing `MinesConfirm.tsx`'s `.confirm__mines-row`/`.confirm__mines-stepper`
  styling) shown only before the first die of the sequence is rolled (the mod applies uniformly to
  every step, so it locks once rolling starts).
- **Flamethrower attack UI** ✅ (M11) `Inspector.tsx`'s Fire/Close-Combat target lists show a
  🔥-prefixed row alongside the normal one whenever `legalActionsForUnit` offers both for the same
  target (a `hasFlamethrower` Unit within Range 1) — each row computes its own `attackContext`/
  `closeCombatContext(..., useFlamethrower)` so the displayed AR/DR is never the wrong profile.
  `store.ts`'s `fire`/`closeCombat` gained a `useFlamethrower?` param threaded straight into the
  dispatched Action. Board-click (`hexClick`/`ActionChooser.tsx`) deliberately stays normal-Fire-only
  for now — Flamethrower attacks go through Inspector.tsx, a follow-up could add it to the board click
  path too.
- **Image-backed unit counters** ✅ (`UnitCounter.tsx`, opt-in via `counterImage`, see above) — a Unit
  whose template sets `counterImage` renders a redesigned counter face instead of the plain nation-
  color+text one: the art fills the whole counter (clipped to its rounded corners), a green trapezoid
  banner (widest — 65% — at the very top edge, narrowing going down) holds the Unit's name, Attack Cost
  (black) sits top-left and Move Cost top-right (colored by kind — red foot/gun/mg/mortar, green
  Wheeled vehicle, blue Tracked — extending §15.1's existing wheeled/tracked Move Cost color to foot
  units too, a prototype convention not yet a real rule), red-over-blue Firepower stacks bottom-left,
  a black hex badge holds Range bottom-center, and flank-over-front Defense (colored by DR type) stacks
  bottom-right — all at the numbers' existing size (`fs = size × 0.27`, same as the old rendering, so
  it matches actual board scale). Hit-marker/Hasty-Defense/Fortification-occupying badges float just
  above/below the counter (the corners are otherwise fully packed in this layout) — **do not forget
  these when touching the `counterImage` branch**; they were dropped once already when the layout was
  first built and only caught later because a real Suppressed marker didn't show. `ignoreFacing?` prop
  (default false) skips the facing-rotation transform — used by HoverPanel/Inspector's upright preview
  copies, not the board. **`useId()`, not `unit.id`, drives the `<clipPath>` id** — the same Unit can
  be mounted twice at once (board + HoverPanel/Inspector simultaneously); a shared id makes `url(#...)`
  resolve to whichever `<clipPath>` came first in the DOM, silently clipping the *other* copy's
  `<image>` against the wrong (e.g. board-scale) rect and hiding it entirely. Real art currently lives
  at `public/assets/units/` for `sov-rifle` and a couple of German units — most templates still render
  old-style. **Spent dimming never washes out Selected/Stressed** (per user request): a Spent Unit's
  body dims to 55% opacity (nation-color fill / counter image / stat text / the diagonal spent-line),
  but the selection ring (`stroke="#ffd24a"`, or cyan for Group) and the Stress Marker's dashed amber
  ring are siblings of the dimmed `<g opacity={spent?0.55:1}>`, not children of it — SVG group opacity
  is a post-composite alpha multiply with no per-child override, so the only way to keep one visual
  element at full strength while a sibling dims is to lift it entirely out of the dimmed group (an
  element-level `opacity`/`fillOpacity` prop on the ring itself would NOT help if it stayed nested
  inside the dimmed ancestor). The plain (non-`counterImage`) counter's base `<rect>` combines a
  dimmable fill (nation color) with a never-dimmed stroke (the same selection ring) on one element —
  split via `fillOpacity` (not `opacity`, which is not attribute-splittable) rather than two rects.
- **HoverPanel / Inspector counter previews** ✅ both panels render the hovered/selected Unit through
  `UnitCounter` too (not a separate mini-renderer), always with `ignoreFacing` (an inspector view reads
  better upright than rotated to the Unit's actual facing). HoverPanel: full board scale per Unit
  (`HEX_SIZE`), stacked hexes chunked into rows of (at most) 3 via a small `chunk()` helper — a 5-Unit
  stack is a row of 3 + a row of 2, not one long unreadable row or an uneven auto-wrap; each cell's
  `flex-basis` is the literal per-Unit size with `flex-wrap: nowrap`, so 1–2 Units show at full size and
  flexbox's own shrink math only kicks in once a 3rd would actually overflow the row — a static
  `min(size, 1/3 row)` formula was tried first and was wrong (it capped every cell at 1/3 width
  regardless of how many Units were actually present). Headings renamed **"Terrain in Hex"** (was
  "Under cursor") and **"Units in Hex:"** (was "Units here:", now bold/`1rem` to match the heading).
  **Inspector — EXPERIMENTAL, easy to roll back (not a locked design):** the old Side/Status/Hex-
  facing/Firepower/Defense/Move·Range/Fire-cost·VP `stats-grid` text block is gone, replaced by a 3×
  board-scale counter below the Unit's name with small text labels beside the counter instead of on
  it — "Attack"/"Move" beside the top corners, "Red FP"/"Blue FP" and "Flank"/"Front" beside the bottom
  stacks, "Range" centered just under the bottom edge. Trade-off: Side/Status(fresh-spent-stressed)/
  Hex-facing/VP have no equivalent on the counter face and aren't shown anywhere in this layout anymore.
  Label vertical position is **fraction-of-the-full-SVG-box**, not fraction-of-the-counter-face — the
  label column stretches to match the counter div's rendered height (the box, which includes the
  padding reserved above/below for the floating badges above), so a face-relative fraction alone put
  every label noticeably higher than the number it's meant to sit beside (a real bug, caught by the
  user's own annotated screenshot of where the labels should point). Horizontal inset is negative
  (labels overlap *into* the counter by the same `pad` UnitCounter.tsx indents each number from the
  edge), so a label lands right at its number rather than stopping at the image border. The "After
  acting, a Spent Check decides if {id} stays Fresh..." paragraph was removed per user request — if
  you're tempted to assert on it or on the bare unit-id string in a test, don't: neither is rendered
  anywhere in the Inspector header any more (see `render.test.tsx`'s fix for this exact trap).
- **Rally-blocked explanation** ✅ `Inspector.tsx`'s hit-note now says *why* a Hit Unit can't Rally when
  it can't: "sharing a Hex with an enemy (§7.9)" or "this marker has no Rally Number" — `rallyable`
  already encoded both conditions, this just surfaces the reason instead of silently omitting the
  button.
- **Auto-select the incoming side's Stressed Unit** ✅ `store.ts`'s `dispatch()` — whenever an Action
  changes `currentSide` (i.e. the turn just passed), if the new side has a Stressed Unit (§2.6: at most
  one per side, a Marker that moves, not a persistent per-unit flag) it's auto-selected, replacing
  whatever the *outgoing* side had selected. Falls in priority just below the existing
  `pendingFacingChoices` auto-select (§4.5/§15.11) — that one belongs to the *outgoing* side's
  just-moved Unit and should win if both apply in the same dispatch.

---

## 8. Milestone roadmap

- **M0 — Scaffold** ✅ Vite+React+TS, Vitest; `hex.ts`, `types.ts`, `rng.ts`.
- **M1 — Engine core (infantry, 2nd ed)** ✅ terrain, movement/facing, LOS/arc, combat, hits, rally,
  range, CAP, turn/round, victory, `reduce`, `initGame`, `legalActions`.
- **M2 — Mission 1 content** ✅ real **Map 1** (206 hexes, authored from the Mission Book) +
  "Partisans" (`missions/mission1.ts`: 5 rounds, German Round-1 initiative, Soviets +1
  VP, victory hex = 1 VP/round + 1 VP/kill, no cards — a Section-1 teaching Mission). Historical
  description of the original (pointy-top) authoring — **superseded by the §B re-author**: current
  facts (6/7 CAP, real terrain/hex labels) live in §B, not here. **M2.5 —
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
  the Mortar's own Hex (Spotter Elevation Bonus was 0 pending Hills — now wired, see M9 below).
  `smoke.ts` — Heavy/
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
- **Group Move — individual per-member destinations (§10.2/§10.3)** ✅ closes a real UI gap: the only
  Group Move UI was the six formation-shift arrows (`groupMove(dir)`) — every member steps one hex in
  the SAME shared direction, or stays. §10.2 actually says "Each individual Unit may move into any Hex
  adjacent to it... or not move," and §10.3 explicitly allows members to **split apart** during the
  move (they only need to *begin* continuously adjacent) — the underlying `GROUP_MOVE` Action already
  supported arbitrary per-member `{unitId; toHexId?}[]`, the UI just never exposed a way to assign
  different members different destinations. Caught live: two stacked Units, user wanted to send them
  to two different adjacent Hexes, and the arrows-only UI couldn't express that. Fixed with a new
  per-member destination queue in `store.ts` (`groupMoveQueue`/`groupMoveDone`,
  `startGroupMoveIndividually`/`cancelGroupMoveIndividually` — same shape as the earlier
  Group-reinforcement-entry queue): a new `hexClick` branch walks the queue — click the active
  member's own Hex to leave it in place (§10.2's explicit third option), or one of its green-
  highlighted legal destinations to assign it; queue empty → dispatches one `GROUP_MOVE` via a new
  `submitGroupMove` helper (factored out of `groupMove(dir)`, which now calls it too — both share the
  same §10.4 cost calc + `groupCapGate`). `Board.tsx` reuses the EXISTING `moveTargets` green
  highlight for the active member's destinations (no new color/style) and generalized the floating
  "Choose facing"/"Pivot (P)" label banner a 4th time — but without its usual blue neighbor overlay
  for this case, since the green `moveTargets` highlight already covers those same Hexes. `GroupPanel`
  gained a "Move individually (choose each member's Hex, §10.3)" button alongside the arrows. This
  fix is 100% client-side — the server (`server/rooms.ts`) just relays whatever `GROUP_MOVE` the
  client built, so it needed no changes at all. Verified live: two stacked reinforcement Units,
  Group-selected, sent to two genuinely different Hexes, resolved as one Group Action with one Spent
  Check, stack correctly split, free facing-correction window opened correctly afterward too.
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
- **M9 — Hills and Elevation (§12)** ✅ `movement.ts` — Elevation Move Cost Penalty (Sloping 1-level
  ±1AP ascending only, Steep 2-level ±2AP both directions; fixed a bug where Steep-descending
  silently cost 0 instead of 2), applies to foot/guns/vehicles alike (incl. Bonus-Move steps); Steep
  is impassable to vehicles **off-road**, but a Road lets a vehicle cross it (still paying the AP)
  per §15.4's "roads negate Impassable Terrain." `los.ts` — elevation-aware `hasLOS`: a hex's
  obstruction level is its own Elevation +1 if it's also LOS-blocking terrain; ties block only if
  **strictly** exceeding the higher endpoint's level, **except** a genuine 3-way tie (both endpoints
  and the intervening hex all equal) never blocks, uniformly at L0, L1, *or* L2 — **no L0 special
  case** (an earlier draft wrongly special-cased L0 alone; caught via user testing, see memory
  `conflict-of-heroes-m9-los-elevation`); plus §12.6 Blind Spots (an LOS-blocking hex creates an
  unseeable hex directly behind it from the High Ground Hex's side, even when the plain level test
  would otherwise allow seeing past it). Validated interactively before coding in
  `public/hills-los-mockup.html` (kept in the repo as a design/regression reference — update it if
  this algorithm ever changes). `combat.ts` — Elevation Combat Bonus (§12.3): +1AR attacker higher,
  +1DR target higher (no effect on Close Combat, same hex ⇒ always level); exported
  `elevationCombatMods` reused by `mortar.ts`'s Indirect Fire with the **Spotter Hex**'s elevation,
  not the Mortar's own (§13.3). `scripts/conformance.ts`'s independent oracle synced with the same
  formulas. New non-canonical `Hills Sandbox` (`data/missions/hillsSandbox.ts`) — its own small
  8×5 map (Mission 1 has no hills), with a Steep cliff, a Sloping ridge on a Road, a Blind Spot
  showcase row, and a same-level L1 "mesa" row. UI: hill glyphs (▲/▲▲) on the board, an Elevation row
  in the hover panel, a full-sized hex-art picture next to it, and the move-cost/pivot-picker features
  listed in §7 above (built alongside this milestone, not elevation-specific themselves).
- **M10 Phase 1 — Obstacles (§17.7-§17.10)** ✅ Locked decisions (memory `conflict-of-heroes-m10-scope`):
  **Mines are never hidden** — same rationale as the M8 Hidden Units deferral (a hotseat render-layer
  hide of shared `GameState` is trivially defeated); the user's first instinct was to try that
  approximation anyway, then reconsidered once shown it's the exact anti-pattern CLAUDE.md already
  warns against. Data model: `Hex.features.obstacle?: { kind: 'barbedWire'|'mines'|'roadBlock';
  hitNumber?; destroyDr?; destroyed; ownerSide }` (authored via a new `MapHexDef.obstacle` field,
  `state.ts`'s `buildHex`); `ownerSide` exists specifically because Mines' CAP modification (§17.10)
  is paid by whoever *placed* the mines, not necessarily the side whose Unit triggers them.
  `movement.ts`: Barbed Wire adds a real 1d6 (via `rollD6(state.rng)`, threaded through a new
  `MoveCostResult.rng` field so `moveCost` stays the single source of truth for both preview and
  commit — same "compute once, commit only from the reducer's own call" pattern as `combat.ts`'s
  `rollStackFire`); Barbed Wire and Road Block are impassable to Wheeled vehicles **unconditionally**
  (§15.4's "roads negate Impassable Terrain" does NOT apply — that would defeat the point of a Road
  Block); all three Obstacle kinds forbid vehicle Bonus Moves into or out of them. New `obstacles.ts`:
  `rollMinesAttack` (a fixed Hit Number, no AR/DR, CAP-modifiable like any other roll, hits Soft/
  Armored alike), `minesTargetsFor`/`minesOwnerSide` (pure preview helpers reused by both the store's
  pre-dispatch dialog and the reducer's real resolution), `destroysBarbedWire`. `reducer.ts`: Mines
  trigger is a side-effect appended inside `doMove`/`doPivot`/`doCloseCombat` (arriving Unit + any
  Transported passenger; the Pivoting Unit; the CC-initiating attacker only — **not** the CC
  defender, per §17.10's explicit exclusion), resolved *before* the acting Unit's own Spent Check,
  matching the rulebook's own worked-example ordering; a Tracked vehicle destroys Barbed Wire on
  entry. New store flow (`maybeMinesGate` in `store.ts`, `MinesConfirm.tsx`) since the Mines' CAP
  choice belongs to the owning side, not necessarily the acting side, so it can't reuse the existing
  `capDiceMod` pre-roll pattern — see §7 above. New non-canonical `Obstacles Sandbox`
  (`data/missions/obstaclesSandbox.ts`) with all three kinds live-testable. §17.11 (destroying an
  Obstacle/Fortification by ranged Attack/CC — a real combat-resolution wrinkle: two rolls, one Spent
  Check) is deliberately deferred to Phase 2, since it's shared machinery with Fortifications.
- **M10 Phase 2 — Fortifications (§17.1-§17.6, §17.11-§17.12)** ✅ Locked decisions: **occupancy is a
  per-unit flag**, `Unit.occupyingFortification?: boolean`, not a hex-side occupant list — symmetric with the
  existing `carriedBy`/`hastyDefense` pattern, no array bookkeeping in `destroyUnit`. **Hasty Defense
  is per-Unit** (`Unit.hastyDefense?`), not a Hex feature — §17.6 places the marker "on top of the
  Unit," and multiple Units in one Hex can each hold their own independently; Trenches/Bunkers ARE Hex
  features (`Hex.features.fortification`), like Obstacles. A **transported Unit cannot build a Hasty
  Defense in the first place** (`doHastyDefense` denies on `unit.carriedBy`), which makes "does a
  carrier's Move strip a passenger's Hasty Defense" moot — `doLoad` also clears the flag defensively,
  for the edge case of building one then being Loaded. **§17.11's two-roll flow needs no new `Action`
  field** — `doFire` just re-derives the structure roll from `state.rng` itself after the occupant
  roll(s) (same pattern as `rollStackFire`/`rollMinesAttack`), keeping "the reducer is the sole RNG
  authority" (§3) intact rather than trusting a client-supplied roll result. **While occupying a
  Bunker, PIVOT is not offered as a legal action at all** (locked facing, confirmed interpretation —
  no no-op-pivot allowed); occupying a Bunker also **forces the occupant's facing to the Bunker's**
  (missed on the first pass, caught by a live click-through test — an occupant's DR/arc math all reads
  `unit.facing` directly, so without this the Bunker's whole facing-lock premise would silently not
  hold). New `fortifications.ts`: `canOccupy` (Trench: Foot only, §17.4; Bunker: Foot + Field Gun,
  §17.5 — never a Vehicle), `fortificationDrBonus` (Trench flat +2 any direction; Bunker +5 if the
  attacker is in the occupant's own front arc — reuses the existing `attackerInTargetFront` concept,
  no new arc math — else +3 Flank), `hastyDefenseDrBonus` (+1 any direction), `withinBunkerArc`/
  `deniedByBunkerMortarRule`, `destructibleFeatureAt`/`destroyFeatureAt` (checks *either*
  `features.fortification` or `features.obstacle` for a live `destroyDr` — only one can be on a Hex,
  §17.0 — reused by both this Phase and a future destructible Obstacle), `rollStructureDestroy` (flat
  `destroyDr − ar`, no terrain/smoke DR, no critical tier, no hit-marker pile — mirrors
  `rollMinesAttack`'s "owns its own roll" shape), `closeCombatStructureAr` (§17.12: the AR half of
  `closeCombatContext` with none of its DR half — a structure gets no Terrain modifiers in CC).
  `movement.ts`: Trench is impassable to Wheeled + blocks Tracked Bonus Move in/out, same as Barbed
  Wire; **Bunker gets neither restriction** (§17.5 explicitly lets wheeled Field Guns occupy one).
  `combat.ts`/`mortar.ts`: Fortification/Hasty-Defense DR bonuses folded into `attackContext`,
  `closeCombatContext`, and `rollIndirectFire`'s `drMods`; a Bunker occupant's Arc-of-Fire override
  denies firing outside it **unconditionally** (placed before the Turreted-exception check, so a
  Bunker's lock overrides Turreted too); Mortars are denied firing (Direct or Indirect) from within a
  Bunker in `attackContext`/`directFireZone`/`indirectFireZone` alike. `reducer.ts`: `doMove` gained a
  same-Hex branch (`toHexId === unit.hexId`) for occupying a Fortification "from within" per §17.3's
  2nd paragraph (a real Move Action, base `eff.move` AP, no terrain — there's no hex transition);
  `doCloseCombat` gained `targetKind: 'structure'` (an alternate, mutually-exclusive CC target,
  §17.12); new `doHastyDefense`/`doRemoveHastyDefense` handlers. UI (`store.ts`/`ActionChooser.tsx`/
  `Board.tsx`/`HoverPanel.tsx`/`Inspector.tsx`/`UnitCounter.tsx`) — see §7 above for the full detail.
  New non-canonical `Fortifications Sandbox` (`data/missions/fortificationsSandbox.ts`) — a Trench, a
  fixed-facing destructible Bunker (`destroyDr: 16`, matching the rulebook's own worked example), and
  open ground for the Hasty Defense demo; every mechanic above was click-through-verified live in this
  mission (occupy-from-within, Bunker facing-lock + no-Pivot + arc-restricted DR, the §17.11 two-roll
  Fire sequence under one Spent Check) with zero console errors.
- **M11 — Flamethrowers + Pioneers (§18.0-§18.1)** ✅ `UnitTemplate` gained `hasFlamethrower?` (Foot or
  Vehicle Unit with a Flamethrower symbol; may choose it on an Attack instead of normal Firepower) and
  `pioneer?` (a Foot Unit's extra §18.1 exceptions — distinct fields, since a Flame Tank has the
  former without the latter). `FIRE`/`CLOSE_COMBAT` gained `useFlamethrower?: boolean` — a per-Action
  choice, not a per-Unit mode, since the same Unit can still Fire normally too. `combat.ts`'s
  `attackContext`/`closeCombatContext` (+ `rollAttack`/`rollCloseCombat`/`rollStackFire`) branch on it:
  flat 3 red/3 blue FP (superseding the Unit's own FP and any white-box CC penalty), Max Range a fixed
  1 Hex overriding the Unit's own Range stat entirely, always vs Flank DR (reusing the same
  `!isHE`-style trick that already forces Mortars to flank), and — the one genuinely new piece of
  math — **every DR modifier except Smoke is zeroed** (Terrain, Wall, Vehicle Cover, APC Transport,
  Elevation, Fortification, Hasty Defense all skipped; the AR-side bonuses — range, Group Support,
  Elevation, smoke-attack-penalty — are unaffected, since the rule's "ignore ALL DR Modifiers" is
  about the DEFENSE side only). The existing `openTopped` field's doc comment had already anticipated
  this ("vs HE/**Flamethrower**/red-FP CC") — the Open-Topped flip condition just needed extending
  from `isHE` to `isHE || useFlamethrower`, already half-designed before this milestone existed.
  `actions.ts` enumerates the Flamethrower FIRE/CLOSE_COMBAT variant as a genuinely separate legal
  action alongside the normal one (its own `attackContext`/`closeCombatContext(..., true)` legality
  check — max Range 1 makes it illegal far more often than the Unit's normal Attack). §18.1 Pioneer
  exceptions: `reducer.ts`'s `resolveMines` now excludes Pioneer Units from the target list entirely
  (not just favorable odds — no Attack at all, since Pioneers "may enter a Mines Hex without
  triggering a Mines Attack"); `mortar.ts`'s `directFireZone` gained an optional `maxRange` param so
  `actions.ts`/`doFireSmoke` can cap a Pioneer's own Fire Smoke to Range 1 without touching its normal
  (longer) Fire range. UI: `Inspector.tsx`'s Fire/CC target lists show a distinct 🔥-prefixed row per
  target when `legalActionsForUnit` offers both variants (own React key needed —
  `${targetId}-${useFlamethrower ? 'ft' : 'n'}` — since the same target can now appear twice).
  **Bug caught by live testing, now fixed:** `store.ts`'s `requestFireRoll`/`requestCcRoll` (the
  dice-roller preview builders) initially ignored `action.useFlamethrower` entirely — a live
  click-through showed the dice roller displaying the UNIT's normal AR/DR instead of the Flamethrower's,
  even though the reducer's own `doFire`/`doCloseCombat` had it right — the preview and the commit had
  silently diverged. Both now read `action.useFlamethrower` and thread it into `attackContext`/
  `rollStackFire`/`closeCombatContext`/`rollCloseCombat`, matching the reducer exactly. New
  `flamethrower.test.ts` reproduces the rulebook's own worked example (German Pioneers' Flamethrower
  vs a Soviet Infantry Gun in a Stone Building: 6AR, 10DR flank — Stone Building's Terrain DM
  correctly ignored — Hit Number 4). `Fortifications Sandbox` gained a German `ger-pioneer` and a
  Soviet `sov-t34a` (both pre-existing templates, stats unchanged) as a live Flamethrower-vs-Armor
  test bed.

- **M13 — Online Multiplayer, steps 1-3 done (roadmap deliberately reordered ahead of M12/Cards —
  see §0/the plan at `.claude/plans/piped-strolling-finch.md` for the full reasoning): a real Node
  server relays Actions between two browsers over WebSocket; hotseat is completely untouched.**
  Locked decisions: Render hosting (one service serves both the static client and the WS endpoint);
  optimistic apply on the acting player's own client, server-authoritative broadcast to both;
  Undo/Redo disabled entirely online (opponent-approved undo is an explicit fast-follow, not built);
  shareable room code/link, no accounts (`sessionId` is opaque, forward-compatible with a real auth
  layer later). **Why this needed zero engine changes:** `engine/`'s golden rules (CLAUDE.md §3) —
  pure `reduce(state, action)`, `GameState` 100% JSON-serializable, all randomness seeded *inside*
  `GameState.rng` — meant the server could `import { reduce, initGame } from '../src/engine'`
  verbatim, no adaptation; the existing dice-roller preview pattern (`store.ts`'s `request*Roll`,
  which previews a roll from `state.rng` without committing it) is already exactly the "preview
  locally, commit authoritatively, they must match since it's the same pure function" shape online
  play needs.

  **Server** (`server/`, new top-level directory, wired into the existing `tsconfig.json`/
  `vite.config.ts` `include`/`test.include` so `npm run typecheck`/`npm test` cover it too):
  `rooms.ts`'s `RoomManager` is pure (no WebSocket objects — a `Room` just wraps a `GameState` plus
  which `sessionId` holds each `SideId` and whether that Side's socket is currently connected),
  unit-tested in `__tests__/rooms.test.ts` with injected `genCode`/`genSeed` for determinism.
  **Server picks a fresh random RNG seed per room** — reusing a Mission's hardcoded test seed (e.g.
  Mission 1's `20261017`) would replay identical dice every real game. `index.ts` is the thin
  transport layer: plain Node `http` (no Express — one dependency-minimal static file server for
  `dist/`, matching the project's minimal-deps philosophy) + `ws`'s `WebSocketServer` on the same
  HTTP server (so Render only needs one service/port). On a client's `ACTION` message it re-verifies
  `sessionId`'s Side matches `state.currentSide` server-side (defense in depth — the client already
  gates this too) before calling `reduce()`, then **always re-broadcasts the room's canonical state
  regardless of whether the Action was accepted** — an internally-"illegal" Action just re-broadcasts
  unchanged state, which is self-healing for any client whose local optimistic guess ever drifts, with
  no special-case code. Reconnect: a disconnected socket doesn't touch the Room's `GameState` at all;
  the same `sessionId` rejoining (`JOIN`, not `CREATE`) resumes the same Side seat, verified live
  (join → disconnect → reconnect via a fresh WebSocket → same Side, `GameState` untouched throughout).
  `data/missions/catalog.ts` (id → `MissionDef`) exists specifically so the server has its own
  trusted mission lookup — a `CREATE` message carries a `missionId` string, never a client-supplied
  `MissionDef` object.

  **Protocol** (`src/net/protocol.ts`, one file imported by both `src/` and `server/` — literally the
  same TS source, so client/server can't silently drift on message shape): `ClientMsg` = `CREATE` /
  `JOIN` / `ACTION`; `ServerMsg` = `JOINED` (carries `peerConnected` too, so a joining client
  immediately knows the other Side's live connection state without a second message) / `STATE` /
  `PEER_STATUS` / `ERROR`. **`GameState` is the only game data that ever crosses the wire** — no
  separate diff/patch protocol, a client just overwrites its local `game` with whatever `STATE`
  delivers.

  **Client** (`src/net/client.ts`'s `NetClient` — pure transport, reconnect-with-backoff, zero game
  logic; `src/net/session.ts`'s `getSessionId()` — a `crypto.randomUUID()` cached in `localStorage`).
  `store.ts`'s `dispatch()` forks on a new `mode: 'hotseat' | 'online'` field **at its very first
  line** — the hotseat branch is byte-for-byte the original code, so hotseat correctness/tests were
  never at risk. The online branch: cheap client-side turn gate (`mySide !== game.currentSide` →
  silently no-op, no network round trip for something that can't be legal), then the SAME
  `reduce()` call hotseat uses, applied optimistically via a newly-extracted `applyReduceResult`
  helper (factored out of `dispatch`'s old body specifically so the online path's optimistic apply
  and the hotseat path's real commit share one implementation — SFX, the §4.5/§15.11 free-facing and
  §2.6 Stressed-unit auto-select, and the round-advance turn banner all Just Work for online too,
  `persist`/`trackHistory` flags gate the localStorage-autosave/Undo-stack side effects hotseat-only).
  Incoming `STATE` broadcasts go through a separate, deliberately lighter `handleServerMsg` reconciler
  (plain overwrite of `game`, no diffing needed since `GameState` is already the single source of
  truth `dispatch` itself works off) — **known v1 gap, on purpose:** it does NOT replay SFX (would
  double up the acting client's own already-played cue) or re-derive the full auto-select logic from
  `events` (the `STATE` message doesn't carry the originating `Action`/events, only the resulting
  `state`) — so the opponent doesn't hear a sound cue for the other player's move yet. Documented as
  an acceptable functional-minimum gap, not silently dropped; a real fix would thread the action/events
  through the `STATE` broadcast too. `newGame`/`resume`/`quitToMenu` all close any live `netClient`
  and force `mode: 'hotseat'` — a stale online socket can never survive a menu transition.

  **UI — explicitly functional-minimum placeholder** (user may hand off a real visual design later,
  e.g. via Claude Design — treat this pass's layout/copy as scaffolding to replace, not a locked
  spec): `SetupScreen.tsx` gained a "Play Online" card (create-room + join-by-code) alongside the
  untouched hotseat buttons; `OnlineLobby.tsx` is the pre-game "connecting…"/error screen (shown only
  while `mode === 'online' && !game`); `App.tsx` shows a slim online-status line inside the existing
  `.topbar` flex row (**not** a new grid-level sibling of `.layout` — that would've broken its
  2-row `grid-template-rows`, caught before it shipped) and hides Undo/Redo when `mode === 'online'`.
  **Side letters are never shown to the player** — every online-mode string resolves `SideId` through
  `NATIONS`/`game.players[side].nations` first (matching the topbar's pre-existing convention), so
  the lobby says "You are the Germans" / "waiting for the Soviets to join," never "Side A."

  **Verified live** (`.env.local`'s `VITE_WS_URL=ws://localhost:8787` points the Vite dev client at a
  separately-run `tsx server/index.ts`, since dev-mode client (5173) and server (8787) are different
  origins — production serves both from one origin, same-origin default in `client.ts`): create-room
  → real browser shows "waiting for the Soviets to join — room code X"; an independent second
  WebSocket connection joining that exact room → real browser's status flips to "opponent connected"
  live; a real click of Pass in the browser → the independent second connection receives the
  resulting `STATE` broadcast with the flipped `currentSide`, **and** the real browser's own UI
  updates correctly (turn banner, log) — proving the full loop end-to-end, not just the optimistic
  echo of one's own action; a same-side click attempted out-of-turn was silently blocked client-side
  (no message sent at all, verified via the second connection's log staying unchanged); disconnect +
  reconnect with the same `sessionId` resumed the same Side seat cleanly. `npm test` (405/405, +10 new
  for `rooms.ts`), typecheck, `npm run build`, and conformance (0 violations) all pass — hotseat
  untouched throughout.

  **A real bug caught by the user live-testing with a friend, since fixed:** after a Move online, the
  free facing-correction picker (§4.5/§15.11 `CHOOSE_FACING`) silently refused to dispatch. Root
  cause: both `store.ts`'s online `dispatch` and `rooms.ts`'s `applyAction` added a blanket "is it
  your Turn" gate that neither hotseat nor the engine itself has — `reduce()`'s own `doChooseFacing`
  deliberately has **no** `currentSide` check, because a normal Action always hands the Turn to the
  other side *before* the correction window opens (that's the whole point of the rule). The blanket
  gate treated it like every other Action and blocked it outright. First-instinct fix (delete the
  gate entirely) was itself wrong and caught before shipping: `PASS` has no `unitId`/side field at
  all (`{ type: 'PASS' }`), so `reduce()` has no caller identity to self-defend it with — removing the
  gate wholesale would let either side trigger the *other* side's Pass. **Correct fix: exempt
  `CHOOSE_FACING` specifically** from the Turn gate (both sides of the fix — client and server), and
  give it its own narrower check instead: does the target Unit's `side` match the caller's (since
  `doChooseFacing` itself never checks that either — harmless on one shared hotseat screen, a real gap
  online where a client could otherwise reface the *opponent's* still-open window). New regression
  test in `server/__tests__/rooms.test.ts`. Verified against the real running server with the exact
  reported scenario. **Lesson: when adding a network-layer authorization check on top of an engine
  that already has its own per-Action legality rules, don't assume "whose Turn is it" is a universal
  precondition — grep for the Action's handler and read its own comment for documented exceptions
  first.**

  **Render deployment — prepped, not yet actually deployed (step 4):** `render.yaml` (one Node web
  service; `plan: free` to start, switchable to `starter` for an always-on instance later —
  `server/index.ts` already reads `process.env.PORT`, no code change needed there). Two real gaps
  found and fixed while prepping this, both worth remembering:
  1. **`tsx` was a devDependency, but `npm start` (`tsx server/index.ts`) needs it at runtime.** A
     platform that runs `npm install` with `NODE_ENV=production` (common for PaaS) skips
     devDependencies, which would make the start command fail on a clean deploy despite working
     fine locally (where `node_modules` already has everything from ad-hoc `npm install`s during
     dev). Moved `tsx` to `dependencies`; `@types/node` correctly stays a devDependency (compile-time
     only, never imported at runtime).
  2. **`serveStatic`'s catch-all fallback served `index.html` (200, `text/html`) for ANY missing
     path, including missing assets with a real extension** (`/assets/index-OLDHASH.js`) — not just
     genuine SPA routes. The realistic trigger: a browser with a stale cached `index.html` from
     before the last deploy, still referencing an old hashed bundle filename that no longer exists
     post-redeploy. Serving HTML in place of the missing JS makes the browser try to execute/parse
     it and fail confusingly, instead of a clean 404 it can react to (reload → picks up the new
     `index.html`). Fixed: only extensionless paths get the `index.html` fallback now; a missing
     path *with* an extension 404s for real. Caught by manually running the actual production
     startup (`npm run build && npm start`, not the dev-mode split-port setup) and curling it —
     verified both the static-serve fix and that one process really does serve the built client +
     accept a real WebSocket `CREATE`/`JOINED` round-trip on the same port, the exact model Render
     needs. Extracted `serveStatic` into its own `server/staticServe.ts` (takes `distDir` as a
     parameter instead of a module-level constant) specifically so this could get real Vitest
     coverage (a temp-directory fixture, no real HTTP server needed) rather than staying
     manual-verification-only. **Still needs the user:** actually creating the Render service
     (Blueprint import or manual Web Service pointed at this repo) and a real over-the-internet test
     with a second person — I can prep the repo but can't sign up for/operate their Render account.
  **Not yet built (step 5):** opponent-approved Undo request (the "fast-follow" decision — rides on
  this pass's message-passing pipeline, est. 1-2 extra days); the real visual design for the
  lobby/status UI, if the user provides one.

  → M12 cards (§8, incl. OBA) → the rest of M13 (deploy, real visual design, opponent-approved undo)
  → **M8 Hidden Units** (§11, now genuinely buildable — a real per-client server exists to filter
  state on, not just a single shared hotseat screen).

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
