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
  const counts = status.counts(items, (/** @type {boolean[]} */ values) => values.map((/** @type {boolean} */ checked) => ({ checked })));
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
  const statistics = status.statistics(features, (/** @type {any} */ task) => task.entries);
  assert.equal(statistics.features.done, 0);
  assert.equal(statistics.tasks.done, 1);
  assert.equal(statistics.entries.open, 1);
  assert.equal(statistics.entries.backlog, 2);
  assert.equal(statistics.features.archive, 1);
  assert.equal(statistics.tasks.archive, 1);
  assert.equal(statistics.entries.archive, 1);
});

test("active todos count the open todos of the active features", () => {
  const features = [
    { tasks: [{ entries: [{ checked: true }, { checked: true }] }] },
    { tasks: [{ entries: [{ checked: true }, { checked: false }] }, { entries: [{ checked: false }, { checked: false }] }] },
    { tasks: [{ entries: [{ checked: false }] }] },
    { isBacklog: true, tasks: [{ entries: [{ checked: false }, { checked: false }] }] },
    { isArchived: true, tasks: [{ entries: [{ checked: true }, { checked: false }] }] }
  ];
  const statistics = status.statistics(features, (/** @type {any} */ task) => task.entries);
  assert.equal(statistics.features.active, 1);
  assert.equal(statistics.entries.active, 3);

  const secondActive = status.statistics([...features, { tasks: [{ entries: [{ checked: true }, { checked: false }, { checked: false }] }] }], (/** @type {any} */ task) => task.entries);
  assert.equal(secondActive.features.active, 2);
  assert.equal(secondActive.entries.active, 5);

  const noneActive = status.statistics([{ tasks: [{ entries: [{ checked: true }] }] }, { tasks: [{ entries: [{ checked: false }] }] }, { tasks: [] }], (/** @type {any} */ task) => task.entries);
  assert.equal(noneActive.entries.active, 0);
});

test("overview splits todo states into disjoint segments and derives completion without backlog", () => {
  const features = [
    { tasks: [{ entries: [{ checked: true }, { checked: true }] }] },
    { tasks: [{ entries: [{ checked: true }, { checked: false }, { checked: false }] }] },
    { tasks: [{ entries: [{ checked: false }] }] },
    { isBacklog: true, tasks: [{ entries: [{ checked: false }, { checked: false }] }] },
    { isArchived: true, tasks: [{ entries: [{ checked: true }] }] }
  ];
  const result = status.overview(status.statistics(features, (/** @type {any} */ task) => task.entries));
  assert.deepEqual({ ...result.features }, { archive: 1, done: 1, active: 1, open: 1, backlog: 0, total: 4 });
  assert.deepEqual({ ...result.tasks }, { archive: 1, done: 1, active: 1, open: 1, backlog: 1, total: 5 });
  assert.deepEqual({ ...result.entries }, { archive: 1, done: 3, active: 2, open: 1, backlog: 2, total: 9 });
  assert.equal(result.completedFeatures, 2);
  assert.equal(result.doneTodos, 4);
  assert.equal(result.plannedTodos, 7);
  assert.equal(result.todoPercentage, 57);
  const empty = status.overview(status.statistics([], () => []));
  assert.deepEqual({ ...empty.entries }, { archive: 0, done: 0, active: 0, open: 0, backlog: 0, total: 0 });
  assert.equal(empty.plannedTodos, 0);
  assert.equal(empty.todoPercentage, 0);
  const almost = status.overview(status.statistics([{ tasks: [{ entries: [...Array.from({ length: 199 }, () => ({ checked: true })), { checked: false }] }] }], (/** @type {any} */ task) => task.entries));
  assert.equal(almost.todoPercentage, 99);
  const complete = status.overview(status.statistics([{ tasks: [{ entries: [{ checked: true }] }] }], (/** @type {any} */ task) => task.entries));
  assert.equal(complete.todoPercentage, 100);
});
