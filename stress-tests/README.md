# Stress tests

Each file below has a documented mapping and expected outcome. The
machine-checkable half of every expectation (parsing, validation,
grouping, fits) is asserted automatically by `test/stress-files.js`,
which runs as part of the test suite. The visual half (wrapping, layout,
animation timing) needs the panel running inside After Effects.

## Files that must BUILD

| File | Chart | Mapping | Expected outcome |
|---|---|---|---|
| `long-category-labels.csv` | Bar | Category=Category, Value=Value | Builds. Labels render as paragraph text boxes, wrap to multiple lines, and shrink only down to 9 px. If they still can't fit ~3 lines, the chart builds **with a readability warning** naming the problem. No label may attach to the wrong category. |
| `many-series.csv` | Bar | Category=Quarter, Value=Value, Series=Series | Builds with all **12 series** — none silently omitted. Series 7–12 get generated (golden-angle) colors beyond the 6-color theme palette; 12 Color Controls appear on the controller; legend wraps to multiple centered rows. |
| `unsorted-sparse-dates.csv` | Line | X=date, Y=value, Series=series | Builds. Rows are sorted by date within each series (input is shuffled and spans sparse, irregular gaps across 2023-12-25 → 2025-09-14). Two separate paths — North and South are never connected. Date ticks are readable (month/quarter units). |
| `quoted-fields.csv` | Bar | Category=Category, Value=Value | Builds with 5 bars. Quoted commas, escaped `""` quotes, and a newline inside quotes all survive into the category labels verbatim. |
| `value-extremes.csv` | Bar | Category=Category, Value=Value | Builds. Handles 0, 0.0042, −12.75, quoted `"1,234"`, 9 876, −45 210, 2 000 000, quoted `"7,500,000"`, −1 250 000. Zero baseline sits inside the plot; negative bars grow downward from it; Y ticks use thousands separators. |
| `large-row-count.csv` | Scatter | X=x, Y=y, Series=series, Trend=Per series | Builds: 2 500 points in 3 cohorts, three dashed trend lines with R² in their layer names, drawn after the points. Expect AE to take noticeably longer here (thousands of shape groups + keyframes) — that's the point of the test. Consider Stagger=0 to keep the animation under control. |

## Files that must FAIL validation (with a clear message, creating nothing)

| File | Chart | Mapping | Expected error |
|---|---|---|---|
| `duplicate-bar-rows.csv` | Bar | Category=Category, Value=Value, Series=Series | "Duplicate bar … Category "Q1" + Series "A" already appeared at line 2" — duplicates are detected, never silently overlapped. |
| `duplicate-x-no-series.csv` | Line | X=x, Y=y, Series=(none) | "Repeated X value "2" … you must map a Series column". |
| `missing-values.csv` | Bar | Category=Category, Value=Value, Series=Series | Both problems reported at once: empty Value at line 3 ("not numeric") and empty Series at line 4 ("Series is empty"). |

Other covered failure shapes (exercised in `test/tests.js` rather than by a
file here): mixed numeric/date X columns, invalid calendar dates
(`2024-02-30`), one column mapped to two roles, missing mapped columns,
ragged rows, duplicate/empty headers, and single-point lines.
