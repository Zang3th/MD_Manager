const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const load = require("./load-classic");

const { markdown } = load("io/markdown.js");

/** @param {unknown} error @param {RegExp} [message] */
function isMarkdownError(error, message) {
  return typeof error === "object" && error !== null &&
    "name" in error && error.name === "MarkdownFormatError" &&
    "message" in error && typeof error.message === "string" && Boolean(error.message) &&
    (!message || message.test(error.message));
}

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
    assert.throws(() => markdown.parse(source), error => isMarkdownError(error));
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
  assert.equal(Array.from(taskLines).filter((/** @type {string} */ line) => line === "#Info").length, 1);
  assert.equal(Array.from(taskLines).filter((/** @type {string} */ line) => line === "#Warn").length, 1);
  const task = markdown.taskContent({ lines: ["#Info", "first", "#Info", "second", "#Warn", "one", "#Warn", "two"] });
  assert.equal(task.blocks.filter((/** @type {any} */ block) => block.type === "note" && block.noteType === "info").length, 1);
  assert.equal(task.blocks.filter((/** @type {any} */ block) => block.type === "note" && block.noteType === "warn").length, 1);

  const feature = markdown.composeFeatureMetadata({ metadata: "#Version\n- 1.0.0\n#Info\n- embedded\n#Warn\n- embedded warning", info: "- explicit", warn: "- explicit warning" });
  assert.equal(feature.headerLines.filter((/** @type {string} */ line) => line === "#Info").length, 1);
  assert.equal(feature.headerLines.filter((/** @type {string} */ line) => line === "#Warn").length, 1);
  const parsed = markdown.parse("# P\n## F\n#Info\n- first\n#Info\n- second\n#Warn\n- one\n#Warn\n- two");
  assert.equal(parsed.features[0].notes.filter((/** @type {any} */ note) => note.type === "info").length, 1);
  assert.equal(parsed.features[0].notes.filter((/** @type {any} */ note) => note.type === "warn").length, 1);
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

test("only the first #Pin is used and duplicate pins produce a warning", () => {
  const project = markdown.parse("# P\n\n#Pin\n## First\n### A\n- [ ] one\n\n#Pin\n## Second\n### B\n- [ ] two");
  assert.equal(project.features[0].isPinned, true);
  assert.equal(project.features[1].isPinned, false);
  assert.equal(project.warnings.length, 1);
  assert.match(project.warnings[0].message, /multiple #Pin tags/i);
  const serialized = markdown.serialize(project);
  assert.equal((serialized.match(/^#Pin$/gm) || []).length, 1);
  assert.match(serialized, /#Pin\n## First/);
});

test("#Pin outside feature level is ignored with a warning", () => {
  const project = markdown.parse("# P\n\n## Feature\n#Pin\n### Task\n- [ ] work");
  assert.equal(project.features[0].isPinned, false);
  assert.equal(project.warnings.length, 1);
  assert.match(project.warnings[0].message, /only supported directly before a feature heading/i);
  assert.doesNotMatch(markdown.serialize(project), /#Pin/);
});

test("#Pin cannot pin the backlog or be serialized on it", () => {
  const parsed = markdown.parse("# P\n\n#Backlog\n#Pin\n## Later\n### Task\n- [ ] work");
  assert.equal(parsed.features[0].isBacklog, true);
  assert.equal(parsed.features[0].isPinned, false);
  assert.match(parsed.warnings[0].message, /cannot be used on the backlog/i);
  parsed.features[0].isPinned = true;
  assert.doesNotMatch(markdown.serialize(parsed), /#Pin/);
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

test("archive is optional, may be empty, and round-trips complete features at the end", () => {
  const omitted = markdown.parse("# P\n\n## Current");
  assert.equal(omitted.hasArchive, false);
  assert.doesNotMatch(markdown.serialize(omitted), /#Archive/);

  const empty = markdown.parse("# P\n\n#Archive\n");
  assert.equal(empty.hasArchive, true);
  assert.match(markdown.serialize(empty), /#Archive\n# Archive$/);

  const source = "# P\n\n#Archive\n# Finished work\n## Archived\n#Info\n- retained\n### Child\n- [x] done";
  const project = markdown.parse(source);
  assert.equal(project.archiveTitle, "Finished work");
  assert.equal(project.features[0].isArchived, true);
  assert.equal(project.features[0].tasks[0].title, "Child");
  assert.deepEqual(Array.from(project.features[0].tasks[0].lines), ["- [x] done"]);
  assert.equal(markdown.parse(markdown.serialize(project)).features[0].isArchived, true);
});

test("backlog and archive tags define behavior independently of their display names", () => {
  const project = markdown.parse("# P\n\n#Backlog\n## Later queue\n### Deferred\n- [ ] pending\n\n#Archive\n# Finished history\n\n## Shipped release\n### Done\n- [x] complete");
  const backlog = project.features.find((/** @type {any} */ feature) => feature.isBacklog);
  const archived = project.features.find((/** @type {any} */ feature) => feature.isArchived);
  assert.equal(backlog.title, "Later queue");
  assert.equal(archived.title, "Shipped release");
  assert.equal(project.archiveTitle, "Finished history");
  assert.match(markdown.serialize(project), /#Backlog\n## Later queue[\s\S]+#Archive\n# Finished history[\s\S]+## Shipped release/);
});

test("docs/Roadmap.md uses the supported tagged archive section shape", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../docs/Roadmap.md"), "utf8");
  const project = markdown.parse(source);
  assert.equal(project.features.find((/** @type {any} */ feature) => feature.isBacklog).title, "Backlog");
  assert.equal(project.archiveTitle, "Archive");
  assert.equal(project.features.find((/** @type {any} */ feature) => feature.isArchived).title, "Prototyp");
});

test("archive serialization sorts versions and ISO or European dates before missing metadata", () => {
  const project = markdown.parse("# P\n\n#Archive\n## Unknown\n### U\n- [x] u\n## Date Late\n#Date\n- 2028-04-01\n### Done\n- [x] done\n## Version Ten\n#Version\n- 10.0.0\n### Done\n- [x] done\n## Date Early\n#Date\n- 01.03.2027\n### Done\n- [x] done\n## Version Two\n#Version\n- 2.0.0\n### Done\n- [x] done");
  const output = markdown.serialize(project);
  const titles = Array.from(output.matchAll(/^## (.+)$/gm), match => match[1]);
  assert.deepEqual(titles, ["Version Two", "Version Ten", "Date Early", "Date Late", "Unknown"]);
  assert.ok(output.indexOf("#Archive") > output.indexOf("# P"));
});

test("archive rejects individual tasks and sections following it", () => {
  assert.throws(
    () => markdown.parse("# P\n\n## Current\n### Work\n- [ ] open\n\n#Archive\n### Orphan\n- [ ] forbidden"),
    error => isMarkdownError(error, /individual tasks/i)
  );
  assert.throws(
    () => markdown.parse("# P\n\n#Archive\n\n#Backlog\n## Later"),
    error => isMarkdownError(error, /cannot appear after/i)
  );
  assert.throws(
    () => markdown.parse("# P\n\n#Archive\n## Incomplete\n### Open\n- [ ] pending"),
    error => isMarkdownError(error, /not 100% complete/i)
  );
});

test("data/parsing/Layout.md is the parsing golden file and round-trips without losing information", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../data/parsing/Layout.md"), "utf8");
  const first = markdown.parse(source);
  const serialized = markdown.serialize(first);
  const second = markdown.parse(serialized);
  const serializedAgain = markdown.serialize(second);
  const third = markdown.parse(serializedAgain);

  const regularFeatures = first.features.filter((/** @type {any} */ feature) => !feature.isBacklog && !feature.isArchived);
  const backlog = first.features.find((/** @type {any} */ feature) => feature.isBacklog);
  const archivedFeatures = first.features.filter((/** @type {any} */ feature) => feature.isArchived);
  assert.equal(regularFeatures.length, 5);
  assert.equal(backlog.tasks.length, 3);
  assert.equal(first.hasArchive, true);
  assert.equal(first.archiveTitle, "Archive");
  assert.equal(first.newline, "\n");
  assert.doesNotMatch(serialized, /\r\n/);
  assert.deepEqual(Array.from(archivedFeatures, feature => feature.title), ["Archived Version Fixture", "Archived Date Fixture", "Archived Ignored Fixture", "Archived Metadata-free Fixture"]);
  assert.equal(archivedFeatures[0].version, "0.8.0");
  assert.equal(archivedFeatures[1].dates[0].from, "2025-10-01");
  assert.equal(archivedFeatures[2].ignored, true);
  assert.equal(archivedFeatures[2].tasks[0].title, "Ignored archive task");
  assert.equal(archivedFeatures[3].version, "");
  assert.equal(archivedFeatures[3].dates.length, 0);
  assert.equal(regularFeatures.find((/** @type {any} */ feature) => feature.title === "Editor Experience").isPinned, true);
  assert.equal(regularFeatures.find((/** @type {any} */ feature) => feature.title === "Hidden Feature Fixture").ignored, true);
  assert.equal(regularFeatures.find((/** @type {any} */ feature) => feature.title === "Empty Feature Fixture").tasks.length, 0);
  assert.equal(regularFeatures[1].tasks.find((/** @type {any} */ task) => task.title === "Internal migration fixture").ignored, true);
  assert.match(source, /^#### Formatting toolbar$/m);
  assert.match(source, /\*\*bold context\*\*/);
  assert.match(source, /\*italic nuance\*/);
  assert.match(source, /~obsolete wording~/);
  assert.match(source, /`inline code`/);
  assert.match(source, /\[reference URL\]\(https:\/\/example\.com\/bootstrap\)/);
  assert.match(source, /- \[x\] ~Create the canonical local folders~/);
  assert.match(source, /#Info[\s\S]+#Warn/);
  for (const tag of ["#Pin", "#Ignore", "#Backlog", "#Archive", "#Version", "#Date", "#Info", "#Warn"]) {
    assert.match(source, new RegExp(`^${tag}$`, "m"));
  }
  assert.match(serialized, /#Archive[\s\S]+Archived Metadata-free Fixture[\s\S]*$/);
  assert.deepEqual(second, first);
  assert.equal(serializedAgain, serialized);
  assert.deepEqual(third, second);
});

test("serialization remains stable across repeated LF and CRLF round trips", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = ["# Project", "", "## Feature", "### Task", "- [ ] Todo"].join(newline);
    const first = markdown.serialize(markdown.parse(source));
    const second = markdown.serialize(markdown.parse(first));
    assert.equal(second, first);
    assert.equal(markdown.parse(second).newline, newline);
  }
});
