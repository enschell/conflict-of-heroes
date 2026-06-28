# Conflict of Heroes — Awakening the Bear (browser edition)

A personal, browser-based implementation of the Academy Games tactical wargame
*Conflict of Heroes: Awakening the Bear* (2nd ed.).

## What it is
- **Hotseat first** (pass-and-play in one browser), engine kept network-agnostic so online
  rooms can be added later.
- **Vertical slice:** infantry-only game of **Firefight 1 ("Partisans")**, playable
  end-to-end. Vehicles, artillery, smoke, hidden units, and fortifications come later.
- **Stack:** Vite + React + TypeScript, client-only. SVG hex board (real pointy-top hexes with
  per-hex artwork). Pure-function rules engine with a seeded RNG (deterministic saves / undo /
  replay).
- **Save state:** localStorage autosave, **named save slots**, **JSON export/import**, and
  **undo/redo** (topbar "Saves" dialog). Saves round-trip exactly (the RNG travels with them).
- Two requested extras, both built: an **LOS visibility mode** (hold **Shift** to see what the
  hovered hex can/can't see) and **animated, clickable dice with sound**.

## Content & legal
We author all stats/terrain/scenario **data** ourselves and use **original simple graphics**.
We do **not** copy Academy Games' artwork, maps, or counters. Personal use only.

## Getting started
```bash
npm install
npm run dev          # Vite dev server — the actual game (http://localhost:5173)
npm test             # unit tests (Vitest) — 78 passing
npm run build        # typecheck + production build
npm run conformance  # self-play games and audit every move against the rules
npm run demo         # optional: auto-play a full game in the terminal (text board)
npm run play         # optional: interactive hotseat in the terminal (text board)
```
> Windows note: if `npm` isn't found, Node is at `C:\Program Files\nodejs`. In PowerShell:
> `$env:Path = "C:\Program Files\nodejs;" + $env:Path` (Git Bash doesn't have it on PATH).

## Playing
Run `npm run dev` and open http://localhost:5173. Select one of the current side's units, then:
- **Move / fire / close combat** by clicking the board; if a hex offers more than one option
  (e.g. move *into* an enemy hex vs attack it), a chooser pops up.
- **Hold Shift** to preview line-of-sight from the hex under the cursor.
- **Ctrl+click** a stacked hex to pick a specific unit.
- The right sidebar shows the selected unit's actions (with hit-% previews), the terrain/units
  under the cursor, and the event log; the top bar has Pass / Stall / Undo / LOS / mute / restart.

`npm run play` / `npm run demo` drive the same engine through a **text** board in the terminal
(a debug convenience — the real visual model is the SVG board).

## Where to look
- **`CLAUDE.md`** — architecture, engine golden rules, directory map, rulebook section index,
  conventions, and the milestone roadmap. Read this first.
- **Build plan** — `C:\Users\ensch\.claude\plans\here-is-a-ruleset-sprightly-piglet.md`
  (the full approved plan this project follows).

## Roadmap (summary)
M0 scaffold ✅ · M1 engine core (infantry) ✅ · M2 Firefight 1 content ✅ · M3 UI ✅
(SVG board + counters, track sheets, action menu, **LOS overlay**, **animated dice + sound**,
per-hex art, hover info, close combat) · M4 persistence ✅ (named save slots, JSON export/import,
undo/redo) · **M5 polish (in progress)** — stacking/firegroups/shared activations (done = FF1
winnable); **M5.1 stacked fire** ✅ (one shot resolves every enemy in a hex, §7.5.1) ·
then vehicles → artillery/smoke → hidden units → fortifications → online multiplayer.
A **rules-conformance audit** (`npm run conformance`) self-plays games and checks every move
against the rules (0 violations); open rulings are in `RULES-ASSUMPTIONS.md`.
**78 tests passing; typecheck + build clean.**
