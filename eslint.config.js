const js = require("@eslint/js");
const globals = require("globals");
const { eslintConfig } = require("@zang3th/md-libs/harness/checks");

module.exports = eslintConfig({ js, globals });
