const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

module.exports = function loadClassic(...files) {
  const context = vm.createContext({ window: { MDManager: {} } });
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  return context.window.MDManager;
};
