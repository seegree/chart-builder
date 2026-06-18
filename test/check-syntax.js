/*
 * Chart Builder -- parse-only syntax check for every script the panel
 * loads in After Effects (plus the test files themselves). Each file is
 * compiled with new Function(...) but never executed, so AE-only globals
 * (app, Shape, ParagraphJustification, ...) don't matter here.
 *
 * Run from the repo root with either runtime:
 *   node test/check-syntax.js
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test/check-syntax.js
 */

var FILES = [
    "ChartBuilder.jsx",
    "lib/core/util.jsxinc",
    "lib/core/json.jsxinc",
    "lib/core/dates.jsxinc",
    "lib/core/csv.jsxinc",
    "lib/core/scales.jsxinc",
    "lib/core/regression.jsxinc",
    "lib/core/themes.jsxinc",
    "lib/core/mapping.jsxinc",
    "lib/core/model.jsxinc",
    "lib/core/persist.jsxinc",
    "lib/ae/ae-util.jsxinc",
    "lib/ae/controller.jsxinc",
    "lib/ae/chrome.jsxinc",
    "lib/ae/renderer-bar.jsxinc",
    "lib/ae/renderer-line.jsxinc",
    "lib/ae/renderer-scatter.jsxinc",
    "test/tests.js",
    "test/run-tests-jsc.js"
];

function emit(s) {
    if (typeof console !== "undefined" && console.log) { console.log(s); }
    else if (typeof print !== "undefined") { print(s); }
}

var readSource;
if (typeof readFile === "function") {           // jsc
    readSource = readFile;
} else {                                          // node
    var fs = require("fs");
    readSource = function (p) { return fs.readFileSync(p, "utf8"); };
}

var bad = 0, i, src;
for (i = 0; i < FILES.length; i++) {
    try {
        src = readSource(FILES[i]);
        new Function(src); // parse only
        emit("  ok      " + FILES[i]);
    } catch (e) {
        bad++;
        emit("  SYNTAX  " + FILES[i] + " -- " + e.message);
    }
}
emit(bad === 0 ? "All " + FILES.length + " files parse cleanly." : bad + " file(s) failed to parse.");
if (bad > 0) {
    if (typeof process !== "undefined") { process.exit(1); }
    throw new Error("syntax check failed");
}
