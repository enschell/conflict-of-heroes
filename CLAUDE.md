# CLAUDE.md — Conflict of Heroes (browser edition) — **v3 / 3rd Edition**

Guidance for Claude Code when building this project. Read this first, every session.

> **Source of truth for rules:** the official *Conflict of Heroes: Awakening the Bear*
> **3rd Edition** rulebook (Academy Games). This project is **3rd-edition rules only** (the v3
> migration is complete — see §A).
>
> **Do not invent rules from memory.** The rulebook has been transcribed into a curated,
> section-by-section reference under **`rules/`**. When implementing or changing a mechanic, open
> **`rules/INDEX.md`**, find the chapter(s) that cover it, and read the matching **`rules/NN-*.md`**
> file(s) first. Cite the v3 section number (`N.M`) in code comments, commits, and tests. The
> `rules/` files are **committed** and authoritative — read those, not the source PDF, for anything
> they already cover.
>
> **Reading the source PDF directly** (`docs/SoS3 Rulebook v70 single pages.pdf`, if present) is
> permitted when a mechanic genuinely needs content `rules/` hasn't transcribed yet (e.g. §G's Battle
> Card catalog — the individual card texts, as opposed to the card MECHANICS `rules/08` already
> covered) and the user hasn't supplied it another way — this was an explicit user override of what
> was previously an absolute prohibition here, made once §G needed the real card catalog. When you do
> read the PDF for something new, **transcribe what you found into the matching `rules/NN-*.md` file**
> (as §G's build did) so it's the committed, authoritative reference from then on — don't leave future
> sessions re-reading the PDF for the same content, and don't reproduce more than the specific
> passage needed.

---

## A. v3 migration (historical — complete)

This project migrated from a 2nd-edition (7AP-pool) engine to 3rd-edition (threshold-based action
economy) rules. The migration finished long ago — the codebase has been v3-only since M4.5.
**Never reintroduce 7AP/`ACTIVATE_UNIT`/`MARK_SPENT` logic.**

The full plan (change table, per-module rewrite list, build order) is preserved at
`docs/v3-migration-plan.md` for archaeology — not needed for day-to-day work. Current mechanics
live in `rules/` and this file's §6/§8.

---

## B. Hex board migration (flat-top substrate — done; every mission re-authored on it)

The board's geometry was migrated from **pointy-top** to **flat-top** hexes, per
**`docs/hex_board_spec/README.md`** (authoritative — geometry, labels, rotation, multi-board
abutment; not to be re-derived from memory). This matches the rulebook's own
**"(Map #)–(Column Letter & Row #)"** labeling (`rules/01`) — only the board number's presentation
changed (a large graphic, not a text prefix).

- **Substrate:** `engine/hex.ts`'s `axialToPixel` is flat-top. `engine/hexBoard.ts` bridges the
  spec's per-board column/row grid (`A01`..`S12` labels, board-number cell, multi-board seam
  merging) to the engine's axial adjacency math — the naive per-axis translation is wrong (flat-top
  couples `r` to `q`); see its header comment for the derivation. `ui/hexgeo.ts` draws flat-top
  hexes with real half/quarter-hex edge clipping (`clipHexPolygon`). Proven by the non-canonical
  `Hex Board Demo` mission (`data/missions/hexBoardDemo.ts`) and
  `hexBoard.test.ts`/`hexgeo.test.ts`/`hexBoardDemo.test.ts`.
- **Mission 1 — re-authored from scratch onto the new grid**, not reprojected (locked decision:
  reprojecting the old pointy-top `q,r` data would keep adjacency correct but visually scramble the
  battlefield shape — a different linear projection, not a rotation). Authoring workflow for future
  maps: `data/hexBoardMap.ts`'s `applyTerrainJson(boards, json)` takes a `{boardNumber: {label:
  code}}` map (`TERRAIN_CODES` for valid codes, incl. `<terrain>_road` compounds — Road doesn't
  change a hex's terrain for defense, only negates its Difficult-Terrain move cost road-to-road,
  §5.0.1) on top of `generateOpenBoard`'s all-open base. See `data/maps/mission1.ts` for the live
  example. **The rulebook's terrain table (`rules/04`) has exactly 8 types** — "more terrain types"
  almost always means art variety (`data/hexArt.ts`'s `HEX_ART_OVERRIDES`, or the fuller
  `data/terrainArtVariants.ts` system, §D), not a new mechanical type.
- **Sandboxes** (`hillsSandbox.ts`, `obstaclesSandbox.ts`, `fortificationsSandbox.ts`) each placed
  their own custom grid via raw `hexId(q,r)` — correct for pointy-top adjacency, but a sheared
  parallelogram visually under flat-top. Fixed via a local `at(c,r)` helper calling
  `engine/hexBoard.ts`'s `colRowToAxial({c,r})` (column parity shifts axial `r` by `-floor(c/2)`).
- **Rotation IS now built for the live game board** (`Board.tsx`) — see memory
  `conflict-of-heroes-hex-board-rotation` for the original locked requirements (labels always render
  upright; only same-length board edges abut), both satisfied by the implementation below.
  `GameState`/`MissionDef.mapRotations?: Record<mapNumber, 90|-90>` (same field the Mission/Map
  Editors already used for their own preview, §C's Phase 2) is carried through by `initGame` and
  resolved purely for rendering by `ui/hexgeo.ts`'s `computeDisplayRotationCluster(hexes,
  mapRotations)` — never read by `reduce`/movement/LOS/combat, which stay orientation-invariant as
  always. That helper reconstructs the cluster from FLATTENED data (no per-board list survives
  export) by leaning on `boardAssembly.ts`'s own proof that a Mission's whole assembly is always ONE
  rotation family (a quarter-family board can only attach to another quarter-family board) — so "any
  entry in `mapRotations` at all" already means every Hex in the Mission is in the one cluster; only
  which SPECIFIC 90°/-90° value to use needs a (documented, rare-edge-case) tie-break, since which
  board was the anchor doesn't survive flattening either. `Board.tsx` wraps every per-Hex rendering
  loop (terrain/art/labels, roads, walls, elevation glyphs, obstacle/fortification labels, Bunker
  Arc-of-Fire, objectives, unit counters, the overlay-mode image) in the cluster's shared
  `rotate(...)` transform; legibility-only text (coordinate labels, VP numbers, elevation glyphs,
  stack-count) counter-rotates to stay upright, exactly mirroring `EditorBoard.tsx`'s established
  technique — while Units/walls/roads/Bunker-arc lines rotate WITH the board (a physical marker
  spins with the map it sits on; a label doesn't). The one exception is the floating "Choose
  facing"/Pivot instructional callout — a pure UI element, not board content — which computes the
  Hex's real rotated screen position by plain 2D rotation math (`rotateAround`) instead of an SVG
  group transform, so the callout itself stays upright and keeps its own "float above the Hex"
  offset regardless of the board's rotation. Verified live: SoS Mission 4 (a real Mission with
  overlay art) temporarily tagged `mapRotations: {8: 90}` rendered correctly rotated in ACTUAL
  gameplay (not just the Editor), and hex hit-testing/hover still resolved the correct Hex under the
  cursor. (The Mission/Map Editors' OWN board previews — Map/Starting Forces/Reinforcements/Victory
  sections — also all pass `rotationClusters` now; previously only the Map section did, so a
  board's rotation was invisible everywhere else in the Editor.)
- **A recurring gotcha worth remembering:** the literal board-edge column/row (A, S, row 1, row 12)
  is never a valid "full Hex" entry edge — it's entirely half/quarter-hexes by construction
  (`edgeCut` set on every cell). A §4.12 entry requirement like "enters along the west edge" means
  the first FULL column in from the boundary (column B, not A). This bug was fixed once for a
  German wave and then recurred, unnoticed, on a Soviet wave in the same Mission — **when this class
  of mistake is caught once, grep the same mission's other `entryHexIds` for the identical mistake
  immediately, don't wait for it to be independently reported.**
- **Group reinforcement entry** (§4.12/§10.2): `groups.ts`'s `hexesConnected(hexIds)` + a
  `reducer.ts doEnter` check enforce "same or adjacent entry Hexes" for a multi-unit Group ENTER
  (one Spent Check, one shared Stress-all outcome). UI: `store.ts`'s
  `placingReinforcementQueue`/`placingReinforcementFacing`/`placingReinforcementDone` walk each
  queued Unit through Hex → facing before dispatching; `Board.tsx` synthesizes a preview `Unit` the
  instant a Hex is picked (merged into the real `unitsByHex` map) so placement isn't blind before
  the real ENTER commits. `ReinforcementsPanel.tsx` has both a per-unit "Place as Group" flow and
  the original single-Unit/fast-path "Enter now."
- **Why the engine itself needed no changes for the geometry swap:** `engine/hex.ts`'s adjacency
  (`neighbor`/`distance`/`lineDraw`) and `movement.ts`'s wall-crossing are pure axial-index
  arithmetic with zero pixel/orientation dependency — only `axialToPixel` (itself
  orientation-invariant, used solely for the arc-of-fire dot-product test) and the UI rendering
  layer needed to change. If you're ever tempted to "fix" a movement/facing/LOS bug by touching hex
  orientation math, it's almost certainly not an orientation problem.

---

## C. Mission Editor (built)

A visual, in-app tool for authoring a new Mission — no more hand-writing `MapHexDef`/
`UnitPlacement`/`ReinforcementWaveDef` arrays by hand. Lives at `src/ui/editor/` (open from
`SetupScreen`'s "Mission Editor" card), backed by its own small Zustand store
(`state/editorStore.ts`), deliberately separate from `state/store.ts` (the live `GameState` store)
— authoring data isn't a game in progress. `App.tsx`'s `screen: 'menu' | 'editor' | 'mapEditor'`
field is checked before the normal `mode`/`game` routing.

- **Design provenance:** a claude.ai/design handoff at `docs/design_handoff_mission_editor/`
  (high-fidelity forms, a placeholder hex grid meant to be replaced with the real board) —
  reviewed and approved by the user before implementation.
- **Scope:** the Map section is a **map picker** (`data/maps/catalog.ts`), not a terrain painter —
  its "Paint Tool" only covers Obstacles/Fortifications on top of whichever map is picked.
  Terrain-authoring is §D's separate Map Editor. Units are picked from `UNIT_TEMPLATES` only, never
  authored here.
- **Board rendering:** a new prop-driven `EditorBoard.tsx` (`{hexes, markers?, highlightedHexIds?,
  onHexClick?}`), NOT a reuse of the live `Board.tsx` (which is hardwired to ~15 live `GameState`
  selectors) — reuses `ui/hexgeo.ts`'s pure geometry directly. `hexgeo.ts`'s
  `fringeHexes`/`playableBounds`/`computeLayout` take `Pick<GameState,'hexes'>` so the editor can
  call them without a live `GameState`. Placed-unit markers render as the REAL `UnitCounter`
  (image-backed art, stat overlay, facing) via `EditorMarker.unit?` + a minimal pseudo-GameState
  (`COUNTER_PREVIEW_GAME` — safe because `templateOf`/`effectiveStats` only read `state.templates`
  and the unit's own empty hit markers); stacks show the first counter + the live board's ×N badge.
- **Export:** a real, self-contained TypeScript `MissionDef` source file (not JSON) via
  `data/editor/emitMissionSource.ts` — a from-scratch JS-value-to-TS pretty printer (no `prettier`
  dependency). Inlines the picked map's hexes + placements + waves; only `UNIT_TEMPLATES` is
  imported by reference. Triggers a browser download; round-trip tested (evals the exported object
  through the real `initGame`). The header comment documents the remaining manual registration
  steps (import + a `SetupScreen.tsx` button).
- **"Load Existing Mission"** (sidebar dropdown + button, any mission in `data/missions/catalog.ts`'s
  `MISSION_CATALOG` — hand-authored or Editor-exported) — `data/editor/loadMissionSource.ts`'s
  `buildEditorStateFromMission` is the reverse of `emitMissionSource.ts`, rebuilding every editor
  slice from a real `MissionDef`. **One genuine, documented limitation:** `MissionDef.hexes` is
  already a flat, fully-assembled `MapHexDef[]` — which catalog map(s)/attachment produced it isn't
  preserved in the export, so a loaded Mission's Map section always comes back as ONE single anchor
  board (a synthetic, session-local `MAP_CATALOG['__loaded_<id>']` entry built from the mission's
  own hexes, obstacles/fortifications correctly split back out into the Map section's own overlay
  state). Everything else — Mission Info, Starting Forces (incl. the Setup Pool), Reinforcements,
  Victory Conditions (incl. `specificRounds`), Advanced — round-trips exactly. Confirmed with a
  dedicated test suite (`data/editor/__tests__/loadMissionSource.test.ts`) and live in-browser:
  loaded both Mission 1 (4 placements, 4 reinforcement waves, real map, zero errors) and the Setup
  Phase Sandbox (Setup Pool, non-default `setupFirstSide`, `specificRounds` victory hex — every
  field confirmed present and correctly re-populated in its own section).
- **A board's 90°/-90° display rotation IS preserved across export/reload** (fixed same session as
  the limitation above was first written) — `MissionDef.mapRotations?: Record<number, 90 | -90>`,
  keyed by a board's own `mapNumber` (same key convention as `mapOverlays`). Only 90°/-90° needs
  recording: 0°/180° are real axial-coordinate transforms already baked into the merged `hexes`
  (`boardAssembly.ts`'s `Rotation` — a hexagon has 6-fold, not 4-fold, rotational symmetry, so
  90°/-90° has no axial equivalent and is a pixel-only spin the renderer applies on top, otherwise
  completely unrepresented in exported data — it would silently reset to 0° on every reload without
  this field). `state/editorStore.ts`'s `assembledMapRotations` derives it at export time
  (`emitMissionSource.ts`); `loadMissionSource.ts`'s `synthesizeMapEntry` reads it back to set the
  synthesized board's `rotation`. Originally scoped to the Editor's own round-trip only — the live
  game's `Board.tsx` didn't render rotated clusters at all yet (§B) — but that gap closed the same
  session (§B's own bullet has the full detail): `Board.tsx` now renders `mapRotations` too, so this
  field carries real gameplay effect, not just an Editor-authoring convenience. Verified live: set
  SoS Mission 4's board to 90°, exported, and the downloaded source contained
  `mapRotations: { '8': 90 }`.
- **Victory Conditions are fully real, not inert:** `VictoryHexDef.control?`/`roundOverrides?`,
  `vpPerKill` widened to per-side, all additive/optional (`engine/__tests__/victory-config.test.ts`).
  `awardTiming` has a third mode, `'specificRounds'` + `awardRounds?: number[]`, alongside
  `endOfRound`/`endOfMission` — VP awarded only on an explicit list of Rounds (e.g. "1 VP for K09 in
  Rounds 3, 4, and 5 only," not every Round and not just at Mission end). UI: the award-timing
  `<select>` gained a third option; picking it reveals a comma-separated Rounds text field.
- **Cards/OBA/Air Support stayed inert on purpose at the time** (§8's M12), captured losslessly in
  `MissionDef.advancedNotes` but read by nothing. (Hidden Units, formerly grouped with these as M8,
  went real first — see §F. Cards/OBA themselves later went real too, superseding `advancedNotes`'
  Cards fields with `MissionDef.cardConfig` — see §G. Air Support is the one field from this original
  list still genuinely inert.)
- **A real gap caught mid-build:** `obstacles.ts`'s `rollMinesAttack` defaults an unset Hit Number to
  0 (always-hits) — the Map section's tool rail gained an explicit "Mines Hit Number (§17.10)"
  input (default 8) so this can't silently ship.
- **Known follow-ups:** no drag-select/shift-click-range for entry hexes (still click-to-toggle);
  no persistence/localStorage for in-progress authoring; no validation beyond victory-hex-label/
  connectivity checks (duplicate placements, empty fields, etc. aren't blocked).

### C's Phase 2: multi-board rotation/abutment + richer VP categories

- **Multi-map missions, each map independently rotatable (0°/90°/-90°/180°) and abutted.** The core
  finding, derived and numerically verified before writing code: **a hexagon has 6-fold rotational
  symmetry, not 4-fold — a genuine 90°/-90° rotation of a board's own axial coordinates that both
  preserves adjacency and doesn't mirror the content does not exist** (the hex lattice's isometry
  group is D6 — 6 rotations + 6 reflections, no 90° element; confirmed by a direct numeric
  counterexample too). `engine/boardAssembly.ts` (`assembleBoards`, `rotationClusters`) encodes the
  consequence: **0° and 180° are the only real axial rotations** (180° = the cube-coordinate
  identity `(q,r)->(-q,-r)`) and freely mix with each other; **90°/-90° have no axial equivalent**,
  so a board tagged either one borrows whichever real transform lets its attachment merge, and the
  user-visible spin is a **display-only pixel rotation** layered on top per-cluster
  (`ui/hexgeo.ts`/`EditorBoard.tsx`, counter-rotating labels to stay upright). Rotation families are
  `{0°,180°}` and `{90°,-90°}` — a board from one family can never directly attach to the other
  (their edge lengths become geometrically incompatible), so `rotationClusters` only ever returns
  zero or one cluster. Abutment is specified via each board's own LOCAL edge labels
  (`localEdge`/`neighborLocalEdge`), not screen-relative directions — `assembleBoards`
  brute-force-searches for the translation that makes the two specified edges coincide exactly,
  rejecting non-bijections. **A subtle bug worth remembering:** N/S abutment does NOT merge all 19
  columns like E/W's 13-cell merge does — only EVEN columns have a boundary half-hex that merges at
  a N/S seam; odd columns are already full top-to-bottom and merely sit adjacent. Getting this wrong
  produces a translation that satisfies the edge bijection check while silently overlapping the rest
  of the board elsewhere — `assembleBoards` now has a defensive full-collision check (candidate
  translation only accepted if its collision count exactly matches the intended seam length) so this
  can't recur silently. All covered by `engine/__tests__/boardAssembly.test.ts`.
- **Victory Conditions gained three more real (not inert) categories:** award timing
  (`awardTiming?: 'endOfRound'|'endOfMission'`), specific-Unit kill VP
  (`VictoryConfig.unitKillVp`, overrides the general per-kill value), and VP for enemy Units
  surviving to Mission end (`vpPerSurvivor`, same shape as `vpPerKill`).
- **Exit the Map (§4.0) is a real gameplay Action**, not inert like Cards/OBA — the rulebook already
  delegates this to Mission-configurable content. `MissionDef.exitZones?`, a new `EXIT` Action
  (costs the Unit's own `move` as AP, a real Spent Check; legal only on the Unit's side's exit
  Hexes; removes the Unit with no hit marker/CAP loss and awards `vpPerUnit` to the exiting side).
  UI mirrors Rally/Hasty-Defense's self-targeted button pattern.

### C's Phase 3: real terrain images, invalid-config UX, readability/zoom

- `EditorBoard.tsx` renders real terrain art (`public/assets/terrain/*.png|svg`) via its own
  `EDITOR_TERRAIN_ART` map (deliberately not a reuse of `data/hexArt.ts`, which has a road-asset
  path mismatch the live game still carries).
- **A real bug, since fixed:** an incomplete/invalid multi-board config (missing `attachTo`, or a
  mismatched edge) makes `assembledMap()` return zero hexes — the whole board rendered blank with
  only a small, easy-to-miss text warning, which read as "the images broke" rather than "the config
  is invalid." Fixed with a shared `EditorBoardOrError` wrapper that shows a large, unmissable panel
  in the board's own space instead of silently rendering nothing — applied everywhere a board
  depends on the merged map.
- Every font-size under the editor's CSS scope was scaled 1.5× per user request (readability);
  `.editor__unit-list` shows exactly 6 unit cards before scrolling.
- **Ctrl+wheel zoom, 0.5×–4×; plain wheel pans vertically**, mirrors `Board.tsx`'s own
  already-debugged implementation exactly (see the StrictMode note in §7).
- **Starting Forces + Reinforcements are side-by-side layouts, not stacked** (user-requested):
  Starting Forces is a `[Side A column | board | Side B column]` grid (`.editor__forces-grid`);
  Reinforcements is two wave columns (`.editor__reinf-grid`). Each side column owns ONE
  `UnitPicker` restricted to that side's nations (`UnitPicker`'s `nations` prop, fed from the
  Mission Info tab's per-side nation picks — the nation dropdown collapses away entirely when a
  side has exactly one nation, and an unset side falls back to the full catalog). The old
  "Add to Side A/B" toggle is gone: the column IS the side. Starting Forces' column has a
  Place-on-Map/Setup-Pool destination toggle deciding whether a picked unit arms for a board
  click or goes straight into that side's pool; facing/hidden/Mines controls are per-column
  (local state, pushed into `forces.armed*` on arm/change so a later board click places exactly
  what the column shows). Shared, side-agnostic bits (armed-status line under the board,
  Sets Up First, Setup Instructions) stay outside the columns.

---

## D. Map Editor (terrain authoring, built)

A separate visual, in-app tool for authoring a new **Map** (`MapHexDef[]`, assigned a Map #, with
real terrain/road/elevation painted hex-by-hex) — the "separate, not-yet-built tool" §C's Mission
Editor always deferred to. Lives at `src/ui/mapEditor/MapEditor.tsx` + `state/mapEditorStore.ts`,
kept apart from both other stores for the same reason they're kept apart from each other.

- **Core model:** `mapEditorStore.ts` holds one directly-paintable `MapHexDef[]` canvas (a single
  un-rotated board via `generateOpenBoard`). Tools: the 8 real `TerrainId` types, an independent
  Road-network toggle, an Elevation stepper (L0-L2), Clear/Erase — orthogonal per-hex properties,
  matching how the engine actually models them. Export: `data/editor/emitMapSource.ts` (+ shared
  `tsSource.ts`, also reused by `emitMissionSource.ts`) emits a real `MapHexDef[]` TS module; "Load
  Existing Map" resumes editing any catalog entry.
- **Terrain Art Variants:** a genuine design handoff (`design_handoff_hex_map/`, from the user's
  Downloads) supplied 19 real terrain tile PNGs — more than the engine's 8 mechanical `TerrainId`
  types, but per the standing "more terrain types = art variety" rule (§B), the extra 11 (Wheat,
  Corn, Balka, Small Balka, Anti-Tank Ditch, Stream, Ford, Marsh, Lake, plus a nicer Plowed Field)
  became a decorative art-variant layer, not new mechanics. `Hex`/`MapHexDef` gained an optional
  `art?: string` key resolved by `data/terrainArtVariants.ts` (that file's own header comment has
  the full variant→TerrainId mapping and the reasoning for each ambiguous case — e.g. Ford→`open`
  since it's specifically the passable crossing point). Both `data/hexArt.ts`'s `artForHex` (live
  game) and `EditorBoard.tsx` prefer `hex.art` over the plain terrain default. **Not in the
  palette:** Road (its own toggle tool), Walls (a per-edge feature, no paint tool yet), Sloping/Steep
  Terrain (derived from neighboring-hex Elevation deltas, §12 — not an intrinsic per-hex tag; the
  Elevation tool is the right authoring surface).
- **Overlay image — real gameplay art, not just a tracing aid.** A picked map's overlay image
  becomes the REAL art shown during play, replacing per-hex terrain tiles, while terrain
  TYPE/mechanics (movement/LOS/DR) still come from the map's own `MapHexDef[]`. Data model:
  `MapCatalogEntry.overlayImage?: string`; `MissionDef`/`GameState.mapOverlays?: Record<number,
  string>` keyed by `Hex.mapNumber` — **per-board, not per-hex**, specifically to avoid duplicating
  a large image reference across a board's ~200+ hexes. `ui/Board.tsx` (the live game) groups hexes
  by `mapNumber`, drawing one stretched (`preserveAspectRatio="none"`), silhouette-clipped `<image>`
  per group, skipping per-hex tiles entirely for those hexes — sized to just that group's own
  sub-bounds so a multi-board Mission with only some boards overlaid doesn't smear across others.
  `EditorBoard.tsx` has both this same read-only `mapOverlays` preview prop (used by every Mission
  Editor section, via `state/editorStore.ts`'s `assembledMapOverlays()`) AND a separate single-image
  `overlay` prop that's the Map Editor's own dimmed/toggleable tracing aid while actively painting —
  both clip to the real hex silhouette (the union of every hex's own clipped polygon), not a
  rectangular bounding box. **A real bug, since fixed:** `EditorBoard.tsx` rendered `mapOverlays`
  images in a loop entirely separate from the `rotationClusters`-driven `<g transform="rotate(...)">`
  wrapping applied to hex polygons/labels — a board's overlay image never rotated with it (only the
  hex ids visibly spun). Fixed by looking up each overlay group's own cluster (via any one of its
  member hex ids, same `clusterOfHex` map `renderHex` already uses) and applying the identical
  transform, since the group's clip polygons/image rect are computed in the same pre-rotation
  absolute coordinates as the hexes. Verified live: SoS Mission 4 (real overlay art) rotated to 90°
  now visibly spins the wheat-field/building/woods artwork together with the hex silhouette.
  This fix was Mission-Editor-preview-only when first written — `Board.tsx` (the LIVE game) didn't
  render rotated {90°,-90°} clusters at all yet — but that gap closed the same session (§B), and
  `Board.tsx`'s own overlay-image rendering got the identical rotation-transform fix as part of it.
- **Recommended overlay image size: ~1.30:1 aspect ratio** (the real board's TRUE playable
  silhouette is 972×748 app-pixel-units at `HEX_SIZE=36`) — e.g. ~1600×1232px or ~1300×1000px; any
  resolution works since it's stretched to fill, but matching the ratio avoids losing an edge of the
  image (see the bug note immediately below — this number is `tightHexBounds`, NOT
  `playableBounds`). Recompute from `hexgeo.ts`'s `tightHexBounds` if `HEX_SIZE`/board dimensions
  ever change — `playableBounds` will silently give the wrong (too-generous) number again.
- **A real bug, since fixed:** the overlay image's own draw rect was originally sized from
  `hexgeo.ts`'s `playableBounds` (1044×820, ratio ≈1.27) — but `playableBounds` deliberately uses
  every hex's FULL unclipped ±`HEX_SIZE` box (so a half/quarter-hex is never cut off by too-tight an
  SVG viewBox), which is measurably BIGGER than the board's real silhouette on every edge that's
  actually half/quarter-clipped. The image was stretched across that bigger box, then clipped down
  to the true (smaller) silhouette — silently losing a real margin of the uploaded image forever
  (confirmed live: a user-uploaded 1600×1260 image, matching the old ~1.27 recommendation exactly,
  still lost visible content). Fixed with a new `hexgeo.ts` export, `tightHexBounds` (the true
  bounding box of the UNION of every hex's own *clipped* corners, not its unclipped box) — used for
  the overlay image's own `x`/`y`/`width`/`height` in both `EditorBoard.tsx`'s tracing `overlay` and
  `computeMapOverlayGroups` (shared by `Board.tsx`'s real gameplay rendering and `EditorBoard.tsx`'s
  `mapOverlays` preview) — while `playableBounds` stays exactly as before for the SVG's own viewport
  sizing, where the extra margin is intentional. Verified live: the drawn `<image>` rect now reads
  exactly `x=0 y=0 width=972 height=748.25`, matching `tightHexBounds` precisely (previously
  `x=-36 y=-36 width=1044 height=820.25`). Full suite (483 tests) green throughout.
- **Overlay export is a real file + path reference, not an embedded data: URI.**
  `emitMapSource.ts` emits `overlayImage` as a `/assets/maps/<slug>.<ext>` path string and triggers
  a second browser download of the raw image bytes, which the author drops into
  `public/assets/maps/` before registering in `catalog.ts`. **Why this matters, concretely:** an
  earlier embedded-data-URI export (`data/maps/atb-map-1.ts`) inflated the production bundle from
  467KB to 3.79MB once imported into the catalog — Vite bundles an inline base64 string as plain JS.
  If bundle size balloons after a new map is registered, check whether its `.ts` file predates this
  fix (the field itself, `MapCatalogEntry.overlayImage: string`, accepts either shape — old exports
  aren't auto-migrated).
- **Known follow-ups:** no Wall tool (a two-click "paint the shared edge between two hexes" gesture
  fits `engine/hex.ts`'s existing `neighbor`/`AXIAL_DIRECTIONS`); no automatic Sloping/Steep art hint
  from neighboring-hex Elevation deltas; no localStorage/autosave for in-progress authoring or the
  working overlay; no validation before Export.

---

## E. Pre-Mission Setup phase (built)

A Mission-configurable phase (not a `rules/` chapter — no such sequence exists in the base
rulebook; added on user request, same "legitimate Mission-configurable content" footing as Exit
Zones/§D's Overlay mode): before Round 1, one side places a pool of starting Units onto any empty
Hex, then the other side does the same, then the real Round 1/Initiative sequence begins exactly as
normal. Every existing Mission (no `setupForces`) skips this entirely — `initGame` only stays in
`phase: 'setup'` when the pool is non-empty, so nothing about any prior Mission changed.

- **Data model:** `MissionDef.setupForces?: {id, side, templateId, facing}[]` (a flat pool, no
  `hexId` — chosen by the player, unlike `units`), `setupFirstSide?` (defaults to `'A'`, auto-skips
  to whichever side actually has pool Units if the authored first side has none), `setupInstructions?`
  (free text, display-only). `GameState.setupPool?`/`setupSide?` mirror this at runtime.
- **Engine:** a new `SETUP_PLACE` Action, gated in `reduce()`'s very first phase check (along with
  `CHOOSE_FACING` — see the bug note below — the ONLY two Actions legal while `phase==='setup'`;
  `SETUP_PLACE` illegal again once it's over). `reducer.ts`'s `doSetupPlace` places the Unit
  fresh/unstressed — free, no AP, no Spent Check — grants the EXISTING free facing-correction window
  (`pendingFacingChoices`, reused rather than building new facing UI), and, once both sides' pools
  are empty, calls `turn.ts`'s `startRound` itself to begin the real Round 1. `engine/setup.ts`'s
  `legalSetupHexes` is the pure legality helper (any currently-empty Hex).
  **A real bug, since fixed:** the facing-correction window `doSetupPlace` grants was unusable
  DURING setup — the "Choose facing" callout appeared after placing, but every click was swallowed
  at TWO separate layers: `reduce()`'s own phase guard no-op'd everything except `SETUP_PLACE`
  (fixed by adding `CHOOSE_FACING` to the carve-out, same shape as M13's online turn-gate exemption
  for this exact Action), and `store.ts`'s `hexClick` had its own early-return for the setup phase
  that only understood "place the armed unit" (fixed by checking the open facing window first,
  mirroring the normal-play branch). Only the LAST-placed Unit's facing ever worked before this fix,
  since that placement ends the phase and lifts both guards.
- **Mission Editor:** Starting Forces tab gained a Setup Pool roster (coexists with the existing
  fixed-location placements — a Mission may freely mix both), a "Sets Up First" side toggle, and a
  "Setup Instructions" textarea. **A real bug, since fixed:** the Editor's THREE separate unit-id
  generators (fixed placements, Setup Pool, reinforcement waves) each checked an incomplete
  "existing ids" list, so a fresh id could collide across sources — caught live when an exported
  Mission had the same id on a Setup Pool Unit and a Round-2 reinforcement Unit, which would have
  made the reinforcement's ENTER silently overwrite the already-placed Unit in `game.units` at play
  time. Fixed with one shared `allUnitIds()` helper (`state/editorStore.ts`) all three now use.
- **Live game:** `SetupPanel.tsx` (shown in the right sidebar in place of Inspector/GroupPanel while
  `phase==='setup'`) lists the current `setupSide`'s remaining pool Units; "Place" arms one, then
  clicking a highlighted (purple, same style as reinforcement entry) empty Hex places it. Also
  renders `GameState.setupInstructions` (copied through by `initGame` from `MissionDef`
  `setupInstructions` — display-only, never read by `reduce`) so the authored guidance is actually
  visible to the players placing forces, not just round-tripped through the Editor.
  Pass/Stall/Group/Undo/Redo are hidden during setup (none apply); the topbar shows "Pre-Mission
  Setup — Side X places its forces" instead of the normal Round/Turn line.
- **Verified live:** `Setup Phase Sandbox (test)` mission (`data/missions/setupPhaseSandbox.ts`, 2
  Setup Pool Units per side, `setupFirstSide: 'B'` to exercise the non-default path) — Side B placed
  both Units, hand-off to Side A worked, and placing Side A's last Unit transitioned straight into a
  real Round 1 with initiative rolled normally. Full suite (503 tests) + typecheck + build +
  conformance (0 violations) green throughout.
- **Hidden flag + Mines as Starting Forces:** `Unit`/`UnitPlacement`/`SetupPoolUnit`/
  `MissionDef.setupForces` entries and `ObstacleState`/`MapHexDef.obstacle` all gained
  `hidden?: boolean` (default visible). Originally shipped DATA-ONLY (authored/exported/carried
  through `initGame`, but no renderer hid anything) — **§F later made this a real, live mechanic**
  (render-layer visibility filter + the full §11 Hidden Move/Recon by Fire ruleset); read §F before
  touching `hidden` again. **Mines are additionally placeable from the Starting Forces tab** (not
  just the Map section's paint tool): a fixed-location Mines token (`MINE_ARM_ID` sentinel in `editorStore.ts`'s
  `armedTemplateId`) writes into the SAME `map.obstacles` record the Map tool uses, always
  `hidden: true`; a Setup Pool Mines token (`SetupPoolUnit.mine: {hitNumber}`,
  `addMineToSetupPool`) is placed by the PLAYER during the Pre-Mission phase —
  `doSetupPlace` branches on `entry.mine` and writes `hex.features.obstacle {kind:'mines',
  ownerSide, hidden:true}` instead of creating a Unit (no facing window; §17.0 one-structure-per-
  Hex validated, with `legalSetupHexes(state, forMine)` keeping the purple picker in lockstep).
  The engine's §17.10 Mines mechanics are untouched — this is purely a new way to get one onto the
  board. **Gotcha encoded in a test:** a Mines token's `templateId` ('mines') is a display-only
  placeholder — `emitMissionSource.ts`'s `collectTemplateIds` must skip it or the export emits
  `UNIT_TEMPLATES['mines']!` and crashes at import time.
- **Known follow-ups:** one-unit-at-a-time placement only (no Group setup placement, unlike
  Reinforcements' queue); no per-side setup-zone Hex restriction (any empty Hex on the whole board is
  legal); no localStorage/autosave; fixed-location Mines placed from the Starting Forces tab are
  removed via the Map section's Placed list (no remove control on the Forces tab itself).

---

## F. Hidden Units (§11, built — supersedes the old M8-deferred decision)

Full §11 built on user request, reversing the original locked decision (§8's old M8 entry) that
deferred Hidden Units entirely to online play. That decision's reasoning was sound — hotseat shares
one screen/one `GameState`, so any hotseat "hide" is a **render-layer filter, defeatable via
browser devtools** — but the user explicitly asked for exactly that anyway, informed of the
tradeoff. **This is a deliberate, accepted limitation, not an oversight**: do not "fix" it with a
hotseat-only workaround, and do not re-litigate the decision without a fresh explicit ask. §11.8
Sniper is out of scope (a separate unit-ability feature).

- **Visibility (render layer only — engine state is never actually secret):** `Board.tsx`/
  `HoverPanel.tsx` compute `activeSide = phase==='setup' ? setupSide : currentSide` once and filter
  every unit list with `!u.hidden || u.side === activeSide` before building render/interaction data
  — the owner always sees their own Hidden Units; the enemy sees them only once `hidden` clears.
  `store.ts`'s stacked-unit picker (`hexClick`'s `here`) got the identical filter (a leak fixed
  during this build — it bypassed Board.tsx's own filtering).
- **Reveal is engine-computed, not a UI concern** (`engine/hidden.ts`, new pure-helpers module,
  mirroring `fortifications.ts`/`obstacles.ts`'s shape): `isConcealed(state, hexId) = isCover(...)
  || smokeLevel(...) === 2` is the single predicate behind §11.1's "Open vs Concealing Terrain"
  bullets — a Wheeled/Tracked Hidden Unit reveals if any non-hidden enemy has LOS to its Hex and
  `!isConcealed`; a Foot/Gun Hidden Unit additionally needs to be within 2 Hexes of such an enemy
  (Concealing Terrain blocks the reveal outright regardless of distance, which is why §11.5's
  "stays hidden in cover even adjacent to the enemy" needs no separate rule — it falls out of
  `isConcealed` alone). `mustReveal`/`mustRevealForSharedHex` cover the rest of §11.1's triggers
  (any Action but Stall/Rally/Hidden Move; sharing a Hex with a non-Hidden Unit; a successful Recon
  by Fire).
- **Two reveal hook points in `reducer.ts`, both funneled through one `finish()`:** (1) a top-of-
  `reduce()` pre-check reveals the acting Unit(s) before dispatch, for every Action type except a
  small exempt set (`STALL, RALLY, HIDDEN_MOVE, CHOOSE_FACING, SETUP_PLACE, ENTER`) — so every
  *other* existing Action (MOVE, FIRE, PIVOT, ...) needed zero changes of its own, it just sees an
  already-revealed, ordinary Unit; (2) `finish()` itself — the single funnel every successful `doX`
  calls (`deny()` bypasses it, returning the untouched original state) — sweeps every currently-
  Hidden Unit through `mustReveal` after every Action, which is what makes cascade-reveal (revealing
  one stacked Unit auto-reveals its now-non-Hidden Hex-mates in the same Action) fall out for free
  instead of needing bespoke stacking logic.
- **`HIDDEN_MOVE` (§11.3-11.6):** flat 5 AP (`hiddenMoveBase`, only the hit-marker delta needs
  isolating — Stress/CAP-reduce ride the existing `planCost` machinery), ignores terrain movement
  penalties. Branches on `unit.hidden`: **Becoming Hidden** (§11.4) validates against
  `becomingHiddenCandidates` (the Unit's own Hex ∪ its neighbors, filtered to Hexes out of all
  non-hidden enemy LOS, further filtered on neighbor candidates by basic move passability — the
  self-Hex candidate is exempt from that check since a Hex isn't its own neighbor); **Move While
  Hidden** (§11.5) walks the path Hex-by-Hex and reveals mid-move at the first Hex that fails
  concealment, rather than relying solely on the end-of-Action sweep (which would only ever check
  the final Hex). §11.6 (a failed Spent Check keeps the Unit Hidden, just Spent) needs no special
  code — a failed Spent Check only ever flips `status`, never `hidden`.
- **`RECON_BY_FIRE` (§11.7):** validated via the existing `directFireZone` (reused as-is — already
  implements "a Target Hex in the Attacker's Fire Zone," no distinction between a suspected-empty
  Hex and a confirmed-occupied one). A genuinely new shape versus every other double-roll Action in
  this codebase (§17.11's Fortification double-roll shares ONE CAP mod across both rolls): the
  Reveal Number roll (`6 + Terrain DR Mod`) and the conditional follow-up Attack roll have
  **independent** CAP dice mods (`capRevealDiceMod` vs `capDiceMod`/Hit Number mod), per the
  rulebook's explicit "CAPs spent on one don't carry to the other." On a successful reveal with a
  Hidden enemy actually present: reveal it (owner-chosen facing, via `facingToward` — "face the
  revealer," matching the worked example), then resolve a normal attack against it, one Spent Check
  total. **Miss-vs-empty-hex is never distinguished in logs/UI** — the attacker only ever learns
  pass/fail on the Reveal roll itself, never "there was nothing there" specifically (confirmed live:
  a Reveal-succeeds-but-empty-Hex recon logs `"...→ no reveal"`, textually indistinguishable from
  what a Reveal-fails case would show).
- **UI:** `UnitCounter.tsx` gained a violet "HIDDEN" badge (both the `counterImage` and plain
  fallback branches). `Board.tsx` gained two new dashed highlight sets on the selected Unit's legal
  Hexes — violet `#8b5cf6` for Hidden Move targets, burnt-orange `#c2410c` for Recon by Fire targets
  (deliberately distinct from `transportTargets`' amber, since both could theoretically be true at
  once). `Inspector.tsx` gained two `HIDDEN_MOVE`/`RECON_BY_FIRE` status lines alongside the
  existing Move line. `store.ts`'s `hexClick` folded both new Action types into its existing
  rules-legal `optionCount` tally, so an ambiguous click (e.g. a Hex that's both a plain Move target
  and a Hidden Move target) opens `ActionChooser` instead of guessing — confirmed live. Recon by
  Fire routes through a new `requestReconRoll` builder (mirrors `requestFireRoll`'s shape): a 1-step
  `PendingRoll` (just the Reveal roll) on a miss or an empty-Hex hit, or 2 steps (Reveal + Attack) on
  a genuine hit against a Hidden Unit. `DiceRoller.tsx` renders a second, independent CAP-mod
  stepper for `kind: 'recon'` (Reveal Number mod always shown before the first die; the Hit Number
  mod only shown once a second step exists) — both decided up front, before any die is rolled, so
  adjusting either never has to "un-roll" an already-settled die.
- **Reinforcement waves can be authored Hidden too** (closing a gap the original data-only build
  left open): `ReinforcementWaveDef.units[]`/`EditorWave`'s `WaveUnit` gained `hidden?: boolean`;
  the Mission Editor's Reinforcements tab has a "Hidden (§11)" checkbox next to the Facing selector;
  `emitMissionSource.ts`/`loadMissionSource.ts` round-trip it; **`state.ts`'s `initGame` reinforcement-
  building loop copies it onto the built `ReinforcementUnit`** — this last step is the one piece that
  was still missing after the type field alone was added; a hidden reinforcement that `ENTER`s the
  Map (an Action deliberately exempt from bullet-1's auto-reveal, mirroring `doSetupPlace`) stays
  Hidden on arrival, subject to the normal post-Action sweep from then on.
- **A real correctness gap found and closed while wiring the UI** (not hypothetical — normal FIRE/
  CLOSE_COMBAT/INDIRECT_FIRE had no check stopping them from targeting a Hidden Unit directly, and
  the stacked-Hex resolvers could hit a Hidden Unit sharing a Hex with a visible one): `actions.ts`'s
  target enumeration, `combat.ts`'s `enemiesInHex`/`attackContext`/`closeCombatContext`, and
  `mortar.ts`'s `rollIndirectFire` all gained an explicit `!u.hidden`/`target.hidden` exclusion —
  the only sanctioned way to attack a suspected Hidden Unit is Recon by Fire.
- **The dead Advanced-tab "Hidden Units" checklist was removed**, not left alongside the real
  mechanic — it predated this build, was never wired to `initGame`, and would have been a confusing
  footgun (two different "hidden" controls, one doing nothing) had it survived.
  `EditorAdvancedState.hiddenIds`/`toggleHidden()`, `AdvancedSection.tsx`'s checklist block, and
  `MissionAdvancedNotes.hiddenUnitIds` (+ its emit/load round-trip) are all gone.
- **Verified live:** `Hidden Units Sandbox (test)` mission (`data/missions/hiddenUnitsSandbox.ts` —
  two Woods hexes, one Hidden Unit per side starting in cover, one visible Unit per side adjacent/in
  Fire Zone). Confirmed in the actual browser, not just Vitest: the owner-always-sees/enemy-never-
  sees visibility split at Mission start; a real `HIDDEN_MOVE` (`ActionChooser` correctly offered
  both plain Move and Hidden Move; committed at flat 5 AP, failed its Spent Check, stayed Hidden);
  the full-board visibility flip on turn change: a real `RECON_BY_FIRE` through `DiceRoller`'s
  `'recon'` kind (Reveal Number + CAP stepper, correct `"no reveal"` wording on a Reveal-succeeds-
  but-empty-Hex case, Spent Check afterward). Full suite (566 tests) + typecheck + build +
  conformance (0 violations) green throughout.

---

## G. Battle/Weapon/Veteran Cards (§8) + Off-Board Artillery (§13.4-13.9, built)

M12 — the last unbuilt v3 rules module. Full engine mechanics + real Mission Editor authoring +
a minimal, plain-text live-game hand panel (the fancy card-art UI stays deliberately deferred, per
user request). **The individual card catalog (title/cost/effect text for all ~38 real cards) was
sourced by reading `docs/SoS3 Rulebook v70 single pages.pdf` directly** — the user explicitly
overrode this file's earlier standing "never read the PDF" instruction for this one build (§0/CLAUDE.md
itself has been updated to reflect that override is now historical, not a live prohibition going
forward — see the note at the end of this section). `rules/08-battle-cards.md`'s "Card Catalog"
section is the resulting committed transcription — read that, not the PDF, for anything Cards-related
from here on.

- **One real data gap, deliberately left open and flagged, not silently guessed:** each card's
  Green-vs-Blue cost color (§8.6) is conveyed only by ink color on the physical card, which text
  extraction can't recover (no `pdftoppm`/ImageMagick/ghostscript/`mutool` available in this
  environment to render pages as images). ~13 nonzero-cost cards carry a best-guess color with an
  inline `// TODO(cost-color)` comment in `src/data/cards/*.ts` — correctable later with a glance at
  the physical/PDF cards. Zero-cost cards are unaffected (0AP behaves identically either color).
- **Framework-only scope, confirmed with the user up front:** every card gets real Draw/Hold/
  Discard, Green/Blue cost-paying, Action-vs-Bonus Stress/Turn-ending consequences, Mission-card
  auto-resolve, and the Hidden battle icon's reveal exemption — but a card's own BESPOKE rules text
  (Adrenaline's free action, Follow Me's auto-rally, etc.) is NOT mechanically simulated. Playing a
  card logs its full name/cost/effect text as a `GameEvent` and applies only the shared consequences
  every card of its type/color shares. This is deliberate scope-narrowing, not an oversight — a
  natural incremental follow-up once specific cards are prioritized.
- **OBA is real, not stubbed** (the user's explicit choice — Artillery Icon Cards are worthless
  without it, and Drift/blast math is pure rules, not bespoke per-card text): `PLAN_OBA_STRIKE`
  (§13.5) queues a Strike for `state.round + 1`; `turn.ts`'s `startRound` automatically resolves any
  due Strike (§13.6-13.9) via `cards.ts`'s `resolveObaStrike` (Drift Check, then one Attack — always
  HE vs Flank Defense — against every non-Hidden Unit in the final marker Hex and its 6 neighbors,
  including friendly Units per §13.8) + `applyResolvedObaStrike` (commits the roll, logs the Drift
  Check and every Attack in full — this **is** the "text read-out" for OBA, since there's no
  marker-on-map UI either). **One documented, engine-internal convention**: the Drift direction's
  1-6 roll maps onto the engine's existing 6-hex `AXIAL_DIRECTIONS` order — the physical Artillery
  Marker's own printed arrow numbering isn't recoverable from the OCR source, so this is our own
  consistent mapping, not a reproduction of print art (the rulebook's own worked-example drift
  *destination* is therefore illustrative flavor only in the test suite, not a literal fixture — the
  Drift Check pass/fail, drift distance = the failed roll's value, and the friendly-fire Attack math
  ARE literal, reproduced fixtures). **CAP mod defaults to 0 for both the Drift Check and the
  follow-up Attacks this pass** — no interactive stepper UI exists for OBA yet (same "framework, not
  full UI" scope), flagged as a follow-up once a real Cards UI lands.
- **One documented simplification for `PLAN_OBA_STRIKE`'s timing**: the rulebook places this action
  "during the Pre-Round Sequence" itself; this engine has no such sub-phase distinct from normal
  Turn-Actions, so it's legal any time during the owning side's own Turn instead — the 1-Round delay
  and Drift/blast mechanics themselves are unaffected, only *when in the Turn cycle* you may declare
  it. It is intentionally free (doesn't end the Turn or Stress a Unit), since in the real rules this
  happens entirely outside the Turn structure to begin with.
- **A genuinely new mechanical wrinkle, scoped narrowly rather than built out fully**: several cards
  (Battle Card #06 Battlefield Confusion, Veteran Cards V05 and V09) are playable "during the
  opponent's Turn" per their own printed text — this engine's every other Action has always been
  strictly `currentSide`-gated. `PLAY_CARD` deliberately has **no** `currentSide` check at all (any
  side may attempt to play from its own hand at any time) — not a full interrupt-stack system, just
  an absence of the usual gate, since per-card interrupt-timing enforcement is itself a
  bespoke-effect concern out of framework scope.
- **A real, live-caught bug, fixed during browser verification (not just Vitest)**: the first
  `playCard`/`planObaStrike` store implementations inferred `side` from `GameState.currentSide`
  rather than from which side's hand panel the click came from — silently denying (mislabeled as
  "card not in hand") any attempt to play a card belonging to the side that *wasn't* currently active,
  which is a normal, intended case for this feature (cards are playable regardless of whose Turn it
  is). Fixed by threading an explicit `side` parameter from `HandPanel.tsx` (which already knows
  whose hand it's rendering) through `playCard`/`armObaCard`/`planObaStrike`, replacing the
  single-`CardId` `armedObaCardId` with `armedObaCard: { side, cardId } | null`. **Lesson: a store
  action that infers "which side" from `currentSide` is wrong for any mechanic that isn't
  strictly turn-gated — cards are the first mechanic in this codebase where that assumption doesn't
  hold**, matching the M13 online-play lesson about not assuming "whose Turn is it" is universal.
- **Data model**: `CardDef` (`engine/types.ts`) — category (`battle`/`weapon`/`veteran`, discard
  rule), type (`action`/`bonus`/`mission`/`artillery`, §8.4 icon), `cost` (absent for mission/
  artillery), `battleIcons` (§8.9: hidden/group/HE), `restrictedTo` (Weapon Cards' own nation/kind
  text), `firepower` (Artillery only). `MissionDef.cardConfig` (battleCardIds, drawPerRound,
  initialHand, obaAllowedRounds) and `MissionDef.missionCardText` are real, consumed fields —
  **supersede**, not duplicate, the old inert `MissionAdvancedNotes.battleCards`/`obaAllowedRounds`/
  `obaStrikes` (now `@deprecated` dead fields, kept only until nothing references them). `GameState`
  gained `cardDeck` (one shared, seeded, shuffled Draw Deck per §8.1 — not per-side), `drawPerRound`,
  `obaAllowedRounds`, `missionCardText`, `pendingObaStrikes` — all carried through by `initGame`
  (which also builds+shuffles the deck via a new `rng.ts` `shuffle` and seeds each side's
  `PlayerState.hand` from `initialHand` — **this wiring was the one genuinely missing piece** after
  types/catalog/reducer/turn/actions were all done; caught only while authoring the verification
  Mission, not by any test, since no prior test exercised `initGame` with a real `cardConfig`).
- **`src/engine/cards.ts`** (new): `buildBattleDeck`/`drawBattleCards` (§8.1/§9.8, Mission-card
  auto-resolve-and-redraw lives here, Halt Order ends the Mission immediately), `canPlayCard` (coarse
  legality, mirrors `directFireZone`'s shape), `resolveDriftCheck`/`resolveObaStrike` (pure, thread
  `RngState` like every other roll)/`applyResolvedObaStrike` (the one mutating, `state`-first
  function here, matching `victory.ts`'s `gainVp`/`turn.ts`'s own direct-mutation convention rather
  than `reducer.ts`'s closure-and-`events`-array pattern — needed since `turn.ts`'s `startRound` has
  no access to `reducer.ts`'s private `applyHit`/`destroyUnit` closures; a documented, narrow
  simplification: a Transport destroyed by OBA doesn't auto-unload its passenger here, unlike
  `reducer.ts`'s own `destroyUnit`, since duplicating that closure-based §15.11 logic wasn't worth
  the coupling for this rare edge case).
- **`turn.ts`'s `startRound`** gained the Draw-Battle-Cards step (§9.4 step 6, right after CAP reset)
  and the Resolve-pending-OBA step (step 9, right before the Initiative roll) — both no-ops for any
  Mission without `cardConfig`. A Halt-Order-triggered Mission end mid-draw short-circuits the rest
  of `startRound` (skips OBA resolution/Initiative, neither of which make sense once the Mission is
  over).
- **Mission Editor**: the Advanced tab's Battle Cards/OBA sections were replaced with a real
  `battleCardIds` checklist (against the full catalog, not just aggregate draw counts), per-side
  Weapon/Veteran `initialHand` checklists, a real `obaAllowedRounds` picker, and a conditional
  `missionCardText` field per Mission-type card actually in the deck. The "⚠ Coming later" banner was
  narrowed to just the still-genuinely-inert Air Support/Terrain Overlays sections underneath.
- **Live UI**: `HandPanel.tsx` (new, mounted per-side in the left sidebar next to
  `ReinforcementsPanel`) — a plain name/cost/effect-text row per held card, a "Play" button (disabled
  with a tooltip for a Green-cost card with no Unit selected), and a "Target… (§13.5)" button for
  Artillery cards that arms `store.ts`'s `armedObaCard` (the next board-hex click plans the Strike,
  reusing `Board.tsx`'s existing `hexClick` dispatch path via a new early-return branch — no new board
  highlighting was added, a small, explicitly-noted gap since any Hex is a legal OBA target anyway).
- **Verified live** (not just Vitest): `Cards Sandbox (test)` mission
  (`data/missions/cardsSandbox.ts` — one of each catalog category/type: '01' Adrenaline
  Action/Green, '12' Swift Action Action/Blue, '18' Score Mission-type with authored
  `missionCardText`, 'W01' Grenades Weapon/German-restricted, 'V06' Iron Will Veteran, 'W06'
  Divisional Artillery). Confirmed in the actual browser: both sides' hands render correctly at
  Round 1 with the right initial-hand + drawn-card counts; a Green Action-type card (Adrenaline)
  played end-to-end — logged, discarded, Unit Stressed, Turn switched to the other side; an Artillery
  card armed, targeted at a Hex, and planned (logged, discarded, queued for Round 2) — and, after
  both sides Passed to end Round 1, Round 2's Pre-Round Sequence automatically resolved the Strike
  (Drift Check succeeded, logged in full) exactly as designed. Full suite (617 tests, later 618 once
  the sound/animation follow-up added its own fixture) + typecheck +
  build + conformance (0 violations) green throughout.
- **CLAUDE.md's own former "do not read the PDF" instruction** (this file's opening paragraph) was
  explicitly overridden by the user for this one build and has been updated accordingly — see the
  opening paragraph's current wording for what's actually in force now.
- **OBA strike landing got real sound + a board animation + a text callout**, on user request
  (follow-up, same session): `GameEvent` gained a generic `hexIds?: HexId[]` presentation-hint field
  (never read by `reduce` — pure UI hint), populated by `cards.ts`'s `applyResolvedObaStrike` with the
  Strike's blast radius (marker Hex + its 6 neighbors, §13.8); `sound.ts` gained `playObaStrike`
  (synthesized boom); `Board.tsx` renders a brief expanding-circle blast per affected Hex, plus a
  "💥 {Nation}'s Off-Board Artillery Strike is resolving… (§13.6-13.9)" callout above the map.
  **A real, live-caught timing bug**: OBA only resolves at Round start (§9.4 step 9), the exact same
  `dispatch` that opens `TurnBanner.tsx` — a blocking, click-OK-to-dismiss modal with no auto-fade —
  so the first version's sound/animation fired and fully finished *underneath* that opaque modal,
  invisible. Fixed by queuing the blast (a ref-backed queue keyed off new `type: 'oba'` log entries)
  and only firing it once `turnBanner` is dismissed, verified live via one atomic script asserting
  zero blast/callout presence while the banner was up, then both appearing within ~40ms of clicking
  OK. Full detail + the generalizable lesson (any log/state-diff-driven sound/animation must check
  for a blocking modal before firing) in memory `conflict-of-heroes-cards-oba`.

---

## 0. Continuing in a new session (handoff)

This repo is self-describing: a fresh session needs only the code + these docs.

- **Canonical location:** `C:\Users\ensch\Git Repos\conflict-of-heroes` (remote `origin` =
  https://github.com/enschell/conflict-of-heroes.git; active branch **`v3-migration`**, not yet
  merged to `main` — deliberate). **Launch Claude Code from this folder** so this CLAUDE.md
  auto-loads.
- **Orient by reading, in order:** this file (golden rules §3, directory map §4, rules index §6,
  roadmap §8), then `README.md`, then **`rules/INDEX.md`** and the specific `rules/NN-*.md` for
  whatever you're building.
- **Authoring a Mission from the Mission Book PDF:** follow
  `docs/extracting-missions-from-the-mission-book.md`.
- **Verify before changing:** `npm install` (first time), then `npm test`, `npm run typecheck`,
  `npm run build`, `npm run conformance`. All green = known-good baseline.
- **Run it:** `npm run dev` → http://localhost:5173. Windows: Node 24 is at
  `C:\Program Files\nodejs` (not on Git Bash's PATH; in PowerShell prepend it).
- **Current status:** the v3 cutover, M5–M11, M13 steps 1-4 (online multiplayer, deployed live on
  Render), and **now M12 (Cards/OBA)** are all done; conformance is at 0 violations. **Every v3 rules
  module is now built** — §8's milestone roadmap has no remaining unbuilt combat module, only M13's
  own follow-up work (opponent-approved undo, real visual design) is still open. **M8 (Hidden Units)
  was built too** (§F — the original "defer to online play" decision was explicitly reversed on user
  request; it's a render-layer-only mechanism, devtools-defeatable, and that tradeoff is accepted,
  not an oversight). §8 has the full detail on every milestone and why each decision was made — read
  that, not this bullet, for specifics.
  Separately from the v3/M-numbered roadmap: the board geometry was migrated pointy-top → flat-top
  (§B, done, every mission/sandbox re-authored onto it); **§C's Mission Editor** and **§D's Map
  Editor** are both built, in-app authoring tools off `SetupScreen` — read their sections before
  touching either again. **§E's Pre-Mission Setup phase** is also built (a Mission-configurable
  pre-Round-1 forces-placement sequence, not a `rules/` chapter) — read it before touching
  `setupForces`/`SETUP_PLACE`/`SetupPanel.tsx` again. **§F's Hidden Units** (§11) is built — read it
  before touching `hidden`/`HIDDEN_MOVE`/`RECON_BY_FIRE`/`hidden.ts` again. **§G's Cards/OBA** (§8,
  §13.4-13.9) is built — read it before touching `cards.ts`/`PLAY_CARD`/`PLAN_OBA_STRIKE`/
  `HandPanel.tsx` again, and before assuming the card catalog is complete (it has ~13 flagged
  best-guess cost colors, see §G).
- **Large-scale self-play testing** (branch `game-testing`, ad-hoc, not a shipped feature): a series
  of AI-vs-AI harnesses in `scripts/selfplay*.ts` (untracked — not part of the app) played tens of
  thousands of games across Mission 1 and the AtB Firefight 9 - KV2 mission, each Action
  independently re-derived from the rules tables (the same oracle technique `scripts/conformance.ts`
  uses) to catch engine/rules disagreement at scale. Full findings in memory
  `conflict-of-heroes-selfplay-testing` — headline results: Mission 1's Germans hold a persistent
  ~85% win rate in heuristic-vs-heuristic play despite the raw Mission (no skill on either side)
  favoring the Soviets, and the KV2 mission is far more lopsided still (Germans 0/2000 across the
  largest run). **Two real, permanent engine bugs this found** (not just test-harness gaps):
  (1) `legalActionsForUnit` (both branches, `src/engine/actions.ts`) and `doRally`
  (`src/engine/reducer.ts`) let a Unit attempt RALLY on a hit marker with no Rally Number — some
  Armored-deck markers (Immobilized, Light Damage, Gun Damaged, §7.7/§15.13) can never be rallied,
  but nothing checked that before this fix, so the Action silently "failed" while still charging a
  full Turn. Mission 1 has no Vehicles, so this path was never exercised until a Mission with
  Armored hit markers existed. Fixed by checking `HIT_MARKERS[...].rally > 0` before offering or
  allowing the Action (defense in depth, matching the check `doGroupRally` already had).
  (2) `legalActionsForUnit`'s own LOAD-action enumeration (`src/engine/actions.ts`) looped over
  every same-side Vehicle as a possible tow vehicle without excluding itself, so a damaged
  (Immobilized/Stunned) Vehicle could be offered — and `doLoad` would accept — a LOAD Action naming
  itself as its own `vehicleId` (`unit.carriedBy = unit.id`). Never exercised before a self-play
  round finally used LOAD/UNLOAD at scale. Fixed with a one-line self-exclusion in both
  `actions.ts`'s enumeration and `reducer.ts`'s own `doLoad` guard.
- **Live hotseat game vs. the user, in progress** (`game-testing` branch, started 2026-07-25): the
  user plays Side A (Germans) by clicking directly in the browser; Claude plays Side B (Soviets),
  on the AtB Firefight 9 - KV2 mission. **Full resume state (exact save name, positions, VP/CAP,
  metrics tallies, turn log) lives in memory `conflict-of-heroes-live-game-vs-user` — read that
  first in any new session before touching this game.** A file-based fallback of the current save
  is committed at `docs/live-game-saves/handoff-round3-actionchooser-fix.json` in case localStorage
  saves aren't available in a fresh browser profile. Three real, live-caught bugs found and fixed
  during this game (all on top of the two self-play bugs above, all still uncommitted on
  `game-testing` pending explicit user request to commit):
  (1) `ger-pz4e` (Panzer IVe) was missing `canFireSmoke: true` in `data/units.ts` despite this
  Mission's own `missionInstructions.A` text explicitly granting it — a data gap, not a rules bug.
  (2) `modifiedActionCost`'s `MOVE` case (`engine/actions.ts`, the UI's CAP-confirm preview) used
  single-hex `moveCost()` even for a Vehicle's multi-hex Bonus-Move `path`, so a Spent Vehicle's
  CAP-paid 0AP multi-hex move never reached the confirm dialog — `capGate` saw a null cost and
  dispatched straight through, which the reducer then correctly denied, reading as a silent "the
  engine won't let me." Fixed by branching to `planVehicleMove` for vehicles, mirroring the
  reducer's own `doMove`. (3) `ActionChooser.tsx`'s `vehicleHere` lookup for the Load (§15.7)
  option matched "the first friendly Unit in the clicked Hex," with no check that it was a Vehicle
  and no self-exclusion — when a Gun (FlaK 88) was stacked with its own tow Truck and the Gun
  itself sorted first, the Load button silently vanished from the chooser (while `store.ts` still
  counted it as a legal option, so the chooser opened anyway, just missing that one entry).
  Root-caused by replaying the user's own save through `legalActionsForUnit` directly before
  touching any UI code, confirming the engine already offered the Load for free — a pure rendering
  bug. Fixed by deriving `vehicleHere` FROM the engine's own LOAD enumeration instead of guessing
  and then matching against it. All three: typecheck clean, full Vitest suite green throughout.

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
  Mines, Road Block, Trenches, Bunkers, Hasty Defenses), Flamethrowers + Pioneers (M11), Hidden
  Units (M8, §F), and Battle/Weapon/Veteran Cards + OBA (M12, §G — framework-only card effects, real
  OBA Drift/blast mechanics) are all built. Every v3 combat rules module is now built.
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
  rules/                    # COMMITTED v3 rulebook reference (source of truth)
    INDEX.md                #   routing index → read the right NN-*.md before coding
    00-overview.md … 19-alternate-player-counts.md
  package.json  vite.config.ts  tsconfig.json  index.html
  render.yaml               # M13: one Render Blueprint (build+start commands, PORT read by server/index.ts)
  public/assets/            # original art + dice SFX
  server/                   # M13: Node online-play server — separate from client-only src/, shares engine/protocol code
    index.ts                #   HTTP static-serve (dist/) + WebSocket relay, wires rooms.ts + engine
    staticServe.ts           #   serveStatic(distDir, url, res) — extracted for independent test coverage
    rooms.ts                #   pure RoomManager (create/join/reconnect/turn-gate)
    __tests__/
  src/
    main.tsx  App.tsx
    net/                    # M13: client↔server WebSocket layer
      protocol.ts           #   ClientMsg/ServerMsg — same TS source imported by src/ AND server/
      client.ts             #   NetClient: thin ws wrapper, reconnect-with-backoff, no game logic
      session.ts            #   getSessionId() — opaque per-browser id in localStorage
    engine/                 # PURE rules engine (see §3)
      types.ts              # shared types (GameState, Unit, Hex, Action, GameEvent…)
      state.ts              # GameState shape, initGame(mission), (de)serialize
      rng.ts                # seeded RNG: roll2d6, rollD6, rollSpentDie, drawHit
      spent.ts              # Spent Die [1,1,2,3,3,4,5,5,6,7] + spentCheck(cost)
      stress.ts             # Stress state + "+1AP if acted last Turn"
      hex.ts                # axial math (flat-top): neighbors, distance, direction, line, arc
      hexBoard.ts            # column/row↔axial bridge, A01-S12 labels, board number, multi-board merge
      terrain.ts            # terrain table → AP cost, DR mod, blocksLOS, isCover
      los.ts                # LOS + arc of fire; visibleHexesFrom(hex); elevation (§12.4-12.6)
      movement.ts           # move cost, facing, pivot, backwards, roads, walls, elevation (§12.2)
      range.ts              # short +3AR (adjacent), long −2AR
      combat.ts             # AR/DR; Hit Number = DR − AR; 2d6 ≥ HN; crit by 4
      hits.ts               # draw marker, apply effects, 2nd hit = destroyed
      rally.ts              # 5AP rally; 2d6 ≥ rally #; +mods; Spent Check after (7.10)
      cap.ts                # reduce cost (−1/CAP, any #; 0AP⇒no check), ±1 d6 (≤2), floor 3
      turn.ts               # Pre-Round Sequence, v3 initiative, act→SpentCheck→Stress, pass/stall
      victory.ts            # VP for kills, objective control, game end (no-tie track)
      actions.ts            # action defs + getLegalActions()
      reducer.ts            # central reduce(state, action) → { state, events }
      groups.ts             # Group Actions §10: connectivity, support, one Spent Check/group
      reinforcements.ts     # M2.5/§4.12: legalEntryHexes (off-Map Units, ENTER)
      setup.ts              # §E: legalSetupHexes — Pre-Mission Setup phase (SETUP_PLACE)
      mortar.ts             # §13: Direct/Indirect Attack fire zones, Spotter Hex, rollIndirectFire
      smoke.ts              # §14: Heavy/Light DR/AR, LOS-path bonus, Rally bonus, dissipation
      obstacles.ts          # §17.7-17.10: rollMinesAttack, minesTargetsFor/OwnerSide, destroysBarbedWire
      fortifications.ts     # §17.1-17.6,17.11-17.12: canOccupy, fortificationDrBonus, rollStructureDestroy
      cards.ts               # §8 Battle/Weapon/Veteran Cards + §13.4-13.9 OBA (Drift/blast), §G
      index.ts              # public engine API surface
      __tests__/            # Vitest
    data/                   # authored content (no logic)
      nations.ts terrainTypes.ts hitMarkers.ts units.ts hexArt.ts
      hexBoardMap.ts         # generateOpenBoard/applyTerrainJson — engine/hexBoard.ts's generator → MapHexDef[]
      terrainArtVariants.ts # §D: decorative art-variant → TerrainId mapping
      maps/mission1.ts   missions/mission1.ts   # Mission 1 "Partisans": setup/reinforcement waves
      missions/sandbox.ts   # non-canonical Armor Sandbox test mission (M6)
      missions/fireSupportSandbox.ts  # non-canonical Fire Support Sandbox test mission (M7)
      missions/hillsSandbox.ts  # non-canonical Hills Sandbox test mission (M9)
      missions/obstaclesSandbox.ts  # non-canonical Obstacles Sandbox test mission (M10 Phase 1)
      missions/fortificationsSandbox.ts  # non-canonical Fortifications Sandbox test mission (M10 Phase 2)
      missions/hexBoardDemo.ts  # §B: proves the flat-top/multi-board substrate — 2 boards, units on the seam
      missions/setupPhaseSandbox.ts  # §E: non-canonical Setup Phase Sandbox test mission — no fixed units, both sides place from a Setup Pool
      missions/catalog.ts    # M13: id -> MissionDef lookup — the online server only ever receives a missionId string
      maps/catalog.ts        # §C/§D: id -> MapCatalogEntry (hexes + optional overlayImage)
      editor/emitMissionSource.ts  # §C: authored editor state -> real self-contained TS MissionDef source
      editor/emitMapSource.ts      # §D: authored map state -> real self-contained TS MapHexDef[] source
      editor/__tests__/
      cards/                 # §G: BATTLE_CARDS/WEAPON_CARDS/VETERAN_CARDS catalog + merged CARD_CATALOG
      __tests__/
    state/  store.ts persistence.ts             # Zustand + localStorage saves; store.ts also owns M13's online dispatch fork
    state/editorStore.ts    # §C: Mission Editor's own small Zustand store
    state/mapEditorStore.ts # §D: Map Editor's own small Zustand store
    ui/     …  ReinforcementsPanel.tsx  SetupPanel.tsx  MinesConfirm.tsx  …  # React + SVG (see §7)
    ui/editor/  MissionEditor.tsx EditorBoard.tsx UnitPicker.tsx sections/*.tsx  # §C: the Mission Editor screen
    ui/mapEditor/  MapEditor.tsx  # §D: the Map Editor screen
  scripts/  play.ts conformance.ts              # terminal driver + v3 conformance audit
  public/hills-los-mockup.html  # kept in repo: interactive §12 LOS validator/reference (M9)
```

> **Current state:** engine/data/state/ui/scripts compile and pass under 3rd-ed (v3) rules
> (conformance 0 violations). Data is the real Mission 1, plus the non-canonical Armor/Fire-Support/
> Hills/Obstacles/Fortifications sandboxes and the Hex Board Demo. `rules/` is the committed source
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
    hand: CardId[]                    // §8/§G — real, drawn/discarded via cards.ts + reducer.ts
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
  mapOverlays?: Record<number, string> // §D: per-board real gameplay art, replaces per-hex tiles
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
| **Battle/Weapon/Veteran Cards** ✅: deck construction/draw/discard (§8.1/§9.8), Green/Blue cost-paying, Action-vs-Bonus Stress/Turn-ending, Mission-card auto-resolve, Hidden battle-icon reveal exemption — framework-only (bespoke per-card effects not simulated); real card catalog transcribed in this file's own Card Catalog section | `cards.ts`, `reducer.ts`, `actions.ts`, `data/cards/` *(§G)* | 8.0–8.9 | `rules/08` |
| Round end, **Pre-Round Sequence (10 steps)**, **Initiative (2d6≥7, non-advantage)**, VP no-tie | `turn.ts`, `victory.ts` | 9.0–9.11 | `rules/09` |
| **Group Actions** (one Spent Check; group move = highest; attack = leader +1AR/supporter) | `groups.ts` *(M5)* | 10.0–10.12 | `rules/10` |
| **Hidden Units** ✅: reveal triggers (any Action but Stall/Rally/Hidden Move, sharing a Hex with a non-Hidden Unit, Open-Terrain LOS+range for Foot, any LOS for Wheeled/Tracked, a successful Recon by Fire), Hidden Move (flat 5AP, becoming-Hidden vs move-while-Hidden), Recon by Fire (independent Reveal-Number/Hit-Number CAP mods) — render-layer-only visibility (hotseat, devtools-defeatable, accepted tradeoff); §11.8 Sniper out of scope | `hidden.ts`, `reducer.ts`, `actions.ts` *(§F)* | 11.x | `rules/11` |
| **Hills/elevation**: move cost (Sloping ±1AP, Steep ±2AP incl. vehicle Steep-impassable-off-road), elevation-aware LOS (Plateau Effect, Blind Spots), Elevation Combat Bonus | `movement.ts`, `los.ts`, `combat.ts` *(M9)* | 12.x | `rules/12` |
| Mortars: Direct/Indirect Attack, Spotter Hex, HE/Air Burst, Spotter Hex Elevation Bonus (M9); **OBA** ✅: Drift Check, blast (target Hex + 6 neighbors, incl. friendly), Artillery Card Firepower (§G) | `combat.ts`, `mortar.ts` *(M7/M9)*, `cards.ts` *(§G)* | 13.0–13.3, 13.9 | `rules/13` |
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
  - **Add a unit:** stat template `{nation, fp:{red,blue}, dr:{front,flank,color}, move, range,
    apToFire, vp, flags, whiteBoxFp?}` in `data/units.ts`. `apToFire`/`move` are Spent-Check
    thresholds, not pool spend. **Vehicles** (`kind:'vehicle'`) add `propulsion:'wheeled'|'tracked'`
    and `bonusMoves?` (§15.1-15.2); any vehicle may Transport one foot Unit (§15.6). A **Mobile
    Vehicle** (§16.4) adds `mobileTrackBonusMoves?` alongside `bonusMoves` (spendable in any order,
    can enter Open Terrain, ignores Road Congestion). **Special Units (§16):** `turreted?`,
    `openTopped?`, `apcTransport?`, `cannotControlHex?`/`noCapLossOnDestroy?`/
    `attackMode?:'closeCombatOnly'|'none'` (Trucks/Wagons). Field Guns are just `kind:'gun'` +
    `propulsion:'wheeled'`. **Mortars (§13):** `kind:'mortar'` adds `minRange?`/`indirectApToFire?`;
    every mortar auto-fires HE. `canFireSmoke?` marks a Unit that may `FIRE_SMOKE`. **Flamethrowers +
    Pioneers (§18):** `hasFlamethrower?` lets a FIRE/CLOSE_COMBAT set `useFlamethrower: true` (flat
    3 red/3 blue FP, max Range 1, always Flank DR, zeroes every DR modifier but Smoke); `pioneer?`
    adds immunity to Mines Attacks + Fire Smoke capped to Range 1. **Counter art (prototype):**
    `counterImage?: string` swaps a Unit's counter to the image-backed `UnitCounter.tsx` layout
    (opt-in; omit to keep the old rendering).
  - **Add a card:** a `CardDef` (`{id, name, category, type, count, cost?, effectText, battleIcons?,
    restrictedTo?, firepower?}`) in `src/data/cards/battleCards.ts`/`weaponCards.ts`/`veteranCards.ts`
    (§G) — real, played via `PLAY_CARD`/`PLAN_OBA_STRIKE`, framework-only (the card's own bespoke
    effect isn't mechanically simulated, only its shared type/cost/discard mechanics).
  - **Add a mission:** new file in `data/missions/`. To build on the flat-top substrate (real
    labels/board number/multi-board merging), start from `data/hexBoardMap.ts`'s
    `generateOpenBoard(boards)` and override hexes by `id` (see `hexBoardDemo.ts`). Hand-authoring a
    bespoke map (Mission 1's approach) still works, it just won't have `label`/`boardNumber`/
    `edgeCut` set.
- **Actions** are plain serializable objects (`engine/types.ts`'s `Action` union): `MOVE`, `PIVOT`,
  `FIRE`/`CLOSE_COMBAT` (+ `capDiceMod?`/`capCostReduce?`/`minesCapMods?`), `RALLY`, `STALL`,
  `PASS`; Group Actions `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY`; Transport `LOAD`/`UNLOAD`;
  reinforcement `ENTER`; Mortar `INDIRECT_FIRE`/`FIRE_SMOKE`; Cards `PLAY_CARD`/`PLAN_OBA_STRIKE`
  (§G — the latter queues an OBA Strike, resolved automatically by `turn.ts`, not itself a roll).
  `minesCapMods` is resolved by the store's Mines CAP-choice dialog (`MinesConfirm.tsx`) *before*
  dispatch, since the Mines' owning side may not be the acting side. **Removed in v3:**
  `ACTIVATE_UNIT`, `MARK_SPENT`.
- **Tests:** colocate in `__tests__/`. Reproduce the v3 red-box examples from `rules/NN-*.md` as
  fixtures — they're worked rule implementations and make excellent oracles. Shared fixture builders
  belong in that directory's own `helpers.ts` (`engine/__tests__/helpers.ts`,
  `state/__tests__/helpers.ts` exist so far — check there before writing a new inline
  scene-builder). Never invent a rule's numbers to "complete" a test — if the real rulebook text
  isn't open, fix the test's premise/title instead of guessing (see memory
  `conflict-of-heroes-test-audit-lessons`).
- **No engine→UI imports.** UI imports engine; never the reverse.

### Requested UI features (all implemented — keep them working)
*(presentation is edition-agnostic; readouts show Fresh/Spent + Stress and the Spent-Check die, not
an AP pool)*

- **Real hex board** ✅ `Board.tsx`/`hexgeo.ts` — flat-top (§B). Board-edge half/quarter-hexes,
  labels, board-number cell are real for boards from `hexBoardMap.ts`'s generator.
- **Main menu (`SetupScreen.tsx`) is a three-panel layout, not one long list of buttons** ✅ Tests
  (left) — every non-canonical sandbox/demo Mission, click-to-start same as before; Missions
  (middle) — only the real, hand-authored Missions (currently Mission 1 and SoS Mission 4);
  clicking one just SELECTS it (green highlight via `.setup__mission-btn.is-selected`), it never
  starts the game. The Play card underneath has its own "Local Hotseat"/"Play Online" choice —
  Hotseat starts the currently-selected Mission immediately; Play Online reveals the existing
  Create-Room/room-code/Join controls (Create now uses the SELECTED Mission's id, not always
  Mission 1). Selecting a Mission renders live details at right, straight from its own `MissionDef`
  — situation text, a ~0.25× map preview (reuses `ui/editor/EditorBoard.tsx`, including overlay art
  and any `mapRotations` spin — a Mission's whole-assembly rotation cluster is synthesized inline
  the same way `computeDisplayRotationCluster` does, since this is a read-only preview with no
  board-list to walk), per-side Starting Forces (fixed placements AND the Setup Pool, labeled
  "placed by the player pre-Round 1"), and Reinforcements per wave. Nothing here reads live
  `GameState` — it's pure `MissionDef` inspection, so it works before any game exists.
- **Mouse wheel pans vertically; Ctrl+wheel zooms, centered on the cursor** ✅ `Board.tsx` (live
  game) and `ui/editor/EditorBoard.tsx` (Mission Editor AND Map Editor, which both render through
  it) each drive their own `<svg>` `viewBox` from `zoom`/`pan` state, clamped `[0.5,4]×`. Plain
  wheel only ever changes `pan.y` (divided by the current zoom, so a given scroll notch moves a
  consistent on-screen distance regardless of zoom level) — it never touches `zoom` at all; Ctrl
  held is what routes into the pre-existing cursor-centered zoom math. `preventDefault()` fires on
  every wheel event before that branch, which also suppresses the browser's own native Ctrl+wheel
  page-zoom, not just page scroll. **Never call `setPan` from inside `setZoom`'s functional
  updater** — `<StrictMode>` double-invokes updaters and would compound the pan math; read/write a
  plain ref and call both setters with already-computed values instead (see memory
  `conflict-of-heroes-strictmode-nested-setstate`).
- **Unit facing (§4.1)** ✅ `UnitCounter.tsx` rotates the whole counter (green top-edge bar = Front)
  via one `<g transform="rotate(...)">`.
- **Free facing correction (§4.5/§15.11)** ✅ after a Move/Group Move or an auto-unload from a
  destroyed Transport, `GameState.pendingFacingChoices` grants a follow-up 0AP `CHOOSE_FACING`
  action — turn-agnostic, closes on the next Action by either side. `Board.tsx` highlights the six
  neighbor Hexes blue as a second way to pick, alongside `Inspector.tsx`'s arrow picker.
- **Facing already governs Arc of Fire, Front/Flank DR, and Backwards-move cost** — no extra code
  needed; `combat.ts`'s `attackContext`/`attackerInTargetFront` and `movement.ts`'s
  `moveCost`/`isInFrontArc` already handle it.
- **Custom per-hex artwork** ✅ `data/hexArt.ts` (`TERRAIN_ART` + `HEX_ART_OVERRIDES`);
  `USE_HEX_ART=false` → flat colors.
- **Under-cursor panel** ✅ `HoverPanel.tsx` — terrain rules + half-size unit renders.
- **LOS visibility mode** ✅ hold Shift → `los.visibleHexesFrom` shades visible hexes.
- **Fire-odds popup** ✅ `ui/odds.ts` — hit%/crit% + AR/DR detail; one row per enemy on a stacked hex.
- **Stacked units / selection** ✅ fanned with ×N badge; Ctrl+click opens `UnitPicker`.
- **Action chooser** ✅ `ActionChooser.tsx` when a hex affords >1 action. Checks rules legality
  directly (`moveCost`/`attackContext`/`closeCombatContext`), not a CAP-gated action list — a Spent
  Unit that can afford one option but not another still gets offered both (see memory
  `conflict-of-heroes-chooser-legality`).
- **Spent-Check / opportunity confirm** ✅ `ConfirmDialog` + the Spent-Check die flow.
- **Turn banner + turn flash** ✅ `TurnBanner.tsx`/`TurnFlash.tsx` — large "{Nation}'s Turn" fade over
  the board (4s), pinned to the board's top edge, waits for `pendingFacingChoices` to clear before
  flashing so it never claims "it's the other side's turn" while a facing pick is still open.
  Verifying a multi-second CSS fade needs ONE atomic script that drives the interaction and polls
  opacity with internal timeouts — never trust several separate tool round-trips against a
  short-lived effect (see memory `conflict-of-heroes-transient-ui-verification`).
- **Readouts + dice in log** ✅ Fresh/Spent + Stress + CAPs; the log prints the actual 2d6/Spent-Die
  results.
- **Animated clickable dice with sound** ✅ `DiceRoller.tsx` — dice show `?` until clicked, then
  settle on the engine-provided (already-rolled) result; never influences the outcome. Also shows an
  AR/DR modifier breakdown (`Modifier[]`, `engine/types.ts`), %-to-hit/crit, and the resulting Hit
  Marker's name/effects via `hits.ts`'s `resolveHit` (the one place that decides a Hit's outcome, so
  preview and commit can't disagree).
- **Pivoting a loaded Vehicle also pivots its passenger** ✅ (§15.7) — one Group Action, one Spent
  Check.
- **Unloading (§15.9) confirms instead of firing silently** ✅ green Unload-target highlight +
  confirm dialog; the Vehicle's own hex opens `ActionChooser` (ambiguous with deselect otherwise).
- **Movement & fire SFX** ✅ `sound.ts` synthesizes audio by `template.kind`; mute toggle.
- **Move-cost hover popup** ✅ (M9) itemizes every AP modifier (`movement.ts`'s
  `MoveCostResult.mods: Modifier[]`) — a random component (e.g. Barbed Wire's 1d6, §17.8) renders
  as `?` and is logged only once the move actually commits, matching the dice-roller's
  "hide it until executed" principle.
- **Illegal-move popup** ✅ hovering an adjacent Hex the Unit can't enter shows `moveCost`'s own
  `reason` string, each one citing its rulebook section.
- **Pivot picker (P key)** ✅ highlights the six neighbor Hexes blue; clicking one issues a real,
  AP-costed `PIVOT` (unlike the free correction above).
- **Mines CAP-choice dialog** ✅ (M10) a Move/Pivot/CC about to trigger a live Mines Hex pauses
  before dispatch — `MinesConfirm.tsx` shows a ±CAP stepper per attacked Unit (CAPs are never spent
  silently — see memory `conflict-of-heroes-cap-confirm`), naming the owning side's nation.
- **Fortifications UI** ✅ (M10) `ActionChooser.tsx` offers "Move & occupy" alongside plain Move, and
  "Close combat the structure" alongside its occupant; `Inspector.tsx` gets Build/Remove Hasty
  Defense buttons; `UnitCounter.tsx` badges "TRENCH"/"BUNK"/"HD".
- **Hopeless-shot block + CAP dice-mod stepper** ✅ `ui/odds.ts`'s `isHopelessShot` hides an
  unhittable-even-with-CAP target from the Fire/CC UI (a UI-only convenience, not a rules change);
  `DiceRoller.tsx` gained a +/− stepper for `capDiceMod` (previously settable on the `Action` type
  but with no UI to actually set it).
- **Flamethrower attack UI** ✅ (M11) `Inspector.tsx` shows a 🔥-prefixed row alongside the normal
  Fire/CC target whenever both are legal, each computing its own AR/DR so the display never shows
  the wrong profile.
- **Image-backed unit counters** ✅ `UnitCounter.tsx`, opt-in via `counterImage` — art fills the
  counter face, stats overlay at fixed positions, hit-marker/Hasty-Defense/Fortification badges
  float above/below (don't drop these when touching this branch — they were lost once already).
  `useId()`, not `unit.id`, drives the `<clipPath>` id (the same Unit can mount twice at once,
  board + HoverPanel/Inspector). Spent dimming (`opacity 0.55`) never washes out the selection ring
  or Stress marker — those are siblings of the dimmed group, not children, since SVG group opacity
  has no per-child override.
- **HoverPanel / Inspector counter previews** ✅ both render the Unit through `UnitCounter` with
  `ignoreFacing`. **Inspector's stat layout is experimental, not locked** — a 3× counter with side
  labels replaced the old text `stats-grid`; Side/Status/Hex-facing/VP have no equivalent in this
  layout.
- **Rally-blocked explanation** ✅ `Inspector.tsx` states why a Hit Unit can't Rally ("sharing a Hex
  with an enemy," "this marker has no Rally Number").
- **Auto-select the incoming side's Stressed Unit** ✅ `store.ts`'s `dispatch()` — whenever
  `currentSide` flips, the new side's Stressed Unit (if any) is auto-selected, below the
  `pendingFacingChoices` auto-select in priority.

---

## 8. Milestone roadmap

- **M0 — Scaffold** ✅ Vite+React+TS, Vitest; `hex.ts`, `types.ts`, `rng.ts`.
- **M1 — Engine core** ✅ terrain, movement/facing, LOS/arc, combat, hits, rally, range, CAP,
  turn/round, victory, `reduce`, `initGame`, `legalActions`.
- **M2 — Mission 1 content** ✅ real Map 1 + "Partisans" (5 rounds, German Round-1 initiative,
  Soviets +1 VP). Superseded by the §B re-author for current facts (CAPs, real terrain/labels).
  **M2.5 — Reinforcements (§4.12)** ✅ real `ENTER` action.
- **M3 — UI** ✅ Zustand + React/SVG board, dice/SFX, log, setup/victory screens, LOS overlay,
  fire-odds popup, hover panel, turn banner. **M3.3** ✅ Close Combat. **M3.4** ✅ conformance audit.
- **M4 — Persistence** ✅ named save slots, JSON export/import, undo/redo; RNG travels with saves.
- **★ M4.5 — v3 cutover** ✅ Spent Die/Check, Fresh/Spent + Stress, CAP floor 3, AR/DR combat, v3
  initiative + no-tie VP. See `docs/v3-migration-plan.md` for rationale.
- **M5 — Group Actions (§10)** ✅ `groups.ts` + `GROUP_MOVE`/`GROUP_ATTACK`/`GROUP_RALLY`, one Spent
  Check per Group. **Group Close Combat (§10.6)** landed later: `GROUP_ATTACK` branches on
  same-hex target, `isValidSupporter` restricts CC support to Units sharing the Leader's hex.
  **Group Move — individual per-member destinations (§10.2/§10.3)** also landed later: a per-member
  destination queue (`groupMoveQueue`/`groupMoveDone`) lets members split to different Hexes, not
  just shift as one formation.
- **M6 — Vehicles + Special Units (§15-16)** ✅ Armored Target hit deck; vehicle movement
  (wheeled/tracked costs, Bonus Moves) with click-to-build-path UI; Transport/Towing; Special Units
  (Turreted, Open-Topped, APC Transport Bonus, Trucks/Wagons). `Armor Sandbox` test mission.
  **§16.4 Mobile Vehicles** (a Wheeled vehicle that also carries Track Bonus Move symbols) added
  later — `movement.ts`'s `classifyBonusStep` tags each Bonus-Move step `'either'` or `'track'` so
  the two symbol types spend in any order. **§16 audit** found two real gaps since fixed:
  Open-Topped/APC Transport Bonus were wired into `closeCombatContext` but not ranged
  `attackContext`/`mortar.ts`'s `rollIndirectFire` (neither rule carves out an HE exception).
- **M7 — Mortars + Smoke (§13-14)** ✅ (Spotter picker deferred — always auto-picks a valid Spotter
  Hex, per §13.3). Direct Attacks reuse `FIRE`; Indirect Attacks are `INDIRECT_FIRE`, resolved via a
  Spotter Hex that supplies LOS while Arc/Range stay keyed to the Mortar's own Hex. `smoke.ts` —
  Heavy/Light DR/AR, LOS blocking, Rally bonus, dissipation; `FIRE_SMOKE` places Heavy Smoke on any
  non-Water Hex whether or not occupied. *Deferred at the time:* **OBA (§13.4-13.9)** waited for the
  real Cards subsystem, since it's specified as Artillery Weapon Cards — both shipped together later
  as M12 (§G).
- **M8 — Hidden Units (§11)** ✅ Originally deferred to online play (locked decision: hotseat shares
  one screen/one `GameState`, so there's no "look away" enforcement short of a genuine per-player
  view) — **reversed on explicit user request**, informed of the tradeoff. Built as exactly the
  "hotseat-only approximation" the original decision warned against (hiding enemy Units from the
  board render by `currentSide`/`activeSide`) — still trivially defeated via devtools, still
  accepted as-is. Full detail in §F: reveal triggers, Hidden Move, Recon by Fire, the
  `finish()`-funnel reveal sweep, and the render-layer visibility filter.
- **M9 — Hills and Elevation (§12)** ✅ Elevation Move Cost Penalty (Sloping ±1AP ascending-only,
  Steep ±2AP both directions, impassable to vehicles off-road unless on a Road); elevation-aware
  `hasLOS` (ties block only if strictly exceeding the higher endpoint's level, except a genuine
  3-way tie never blocks — no L0 special case, see memory `conflict-of-heroes-m9-los-elevation`)
  plus §12.6 Blind Spots; Elevation Combat Bonus (+1AR attacker higher, +1DR target higher).
  Validated interactively in `public/hills-los-mockup.html` before coding (kept as a regression
  reference). `Hills Sandbox` test mission.
- **M10 Phase 1 — Obstacles (§17.7-§17.10)** ✅ Locked decisions (memory
  `conflict-of-heroes-m10-scope`): **Mines are never hidden** (same anti-hide rationale as M8).
  `Hex.features.obstacle` carries `ownerSide` since Mines' CAP modification is paid by whoever
  placed them, not necessarily who triggers them. Barbed Wire adds a real 1d6 via the seeded RNG;
  Barbed Wire/Road Block are impassable to Wheeled **unconditionally** (a Road does NOT negate this
  — that would defeat the point of a Road Block). New store flow (`maybeMinesGate`,
  `MinesConfirm.tsx`) since the Mines' CAP choice belongs to the owning side, not the acting side.
- **M10 Phase 2 — Fortifications (§17.1-17.6, 17.11-17.12)** ✅ Locked decisions: occupancy is a
  per-unit flag (`Unit.occupyingFortification?`), not a hex-side occupant list; Hasty Defense is
  per-Unit (`Unit.hastyDefense?`), not a Hex feature (multiple Units in one Hex can each hold their
  own). §17.11's two-roll destroy needs no new `Action` field — `doFire` re-derives the structure
  roll from `state.rng` after the occupant roll(s), keeping the reducer the sole RNG authority.
  While occupying a Bunker, PIVOT isn't offered at all (locked facing — occupying also forces the
  occupant's facing to the Bunker's, needed since DR/arc math reads `unit.facing` directly).
  `fortifications.ts`: `canOccupy`, `fortificationDrBonus`, `hastyDefenseDrBonus`,
  `rollStructureDestroy`, `closeCombatStructureAr`. `Fortifications Sandbox` test mission.
- **M11 — Flamethrowers + Pioneers (§18)** ✅ `hasFlamethrower?`/`pioneer?` template flags; FIRE/
  CLOSE_COMBAT gained `useFlamethrower?: boolean` (a per-Action choice, not a per-Unit mode). Flat
  3/3 FP, max Range 1, always Flank DR, and — the genuinely new piece of math — every DR modifier
  except Smoke is zeroed (AR-side bonuses are unaffected, since the rule only touches the DEFENSE
  side). `reducer.ts`'s `resolveMines` excludes Pioneers from Mines targeting entirely. New
  `flamethrower.test.ts` reproduces the rulebook's own worked example.
- **M13 — Online Multiplayer** ✅ steps 1-4 done (roadmap deliberately reordered ahead of M12/Cards,
  since Cards need real per-client secret info that only online play can provide). A real Node
  server (`server/`) relays Actions between two browsers over WebSocket; hotseat is completely
  untouched. **Why this needed zero engine changes:** the engine's own golden rules (§3) — pure
  `reduce`, JSON-serializable `GameState`, RNG seeded inside state — meant the server could import
  `reduce`/`initGame` verbatim; the existing dice-roller preview pattern (preview from `state.rng`
  without committing) is already the exact "preview locally, commit authoritatively" shape online
  play needs. Locked decisions: one Render service serves both static client and WS endpoint;
  optimistic client-side apply, server-authoritative broadcast to both; Undo/Redo disabled entirely
  online (opponent-approved undo is a planned fast-follow); shareable room code, no accounts.
  `server/rooms.ts`'s `RoomManager` is pure (no socket objects, unit-tested); the server picks a
  fresh random RNG seed per room (never a Mission's hardcoded test seed). `src/net/protocol.ts` is
  one TS source imported by both client and server so they can't drift on message shape;
  `GameState` is the only game data that crosses the wire (a client just overwrites its local `game`
  with whatever `STATE` delivers — no diff/patch protocol). `store.ts`'s `dispatch()` forks on
  `mode: 'hotseat'|'online'` at its very first line, so the hotseat branch is untouched.
  **Known v1 gap, on purpose:** incoming `STATE` broadcasts don't replay SFX or re-derive
  auto-select logic (the message doesn't carry the originating Action/events) — the opponent
  doesn't hear a sound cue for the other player's move yet.
  **A real bug worth the lesson:** a blanket "is it your Turn" gate (added at the network layer)
  blocked the free `CHOOSE_FACING` correction, since that Action deliberately has no `currentSide`
  check (a normal Action already hands the Turn to the other side before the correction window
  opens). Deleting the gate wholesale would have been wrong too (`PASS` has no `unitId`/side field
  to defend itself with) — the fix exempts `CHOOSE_FACING` specifically and gives it its own
  narrower check (does the target Unit's side match the caller's). **Lesson: don't assume "whose
  Turn is it" is a universal precondition when adding a network-layer check on top of an engine that
  already has its own per-Action legality rules** — read the Action handler's own comments for
  documented exceptions first.
  **Render deployment is done** (`render.yaml`, one Node web service; `tsx` had to move from
  devDependencies to dependencies since some PaaS `npm install` runs skip devDependencies in
  production; `serveStatic`'s SPA fallback was fixed to only apply to extensionless paths, so a
  stale cached `index.html` referencing an old hashed bundle 404s cleanly instead of serving HTML in
  place of missing JS). **Still open:** a real over-the-internet test with a genuinely separate
  second person hasn't been confirmed either way — ask before assuming.
  **Not yet built:** opponent-approved Undo request; the real visual design for the lobby/status UI —
  the only work left in the whole v3/M-numbered roadmap. (M8 Hidden Units and M12 Cards/OBA, both
  formerly entries after M13 here, shipped early/out-of-order on user request — see §F/§G.)
- **M12 — Battle/Weapon/Veteran Cards (§8) + Off-Board Artillery (§13.4-13.9)** ✅ — see §G for the
  full build detail (decisions, data model, live verification). The last remaining unbuilt v3 rules
  module; shipped after M13 steps 1-4, on user request, reversing the original "Cards need real
  per-client secret info that only online play provides" deferral reasoning below — the user
  explicitly asked for the framework-only, render-doesn't-matter version instead of waiting for a
  true secret-hand mechanism, the same kind of tradeoff M8 Hidden Units already accepted.

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
**rules and stats** are facts/ideas (fine to implement);
