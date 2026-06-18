/*
 * Chart Builder — Node test launcher.
 * Evaluates the same lib/core/*.jsxinc files that ChartBuilder.jsx
 * #includes inside After Effects, then runs test/tests.js against them.
 *
 * Run from the repo root:  node test/run-tests.js
 * (No Node available? Use test/run-tests-jsc.js with macOS's jsc.)
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var FILES = [
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
    "test/tests.js",
    "test/stress-files.js"
];

var sandbox = { console: console, JSON: JSON, Date: Date, Math: Math,
    __CB_READ_FILE: function (p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); } };
vm.createContext(sandbox);
FILES.forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), "utf8");
    vm.runInContext(src, sandbox, { filename: f });
});

process.exit(sandbox.__CB_TEST_RESULT && sandbox.__CB_TEST_RESULT.failed === 0 ? 0 : 1);
