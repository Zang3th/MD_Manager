const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { archive } = load("domain/project.js");
/** @param {string} from @param {string} to */
const span = (from, to) => [{ title: "Span", version: "", dates: [{ from, to }], tasks: [] }];
/** @param {string} title @param {Array<{from: string, to: string}>} dates */
const feature = (title, dates) => ({ title, version: "", dates, tasks: [] });

/** @param {number} days */
function inclusiveSpan(days) {
  const from = Date.UTC(2020, 0, 1);
  const to = new Date(from + (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return archive.timeline(span("2020-01-01", to));
}

test("header cells tile the padded plot with whole calendar periods", () => {
  const months = archive.timeline(span("2026-01-01", "2026-06-30"));
  const cells = /** @type {any[]} */ (months.headerCells);
  assert.equal(cells[0].position, 0);
  assert.ok(Math.abs(cells.at(-1).position + cells.at(-1).width - 100) < 1e-9);
  for (let index = 1; index < cells.length; index += 1) {
    assert.ok(Math.abs(cells[index].position - (cells[index - 1].position + cells[index - 1].width)) < 1e-9);
  }
  // The plot opens before the first date and closes after the last, so the outer cells are the
  // partial periods the padding reaches into. The reported range stays the real one.
  assert.deepEqual([months.from, months.to], ["01.01.2026", "30.06.2026"]);
  assert.deepEqual(Array.from(cells, (/** @type {any} */ cell) => cell.label), ["Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26", "Jun 26", "Jul 26"]);

  // Coarser domains step up to whole quarters and years rather than inventing a grouping.
  assert.deepEqual(Array.from(new Set(/** @type {any[]} */ (archive.timeline(span("2024-02-01", "2025-05-31")).headerCells).map(cell => cell.label.slice(0, 1)))), ["Q"]);
  assert.ok(Array.from(/** @type {any[]} */ (archive.timeline(span("2020-06-01", "2026-06-30")).headerCells), (/** @type {any} */ cell) => cell.label).every((/** @type {string} */ label) => /^\d{4}$/.test(label)));
});

test("the ruler counts off the first archived date", () => {
  const timeline = archive.timeline(span("2026-01-07", "2026-06-30"));
  const minors = /** @type {any[]} */ (timeline.ticks).filter(tick => tick.level === "minor");

  // A ruler line marks the day the work started, not the nearest calendar boundary.
  const opening = minors.find(tick => tick.label === "07.01");
  assert.ok(opening, "the first archived date is ruled");
  assert.ok(opening.position > 0, "the plot opens before the first date");

  // Every later line is a whole number of steps from it, so an object that starts one step in lands
  // on a line. A step that coincides with a period boundary is ruled by that boundary instead, so
  // the check is the rhythm rather than a uniform gap.
  const positions = Array.from(/** @type {any[]} */ (timeline.ticks), (/** @type {any} */ tick) => tick.position).sort((a, b) => a - b);
  const step = Math.min(...positions.slice(1).map((value, index) => value - positions[index]));
  for (const position of positions) {
    const steps = (position - opening.position) / step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `line at ${position} is not a whole step from the first date`);
  }
});

test("a domain shorter than one period still yields one covering cell", () => {
  // Tuesday to Saturday sits inside a single calendar week.
  const timeline = archive.timeline(span("2026-03-10", "2026-03-14"));
  const cells = /** @type {any[]} */ (timeline.headerCells);
  assert.equal(cells.length, 1);
  assert.deepEqual([cells[0].position, cells[0].width, cells[0].label], [0, 100, "KW 11"]);
  assert.equal(timeline.plotStartDay, Date.UTC(2026, 2, 9) / (24 * 60 * 60 * 1000));
  assert.equal(timeline.spanDays, 7);
});

test("every ruler label names its month and cell edges stay unlabelled", () => {
  const ticks = /** @type {any[]} */ (archive.timeline(span("2026-01-01", "2026-06-30")).ticks);
  assert.ok(ticks.length > 0);
  assert.ok(ticks.filter(tick => tick.level === "major").every(tick => tick.label === ""));
  // A bare day number is ambiguous once the coarse row groups by quarters, so every label carries
  // its month.
  assert.ok(ticks.filter(tick => tick.level === "minor").every(tick => /^\d{2}\.\d{2}$/.test(tick.label)));
  assert.deepEqual(Array.from(ticks, (/** @type {any} */ tick) => tick.position).slice().sort((a, b) => a - b), Array.from(ticks, (/** @type {any} */ tick) => tick.position));
});

test("one calendar date renders at one position, whatever kind of mark carries it", () => {
  const timeline = archive.timeline([
    { title: "Range", version: "", dates: [{ from: "01.03.2026", to: "10.03.2026" }], tasks: [] },
    { title: "Point", version: "", dates: [{ from: "01.03.2026", to: "" }], tasks: [] }
  ]);
  const lanes = /** @type {any[]} */ (timeline.lanes);
  const rangeStart = lanes.find(lane => lane.feature.title === "Range").ranges[0].position;
  const point = lanes.find(lane => lane.feature.title === "Point").points[0].position;
  assert.equal(point, rangeStart);
  // And a ruler line sits on that same instant, so the mark meets the grid rather than floating
  // half a day off it.
  assert.ok(/** @type {any[]} */ (timeline.ticks).some(tick => Math.abs(tick.position - point) < 1e-9));
});

test("a quarter or year view opens and closes on whole periods", () => {
  // The work starts late in Q1 and ends early in Q2, yet both are shown whole.
  const quarters = archive.timeline(span("2024-03-20", "2025-05-10"));
  const cells = /** @type {any[]} */ (quarters.headerCells);
  assert.deepEqual(Array.from(cells, (/** @type {any} */ cell) => cell.label), ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025"]);

  // Widths may differ only by the calendar's own quarter lengths, never by a partial period.
  const widths = Array.from(cells, (/** @type {any} */ cell) => cell.width);
  assert.ok(Math.max(...widths) / Math.min(...widths) < 1.03, `spread ${Math.max(...widths) / Math.min(...widths)}`);

  // Every cell is cut the same way: the ruler steps on the cell's own inner boundaries.
  assert.equal(quarters.rulerPerCell, 2);
  const minors = /** @type {any[]} */ (quarters.ticks).filter(tick => tick.level === "minor");
  const perCell = Array.from(cells, (/** @type {any} */ cell) => minors.filter(tick => tick.position > cell.position + 1e-9 && tick.position < cell.position + cell.width - 1e-9).length);
  assert.deepEqual(perCell, [2, 2, 2, 2, 2, 2]);

  // A year view groups the same way, one step per quarter.
  const years = archive.timeline(span("2020-06-01", "2026-03-15"));
  assert.equal(years.rulerPerCell, 3);
  assert.ok(Array.from(/** @type {any[]} */ (years.headerCells), (/** @type {any} */ cell) => cell.label).every((/** @type {string} */ label) => /^\d{4}$/.test(label)));

  // Short views keep their proportional margin instead, so the work is not squeezed.
  const weeks = archive.timeline(span("2026-02-10", "2026-05-20"));
  assert.equal(weeks.rulerPerCell, 0);
  assert.ok(/** @type {any[]} */ (weeks.headerCells)[0].width < /** @type {any[]} */ (weeks.headerCells)[2].width);
});

test("a day view rules every day and names every week", () => {
  const timeline = archive.timeline(span("2026-02-04", "2026-02-27"));
  assert.equal(timeline.scale, "day");
  const ticks = /** @type {any[]} */ (timeline.ticks);
  const majors = ticks.filter(tick => tick.level === "major");

  // The week always opens on Monday, whatever weekday the archive itself starts on.
  assert.ok(majors.every(tick => new Date(tick.time).getUTCDay() === 1));

  // The row above the timeline groups by calendar week rather than by the months it happens to
  // touch, and the ruler row keeps its day labels.
  assert.deepEqual(Array.from(/** @type {any[]} */ (timeline.headerCells), (/** @type {any} */ cell) => cell.label), ["KW 6", "KW 7", "KW 8", "KW 9"]);
  assert.ok(ticks.filter(tick => tick.level === "minor").every(tick => /^\d{2}\.\d{2}$/.test(tick.label)));

  // Every day boundary in the plot is ruled, whether by a thin line or by the week's thick one.
  const positions = Array.from(ticks, (/** @type {any} */ tick) => tick.position).sort((a, b) => a - b);
  const gaps = positions.slice(1).map((value, index) => value - positions[index]);
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 1e-9, `uneven day step ${gap}`);
});

test("date metadata becomes ranges, points, or unmatched lanes deterministically", () => {
  const sameStartA = feature("Same A", [{ from: "20.02.2026", to: "" }]);
  const sameStartB = feature("Same B", [{ from: "2026-02-20", to: "not a date" }]);
  const timeline = archive.timeline([
    feature("Late range", [{ from: "2026-03-01", to: "2026-03-03" }]),
    feature("Invalid start", [{ from: "31.02.2026", to: "" }]),
    feature("Equal endpoints", [{ from: "15.02.26", to: "15.02.26" }]),
    sameStartA,
    sameStartB,
    feature("Reversed end", [{ from: "2026-02-21", to: "2026-02-19" }])
  ]);

  assert.deepEqual(Array.from(/** @type {any[]} */ (timeline.lanes), lane => lane.feature.title), [
    "Equal endpoints", "Same A", "Same B", "Reversed end", "Late range"
  ]);
  assert.equal(timeline.unmatched.length, 1);
  assert.equal(timeline.unmatched[0].title, "Invalid start");
  assert.equal(/** @type {any[]} */ (timeline.lanes)[0].ranges.length, 0);
  assert.equal(/** @type {any[]} */ (timeline.lanes)[0].points[0].label, "15.02.26");
  assert.equal(/** @type {any[]} */ (timeline.lanes)[2].points.length, 1, "an invalid end keeps its valid start as a point");
  assert.equal(/** @type {any[]} */ (timeline.lanes)[3].points.length, 1, "a reversed end keeps its valid start as a point");
  assert.equal(/** @type {any[]} */ (timeline.lanes)[4].ranges[0].durationDays, 3);
  assert.deepEqual(Object.keys(/** @type {any[]} */ (timeline.lanes)[4].ranges[0]).sort(), ["durationDays", "endDay", "endExclusive", "position", "startDay", "width"]);
  assert.deepEqual([timeline.from, timeline.to], ["15.02.2026", "03.03.2026"]);
});

test("pauses cover only real gaps between merged activity", () => {
  const timeline = archive.timeline([feature("Interrupted", [
    { from: "2026-01-01", to: "2026-01-05" },
    { from: "2026-01-04", to: "2026-01-10" },
    { from: "2026-01-11", to: "" },
    { from: "2026-01-15", to: "2026-01-16" },
    { from: "2026-01-20", to: "2026-01-20" }
  ])]);
  const lane = /** @type {any[]} */ (timeline.lanes)[0];

  assert.deepEqual(Array.from(lane.pauses, (/** @type {any} */ pause) => [pause.durationDays, pause.label]), [
    [3, "3 days pause"],
    [3, "3 days pause"]
  ]);
  assert.deepEqual({ ...lane.metrics }, { recordedDays: 14, spanDays: 20, pauseDays: 6 });
  assert.ok(Math.abs(lane.pauses[0].position + lane.pauses[0].width - lane.ranges[2].position) < 1e-9);
  assert.ok(Math.abs(lane.pauses[1].position + lane.pauses[1].width - lane.points[1].position) < 1e-9);
  assert.match(lane.accessibleSummary, /^Interrupted\./);
  assert.match(lane.accessibleSummary, /3 days pause/);
});

test("scale thresholds are inclusive and step up only after their documented span", () => {
  assert.equal(inclusiveSpan(32).scale, "day");
  assert.equal(inclusiveSpan(33).scale, "week");
  assert.equal(inclusiveSpan(184).scale, "week");
  assert.equal(inclusiveSpan(185).scale, "month");
  assert.equal(inclusiveSpan(732).scale, "month");
  assert.equal(inclusiveSpan(733).scale, "year");
});

test("timeline output stays bounded, covers extreme spans, and carries no retired view data", () => {
  const timeline = archive.timeline(span("0100-01-01", "9999-12-31"));
  assert.deepEqual(Object.keys(timeline).sort(), ["from", "headerCells", "lanes", "plotStartDay", "rulerPerCell", "scale", "spanDays", "ticks", "to", "unmatched"]);
  assert.deepEqual(Object.keys(/** @type {any[]} */ (timeline.lanes)[0]).sort(), ["accessibleSummary", "endExclusive", "feature", "metrics", "pauses", "points", "ranges", "startDay"]);
  assert.equal(timeline.ticks.length, 200);
  assert.ok(/** @type {any[]} */ (timeline.ticks).at(-1).position > 95, "the bounded ruler still reaches the end of the domain");
  assert.ok(/** @type {any[]} */ (timeline.ticks).every((tick, index, ticks) => index === 0 || tick.time > ticks[index - 1].time));
});

test("an empty timeline exposes an inert plot domain", () => {
  const timeline = archive.timeline([]);
  assert.equal(timeline.plotStartDay, 0);
  assert.equal(timeline.spanDays, 0);
});

test("lane metrics expose only timeline durations", () => {
  const timeline = archive.timeline([{
    title: "Tasks",
    version: "",
    dates: [{ from: "2026-01-01", to: "2026-01-02" }],
    tasks: [{ title: "Visible", lines: [] }, { title: "Hidden", lines: [], ignored: true }]
  }]);
  assert.deepEqual({ .../** @type {any[]} */ (timeline.lanes)[0].metrics }, { recordedDays: 2, spanDays: 2, pauseDays: 0 });
});
