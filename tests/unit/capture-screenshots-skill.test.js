"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  DIAGONAL_COLOR,
  DIAGONAL_WIDTH,
  HEIGHT,
  WIDTH,
  discoverMarkdownFiles,
  plannedOutputPaths,
  plannedPairs,
  safeStem
} = require("../../.codex/skills/capture-screenshots/scripts/capture-screenshots.js");

/** @param {(directory: string) => void} run */
function withTemporaryDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "md-manager-screenshots-"));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("screenshot discovery reports missing and empty data directories", () => {
  withTemporaryDirectory(directory => {
    assert.throws(() => discoverMarkdownFiles(path.join(directory, "missing")), /does not exist/);
    assert.throws(() => discoverMarkdownFiles(directory), /contains no Markdown files/);
  });
});

test("screenshot discovery filters, naturally sorts, and gives colliding safe stems deterministic suffixes", () => {
  withTemporaryDirectory(directory => {
    for (const filename of ["10.md", "2.MD", "A name.md", "a-name.md", "ignore.txt"]) {
      fs.writeFileSync(path.join(directory, filename), "# Project\n");
    }
    const inputs = discoverMarkdownFiles(directory);
    assert.deepEqual(inputs.map(input => input.name), ["2.MD", "10.md", "A name.md", "a-name.md"]);
    assert.deepEqual(inputs.map(input => input.stem), ["2", "10", "a-name", "a-name-2"]);
  });
});

test("screenshot output plan routes source pairs and composites into separate directories", () => {
  const output = path.join("root", "res", "screenshots");
  const paths = plannedOutputPaths(output, [{ stem: "project" }]).map(filename => path.relative(output, filename));
  assert.deepEqual(paths, [
    path.join("source", "start-dark.png"),
    path.join("source", "start-light.png"),
    path.join("modified", "start.png"),
    path.join("source", "project-workspace-dark.png"),
    path.join("source", "project-workspace-light.png"),
    path.join("modified", "project-workspace.png"),
    path.join("source", "project-task-editor-dark.png"),
    path.join("source", "project-task-editor-light.png"),
    path.join("modified", "project-task-editor.png"),
    path.join("source", "project-archive-dark.png"),
    path.join("source", "project-archive-light.png"),
    path.join("modified", "project-archive.png")
  ]);
  assert.equal(safeStem("Über Plan!.md"), "uber-plan");
});

test("composite contract fixes dimensions, diagonal styling, and pair names", () => {
  const output = path.join("root", "res", "screenshots");
  const pairs = plannedPairs(output, [{ stem: "project" }]);
  assert.deepEqual(pairs.map(pair => pair.prefix), ["start", "project-workspace", "project-task-editor", "project-archive"]);
  assert.equal(WIDTH, 2540);
  assert.equal(HEIGHT, 1440);
  assert.equal(DIAGONAL_COLOR, "#504945");
  assert.equal(DIAGONAL_WIDTH, 8);
});
