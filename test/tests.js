/*
 * Chart Builder — runtime-agnostic test definitions.
 * Expects the CB modules (lib/core/*.jsxinc) to be loaded as globals first.
 * Works under Node (via test/run-tests.js) and JavaScriptCore's jsc
 * (via test/run-tests-jsc.js). Sets __CB_TEST_RESULT when done.
 */

function emit(s) {
    if (typeof console !== "undefined" && console.log) { console.log(s); }
    else if (typeof print !== "undefined") { print(s); }
}

var passed = 0, failed = 0, failures = [];

function ok(cond, name) {
    if (cond) { passed++; }
    else { failed++; failures.push(name); emit("  FAIL: " + name); }
}

function eq(actual, expected, name) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    ok(a === e, name + (a === e ? "" : "  expected " + e + " got " + a));
}

function approx(actual, expected, tol, name) {
    ok(Math.abs(actual - expected) <= tol, name + " (expected ~" + expected + ", got " + actual + ")");
}

function throwsValidation(fn, nameSubstr, testName) {
    try {
        fn();
        ok(false, testName + " — expected a ValidationError but none was thrown");
    } catch (e) {
        var msg = e.message || String(e);
        ok(e.name === "ChartBuilderValidationError", testName + " — error type (" + e.name + ": " + msg + ")");
        if (nameSubstr) {
            ok(msg.toLowerCase().indexOf(nameSubstr.toLowerCase()) !== -1,
                testName + " — message mentions \"" + nameSubstr + "\" (got: " + msg + ")");
        }
    }
}

function section(name) { emit("== " + name); }

// --- Util -------------------------------------------------------------------
section("Util");
eq(CB.Util.trim("  a b \t"), "a b", "trim");
eq(CB.Util.formatNumber(1234567.891, 1), "1,234,567.9", "formatNumber thousands");
eq(CB.Util.formatNumber(-1234, 0), "-1,234", "formatNumber negative");
eq(CB.Util.formatNumber(0.5, 2), "0.50", "formatNumber decimals");
eq(CB.Util.parseNumber("12"), 12, "parseNumber int");
eq(CB.Util.parseNumber("-3.5"), -3.5, "parseNumber negative decimal");
eq(CB.Util.parseNumber("+7"), 7, "parseNumber plus sign");
eq(CB.Util.parseNumber(".5"), 0.5, "parseNumber bare decimal");
eq(CB.Util.parseNumber("1e6"), 1000000, "parseNumber exponent");
eq(CB.Util.parseNumber("1,234,567.89"), 1234567.89, "parseNumber comma thousands");
eq(CB.Util.parseNumber("2,000,000"), 2000000, "parseNumber millions");
eq(CB.Util.parseNumber("1,23"), null, "parseNumber bad grouping rejected");
eq(CB.Util.parseNumber("abc"), null, "parseNumber text rejected");
eq(CB.Util.parseNumber(""), null, "parseNumber empty rejected");
eq(CB.Util.parseNumber("12px"), null, "parseNumber trailing junk rejected");

// --- JSONX ------------------------------------------------------------------
section("JSONX");
var obj = { a: 1, b: "two \"quoted\" \\ slash\nnewline", c: [1, 2.5, null, true, false], d: { nested: "ok" }, e: -0.25 };
var roundTripped = CB.JSONX.parse(CB.JSONX.stringify(obj));
eq(roundTripped, obj, "JSONX round trip");
eq(CB.JSONX.parse('{"x": [1, {"y": "z"}]}'), { x: [1, { y: "z" }] }, "JSONX parse whitespace");
eq(CB.JSONX.parse('"\\u00e9\\n"'), "é\n", "JSONX unicode escape");
ok((function () { try { CB.JSONX.parse("{bad}"); return false; } catch (e) { return true; } })(), "JSONX rejects malformed");

// --- Dates ------------------------------------------------------------------
section("Dates");
eq(CB.Dates.parseISO("1970-01-01"), 0, "epoch day 0");
eq(CB.Dates.parseISO("1970-01-02"), 1, "epoch day 1");
eq(CB.Dates.parseISO("2024-02-29"), CB.Dates.daysFromCivil(2024, 2, 29), "leap day valid");
eq(CB.Dates.parseISO("2023-02-29"), null, "non-leap Feb 29 rejected");
eq(CB.Dates.parseISO("2024-13-01"), null, "month 13 rejected");
eq(CB.Dates.parseISO("2024-00-10"), null, "month 0 rejected");
eq(CB.Dates.parseISO("2024-04-31"), null, "April 31 rejected");
eq(CB.Dates.parseISO("2024-1-05"), null, "non-padded month rejected (strict)");
eq(CB.Dates.parseISO("05/01/2024"), null, "US format rejected");
eq(CB.Dates.formatISO(CB.Dates.parseISO("2024-06-09")), "2024-06-09", "format round trip");
// round-trip a swath of days
var rtOK = true;
for (var d = -800; d <= 25000; d += 137) {
    var c = CB.Dates.civilFromDays(d);
    if (CB.Dates.daysFromCivil(c.y, c.m, c.d) !== d) { rtOK = false; break; }
}
ok(rtOK, "civil/days round trip across range");
// cross-check against JS Date (UTC) for sanity
var jsOK = true;
for (var d2 = 0; d2 <= 40000; d2 += 311) {
    var c2 = CB.Dates.civilFromDays(d2);
    var js = new Date(d2 * 86400000);
    if (js.getUTCFullYear() !== c2.y || js.getUTCMonth() + 1 !== c2.m || js.getUTCDate() !== c2.d) { jsOK = false; break; }
}
ok(jsOK, "civilFromDays matches JS UTC Date");

// --- CSV --------------------------------------------------------------------
section("CSV");
var t = CB.CSV.parse('a,b,c\n1,2,3\n4,5,6\n');
eq(t.headers, ["a", "b", "c"], "basic headers");
eq(t.rows, [["1", "2", "3"], ["4", "5", "6"]], "basic rows");
eq(t.rowLines, [2, 3], "row line numbers");

t = CB.CSV.parse('name,note\n"Smith, John","She said ""hi"" twice"\nplain,ok');
eq(t.rows[0], ["Smith, John", 'She said "hi" twice'], "quoted comma + escaped quotes");
eq(t.rows[1], ["plain", "ok"], "plain row after quoted");

t = CB.CSV.parse('a,b\r\n1,2\r\n\r\n\r\n3,4\r\n');
eq(t.rows, [["1", "2"], ["3", "4"]], "CRLF + empty line removal");
eq(t.rowLines, [2, 5], "line numbers skip blank lines");

t = CB.CSV.parse('a,b\n"multi\nline",2\n');
eq(t.rows[0][0], "multi\nline", "newline inside quotes");

t = CB.CSV.parse('﻿a,b\n1,2');
eq(t.headers, ["a", "b"], "BOM stripped");

throwsValidation(function () { CB.CSV.parse("a,,c\n1,2,3"); }, "empty", "empty header rejected");
throwsValidation(function () { CB.CSV.parse("a,A\n1,2"); }, "duplicate", "duplicate header rejected (case-insensitive)");
throwsValidation(function () { CB.CSV.parse("a,b\n1,2,3"); }, "expected 2 fields", "ragged row rejected");
throwsValidation(function () { CB.CSV.parse('a,b\n"unclosed,2'); }, "never closed", "unterminated quote rejected");
throwsValidation(function () { CB.CSV.parse("a,b"); }, "no data rows", "header-only rejected");
throwsValidation(function () { CB.CSV.parse("\n\n\n"); }, "no data", "blank file rejected");

// --- Scales -----------------------------------------------------------------
section("Scales");
var sc = CB.Scales.linear(0, 10, 0, 100);
eq(sc(5), 50, "linear scale midpoint");
eq(sc(0), 0, "linear scale min");
var nt = CB.Scales.niceTicks(0, 97, 5);
eq(nt.ticks, [0, 20, 40, 60, 80, 100], "niceTicks 0..97");
eq(nt.decimals, 0, "niceTicks decimals integer step");
nt = CB.Scales.niceTicks(-43, 81, 5);
ok(nt.min <= -43 && nt.max >= 81, "niceTicks covers domain");
ok(CB.Util.indexOf(nt.ticks, 0) !== -1, "niceTicks crosses zero includes 0");
nt = CB.Scales.niceTicks(0, 0.0042, 5);
ok(nt.decimals >= 3, "niceTicks small values decimals");
nt = CB.Scales.niceTicks(7, 7, 5);
ok(nt.ticks.length >= 2, "degenerate domain widened");
var tw = CB.Scales.ticksWithin(3, 97, 5);
ok(tw.ticks[0] >= 3 && tw.ticks[tw.ticks.length - 1] <= 97, "ticksWithin stays inside");
eq(CB.Scales.formatTick(0.1 + 0.2, 1), "0.3", "formatTick snaps FP noise");
eq(CB.Scales.formatTick(2000000, 0), "2,000,000", "formatTick millions");

var dmin = CB.Dates.parseISO("2024-01-15"), dmax = CB.Dates.parseISO("2024-03-20");
var dt = CB.Scales.dateTicks(dmin, dmax, 6);
ok(dt.ticks.length >= 2 && dt.ticks.length <= 8, "dateTicks ~2 months count (" + dt.ticks.length + ")");
ok(dt.ticks[0].v >= dmin && dt.ticks[dt.ticks.length - 1].v <= dmax, "dateTicks within range");
dt = CB.Scales.dateTicks(CB.Dates.parseISO("2018-03-01"), CB.Dates.parseISO("2025-11-30"), 6);
eq(dt.unit, "year", "multi-year span uses year ticks");
eq(dt.ticks[0].label, "2020", "year tick label (2-year step over ~8y span)");
dt = CB.Scales.dateTicks(CB.Dates.parseISO("2024-06-01"), CB.Dates.parseISO("2024-06-10"), 6);
ok(dt.unit === "day" || dt.unit === "week", "short span uses day/week ticks");
ok(dt.ticks[0].label.indexOf("2024") !== -1, "first day tick carries year");

// --- Regression -------------------------------------------------------------
section("Regression");
var fit = CB.Regression.ols([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
approx(fit.slope, 2, 1e-12, "perfect line slope");
approx(fit.intercept, 1, 1e-12, "perfect line intercept");
approx(fit.r2, 1, 1e-12, "perfect line r2");
fit = CB.Regression.ols([{ x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 4 }, { x: 4, y: 3 }, { x: 5, y: 6 }]);
approx(fit.slope, 1, 1e-9, "noisy slope");
ok(fit.r2 > 0 && fit.r2 < 1, "noisy r2 in (0,1)");
eq(CB.Regression.ols([{ x: 1, y: 1 }]), null, "single point -> null");
eq(CB.Regression.ols([{ x: 2, y: 1 }, { x: 2, y: 5 }]), null, "constant X -> null");
fit = CB.Regression.ols([{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 9, y: 4 }]);
approx(fit.slope, 0, 1e-12, "constant Y slope 0");
approx(fit.r2, 1, 1e-12, "constant Y r2 defined as 1");

var clip = CB.Regression.clipSegment(-10, 50, 110, 50, { l: 0, t: 0, r: 100, b: 100 });
eq([clip.x1, clip.x2], [0, 100], "clip horizontal overshoot");
eq(CB.Regression.clipSegment(-10, -10, -5, -5, { l: 0, t: 0, r: 100, b: 100 }), null, "clip fully outside -> null");
clip = CB.Regression.clipSegment(50, -100, 50, 200, { l: 0, t: 0, r: 100, b: 100 });
eq([clip.y1, clip.y2], [0, 100], "clip vertical");

// --- Themes -----------------------------------------------------------------
section("Themes");
eq(CB.Themes.names(), ["Midnight", "Light", "Editorial", "Tech"], "theme names");
var mw = CB.Themes.byName("Tech");
eq(CB.Colors.rgbToHex(CB.Colors.hexToRgb(mw.bg)), "#001C47", "Tech bg");
eq(mw.text, "#FFFFFF", "Tech text");
eq(mw.grid, "#005487", "Tech grid");
eq(mw.axis, "#00A9E0", "Tech axis");
eq(mw.series, ["#0076A8", "#00A9E0", "#B7312C", "#715091", "#48A23F", "#D78825"], "Tech series palette");
eq(CB.Colors.hexToRgb("#FF0000"), [1, 0, 0], "hexToRgb red");
eq(CB.Colors.rgbToHex([0, 0.5019607843137255, 1]), "#0080FF", "rgbToHex");
// generated colors beyond the palette: distinct from each other and defined
var gen = [], gi;
for (gi = 0; gi < 14; gi++) { gen.push(CB.Colors.rgbToHex(CB.Themes.seriesColor(mw, gi))); }
var genSet = {};
var genDistinct = true;
for (gi = 0; gi < gen.length; gi++) {
    if (genSet[gen[gi]]) { genDistinct = false; }
    genSet[gen[gi]] = true;
}
ok(genDistinct, "14 series colors all distinct (" + gen.join(" ") + ")");
eq(gen[2], "#B7312C", "first 6 match theme palette");

// --- Mapping ----------------------------------------------------------------
section("Mapping");
var am = CB.Mapping.auto("bar", ["Quarter", "Sales", "Region"]);
eq(am, { category: "Quarter", value: "Sales", series: "Region" }, "bar auto-map quarter/sales/region");
am = CB.Mapping.auto("line", ["Date", "Value", "Series"]);
eq(am, { x: "Date", y: "Value", series: "Series" }, "line auto-map date/value/series");
am = CB.Mapping.auto("scatter", ["x", "y", "label"]);
eq(am.x, "x", "scatter x");
eq(am.y, "y", "scatter y");
eq(am.label, "label", "scatter label");
eq(am.series, null, "scatter series unmapped");
am = CB.Mapping.auto("bar", ["foo", "bar"]);
ok(am.category !== null && am.value !== null && am.category !== am.value, "required fields fall back to distinct headers");

// --- Model: bar -------------------------------------------------------------
section("Model: bar");
function table(csv) { return CB.CSV.parse(csv); }

var m = CB.Model.buildBar(table("cat,val\nQ1,10\nQ2,-5\nQ3,0\nQ4,2.5"), { category: "cat", value: "val", series: null });
eq(m.categories, ["Q1", "Q2", "Q3", "Q4"], "bar categories in order");
eq(m.seriesNames, ["val"], "bar implicit series named after value column");
eq(m.bars.length, 4, "bar count");
ok(m.yMin <= -5 && m.yMax >= 10, "bar extent includes negatives");
ok(m.yMin <= 0 && m.yMax >= 0, "bar extent includes zero");

m = CB.Model.buildBar(table("cat,val,ser\nQ1,1,A\nQ1,2,B\nQ2,3,A\nQ2,4,B"), { category: "cat", value: "val", series: "ser" });
eq(m.seriesNames, ["A", "B"], "grouped bar series");
eq(m.bars[3].ci, 1, "grouped bar category index");
eq(m.bars[3].si, 1, "grouped bar series index");

throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\nQ1,10\nQ1,20"), { category: "cat", value: "val", series: null });
}, "Duplicate bar", "duplicate category without series rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val,ser\nQ1,1,A\nQ1,2,A"), { category: "cat", value: "val", series: "ser" });
}, "Duplicate bar", "duplicate category+series rejected");
// same category in two different series is fine:
m = CB.Model.buildBar(table("cat,val,ser\nQ1,1,A\nQ1,2,B"), { category: "cat", value: "val", series: "ser" });
eq(m.bars.length, 2, "same category across series allowed");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\nQ1,abc"), { category: "cat", value: "val", series: null });
}, "not numeric", "non-numeric value rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\n,5"), { category: "cat", value: "val", series: null });
}, "empty", "empty category rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val,ser\nQ1,5,"), { category: "cat", value: "val", series: "ser" });
}, "Series is empty", "empty mapped series value rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\nQ1,5"), { category: "cat", value: "missing", series: null });
}, "does not exist", "missing column rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\nQ1,5"), { category: "cat", value: "cat", series: null });
}, "only one role", "duplicate mapping rejected");
throwsValidation(function () {
    CB.Model.buildBar(table("cat,val\nQ1,5"), { category: "cat", value: null, series: null });
}, "Required mapping", "unset required mapping rejected");

// --- Model: line ------------------------------------------------------------
section("Model: line");
m = CB.Model.buildLine(table("x,y\n3,30\n1,10\n2,20"), { x: "x", y: "y", series: null });
eq(m.xType, "number", "line numeric x");
eq(CB.Util.map(m.series[0].points, function (p) { return p.x; }), [1, 2, 3], "line sorted by x");
eq(m.seriesNames, ["Series"], "line implicit series name");

m = CB.Model.buildLine(table("date,y\n2024-03-01,3\n2024-01-01,1\n2024-09-15,9"),
    { x: "date", y: "y", series: null });
eq(m.xType, "date", "line date x detected");
eq(m.series[0].points[0].x, CB.Dates.parseISO("2024-01-01"), "line dates sorted (sparse/unsorted ok)");

m = CB.Model.buildLine(table("x,y,s\n1,1,A\n1,2,B\n2,3,A\n2,4,B"), { x: "x", y: "y", series: "s" });
eq(m.seriesNames, ["A", "B"], "multi-series line");
eq(m.series.length, 2, "two separate line series (never connected)");

throwsValidation(function () {
    CB.Model.buildLine(table("x,y\n1,1\n1,2\n2,3"), { x: "x", y: "y", series: null });
}, "must map a Series", "duplicate x without series rejected");
throwsValidation(function () {
    CB.Model.buildLine(table("x,y,s\n1,1,A\n1,2,A"), { x: "x", y: "y", series: "s" });
}, "repeated X", "duplicate x within one series rejected");
throwsValidation(function () {
    CB.Model.buildLine(table("x,y\n2024-01-01,1\n5,2"), { x: "x", y: "y", series: null });
}, "mixes numbers and dates", "mixed x types rejected");
throwsValidation(function () {
    CB.Model.buildLine(table("x,y\n2024-02-30,1\n2024-03-01,2"), { x: "x", y: "y", series: null });
}, "ISO date", "invalid calendar date rejected");
throwsValidation(function () {
    CB.Model.buildLine(table("x,y\n1,5"), { x: "x", y: "y", series: null });
}, "at least 2", "single-point line rejected");
throwsValidation(function () {
    CB.Model.buildLine(table("x,y\n1,\n2,3"), { x: "x", y: "y", series: null });
}, "not numeric", "missing y value rejected");

// --- Model: scatter -----------------------------------------------------------
section("Model: scatter");
m = CB.Model.buildScatter(table("x,y\n1,2\n1,3\n2,5"), { x: "x", y: "y", series: null, label: null, trend: "none" });
eq(m.series[0].points.length, 3, "scatter allows duplicate x");
eq(m.fits.length, 0, "trend none -> no fits");

m = CB.Model.buildScatter(table("x,y,name\n1,2,Alpha\n2,4,\n3,6,Gamma"),
    { x: "x", y: "y", series: null, label: "name", trend: "overall" });
eq(m.series[0].points[1].label, "", "empty label allowed");
eq(m.fits.length, 1, "overall fit present");
eq(m.fits[0].name, "Overall", "overall fit name");
approx(m.fits[0].fit.r2, 1, 1e-9, "overall fit r2");
approx(m.fits[0].fit.slope, 2, 1e-9, "overall fit slope");

m = CB.Model.buildScatter(table("x,y,s\n1,1,A\n2,2,A\n1,5,B\n2,4,B\n3,3,B"),
    { x: "x", y: "y", series: "s", label: null, trend: "per-series" });
eq(m.fits.length, 2, "per-series fits");
eq(m.fits[0].name, "A", "per-series fit name");
eq(m.fits[1].seriesIndex, 1, "per-series fit index");
ok(m.fits[1].fit.slope < 0, "series B negative slope");

m = CB.Model.buildScatter(table("x,y,s\n1,1,A\n2,2,A\n5,5,B"),
    { x: "x", y: "y", series: "s", label: null, trend: "per-series" });
eq(m.fits.length, 1, "unfittable series skipped");
ok(m.warnings.length === 1 && m.warnings[0].indexOf("\"B\"") !== -1, "warning names the skipped series");

m = CB.Model.buildScatter(table("x,y\n5,1\n5,2\n5,3"), { x: "x", y: "y", series: null, label: null, trend: "overall" });
eq(m.fits.length, 0, "constant-x overall fit skipped");
ok(m.warnings.length === 1, "constant-x warning present");

// scatter with dates
m = CB.Model.buildScatter(table("when,y\n2024-01-01,1\n2024-02-01,2"),
    { x: "when", y: "y", series: null, label: null, trend: "none" });
eq(m.xType, "date", "scatter date x");

// --- Persist -------------------------------------------------------------------
section("Persist");
var cfg = {
    v: 1, id: "abc123", type: "scatter", title: "My \"Chart\"",
    csv: "/tmp/weird path/data, more.csv",
    width: 1600, height: 800, theme: "Tech",
    mapping: { x: "Date", y: "Value", series: null, label: null, trend: "overall" },
    anim: { duration: 2, stagger: 0.1 },
    animStart: 1.5, origin: [160, 140], seriesCount: 3
};
var enc = CB.Persist.encode(cfg);
ok(enc.indexOf("CB_CHART_V1::") === 0, "encode prefix");
eq(CB.Persist.decode(enc), cfg, "persist round trip");
eq(CB.Persist.decode("some user comment"), null, "non-chart comment -> null");
eq(CB.Persist.decode(""), null, "empty comment -> null");
eq(CB.Persist.decode("CB_CHART_V1::{broken"), null, "corrupt config -> null");
ok(CB.Persist.isChartComment(enc), "isChartComment true");

// --- Stress-style integration checks -------------------------------------------
section("Stress integration");
// 12 series grouped bars
var csv = "cat,val,ser\n";
var si2, ci2;
for (ci2 = 0; ci2 < 4; ci2++) {
    for (si2 = 0; si2 < 12; si2++) {
        csv += "C" + ci2 + "," + (ci2 * 12 + si2) + ",S" + si2 + "\n";
    }
}
m = CB.Model.buildBar(table(csv), { category: "cat", value: "val", series: "ser" });
eq(m.seriesNames.length, 12, "12 series all kept");
eq(m.bars.length, 48, "48 bars");

// large row count
csv = "x,y\n";
for (ci2 = 0; ci2 < 5000; ci2++) { csv += ci2 + "," + Math.sin(ci2) + "\n"; }
var t0 = Date.now();
m = CB.Model.buildScatter(table(csv), { x: "x", y: "y", series: null, label: null, trend: "overall" });
var elapsed = Date.now() - t0;
eq(m.series[0].points.length, 5000, "5000 scatter points parsed");
ok(elapsed < 5000, "5000 rows parse+model under 5s (" + elapsed + "ms)");

// value extremes
m = CB.Model.buildBar(table('cat,val\nA,0\nB,-12.75\nC,"1,250"\nD,2000000\nE,0.0042'),
    { category: "cat", value: "val", series: null });
eq(m.bars[2].value, 1250, "quoted thousands value");
eq(m.bars[3].value, 2000000, "million value");
eq(m.bars[4].value, 0.0042, "small decimal value");


emit("");
emit(passed + " passed, " + failed + " failed");
if (failed > 0) { emit("Failures:\n  " + failures.join("\n  ")); }
this.__CB_TEST_RESULT = { passed: passed, failed: failed, failures: failures };
