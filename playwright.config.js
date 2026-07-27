const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  outputDir: "test-results",
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce"
  }
});
