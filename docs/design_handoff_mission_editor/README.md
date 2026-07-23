# Handoff: Mission / Scenario Editor (WWII tactical hex wargame)

## Overview
An internal tool the game's designer uses to author a single **mission** for a browser-based
WWII tactical hex wargame (squad/vehicle counters, two opposing sides, hex board). The designer
fills in mission data across six sections (Mission Info, Map, Starting Forces, Reinforcements,
Victory Conditions, Advanced/Future) and exports it as a JSON file the game engine will load.
This tool is **authoring UI only** — it does not run the game.

## About the Design Files
The files in this bundle are a **design reference built in HTML** (a "Design Component" — a
self-contained prototype using inline React-style state, not a framework scaffold). It is
**not production code to copy directly**. The task is to **recreate this design in the target
codebase's actual environment** (React, Vue, whatever the game engine's tooling stack is) using
that project's established patterns, real data sources, and persistence layer. If no editor
tooling stack exists yet, choose the most appropriate one.

- `Mission Editor.dc.html` — the interactive prototype. Needs its sibling `support.js` to render;
  open directly in a browser. All behavior described below is implemented and clickable in this
  file — read `renderVals()` and the methods above it for the exact logic if code-level precision
  is needed.
- `support.js` — preview runtime only. **Not needed** in the target codebase.
- `board-geometry-reference/` — a **companion handoff** (produced earlier, for the same project)
  specifying the *real* hex board's geometry, coordinate labeling, and multi-board abutment rules.
  The Mission Editor's Map / Starting Forces / Reinforcements screens currently render a
  **simplified placeholder grid** (see "Known gaps" below) — swap in the real board component
  built from that spec once it exists, and rewire the click handlers documented here onto it.

## Fidelity
- **Mission Info, Reinforcements, Victory Conditions, Advanced/Future forms: high-fidelity.**
  Colors, type, spacing, and copy are final; recreate pixel-for-pixel with the codebase's real
  form components.
- **Map / Starting Forces / Reinforcements hex grid: low-fidelity placeholder.** It's a simplified
  10×8 flat-top hex grid with no half-hex edges or multi-board abutment — it exists only to
  demonstrate the *interaction pattern* (click a hex to paint/place/select). The real board (see
  `board-geometry-reference/`) must replace it.
- Visual direction ("Field Manual": dark olive/khaki, all-monospace, stencilled uppercase labels,
  sharp corners) is a deliberate final choice, not a placeholder.

---

## Screens / Sections

The app is a single page: a persistent **left sidebar nav** (224px, fixed) + a **main content
pane** with a sticky top bar. Switching sections is pure client state (no routing needed unless
the target app wants deep-linkable URLs per section — recommended: `?section=map` etc.).

### Global chrome
- **Sidebar** (`background:#15170f`, right border `#3a3d2e`): app label "MISSION EDITOR" (11px,
  bold, uppercase, tracked 0.14em, color `#c9a04a`), current mission title (13px, 600,
  `#e5e0c9`, single line ellipsis), status caption "[ draft // unsaved ]" (10px, `#6e6c56`).
  Below: 6 nav rows, one per section, numbered `01 ·` … `06 ·`. Active row: background
  `#262918`, left border 2px `#c9a04a`, text `#eee0bb` bold. Inactive: transparent, left border
  2px transparent, text `#a09c81`. The 6th row ("Advanced") is always dimmer (`#5c5a48` even
  when active-inactive) and carries a small "SOON" badge (`background:#2a2c20; color:#8b8871;
  font-size:9px; padding:2px 6px`) pinned to the row's right edge.
- **Top bar** (`background:#1f2116`, bottom border `#3a3d2e`, sticky): left — "// SECTION: {name}"
  label (11px, uppercase, tracked 0.12em, `#8b8871`, bold). Right — **Export Mission** button,
  always visible regardless of section (`background:#c9a04a; color:#1b1d16; bold; uppercase;
  tracked 0.08em; no border-radius`).

### 1. Mission Info
- **Title**: single-line text input, large (17px bold, `#eee0bb`).
- **General Situation**: multiline textarea (12.5px, line-height 1.65, `#c7c2a5`, min-height 90px).
- **Two side cards side-by-side** (CSS grid, 1fr 1fr, gap 20px). Side A tokens: swatch/accent
  `#8a9a8a`, chip bg `#262918`, chip border `#48513f`. Side B tokens: swatch/accent `#b4553c`,
  chip bg `#2a2018`, chip border `#533d33`. Each card, top to bottom:
  - Header row: color swatch (12×12 solid square) + "SIDE A"/"SIDE B" (13px bold) + an
    "INITIATIVE R1" badge shown **only** on whichever side currently holds Round-1 initiative.
  - **CAPs and VP fields are small and sit near the top of the card** (per explicit design
    direction — not a big editing area): two compact side-by-side boxes, each a label
    ("CAPs"/"VP", 9.5px uppercase muted) + a borderless number input right-aligned in accent
    gold, 15px bold monospace.
  - **Nation(s)**: chips (side-tinted bg/border) each with an inline "×" remove; a trailing
    `<select>` styled as a dashed-border "+ ADD NATION" control whose options are every nation
    from the master list **not already added to this side**. Selecting one appends it to that
    side's `nations` array. A side can hold multiple nations (e.g. "Allies" = US + UK).
  - **Side Orders**: single-line text input (short).
  - **Mission Instructions**: multiline textarea (longer).
- **Bottom row**: Rounds Total (single number, 26px bold) in a small card, and Initiative picker
  (two toggle "buttons", Side A / Side B — single choice, Round 1 only, not per-round) in a
  wider card. The chosen side's card gets `background:#262918 / #2a2018` + accent border + a
  filled 8px dot; the other stays outlined/empty.

### 2. Map
- Top row: a **map picker** `<select>` — "choose an existing map" (this editor does **not**
  build/paint terrain; terrain maps are authored in a separate map-building tool and just
  referenced here by id/name) — plus an italic caption: "Preview simplified — the real board
  renders here at runtime."
- Below: a two-column layout. **Left (flex 1)**: the hex grid in an SVG, framed in a bordered
  panel. **Right (270px fixed)**: a tool rail —
  - **Paint Tool**: 6 stacked buttons — Barbed Wire, Mines, Road Block (obstacles), Trench,
    Bunker (fortifications), Clear/Erase. Selected tool: gold border + tinted background.
  - **Owning Side** toggle (Side A / Side B) — appears **only** when an obstacle tool
    (wire/mines/roadblock) is selected, since obstacles need an owning side.
  - **Bunker Facing** `<select>` (6 options) — appears **only** when the Bunker tool is
    selected.
  - **Placed (N)** list: every obstacle/fortification currently on the map, one row each
    ("{hex} — {type} (Side {X})" or "{hex} — {type} facing {dir}"), each with a remove "×".
  - Clicking a hex applies the currently-selected tool at that hex (obstacle→sets
    `{type, side}`; fortification→sets `{type, facing}`; Clear→removes both). One
    obstacle-or-fortification per hex in this prototype (placing a new one replaces the old).
  - Hex badges: a small filled circle + 4–6 char abbreviation (e.g. "WIRE", "BNKR E") in the
    obstacle's/fortification's side color (or gold for fortifications).

### 3. Starting Forces
- **Left column (300px)**: unit catalog picker — search input, nation filter `<select>`
  (All / Germans / Soviets / Americans), then a scrolling list of catalog cards. Each card:
  unit name (bold) + nation (small caps), then a stat line
  `FP {red}[/{blue}]  ·  DR {front}/{flank}  ·  MV {move}  ·  RNG {range}  ·  VP {vp}`.
  A colored left border (3px) keys the card to its nation. **Clicking a card "arms" it**
  (highlighted with a tinted background) — this is a **picker into an existing catalog**, not a
  stat-authoring form.
  - Below the list: a **Placement** panel — a status line ("Armed: {unit} — click a hex to
    place" / "Click a unit above to arm it"), a Side A/Side B toggle, and a Facing `<select>`
    (6 directions: E, SE, SW, W, NW, NE — flat-top hex neighbor directions).
- **Right (flex 1)**: the hex grid. Clicking a hex (while a unit is armed) places an instance of
  the armed unit there with the currently chosen side + facing. Occupied hexes show a badge
  (3-letter unit abbreviation, "+N" if stacked, colored by side).
- **Below, full width**: a table of all placed starting units — Side / Unit / Hex / Facing
  (facing is editable inline via a `<select>`) / remove.

### 4. Reinforcements
- Top: **Side A / Side B tab toggle** — everything below scopes to the active side.
- A list of **wave cards**, one per wave belonging to the active side. Collapsed, each card
  shows: wave name (bold), a summary line ("Enters round {N}+ · {n} entry hex(es) · {n} unit(s)"),
  and Edit / Remove buttons.
- **Expanded** (click Edit), a card reveals:
  - Name/ID (text) and Earliest Round (number) side-by-side.
  - Entry Description (free text, e.g. "Road hex R07").
  - **Entry Hexes**: the same hex-grid pattern, but in **multi-select toggle mode** — click any
    hex to add/remove it from this wave's entry-hex set (highlighted gold). Selected hexes are
    also echoed as a plain comma-separated label under the grid. ⚠️ see "Known gaps" — this does
    not yet support "select a contiguous stretch of a board edge" as a single drag gesture.
  - **Add Units** panel: identical search/filter/card list to Starting Forces, but each catalog
    card has an inline **"+ Add"** button (no arm/place-on-hex step — reinforcement units are a
    roster, not hex-placed, since they collectively enter through the wave's entry hexes) plus a
    shared **Facing** `<select>` above the list that applies to whichever card's "+Add" is
    clicked next.
  - **In this wave (N)**: the resulting roster, each row "{unit} — facing {dir}" with a remove.
- **"+ Add Wave — Side {X}"** button at the bottom creates a new wave for the active side and
  auto-expands it.

### 5. Victory Conditions
- Two small cards at the top: **"VP per enemy unit destroyed"**, one per side, each a single
  number input. Caption below: "Leave 0 to fall back to each unit's own printed VP value."
  (VP sources are independently configurable per side, per the spec — Side A and Side B can
  each define completely separate scoring.)
- **Add-row** (dashed border): Hex text input (free text, e.g. "H07") + VP number + Initial
  Control `<select>` (Neutral / Side A / Side B) + "+ Add Victory Hex" button.
- **List of victory hexes**, one row per entry: hex (large, gold), VP (number input), Initial
  Control (select), a "Same every round" / "Varies per round ✓" toggle button, and remove. When
  toggled to "varies," a nested panel appears below with per-round override rows (Round number +
  VP number + remove) and an "+ Add round override" button — any round without an explicit
  override falls back to the hex's base VP value.

### 6. Advanced / Future
- A persistent **warning banner** at the very top of the section:
  "⚠ Coming later — not yet functional in the game engine"
  (`background:#2a2410; border:1px solid #55491f; color:#d8b25c`). The whole section is built as
  full, real form UI — not a wireframe — per the design direction, but every control here is
  inert from the game engine's point of view until it's implemented there.
- **Battle Cards**: two side-by-side cards (Side A / Side B), each with "Round 1 draw" and "Each
  round after" number fields.
- **Hidden Units**: an auto-generated checklist combining every currently placed Starting Forces
  unit *and* every unit across all Reinforcement waves (both sides), each with a "hidden at
  setup" checkbox. Empty state: "No placed or reinforcement units yet."
- **Off-Board Artillery (OBA)**: a row of checkboxes, one per round from 1 to Rounds Total (from
  Mission Info), for "rounds OBA may be used at all." Below, a **Planned Strikes** list — each
  strike has a single editable "Planned round" number, and a **read-only, clearly-separate**
  "→ resolves round {planned+1}" — these are always two distinct round numbers, never one shared
  value. "+ Add strike" appends a new one.
- **Air Support**: two small cards (Side A / Side B), each a single "round" number input,
  captioned "(provisional)" in italic — deliberately the lightest-weight control on the page,
  since the concept isn't fully defined yet.
- **Map Table**: a list of {map, rotation} rows — pick a map from the same library used in the
  Map section, and a rotation (No rotation / 90° right / 90° left). "+ Add map to table" appends
  a row (for abutting multiple boards). Below, a set of **terrain overlay** checkboxes (mock
  options: Mud Season, Winter Snow, Night) that would layer onto the base map(s).

---

## Interactions & Behavior summary
- All navigation is client-side state (`section` key) — no page reloads.
- Every form control is a **controlled input** wired directly to state; there is no "Save"
  step — edits apply immediately (the "[ draft // unsaved ]" caption in the sidebar is
  presentational only in this prototype; wire it to real dirty-tracking in the target app).
- **Export Mission** (top bar, always visible) serializes the entire authored state to a single
  JSON object and triggers a browser download named `<slugified-title>.json`. Shape:
  ```json
  {
    "meta": { "exportedAt": "ISO-8601 string", "version": "0.1" },
    "missionInfo": {
      "title": "string", "situation": "string",
      "sideA": { "nations": ["string"], "orders": "string", "instructions": "string", "caps": 0, "vp": 0 },
      "sideB": { "...same shape..." },
      "roundsTotal": 0, "initiative": "A | B"
    },
    "map": { "mapId": "string", "obstacles": { "<hexKey>": { "type": "wire|mines|roadblock", "side": "A|B" } }, "fortifications": { "<hexKey>": { "type": "trench|bunker", "facing": "0-5 | null" } } },
    "startingForces": [ { "id": "string", "side": "A|B", "unitId": "string", "hex": "string", "facing": 0 } ],
    "reinforcements": { "A": [ { "id", "name", "earliestRound", "description", "entryHexes": ["string"], "units": [ { "unitId", "facing" } ] } ], "B": [ "...same shape..." ] },
    "victoryConditions": { "hexes": [ { "id", "hex", "vp", "control": "neutral|A|B", "overrides": [ { "round", "vp" } ] } ], "vpPerKillA": 0, "vpPerKillB": 0 },
    "advanced": { "battleCards": { "A": {"r1","after"}, "B": {"..."} }, "hiddenIds": ["string"], "obaRounds": [0], "obaStrikes": [ { "id", "planned" } ], "airSupport": { "A", "B" }, "mapTable": [ { "id", "mapId", "rotation" } ], "overlays": ["string"] }
  }
  ```
  Facing is stored as an integer index 0–5 into `["E","SE","SW","W","NW","NE"]` (flat-top hex
  neighbor directions). `hexKey` is the coordinate label string (e.g. `"H07"`).

## State Management
The prototype keeps one flat state tree (see `state = {...}` at the top of the logic class in
`Mission Editor.dc.html`): `section`, `info`, `map`, `forces`, `reinforcements`, `victory`,
`advanced`. Each top-level setter (`setInfo`, `setMap`, `setForces`, `setReinf`, `setVictory`,
`setAdvanced`) shallow-merges a patch; nested collections (obstacles/fortifications by hex key,
placed-units array, waves-by-side array, victory-hexes array) each have dedicated add/update/
remove methods — read those method names directly in the file, they map 1:1 to the interactions
described above.

## Design Tokens
- **Page background**: `#1b1d16` · **Sidebar bg**: `#15170f` · **Panel/card bg**: `#1f2116` ·
  **Field bg**: `#22261c` · **Hairline border**: `#3a3d2e`
- **Text**: primary `#d9d4bd`, bright/headline `#eee0bb`, muted label `#8b8871`, dim caption
  `#6e6c56`, disabled `#5c5a48`
- **Accent (khaki gold)**: `#c9a04a` — used for the Export button, active nav state, big numeric
  readouts, victory-hex labels
- **Side A (green-grey)**: `#8a9a8a` / chip bg `#262918` / chip+card border `#48513f`
- **Side B (rust red)**: `#b4553c` / chip bg `#2a2018` / chip+card border `#533d33`
- **Advanced warning banner**: bg `#2a2410`, border `#55491f`, text `#d8b25c`
- **Font**: `ui-monospace, "SF Mono", Menlo, monospace` everywhere — body, labels, and headings
  alike (deliberate "field manual" feel)
- **Corners**: sharp — `border-radius: 0` throughout, no exceptions
- **Type scale**: nav rows 12.5px · section/topbar label 11px uppercase tracked 0.12em · title
  input 17px/700 · body/field text 12–12.5px · small caps labels 9.5–10.5px uppercase tracked
  0.08–0.1em · large numeric readouts (CAPs/VP/Rounds) 15–26px/700 monospace

## Assets
None — no images or icons are used. All visual elements are solid-color rectangles/circles and
text. The hex grid is pure SVG polygon geometry (see `hexGeom()` in the file).

## Files
- `Mission Editor.dc.html` — the full interactive prototype (all 6 sections, real in-memory
  state, JSON export). Read `renderVals()` for exactly how every value/handler is derived, and
  the methods above it (`setInfo`, `paintMapHex`, `addWave`, etc.) for the mutation logic.
- `support.js` — preview runtime only; not part of the target implementation.
- `board-geometry-reference/` — companion spec for the *real* hex board (geometry, coordinate
  labeling A01…S12, multi-board abutment, rotation) that should replace the placeholder grid
  used throughout this editor. Its own README is self-contained.

## Known gaps to close in the target implementation
1. **Placeholder hex grid.** Map / Starting Forces / Reinforcements all render a simplified
   10×8 flat-top grid with no half-hex edges, no multi-board abutment, and coordinate labels
   that don't necessarily match a real authored map. Replace with the real board component
   (`board-geometry-reference/`) and rewire `paintMapHex` / `placeAtHex` / `toggleWaveHex` onto
   its actual hex click events.
2. **Reinforcement entry-hex selection is single-click-toggle only.** The spec asks for
   selecting "a connected group of hexes, e.g. a stretch of a board edge" — this prototype lets
   you toggle hexes one at a time with no drag-select, shift-click-range, or edge-run affordance.
   Add one before this ships.
2b. **Victory hexes are picked by typing a hex code**, not by clicking the map — a deliberate
   scope tradeoff for this pass; revisit if a spatial picker is wanted.
3. **No persistence.** Everything lives in React state; a reload loses all authoring. Add
   localStorage at minimum, ideally a real save/load backend before this is used for real.
4. **No validation.** Nothing stops duplicate placements on one hex, empty required fields,
   OBA/override rounds outside 1..Rounds Total, etc. Add validation before Export is trusted.
5. **Unit catalog is mocked inline** (14 sample units across Germans/Soviets/Americans,
   following the `UnitTemplate` shape the user supplied: `id, nation, name, kind, fp{red,blue},
   dr{front,flank}, move, range, vp`). Swap in the real catalog data source.
6. **Export is a local JSON download only**, stamped with `meta.version: "0.1"` — no schema
   validation against what the game engine actually expects. Confirm/version the schema with
   the engine team before wiring real export.
