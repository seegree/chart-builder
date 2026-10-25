# Chart Builder

A dockable After Effects ScriptUI panel that imports CSV data and generates
**editable, animated, native shape and text layers** — bar, grouped bar,
line, multi-series line, and scatter charts with optional least-squares
trend lines. Generated charts are plain AE layers driven by Color Controls
on a controller null: they remain fully functional and editable on any
machine **without the panel installed**.

```
chart-builder/
├── ChartBuilder.jsx          the panel (includes everything in lib/)
├── lib/
│   ├── core/                 pure logic — also runs in Node/jsc for tests
│   │   ├── util / json / dates / csv / scales / regression
│   │   ├── themes / mapping / model / persist
│   └── ae/                   After Effects DOM code
│       ├── ae-util / controller / chrome
│       └── renderer-bar / renderer-line / renderer-scatter
├── sample-data/
│   ├── current/              one CSV per implemented renderer
│   └── future/               only explicitly unimplemented renderers
├── stress-tests/             hostile CSVs + expected outcomes (see its README)
└── test/                     test suite runnable outside AE
```

## Installation

1. Copy **both** `ChartBuilder.jsx` **and the entire `lib/` folder** into the
   ScriptUI Panels folder (the `lib/*.jsxinc` files are resolved relative to
   the .jsx at load time, and won't appear in the Window menu themselves):
   - macOS: `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`
   - Windows: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
2. In AE, enable **Preferences ▸ Scripting & Expressions ▸ Allow Scripts to
   Write Files and Access Network** (needed to read CSVs).
3. Restart AE and open **Window ▸ ChartBuilder.jsx**. The panel docks like
   any native panel. (Run via File ▸ Scripts instead and it opens as a
   floating palette — also fine.)

## Workflow

1. **Data ▸ Import CSV…** — pick a file. The filename and row count appear
   next to the button; the full path is stored on the chart. Headers must be
   unique and non-empty. Quoted fields, `""` escapes, commas/newlines inside
   quotes, and blank-line removal follow RFC-4180 conventions.
2. **Chart** — pick Type (Bar / Line / Scatter), Theme (swatches preview the
   palette inline), Title, and Width/Height (defaults 1600×800).
3. **Column Mapping** — only the controls relevant to the selected renderer
   are shown (hidden rows collapse entirely). Common headers are auto-mapped
   (`category`, `quarter`, `value`, `x`, `y`, `date`, `series`, `label`, …);
   every control has a tooltip and each renderer shows one-line guidance.
4. **Animation** — Duration and Stagger in seconds. Animation starts at the
   **current playhead time**, with easing.
5. **Create Chart** — re-reads the CSV from disk, validates everything, and
   builds the chart in the active comp (or a new comp when none is open).
   Validation failures create **nothing** — never a partial chart.

### Column mappings

| Renderer | Required | Optional |
|---|---|---|
| **Bar** | Category (text), Value (numeric) | Series — groups bars side-by-side per category and colors them |
| **Line** | X (numeric or ISO date), Y (numeric) | Series — *required* when rows share an X value |
| **Scatter** | X (numeric or ISO date), Y (numeric) | Series, Point label, Trend line (None / Overall / Per series) |

Rules enforced before anything is built:

- Numeric columns accept `12`, `-3.5`, `0.0042`, `1e6`, and quoted
  thousands like `"1,234,567.89"`. Anything else is an error naming the
  offending line.
- Dates are **strict ISO `YYYY-MM-DD`** real calendar dates
  (`2024-02-30` and `2024-1-05` are rejected). An X column must be entirely
  numeric or entirely dates.
- Duplicate **Category+Series** bar rows and repeated **X within a line
  series** are errors (with line numbers), not silent overlaps.
- A column can fill only one mapping role; mapped Series/Category cells may
  not be empty.

## Generated chart structure

Every chart is one **controller null** (`Chart ▸ <title> [id]`) plus child
layers parented to it:

- The controller's **visibility switch starts off**; its layer comment
  stores the CSV path, mappings, and full configuration.
- Its effects are live **Color Controls**: `Background`, `Text`, `Grid`,
  `Axis`, and one `Series N Color` per series. Every generated fill, stroke,
  text color, legend marker, and trend line is wired to these via
  expressions — **drag a swatch and the whole chart recolors instantly**, no
  refresh needed.
- Bars grow from the zero baseline (negatives grow downward), lines draw on
  with Trim Paths while markers pop in as the line front reaches them,
  scatter points scale/fade in per observation, and trend lines draw after
  the points finish.
- Axis/tick/category/legend text is positioned by measuring
  `sourceRectAtTime` — Y labels centered on gridlines, X labels centered on
  ticks, category labels (real wrapping paragraph boxes) centered beneath
  their complete bar group, titles centered in the header band, legend
  markers centered against their label text, and at least one line-height
  of clear space under the X labels.
- The legend packs **measured** text widths into centered rows. With more
  series than theme colors, extra distinguishable colors are generated
  (golden-angle hues) — series are never silently dropped.

## Refresh behavior

Select a chart's controller **or any one of its child layers** and press
**Refresh Selected**:

1. The stored CSV path is **re-read from disk** and re-validated. If
   validation fails (or the file moved), you get the error and the existing
   chart is left untouched.
2. The chart is rebuilt with its stored mappings/size/title — structural
   changes in the data (new rows, new series, new extents) appear.
3. **Custom colors survive**: current Color Control values are carried over.
   The panel's theme is re-applied **only when you intentionally changed the
   Theme dropdown** since the last create/refresh. New series beyond the
   carried-over set take theme colors.
4. The original animation start time and chart position are preserved.

## Themes

| Theme | Notes |
|---|---|
| Midnight | dark UI-style palette |
| Light | white background, saturated accents |
| Editorial | warm paper background, muted inks |
| Tech | deep navy with cyan accents: `#001C47` bg, `#FFFFFF` text, `#005487` grid, `#00A9E0` axis, series `#0076A8 #00A9E0 #B7312C #715091 #48A23F #D78825` |

Swatches for background/text/grid/axis/series show inline next to the Theme
dropdown. Themes only set the *initial* Color Control values — recolor any
chart afterwards directly on its controller.

## Samples & stress tests

- `sample-data/current/` — `bar`, `bar-grouped`, `line`, `line-multi`,
  `scatter`, `scatter-trend` (one per implemented renderer/variant).
- `sample-data/future/` — data **only** for explicitly unimplemented
  renderers (pie, stacked area).
- `stress-tests/` — long labels, 12 series, unsorted sparse dates, quoting
  torture, value extremes, duplicates, missing values, 2 500 rows — each
  with its mapping and expected outcome documented in
  [stress-tests/README.md](stress-tests/README.md).

## Testing outside After Effects

The `lib/core` modules are environment-agnostic and the suite (194
assertions) covers the CSV parser, ISO date handling, OLS regression +
segment clipping, tick generation (numeric + date), config persistence
round-trips, theme colors, grouping, and validation — plus a parse-only
syntax check of every file the panel loads:

```sh
node test/run-tests.js        # with Node
node test/check-syntax.js
# no Node? macOS ships JavaScriptCore: (run from the repo root)
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test/run-tests-jsc.js
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test/check-syntax.js
```

> **Important:** these tests verify logic and syntax only. Final visual and
> performance verification — layout, sourceRect measurements, animation
> feel, large-chart responsiveness — still requires running the panel
> inside After Effects.

## Limitations

- **Renaming the controller layer breaks the color wiring** — the
  expressions reference it by name. Rename it back (or re-create the chart)
  to restore live colors. Everything else about the chart keeps working.
- Refresh resolves the controller from itself or a **directly parented**
  child; if you re-parent chart layers under something else, select the
  controller itself.
- Box-text measurement (`sourceRectAtTime` on paragraph text) is slightly
  approximate in some AE versions; category label spacing may need a nudge
  in extreme cases.
- Trend lines require ≥ 2 points with varying X per fit; unfittable
  series are skipped **with a warning**, never silently.
- Charts use the default `ArialMT` font when available; change type
  per-layer afterwards as you would any AE text (labels are ordinary text
  layers).
- Very large datasets (thousands of rows) build thousands of shape groups
  and keyframes; AE will be slow. See `stress-tests/large-row-count.csv`.
- Pie and stacked-area renderers are **not implemented** (see
  `sample-data/future/`).
