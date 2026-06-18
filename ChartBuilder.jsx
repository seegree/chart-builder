/*
 * Chart Builder -- dockable After Effects ScriptUI panel.
 *
 * Imports CSV data and generates editable, animated native shape/text
 * layers (bar, grouped bar, line, multi-series line, scatter, scatter with
 * trend lines). Generated charts are plain AE layers driven by Color
 * Controls on a controller null -- they stay fully functional and editable
 * without this panel installed.
 *
 * Install: copy this file AND the lib/ folder into
 *   Scripts/ScriptUI Panels/      (see README.md)
 * then run it from the Window menu.
 */

//@include "lib/core/util.jsxinc"
//@include "lib/core/json.jsxinc"
//@include "lib/core/dates.jsxinc"
//@include "lib/core/csv.jsxinc"
//@include "lib/core/scales.jsxinc"
//@include "lib/core/regression.jsxinc"
//@include "lib/core/themes.jsxinc"
//@include "lib/core/mapping.jsxinc"
//@include "lib/core/model.jsxinc"
//@include "lib/core/persist.jsxinc"
//@include "lib/ae/ae-util.jsxinc"
//@include "lib/ae/controller.jsxinc"
//@include "lib/ae/chrome.jsxinc"
//@include "lib/ae/renderer-bar.jsxinc"
//@include "lib/ae/renderer-line.jsxinc"
//@include "lib/ae/renderer-scatter.jsxinc"

(function chartBuilderPanel(thisObj) {

    var TYPES = [
        { key: "bar", label: "Bar" },
        { key: "line", label: "Line" },
        { key: "scatter", label: "Scatter" }
    ];
    var TREND_OPTIONS = [
        { key: "none", label: "None" },
        { key: "overall", label: "Overall" },
        { key: "per-series", label: "Per series" }
    ];

    var state = {
        csvPath: null,
        headers: [],
        themeDirty: false,   // true only after the user touches the Theme dropdown
        mappingUI: {},       // field key -> dropdownlist
        trendUI: null
    };

    var ui = {};

    // =====================================================================
    // Chart construction (shared by Create and Refresh)
    // =====================================================================

    function themeColors(themeName, seriesCount) {
        var theme = CB.Themes.byName(themeName);
        var colors = {
            bg: CB.Colors.hexToRgb(theme.bg),
            text: CB.Colors.hexToRgb(theme.text),
            grid: CB.Colors.hexToRgb(theme.grid),
            axis: CB.Colors.hexToRgb(theme.axis),
            series: []
        };
        var i;
        for (i = 0; i < seriesCount; i++) {
            colors.series.push(CB.Themes.seriesColor(theme, i));
        }
        return colors;
    }

    function readAndModel(cfg) {
        var text = CB.AE.readTextFile(cfg.csv);
        if (text === null) {
            throw new CB.ValidationError([
                "Cannot read the source CSV:\n" + cfg.csv +
                "\nThe file may have been moved, renamed, or deleted."]);
        }
        var table = CB.CSV.parse(text);
        return CB.Model.build(cfg.type, table, cfg.mapping);
    }

    // Creates the controller + every chart layer. On ANY failure all
    // layers created so far are removed -- no partial charts, ever.
    function buildChart(comp, cfg, model, colors) {
        var created = [];
        var ctx = {
            comp: comp,
            cfg: cfg,
            model: model,
            warnings: [],
            ox: cfg.origin[0],
            oy: cfg.origin[1],
            W: cfg.width,
            H: cfg.height,
            track: function (layer) { created.push(layer); }
        };
        try {
            var ctrl = CB.Controller.create(comp, cfg, colors);
            created.push(ctrl);
            ctx.ctrl = ctrl;
            ctx.exprs = CB.Controller.expressions(ctrl);

            var layout = CB.Chrome.build(ctx);
            if (cfg.type === "bar") { CB.RendererBar.build(ctx, layout); }
            else if (cfg.type === "line") { CB.RendererLine.build(ctx, layout); }
            else { CB.RendererScatter.build(ctx, layout); }

            ctrl.moveToBeginning(); // controller stays on top of its chart

            var warnings = [];
            var i;
            for (i = 0; i < model.warnings.length; i++) { warnings.push(model.warnings[i]); }
            for (i = 0; i < ctx.warnings.length; i++) { warnings.push(ctx.warnings[i]); }

            var animTail = cfg.animStart + cfg.anim.duration + cfg.anim.stagger * estimateUnits(model);
            if (animTail > comp.duration) {
                warnings.push("The animation runs until ~" + (Math.round(animTail * 10) / 10) +
                    "s but the comp ends at " + (Math.round(comp.duration * 10) / 10) +
                    "s. Extend the comp to see it finish.");
            }
            return { ctrl: ctrl, warnings: warnings };
        } catch (e) {
            var k;
            for (k = created.length - 1; k >= 0; k--) {
                try { created[k].remove(); } catch (eRm) { /* already gone */ }
            }
            throw e;
        }
    }

    function estimateUnits(model) {
        if (model.type === "bar") { return model.bars.length; }
        if (model.type === "line") { return model.series.length; }
        var n = 0, i;
        for (i = 0; i < model.series.length; i++) { n += model.series[i].points.length; }
        return n;
    }

    // =====================================================================
    // Actions
    // =====================================================================

    function onCreateChart() {
        try {
            var errors = [];
            if (!state.csvPath) { errors.push("Import a CSV file first (Data \u25B8 Import CSV\u2026)."); }
            var width = CB.Util.parseNumber(ui.width.text);
            var height = CB.Util.parseNumber(ui.height.text);
            var duration = CB.Util.parseNumber(ui.duration.text);
            var stagger = CB.Util.parseNumber(ui.stagger.text);
            if (width === null || width < 200) { errors.push("Width must be a number \u2265 200 (default 1600)."); }
            if (height === null || height < 200) { errors.push("Height must be a number \u2265 200 (default 800)."); }
            if (duration === null || duration <= 0) { errors.push("Animation Duration must be a positive number of seconds."); }
            if (stagger === null || stagger < 0) { errors.push("Animation Stagger must be zero or a positive number of seconds."); }
            if (errors.length) { throw new CB.ValidationError(errors); }

            var type = TYPES[ui.type.selection.index].key;
            var cfg = {
                v: 1,
                id: CB.Util.uniqueId(),
                type: type,
                title: CB.Util.trim(ui.title.text),
                csv: state.csvPath,
                width: width,
                height: height,
                theme: ui.theme.selection.text,
                mapping: getMappingFromUI(type),
                anim: { duration: duration, stagger: stagger }
            };

            // Re-read the CSV from disk on every Create -- the file may have
            // changed since import.
            var model = readAndModel(cfg);

            app.beginUndoGroup("Chart Builder: Create Chart");
            try {
                var comp = app.project.activeItem;
                if (!(comp instanceof CompItem)) {
                    var compDur = Math.max(10, duration + stagger * estimateUnits(model) + 2);
                    comp = app.project.items.addComp(
                        "Chart \u25B8 " + (cfg.title || cfg.type), width, height, 1, compDur, 30);
                    comp.openInViewer();
                }
                cfg.animStart = comp.time; // Duration and Stagger begin at the playhead
                cfg.origin = [
                    Math.round((comp.width - width) / 2),
                    Math.round((comp.height - height) / 2)
                ];
                cfg.seriesCount = model.seriesNames.length;

                var colors = themeColors(cfg.theme, model.seriesNames.length);
                var result = buildChart(comp, cfg, model, colors);
                state.themeDirty = false;
                if (result.warnings.length) {
                    alert("Chart created, with notes:\n\n\u2022 " + result.warnings.join("\n\u2022 "), "Chart Builder");
                }
            } finally {
                app.endUndoGroup();
            }
        } catch (e) {
            showError(e);
        }
    }

    function onRefreshSelected() {
        try {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                throw new CB.ValidationError(["Open the comp that contains the chart, then select its controller (or any chart layer)."]);
            }
            var sel = comp.selectedLayers;
            var ctrl = null, i;
            for (i = 0; i < sel.length && !ctrl; i++) {
                ctrl = CB.Controller.fromLayer(sel[i]);
            }
            if (!ctrl) {
                throw new CB.ValidationError([
                    "Select a Chart Builder controller null (or one of its child layers) to refresh."]);
            }
            var cfg = CB.Controller.readConfig(ctrl);
            if (!cfg) {
                throw new CB.ValidationError(["The selected controller's stored configuration is missing or corrupt."]);
            }

            // Re-read the source CSV and validate BEFORE touching the
            // existing chart -- a failed refresh leaves the old chart intact.
            if (state.themeDirty) { cfg.theme = ui.theme.selection.text; }
            var model = readAndModel(cfg);
            cfg.seriesCount = model.seriesNames.length;

            var colors;
            if (state.themeDirty) {
                // The user intentionally picked a theme before refreshing:
                // restyle everything from that theme.
                colors = themeColors(cfg.theme, model.seriesNames.length);
            } else {
                // Ordinary refresh: keep the user's custom Color Control
                // values; theme colors only fill in newly added series.
                var saved = CB.Controller.readColors(ctrl);
                colors = themeColors(cfg.theme, model.seriesNames.length);
                if (saved.bg) { colors.bg = saved.bg; }
                if (saved.text) { colors.text = saved.text; }
                if (saved.grid) { colors.grid = saved.grid; }
                if (saved.axis) { colors.axis = saved.axis; }
                for (i = 0; i < colors.series.length && i < saved.series.length; i++) {
                    colors.series[i] = saved.series[i];
                }
            }

            app.beginUndoGroup("Chart Builder: Refresh Chart");
            try {
                CB.Controller.deleteChart(ctrl);
                var result = buildChart(comp, cfg, model, colors);
                state.themeDirty = false;
                if (result.warnings.length) {
                    alert("Chart refreshed, with notes:\n\n\u2022 " + result.warnings.join("\n\u2022 "), "Chart Builder");
                }
            } finally {
                app.endUndoGroup();
            }
        } catch (e) {
            showError(e);
        }
    }

    function onImportCSV() {
        try {
            var f = File.openDialog("Select a CSV file");
            if (!f) { return; }
            var text = CB.AE.readTextFile(f.fsName);
            if (text === null) {
                throw new CB.ValidationError(["Cannot read the file:\n" + f.fsName]);
            }
            var table = CB.CSV.parse(text); // validates headers/structure now
            state.csvPath = f.fsName;
            state.headers = table.headers;
            ui.fileLabel.text = f.displayName + "  (" + table.rows.length + " rows)";
            ui.fileLabel.helpTip = f.fsName;
            rebuildMappingUI();
        } catch (e) {
            showError(e);
        }
    }

    function showError(e) {
        var msg = (e && e.name === "ChartBuilderValidationError")
            ? e.messages.join("\n\n")
            : ("Unexpected error: " + (e && e.message ? e.message : String(e)) +
               (e && e.line ? "  (line " + e.line + ")" : ""));
        alert(msg, "Chart Builder");
    }

    // =====================================================================
    // UI
    // =====================================================================

    function getMappingFromUI(type) {
        var fields = CB.Mapping.FIELDS[type];
        var out = {};
        var i, dd;
        for (i = 0; i < fields.length; i++) {
            dd = state.mappingUI[fields[i].key];
            if (!dd || !dd.selection || dd.selection.text === "(none)") {
                out[fields[i].key] = null;
            } else {
                out[fields[i].key] = dd.selection.text;
            }
        }
        if (type === "scatter") {
            out.trend = state.trendUI && state.trendUI.selection
                ? TREND_OPTIONS[state.trendUI.selection.index].key
                : "none";
        }
        return out;
    }

    function rebuildMappingUI() {
        var grp = ui.mappingGroup;
        while (grp.children.length > 0) { grp.remove(grp.children[0]); }
        state.mappingUI = {};
        state.trendUI = null;

        var type = TYPES[ui.type.selection.index].key;
        var guidance = grp.add("statictext", undefined, CB.Mapping.GUIDANCE[type], { multiline: true });
        guidance.alignment = ["fill", "top"];
        guidance.preferredSize = [240, 56];

        var fields = CB.Mapping.FIELDS[type];
        var autoMap = state.headers.length ? CB.Mapping.auto(type, state.headers) : null;
        var i, f, row, dd, items, j;
        for (i = 0; i < fields.length; i++) {
            f = fields[i];
            row = grp.add("group");
            row.orientation = "row";
            row.alignment = ["fill", "top"];
            var lbl = row.add("statictext", undefined, f.label + (f.required ? " *" : ""));
            lbl.preferredSize = [86, -1];
            lbl.helpTip = f.help;

            items = [];
            if (!f.required) { items.push("(none)"); }
            for (j = 0; j < state.headers.length; j++) { items.push(state.headers[j]); }
            if (state.headers.length === 0) { items = ["(import a CSV first)"]; }

            dd = row.add("dropdownlist", undefined, items);
            dd.alignment = ["fill", "center"];
            dd.helpTip = f.help;
            dd.enabled = state.headers.length > 0;
            if (state.headers.length === 0) {
                dd.selection = 0;
            } else if (autoMap && autoMap[f.key]) {
                dd.selection = CB.Util.indexOf(items, autoMap[f.key]);
            } else {
                dd.selection = 0;
            }
            state.mappingUI[f.key] = dd;
        }

        if (type === "scatter") {
            row = grp.add("group");
            row.orientation = "row";
            row.alignment = ["fill", "top"];
            var tl = row.add("statictext", undefined, "Trend line");
            tl.preferredSize = [86, -1];
            tl.helpTip = "Fit an ordinary least-squares line: one overall fit, or one per series. R\u00B2 is shown in the trend layer's name.";
            var tdd = row.add("dropdownlist", undefined,
                CB.Util.map(TREND_OPTIONS, function (o) { return o.label; }));
            tdd.alignment = ["fill", "center"];
            tdd.helpTip = tl.helpTip;
            tdd.selection = 0;
            state.trendUI = tdd;
        }

        // Re-layout so hidden rows truly collapse instead of leaving gaps.
        ui.win.layout.layout(true);
        ui.win.layout.resize();
    }

    function updateSwatches() {
        var theme = CB.Themes.byName(ui.theme.selection.text);
        var hexes = [theme.bg, theme.text, theme.grid, theme.axis];
        var i;
        for (i = 0; i < theme.series.length && hexes.length < ui.swatches.length; i++) {
            hexes.push(theme.series[i]);
        }
        for (i = 0; i < ui.swatches.length; i++) {
            var sw = ui.swatches[i];
            var rgb = CB.Colors.hexToRgb(hexes[i] || "#000000");
            try {
                sw.graphics.backgroundColor = sw.graphics.newBrush(
                    sw.graphics.BrushType.SOLID_COLOR, [rgb[0], rgb[1], rgb[2], 1]);
            } catch (e) { /* some skins refuse custom brushes; cosmetic only */ }
        }
        ui.win.update ? ui.win.update() : null;
    }

    function buildUI(host) {
        var win = (host instanceof Panel)
            ? host
            : new Window("palette", "Chart Builder", undefined, { resizeable: true });
        ui.win = win;
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 6;
        win.margins = 10;

        // --- Data ---
        var pData = win.add("panel", undefined, "Data");
        pData.orientation = "column";
        pData.alignChildren = ["fill", "top"];
        pData.margins = 10;
        var rowImport = pData.add("group");
        rowImport.orientation = "row";
        var btnImport = rowImport.add("button", undefined, "Import CSV\u2026");
        btnImport.helpTip = "Pick a CSV file. The path is stored on the chart; Create and Refresh always re-read the file from disk.";
        ui.fileLabel = rowImport.add("statictext", undefined, "no file imported");
        ui.fileLabel.alignment = ["fill", "center"];
        btnImport.onClick = onImportCSV;

        // --- Chart ---
        var pChart = win.add("panel", undefined, "Chart");
        pChart.orientation = "column";
        pChart.alignChildren = ["fill", "top"];
        pChart.margins = 10;

        var rowType = pChart.add("group");
        rowType.orientation = "row";
        rowType.add("statictext", undefined, "Type").preferredSize = [50, -1];
        ui.type = rowType.add("dropdownlist", undefined,
            CB.Util.map(TYPES, function (t) { return t.label; }));
        ui.type.alignment = ["fill", "center"];
        ui.type.selection = 0;
        ui.type.onChange = function () { rebuildMappingUI(); };

        var rowTheme = pChart.add("group");
        rowTheme.orientation = "row";
        rowTheme.add("statictext", undefined, "Theme").preferredSize = [50, -1];
        ui.theme = rowTheme.add("dropdownlist", undefined, CB.Themes.names());
        ui.theme.selection = 0;
        ui.theme.helpTip = "Initial colors for new charts. For Refresh: the theme is re-applied only when you change this dropdown before refreshing; otherwise your custom Color Control edits are preserved.";
        ui.swatches = [];
        var swatchTips = ["Background", "Text", "Grid", "Axis",
            "Series 1", "Series 2", "Series 3", "Series 4", "Series 5", "Series 6"];
        var s;
        for (s = 0; s < swatchTips.length; s++) {
            var sw = rowTheme.add("group");
            sw.minimumSize = [13, 13];
            sw.maximumSize = [13, 13];
            sw.preferredSize = [13, 13];
            sw.helpTip = swatchTips[s] + " color (live-editable later via the controller's Color Controls)";
            ui.swatches.push(sw);
        }
        ui.theme.onChange = function () {
            state.themeDirty = true; // an intentional theme pick
            updateSwatches();
        };

        var rowTitle = pChart.add("group");
        rowTitle.orientation = "row";
        rowTitle.add("statictext", undefined, "Title").preferredSize = [50, -1];
        ui.title = rowTitle.add("edittext", undefined, "");
        ui.title.alignment = ["fill", "center"];
        ui.title.helpTip = "Optional chart title, centered in the header area.";

        var rowSize = pChart.add("group");
        rowSize.orientation = "row";
        rowSize.add("statictext", undefined, "W").helpTip = "Chart width in pixels";
        ui.width = rowSize.add("edittext", undefined, "1600");
        ui.width.characters = 5;
        ui.width.helpTip = "Chart width in pixels (default 1600)";
        rowSize.add("statictext", undefined, "H").helpTip = "Chart height in pixels";
        ui.height = rowSize.add("edittext", undefined, "800");
        ui.height.characters = 5;
        ui.height.helpTip = "Chart height in pixels (default 800)";

        // --- Column Mapping ---
        var pMap = win.add("panel", undefined, "Column Mapping");
        pMap.orientation = "column";
        pMap.alignChildren = ["fill", "top"];
        pMap.margins = 10;
        ui.mappingGroup = pMap.add("group");
        ui.mappingGroup.orientation = "column";
        ui.mappingGroup.alignChildren = ["fill", "top"];
        ui.mappingGroup.spacing = 4;

        // --- Animation ---
        var pAnim = win.add("panel", undefined, "Animation");
        pAnim.orientation = "row";
        pAnim.margins = 10;
        pAnim.add("statictext", undefined, "Duration (s)");
        ui.duration = pAnim.add("edittext", undefined, "2");
        ui.duration.characters = 4;
        ui.duration.helpTip = "Length of each element's grow/draw/pop animation. Starts at the current playhead time.";
        pAnim.add("statictext", undefined, "Stagger (s)");
        ui.stagger = pAnim.add("edittext", undefined, "0.08");
        ui.stagger.characters = 4;
        ui.stagger.helpTip = "Delay between successive bars / lines / points.";

        // --- Actions ---
        var pAct = win.add("group");
        pAct.orientation = "row";
        pAct.alignChildren = ["fill", "center"];
        var btnCreate = pAct.add("button", undefined, "Create Chart");
        btnCreate.helpTip = "Re-reads the CSV from disk, validates it, and builds a new chart at the playhead.";
        var btnRefresh = pAct.add("button", undefined, "Refresh Selected");
        btnRefresh.helpTip = "Select a chart controller (or any of its layers): re-reads its CSV and rebuilds. Custom colors survive unless you intentionally changed the Theme first.";
        btnCreate.onClick = onCreateChart;
        btnRefresh.onClick = onRefreshSelected;

        rebuildMappingUI();
        updateSwatches();

        win.onResizing = win.onResize = function () { this.layout.resize(); };
        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
        }
    }

    buildUI(thisObj);

})(this);
