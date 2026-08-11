"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** @param {string} value */
function slash(value) {
  return value.replaceAll("\\", "/");
}

/** @param {string} root @param {string} directory @returns {string[]} */
function filesBelow(root, directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = slash(path.join(directory, entry.name));
    return entry.isDirectory() ? filesBelow(root, relative) : [relative];
  });
}

/** @param {string} root */
function checkHarness(root) {
  /** @type {string[]} */
  const violations = [];
  const requiredFiles = [
    "AGENTS.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "jsconfig.json",
    "jsconfig.harness.json",
    "eslint.config.js",
    "playwright.config.js",
    "tools/check-architecture.js",
    "tools/check-harness.js",
    "tests/unit/architecture-checker.test.js",
    "tests/unit/harness-doctor.test.js",
    "tests/e2e/fixtures.js",
    "data/parsing/Layout.md",
    "docs/work/current.md",
    ".github/workflows/verify.yml"
  ];
  /** @param {string} file @param {string} rule @param {string} detail */
  function report(file, rule, detail) {
    violations.push(`${file}: ${rule} — ${detail}`);
  }
  /** @param {string} file */
  function source(file) {
    return fs.readFileSync(path.join(root, file), "utf8");
  }

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file))) report(file, "HARNESS-FILES-001", "required harness file is missing");
  }
  if (violations.some(value => value.includes("HARNESS-FILES-001"))) return violations.sort();

  const packageJson = JSON.parse(source("package.json"));
  const scripts = packageJson.scripts || {};
  const expectedScripts = ["check:types", "check:types:production", "check:types:harness", "check:lint", "check:doctor", "check:architecture", "test:unit", "test:e2e", "verify"];
  for (const name of expectedScripts) {
    if (typeof scripts[name] !== "string" || !scripts[name].trim()) report("package.json", "HARNESS-SCRIPTS-001", `required script '${name}' is missing`);
  }
  const verifyStages = ["npm run check:types", "npm run check:lint", "npm run check:doctor", "npm run check:architecture", "npm run test:unit", "npm run test:e2e"];
  let previous = -1;
  for (const stage of verifyStages) {
    const index = String(scripts.verify || "").indexOf(stage);
    if (index === -1) report("package.json", "HARNESS-SCRIPTS-002", `verify does not run '${stage}'`);
    else if (index <= previous) report("package.json", "HARNESS-SCRIPTS-002", `verify runs '${stage}' out of order`);
    previous = index;
  }

  for (const file of ["AGENTS.md", "README.md"]) {
    if (!source(file).includes("npm run verify")) report(file, "HARNESS-DOCS-001", "documentation must name npm run verify as the development gate");
  }

  const workflow = source(".github/workflows/verify.yml");
  for (const required of ["workflow_call:", "contents: read", "ubuntu-latest", "windows-latest", "macos-latest", "npm ci", "npm run verify"]) {
    if (!workflow.includes(required)) report(".github/workflows/verify.yml", "HARNESS-CI-001", `verification workflow is missing '${required}'`);
  }

  const playwright = source("playwright.config.js");
  if (!/forbidOnly:\s*true/.test(playwright)) report("playwright.config.js", "HARNESS-PLAYWRIGHT-001", "forbidOnly must remain enabled");
  if (!/retries:\s*0/.test(playwright)) report("playwright.config.js", "HARNESS-PLAYWRIGHT-001", "retries must remain disabled so flakiness is visible");
  if (!/fullyParallel:\s*true/.test(playwright)) report("playwright.config.js", "HARNESS-PLAYWRIGHT-001", "tests must remain order-independent under full parallelism");

  const modifiers = /\b(?:test|describe)\.(?:only|skip|fixme|todo)\s*\(|\bskip\s*:\s*true/g;
  for (const file of filesBelow(root, "tests").filter(file => file.endsWith(".js"))) {
    if (modifiers.test(source(file))) report(file, "HARNESS-TESTS-001", "focused, skipped, fixme, or todo tests are forbidden");
    modifiers.lastIndex = 0;
  }

  const baselineNames = ["start-help-dark.png", "start-help-light.png", "board-expanded-backlog-dark.png", "board-expanded-backlog-light.png"];
  for (const platform of ["linux", "win32", "darwin"]) {
    for (const name of baselineNames) {
      const file = `tests/e2e/snapshots/${platform}/${name}`;
      if (!fs.existsSync(path.join(root, file))) report(file, "HARNESS-SNAPSHOTS-001", "required platform visual baseline is missing");
    }
  }

  const markdownTests = source("tests/unit/markdown.test.js");
  for (const contract of ["data/parsing/Layout.md", "round-trips without losing information", "serialization remains stable across repeated LF and CRLF round trips"]) {
    if (!markdownTests.includes(contract)) report("tests/unit/markdown.test.js", "HARNESS-MARKDOWN-001", `Markdown regression contract is missing '${contract}'`);
  }
  const layout = source("data/parsing/Layout.md");
  for (const marker of ["#Pin", "#Ignore", "#Backlog", "#Archive", "#Version", "#Date", "#Info", "#Warn"]) {
    if (!new RegExp(`^${marker}$`, "m").test(layout)) report("data/parsing/Layout.md", "HARNESS-MARKDOWN-002", `golden file is missing required marker '${marker}'`);
  }

  const work = source("docs/work/current.md");
  const idle = /^# Current Work\r?\n\r?\n_No active work item\._\s*$/.test(work);
  if (!idle) {
    const requiredWorkSections = ["# Work Item:", "**Status:**", "## Outcome", "## In scope", "## Out of scope", "## Impact matrix", "## Acceptance criteria and evidence", "## Implementation steps", "## Planned regression coverage", "## Performance considerations", "## Review evidence"];
    for (const section of requiredWorkSections) {
      if (!work.includes(section)) report("docs/work/current.md", "HARNESS-WORK-001", `active work item is missing '${section}'`);
    }
  }

  return violations.sort();
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const violations = checkHarness(root);
  if (violations.length) {
    console.error("Harness doctor found violations:\n");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Harness doctor passed.");
  }
}

module.exports = { checkHarness };
