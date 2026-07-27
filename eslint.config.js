const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "vendor/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["app.js", "domain/**/*.js", "io/**/*.js", "ui/**/*.js"],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, Sortable: "readonly" } }
  },
  {
    files: ["tests/**/*.js", "tools/**/*.js", "playwright.config.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node }
  },
  {
    files: ["tests/e2e/**/*.js"],
    languageOptions: { globals: globals.browser }
  }
];
