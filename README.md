# Conflict of Heroes — Awakening the Bear (browser edition)

A personal, browser-based implementation of the Academy Games tactical wargame
*Conflict of Heroes: Awakening the Bear*, built to the **3rd edition (v3)** rules.

## What it is
- **Hotseat first** (pass-and-play in one browser), engine kept network-agnostic so online
  rooms can be added later.
- **Vertical slice: infantry + vehicles**, **Mission 1 ("Partisans")** playable end-to-end —
  Spent Die/Check, Fresh/Spent + Stress, CAPs, AR/DR combat, Group Actions (incl. Group Close
  Combat), vehicle movement/combat/transport, and all of Special Units §16 (Turreted, Self-Propelled
  Guns, Mobile Vehicles, Open-Topped, APCs, Trucks/Wagons, Field Guns), and Mortars + Smoke are all
  built. OBA, hidden units, hills, and fortifications come later (see `CLAUDE.md` §8) — Hidden Units
  specifically is deferred to online play, not hotseat.
- **Stack:** Vite + React + TypeScript, client-only. SVG hex board (real pointy-top hexes with
  per-hex artwork). Pure-function rules engine with a seeded RNG (deterministic saves / undo /
  replay).
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
```
> Windows note: if `npm` isn't found, Node is at `C:\Program Files\nodejs`. In PowerShell:
> `$env:Path = "C:\Program Files\nodejs;" + $env:Path` (Git Bash doesn't have it on PATH).

## Playing
Run `npm run dev` and open http://localhost:5173. Select **Start Mission 1** (or the non-canonical
**Armor Sandbox** to try vehicles), then select one of the current side's units and:
- **Move / fire / close combat / load-unload onto a Vehicle** by clicking the board; if a hex
  offers more than one option (e.g. move *into* an enemy hex vs attack it), a chooser pops up.
- **Reinforcements** (left sidebar, per side): once a wave's Round arrives, click **Enter now** to
  bring it onto the Map as a single Group Action.
- **Hold Shift** to preview line-of-sight from the hex under the cursor.
- **Ctrl+click** a stacked hex to pick a specific unit. **Group mode** (topbar) lets you multi-select
  Fresh units for a Group Move/Attack/Rally.
- The right sidebar shows the selected unit's actions (with hit-% previews), the terrain/units
  under the cursor, and the event log; the top bar has Pass / Stall / Undo / Redo / LOS / Group /
  mute / restart.

`npm run play` / `npm run demo` drive the same engine through a **text** board in the terminal
(a debug convenience — the real visual model is the SVG board).

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
placement) ✅ · M7 Mortars + Smoke ✅ (OBA deferred pending Cards) ·
next: M9 hills → M10 fortifications → M11 flamethrowers → M12 cards →
M13 online multiplayer → M8 hidden units (deferred to online play). See `CLAUDE.md` §8 for the
full milestone roadmap.

A **rules-conformance audit** (`npm run conformance`) self-plays several full games and re-derives
every move against the rules (0 violations).
