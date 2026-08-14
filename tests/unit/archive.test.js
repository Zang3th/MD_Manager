const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { archive } = load("domain/project.js");
/** @param {string} title @param {string} from @param {string} to @param {string} version */
const feature = (title, from, to = "", version = "") => ({ title, version, dates: from ? [{ from, to }] : [], tasks: [] });

test("archive timeline derives its scale from the first and last parsed metadata dates", () => {
  const cases = [
    [[feature("A", "2026-01-01"), feature("B", "2026-01-31")], "day"],
    [[feature("A", "01.01.2026"), feature("B", "15.02.2026")], "week"],
    [[feature("A", "2026-01-01"), feature("B", "2026-09-01")], "month"],
    [[feature("A", "2023-01-01"), feature("B", "2026-01-02")], "year"]
  ];
  for (const [features, scale] of cases) assert.equal(archive.timeline(features).scale, scale);
});

test("archive timeline includes range endpoints, groups starts, and leaves invalid dates at the end", () => {
  const timeline = archive.timeline([
    feature("Range", "15.01.2024", "01.04.2026", "1.0.0"),
    feature("Later", "01.06.2025", "", "2.0.0"),
    feature("Version ten", "", "", "10.0.0"),
    feature("Version two", "", "", "2.0.0"),
    feature("Unknown", "2026-99-10")
  ]);
  assert.equal(timeline.scale, "year");
  assert.equal(timeline.from, "15.01.2024");
  assert.equal(timeline.to, "01.04.2026");
  assert.deepEqual(Array.from(timeline.groups, (/** @type {any} */ group) => group.label), ["2024", "2025", "2026"]);
  assert.deepEqual(Array.from(timeline.groups.flatMap((/** @type {any} */ group) => group.entries), (/** @type {any} */ entry) => entry.feature.title), ["Range", "Later"]);
  assert.deepEqual(Array.from(timeline.unmatched, item => item.title), ["Version ten", "Version two", "Unknown"]);
});

test("archive timeline derives calendar-aligned ruler ticks from its automatic scale", () => {
  const daily = archive.timeline([feature("A", "2026-01-01"), feature("B", "2026-01-04")]);
  assert.equal(daily.scale, "day");
  assert.deepEqual(Array.from(daily.ticks, (/** @type {any} */ tick) => [tick.time, tick.level]), [
    [Date.UTC(2026, 0, 2), "minor"],
    [Date.UTC(2026, 0, 3), "minor"]
  ]);

  const weekly = archive.timeline([feature("A", "2024-01-15"), feature("B", "2024-05-15")]);
  assert.equal(weekly.scale, "week");
  const ticks = /** @type {Array<{time: number, level: string}>} */ (Array.from(weekly.ticks));
  assert.deepEqual(ticks.map((/** @type {any} */ tick) => tick.time).slice().sort((a, b) => a - b), ticks.map((/** @type {any} */ tick) => tick.time));
  assert.deepEqual(ticks.filter(tick => tick.level === "major").map(tick => tick.time), [Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1), Date.UTC(2024, 3, 1), Date.UTC(2024, 4, 1)]);
  assert.ok(ticks.filter(tick => tick.level === "minor").every(tick => new Date(tick.time).getUTCDay() === 1));
  assert.ok(ticks.every(tick => tick.time > Date.UTC(2024, 0, 15) && tick.time < Date.UTC(2024, 4, 15)));

  const yearly = archive.timeline([feature("A", "2020-06-01"), feature("B", "2026-06-01")]);
  assert.equal(yearly.scale, "year");
  const yearlyTicks = /** @type {Array<{time: number, level: string}>} */ (Array.from(yearly.ticks));
  assert.deepEqual(yearlyTicks.filter(tick => tick.level === "major").map(tick => new Date(tick.time).getUTCFullYear()), [2021, 2022, 2023, 2024, 2025, 2026]);
  assert.ok(yearlyTicks.filter(tick => tick.level === "minor").every(tick => new Date(tick.time).getUTCMonth() % 3 === 0));
});

test("archive timeline compresses only idle stretches that dwarf the archive's own idle spacing", () => {
  const clustered = archive.timeline([
    feature("A", "2016-03-01"), feature("B", "2016-03-02"), feature("C", "2016-03-03"),
    feature("D", "2026-03-01"), feature("E", "2026-03-02")
  ]);
  assert.deepEqual(Array.from(clustered.gaps, (/** @type {any} */ gap) => [gap.from, gap.to, gap.label]), [
    [Date.UTC(2016, 2, 3), Date.UTC(2026, 2, 1), "10 years"]
  ]);

  // Evenly spaced archives carry their meaning in that spacing, so every stretch survives.
  const even = archive.timeline([feature("A", "2020-01-01"), feature("B", "2022-01-01"), feature("C", "2024-01-01"), feature("D", "2026-01-01")]);
  assert.deepEqual(Array.from(even.gaps), []);

  // Too few stretches to tell a typical one from an extreme one, and continuous coverage produces
  // no candidate at all.
  assert.deepEqual(Array.from(archive.timeline([feature("A", "2016-01-01"), feature("B", "2026-01-01")]).gaps), []);
  assert.deepEqual(Array.from(archive.timeline([feature("A", "2026-01-01"), feature("B", "2026-01-02"), feature("C", "2036-01-01")]).gaps), []);
  assert.deepEqual(Array.from(archive.timeline([feature("A", "2026-01-01", "2026-02-01"), feature("B", "2026-01-15", "2026-03-01")]).gaps), []);
});

test("an idle stretch is compressed one step past the factor above the median stretch", () => {
  const atFactor = archive.timeline([feature("A", "2026-01-01"), feature("B", "2026-01-02"), feature("C", "2026-01-03"), feature("D", "2026-01-09")]);
  assert.deepEqual(Array.from(atFactor.gaps), []);

  const pastFactor = archive.timeline([feature("A", "2026-01-01"), feature("B", "2026-01-02"), feature("C", "2026-01-03"), feature("D", "2026-01-10")]);
  assert.deepEqual(Array.from(pastFactor.gaps, (/** @type {any} */ gap) => gap.label), ["7 days"]);

  const months = archive.timeline([feature("A", "2026-01-01"), feature("B", "2026-01-02"), feature("C", "2026-01-03"), feature("D", "2026-04-03")]);
  assert.deepEqual(Array.from(months.gaps, (/** @type {any} */ gap) => gap.label), ["3 months"]);
});

test("an idle stretch inside one feature's own periods stays proportional", () => {
  const slow = { title: "Slow", version: "", dates: [{ from: "2016-01-01", to: "2016-02-01" }, { from: "2026-01-01", to: "2026-02-01" }], tasks: [] };
  const timeline = archive.timeline([slow, feature("Other", "2026-03-01"), feature("More", "2026-03-02"), feature("Last", "2026-03-03")]);
  // The ten years the slow feature spans itself never become a candidate, so the only compressed
  // stretch is the one after it.
  assert.deepEqual(Array.from(timeline.gaps, (/** @type {any} */ gap) => gap.label), ["28 days"]);
});

test("ruler ticks are withheld inside a compressed stretch", () => {
  const timeline = archive.timeline([
    feature("A", "2015-12-28"), feature("B", "2016-01-05"),
    feature("C", "2025-12-28"), feature("D", "2026-01-05")
  ]);
  assert.equal(timeline.scale, "year");
  assert.deepEqual(Array.from(timeline.gaps, (/** @type {any} */ gap) => gap.label), ["10 years"]);
  assert.deepEqual(Array.from(timeline.ticks, (/** @type {any} */ tick) => new Date(tick.time).toISOString().slice(0, 10)), ["2016-01-01", "2026-01-01"]);
});

test("archive timeline aggregates and sorts two-digit European date ranges into one feature entry", () => {
  const ranged = {
    title: "Repeated work",
    version: "1.0.0",
    dates: [
      { from: "21.05.26", to: "05.06.26" },
      { from: "09.12.25", to: "06.01.26" }
    ],
    tasks: []
  };
  const timeline = archive.timeline([ranged], "date");
  const entries = timeline.groups.flatMap((/** @type {any} */ group) => group.entries);

  assert.equal(timeline.from, "09.12.25");
  assert.equal(timeline.to, "05.06.26");
  assert.deepEqual(Array.from(timeline.groups, (/** @type {any} */ group) => group.label), ["Week 50, 2025", "Week 2, 2026", "Week 21, 2026", "Week 23, 2026"]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].rangeLabel, "09.12.25 – 05.06.26 · 2 periods");
  assert.deepEqual(Array.from(entries[0].ranges, (/** @type {any} */ range) => range.label), ["09.12.25 – 06.01.26", "21.05.26 – 05.06.26"]);
  assert.deepEqual(Array.from(timeline.markers, (/** @type {any} */ marker) => marker.value), ["09.12.25", "06.01.26", "21.05.26", "05.06.26"]);
  assert.deepEqual([entries[0].date.year, entries[0].endDate.year, entries[0].rangeCount], [2025, 2026, 2]);
  assert.equal(timeline.fromTime, Date.UTC(2025, 11, 9));
  assert.equal(timeline.toTime, Date.UTC(2026, 5, 5));
});

test("archive timeline treats reversed and invalid range endpoints as start dates", () => {
  const timeline = archive.timeline([
    feature("Reversed", "10.01.26", "09.01.26"),
    feature("Invalid end", "12.01.26", "31.02.26"),
    feature("Invalid start", "29.02.25", "01.03.25")
  ], "date");
  const entries = timeline.groups.flatMap((/** @type {any} */ group) => group.entries);

  assert.equal(timeline.from, "10.01.26");
  assert.equal(timeline.to, "12.01.26");
  assert.deepEqual(Array.from(entries, (/** @type {any} */ entry) => entry.rangeLabel), ["10.01.26", "12.01.26"]);
  assert.ok(entries.every((/** @type {any} */ entry) => entry.endDate === undefined));
  assert.deepEqual(Array.from(timeline.unmatched, item => item.title), ["Invalid start"]);
});

test("archive timeline orders entries by start and leaves placement to the layout", () => {
  const timeline = archive.timeline([
    feature("First", "01.01.26", "10.01.26"),
    feature("Overlapping", "05.01.26", "08.01.26"),
    feature("Point A", "05.01.26"),
    feature("Point B", "05.01.26"),
    feature("Later", "11.01.26", "12.01.26")
  ], "date");
  const entries = /** @type {any[]} */ (Array.from(timeline.entries));

  assert.deepEqual(entries.map(entry => entry.feature.title), ["First", "Overlapping", "Point A", "Point B", "Later"]);
  assert.deepEqual(entries.map(entry => entry.endDate !== undefined), [true, true, false, false, true]);
  assert.equal(timeline.fromTime, Date.UTC(2026, 0, 1));
  assert.equal(timeline.toTime, Date.UTC(2026, 0, 12));
  assert.deepEqual(Array.from(timeline.markers, (/** @type {any} */ marker) => marker.value), ["01.01.26", "05.01.26", "08.01.26", "10.01.26", "11.01.26", "12.01.26"]);
  const placementKeys = ["lane", "rangeLanes", "sharedPoint", "tickTimes"];
  assert.deepEqual(placementKeys.filter(key => key in timeline), []);
  assert.deepEqual(placementKeys.filter(key => entries.some(entry => key in entry)), []);
  assert.deepEqual(placementKeys.filter(key => timeline.groups.some((/** @type {any} */ group) => key in group)), []);
});

test("version ordering is numeric and isolates features without a valid version", () => {
  const timeline = archive.timeline([
    feature("Ten", "", "", "10.0.0"),
    feature("Date only", "2026-01-01"),
    feature("Two A", "", "", "2.0.0"),
    feature("Two B", "", "", "v2.0.0-beta"),
    feature("Invalid", "", "", "next")
  ], "version", "auto");
  assert.equal(timeline.order, "version");
  assert.deepEqual(Array.from(timeline.groups, (/** @type {any} */ group) => group.label), ["v2.0.0", "v10.0.0"]);
  assert.deepEqual(Array.from(timeline.groups[0].entries, (/** @type {any} */ entry) => entry.feature.title), ["Two A", "Two B"]);
  assert.deepEqual(Array.from(timeline.unmatched, item => item.title), ["Date only", "Invalid"]);
});
