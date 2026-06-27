# CLAUDE.md — Conflict of Heroes (browser edition)

Guidance for Claude Code when building this project. Read this first, every session.

> **Source of truth for rules:** the official *Conflict of Heroes: Awakening the Bear*
> (Academy Games, 2nd ed.) rulebook. When implementing a mechanic, cite the rulebook section
> (see the index below) — do not invent rules from memory. The full approved build plan lives
> at `C:\Users\ensch\.claude\plans\here-is-a-ruleset-sprightly-piglet.md`.

---

## 0. Continuing in a new session (handoff)

This repo is self‑describing: a fresh session needs only the code + these docs, not any prior
chat or Claude "memory". To continue cleanly:

- **Canonical location:** `C:\Users\ensch\Git Repos\conflict-of-heroes` (a git repo;
  remote `origin` = https://github.com/enschell/conflict-of-heroes.git). **Launch Claude Code from
  this folder** so this CLAUDE.md auto‑loads and the browser‑preview tool works.
- **Orient by reading, in order:** this file (architecture, golden rules §3, directory map §4,
  rulebook index §6, roadmap §8), then `README.md`, `RULES-ASSUMPTIONS.md` (open rule rulings),
  and `reference/rulebook.txt` (local rulebook text — grep it, don't re‑parse the PDF).
- **Verify before changing:** `npm install` (first time), then `npm test` (Vitest),
  `npm run typecheck`, `npm run build`, and `npm run conformance` (self‑plays games, checks moves
  vs rules). All green = known‑good baseline.
- **Run it:** `npm run dev` → http://localhost:5173. Windows: if `npm` isn't found, Node is at
  `C:\Program Files\nodejs` (Git Bash lacks it on PATH; in PowerShell prepend it).
- **Current status / next:** see §8 — M0–M4 done; **M5 (slice polish) is next**.
- Claude's auto‑"memory" is keyed to the working directory and is a convenience only; **this file
  is the authoritative handoff.**

---

## 1. What this is

A browser implementation of the tactical hex-and-counter wargame *Conflict of Heroes:
Awakening the Bear*. Platoon-sized firefights: each counter is an infantry squad, crewed gun,
or vehicle. Players fight over objectives worth victory points (VPs); most VPs wins.

**This build's scope (locked decisions):**
- **Hotseat first, online later.** Pass-and-play in one browser now. Keep the engine fully
  network-agnostic so an authoritative server + WebSocket rooms can be added later with **no
  engine changes**.
- **Vertical slice = infantry only, Firefight 1 ("Partisans") playable end-to-end.** Vehicles,
  mortars, off-board artillery, smoke, hidden units, fortifications, mines, hills are **later
  modules** (see roadmap). Do not build them in the slice unless asked.
- **Stack:** Vite + React + TypeScript, **client-only**. SVG hex board. Pure-function rules
  engine. Zustand store. Vitest for tests.
- **Content:** we author our **own** stats/terrain/scenario data and **original simple
  graphics** (colored hexes, text counters). **Never** embed Academy Games' map or counter art.
  This is for personal play.

**Player model — read carefully.** The game is **two opposing sides** (a "force"). Each side
is composed of **one or more nations**. *Awakening the Bear* = Germans vs Soviets, but later
series titles add Americans, British, French, Japanese. **Do not hardcode two armies.** A side
is the unit of turn-taking; a **nation** (data) drives unit stats and army-specific cards.
"2–4 players" = team play, 1–2 humans per side (UI nicety, not an engine concept yet).

---

## 2. Commands

```bash
npm install        # first time
npm test           # Vitest unit tests (39 passing)
npm run demo       # auto-play a full game in the terminal (engine showcase)
npm run play       # interactive hotseat in the terminal (no GUI until M3)
npm run dev        # Vite dev server — placeholder shell until the M3 UI
npm run build      # production build (tsc --noEmit && vite build)
npm run typecheck  # tsc --noEmit (strict; keep this clean)
```

**Windows / Node:** Node 24 lives at `C:\Program Files\nodejs` and is **not on Git Bash's
PATH**. Run npm from PowerShell, prepending it first:
`$env:Path = "C:\Program Files\nodejs;" + $env:Path`. (winget's `msstore` source has a cert
error here — install packages with `--source winget`.)

The project is already scaffolded (Vite + React + TS, Zustand, Vitest, tsx). Keep the
directory layout in §4.

---

## 3. Engine golden rules (do not violate)

1. **`src/engine/` is pure TypeScript. No React, no DOM, no browser APIs, no `Date.now()`,
   no `Math.random()`.** It must run identically in a test, a browser, or a future server.
2. **All randomness goes through the seeded RNG stored *inside* `GameState`** (`engine/rng.ts`).
   Every dice roll advances the serialized RNG state. This makes saves, undo, and replays
   bit-for-bit deterministic — and is what makes a future authoritative server trivial.
3. **`GameState` is 100% JSON-serializable.** No class instances, no functions, no `Map`/`Set`
   stored in state (use plain objects/arrays; if you need a multiset, store counts as an
   object). `JSON.parse(JSON.stringify(state))` must round-trip to an identical game.
4. **The only way to change state is `reduce(state, action) -> { state, events }`** in
   `engine/reducer.ts`. Actions are plain serializable objects. The UI **dispatches actions**;
   it never mutates state. (This is also the wire format for future online play.)
5. **Legality lives in the engine**, not the UI: `getLegalActions(state, unitId)` and per-action
   validators. The UI asks the engine what's legal and renders it; it must not duplicate rules.
6. **Animations/sound are pure presentation.** The dice animation visualizes a result the engine
   already computed from the RNG — it must never determine the outcome.

---

## 4. Directory map

```
conflict-of-heroes/
  CLAUDE.md                 # this file
  README.md
  package.json  vite.config.ts  tsconfig.json  index.html
  public/assets/            # original art + dice sound effects
  src/
    main.tsx  App.tsx
    engine/                 # PURE rules engine (see §3)
      types.ts              # all shared types (GameState, Unit, Hex, Action, GameEvent…)
      state.ts              # GameState shape, initGame(firefight), (de)serialize helpers
      rng.ts                # seeded RNG: roll2d6, rollD6, drawHit
      hex.ts                # axial math: neighbors, distance, direction, lineDraw, arc sectors
      terrain.ts            # terrain table → AP cost, DM, blocksLOS, isCover
      los.ts                # line of sight + arc of fire; visibleHexesFrom(hex) for the overlay
      movement.ts           # move cost (cumulative DMs), facing, pivot, backwards, roads, walls
      range.ts              # short range +3FP, long range −2FP
      combat.ts             # AV = FP + 2d6 + CAP; DV = DR(front/flank)+DMs; hit / critical(+4)
      hits.ts               # draw from pile, apply marker effects, 2nd hit = destroyed
      rally.ts              # 5AP rally, rally number, cover/stacking/CAP modifiers
      cap.ts                # supplement AP, CAP actions, ≤2 dice mod, CAP-track losses
      cards.ts              # action/bonus/event/weapon card registry + effects
      groups.ts             # shared activation (shared 7AP), group move/fire/rally, firegroups
      turn.ts               # pre-round sequence, initiative, turn types, stall, pass, spent flip
      victory.ts            # VP for kills, victory-hex control, game end / tie
      actions.ts            # action defs + getLegalActions()
      reducer.ts            # central reduce(state, action) → { state, events }
      index.ts              # public engine API surface
      __tests__/            # Vitest: combat, los, movement, turn, rally, victory, replay…
    data/                   # authored content (no logic)
      nations.ts            # nation registry (Germans, Soviets, … colors) ✅
      terrainTypes.ts       # the Foot Movement & Terrain Table as data ✅
      hitMarkers.ts         # foot hit-marker pile: counts, rally numbers, stat effects ✅
      units.ts              # infantry stat templates keyed by nation (our own stats) ✅
      hexArt.ts             # terrain→image + per-hex art override mapping (artForHex) ✅
      maps/partisans.ts     # original FF1 hex map (terrain/road/walls/objectives) ✅
      firefights/firefight1.ts  # "Partisans" scenario (no cards — see roadmap) ✅
      cards/                # card data — deferred to the FF2/cards milestone (not built)
      __tests__/            # Vitest: firefight1 integrity + deterministic playthrough ✅
    state/
      store.ts              # Zustand store: game+UI state, board clicks, pending dice, undo/redo,
                            #   save-slot/export/import intents, SFX ✅
      persistence.ts        # localStorage autosave + named slots (list/save/load/delete) +
                            #   isGameState import validation ✅
    ui/                     # React + SVG; dispatches actions, renders engine state ✅
      hexgeo.ts theme.ts sound.ts odds.ts   # SVG geometry, palette, WebAudio SFX, 2d6 odds
      SetupScreen.tsx  Board.tsx  UnitCounter.tsx  Inspector.tsx (action menu)
      HoverPanel.tsx (under-cursor terrain + half-size units)  UnitPicker.tsx  TrackSheet.tsx
      DiceRoller.tsx  ConfirmDialog.tsx  TurnBanner.tsx  SavesDialog.tsx  Log.tsx  VictoryScreen.tsx
      __tests__/render.test.tsx     # jsdom client-render smoke test of the whole tree
  public/assets/terrain/    # original starter hex-art tiles (svg) — replaceable via data/hexArt.ts
  reference/                # LOCAL ONLY (gitignored): rulebook.txt = pdftotext of the rulebook,
                            #   grep it instead of re-parsing the PDF. See reference/README.md.
  scripts/                  # terminal driver for playing/exercising the engine pre-UI
    play.ts                 # interactive hotseat + auto-demo (--demo) of Firefight 1; DEBUG
                            #   square ASCII grid, los, save/load. NOT the visual model.
    conformance.ts          # `npm run conformance` — self-plays games, re-derives each
                            #   move from the rules, asserts the engine agrees (M3.4 audit)
  RULES-ASSUMPTIONS.md      # open rulings / deviations for the user to decide (from M3.4)
```

> **Current state:** `engine/`, all of `data/`, `state/`, `ui/`, `public/assets/`, and `scripts/`
> work (**75 tests pass, typecheck + `vite build` clean**). `npm run dev` → SVG board with per-hex
> artwork. Interactions: click a friendly unit to select (auto-picks the unspent one; popup if
> several); click the selected unit again to deselect; move/fire by clicking highlighted hexes;
> **hold Shift** to preview LOS from the hovered hex (release to hide); **Ctrl+click** a stacked
> hex to pick a unit; hovering a hex fills the right-sidebar "Under cursor" panel (terrain rules +
> half-size unit renders); hovering an enemy you can hit shows a fire-odds popup; opportunity
> actions prompt a confirm; a "Start of turn N" banner appears each new round; dice/move/fire SFX;
> autosave + undo. A **rules-conformance audit** (`npm run conformance`) self-plays games and
> re-derives every move from the rules — currently **0 violations**; open rulings are in
> `RULES-ASSUMPTIONS.md`. Persistence (M4): autosave + **named save slots**, **JSON export/import**,
> and **undo/redo** via the topbar **Saves** dialog. Remaining: M5 slice polish. Dev dep `jsdom`
> (render test). Rulebook text cached at `reference/rulebook.txt` (gitignored).

---

## 5. State model (`engine/types.ts`)

```ts
GameState = {
  rng: RngState                       // seed + counter; advanced on every roll
  phase: 'setup'|'playing'|'roundEnd'|'gameOver'
  round: number; roundsTotal: number
  initiativeSide: SideId; currentSide: SideId; consecutivePasses: number
  players: Record<SideId, {
    side: SideId
    nations: NationId[]               // a side is a force of 1+ nations
    capStart: number; capCurrent: number; unitLosses: number
    vp: number
    hand: CardId[]
    activatedUnitIds: UnitId[]        // >1 supports Shared Activations (9.0)
    apPool: number                    // shared AP pool for the activation
  }>
  units: Record<UnitId, {
    id: UnitId; side: SideId; nation: NationId; templateId: string
    hexId: HexId; facing: 0|1|2|3|4|5
    status: 'fresh'|'active'|'spent'
    hitMarkers: HitMarker[]           // hidden info per 7.5
    assignedWeaponCards: CardId[]
  }>
  hexes: Record<HexId, {
    coord: { q: number; r: number }   // axial; label like "J10" derived for display
    terrainType: TerrainId; elevation: number
    edges: { walls: EdgeFlags; roads: EdgeFlags }
    features: { controlMarker?: SideId; smoke?: 0|1|2; fortification?: …;
                wire?: boolean; mine?: … }
  }>
  hitPiles: { foot: Record<HitType, number>; vehicle: Record<HitType, number> }
  firefightId: string
  victory: VictoryConfig
  log: GameEvent[]
  history: { past: GameState[]; future: GameState[] }   // undo/redo
}
```

**Hex coordinates:** internal math is **axial (q,r)**. The rulebook addresses hexes as
`Map# - RowLetter + ColumnNumber` (e.g. `2-J10`). Keep a label↔axial mapping in `hex.ts`/map
data; show labels in the UI, compute on axial.

---

## 6. Rulebook section index (cite these)

| Mechanic | Engine file | Rulebook § |
|---|---|---|
| Game setup, unit types | `data/firefights`, `data/units` | 1.0, 1.1 |
| Pre-round sequence, initiative | `turn.ts` | 2.0, 2.1 |
| Turn types (AP / opportunity / command / card), stall, pass, spent | `turn.ts`, `actions.ts` | 2.2, 3.0, 3.1 |
| Round progression, game end, VPs, victory-hex control | `turn.ts`, `victory.ts` | 2.3–2.5 |
| Command Action Points (supplement, CAP action, ≤2 dice mod, init mod) | `cap.ts` | 3.2.1–3.2.4 |
| CAP-track loss on unit destruction | `hits.ts`, `cap.ts` | 7.4 |
| Variable AP allocation (optional) | `turn.ts` | 3.0.1 |
| Terrain table (AP cost, DM, blocks LOS, cover) | `terrain.ts`, `data/terrainTypes` | 4.0, 5.0 |
| Movement, roads, walls, facing, backwards, pivot, cautious move | `movement.ts` | 5.0–5.4 |
| Line of sight + edge "least restrictive" rule | `los.ts` | 6.0 |
| Arc of fire (front 3 hexes) | `los.ts`, `hex.ts` | 6.1 |
| Combat resolution: AV/DV, hit, critical (+4) | `combat.ts` | 7.0 |
| Firepower/Defense colors (red soft / blue armor) | `combat.ts` | 7.1–7.3 |
| Hits, hit markers, reveal rules, stacking | `hits.ts` | 7.5, 7.5.1 |
| Rally (5AP, rally #, cover/stacking/CAP mods) | `rally.ts` | 7.6 |
| Range: short +3FP, long −2FP, close combat | `range.ts`, `combat.ts` | 7.7 |
| Cards (action/bonus/event/weapon), icons | `cards.ts`, `data/cards` | 8.0–8.5 |
| Shared activations, group move/fire/rally | `groups.ts` | 9.0–9.2 |
| *(later)* hidden units | — | 10.x |
| *(later)* hills/elevation/LOS | — | 11.x |
| *(later)* mortars / OBA / smoke | — | 12.x, 13.x |
| *(later)* vehicles / transport | — | 14.x–17.x |
| *(later)* fortifications, obstacles, mines | — | 18.x |

### Combat quick-reference (the math everything hinges on)
- `AV = FP(matching target DR color) + 2d6 + capMod(≤2)` then ± range bonus, hit-marker FP
  delta, firegroup `+1 per supporter`, card mods.
- `DV = DR(front if attacker in target's arc, else flank) + terrain DM + smoke + wall(+1 if LOS
  crosses a wall in/bordering target hex) + fortification DM`.
- **Hit** if `AV ≥ DV`. **Critical (instant kill)** if `AV ≥ DV + 4`.
- A unit with an existing hit marker that takes another hit is **destroyed**.
- Short range (adjacent): `+3 FP`. Long range (> range, ≤ 2× range): `−2 FP`.

### Foot hit markers (`hits.ts`) — pile counts, effects, rally number (§7.5)
- Stunned ×2 — only rally; rally 7
- Unnerved ×2 — no stat effect; rally 7
- KIA ×1 — killed immediately on draw
- Pinned ×5 — cannot move/pivot; rally 7
- Panicked ×2 — cannot fire; flank DR +1, front DR −2; rally 8
- Suppressed ×5 — +1 AP to fire; FP −2; rally 7
- Cowering ×2 — +2 AP to fire; +1 AP/hex move/pivot; range→1; DR +1; rally 8
- Berserk ×1 — −1 AP to fire; FP +1; range→1; DR +1; rally 8

---

## 7. Conventions

- **Everything is data-driven.** Adding a nation, unit, card, or scenario should be a `data/`
  edit, not an engine edit.
  - **Add a nation:** append to `data/nations.ts`; add its unit templates to `data/units.ts`
    (keyed by nation); reference its card set.
  - **Add a unit:** add a stat template `{ nation, fp:{red,blue}, dr:{front,flank,color},
    move, range, apToFire, vp, flags }` to `data/units.ts`.
  - **Add a card:** add `{ id, type:'action'|'bonus'|'event'|'weapon', cost:{ap?,cap?},
    effect }` to `data/cards/`; effects are expressed as engine actions/modifiers, not UI code.
  - **Add a scenario:** new file in `data/firefights/` with maps, placements (by hex label),
    starting CAPs per side, rounds, victory config, deck, hidden-unit slots.
- **Actions** are plain objects, e.g. `{ type:'MOVE', unitId, toHexId }`,
  `{ type:'FIRE', attackerId, targetHexId, capMod }`, `{ type:'RALLY', unitId }`,
  `{ type:'ACTIVATE', unitId }`, `{ type:'PASS', side }`, `{ type:'STALL' }`,
  `{ type:'PLAY_CARD', cardId, targetUnitIds }`. Keep them serializable.
- **Tests:** colocate in `engine/__tests__/`. Reproduce the rulebook's worked examples and
  figures as fixtures (esp. Figure 7 LOS, front/flank, the AP/CAP turn-interleave examples).
- **No engine→UI imports.** UI imports engine; never the reverse.

### Requested UI features (all implemented — keep them working)
- **Real hex board** ✅ `Board.tsx` renders true pointy-top hexagons (not squares). The square
  ASCII grid in `scripts/play.ts` is a **debug-only** convenience and is **not** the visual model.
- **Custom per-hex artwork** ✅ each hexagon is filled with an image clipped to the hex (SVG
  `clipPath`). Mapping lives in `data/hexArt.ts`: `TERRAIN_ART` (default per terrain) and
  `HEX_ART_OVERRIDES` (per-hex). Drop images under `public/assets/` and point the map at them —
  no editor. Original starter tiles ship in `public/assets/terrain/`. `USE_HEX_ART=false` falls
  back to flat colors (`theme.ts`).
- **Under-cursor panel** ✅ `HoverPanel.tsx` (right sidebar, not a floating popup) — hovering a hex
  shows its terrain rules (additional AP to move in, DM, blocks-LOS, cover, from
  `data/terrainTypes.ts`) and the units in that hex rendered like the board but at **half size**
  (click a mini-counter to select). Hover state lives in the store (`hover`).
- **LOS visibility mode** ✅ **hold Shift** → `los.visibleHexesFrom` shades the hexes the *hovered*
  hex can see (green) and dims the rest; it updates as the cursor moves and disappears on release.
  The LOS topbar button is a click-to-pin alternative. Same engine fn backs fire-target highlighting.
- **Fire-odds popup** ✅ with a unit selected, hovering an enemy it can hit shows a popup with the
  hit % (and critical %) plus FP/DV detail (`ui/odds.ts` 2d6 math + `attackContext`).
- **Stacked units / selection** ✅ multiple units in a hex are fanned out with a `×N` badge.
  Clicking a friendly hex auto-selects the **unspent** unit; if several are unspent, `UnitPicker.tsx`
  asks which. **Ctrl+click** always opens the picker. Clicking the selected unit deselects it.
  (Hidden-unit concealment is a later module; all units are visible for now.)
- **Action chooser** ✅ when a clicked hex affords more than one action for the selected unit —
  e.g. **move INTO an enemy-occupied hex (§5.4)** vs fire at / close-combat the enemy there — an
  `ActionChooser.tsx` popup lets the player pick (move costs / hit % shown). A single option acts
  directly. This guarantees you can always choose to advance into an adjacent enemy hex.
- **Opportunity-action confirm** ✅ acting with a fresh, non-activated unit prompts `ConfirmDialog`
  warning the unit will be spent (store guards move/fire/rally/pivot via `isOpportunity`).
- **Turn banner** ✅ `TurnBanner.tsx` shows "Start of turn N" each new round; default requires an OK
  click, set `TURN_BANNER_AUTOFADE = true` to fade after 3s instead.
- **Clear AP + dice in log** ✅ the activated unit's remaining AP shows large in the track sheet and
  inspector; the log prints the actual 2d6 values for fires, rallies, and round initiative.
- **Animated clickable dice with sound** ✅ `DiceRoller.tsx` — click the dice; they tumble and
  settle on the **engine-provided** result (previewed from the seeded RNG, then committed). The
  animation never influences the result (§3.6).
- **Movement & fire SFX** ✅ `sound.ts` synthesizes audio (no asset files): `playMove` (infantry
  march vs vehicle rumble) and `playFire` (rifle / MG burst / cannon) chosen by `template.kind`;
  fired from the store on MOVE/FIRE. Mute toggle (🔊) in the topbar.

---

## 8. Milestone roadmap

- **M0 — Scaffold** ✅ this doc; Vite+React+TS, Vitest; `hex.ts`, `types.ts`, `rng.ts`.
- **M1 — Engine core (infantry)** ✅ terrain, movement/facing, LOS/arc, combat, hits, rally,
  range, CAP, turn/round flow, victory, `reduce`, `initGame`, `legalActions`. **39 tests pass,
  `npm run typecheck` clean.** Cards (§8) and shared activations/firegroups (§9) are deferred
  to later milestones — not yet implemented. **Single-target FIRE** for now (stacked-hex
  multi-resolution is M5 polish).
- **M2 — Firefight 1 content** ✅ `data/nations.ts`, `data/units.ts` (German + Soviet infantry,
  our own stats — see file header), original `data/maps/partisans.ts`, and
  `data/firefights/firefight1.ts` ("Partisans": 5×Germans attack west→east, 5×partisans hold the
  hamlet, 5 rounds, objectives 6,3=5VP & 3,3=3VP). Driver (`scripts/play.ts`) now runs FF1; the
  old `demoScenario.ts` is removed. **48 tests pass, typecheck clean.**
  **Key finding:** in the rulebook FF1 is the Section-1 teaching scenario, played *before* cards
  are introduced (Section 2), so **FF1 uses no cards**. The card subsystem (engine `cards.ts` +
  `PLAY_CARD` action + deck/draw in `turn.ts`/state) is therefore deferred to the **FF2 / cards
  milestone**, not M2. Unit counters in the PDF are graphics (not text-extractable), so stats are
  our own balanced approximations grounded in rulebook prose.
- **M3 — UI** ✅ Zustand store + React/SVG. Real pointy-top hex board (`Board.tsx`/`hexgeo.ts`)
  with terrain/roads/walls/objectives; counters (`UnitCounter.tsx`) show fire cost/move/FP/DR +
  facing + fresh/spent + hit badge; `Inspector.tsx` action menu with live AV/DV fire preview;
  per-side `TrackSheet.tsx`; **LOS overlay** (toggle in topbar → click a hex → visible green /
  blocked dimmed, via `visibleHexesFrom`); **animated clickable dice + synthesized sound**
  (`DiceRoller.tsx`/`sound.ts`) that visualizes the seeded-RNG result before committing; `Log.tsx`,
  `SetupScreen.tsx`, `VictoryScreen.tsx`. Move/fire via board clicks; Pass/Stall/Undo/Restart/Menu
  in the topbar; autosave to localStorage. **53 tests pass (incl. jsdom render), build clean.**
- **M3.1 — UX polish** ✅ per-hex artwork clipped into hexagons (`data/hexArt.ts` +
  `public/assets/terrain/`, replaceable); stacked units fanned + `×N` badge with **Ctrl+click**
  picker (`UnitPicker.tsx`); **movement/fire SFX** by unit kind (`sound.ts`, fired from the store);
  reducer-level suppressed/pinned tests; rulebook text cached at `reference/rulebook.txt`.
  (Its hover tooltip and Shift-toggle were superseded by M3.2.)
- **M3.2 — UX overhaul** ✅ hover info moved from a floating popup to the right-sidebar
  `HoverPanel` (terrain + half-size unit renders); **hold-Shift** LOS from the hovered hex (was a
  toggle); fire-odds popup on hovering targets (`ui/odds.ts`); click-selected-unit deselects;
  click auto-selects the unspent unit (picker if several); opportunity actions confirmed
  (`ConfirmDialog`); big AP readout (track sheet + inspector); dice values in the log (fire/rally/
  initiative); **"Start of turn N"** banner (`TurnBanner`, click-OK default / optional 3s fade).
  **58 tests pass, typecheck + build clean.**
- **M3.3 — Close combat (§5.4 / §7.7.3)** ✅ a unit sharing a hex with an enemy can attack it in
  CC (engine `closeCombatContext`/`rollCloseCombat`, `CLOSE_COMBAT` action): no arc/LOS/range, vs
  the target's **flank DR**, FP **+4** (or **−2** for white-box crew weapons — new
  `UnitTemplate.whiteBoxFp`, set on the MGs). You also may **not fire out** of a hex an enemy
  occupies. Surfaced in the `Inspector` (⚔ buttons) with dice flow + SFX. **62 tests pass.**
- **M3.4 — Rules-conformance audit** ✅ `scripts/conformance.ts` self-plays 3 full FF1 games
  (activate / opportunity / assault styles) + a pivot/stall probe, **independently re-deriving**
  each action's expected result from the rules+data tables (AV/DV front-flank/range/terrain/wall,
  crit, hit application, AP/CAP cost, rally #/mods, CC +4/−2 flank, turn flow, VP/destroy,
  can't-fire-out-of-enemy-hex, opportunity-spends-unit) and asserting the engine matches.
  **Found & fixed a real bug:** `legalActions` over-offered STALL when nothing was payable.
  Permanent invariant guard in `engine/__tests__/conformance.test.ts`. Open rulings (e.g. CC AP
  cost, victory scoring) recorded in `RULES-ASSUMPTIONS.md`. **69 tests pass, 0 audit violations.**
- **M4 — Persistence** ✅ `persistence.ts` named **save slots** (localStorage index +
  list/save/load/delete) + `isGameState` import guard; store gained a **redo** stack and
  `saveToSlot`/`loadFromSlot`/`deleteSlotByName`/`exportCurrent`/`importFromText`; `SavesDialog.tsx`
  (topbar **Saves**) does slot management + **JSON file export/import**; topbar **Undo/Redo**.
  Saves round-trip bit-for-bit (RNG travels with the state). **75 tests pass, build clean.**
- **M5 — Slice polish (NEXT):** stacking, firegroups, shared activations, group moves, edge cases,
  keyboard/a11y, layout. **Done = a full game of Firefight 1 is winnable.**
- **Later (additive):** M6 vehicles → M7 mortars/OBA/smoke → M8 hidden units → M9 fortifications
  /obstacles/mines/hills → **M10 online multiplayer** (host the existing pure engine
  authoritatively + WebSocket rooms; the client already speaks in action objects).

---

## 9. Technical risks (build with tests early)

1. **LOS geometry** (§6.0): center-to-center line; blocked if it crosses *any part* of a
   blocking hex; if it runs exactly along a hex edge, use the **least restrictive** hex. Encode
   the rulebook's Figure 7 cases as tests.
2. **Arc of fire / front-vs-flank** (§6.1, 7.3): facing sectors decide which DR is used. Get
   hex-direction math right; test all six facings.
3. **Turn/AP/CAP interleave** (§2.2, 3.0–3.2): AP actions can be interspersed with
   opportunity/command/card actions without spending the activated unit; "both pass
   consecutively = round ends." Model explicit turn types; test the rulebook's worked sequences.

---

## 10. Content & legal note

Author all stats/terrain/scenario data ourselves and render with original simple graphics.
Game **rules and stats** are facts/ideas (fine to implement); **do not copy** Academy Games'
artwork, map images, or counter art. Personal-use project.
