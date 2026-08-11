const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { domain } = load("domain/project.js");
/** @returns {{features: any[], hasArchive?: boolean}} */
const project = () => ({ features: [
  { title: "A", tasks: [{ title: "A1", lines: ["- [ ] one", "#### Next", "- [ ] two"] }] },
  { title: "B", tasks: [{ title: "B1", lines: ["- [ ] three"] }] },
  { title: "Backlog", isBacklog: true, tasks: [] }
] });

test("features move without crossing the backlog", () => {
  const value = project(); domain.moveFeature(value, 0, 99);
  assert.deepEqual(value.features.map(x => x.title), ["B", "A", "Backlog"]);
  domain.moveFeature(value, 2, 0);
  assert.deepEqual(value.features.map(x => x.title), ["B", "A", "Backlog"]);
});

test("pinning is unique, reversible, and not retained by feature copies", () => {
  const value = project();
  assert.equal(domain.setFeaturePinned(value, 0, true), true);
  assert.deepEqual(value.features.map(feature => Boolean(feature.isPinned)), [true, false, false]);
  assert.equal(domain.setFeaturePinned(value, 1, true), true);
  assert.deepEqual(value.features.map(feature => Boolean(feature.isPinned)), [false, true, false]);
  assert.equal(domain.setFeaturePinned(value, 1, false), true);
  assert.deepEqual(value.features.map(feature => Boolean(feature.isPinned)), [false, false, false]);
  value.features[0].isPinned = true;
  assert.equal(domain.copyFeature(value.features[0]).isPinned, false);
  assert.equal(domain.setFeaturePinned(value, 2, true), false);
});

test("features are added before the backlog and tasks at the end of their feature", () => {
  const value = project();
  domain.addFeature(value, { title: "C", headerLines: [], version: "", dates: [], notes: [], tasks: [], isBacklog: false });
  domain.addTask(value, 0, { title: "A2", lines: ["- [ ] added"] });
  assert.deepEqual(value.features.map(feature => feature.title), ["A", "B", "C", "Backlog"]);
  assert.deepEqual(value.features[0].tasks.map((/** @type {any} */ task) => task.title), ["A1", "A2"]);
});

test("copied features and tasks reset completed todos and insert at requested positions", () => {
  const value = project();
  value.features[0].tasks[0].lines[0] = "- [x] ~one~";
  const taskCopy = domain.copyTask(value.features[0].tasks[0]);
  const featureCopy = domain.copyFeature(value.features[0]);
  domain.insertTask(value, 1, 0, taskCopy);
  domain.insertFeature(value, 1, featureCopy);
  assert.deepEqual(taskCopy.lines, ["- [ ] one", "#### Next", "- [ ] two"]);
  assert.deepEqual(featureCopy.tasks[0].lines, ["- [ ] one", "#### Next", "- [ ] two"]);
  assert.deepEqual(value.features.map(feature => feature.title), ["A", "A", "B", "Backlog"]);
  assert.deepEqual(value.features[2].tasks.map((/** @type {any} */ task) => task.title), ["A1", "B1"]);
});

test("feature titles and complete task drafts update only their target", () => {
  const value = project();
  domain.updateFeature(value, 0, "Renamed Feature", { headerLines: ["#Info", "- changed"], version: "2.0.0", dates: [], notes: [], tasks: [], title: "", isBacklog: false });
  domain.updateTask(value, 0, 0, { title: "Renamed Task", lines: ["#Info", "edited", "- [ ] new"] });
  assert.equal(value.features[0].title, "Renamed Feature");
  assert.deepEqual(value.features[0].tasks[0], { title: "Renamed Task", lines: ["#Info", "edited", "- [ ] new"] });
  assert.equal(value.features[1].title, "B");
});

test("tasks move within and between features", () => {
  const value = project();
  domain.moveTask(value, 0, 0, 1, 1);
  assert.equal(value.features[0].tasks.length, 0);
  assert.deepEqual(value.features[1].tasks.map((/** @type {any} */ x) => x.title), ["B1", "A1"]);
});

test("archiving moves complete features behind the backlog and rejects individual task moves", () => {
  const value = project();
  value.features[0].version = "10.0.0";
  value.features[1].version = "2.0.0";
  value.features[0].tasks[0].lines = ["- [x] ~one~", "#### Next", "- [x] ~two~"];
  value.features[1].tasks[0].lines = ["- [x] ~three~"];
  assert.equal(domain.archiveFeature(value, 0), true);
  assert.equal(domain.archiveFeature(value, 0), true);
  assert.deepEqual(value.features.map(feature => feature.title), ["Backlog", "B", "A"]);
  assert.deepEqual(value.features.map(feature => Boolean(feature.isArchived)), [false, true, true]);
  assert.equal(value.hasArchive, true);
  const before = value.features[2].tasks.length;
  assert.equal(domain.moveTask(value, 1, 0, 2, before), false);
  assert.equal(value.features[1].tasks.length, 1);
  assert.equal(value.features[2].tasks.length, before);
  assert.equal(domain.restoreArchivedFeature(value, value.features[2], 0, true, false), true);
  assert.deepEqual(value.features.map(feature => feature.title), ["A", "Backlog", "B"]);
  assert.equal(value.features[0].isPinned, true);
  assert.equal(value.hasArchive, false);
});

test("unarchiving restores an archived feature at the requested board position", () => {
  const value = project();
  value.features[0].tasks[0].lines = ["- [x] ~one~", "#### Next", "- [x] ~two~"];
  const archived = value.features[0];
  assert.equal(domain.archiveFeature(value, 0), true);
  assert.equal(domain.unarchiveFeature(value, value.features.indexOf(archived), 1), true);
  assert.deepEqual(value.features.map(feature => feature.title), ["B", "A", "Backlog"]);
  assert.equal(archived.isArchived, false);
  assert.equal(value.hasArchive, true);
  assert.equal(domain.unarchiveFeature(value, 0, 0), false);
});

test("incomplete features cannot be archived", () => {
  const value = project();
  assert.equal(domain.canArchiveFeature(value.features[0]), false);
  assert.equal(domain.archiveFeature(value, 0), false);
  assert.deepEqual(value.features.map(feature => feature.title), ["A", "B", "Backlog"]);
  value.features[0].tasks[0].lines = ["- [x] ~one~", "#### Next", "- [x] ~two~"];
  assert.equal(domain.canArchiveFeature(value.features[0]), true);
});

test("delete operations remove only their target", () => {
  const value = project();
  domain.deleteTodo(value.features[0].tasks[0], 0);
  assert.deepEqual(value.features[0].tasks[0].lines, ["#### Next", "- [ ] two"]);
  domain.deleteTask(value, 1, 0); domain.deleteFeature(value, 1);
  assert.deepEqual(value.features.map(x => x.title), ["A", "Backlog"]);
});

test("setTodo normalizes checked and unchecked Markdown", () => {
  const task = { lines: ["- item", "* [x] ~done~"] };
  domain.setTodo(task, 0, true); domain.setTodo(task, 1, false);
  assert.deepEqual(task.lines, ["- [x] ~item~", "- [ ] done"]);
});

test("todos move into the requested group without crossing boundaries", () => {
  const value = project();
  domain.moveTodo(value, 1, 0, 0, 0, 0, 1, 0);
  assert.deepEqual(value.features[0].tasks[0].lines, ["- [ ] one", "#### Next", "- [ ] three", "- [ ] two"]);
});
