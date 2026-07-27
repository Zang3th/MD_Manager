"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const violations = [];

function report(file, rule, detail) {
  violations.push(`${file}: ${rule} — ${detail}`);
}

function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function checkPatterns(file, rule, patterns) {
  const value = source(file);
  for (const [pattern, detail] of patterns) {
    if (pattern.test(value)) report(file, rule, detail);
  }
}

const domainFiles = fs.readdirSync(path.join(root, "domain"))
  .filter(file => file.endsWith(".js"))
  .map(file => `domain/${file}`);

const forbiddenDomainDependencies = [
  [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in domain/"],
  [/\b(?:window|navigator|location|localStorage|sessionStorage|indexedDB)\b(?!\.MDManager)/, "browser APIs are forbidden in domain/"],
  [/\b(?:showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "file and network APIs are forbidden in domain/"],
  [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in domain/"]
];

for (const file of domainFiles) {
  checkPatterns(file, "domain-purity", forbiddenDomainDependencies);
}

checkPatterns("io/markdown.js", "markdown-purity", [
  [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in io/markdown.js"],
  [/\b(?:indexedDB|showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle)\b/, "file APIs are forbidden in io/markdown.js"],
  [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/markdown.js"]
]);

for (const file of fs.readdirSync(path.join(root, "ui")).filter(file => file.endsWith(".js")).map(file => `ui/${file}`)) {
  checkPatterns(file, "ui-no-persistence", [
    [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "UI files must not access persistence APIs"],
    [/\bapp\.files\b|\bapp\.markdown\.(?:parse|serialize)\b/, "UI files must not call persistence or Markdown read/write operations directly"]
  ]);
}

const packageJson = JSON.parse(source("package.json"));
const productionDependencies = Object.keys(packageJson.dependencies || {});
const permittedProductionDependencies = new Set(["sortablejs"]);
for (const dependency of productionDependencies) {
  if (!permittedProductionDependencies.has(dependency)) {
    report("package.json", "production-dependencies", `unauthorized production dependency '${dependency}'`);
  }
}

if (violations.length) {
  console.error("Architecture verification failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Architecture verification passed.");
}
