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
  {
    linterOptions: { reportUnusedDisableDirectives: "error" }
  },
  js.configs.recommended,
  {
    files: ["app.js", "domain/**/*.js", "io/**/*.js", "ui/**/*.js"],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, Sortable: "readonly" } }
  },
  {
    files: ["tests/**/*.js", "tools/**/*.js", "playwright.config.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(only|skip|fixme|todo)$/]",
          message: "Focused, skipped, fixme, and todo tests are forbidden because they silently weaken verification."
        }
      ]
    }
  },
  {
    files: ["tests/e2e/**/*.js"],
    languageOptions: { globals: globals.browser }
  }
];
