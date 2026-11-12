"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
const verifyWorkflow = fs.readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8");
const releaseEntries = fs.readFileSync(path.join(root, ".github/release-files.txt"), "utf8").split(/\r?\n/).map(entry => entry.trim()).filter(Boolean);

/** @param {string[]} entries */
function trackedFiles(entries) {
  return new Set(childProcess.execFileSync("git", ["ls-files", "--", ...entries], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map(file => file.replaceAll("\\", "/")).filter(file => fs.existsSync(path.join(root, file))));
}

// The bundle is built in the release job and copied next to the tracked release files.
const generatedFiles = ["dist/app.js", "dist/app.js.map"];

function releaseFiles() {
  return new Set([...trackedFiles(releaseEntries), ...generatedFiles]);
}

/** @param {string} reference */
function localReference(reference) {
  return reference && !reference.startsWith("#") && !reference.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(reference);
}

/** @param {string} source */
function htmlReferences(source) {
  return [...source.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(localReference);
}

/** @param {string} source */
function cssReferences(source) {
  return [...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(match => match[1]).filter(localReference);
}

/** @param {string} source */
function markdownReferences(source) {
  return [...source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1]).filter(localReference);
}

/** @param {string} source */
function runtimeReferences(source) {
  const extension = "(?:css|gif|jpe?g|js|mp3|ogg|otf|png|svg|ttf|wav|webp|woff2?)";
  const nested = new RegExp(`["'\\x60]((?:[A-Za-z0-9_.-]+/)+[A-Za-z0-9_.-]+\\.${extension})["'\\x60]`, "gi");
  const startup = /missingResources\.push\("([^"]+)"\)/g;
  return [...source.matchAll(nested), ...source.matchAll(startup)].map(match => match[1]).filter(localReference);
}

test("release preparation is explicitly dispatched and creates only a draft", () => {
  assert.match(releaseWorkflow, /workflow_dispatch:\s+inputs:\s+version:/);
  assert.match(releaseWorkflow, /uses: \.\/\.github\/workflows\/verify\.yml/);
  assert.match(releaseWorkflow, /needs: verify/);
  assert.match(releaseWorkflow, /contents: write/);
  assert.match(releaseWorkflow, /id="appVersion"/);
  assert.match(releaseWorkflow, /id="watermark"/);
  assert.match(releaseWorkflow, /README\.md has no release-table entry/);
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
  const packaged = trackedFiles(releaseEntries);
  assert.deepEqual(releaseEntries, [
    "MD_Manager.html",
    "styles.css",
    "res",
    "data/templates",
    "README.md",
    "LICENSE"
  ]);
  for (const entry of releaseEntries) {
    assert.ok(fs.existsSync(path.join(root, entry)), `${entry} must exist`);
    assert.ok([...packaged].some(file => file === entry || file.startsWith(`${entry}/`)), `${entry} must contain tracked release content`);
  }
  assert.match(releaseWorkflow, /mapfile -t release_paths < \.github\/release-files\.txt/);
  assert.match(releaseWorkflow, /"\$\{release_paths\[@\]\}"/);
  assert.match(releaseWorkflow, /npm ci\s+npm run build/, "the release job builds the bundle");
  assert.match(releaseWorkflow, /cp -R dist "release\/\$folder\/dist"/, "the release archive contains the bundle");
  assert.match(releaseWorkflow, /cp node_modules\/sortablejs\/LICENSE "release\/\$folder\/licenses\/SortableJS-LICENSE"/, "the release archive contains the license of the bundled SortableJS");
});

test("every local runtime dependency is tracked and included in the release", () => {
  const packaged = releaseFiles();
  const html = fs.readFileSync(path.join(root, "MD_Manager.html"), "utf8");
  const references = new Set(htmlReferences(html));

  for (const file of packaged) {
    if (!file.endsWith(".css") || generatedFiles.includes(file)) continue;
    cssReferences(fs.readFileSync(path.join(root, file), "utf8")).forEach(reference => references.add(reference));
  }
  // The production modules are bundled into dist/app.js; the paths they load at runtime must be packaged.
  // Module imports (relative or npm packages) are bundled as well and are not runtime paths.
  const packages = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies || {});
  const modules = trackedFiles(["app.js", "domain", "io", "ui"]);
  for (const file of modules) {
    if (!file.endsWith(".js")) continue;
    runtimeReferences(fs.readFileSync(path.join(root, file), "utf8"))
      .filter(reference => !reference.startsWith(".") && !modules.has(reference) && !packages.some(name => reference === name || reference.startsWith(`${name}/`)))
      .forEach(reference => references.add(reference));
  }

  for (const reference of references) {
    assert.ok(packaged.has(reference), `${reference} is required at runtime but is not tracked in the release`);
  }

  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const reference of [...htmlReferences(readme), ...markdownReferences(readme)]) {
    assert.ok(packaged.has(reference), `${reference} is referenced by README.md but is not tracked in the release`);
  }
});
