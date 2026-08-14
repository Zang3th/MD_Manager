"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

/** @param {string} value */
function slash(value) {
  return value.replaceAll("\\", "/");
}

/** @param {string} value */
function spacesPreservingLines(value) {
  return value.replace(/[^\r\n]/g, " ");
}

/**
 * Removes comments and literal contents before lexical policy checks. This keeps
 * examples and user-facing strings from looking like executable dependencies.
 * @param {string} source
 */
function executableSource(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, source);
  let result = "";
  let cursor = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    result += source.slice(cursor, start);
    const literal = token === ts.SyntaxKind.StringLiteral ||
      token === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      token === ts.SyntaxKind.RegularExpressionLiteral ||
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia;
    result += literal ? spacesPreservingLines(source.slice(start, end)) : source.slice(start, end);
    cursor = end;
  }
  return result + source.slice(cursor);
}

/** @param {string} root @param {string} relativePath */
function exactFileExists(root, relativePath) {
  const normalized = path.posix.normalize(slash(relativePath));
  if (normalized !== slash(relativePath) || normalized === "." || normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return false;
  let current = root;
  for (const part of normalized.split("/")) {
    if (!fs.existsSync(current)) return false;
    const match = fs.readdirSync(current).find(entry => entry === part);
    if (!match) return false;
    current = path.join(current, match);
  }
  return fs.existsSync(current);
}

/** @param {string} root */
function checkArchitecture(root) {
  /** @type {string[]} */
  const violations = [];
  const rawCache = new Map();
  const executableCache = new Map();

  /** @param {string} file @param {string} rule @param {string} detail */
  function report(file, rule, detail) {
    violations.push(`${slash(file)}: ${rule} — ${detail}`);
  }

  /** @param {string} file */
  function source(file) {
    if (!rawCache.has(file)) rawCache.set(file, fs.readFileSync(path.join(root, file), "utf8"));
    return rawCache.get(file);
  }

  /** @param {string} file */
  function code(file) {
    if (!executableCache.has(file)) executableCache.set(file, executableSource(source(file)));
    return executableCache.get(file);
  }

  /** @param {string} file @param {string} rule @param {Array<[RegExp, string]>} patterns */
  function checkPatterns(file, rule, patterns) {
    const value = code(file);
    for (const [pattern, detail] of patterns) {
      if (pattern.test(value)) report(file, rule, detail);
    }
  }

  /** @param {string} directory */
  function javascriptFiles(directory) {
    /** @type {string[]} */
    const files = [];
    /** @param {string} relative */
    function visit(relative) {
      const absolute = path.join(root, relative);
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const target = slash(path.join(relative, entry.name));
        const stats = fs.lstatSync(path.join(root, target));
        if (stats.isSymbolicLink()) {
          report(target, "ARCH-FILES-001", "symbolic links are forbidden in production layers");
        } else if (entry.isDirectory()) {
          visit(target);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          files.push(target);
        } else if (entry.isFile()) {
          report(target, "ARCH-FILES-002", "only JavaScript files are allowed in production layer directories");
        }
      }
    }
    visit(directory);
    return files.sort();
  }

  const domainFiles = javascriptFiles("domain");
  const ioFiles = javascriptFiles("io");
  const uiFiles = javascriptFiles("ui");
  const productionFiles = ["app.js", ...domainFiles, ...ioFiles, ...uiFiles];
  /** @type {Array<[RegExp, string]>} */
  const forbiddenDomainDependencies = [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in domain/"],
    [/\b(?:window|navigator|location|localStorage|sessionStorage|indexedDB)\b(?!\.MDManager)/, "browser APIs are forbidden in domain/"],
    [/\b(?:showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "file and network APIs are forbidden in domain/"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in domain/"]
  ];

  for (const file of domainFiles) checkPatterns(file, "ARCH-DOMAIN-001", forbiddenDomainDependencies);

  for (const file of ioFiles) {
    checkPatterns(file, "ARCH-IO-001", [
      [/\b(?:document|HTMLElement|Element|Node|MutationObserver|ResizeObserver)\b/, "IO files must not access the DOM"],
      [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/"]
    ]);
  }

  checkPatterns("io/markdown.js", "ARCH-MARKDOWN-001", [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in io/markdown.js"],
    [/\b(?:window(?!\.MDManager)|navigator|location|localStorage|sessionStorage|indexedDB|showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "browser, file, and network APIs are forbidden in io/markdown.js"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/markdown.js"]
  ]);

  for (const file of uiFiles) {
    checkPatterns(file, "ARCH-UI-001", [
      [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "UI files must not access persistence APIs"],
      [/\bapp\.files\b|\bapp\.markdown\.(?:parse|serialize)\b/, "UI files must not call persistence or Markdown read/write operations directly"]
    ]);
    checkPatterns(file, "ARCH-UI-002", [
      [/\b(?:project\.features|feature\.tasks|task\.lines)[^;\n]*\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\(/, "UI files must use domain operations instead of mutating persistent collections"],
      [/\b(?:project|feature|task)\.(?:title|headerLines|version|dates|notes|features|tasks|lines|isBacklog|ignored)\s*(?:=|\+\+|--)/, "UI files must use domain operations instead of assigning persistent fields"]
    ]);
  }

  checkPatterns("ui/render.js", "ARCH-RENDER-001", [
    [/\bapp\.(?:domain|files|undoSystem|notifications|sounds|editor)\b/, "render.js may render derived state but must not perform business, persistence, undo, notification, sound, or editor operations"],
    [/\baddEventListener\s*\(|\bSortable(?:JS)?\b/, "render.js must not own interactions or SortableJS callbacks"]
  ]);

  for (const file of productionFiles.filter(file => file !== "io/files.js")) {
    checkPatterns(file, "ARCH-PERSISTENCE-001", [
      [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "persistent browser and file APIs belong in io/files.js"]
    ]);
  }

  for (const file of productionFiles.filter(file => file !== "ui/interactions.js")) {
    checkPatterns(file, "ARCH-SORTABLE-001", [[/\bSortable(?:JS)?\b/, "SortableJS production usage belongs in ui/interactions.js"]]);
  }

  for (const file of productionFiles) {
    checkPatterns(file, "ARCH-SCRIPTS-001", [
      [/(?:^|\n)\s*(?:import|export)\s/m, "ES module syntax is forbidden in production code"],
      [/\brequire\s*\(/, "CommonJS is forbidden in production code"],
      [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "network APIs are forbidden in the local production application"]
    ]);
    if (!/window\.MDManager\s*=\s*window\.MDManager\s*\|\|/.test(code(file))) {
      report(file, "ARCH-NAMESPACE-001", "production scripts must use the single window.MDManager namespace");
    }
  }

  if (!exactFileExists(root, "data/parsing/Layout.md")) report("data/parsing/Layout.md", "ARCH-LAYOUT-001", "the required Markdown layout and parsing golden file is missing");

  const html = source("MD_Manager.html");
  const scriptTags = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi)].map(match => ({
    attributes: `${match[1]} ${match[3]}`,
    source: slash(match[2])
  }));
  const scriptSources = scriptTags.map(script => script.source);
  for (const script of scriptTags) {
    if (!/\bdefer\b/i.test(script.attributes)) report("MD_Manager.html", "ARCH-SCRIPTS-002", `script '${script.source}' must be deferred`);
    if (/\btype\s*=\s*["']module["']/i.test(script.attributes)) report("MD_Manager.html", "ARCH-SCRIPTS-002", `script '${script.source}' must not be an ES module`);
    if (/^(?:https?:)?\/\//i.test(script.source)) report("MD_Manager.html", "ARCH-RESOURCES-001", `script '${script.source}' must be stored locally`);
  }
  for (const file of productionFiles) {
    const occurrences = scriptSources.filter(value => value === file).length;
    if (occurrences !== 1) report("MD_Manager.html", "ARCH-WIRING-001", `'${file}' must be loaded exactly once, found ${occurrences}`);
  }
  if (scriptSources.at(-1) !== "app.js") report("MD_Manager.html", "ARCH-WIRING-001", "app.js must load last so it only wires initialized layers");
  /** @param {string[]} files */
  const layerEnd = files => Math.max(...files.map(file => scriptSources.indexOf(file)));
  /** @param {string[]} files */
  const layerStart = files => Math.min(...files.map(file => scriptSources.indexOf(file)));
  if (layerEnd(domainFiles) >= layerStart(ioFiles) || layerEnd(ioFiles) >= layerStart(uiFiles)) {
    report("MD_Manager.html", "ARCH-WIRING-001", "classic scripts must load in domain, IO, UI, then app layer order");
  }

  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const resource = match[1];
    if (/^(?:https?:)?\/\//i.test(resource) || /^data:/i.test(resource)) {
      report("MD_Manager.html", "ARCH-RESOURCES-001", `production resource '${resource}' must be stored locally`);
      continue;
    }
    const resourcePath = resource.split(/[?#]/, 1)[0];
    if (!exactFileExists(root, resourcePath)) report("MD_Manager.html", "ARCH-RESOURCES-002", `resource '${resource}' does not exist with exact path casing`);
  }

  const css = source("styles.css");
  if (/@import\b/i.test(css)) report("styles.css", "ARCH-RESOURCES-001", "CSS imports are forbidden; styles and fonts must be stored locally");
  if (/url\(\s*["']?(?:https?:|\/\/|data:)/i.test(css)) report("styles.css", "ARCH-RESOURCES-001", "remote and embedded CSS resources are forbidden");
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const resource = match[1].trim().split(/[?#]/, 1)[0];
    if (!exactFileExists(root, resource)) report("styles.css", "ARCH-RESOURCES-002", `resource '${resource}' does not exist with exact path casing`);
  }

  const packageJson = JSON.parse(source("package.json"));
  const permittedProductionDependencies = new Set(["sortablejs"]);
  for (const dependency of Object.keys(packageJson.dependencies || {})) {
    if (!permittedProductionDependencies.has(dependency)) report("package.json", "ARCH-DEPENDENCIES-001", `unauthorized production dependency '${dependency}'`);
  }
  if (!exactFileExists(root, "vendor/Sortable.min.js") || !scriptSources.includes("vendor/Sortable.min.js")) {
    report("vendor/Sortable.min.js", "ARCH-DEPENDENCIES-001", "the permitted SortableJS dependency must be stored locally and loaded from vendor/");
  }

  return violations.sort();
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const violations = checkArchitecture(root);
  if (violations.length) {
    console.error("Architecture verification failed:\n");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Architecture verification passed.");
  }
}

module.exports = { checkArchitecture, executableSource };
