"use strict";

// Prints the application's source lines and test count (MD_Libs harness/checks).

const path = require("node:path");
const { projectStats, formatStats } = require("@zang3th/md-libs/harness/checks");

const root = path.resolve(__dirname, "..");
console.log(formatStats(projectStats({
  root,
  sources: { HTML: ["MD_Manager.html"], CSS: ["styles.css"], JS: ["app.js", "domain/", "io/", "ui/"] }
})));
