const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

const { markdown } = load("io/markdown.js");

test("rejects Markdown that cannot be interpreted safely", () => {
  const invalid = [
    "",
    "plain text without a project title",
    "## Feature\n# Project",
    "# Project\n### Orphan task",
    "# First\n# Second",
    "# Project\ntext\u0000after"
  ];
  for (const source of invalid) {
    assert.throws(() => markdown.parse(source), error => error.name === "MarkdownFormatError" && Boolean(error.message));
  }
});

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
  const content = markdown.taskContent({ lines: ["intro", "#Warn", "  - nested", "paragraph", "#### Phase", "description", "+ [X] done"] });
  assert.deepEqual(Array.from(content.blocks, x => x.type), ["group", "paragraph", "note", "group"]);
  assert.equal(content.blocks[2].items[0].indent, 2);
  assert.equal(content.blocks[2].items[1].paragraph, true);
  assert.equal(content.blocks[3].descriptions[0].text, "description");
  assert.equal(content.todos[0].checked, true);
});

test("taskContent preserves repeated descriptions and todo lists within a label", () => {
  const content = markdown.taskContent({ lines: ["#### AA", "Geometry.", "- [ ] segments", "Shader AA.", "- [ ] smoothstep", "- [ ] distance", "MSAA.", "- [ ] samples"] });
  const group = content.blocks[1];
  assert.deepEqual(Array.from(group.sections, section => ({
    descriptions: Array.from(section.descriptions, description => description.text),
    todos: Array.from(section.todos, todo => todo.text)
  })), [
    { descriptions: ["Geometry."], todos: ["segments"] },
    { descriptions: ["Shader AA."], todos: ["smoothstep", "distance"] },
    { descriptions: ["MSAA."], todos: ["samples"] }
  ]);
  assert.deepEqual(Array.from(content.todos, todo => todo.text), ["segments", "smoothstep", "distance", "samples"]);
});

test("task labels use level-four headings while standalone bold text stays a paragraph", () => {
  const content = markdown.taskContent({ lines: ["**Bold text**", "#### Section", "description", "- [ ] item"] });
  assert.deepEqual(Array.from(content.blocks, block => block.type), ["group", "paragraph", "group"]);
  assert.equal(content.blocks[1].text, "**Bold text**");
  assert.equal(content.blocks[2].title, "Section");
});

test("task editor separates Markdown, info, and warn without trailing blank lines", () => {
  const fields = markdown.taskEditorFields(["", "- [ ] todo", "", "#Info", "- detail", "", "#Warn", "warning", ""]);
  assert.deepEqual({ ...fields }, { markdown: "- [ ] todo", info: "- detail", warn: "warning" });
  assert.deepEqual(Array.from(markdown.composeTaskLines(fields)), ["- [ ] todo", "", "#Info", "- detail", "", "#Warn", "warning"]);
});

test("info and warn are limited to one marker per task and feature", () => {
  const taskLines = markdown.composeTaskLines({ markdown: "- [ ] todo\n#Info\n- embedded\n#Warn\n- embedded warning", info: "- explicit", warn: "- explicit warning" });
  assert.equal(Array.from(taskLines).filter(line => line === "#Info").length, 1);
  assert.equal(Array.from(taskLines).filter(line => line === "#Warn").length, 1);
  const task = markdown.taskContent({ lines: ["#Info", "first", "#Info", "second", "#Warn", "one", "#Warn", "two"] });
  assert.equal(task.blocks.filter(block => block.type === "note" && block.noteType === "info").length, 1);
  assert.equal(task.blocks.filter(block => block.type === "note" && block.noteType === "warn").length, 1);

  const feature = markdown.composeFeatureMetadata({ metadata: "#Version\n- 1.0.0\n#Info\n- embedded\n#Warn\n- embedded warning", info: "- explicit", warn: "- explicit warning" });
  assert.equal(feature.headerLines.filter(line => line === "#Info").length, 1);
  assert.equal(feature.headerLines.filter(line => line === "#Warn").length, 1);
  const parsed = markdown.parse("# P\n## F\n#Info\n- first\n#Info\n- second\n#Warn\n- one\n#Warn\n- two");
  assert.equal(parsed.features[0].notes.filter(note => note.type === "info").length, 1);
  assert.equal(parsed.features[0].notes.filter(note => note.type === "warn").length, 1);
});

test("feature metadata Markdown keeps source lines and derives supported fields", () => {
  const feature = markdown.parseFeatureMetadata("\n#Version\n- 2.0.0\n#Date\n- 2027-01-01 - 2027-06-30\n#Warn\n- review\ncustom: retained\n");
  assert.deepEqual(Array.from(feature.headerLines), ["#Version", "- 2.0.0", "#Date", "- 2027-01-01 - 2027-06-30", "#Warn", "- review", "custom: retained"]);
  assert.equal(feature.version, "2.0.0");
  assert.deepEqual({ ...feature.dates[0] }, { from: "2027-01-01", to: "2027-06-30" });
  assert.equal(feature.notes[0].items[0].text, "review");
});

test("Ignore preserves but hides the following feature or task", () => {
  const source = "# P\n\n#Ignore\n## Hidden Feature\n### Child\n- [ ] hidden\n\n## Visible Feature\n#Ignore\n### Hidden Task\n- [ ] hidden\n\n### Visible Task\n- [ ] shown";
  const project = markdown.parse(source);
  assert.equal(project.features[0].ignored, true);
  assert.equal(project.features[1].ignored, false);
  assert.equal(project.features[1].tasks[0].ignored, true);
  assert.equal(project.features[1].tasks[1].ignored, false);
  const reparsed = markdown.parse(markdown.serialize(project));
  assert.equal(reparsed.features[0].ignored, true);
  assert.equal(reparsed.features[1].tasks[0].ignored, true);
  assert.equal((markdown.serialize(project).match(/#Ignore/g) || []).length, 2);
});

test("serialization preserves newline style, orders backlog last, and normalizes todos", () => {
  const value = markdown.parse("# P\r\n\r\n#Backlog\r\n## Later\r\n### T\r\n  + old\r\n* [x] done\r\n- open\r\n#Info\r\n- parent\r\n  + nested\r\n\r\n## Now\r\n### Work\r\n- [x] complete");
  const output = markdown.serialize(value);
  assert.ok(output.includes("\r\n"));
  assert.ok(output.indexOf("## Now") < output.indexOf("#Backlog"));
  assert.match(output, /^- \[ \] old$/m);
  assert.match(output, /^- \[x\] ~done~$/m);
  assert.match(output, /^- \[ \] open$/m);
  assert.match(output, /^[ ]{2}\+ nested$/m);
  assert.doesNotMatch(output, /^[ \t]+[+*-] \[[ x]\]/m);
  assert.match(output, /^- \[x\] ~complete~$/m);
});

test("Layout.md is the parsing golden file and round-trips without losing information", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../data/Layout.md"), "utf8");
  const first = markdown.parse(source);
  const serialized = markdown.serialize(first);
  const second = markdown.parse(serialized);

  const regularFeatures = first.features.filter(feature => !feature.isBacklog);
  const backlog = first.features.find(feature => feature.isBacklog);
  assert.equal(regularFeatures.length, 3);
  assert.equal(backlog.tasks.length, 3);
  assert.equal(regularFeatures[1].tasks.find(task => task.title === "Internal migration fixture").ignored, true);
  assert.match(source, /^#### Formatting toolbar$/m);
  assert.match(source, /\*\*bold context\*\*/);
  assert.match(source, /\*italic nuance\*/);
  assert.match(source, /`inline code`/);
  assert.match(source, /\[reference URL\]\(https:\/\/example\.com\/bootstrap\)/);
  assert.match(source, /- \[x\] ~Create the canonical local folders~/);
  assert.match(source, /#Info[\s\S]+#Warn/);
  assert.deepEqual(second, first);
  assert.equal(markdown.serialize(second), serialized);
});
