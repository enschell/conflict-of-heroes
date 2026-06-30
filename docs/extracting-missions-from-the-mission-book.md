# Extracting a Mission from the Mission Book PDF

How Mission 1 ("Partisans") was read from the Academy Games **Mission Book PDF**
and turned into our own `data/` (map + scenario). Follow this for Mission 2+.

> **Legal:** the Mission Book PDF is copyrighted and lives under `reference/`
> (git-ignored). Raw extracted text/images stay local. Only **our own** curated
> data (`src/data/`) and this methodology are committed — rules/stats/scenario
> setup are facts (fine to implement); art is not copied.

## Tooling (Windows)

- **PyMuPDF** (`pip install pymupdf`, import `fitz`) — render pages to PNG **and**
  extract text. `pdfplumber` is also available. The Read tool **cannot** rasterize
  PDFs here (poppler / `pdftoppm` is not installed), so render to PNG with PyMuPDF
  and then view the PNG.
- **Gotcha — console encoding:** the Windows console is cp1252 and *crashes* when
  you `print()` text containing rulebook glyphs (— ⊘ ٜ …). **Write extracted text
  to UTF-8 files** and read those, instead of printing.

## Step 1 — Locate the mission and read the text

Each mission is ~2 pages: a **forces/orders** page then a **map** page. Mission 1
is PDF pages **4–5** (Mission 2 starts on page 6). Dump page text to files:

```python
import fitz
d = fitz.open('reference/AtB3 Mission Book v46.pdf')
for pi in range(3, 9):  # pages 4..9
    open(f'scratch/mb_p{pi+1}.txt', 'w', encoding='utf-8').write(d[pi].get_text())
```

From the forces/orders page read: **forces** (counters per side, with hex labels
or entry areas), **CAPs/side**, **VP rules** (per-kill, per-round objective
control, scoring rounds), **starting VP**, **round count**, **reinforcement
timing**, **special rules**. The **Round Track** strip (bottom of the page) shows
**Round-1 initiative**, per-round VP, and reinforcement rounds — render it to read
which side has first initiative.

## Step 2 — Render the map page

```python
pg = d[4]                                   # page 5
pg.get_pixmap(matrix=fitz.Matrix(150/72, 150/72)).save('scratch/mb_p5.png')   # full
# 300-dpi quadrant crops are legible enough to read terrain/counters:
r = pg.rect; mx, my = (r.x0+r.x1)/2, (r.y0+r.y1)/2
for name, clip in {'TL': fitz.Rect(r.x0,r.y0,mx,my), ...}.items():
    pg.get_pixmap(matrix=fitz.Matrix(300/72,300/72), clip=clip).save(f'scratch/mb_p5_{name}.png')
```

The map page gives: the **mission-info icons** (Battle Cards at R1 / +per round,
CAPs, starting VP), the **terrain legend**, **unit placements + facings**, the
**Control/objective hex(es)**, and **entry/reinforcement areas**.

> **Key limitation:** per-hex coordinate labels (I06, B01 …) are **not** legibly
> printed on the Mission Book map art — only a few named hexes are called out. The
> full coordinate grid is on the physical Map board. So **terrain must be
> transcribed by eye** (with the user's help), not OCR'd.

## Step 3 — Coordinate system (label ↔ axial)

The board is **19 rows lettered A (south/bottom) … S (north/top)**, **12 columns
01–12 (west→east)**. Rows alternate **FULL** (B,D,…,R) and **HALF-hex** (A,C,…,S);
each half-hex row has one leading **unnamed** half-hex (`n/a`), so its playable
hexes are labelled 01–12 *after* it. Map label → engine pointy-top axial:

```
r = 18 - LETTERS.indexOf(letter)         // A=18 (south) … S=0 (north); north = smaller r
q = (r % 2 === 1) ? col - (r-1)/2        // full rows (r odd) are flush
                  : col - r/2            // half rows (r even) offset half a hex
```

Verify by checking a known hex's neighbours through the engine, e.g. **I06 (1,10)**
borders **H05/H06/I05/I07/J05/J06**. This is implemented in
`src/data/maps/mission1.ts` (`axialForLabel`/`hexIdForLabel`).

## Step 4 — Transcribe terrain (the manual part)

1. Render the map with a **computed grid + labels overlaid** (PyMuPDF
   `page.new_shape().draw_circle(...)` + `insert_text`, then `get_pixmap`).
   Iterate the grid params until the dots sit on hex centres — **anchor on a
   known printed hex** (e.g. the I06 Control hex).
2. Zoom region-by-region and record a terrain letter per hex into a row-string
   grid: `O`=open, `R`=road (open+road), `L`=light woods, `H`=heavy woods,
   `.`=off-board/clipped half-hex. (We captured this in
   `reference/missions/mission1-terrain.md`, git-ignored, filled with the user.)
3. **Verify before encoding** with a small parser: playable-hex count, named-hex
   terrain, I06 adjacency, and no duplicate `(q,r)`.

## Step 5 — Encode our data

- **Map:** `src/data/maps/<map>.ts` — terrain as readable row strings + the
  `axialForLabel` builder producing `MapHexDef[]` (id, terrain, road, label).
  Test it (`mission1-map.test.ts`): hex count, named-hex terrain, adjacency.
- **Mission:** `src/data/missions/<mission>.ts` — a `MissionDef`: `caps`,
  `roundsTotal`, `firstInitiative`, `startVp` (e.g. Mission 1 Soviets `{B:1}`),
  `vpPerKill`, `victoryHexes`, `units` (placements via `hexIdForLabel`),
  `templates`. Wire it into the start screen / loader and add a `<mission>.test.ts`.
- **Engine gaps → stopgap, clearly noted:** reinforcements / map-edge entry
  (§4.12, §9.9), hidden units (§11), and cards (§8) aren't built yet. Pre-place
  on-board what would otherwise enter, and leave a comment + roadmap note.

## Mission 1 result (for reference)

5 rounds · **7 CAPs/side** · **German Round-1 initiative** · **Soviets start +1 VP**
· **1 VP per enemy Unit destroyed** · objective **I06** scores **1 VP/round** to
its controller. Forces: German 2×MG34 + 2×Rifles (R1, enter south edge B01–B12) +
SS Pioneer (R3, near R01); Soviet 1×Maxim (K02) + 3×Rifles (L08/M05/N10) setup +
2×Rifles (R2 at road hex R07). Stopgap pre-places the German R1 platoon on row B;
R2/R3 reinforcements deferred until edge-entry exists. No cards (taught pre-cards).
