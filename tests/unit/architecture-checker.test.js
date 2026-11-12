"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkArchitecture } = require("../../tools/check-architecture.js");

function script(namespace = "base") {
  return `"use strict";\nwindow.MDManager = window.MDManager || {};\nwindow.MDManager.${namespace} = {};\n`;
}

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "md-manager-architecture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "app.js": [
      'import "sortablejs/Sortable.min.js";',
      'import "./domain/project.js";',
      'import "./io/files.js";',
      'import "./io/markdown.js";',
      'import "./ui/interactions.js";',
      'import "./ui/render.js";',
      script("app")
    ].join("\n"),
    "domain/project.js": script("domain"),
    "io/files.js": script("files"),
    "io/markdown.js": script("markdown"),
    "ui/interactions.js": `import Sortable from "sortablejs/Sortable.min.js";\n${script("interactions")}Sortable.create(document.body, {});\n`,
    "ui/render.js": script("render"),
    "data/parsing/Layout.md": "# Fixture\n",
    "styles.css": "",
    "package.json": JSON.stringify({ private: true, dependencies: { sortablejs: "1.15.7", "@zang3th/md-libs": "file:../MD_Libs" } }),
    "MD_Manager.html": '<!doctype html>\n<script defer src="dist/app.js"></script>'
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

/** @param {string} root @param {string} relative @param {string} content */
function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @param {string} root @param {string} modulePath */
function addDomainScript(root, modulePath) {
  const appPath = path.join(root, "app.js");
  const app = fs.readFileSync(appPath, "utf8");
  fs.writeFileSync(appPath, app.replace('import "./io/files.js";', `import "./${modulePath}";\nimport "./io/files.js";`));
}

test("accepts the minimal valid layered application fixture", t => {
  assert.deepEqual(checkArchitecture(fixture(t)), []);
});

test("domain property names that equal browser globals are no browser access", t => {
  const root = fixture(t);
  write(root, "domain/places.js", `${script("places")}const item = { location: "archive" };\nitem.location = item.window;\n`);
  addDomainScript(root, "domain/places.js");
  assert.deepEqual(checkArchitecture(root), []);
  write(root, "domain/places.js", `${script("places")}const item = { url: location.href };\n`);
  assert.ok(checkArchitecture(root).some(value => value.includes("domain/places.js: ARCH-DOMAIN-001")));
});

test("MD_Libs entry points and SortableJS are allowed only in their layers", t => {
  const root = fixture(t);
  write(root, "domain/project.js", `import "@zang3th/md-libs/ui";\nimport "sortablejs/Sortable.min.js";\n${script("domain")}`);
  write(root, "ui/render.js", `import "@zang3th/md-libs/core";\nimport "@zang3th/md-libs/ui";\nimport "@zang3th/md-libs/platform";\n${script("render")}`);
  const violations = checkArchitecture(root);
  for (const [file, specifier] of [["domain/project.js", "@zang3th/md-libs/ui"], ["domain/project.js", "sortablejs/Sortable.min.js"], ["ui/render.js", "@zang3th/md-libs/platform"]]) {
    assert.ok(violations.some(value => value.includes(`package '${specifier}' is not allowed in ${file}`)), `${specifier} in ${file}`);
  }
  assert.equal(violations.filter(value => value.startsWith("ui/render.js")).length, 1, "core and ui are allowed in ui/");
});
