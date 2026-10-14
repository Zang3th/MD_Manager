"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
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

const appUrl = pathToFileURL(path.resolve(__dirname, "../../MD_Manager.html")).href;

/**
 * Waits until no layout pass is still pending. Font loading schedules one more pass of its own, so
 * a geometry baseline taken before this can be invalidated by a relayout the test never triggered.
 * @param {import("@playwright/test").Page} page
 */
function settleLayout(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/**
 * Notifications sit above the bottom-right controls until they dismiss themselves, so a test that
 * operates those controls clears them instead of waiting.
 * @param {import("@playwright/test").Page} page
 */
function dismissNotifications(page) {
  return page.locator("#notifications").evaluate(node => node.replaceChildren());
}

module.exports = { test, expect, appUrl, settleLayout, dismissNotifications };
