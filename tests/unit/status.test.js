const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { status } = load("domain/status.js");

test("progress distinguishes open, active, and complete entries", () => {
  assert.equal(status.progress([]).complete, false);
  assert.equal(status.progress([{ checked: false }]).inProgress, false);
  assert.equal(status.progress([{ checked: true }, { checked: false }]).percentage, 50);
  assert.equal(status.progress([{ checked: true }]).complete, true);
});

test("counts aggregates item states", () => {
  const items = [[true], [true, false], [false], []];
  const counts = status.counts(items, values => values.map(checked => ({ checked })));
  assert.equal(counts.done, 1);
  assert.equal(counts.active, 1);
  assert.equal(counts.open, 2);
});

test("statistics separates regular work from backlog totals", () => {
  const features = [
    { tasks: [{ entries: [{ checked: true }] }, { entries: [{ checked: false }] }] },
    { isBacklog: true, tasks: [{ entries: [{ checked: false }, { checked: false }] }] },
    { isArchived: true, tasks: [{ entries: [{ checked: true }] }] }
  ];
  const statistics = status.statistics(features, task => task.entries);
  assert.equal(statistics.features.done, 0);
  assert.equal(statistics.tasks.done, 1);
  assert.equal(statistics.entries.open, 1);
  assert.equal(statistics.entries.backlog, 2);
  assert.equal(statistics.features.archive, 1);
  assert.equal(statistics.tasks.archive, 1);
  assert.equal(statistics.entries.archive, 1);
});
