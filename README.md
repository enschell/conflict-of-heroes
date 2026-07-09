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
  Hasty Defenses, and §17.11/17.12 destroying one by Attack), and Flamethrowers + Pioneers §18 are
  all built. OBA (Battle/Weapon Cards) and hidden units are the only rules pieces left (see
  `CLAUDE.md` §8) — both need real per-client secret info, which is exactly what online play now
  makes possible (Mines follow the same always-visible rule for the same reason, today).
- **Stack:** Vite + React + TypeScript for the client; a small Node + WebSocket server (`server/`)
  for online play, serving the built client and relaying game Actions — see "Playing online."
  SVG hex board — **flat-top hexes** per `docs/hex_board_spec/README.md` (authoritative geometry/
  labels/multi-board spec; real board-edge half/quarter-hexes, `A01`-`S12` coordinate labels, a
  board-number cell, per-hex artwork). Pure-function rules engine with a seeded RNG (deterministic
  saves / undo / replay / online sync).
- **Save state:** localStorage autosave, **named save slots**, **JSON export/import**, and
  **undo/redo** (topbar "Saves" dialog). Saves round-trip exactly (the RNG travels with them).
- Extras: an **LOS visibility mode** (hold **Shift** to see what the hovered hex can/can't see),
  **animated, clickable dice with sound**, and a **Reinforcements panel** per side showing pending
  waves (units, entry condition, one-click Group entry once eligible, §4.12).

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
Run `npm run dev` and open http://localhost:5173. Select **Start Mission 1** — real terrain and
setup, re-authored onto the new flat-top board substrate (single board, real `A01`-`S12` labels) —
or one of the non-canonical test sandboxes — **Armor Sandbox** for vehicles, **Fire Support Sandbox**
for mortars/smoke, **Hills Sandbox** for elevation, **Obstacles Sandbox** for Barbed Wire/Mines/Road
Block, **Fortifications Sandbox** for Trenches/Bunkers/Hasty Defenses/Flamethrowers (incl. a German
Pioneers Squad and a Soviet T-34), or **Hex Board Demo** (the flat-top substrate's own proving
ground — a blank single board, or two boards abutted east-west to exercise the multi-board seam
merge) — then select one of the current side's units and:
- **Move / fire / close combat / load-unload onto a Vehicle** by clicking the board; if a hex
  offers more than one option (e.g. move *into* an enemy hex vs attack it), a chooser pops up.
- **Reinforcements** (left sidebar, per side): once a wave's Round arrives, click **Enter now** to
  bring it onto the Map as a single Group Action.
- **Hold Shift** to preview line-of-sight from the hex under the cursor.
- **Ctrl+click** a stacked hex to pick a specific unit. **Group mode** (topbar) lets you multi-select
  Fresh units for a Group Move/Attack/Rally — Group Move offers both a quick formation-shift (six
  direction arrows, everyone steps together) and "Move individually" (choose each member's own
  destination Hex in turn, including splitting a stack across different Hexes, §10.2/§10.3).
- The right sidebar shows the selected unit's actions (with hit-% previews), the terrain/units
  under the cursor, and the event log; the top bar has Pass / Stall / Undo / Redo / LOS / Group /
  mute / restart.

`npm run play` / `npm run demo` drive the same engine through a **text** board in the terminal
(a debug convenience — the real visual model is the SVG board).

## Playing online (M13)
Run `npm run server` (starts the WebSocket/HTTP server on port 8787) alongside `npm run dev`. In dev
mode the client (5173) and server (8787) are different origins, so set `VITE_WS_URL=ws://localhost:8787`
in a `.env.local` file first (production serves both from one origin automatically — no env var
needed there). Then, from the start screen's **Play Online** card: one player clicks **Create Online
Game** to get a shareable room code, the other enters it under **Join Game**. No accounts. Undo/Redo
are disabled online (the server is the single source of truth); everything else plays the same as
hotseat. This is a **functional-minimum placeholder UI** for now (see `CLAUDE.md` §8's M13 entry) —
deploying it (Render) and a real visual design are the next steps, not yet done.

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
placement) ✅ · M7 Mortars + Smoke ✅ (OBA deferred pending Cards) · M9 Hills/Elevation §12 ✅
(move cost, elevation-aware LOS, Elevation Combat Bonus, Hills Sandbox test mission) ·
M10 Fortifications and Obstacles §17 ✅ (Phase 1: Barbed Wire, Mines — always visible, Road Block;
Phase 2: Trenches, Bunkers, Hasty Defenses, §17.11/17.12 destroying one by Attack; Fortifications
Sandbox test mission) · M11 Flamethrowers + Pioneers §18 ✅ (Flamethrower attack profile on Fire/Close
Combat, Pioneer Mines-immunity + Range-1 Fire Smoke) · **Hex board migration** ✅ (pointy-top →
flat-top, `docs/hex_board_spec/README.md`; real board-edge half/quarter-hexes, `A01`-`S12` labels,
board number, multi-board seam merging; Mission 1 and all five non-canonical sandboxes fully
re-authored onto it — rotation not yet built, deferred until a mission needs it) — see `CLAUDE.md` §B
· **M13 Online Multiplayer ✅ steps 1-3** (deliberately built ahead of M12/Cards — Cards need real
per-client secret info that only online play provides; Node + WebSocket server, room codes, hotseat
completely untouched, functional-minimum UI) — see `CLAUDE.md` §8's M13 entry; next: deploy to
Render + a real visual design (M13 steps 4-5) → M12 cards (incl. OBA) → M8 hidden units.
See `CLAUDE.md` §8 for the full milestone roadmap.

A **rules-conformance audit** (`npm run conformance`) self-plays several full games and re-derives
every move against the rules (0 violations).
