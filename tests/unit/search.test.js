const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

// Matching, ranking and narrowing are tested in MD_Libs core/search; these tests cover the project index.
const { markdown, search } = load("io/markdown.js", "domain/search.js");

/** @param {string} source */
function indexOf(source) {
  return search.index(markdown.parse(source), markdown.taskContent);
}

/** @param {any} searchIndex @param {string} text @param {number} [limit] */
function titles(searchIndex, text, limit) {
  return Array.from(search.query(searchIndex, text, limit).results, (/** @type {any} */ result) => result.item.text);
}

const sample = [
  "# Project",
  "",
  "## Editor Experience",
  "",
  "#Info",
  "- Feature level information",
  "",
  "#Warn",
  "Feature level warning prose",
  "",
  "### Markdown editing",
  "",
  "#Warn",
  "- Task level warning",
  "",
  "Task level prose that belongs to the warning",
  "",
  "#### Formatting toolbar",
  "Group description sentence",
  "- [x] ~Apply **bold** formatting~",
  "- [ ] Insert `code` without moving the caret",
  "",
  "### Accessibility review",
  "",
  "Standalone task paragraph"
].join("\n");

test("the index covers every searchable kind with its badge, state, and breadcrumb", () => {
  const items = Array.from(indexOf(sample).items);
  const byText = (/** @type {string} */ value) => items.find((/** @type {any} */ item) => item.text === value);

  assert.equal(byText("Editor Experience").kind, "feature");
  assert.equal(byText("Editor Experience").state, "active");
  assert.equal(byText("Markdown editing").kind, "task");
  assert.deepEqual(Array.from(byText("Markdown editing").breadcrumb), ["Editor Experience"]);

  assert.equal(byText("Feature level information").badge, "info");
  assert.equal(byText("Feature level information").taskIndex, -1);
  assert.equal(byText("Feature level warning prose").badge, "warn");
  assert.equal(byText("Task level warning").badge, "warn");
  assert.equal(byText("Task level warning").taskIndex, 0);

  assert.equal(byText("Standalone task paragraph").badge, "text");
  assert.equal(byText("Group description sentence").badge, "text");
  assert.deepEqual(Array.from(byText("Group description sentence").breadcrumb), ["Editor Experience", "Markdown editing", "Formatting toolbar"]);

  assert.equal(byText("Formatting toolbar").kind, "group");
  assert.equal(byText("Formatting toolbar").state, "active");
  assert.deepEqual(Array.from(byText("Formatting toolbar").breadcrumb), ["Editor Experience", "Markdown editing"]);

  assert.equal(byText("Apply bold formatting").kind, "todo");
  assert.equal(byText("Apply bold formatting").state, "done");
  assert.equal(byText("Insert code without moving the caret").state, "open");
  assert.deepEqual(Array.from(byText("Insert code without moving the caret").breadcrumb), ["Editor Experience", "Markdown editing", "Formatting toolbar"]);
});

test("note and text ordinals count in the order the cards render them", () => {
  const items = Array.from(indexOf(sample).items);
  const paragraphs = items.filter((/** @type {any} */ item) => item.kind === "text");
  assert.deepEqual(Array.from(paragraphs, (/** @type {any} */ item) => [item.text, item.itemIndex]), [
    ["Group description sentence", 0],
    ["Standalone task paragraph", 0]
  ]);

  const warnItems = items.filter((/** @type {any} */ item) => item.badge === "warn" && item.taskIndex === 0);
  assert.deepEqual(Array.from(warnItems, (/** @type {any} */ item) => [item.text, item.itemIndex]), [
    ["Task level warning", 0],
    ["Task level prose that belongs to the warning", 1]
  ]);
});

test("inline Markdown is stripped from searched and displayed text", () => {
  const searchIndex = indexOf(sample);
  assert.deepEqual(titles(searchIndex, "bold"), ["Apply bold formatting"]);
  assert.deepEqual(titles(searchIndex, "code"), ["Insert code without moving the caret"]);
});

test("ignored features and tasks never reach the index", () => {
  const items = indexOf([
    "# Project",
    "",
    "#Ignore",
    "## Hidden feature",
    "",
    "### Hidden task",
    "- [ ] Hidden todo",
    "",
    "## Visible feature",
    "",
    "#Ignore",
    "### Ignored task",
    "- [ ] Ignored todo",
    "",
    "### Visible task",
    "- [ ] Visible todo"
  ].join("\n")).items;

  assert.deepEqual(Array.from(items, (/** @type {any} */ item) => item.text), ["Visible feature", "Visible task", "Visible todo"]);
});

test("equal scores prefer shorter text, then kind, then location", () => {
  const searchIndex = indexOf([
    "# Project",
    "",
    "## Alpha",
    "",
    "### Alpha",
    "- [ ] Alpha",
    "",
    "#Backlog",
    "## Backlog",
    "",
    "### Alpha"
  ].join("\n"));

  const results = search.query(searchIndex, "alpha").results;
  assert.deepEqual(Array.from(results, (/** @type {any} */ result) => [result.item.kind, result.item.location]), [
    ["feature", "workspace"],
    ["task", "workspace"],
    ["task", "backlog"],
    ["todo", "workspace"]
  ]);
});

test("the golden file indexes every kind and stays free of ignored content", () => {
  const project = markdown.parse(fs.readFileSync(path.join(__dirname, "../../data/parsing/Layout.md"), "utf8"));
  const searchIndex = search.index(project, markdown.taskContent);
  const kinds = new Set(Array.from(searchIndex.items, (/** @type {any} */ item) => item.kind));
  assert.deepEqual([...kinds].sort(), ["feature", "group", "note", "task", "text", "todo"]);

  const locations = new Set(Array.from(searchIndex.items, (/** @type {any} */ item) => item.location));
  assert.deepEqual([...locations].sort(), ["archive", "backlog", "workspace"]);

  for (const hidden of ["Hidden Feature Fixture", "Internal migration fixture", "Hidden lorem migration step", "Ignored archive task"]) {
    assert.equal(Array.from(searchIndex.items).some((/** @type {any} */ item) => item.text === hidden), false, `${hidden} must stay out of the index`);
  }

  assert.equal(titles(searchIndex, "keyboard")[0], "Keyboard and focus");
  const heading = search.query(searchIndex, "keyboard").results[0].item;
  assert.equal(heading.kind, "group");
  assert.deepEqual(Array.from(heading.breadcrumb), ["Editor Experience", "Accessibility review"]);
});
