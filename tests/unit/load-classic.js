const path = require("node:path");
const esbuild = require("esbuild");
const { loadClassic } = require("@zang3th/md-libs/harness/testing");

const root = path.join(__dirname, "../..");

/**
 * Production modules with their imports in an isolated context with the given browser globals; returns its window.
 * @param {Record<string, unknown>} globals @param {...string} files @returns {any}
 */
function loadWithGlobals(globals, ...files) {
  return loadClassic({ esbuild, root, namespace: "MDManager", files, globals });
}

/** Production modules in an isolated context; returns the shared namespace. @param {...string} files @returns {any} */
function load(...files) {
  return loadWithGlobals({}, ...files).MDManager;
}

module.exports = Object.assign(load, { loadWithGlobals });
