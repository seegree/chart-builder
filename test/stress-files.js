/*
 * Chart Builder -- verifies every file in stress-tests/ behaves exactly as
 * documented in stress-tests/README.md (which charts build, which fail
 * validation, and why). Loaded after the core modules; run via:
 *   node test/run-tests.js            (runs tests.js + this file)
 *   jsc test/run-tests-jsc.js        (same, from the repo root)
 */

(function () {

    function emit2(s) {
        if (typeof console !== "undefined" && console.log) { console.log(s); }
        else if (typeof print !== "undefined") { print(s); }
    }

    var read = this.__CB_READ_FILE;
    if (!read) { emit2("stress-files: no file reader injected; skipped"); return; }

    var passed = 0, failed = 0, failures = [];
    function ok(cond, name) {
        if (cond) { passed++; }
        else { failed++; failures.push(name); emit2("  FAIL: " + name); }
    }

    function model(file, type, mapping) {
        return CB.Model.build(type, CB.CSV.parse(read("stress-tests/" + file)), mapping);
    }

    function expectError(file, type, mapping, substr, name) {
        try {
            model(file, type, mapping);
            ok(false, name + " -- expected validation error, got success");
        } catch (e) {
            ok(e.name === "ChartBuilderValidationError" &&
               e.message.toLowerCase().indexOf(substr.toLowerCase()) !== -1,
               name + " (got: " + (e.message || e) + ")");
        }
    }

    emit2("== Stress files");

    var m = model("long-category-labels.csv", "bar", { category: "Category", value: "Value", series: null });
    ok(m.categories.length === 6, "long-category-labels: 6 categories build");

    m = model("many-series.csv", "bar", { category: "Quarter", value: "Value", series: "Series" });
    ok(m.seriesNames.length === 12, "many-series: all 12 series kept (none dropped)");
    ok(m.bars.length === 48, "many-series: 48 bars");

    m = model("unsorted-sparse-dates.csv", "line", { x: "date", y: "value", series: "series" });
    ok(m.xType === "date", "unsorted-sparse-dates: date X detected");
    var sortedOK = true, i, si;
    for (si = 0; si < m.series.length; si++) {
        for (i = 1; i < m.series[si].points.length; i++) {
            if (m.series[si].points[i].x <= m.series[si].points[i - 1].x) { sortedOK = false; }
        }
    }
    ok(sortedOK, "unsorted-sparse-dates: sorted strictly ascending within each series");
    ok(m.series.length === 2, "unsorted-sparse-dates: 2 series");

    m = model("quoted-fields.csv", "bar", { category: "Category", value: "Value", series: null });
    ok(m.categories[0] === "Smith, Jones & Co.", "quoted-fields: comma inside quotes");
    ok(m.categories[1] === 'The "Premium" Tier', "quoted-fields: escaped quotes");
    ok(m.categories[2].indexOf("\n") !== -1, "quoted-fields: newline inside quotes");
    ok(m.bars.length === 5, "quoted-fields: all 5 rows parsed");

    m = model("value-extremes.csv", "bar", { category: "Category", value: "Value", series: null });
    ok(m.bars[0].value === 0, "value-extremes: zero");
    ok(m.bars[1].value === 0.0042, "value-extremes: tiny decimal");
    ok(m.bars[2].value === -12.75, "value-extremes: negative decimal");
    ok(m.bars[3].value === 1234, "value-extremes: quoted thousands");
    ok(m.bars[7].value === 7500000, "value-extremes: quoted millions");
    ok(m.yMin < 0 && m.yMax >= 7500000, "value-extremes: extent spans negatives to millions");

    expectError("duplicate-bar-rows.csv", "bar", { category: "Category", value: "Value", series: "Series" },
        "Duplicate bar", "duplicate-bar-rows: rejected with duplicate error");
    expectError("duplicate-x-no-series.csv", "line", { x: "x", y: "y", series: null },
        "must map a Series", "duplicate-x-no-series: rejected, suggests Series mapping");
    expectError("missing-values.csv", "bar", { category: "Category", value: "Value", series: "Series" },
        "not numeric", "missing-values: empty Value rejected");
    expectError("missing-values.csv", "bar", { category: "Category", value: "Value", series: "Series" },
        "Series is empty", "missing-values: empty Series rejected");

    m = model("large-row-count.csv", "scatter", { x: "x", y: "y", series: "series", label: null, trend: "per-series" });
    var total = 0;
    for (si = 0; si < m.series.length; si++) { total += m.series[si].points.length; }
    ok(total === 2500, "large-row-count: 2500 points");
    ok(m.fits.length === 3, "large-row-count: 3 per-series fits");
    ok(m.fits[0].fit.r2 > 0.5, "large-row-count: fit is meaningful (r2=" + m.fits[0].fit.r2 + ")");

    emit2(passed + " passed, " + failed + " failed (stress files)");
    var prev = this.__CB_TEST_RESULT || { passed: 0, failed: 0, failures: [] };
    this.__CB_TEST_RESULT = {
        passed: prev.passed + passed,
        failed: prev.failed + failed,
        failures: prev.failures.concat(failures)
    };
}).call(this);
