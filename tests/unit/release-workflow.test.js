"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
const verifyWorkflow = fs.readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8");

test("release preparation is explicitly dispatched and creates only a draft", () => {
  assert.match(releaseWorkflow, /workflow_dispatch:\s+inputs:\s+version:/);
  assert.match(releaseWorkflow, /uses: \.\/\.github\/workflows\/verify\.yml/);
  assert.match(releaseWorkflow, /needs: verify/);
  assert.match(releaseWorkflow, /contents: write/);
  assert.match(releaseWorkflow, /id="appVersion"/);
  assert.match(releaseWorkflow, /git rev-parse --verify --quiet "refs\/tags\/v\$VERSION"/);
  assert.match(releaseWorkflow, /gh release create "v\$VERSION"/);
  assert.match(releaseWorkflow, /\s--draft\s/);
  assert.doesNotMatch(releaseWorkflow, /\brelease:\s+types:/);
});

test("verification can be reused by release preparation", () => {
  assert.match(verifyWorkflow, /workflow_call:/);
  assert.match(verifyWorkflow, /ubuntu-latest/);
  assert.match(verifyWorkflow, /windows-latest/);
  assert.match(verifyWorkflow, /macos-latest/);
  assert.match(verifyWorkflow, /npm run verify/);
});

test("release archive contains the local application runtime", () => {
  for (const entry of [
    "MD_Manager.html",
    "app.js",
    "styles.css",
    "domain",
    "io",
    "ui",
    "vendor",
    "res",
    "data/templates",
    "README.md",
    "LICENSE"
  ]) {
    assert.ok(fs.existsSync(path.join(root, entry)), `${entry} must exist`);
  }
  assert.match(
    releaseWorkflow,
    /MD_Manager\.html app\.js styles\.css domain io ui vendor res data\/templates README\.md LICENSE/
  );
});
