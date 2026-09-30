const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const load = require("./load-classic");

const { domain, markdown, search } = load("domain/project.js", "domain/search.js", "io/markdown.js");

test("archive eligibility agrees with parsed todos at every note boundary", () => {
  for (const marker of ["#Info", "#Warn"]) {
    for (const lines of [
      [marker, "Note", "", "- [ ] Open", "#### Group", "- [x] Done"],
      [marker, "Note", "", "", "- [x] Done"],
      [marker, "- [ ] Note item", "", "Continued prose", "- [ ] Another note item", "#### Group", "- [x] Done"],
      [marker, "Note", "", "Continued prose", "", "- [ ] Open"],
      [marker, "Note", "", "#Warn", "Warning", "#### Group", "- [x] Done"],
      [marker, "Note", "", "Continued prose"],
      [marker, "Note", "", "#### Group", "- [x] Done", "- [ ] Open"]
    ]) {
      const project = markdown.parse(`# P\n\n## F\n### T\n${lines.join("\n")}`);
      const feature = project.features[0];
      const todos = markdown.taskContent(feature.tasks[0]).todos;
      const complete = todos.length > 0 && todos.every((/** @type {{checked: boolean}} */ todo) => todo.checked);
      assert.equal(domain.featureComplete(feature), complete, lines.join("\n"));
      assert.equal(domain.archiveFeature(project, 0), complete);
      const reopened = markdown.parse(markdown.serialize(project));
      assert.equal(Boolean(reopened.features[0].isArchived), complete);
    }
  }
});

test("search cutoff equals the complete ranking prefix for tied kinds and locations", () => {
  const tasks = Array.from({ length: 50 }, () => "### Match\n- [ ] x").join("\n\n");
  const project = markdown.parse(`# P\n## Other\n${tasks}\n## Match\n### Unrelated\n- [ ] y\n#Backlog\n## Backlog\n### Match\n- [ ] z\n#Archive\n# Archive\n## Archived\n### Match\n- [x] Done`);
  const fullIndex = search.index(project, markdown.taskContent);
  const full = search.query(fullIndex, "match", 100);
  for (const limit of [1, 2, 50, 51, 52]) {
    const limitedIndex = search.index(project, markdown.taskContent);
    search.query(limitedIndex, "mat", limit);
    const limited = search.query(limitedIndex, "match", limit);
    assert.equal(limited.total, full.total);
    assert.deepEqual(limited.results, full.results.slice(0, limit));
  }
  assert.equal(full.results[0].item.kind, "feature");
});

test("serialization keeps array copying bounded linearly as task headings grow", () => {
  const metrics = { copied: 0 };
  const context = vm.createContext({ window: { MDManager: {} }, metrics });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../io/markdown.js"), "utf8"), context);
  vm.runInContext(`
    const originalSlice = Array.prototype.slice;
    Array.prototype.slice = function (...args) {
      const result = originalSlice.apply(this, args);
      metrics.copied += result.length;
      return result;
    };
  `, context);
  const measuredMarkdown = context.window.MDManager.markdown;
  for (const count of [256, 512]) {
    const source = `# P\n\n## F\n${Array.from({ length: count }, (_, i) => `### Task ${i}\n- [ ] Item ${i}\n`).join("\n")}`;
    const project = measuredMarkdown.parse(source);
    metrics.copied = 0;
    const serialized = measuredMarkdown.serialize(project);
    assert.ok(metrics.copied <= source.split("\n").length * 2, `copied ${metrics.copied} elements for ${count} tasks`);
    assert.equal(measuredMarkdown.serialize(measuredMarkdown.parse(serialized)), serialized);
  }
});

test("heading spacing keeps canonical empty sections and project-ending LF or CRLF blanks", () => {
  for (const newline of ["\n", "\r\n"]) {
    for (const tail of ["", "\n", "\n\n", "\n \n"]) {
      const source = `# P\n\n## F\n\n### Empty${tail}`.replaceAll("\n", newline);
      const serialized = markdown.serialize(markdown.parse(source));
      assert.equal(serialized, `# P${newline}${newline}## F${newline}${newline}### Empty`);
      const projectOnly = `# P${tail}`.replaceAll("\n", newline);
      assert.equal(markdown.serialize(markdown.parse(projectOnly)), `# P${tail ? newline : ""}`);
    }
  }
});
