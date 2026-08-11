"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkHarness } = require("../../tools/check-harness.js");

const baselineNames = ["start-help-dark.png", "start-help-light.png", "workspace-expanded-backlog-dark.png", "workspace-expanded-backlog-light.png"];

/** @param {string} root @param {string} relative @param {string} content */
function write(root, relative, content = "fixture\n") {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "md-manager-doctor-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = {
    "check:types": "npm run check:types:production && npm run check:types:harness",
    "check:types:production": "tsc -p jsconfig.json",
    "check:types:harness": "tsc -p jsconfig.harness.json",
    "check:lint": "eslint . --max-warnings=0",
    "check:doctor": "node tools/check-harness.js",
    "check:architecture": "node tools/check-architecture.js",
    "test:unit": "node --test tests/unit/*.test.js",
    "test:e2e": "playwright test",
    "verify": "npm run check:types && npm run check:lint && npm run check:doctor && npm run check:architecture && npm run test:unit && npm run test:e2e"
  };
  const basicFiles = ["package-lock.json", "jsconfig.json", "jsconfig.harness.json", "eslint.config.js", "tools/check-architecture.js", "tools/check-harness.js", "tests/unit/architecture-checker.test.js", "tests/unit/harness-doctor.test.js", "tests/e2e/fixtures.js"];
  for (const file of basicFiles) write(root, file);
  write(root, "package.json", `${JSON.stringify({ scripts }, null, 2)}\n`);
  write(root, "AGENTS.md", "Run `npm run verify`.\n");
  write(root, "README.md", "Run `npm run verify`.\n");
  write(root, "playwright.config.js", "module.exports = { fullyParallel: true, forbidOnly: true, retries: 0 };\n");
  write(root, ".github/workflows/verify.yml", "workflow_call:\npermissions:\n  contents: read\n# ubuntu-latest windows-latest macos-latest npm ci npm run verify\n");
  write(root, "tests/unit/markdown.test.js", "// data/parsing/Layout.md\n// round-trips without losing information\n// serialization remains stable across repeated LF and CRLF round trips\n");
  write(root, "docs/work/current.md", "# Current Work\n\n_No active work item._\n");
  write(root, "data/parsing/Layout.md", ["# Layout", "#Pin", "#Ignore", "#Backlog", "#Archive", "#Version", "#Date", "#Info", "#Warn"].join("\n"));
  for (const platform of ["linux", "win32", "darwin"]) {
    for (const name of baselineNames) write(root, `tests/e2e/snapshots/${platform}/${name}`, "");
  }
  return root;
}

test("accepts a coherent deterministic harness contract", t => {
  assert.deepEqual(checkHarness(fixture(t)), []);
});

test("reports verify-order and CI drift with stable rule ids", t => {
  const root = fixture(t);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  packageJson.scripts.verify = "npm run test:e2e && npm run check:types";
  write(root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  write(root, ".github/workflows/verify.yml", "workflow_call:\npermissions:\n  contents: write\n");
  const violations = checkHarness(root);
  assert.ok(violations.some(value => value.includes("HARNESS-SCRIPTS-002")));
  assert.ok(violations.some(value => value.includes("HARNESS-CI-001")));
});

test("reports disabled tests and missing visual baselines", t => {
  const root = fixture(t);
  write(root, "tests/unit/disabled.test.js", "test" + ".only('hidden weakening', () => {});\n");
  fs.rmSync(path.join(root, "tests/e2e/snapshots/linux/start-help-dark.png"));
  const violations = checkHarness(root);
  assert.ok(violations.some(value => value.includes("HARNESS-TESTS-001")));
  assert.ok(violations.some(value => value.includes("HARNESS-SNAPSHOTS-001")));
});
