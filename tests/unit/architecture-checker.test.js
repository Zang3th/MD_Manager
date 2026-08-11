"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkArchitecture, executableSource } = require("../../tools/check-architecture.js");

function script(namespace = "base") {
  return `"use strict";\nwindow.MDManager = window.MDManager || {};\nwindow.MDManager.${namespace} = {};\n`;
}

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "md-manager-architecture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "app.js": script("app"),
    "domain/project.js": script("domain"),
    "io/files.js": script("files"),
    "io/markdown.js": script("markdown"),
    "ui/interactions.js": script("interactions"),
    "ui/render.js": script("render"),
    "vendor/Sortable.min.js": "/* fixture */\n",
    "data/parsing/Layout.md": "# Fixture\n",
    "styles.css": "",
    "package.json": "{\n  \"private\": true\n}\n",
    "MD_Manager.html": [
      "<!doctype html>",
      '<script defer src="vendor/Sortable.min.js"></script>',
      '<script defer src="domain/project.js"></script>',
      '<script defer src="io/files.js"></script>',
      '<script defer src="io/markdown.js"></script>',
      '<script defer src="ui/interactions.js"></script>',
      '<script defer src="ui/render.js"></script>',
      '<script defer src="app.js"></script>'
    ].join("\n")
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

/** @param {string} root @param {string} scriptPath */
function addDomainScript(root, scriptPath) {
  const htmlPath = path.join(root, "MD_Manager.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  fs.writeFileSync(htmlPath, html.replace('<script defer src="io/files.js"></script>', `<script defer src="${scriptPath}"></script>\n<script defer src="io/files.js"></script>`));
}

test("accepts the minimal valid layered application fixture", t => {
  assert.deepEqual(checkArchitecture(fixture(t)), []);
});

test("recursively checks nested production JavaScript", t => {
  const root = fixture(t);
  write(root, "domain/nested/browser.js", `${script("nested")}document.body.textContent = "bad";\n`);
  addDomainScript(root, "domain/nested/browser.js");
  const violations = checkArchitecture(root);
  assert.ok(violations.some(value => value.includes("domain/nested/browser.js: ARCH-DOMAIN-001")));
  assert.ok(!violations.some(value => value.includes("found 0")));
});

test("ignores forbidden words in comments and strings", t => {
  const root = fixture(t);
  write(root, "domain/nested/examples.js", `${script("examples")}\n// document, localStorage, and FileReader are examples\nconst message = "fetch Sortable indexedDB";\nwindow.MDManager.examples.value = message;\n`);
  addDomainScript(root, "domain/nested/examples.js");
  assert.deepEqual(checkArchitecture(root), []);
});

test("reports duplicate script wiring with a stable rule id", t => {
  const root = fixture(t);
  const htmlPath = path.join(root, "MD_Manager.html");
  fs.appendFileSync(htmlPath, '\n<script defer src="domain/project.js"></script>\n');
  const violations = checkArchitecture(root);
  assert.ok(violations.some(value => value.includes("ARCH-WIRING-001") && value.includes("found 2")));
});

test("lexical masking preserves line structure and executable identifiers", () => {
  const masked = executableSource('const first = "document";\n// fetch\nconst second = document;\n');
  assert.equal(masked.split("\n").length, 4);
  assert.doesNotMatch(masked, /fetch/);
  assert.match(masked, /second = document/);
});
