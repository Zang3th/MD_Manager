"use strict";

const { test: base, expect } = require("@playwright/test");

const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    /** @type {string[]} */
    const errors = [];
    let pendingFontResourceFailures = 0;
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/^Access to font at 'file:\/\/\/.+\/res\/fonts\/(?:InterVariable|JetBrainsMonoVariable)\.woff2'.+blocked by CORS policy/.test(text)) {
        pendingFontResourceFailures += 1;
        return;
      }
      if (text === "Failed to load resource: net::ERR_FAILED" && pendingFontResourceFailures > 0) {
        pendingFontResourceFailures -= 1;
        return;
      }
      errors.push(`console: ${text}`);
    });
    page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
    await use(page);
    const allowed = testInfo.annotations.filter(annotation => annotation.type === "allow-browser-error").map(annotation => new RegExp(annotation.description || ""));
    const unexpected = errors.filter(error => !allowed.some(pattern => pattern.test(error)));
    expect(unexpected, "unexpected browser console or page errors").toEqual([]);
  }
});

module.exports = { test, expect };
