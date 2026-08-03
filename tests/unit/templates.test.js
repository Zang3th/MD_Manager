const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

const { templates } = load("io/markdown.js", "io/templates.js");
const root = path.resolve(__dirname, "../..");

test("bundled template sources match their Markdown files and parse as their target types", () => {
  const featureMarkdown = fs.readFileSync(path.join(root, "data/templates/Feature.md"), "utf8");
  const taskMarkdown = fs.readFileSync(path.join(root, "data/templates/Task.md"), "utf8");
  assert.equal(templates.sources.feature, featureMarkdown);
  assert.equal(templates.sources.task, taskMarkdown);

  const feature = templates.feature();
  assert.equal(feature.title, "New Feature");
  assert.equal(feature.tasks.length, 1);
  assert.equal(feature.tasks[0].title, "New Task");
  assert.deepEqual(feature.tasks[0].lines, templates.task().lines);
  assert.match(feature.headerLines.join("\n"), /#Warn/);
  const task = templates.task();
  assert.equal(task.title, "New Task");
  assert.match(task.lines.join("\n"), /#### Checklist/);
});
