const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

const { markdown } = load("io/markdown.js");

test("parses project, metadata, notes, tasks, todos, and backlog", () => {
  const value = markdown.parse("# Project\r\n\r\n## Feature\r\n#Version\r\n- 1.2.3\r\n#Date\r\n- 2026-01-01 - 2026-02-01\r\n#Info\r\n- note\r\n### Task\r\n- [x] ~done~\r\n- [ ] open\r\n\r\n#Backlog\r\n## Later\r\n### Deferred\r\n- item");
  assert.equal(value.title, "Project"); assert.equal(value.newline, "\r\n");
  assert.equal(value.features[0].version, "1.2.3");
  assert.equal(value.features[0].dates[0].from, "2026-01-01");
  assert.equal(value.features[0].dates[0].to, "2026-02-01");
  assert.equal(value.features[0].notes[0].items[0].text, "note");
  assert.equal(value.features[1].isBacklog, true);
  assert.deepEqual(Array.from(markdown.taskContent(value.features[0].tasks[0]).todos, x => x.checked), [true, false]);
});

test("taskContent separates groups, notes, paragraphs, indentation, and todo syntax", () => {
  const content = markdown.taskContent({ lines: ["intro", "#Warn", "  - nested", "paragraph", "**Phase**", "+ [X] done"] });
  assert.deepEqual(Array.from(content.blocks, x => x.type), ["group", "paragraph", "note", "group"]);
  assert.equal(content.blocks[2].items[0].indent, 2);
  assert.equal(content.blocks[2].items[1].paragraph, true);
  assert.equal(content.todos[0].checked, true);
});

test("serialization preserves newline style, orders backlog last, and normalizes todos", () => {
  const value = markdown.parse("# P\r\n\r\n#Backlog\r\n## Later\r\n### T\r\n- old\r\n\r\n## Now\r\n### Work\r\n- [x] done");
  const output = markdown.serialize(value);
  assert.ok(output.includes("\r\n"));
  assert.ok(output.indexOf("## Now") < output.indexOf("#Backlog"));
  assert.match(output, /- \[ \] old/);
  assert.match(output, /- \[x\] ~done~/);
});

test("Roadmap.md parses and round-trips without losing project structure", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../data/Roadmap.md"), "utf8");
  const first = markdown.parse(source); const second = markdown.parse(markdown.serialize(first));
  assert.equal(second.title, first.title);
  assert.deepEqual(second.features.map(f => [f.title, f.isBacklog, f.tasks.map(t => t.title)]), first.features.map(f => [f.title, f.isBacklog, f.tasks.map(t => t.title)]));
});
