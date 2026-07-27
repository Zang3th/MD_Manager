const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { domain } = load("domain/project.js");
const project = () => ({ features: [
  { title: "A", tasks: [{ title: "A1", lines: ["- [ ] one", "**Next**", "- [ ] two"] }] },
  { title: "B", tasks: [{ title: "B1", lines: ["- [ ] three"] }] },
  { title: "Backlog", isBacklog: true, tasks: [] }
] });

test("features move without crossing the backlog", () => {
  const value = project(); domain.moveFeature(value, 0, 99);
  assert.deepEqual(value.features.map(x => x.title), ["B", "A", "Backlog"]);
  domain.moveFeature(value, 2, 0);
  assert.deepEqual(value.features.map(x => x.title), ["B", "A", "Backlog"]);
});

test("feature titles and complete task drafts update only their target", () => {
  const value = project();
  domain.renameFeature(value, 0, "Renamed Feature");
  domain.updateTask(value, 0, 0, { title: "Renamed Task", lines: ["#Info", "edited", "- [ ] new"] });
  assert.equal(value.features[0].title, "Renamed Feature");
  assert.deepEqual(value.features[0].tasks[0], { title: "Renamed Task", lines: ["#Info", "edited", "- [ ] new"] });
  assert.equal(value.features[1].title, "B");
});

test("tasks move within and between features", () => {
  const value = project();
  domain.moveTask(value, 0, 0, 1, 1);
  assert.equal(value.features[0].tasks.length, 0);
  assert.deepEqual(value.features[1].tasks.map(x => x.title), ["B1", "A1"]);
});

test("delete operations remove only their target", () => {
  const value = project();
  domain.deleteTodo(value.features[0].tasks[0], 0);
  assert.deepEqual(value.features[0].tasks[0].lines, ["**Next**", "- [ ] two"]);
  domain.deleteTask(value, 1, 0); domain.deleteFeature(value, 1);
  assert.deepEqual(value.features.map(x => x.title), ["A", "Backlog"]);
});

test("setTodo normalizes checked and unchecked Markdown", () => {
  const task = { lines: ["- item", "* [x] ~done~"] };
  domain.setTodo(task, 0, true); domain.setTodo(task, 1, false);
  assert.deepEqual(task.lines, ["- [x] ~item~", "* [ ] done"]);
});

test("todos move into the requested group without crossing boundaries", () => {
  const value = project();
  domain.moveTodo(value, 1, 0, 0, 0, 0, 1, 0);
  assert.deepEqual(value.features[0].tasks[0].lines, ["- [ ] one", "**Next**", "- [ ] three", "- [ ] two"]);
});
