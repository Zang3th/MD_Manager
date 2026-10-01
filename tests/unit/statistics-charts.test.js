const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

const app = load("domain/status.js", "domain/project.js", "io/markdown.js");
/** @param {{lines: string[]}} task @returns {Array<{checked: boolean}>} */
const entries = task => app.markdown.taskContent(task).todos;
/** @param {string} title @param {Array<{from: string, to: string}>} dates @param {number} [size] @returns {{title: string, dates: Array<{from: string, to: string}>, headerLines: string[], version: string, notes: unknown[], isBacklog: boolean, tasks: Array<{title: string, lines: string[], ignored?: boolean}>}} */
function feature(title, dates, size = 1) {
  return { title, dates, headerLines: [], version: "", notes: [], isBacklog: false, tasks: [{ title: "Done", lines: Array.from({ length: size }, () => "- [x] ~done~") }] };
}
/** @param {unknown} value */
const plain = value => JSON.parse(JSON.stringify(value));

test("recorded days use supported calendar formats, inclusive endpoints and interval unions without mutating dates", () => {
  const source = feature("Mixed", [
    { from: "10.01.26", to: "12.01.2026" },
    { from: "2026-01-01", to: "2026-01-05" },
    { from: "2026-01-04", to: "2026-01-07" },
    { from: "2026-01-07", to: "" },
    { from: "2026-01-15", to: "2026-01-15" },
    { from: "2026-01-01", to: "2026-01-05" }
  ]);
  const before = JSON.stringify(source);
  assert.equal(app.archive.recordedDays(source), 11);
  assert.equal(JSON.stringify(source), before);
  for (const date of ["2026-01-01", "01.01.26", " 01.01.2026 "]) {
    assert.equal(app.archive.recordedDays(feature("One", [{ from: date, to: "" }])), 1);
  }
  for (const [from, to, expected] of [["2024-02-28", "2024-03-01", 3], ["2026-12-31", "2027-01-01", 2], ["2026-03-28", "2026-03-30", 3], ["0100-01-01", "9999-12-31", 3615900]]) {
    const item = feature("Calendar", [{ from: String(from), to: String(to) }]);
    const days = app.archive.recordedDays(item);
    if (from === "0100-01-01") assert.equal(days, (Date.UTC(9999, 11, 31) - Date.UTC(100, 0, 1)) / 86400000 + 1);
    else assert.equal(days, expected);
  }
});

test("missing, invalid, reversed or partially open dates exclude the complete feature while archive point behavior remains unchanged", () => {
  const invalid = [[], [{ from: "TBD", to: "" }], [{ from: "2026-02-29", to: "" }], [{ from: "31.04.26", to: "" }], [{ from: "2026-01-02", to: "2026-01-01" }], [{ from: "2026-01-01", to: "TBD" }], [{ from: "", to: "2026-01-01" }], [{ from: "2026-01-01", to: "2026-01-02" }, { from: "2026-01-10", to: "TBD" }]];
  for (const dates of invalid) {
    const source = feature("Invalid", dates);
    assert.equal(app.archive.recordedDays(source), null);
    const result = app.status.charts([source], entries);
    assert.equal(result.count, 0);
    assert.equal(result.excluded, 1);
    assert.equal(result.points.length, 0);
    assert.equal(result.bins.length, 0);
  }
  const timeline = app.archive.timeline([feature("Open", [{ from: "2026-01-01", to: "TBD" }])]);
  assert.equal(timeline.lanes[0].points.length, 1);
  assert.equal(timeline.lanes[0].metrics.recordedDays, 1);
});

test("charts count only complete workspace and archive features and ignore tasks, notes, backlog and empty features", () => {
  const date = [{ from: "2026-01-01", to: "2026-01-02" }];
  const workspace = feature("Workspace", date, 2);
  workspace.tasks.push({ title: "Ignored", ignored: true, lines: ["- [ ] ignored"] }, { title: "Note", lines: ["#Info", "- [ ] not a todo"] });
  const archived = { ...feature("Archive", date, 2), isArchived: true };
  const active = feature("Active", date);
  active.tasks[0].lines.push("- [ ] remaining");
  const result = app.status.charts([workspace, archived, active, feature("Empty", date, 0), { ...feature("Ignored", []), ignored: true }, { ...feature("Backlog", []), isBacklog: true }], entries);
  assert.equal(result.count, 2);
  assert.equal(result.excluded, 0);
  assert.deepEqual(plain(result.points), [{ size: 2, days: 2, titles: ["Workspace", "Archive"] }]);
  assert.deepEqual(plain(result.bins), [{ from: 2, to: 2, count: 2 }]);
});

test("histogram uses equal integer classes, unambiguous boundaries and at most ten bins", () => {
  for (const durations of [[1], [7, 7, 7], [1, 2, 3, 4], [1, 4, 5, 8, 9, 12], [1, 1000000], Array.from({ length: 225 }, (_, index) => index * 19 + 1)]) {
    const sources = durations.map((days, index) => feature(String(index), [{ from: "2020-01-01", to: new Date(Date.UTC(2020, 0, days)).toISOString().slice(0, 10) }]));
    const result = app.status.charts(sources, entries);
    assert.equal(result.count, durations.length);
    assert.ok(result.bins.length <= 10);
    assert.equal(result.bins.reduce((/** @type {number} */ total, /** @type {{count: number}} */ bin) => total + bin.count, 0), durations.length);
    const width = result.bins[0].to - result.bins[0].from + 1;
    for (const [index, bin] of result.bins.entries()) {
      assert.equal(bin.to - bin.from + 1, width);
      if (index) assert.equal(bin.from, result.bins[index - 1].to + 1);
      assert.equal(bin.count, durations.filter(days => days >= bin.from && days <= bin.to).length);
    }
    for (const scale of [result.sizeScale, result.durationScale, result.frequencyScale]) {
      assert.ok(scale.ticks.length <= 7);
      assert.equal(scale.ticks[0], 0);
      assert.equal(scale.ticks.at(-1), scale.max);
      assert.ok(scale.ticks.every(Number.isInteger));
    }
  }
});

test("golden Markdown remains unchanged and both diagrams derive the same complete-feature sample", () => {
  const markdown = fs.readFileSync(path.join(__dirname, "../../data/parsing/Layout.md"), "utf8");
  const project = app.markdown.parse(markdown);
  const before = app.markdown.serialize(project);
  const result = app.status.charts(project.features, entries);
  assert.equal(result.points.reduce((/** @type {number} */ total, /** @type {{titles: string[]}} */ point) => total + point.titles.length, 0), result.count);
  assert.equal(result.bins.reduce((/** @type {number} */ total, /** @type {{count: number}} */ bin) => total + bin.count, 0), result.count);
  assert.equal(app.markdown.serialize(project), before);
});
