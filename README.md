# Conflict of Heroes — Awakening the Bear (browser edition)

A personal, browser-based implementation of the Academy Games tactical wargame
*Conflict of Heroes: Awakening the Bear*, built to the **3rd edition (v3)** rules.

## What it is
- **Hotseat** (pass-and-play in one browser) **and online** (a real friend, over the internet) are
  both first-class — see "Playing online" below. The engine was kept network-agnostic from day one
  specifically so online play could be added with **zero engine changes**, and that bet paid off.
- **Vertical slice: infantry + vehicles**, **Mission 1 ("Partisans")** playable end-to-end —
  Spent Die/Check, Fresh/Spent + Stress, CAPs, AR/DR combat, Group Actions (incl. Group Close
  Combat), vehicle movement/combat/transport, all of Special Units §16 (Turreted, Self-Propelled
  Guns, Mobile Vehicles, Open-Topped, APCs, Trucks/Wagons, Field Guns), Mortars + Smoke,
  Hills/Elevation §12 (move cost, elevation-aware LOS incl. Plateau Effect/Blind Spots, Elevation
  Combat Bonus), Fortifications and Obstacles §17 (Barbed Wire, Mines, Road Block, Trenches, Bunkers,
  Hasty Defenses, and §17.11/17.12 destroying one by Attack), Flamethrowers + Pioneers §18,
  **Hidden Units §11** (reveal triggers, Hidden Move, Recon by Fire — a render-layer-only mechanism
  for hotseat, devtools-defeatable and accepted as such), and **Battle/Weapon/Veteran Cards §8 +
  Off-Board Artillery §13.4-13.9** (deck construction/draw/discard, Green/Blue cost-paying,
  Mission-card auto-resolve, real OBA Drift Check + blast resolution — framework-only card effects,
  a card's own bespoke rules text isn't mechanically simulated yet, only its shared mechanics) are
  all built. **Every v3 rules module is now built** (see `CLAUDE.md` §8) — Mines stay always-visible
  on purpose, same anti-hide rationale Hidden Units itself uses.
- **In-app authoring tools, no hand-written data files needed:** a **Mission Editor** (map picker,
  Starting Forces incl. a Pre-Mission Setup Pool, Reinforcement waves, Victory Conditions, Hidden
  flags/Mines) and a separate **Map Editor** (paint real terrain/roads/elevation, terrain art
  variants, an optional gameplay-art overlay image) — both export real, self-contained TypeScript
  source files. Multi-board Missions can be independently rotated (0°/90°/-90°/180°) and abutted.
- **Stack:** Vite + React + TypeScript for the client; a small Node + WebSocket server (`server/`)
  for online play, serving the built client and relaying game Actions — see "Playing online."
  SVG hex board — **flat-top hexes** per `docs/hex_board_spec/README.md` (authoritative geometry/
  labels/multi-board spec; real board-edge half/quarter-hexes, `A01`-`S12` coordinate labels, a
  board-number cell, per-hex artwork). Pure-function rules engine with a seeded RNG (deterministic
  saves / undo / replay / online sync).
- **Save state:** localStorage autosave, **named save slots**, **JSON export/import**, and
  **undo/redo** (topbar "Saves" dialog). Saves round-trip exactly (the RNG travels with them).
- Extras: an **LOS visibility mode** (hold **Shift** to see what the hovered hex can/can't see),
  **animated, clickable dice with sound**, a **Reinforcements panel** per side showing pending
  waves (units, entry condition, one-click Group entry once eligible, §4.12, with a live preview
  counter the instant you pick an entry Hex), **mouse-wheel zoom** centered on the cursor, and a
  **Turn flash** (large text over the board announcing whose Turn it is, fading after 4s — waits
  out any open free facing-correction window first, so it never flashes while you still have a
  pivot pending from your last Move).

## Content & legal
We author all stats/terrain/scenario **data** ourselves and use **original simple graphics**.
We do **not** copy Academy Games' artwork, maps, or counters. Personal use only.

## Getting started
```bash
npm install
npm run dev          # Vite dev server — the actual game (http://localhost:5173)
npm test             # unit tests (Vitest)
npm run build        # typecheck + production build
npm run conformance  # self-play games and audit every move against the v3 rules
npm run demo         # optional: auto-play a full game in the terminal (text board)
npm run play         # optional: interactive hotseat in the terminal (text board)
npm run server       # M13: the online-play server (WebSocket relay + serves dist/), default :8787
```
> Windows note: if `npm` isn't found, Node is at `C:\Program Files\nodejs`. In PowerShell:
> `$env:Path = "C:\Program Files\nodejs;" + $env:Path` (Git Bash doesn't have it on PATH).

## Playing
Run `npm run dev` and open http://localhost:5173. The start screen is a three-panel menu: **Tests**
(non-canonical sandbox/demo missions, click to start immediately), **Missions** (the real,
hand-authored Missions — currently **Mission 1 "Partisans"**, **SoS Mission 4**, and **AtB Firefight
9**; clicking one just selects it and shows its situation/map/forces at right), and a **Play** card
underneath with **Local Hotseat** (starts the selected Mission) or **Play Online** (see below). The
sandboxes cover one mechanic each: **Armor Sandbox** (vehicles), **Fire Support Sandbox**
(mortars/smoke), **Hills Sandbox** (elevation), **Obstacles Sandbox** (Barbed Wire/Mines/Road Block),
**Fortifications Sandbox** (Trenches/Bunkers/Hasty Defenses/Flamethrowers), **Setup Phase Sandbox**
(the Pre-Mission Setup Pool), **Hidden Units Sandbox** (§11), **Cards Sandbox** (§8/§13.4-13.9 —
one of each card category/type, incl. an Artillery Card to plan/resolve an OBA Strike), and **Hex
Board Demo** (the flat-top substrate's own proving ground — a blank single board, or two boards
abutted east-west). Select one of the current side's units and:
- **Move / fire / close combat / load-unload onto a Vehicle / Hidden Move / Recon by Fire** by
  clicking the board; if a hex offers more than one option (e.g. move *into* an enemy hex vs attack
  it), a chooser pops up.
- **Cards** (left sidebar, per side, once a Mission has a `cardConfig`): a plain-text hand list —
  "Play" a card (selects a Unit first for a Green-cost one), or "Target…" an Artillery Card, then
  click any Hex to plan an OBA Strike (resolves automatically one Round later).
- **Reinforcements** (left sidebar, per side): once a wave's Round arrives, click **Enter now** to
  bring it onto the Map as a single Group Action.
- **Pre-Mission Setup** (Missions authored with a Setup Pool): before Round 1, each side in turn
  places its pool of Units onto any empty Hex, then real play begins.
- **Hold Shift** to preview line-of-sight from the hex under the cursor.
- **Ctrl+click** a stacked hex to pick a specific unit. **Group mode** (topbar) lets you multi-select
  Fresh units for a Group Move/Attack/Rally — Group Move offers both a quick formation-shift (six
  direction arrows, everyone steps together) and "Move individually" (choose each member's own
  destination Hex in turn, including splitting a stack across different Hexes, §10.2/§10.3).
- The right sidebar shows the selected unit's actions (with hit-% previews), the terrain/units
  under the cursor, and the event log; the top bar has Pass / Stall / Undo / Redo / LOS / Group /
  mute / restart.

**Authoring your own content** — from the start screen: the **Mission Editor** (map picker, Starting
Forces incl. a Setup Pool and Hidden/Mines placement, Reinforcement waves incl. Hidden units, Victory
Conditions, board rotation) and the **Map Editor** (paint terrain/roads/elevation, terrain art
variants, an optional gameplay-art overlay image) both export real, self-contained TypeScript source
files ready to drop into `src/data/`.

`npm run play` / `npm run demo` drive the same engine through a **text** board in the terminal
(a debug convenience — the real visual model is the SVG board).

## Playing online (M13)
**Deployed and live on Render** (Blueprint import from `render.yaml`, `v3-migration` branch — one
Node service serves the built client and relays game Actions over WebSocket on the same port). From
the start screen's **Play Online** card: one player clicks **Create Online Game** to get a shareable
room code, the other enters it under **Join Game**. No accounts. Undo/Redo are disabled online (the
server is the single source of truth); everything else plays the same as hotseat. This is still a
**functional-minimum placeholder UI** (see `CLAUDE.md` §8's M13 entry) — a real visual design and
opponent-approved Undo are the next steps, not yet done.

To run it locally instead: `npm run server` (starts the WebSocket/HTTP server on port 8787)
alongside `npm run dev`. In dev mode the client (5173) and server (8787) are different origins, so
set `VITE_WS_URL=ws://localhost:8787` in a `.env.local` file first (production serves both from one
origin automatically — no env var needed there, and that's exactly how the Render deployment runs
it: `npm start`, one origin, `PORT` read from the environment).

## Where to look
- **`CLAUDE.md`** — architecture, engine golden rules, directory map, rulebook section index,
  conventions, and the milestone roadmap. Read this first, every session.
- **`rules/`** — the committed, section-by-section v3 rulebook reference (source of truth for
  mechanics; cite section numbers `N.M` in code/commits).
- **Build plan** — `C:\Users\ensch\.claude\plans\here-is-a-ruleset-sprightly-piglet.md`
  (the original approved plan this project started from).

## Roadmap (summary)
v3 cutover (Spent Die/Check, Fresh/Spent + Stress, CAP floor 3, AR/DR combat, v3 initiative,
no-tie VP) ✅ · M5 Group Actions incl. Group Close Combat ✅ · M6 Vehicles + all of Special Units §16
✅ (movement, combat specifics, Transport/Towing, Turreted/SPG/Mobile-Vehicles/Open-Topped/APC/
Trucks-Wagons/Field-Guns) · Mission 1 reinforcements (§4.12, map-edge/Group entry, manual per-hex
placement) ✅ · M7 Mortars + Smoke ✅ · M9 Hills/Elevation §12 ✅
(move cost, elevation-aware LOS, Elevation Combat Bonus, Hills Sandbox test mission) ·
M10 Fortifications and Obstacles §17 ✅ (Phase 1: Barbed Wire, Mines — always visible, Road Block;
Phase 2: Trenches, Bunkers, Hasty Defenses, §17.11/17.12 destroying one by Attack; Fortifications
Sandbox test mission) · M11 Flamethrowers + Pioneers §18 ✅ (Flamethrower attack profile on Fire/Close
Combat, Pioneer Mines-immunity + Range-1 Fire Smoke) · **M8 Hidden Units §11** ✅ (built on explicit
user request, reversing the earlier online-only deferral — reveal triggers, Hidden Move, Recon by
Fire; render-layer-only for hotseat, devtools-defeatable and accepted as such; Hidden Units Sandbox
test mission) — see `CLAUDE.md` §F · **Hex board migration** ✅ (pointy-top → flat-top,
`docs/hex_board_spec/README.md`; real board-edge half/quarter-hexes, `A01`-`S12` labels, board
number, multi-board seam merging, **per-board 0°/90°/-90°/180° rotation with multi-board
abutment**; every mission/sandbox re-authored onto it) — see `CLAUDE.md` §B · **Mission Editor** ✅
and **Map Editor** ✅ (in-app authoring, no more hand-written data files — map picker/terrain
painting, Starting Forces incl. Pre-Mission Setup Pool, Reinforcements, Victory Conditions, real
TypeScript export/reload) — see `CLAUDE.md` §C/§D · **Pre-Mission Setup phase** ✅ (Mission-
configurable pool placement before Round 1) — see `CLAUDE.md` §E · **M13 Online Multiplayer ✅ steps
1-4** (Node + WebSocket server, room codes, hotseat completely untouched, functional-minimum UI,
**deployed and live on Render**) — see `CLAUDE.md` §8's M13 entry · **M12 Battle/Weapon/Veteran
Cards §8 + Off-Board Artillery §13.4-13.9** ✅ (shipped after M13 steps 1-4, on user request — real
deck/draw/discard/cost-paying mechanics + real OBA Drift/blast resolution, framework-only per-card
bespoke effects, a minimal plain-text live hand panel; Cards Sandbox test mission) — see
`CLAUDE.md` §G. **Every v3 rules module is now built** — the only work left in the whole
v3/M-numbered roadmap is M13's own follow-ups: a real visual design + opponent-approved Undo.
See `CLAUDE.md` §8 for the full milestone roadmap.

A **rules-conformance audit** (`npm run conformance`) self-plays several full games and re-derives
every move against the rules (0 violations).
