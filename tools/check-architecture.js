"use strict";

// Enforces the architecture rules of AGENTS.md on top of the MD_Libs checker engine, which covers
// modules, wiring, the page, styles and dependencies.

const path = require("node:path");
const ts = require("typescript");
const { createChecker, printResult } = require("@zang3th/md-libs/harness/checks");

/** MD_Libs entry points each layer may import; SortableJS only app.js (first, for its load order) and ui/interactions.js. */
const LIBRARY_ENTRIES = {
  domain: ["@zang3th/md-libs/core"],
  io: ["@zang3th/md-libs/core", "@zang3th/md-libs/platform"],
  ui: ["@zang3th/md-libs/core", "@zang3th/md-libs/ui"],
  app: ["@zang3th/md-libs"]
};
const SORTABLE_FILES = ["app.js", "ui/interactions.js"];

/** @param {string} root */
function checkArchitecture(root) {
  const checker = createChecker({ ts, root });
  const domainFiles = checker.javascriptFiles("domain");
  const ioFiles = checker.javascriptFiles("io");
  const uiFiles = checker.javascriptFiles("ui");
  const productionFiles = ["app.js", ...domainFiles, ...ioFiles, ...uiFiles];

  checker.forbid(domainFiles, "ARCH-DOMAIN-001", [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in domain/"],
    // Property accesses and object keys such as item.location or { location: … } are not the browser globals.
    [/(?<![.\w$])(?:window|navigator|location|localStorage|sessionStorage|indexedDB)\b(?!\.MDManager|\s*:)/, "browser APIs are forbidden in domain/"],
    [/\b(?:showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "file and network APIs are forbidden in domain/"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in domain/"]
  ]);
  checker.forbid(ioFiles, "ARCH-IO-001", [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver|ResizeObserver)\b/, "IO files must not access the DOM"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/"]
  ]);
  checker.forbid(["io/markdown.js"], "ARCH-MARKDOWN-001", [
    [/\b(?:document|HTMLElement|Element|Node|MutationObserver)\b/, "DOM usage is forbidden in io/markdown.js"],
    [/\b(?:window(?!\.MDManager)|navigator|location|localStorage|sessionStorage|indexedDB|showOpenFilePicker|showSaveFilePicker|FileReader|FileSystem\w*Handle|fetch)\b/, "browser, file, and network APIs are forbidden in io/markdown.js"],
    [/\bSortable(?:JS)?\b/, "SortableJS is forbidden in io/markdown.js"]
  ]);
  checker.forbid(uiFiles, "ARCH-UI-001", [
    [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "UI files must not access persistence APIs"],
    [/\bapp\.files\b|\bapp\.markdown\.(?:parse|serialize)\b/, "UI files must not call persistence or Markdown read/write operations directly"]
  ]);
  checker.forbid(uiFiles, "ARCH-UI-002", [
    [/\b(?:project\.features|feature\.tasks|task\.lines)[^;\n]*\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\(/, "UI files must use domain operations instead of mutating persistent collections"],
    [/\b(?:project|feature|task)\.(?:title|headerLines|version|dates|notes|features|tasks|lines|isBacklog|ignored)\s*(?:=|\+\+|--)/, "UI files must use domain operations instead of assigning persistent fields"]
  ]);
  checker.forbid(["ui/render.js"], "ARCH-RENDER-001", [
    [/\bapp\.(?:domain|files|notifications|sounds|editor)\b/, "render.js may render derived state but must not perform business, persistence, notification, sound, or editor operations"],
    [/\baddEventListener\s*\(|\bSortable(?:JS)?\b/, "render.js must not own interactions or SortableJS callbacks"]
  ]);
  checker.forbid(productionFiles.filter(file => file !== "io/files.js"), "ARCH-PERSISTENCE-001", [
    [/\b(?:indexedDB|localStorage|sessionStorage|showOpenFilePicker|showSaveFilePicker|createWritable|FileReader)\b/, "persistent browser and file APIs belong in io/files.js"]
  ]);
  checker.forbid(productionFiles.filter(file => file !== "ui/interactions.js"), "ARCH-SORTABLE-001", [
    [/\bSortable(?:JS)?\b/, "SortableJS production usage belongs in ui/interactions.js"]
  ]);

  checker.checkModules({ domain: domainFiles, io: ioFiles, ui: uiFiles }, {
    namespace: "MDManager",
    packages: (file, layer) => [...LIBRARY_ENTRIES[layer], ...(SORTABLE_FILES.includes(file) ? ["sortablejs"] : [])]
  });
  if (!checker.exists("data/parsing/Layout.md")) checker.report("data/parsing/Layout.md", "ARCH-LAYOUT-001", "the required Markdown layout and parsing golden file is missing");
  checker.checkPage("MD_Manager.html", "dist/app.js");
  checker.checkStyles("styles.css");
  checker.checkDependencies(["sortablejs", "@zang3th/md-libs"], ["sortablejs"]);
  return checker.violations();
}

if (require.main === module) printResult(checkArchitecture(path.resolve(__dirname, "..")));

module.exports = { checkArchitecture };
