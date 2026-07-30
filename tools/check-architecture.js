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

/** @param {string} directory */
function javascriptFiles(directory) {
  return fs.readdirSync(path.join(root, directory))
  .filter(file => file.endsWith(".js"))
    .map(file => `${directory}/${file}`);
}

const domainFiles = javascriptFiles("domain");
const ioFiles = javascriptFiles("io");
const uiFiles = javascriptFiles("ui");
const productionFiles = ["app.js", ...domainFiles, ...ioFiles, ...uiFiles];

const forbiddenDomainDependencies = [
  [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in domain/"],
  [/\b(?:window|navigator|location|localStorage|sessionStorage|indexedDB)\b(?!\.MDManager)/, "browser APIs are forbidden in domain/"],
  [/\b(?:showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "file and network APIs are forbidden in domain/"],
  [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in domain/"]
];

for (const file of domainFiles) {
  checkPatterns(file, "domain-purity", forbiddenDomainDependencies);
}

for (const file of ioFiles) {
  checkPatterns(file, "io-no-dom", [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver|ResizeObserver)\b/, "IO files must not access the DOM"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/"]
  ]);
}

checkPatterns("io/markdown.js", "markdown-purity", [
  [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in io/markdown.js"],
  [/\b(?:window(?!\.MDManager)|navigator|location|localStorage|sessionStorage|indexedDB|showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "browser, file, and network APIs are forbidden in io/markdown.js"],
  [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/markdown.js"]
]);

for (const file of uiFiles) {
  checkPatterns(file, "ui-no-persistence", [
    [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "UI files must not access persistence APIs"],
    [/\bapp\.files\b|\bapp\.markdown\.(?:parse|serialize)\b/, "UI files must not call persistence or Markdown read/write operations directly"]
  ]);
  checkPatterns(file, "ui-domain-transitions", [
    [/\b(?:project\.features|feature\.tasks|task\.lines)[^;\n]*\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\(/, "UI files must use domain operations instead of mutating persistent collections"],
    [/\b(?:project|feature|task)\.(?:title|headerLines|version|dates|notes|features|tasks|lines|isBacklog|ignored)\s*(?:=|\+\+|--)/, "UI files must use domain operations instead of assigning persistent fields"]
  ]);
}

checkPatterns("ui/render.js", "render-boundary", [
  [/\bapp\.(?:domain|files|history|notifications|sounds|editor)\b/, "render.js may render derived state but must not perform business, persistence, notification, sound, or editor operations"],
  [/\baddEventListener\s*\(|\bSortable(?:JS)?\b/, "render.js must not own interactions or SortableJS callbacks"]
]);

for (const file of productionFiles.filter(file => file !== "io/files.js")) {
  checkPatterns(file, "persistence-boundary", [
    [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "persistent browser and file APIs belong in io/files.js"]
  ]);
}

for (const file of productionFiles.filter(file => file !== "ui/interactions.js")) {
  checkPatterns(file, "sortable-boundary", [
    [/\bSortable(?:JS)?\b/, "SortableJS production usage belongs in ui/interactions.js"]
  ]);
}

for (const file of productionFiles) {
  checkPatterns(file, "classic-scripts", [
    [/(?:^|\n)\s*(?:import|export)\s/m, "ES module syntax is forbidden in production code"],
    [/\brequire\s*\(/, "CommonJS is forbidden in production code"],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "network APIs are forbidden in the local production application"]
  ]);
  if (!/window\.MDManager\s*=\s*window\.MDManager\s*\|\|/.test(source(file))) {
    report(file, "global-namespace", "production scripts must use the single window.MDManager namespace");
  }
}

if (!fs.existsSync(path.join(root, "data/parsing/Layout.md"))) {
  report("data/parsing/Layout.md", "layout-contract", "the required Markdown layout and parsing golden file is missing");
}

const html = source("MD_Manager.html");
const scriptTags = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi)].map(match => ({
  attributes: `${match[1]} ${match[3]}`,
  source: match[2]
}));
const scriptSources = scriptTags.map(script => script.source);
for (const script of scriptTags) {
  if (!/\bdefer\b/i.test(script.attributes)) report("MD_Manager.html", "classic-scripts", `script '${script.source}' must be deferred`);
  if (/\btype\s*=\s*["']module["']/i.test(script.attributes)) report("MD_Manager.html", "classic-scripts", `script '${script.source}' must not be an ES module`);
  if (/^(?:https?:)?\/\//i.test(script.source)) report("MD_Manager.html", "local-resources", `script '${script.source}' must be stored locally`);
}
for (const file of productionFiles) {
  const occurrences = scriptSources.filter(value => value === file).length;
  if (occurrences !== 1) report("MD_Manager.html", "script-wiring", `'${file}' must be loaded exactly once, found ${occurrences}`);
}
if (scriptSources.at(-1) !== "app.js") report("MD_Manager.html", "script-wiring", "app.js must load last so it only wires initialized layers");
const layerEnd = files => Math.max(...files.map(file => scriptSources.indexOf(file)));
const layerStart = files => Math.min(...files.map(file => scriptSources.indexOf(file)));
if (layerEnd(domainFiles) >= layerStart(ioFiles) || layerEnd(ioFiles) >= layerStart(uiFiles)) {
  report("MD_Manager.html", "script-wiring", "classic scripts must load in domain, IO, UI, then app layer order");
}

for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  const resource = match[1];
  if (/^(?:https?:)?\/\//i.test(resource) || /^data:/i.test(resource)) {
    report("MD_Manager.html", "local-resources", `production resource '${resource}' must be stored locally`);
    continue;
  }
  const resourcePath = resource.split(/[?#]/, 1)[0];
  if (!fs.existsSync(path.join(root, resourcePath))) report("MD_Manager.html", "local-resources", `resource '${resource}' does not exist`);
}

checkPatterns("styles.css", "local-resources", [
  [/@import\b/i, "CSS imports are forbidden; styles and fonts must be stored locally"],
  [/url\(\s*["']?(?:https?:|\/\/|data:)/i, "remote and embedded CSS resources are forbidden"]
]);
for (const match of source("styles.css").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
  const resource = match[1].trim().split(/[?#]/, 1)[0];
  if (!fs.existsSync(path.join(root, resource))) report("styles.css", "local-resources", `resource '${resource}' does not exist`);
}

const packageJson = JSON.parse(source("package.json"));
const productionDependencies = Object.keys(packageJson.dependencies || {});
const permittedProductionDependencies = new Set(["sortablejs"]);
for (const dependency of productionDependencies) {
  if (!permittedProductionDependencies.has(dependency)) {
    report("package.json", "production-dependencies", `unauthorized production dependency '${dependency}'`);
  }
}
if (!fs.existsSync(path.join(root, "vendor/Sortable.min.js")) || !scriptSources.includes("vendor/Sortable.min.js")) {
  report("vendor/Sortable.min.js", "production-dependencies", "the permitted SortableJS dependency must be stored locally and loaded from vendor/");
}

if (violations.length) {
  console.error("Architecture verification failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Architecture verification passed.");
}
