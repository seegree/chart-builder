/*
 * Chart Builder — jsc (JavaScriptCore) test launcher, for machines without
 * Node. macOS ships jsc at:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
 *
 * Run FROM THE REPO ROOT (load() paths are cwd-relative):
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test/run-tests-jsc.js
 *
 * Exits non-zero (via uncaught exception) when any test fails.
 */

load("lib/core/util.jsxinc");
load("lib/core/json.jsxinc");
load("lib/core/dates.jsxinc");
load("lib/core/csv.jsxinc");
load("lib/core/scales.jsxinc");
load("lib/core/regression.jsxinc");
load("lib/core/themes.jsxinc");
load("lib/core/mapping.jsxinc");
load("lib/core/model.jsxinc");
load("lib/core/persist.jsxinc");
load("test/tests.js");
this.__CB_READ_FILE = readFile; // jsc built-in, cwd-relative
load("test/stress-files.js");

if (!this.__CB_TEST_RESULT || this.__CB_TEST_RESULT.failed > 0) {
    throw new Error("TEST FAILURES: " + (this.__CB_TEST_RESULT ? this.__CB_TEST_RESULT.failed : "harness error"));
}
