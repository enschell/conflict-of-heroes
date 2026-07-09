# Handoff: Hexagonal Play Map (18 × 12, half-hex edges)

## Overview
A rendered hexagonal game/board map: **18 hex-widths east–west × 12 hexes north–south**, with the
east and west edge columns rendered as **vertical half-hexes** so the left/right borders are straight.
The top and bottom borders are also straight (edge hexes are trimmed to halves). Every cell carries a
coordinate label (e.g. `A01`, `M07`, `S12`) and a **board number** in its upper-left cell. A mission
may play on **one or more boards abutted along a shared edge**, whose edge half-hexes merge into full
hexes. This document fully specifies the geometry, labeling, and multi-board abutment so the map can be
regenerated deterministically in any environment.

## About the Design Files
The files in this bundle are a **design reference created in HTML/SVG** — a working prototype that shows
the intended geometry, edge treatment, and labeling. It is **not production code to copy directly**.
The task is to **recreate this map in the target codebase's environment** (React/Canvas, SVG, a game
engine, SwiftUI, server-side image generation, etc.) using that project's established patterns. If no
environment exists yet, choose the most appropriate stack. The geometry math below is framework-agnostic
and is the real deliverable.

- `Hex Map.dc.html` — the prototype. It is a "Design Component" and needs its sibling `support.js`
  runtime to render in a browser; open it directly. Treat it as a visual reference — the authoritative
  algorithm is in this README and in the `renderVals()`/`paintLabels()` methods inside the file.
- `support.js` — runtime needed only to preview the prototype. **Not needed** in the target codebase.

## Fidelity
**High-fidelity** for geometry and labeling (exact, deterministic — reproduce precisely).
**Low-fidelity** for styling (colors/fonts are a neutral placeholder palette — swap for the target
project's design system; only the geometry and labels are prescriptive).

---

## Scope of this spec

This document specifies **only how to draw and treat a board itself** from a game-design
perspective: dimensions, hex geometry, layout, coordinate labels, rotation, and multi-board
abutment. **Terrain, art, and the map editor are out of scope here** — terrain is a separate,
per-map concern: each map is authored in the editor project and shipped as its own
**data list (coord → terrain type) plus the PNG graphics** used to render it. Treat this board
spec as the fixed substrate; terrain data is layered on top of it.

---

## Geometry (authoritative)

Flat-top hexagons (flat top & bottom edges, points to the left and right).

Let `R` = center-to-vertex distance (the one free size parameter; prototype uses `R = 40`). Derived:

| Quantity | Formula | Value at R=40 |
|---|---|---|
| Hex height `h` | `sqrt(3) * R` | ≈ 69.282 |
| Hex width | `2 * R` | 80 |
| Column horizontal pitch | `1.5 * R` | 60 |
| Row vertical pitch (within a column) | `h` | ≈ 69.282 |
| Adjacent-column vertical offset | `h / 2` | ≈ 34.641 |

### Column layout
- **19 columns**, index `c = 0 … 18`.
- Column center x: `cx = c * 1.5 * R`.
- **Even columns** (`c` even) sit at the base vertical position.
- **Odd columns** (`c` odd) are shifted **down by `h/2`** — this offset is what interlocks the hexes.
- A cell center y (before clipping), for row `r`: `cy = h/2 + r*h + (c even ? 0 : h/2)`.

### Full flat-top hex vertices (center `cx, cy`)
```
(cx + R,     cy)
(cx + R/2,   cy + h/2)
(cx - R/2,   cy + h/2)
(cx - R,     cy)
(cx - R/2,   cy - h/2)
(cx + R/2,   cy - h/2)
```

### Straight-edge clip (this is what creates the half-hexes and flush borders)
Clip **every** hex polygon to the axis-aligned rectangle:
```
xL = 0
xR = (19 - 1) * 1.5 * R      // = 27 * R  = 1080 at R=40
yT = h / 2
yB = 12.5 * h
```
Use Sutherland–Hodgman polygon clipping (clip against left, right, top, bottom half-planes in turn).
Drop any resulting polygon with < 3 vertices or near-zero area (degenerate slivers appear on offset
columns at the bottom row and must be discarded).

Effects of the clip:
- **Columns c = 0 and c = 18** (both even, the west & east edges) are cut vertically through their
  centers → **half-hexes** giving straight left/right borders.
- **Even (base) columns**: the top hex is trimmed to a **half-hex** (flush top border) and a matching
  **half-hex is grown at the bottom** (flush bottom border). To produce the bottom half, iterate rows
  `r = 0 … 12` (note: up to 12, not 11) before clipping; the clip trims r=0 to a top-half and r=12 to a
  bottom-half.
- **Odd (offset) columns**: render as 12 **full** hexes, already flush top and bottom.
- **The four corner cells are quarter-hexes**: columns c=0 and c=18 are even, so they are both cut
  vertically (edge half) *and* top/bottom-trimmed — the top-left and top-right corners are unlabeled
  quarter-hexes; the bottom-left (`A12`) and bottom-right (`S12`) corners are labeled quarter-hexes.

### Resulting dimensions
- **East–west:** 18 hex-widths (17 full columns + 2 half-edge columns).
- **North–south:** 12 hexes.

---

## Labeling (authoritative)

Label = **column letter + two-digit zero-padded row number**, e.g. `A01`, `B12`, `M07`, `S12`.

- **Column letter:** `A` (west, c=0) … `S` (east, c=18) — `String.fromCharCode(65 + c)`.
- **Every column is numbered 01 (top) → 12 (bottom).**
- **Even (base) columns** — A, C, E, G, I, K, M, O, Q, S:
  - The **top-edge half-hex is UNLABELED**.
  - `01` = first full cell below it … `11` = last full cell … `12` = the bottom half-hex.
  - (Row index r=0 is the unlabeled top half; labeled cells use number = r, r = 1…12.)
- **Odd (offset) columns** — B, D, F, H, J, L, N, P, R:
  - All 12 cells are full hexes.
  - `01` = top hex … `12` = bottom hex.
  - (Row index r = 0…11; labeled number = r + 1.)

**Board number:** the upper-left cell of each board (`c=0, r=0` — a quarter-hex) carries the board's
**number** (1, 2, …) instead of a coordinate. Render it large and distinct (prototype: 30px bold,
accent color `#b0442c`). See "Multiple boards" below.

Label placement: **small text, horizontally centered, near the TOP of each cell** — x = centroid
(average of vertices' x); y = top-most vertex y + a small inset (prototype uses `+8` at R=40).
Render `text-anchor: middle`, `dominant-baseline: central`, small size (prototype: 9px at R=40).
(The board number is the exception — centered on its cell, large.)

### Why offset columns are +1
Base columns lose their top hex to a half (unlabeled) and gain a bottom half, so their labeled cells
run 01–12 with 12 being a half at the very bottom. Offset columns have no unlabeled top half, so to keep
every column reading 01→12 top-to-bottom, their numbering starts at 01 on the top full hex. Both column
types therefore end at 12 at the bottom edge.

---

## Multiple boards (missions)

A **mission plays on one or more boards.** When multiple boards are used they are **abutted along a
full, same-length edge** — a west/east edge to a west/east edge, or a north/south edge to a north/south
edge (never a short edge to a long edge). Model board placement on a **board-grid** with integer cell
coordinates `(gx, gy)` (gx increases east, gy increases south) and translate each board by:

```
boardW = (cols-1) * 1.5 * R   // = 27R  — horizontal board pitch (east-west abut)
boardH = 12 * h               // vertical board pitch (north-south abut)
originX = gx * boardW
originY = gy * boardH
```

These pitches are chosen so that **the half-hexes on the shared edge of one board line up exactly with
the half-hexes on the abutting board's edge and together form full hexes.** Treat each such merged pair
as a single full hex for play.

### Rendering merged edges
A half-hex should only *look* like a half-hex (tinted `#ddd6c4`) when its edge is **exposed** — i.e. no
other board is abutted on that side. Determine, per board, whether each of its four outer edges has a
neighbor (`boardExists(gx±1, gy)` / `boardExists(gx, gy±1)`); a half-hex on a **shared** edge is drawn
with the normal full-hex fill (`#fbfaf5`) because it visually completes with its partner across the seam.
The geometry is unchanged — still two clipped half-polygons meeting at the seam — only the fill differs.

### Per-board coordinates are retained
Each board keeps its own independent `A01…S12` coordinate system. A merged seam hex therefore has **two**
addresses — e.g. an `S…` address on the board to its west and an `A…` address on the board to its east —
disambiguated by the **board number**. Do not renumber cells across boards; the board number + local
coordinate is the full address (e.g. "Board 2 / A07").

---

## Orientation

The nominal setup is 18 wide × 12 tall, flat-top hexes, half-hex east/west edges. A board (or a whole
abutted assembly) may be **rotated 90° left or right for play** — after a quarter-turn it reads as
12 wide × 18 tall with the half-hex edges on the north/south borders.
**Grid topology, board numbers, and cell labels are unchanged**; only the viewing orientation differs.
Keep the nominal coordinate system as the source of truth and apply rotation as a **display transform**,
not by regenerating labels:
- Rotate the geometry group by `rotate(±90)` and set the viewport bounds to the rotated bounding box.
- **Counter-rotate each text label about its own anchor** (`rotate(∓90, x, y)`) so labels stay upright.

Note the difference between *rotating each board then abutting* vs. *abutting then rotating the whole
assembly* — they place the boards differently. To get "rotated board 2 to the right of rotated board 1"
with a left (CCW) turn, stack the boards north-south in the unrotated board-grid (board 1 at `gy=0`,
board 2 at `gy=1`) and rotate the whole assembly left: a left turn maps "south" → "east", so board 2
lands to board 1's right.

---

## Reference pseudocode

```
R = 40
h = sqrt(3) * R
cols = 19
xL = 0; xR = (cols-1) * 1.5 * R; yT = h/2; yB = 12.5 * h
letters = "ABCDEFGHIJKLMNOPQRS"

for c in 0..18:
  even = (c % 2 == 0)
  for r in 0..12:
    cx = c * 1.5 * R
    cy = h/2 + r*h + (even ? 0 : h/2)
    poly = full_flat_top_hex(cx, cy, R, h)
    poly = clip_to_rect(poly, xL, xR, yT, yB)
    if vertices(poly) < 3 or area(poly) < epsilon: continue   // drop slivers
    draw_polygon(poly)
    if c == 0 and r == 0:                                     // upper-left cell
      draw_board_number(centroid(poly))                       // large, e.g. "1"
      continue
    if even and r == 0: continue                              // top-edge half: no label
    num = even ? r : r + 1                                    // both -> 01..12
    label = letters[c] + zeroPad2(num)
    topY = min(poly.y)
    draw_small_text(x = centroid.x, y = topY + inset, label) // top-centered, small
```

For multiple boards, wrap the whole block in `for each board (gx,gy,n)`, offset all coordinates by
`(gx*boardW, gy*boardH)`, and pass the exposed-edge flags into the fill decision (see "Multiple boards").

## Design Tokens (placeholder styling — replace with target design system)
- Board background: `#ece7db`
- Full-hex fill: `#fbfaf5`
- Half/edge-hex fill: `#ddd6c4`
- Hex stroke: `#4a463d`, width `1.4` (in R=40 user units)
- Coordinate label text: `#4a463d`, `font-size: 9` (R=40 units), top-centered, monospace (`ui-monospace, 'SF Mono', Menlo, monospace`)
- Board number: `#b0442c`, `font-size: 30`, bold, centered on the upper-left cell, monospace
- Header/caption text: `#4a463d` (title), `#8a8474` (caption), monospace

## Assets
None used *in* the map (pure vector geometry + text). Rendered reference images are included:
- `two_boards.png` — two boards abutted east–west (nominal orientation) with merged seam hexes.
- `hex_map_render.png` — the same two boards rotated 90° left for play.

## Files
- `Hex Map.dc.html` — prototype (see `renderVals()` for geometry/label generation and `paintLabels()`
  for how labels are injected as raw SVG `<text>` nodes).
- `support.js` — preview runtime only; not part of the target implementation.
