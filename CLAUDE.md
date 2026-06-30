# CLAUDE.md — Conflict of Heroes (browser edition) — **v3 / 3rd Edition**

Guidance for Claude Code when building this project. Read this first, every session.

> **Source of truth for rules:** the official *Conflict of Heroes: Awakening the Bear*
> **3rd Edition** rulebook (Academy Games). This project is migrating from a 2nd-edition (7AP)
> build to **3rd-edition rules only** — see **§A (v3 migration)** below.
>
> **Do not invent rules from memory, and do not read the PDF.** The rulebook has been transcribed
> into a curated, section-by-section reference under **`rules/`**. Routing rule: when implementing
> or changing a mechanic, open **`rules/INDEX.md`**, find the chapter(s) that cover it, and read the
> matching **`rules/NN-*.md`** file(s) first. Cite the v3 section number (`N.M`) in code comments,
> commits, and tests. The `rules/` files are **committed** and authoritative (they replace the old
> gitignored `reference/rulebook.txt`).

---

## A. v3 MIGRATION — ✅ COMPLETE (kept as reference)

> **Status:** the cutover below (§A.3 steps 1–6) is **done**, and M5 Group Actions is built. This
> section is retained as the rationale/spec for the 3rd-ed model — not a TODO. **Never reintroduce
> 7AP logic.**

The 2nd→3rd edition change is **not** a tweak; it replaces the **action economy**, which most of
the engine hangs off. Everything below is the plan we cut over by.

### A.1 What changed (and the one-line "why")

| Area | 2nd ed (current code) | 3rd ed (target) | v3 § |
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
> (with `AR` playing the FP role), and the `+4` critical is unchanged. **`combat.ts` ports with a
> rename, not a rewrite.** Same for the range modifiers (short **+3AR** adjacent, long **−2AR**,
> close combat **+4AR**, crewed **−2AR** in CC) and the **hit-marker table** (your foot markers
> already match the v3 **Soft Target** deck — see §6).

### A.2 Per-module punch list — keep / rename / rewrite / new

**Port almost as-is (rename AV/DV→AR/DR, FP→Firepower→AR, re-verify values vs `rules/`):**
`hex.ts`, `terrain.ts`, `los.ts`, `range.ts`, `movement.ts`, `combat.ts`, `hits.ts`, `victory.ts`,
`rng.ts`, all of `data/` (stats/terrain/maps/`hitMarkers.ts`), all of `ui/`, `state/`, and the
`scripts/` geometry.

**Rewrite (the v3 cutover):**
- `types.ts` — `PlayerState`: drop `activatedUnitId` and `ap`. `Unit.status`: `'fresh'|'spent'`
  (delete `'active'`); add `stressed: boolean`. (CAP/loss/vp/hand/nation fields stay.)
- `actions.ts` — delete `ACTIVATE_UNIT` / `MARK_SPENT`; every unit Action (`MOVE`/`FIRE`/`RALLY`/
  `PIVOT`/`CLOSE_COMBAT`) is now self-contained and is followed by a Spent Check. Add CAP fields to
  actions: `{ capCostReduce?, capDiceMod? }`. Re-derive `legalActions` from "is this Unit Fresh, or
  Spent-but-affordable-to-0AP-with-CAPs".
- `cap.ts` — new spend model: `reduceActionCost(cost, caps)` (−1 each, any number, can reach 0AP ⇒
  skip Spent Check), keep `clampCapMod` for ±1 d6 (≤2); add the **floor-3** to `applyUnitLoss`/reset.
- `turn.ts` — `startRound` = the v3 **Pre-Round Sequence** (flip spent→fresh keeping markers+facing,
  CAP reset with floor 3, clear Stress, then v3 **initiative**: non-advantage side rolls 2d6 ≥ 7).
  The per-Action turn step: cost = base + Stress + terrain + hit-marker mods − CAP; Spent Check;
  set `stressed`; switch side. Pass clears the acting side's Stress.
- `reducer.ts` — rewire `doMove/doFire/doRally/...` to the "act → Spent Check → Stress" flow; drop
  activation bookkeeping; keep events/log.
- `rally.ts` — keep 5AP + roll `2d6 ≥ Rally Number`, **but** add the **mandatory Spent Check after
  the rally regardless of result** (7.10), let Stress raise the 5AP, and expand modifiers
  (fortifications, heavy smoke, +1 per friendly un-hit unit — cumulative).

**New modules:**
- `spent.ts` — the Spent Die `[1,1,2,3,3,4,5,5,6,7]` + `spentCheck(rng, cost) → {fresh, roll, rng}`
  (pass iff `roll > cost`). Oracle for tests = the Spent Chance table in `rules/03`.
- `stress.ts` — set/clear Stress, and the "+1AP if acted last Turn" cost contribution.

**Re-key data to v3 (later, with the relevant module):** unit counters use Fresh/Spent sides and
attack/move cost as **check thresholds**; add the **Armored Target** hit-marker deck for vehicles
(M6); card lists and hit-marker counts per the v3 back-matter.

### A.3 Migration build order (each step = green tests before the next)

0. **Pin rules:** commit `rules/` + `rules/INDEX.md`; delete/quarantine 2nd-ed rules notes and the
   old `RULES-ASSUMPTIONS.md` rulings that v3 now answers (re-open only genuine v3 ambiguities).
1. **`spent.ts`** (Spent Die + Spent Check). Test against the 20/30/50/60/80/90/100% table (`rules/03`).
2. **State model** (`types.ts`): Fresh/Spent + `stressed`; migrate `state.ts`/`initGame`.
3. **Action economy** (`turn.ts`/`actions.ts`/`reducer.ts`/`cap.ts`): act → Spent Check → Stress;
   Pass/Stall; round-end on consecutive Pass. **This is the cutover.** Port the rulebook's red-box
   examples in `rules/02` and `rules/03` as fixtures.
4. **CAPs** integrated into the cost path + d6 checks (floor 3 on reset/loss).
5. **Combat/Hits/Rally** rename to AR/DR; add the post-rally Spent Check; re-verify all numbers
   against `rules/06`–`rules/07` (and their red boxes — they're ready-made test cases).
6. **Round controller / Initiative / VP** to v3 (`rules/09`).
7. **Re-scope M5 → Group Actions (§10)** (see roadmap §8). Then resume later modules in v3 order.

The conformance harness (`scripts/conformance.ts`) is your safety net: re-point its re-derivation
to the v3 tables as you go, so the engine is continuously checked against `rules/`.

---

## 0. Continuing in a new session (handoff)

This repo is self-describing: a fresh session needs only the code + these docs.

- **Canonical location:** `C:\Users\ensch\Git Repos\conflict-of-heroes` (git repo; remote
  `origin` = https://github.com/enschell/conflict-of-heroes.git). **Launch Claude Code from this
  folder** so this CLAUDE.md auto-loads.
- **Orient by reading, in order:** this file (esp. **§A migration**, golden rules §3, directory map
  §4, rules index §6, roadmap §8), then `README.md`, then **`rules/INDEX.md`** and the specific
  `rules/NN-*.md` for whatever you're building. (The old `reference/rulebook.txt` is superseded by
  `rules/`.)
- **Verify before changing:** `npm install` (first time), then `npm test` (Vitest),
  `npm run typecheck`, `npm run build`, and `npm run conformance`. All green = known-good baseline.
- **Run it:** `npm run dev` → http://localhost:5173. Windows: Node 24 is at
  `C:\Program Files\nodejs` (not on Git Bash's PATH; in PowerShell prepend it).
- **Current status / next:** **v3 cutover DONE (§A.3 steps 1–6)** and **M5 — Group Actions DONE**.
  The engine runs on 3rd-ed rules: Spent Die/Check, Fresh/Spent + Stress, Pass/Stall, CAP floor 3,
  AR/DR + Hit Number, v3 initiative + no-tie VP track, and Group Move/Attack/Rally (engine + UI).
  **Real Mission 1 ("Partisans") is wired** on the authored Map 1 (206 hexes), 7 CAP/side, German
  Round-1 initiative, Soviets start +1 VP, I06 scores 1 VP/round, 1 VP/kill. The old 2nd-ed
  `FIREFIGHT_1`/`partisans` scaffold is retired. **Next:** Mission 1 reinforcements / map-edge entry
  (German R1 south edge, Soviet R2 → R07, German R3 SS — currently stopgap pre-placed), Group close
  combat, then M6 (vehicles + armored hit deck). A board-rendering polish pass is also pending.

---

## 1. What this is

A browser implementation of the tactical hex-and-counter wargame *Conflict of Heroes: Awakening the
Bear* (**3rd edition**). Platoon-sized **Missions**: each counter is an infantry squad, crewed gun,
or vehicle. Players fight over Objectives worth victory points (VPs); the side with **VP Advantage**
at the end wins (the v3 "no-tie" VP track — one side always leads).

**This build's scope (locked decisions):**
- **Hotseat first, online later.** Pass-and-play now; keep the engine network-agnostic so an
  authoritative server + WebSocket rooms can be added later with **no engine changes**.
- **Vertical slice = infantry only, Mission 1 ("Partisans") playable end-to-end.** Vehicles,
  mortars, OBA, smoke, hidden units, fortifications, mines, hills are **later modules** (roadmap §8).
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
      types.ts              # shared types (GameState, Unit, Hex, Action, GameEvent…)  [v3 rewrite]
      state.ts              # GameState shape, initGame(mission), (de)serialize           [v3 edit]
      rng.ts                # seeded RNG: roll2d6, rollD6, rollSpentDie, drawHit          [add die]
      spent.ts              # ★ NEW: Spent Die [1,1,2,3,3,4,5,5,6,7] + spentCheck(cost)
      stress.ts             # ★ NEW: Stress state + "+1AP if acted last Turn"
      hex.ts                # axial math: neighbors, distance, direction, line, arc
      terrain.ts            # terrain table → AP cost, DR mod, blocksLOS, isCover
      los.ts                # line of sight + arc of fire; visibleHexesFrom(hex)
      movement.ts           # move cost, facing, pivot, backwards, roads, walls
      range.ts              # short +3AR (adjacent), long −2AR
      combat.ts             # AR/DR; Hit Number = DR − AR; 2d6 ≥ HN; crit by 4   [rename only]
      hits.ts               # draw marker, apply effects, 2nd hit = destroyed
      rally.ts              # 5AP rally; 2d6 ≥ rally #; +mods; ★ Spent Check after (7.10)
      cap.ts                # reduce cost (−1/CAP, any #; 0AP⇒no check), ±1 d6 (≤2), floor 3
      turn.ts               # Pre-Round Sequence, v3 initiative, act→SpentCheck→Stress, pass/stall
      victory.ts            # VP for kills, objective control, game end (no-tie track)
      actions.ts            # action defs + getLegalActions()  [drop ACTIVATE/MARK_SPENT]
      reducer.ts            # central reduce(state, action) → { state, events }
      groups.ts             # ✅ Group Actions §10: connectivity, support, one Spent Check/group
      cards.ts              # (deferred) Battle/Weapon cards §8
      index.ts              # public engine API surface
      __tests__/            # Vitest
    data/                   # authored content (no logic)
      nations.ts terrainTypes.ts hitMarkers.ts units.ts hexArt.ts
      maps/mission1.ts   missions/mission1.ts   # Mission 1 "Partisans": Map 1 board + setup
      cards/                # deferred to the cards milestone
      __tests__/
    state/  store.ts persistence.ts             # Zustand + localStorage saves
    ui/     …                                   # React + SVG (see §7)
  scripts/  play.ts conformance.ts              # terminal driver + v3 conformance audit
```

> **Current state:** engine/data/state/ui/scripts compile and pass under **3rd-ed (v3) rules** — the
> §A cutover is complete and **M5 Group Actions** is built (conformance 0 violations). Data is the
> real **Mission 1** on **`maps/mission1.ts`** + **`missions/mission1.ts`** (the 2nd-ed
> `firefights/`/`maps/partisans.ts` are deleted). `rules/` is the committed source of truth.

---

## 5. State model (`engine/types.ts`) — v3

```ts
GameState = {
  rng: RngState                       // seed + counter; advanced on every roll (incl. Spent Die)
  phase: 'setup'|'playing'|'roundEnd'|'gameOver'
  round: number; roundsTotal: number
  vpLeader: SideId                    // who currently holds VP Advantage (no-tie track, 9.2)
  initiativeSide: SideId; currentSide: SideId; consecutivePasses: number
  players: Record<SideId, {
    side: SideId
    nations: NationId[]
    capStart: number; capCurrent: number; unitLosses: number   // capCurrent floored at 3 (7.13)
    vp: number
    hand: CardId[]                    // (cards deferred)
    // NOTE v3: no `activatedUnitId`, no `ap` pool.
  }>
  units: Record<UnitId, {
    id: UnitId; side: SideId; nation: NationId; templateId: string
    hexId: HexId; facing: 0|1|2|3|4|5
    status: 'fresh'|'spent'           // v3: no 'active'
    stressed: boolean                 // v3: +1AP next Action; cleared by Passing (2.6/2.7)
    hitMarkers: HitMarker[]           // hidden info per 7.5
    assignedWeaponCards: CardId[]
  }>
  hexes: Record<HexId, {
    coord: { q: number; r: number }   // axial; label "1-J10" derived for display (1.0)
    terrainType: TerrainId; elevation: number
    edges: { walls: EdgeFlags; roads: EdgeFlags }
    features: { controlMarker?: SideId; smoke?: 0|1|2; fortification?: …; wire?: boolean; mine?: … }
  }>
  hitPiles: { soft: Record<HitType, number>; armored: Record<HitType, number> }  // v3: two decks
  missionId: string
  victory: VictoryConfig
  log: GameEvent[]
  history: { past: GameState[]; future: GameState[] }
}
```

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
| Position, facing, stacking, movement, terrain cost, roads, entering | `movement.ts`, `terrain.ts` | 4.0–4.12 | `rules/04` |
| Fire Zone: arc, LOS, range | `los.ts`, `range.ts`, `hex.ts` | 5.0–5.3 | `rules/05` |
| Combat: DR/AR, soft/armored, flank, terrain, walls, **HN=DR−AR**, stacked, close combat, crewed | `combat.ts` | 6.0–6.12 | `rules/06` |
| Hits, hit markers, critical (+4), 2nd hit, rally, destroyed, CAP loss | `hits.ts`, `rally.ts`, `cap.ts` | 7.0–7.13 | `rules/07` |
| Battle/Weapon cards (Green/Blue cost) | `cards.ts` *(deferred)* | 8.0–8.8 | `rules/08` |
| Round end, **Pre-Round Sequence (10 steps)**, **Initiative (2d6≥7, non-advantage)**, VP no-tie | `turn.ts`, `victory.ts` | 9.0–9.11 | `rules/09` |
| **Group Actions** (one Spent Check; group move = highest; attack = leader +1AR/supporter) | `groups.ts` *(M5)* | 10.0–10.12 | `rules/10` |
| *(later)* hidden units | — | 11.x | `rules/11` |
| *(later)* hills / elevation / LOS-over-levels | — | 12.x | `rules/12` |
| *(later)* mortars / artillery / OBA / drift | — | 13.x | `rules/13` |
| *(later)* smoke | — | 14.x | `rules/14` |
| *(later)* vehicles / transport / armored hits | — | 15.x | `rules/15` |
| *(later)* special units (turrets, SPGs, open-top, APCs, field guns) | — | 16.x | `rules/16` |
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

**Armored-Target deck (add for vehicles, M6 — `rules/15`):** Stunned ×2 (rally 9), Destroyed ×1,
Immobilized ×5 (no move/pivot; no rally), Light Damage ×4 (no effect; no rally), Gun Damaged ×2
(cannot fire; no rally), Panicked ×1 (cannot fire; front DR −4; rally 9), Suppressed ×5 (+1AP;
red FP −3, blue FP −5; rally 8).

---

## 7. Conventions

- **Everything is data-driven.** Adding a nation, unit, card, or mission should be a `data/` edit.
  - **Add a unit:** stat template `{ nation, fp:{red,blue}, dr:{front,flank,color}, move, range,
    apToFire, vp, flags, whiteBoxFp? }` in `data/units.ts`. (v3: `apToFire`/`move` are **Spent-Check
    thresholds**, not pool spend.)
  - **Add a card:** `{ id, type:'action'|'bonus'|'mission'|'artillery', cost:{green?,blue?}, effect }`
    in `data/cards/` (v3 Green/Blue cost, 8.5). Effects are engine actions/modifiers, not UI code.
  - **Add a mission:** new file in `data/missions/` with maps, placements (by hex label), starting
    CAPs per side, rounds, victory config, deck, hidden-unit slots.
- **Actions** are plain serializable objects: `{ type:'MOVE', unitId, toHexId, capCostReduce? }`,
  `{ type:'FIRE', attackerId, targetHexId, capDiceMod? }`, `{ type:'RALLY', unitId, capDiceMod? }`,
  `{ type:'PASS' }`, `{ type:'STALL', unitId }`, `{ type:'GROUP_ACTION', leaderId, memberIds, … }`,
  `{ type:'PLAY_CARD', cardId, targetUnitIds }`.
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
  hex vs close-combat it).
- **Spent-Check / opportunity confirm** ✅ acting with a unit prompts the Spent-Check die flow
  (replaces the old opportunity-spend confirm); `ConfirmDialog`.
- **Turn banner** ✅ `TurnBanner.tsx` "Start of turn N".
- **Readouts + dice in log** ✅ track sheet/inspector show **Fresh/Spent + Stress** and CAPs; the log
  prints the actual 2d6 (fire/rally/initiative) and the Spent-Die result.
- **Animated clickable dice with sound** ✅ `DiceRoller.tsx` — dice show `?` until clicked, then
  settle on the **engine-provided** result (previewed from the seeded RNG, then committed); never
  influences the outcome. Stacked fire rolls one enemy at a time and commits once (6.9). **Add the
  Spent Die as a roll kind.**
- **Movement & fire SFX** ✅ `sound.ts` synthesizes audio by `template.kind`; mute toggle.

---

## 8. Milestone roadmap

- **M0 — Scaffold** ✅ Vite+React+TS, Vitest; `hex.ts`, `types.ts`, `rng.ts`.
- **M1 — Engine core (infantry, 2nd ed)** ✅ terrain, movement/facing, LOS/arc, combat, hits, rally,
  range, CAP, turn/round, victory, `reduce`, `initGame`, `legalActions`.
- **M2 — Mission 1 content** ✅ `nations.ts`, `units.ts` (German + Soviet infantry, our own stats),
  `maps/mission1.ts` (the real **Map 1** board, 206 hexes authored from the Mission Book) +
  `missions/mission1.ts` ("Partisans": 5 rounds, 7 CAP/side, German Round-1 initiative, Soviets +1
  VP, objective **I06** = 1 VP/round, 1 VP/kill). Mission 1 is a **Section-1 teaching Mission played
  before cards**, so it uses **no cards** (card subsystem deferred). *(Replaced the earlier invented
  2nd-ed firefight + `maps/partisans.ts`.)*
- **M3 — UI** ✅ Zustand + React/SVG board, counters, inspector, LOS overlay, animated dice + SFX,
  log, setup/victory screens.
- **M3.1–M3.2 — UX** ✅ per-hex art; stacked-unit picker; SFX; right-sidebar hover panel; hold-Shift
  LOS; fire-odds popup; turn banner; big readouts; dice in log.
- **M3.3 — Close combat** ✅ same-hex attack vs flank DR, +4 (or −2 crewed/white-box), `CLOSE_COMBAT`.
- **M3.4 — Conformance audit** ✅ `scripts/conformance.ts` self-plays + re-derives each move.
- **M4 — Persistence** ✅ named save slots, JSON export/import, undo/redo; saves round-trip with RNG.

- **★ M4.5 — v3 CUTOVER ✅ (see §A.3):** Spent Die + Spent Check → Fresh/Spent state → action
  economy (dropped 7AP/activation; Stress; Pass/Stall) → CAP floor 3 → combat renamed to AR/DR +
  post-rally Spent Check → v3 initiative/Pre-Round/no-tie VP. Real **Mission 1** plays under 3rd-ed
  rules; conformance re-derives against `rules/`.

- **M5 — Group Actions (§10)** ✅ `groups.ts` + `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY` (each
  with **one** Spent Check for the group, all members Stressed): **group move** cost = highest member
  move; **group attack** = leader **+1AR per qualifying supporter** (adjacent, target in Fire Zone +
  Normal Range, no FP-affecting hit marker); **group rally** = per-unit Rally Checks, one group
  Spent Check. UI: "Group" mode (multi-select, formation-move arrows, rally, click-enemy attack).
  *Deferred:* group **close combat**; Mission 1 **reinforcements/edge entry** (stopgap pre-placed).

- **Later (additive, v3 order):** M6 vehicles + armored hit deck (§15–16) → M7 mortars/OBA/smoke
  (§13–14) → M8 hidden units (§11) → M9 elevation/hills (§12) → M10 fortifications/obstacles/mines
  (§17) → M11 flamethrowers/pioneers (§18) → M12 cards (§8) → **M13 online multiplayer** (host the
  pure engine authoritatively + WebSocket rooms; the client already speaks action objects).

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
