"use strict";

// Bundles app.js and everything it imports into dist/app.js (see README.md).

const path = require("node:path");
const esbuild = require("esbuild");
const { build } = require("@zang3th/md-libs/harness/build");

const root = path.resolve(__dirname, "..");

/** Builds dist/app.js. */
function buildApp() {
  return build({ esbuild, root });
}

if (require.main === module) {
  buildApp().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { buildApp };
