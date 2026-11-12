const { test, expect, appUrl } = require("./fixtures");


test("missing File System Access API blocks unsupported browsers with concise visible and detailed copied errors", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = command => {
      if (command !== "copy") return false;
      window.__fallbackCopy = (/** @type {HTMLTextAreaElement | null} */ (document.querySelector("body > textarea[readonly]")))?.value || "";
      return true;
    };
  });
  await page.goto(appUrl);

  const error = page.locator(".notification-error");
  await expect(error.locator(".notification-title")).toHaveText("Unsupported browser");
  await expect(error.locator(".notification-text")).toHaveText("A Chromium-based browser is required, such as Chrome, Edge, Brave, or Chromium.");
  await expect(error.locator(".notification-body")).not.toContainText("showOpenFilePicker");
  await expect(error.locator(".notification-copy-note")).toHaveText("Extended details can be copied with the clipboard button.");
  await expect(error.locator(".notification-tag")).toHaveText("Error");
  await expect.poll(() => error.locator(".notification-title").evaluate(title => title.scrollWidth <= title.clientWidth)).toBe(true);
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("body")).toHaveClass(/startup-blocked/);
  await expect(page.locator(".header")).toHaveAttribute("inert", "");
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  await expect(page.locator("#openFile")).toBeDisabled();
  await expect(page.locator("#newProject")).toBeDisabled();

  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__fallbackCopy)).toContain("Error: Code MDM-002 Unsupported browser\nDetails: A Chromium-based browser is required.");
  await expect.poll(() => page.evaluate(() => window.__fallbackCopy)).toContain("window.showOpenFilePicker()");
  await error.getByRole("button", { name: "Close error" }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
});

test("a missing application bundle shows only how to build it", async ({ page }) => {
  test.info().annotations.push({ type: "allow-browser-error", description: "^console: Failed to load resource: net::ERR_FAILED$" });
  await page.route("**/dist/app.js", route => route.abort("failed"));
  await page.goto(appUrl);

  const notice = page.locator(".build-missing");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText("MD_Manager has not been built yet. Run npm ci and npm run build in the MD_Manager folder.");
  await expect(page.locator(".header")).toBeHidden();
  await expect(page.locator(".workspace")).toBeHidden();
  await expect(page.locator("body")).not.toHaveAttribute("data-startup-state", "ready");
});

test("missing local resources block startup with the affected path", async ({ page }) => {
  test.info().annotations.push({ type: "allow-browser-error", description: "^console: Failed to load resource: net::ERR_FAILED$" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedStartupError = value; } }
    });
  });
  await page.route("**/res/logo/icon.svg", route => route.abort("failed"));
  await page.goto(appUrl);

  const error = page.locator(".notification-error");
  await expect(error.locator(".notification-title")).toHaveText("Application resources missing");
  await expect(error.locator(".notification-text")).toHaveText("Required application resources are missing. Restore the complete release folder and reload MD_Manager.");
  await expect(error.locator(".notification-body")).not.toContainText("res/logo/icon.svg");
  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedStartupError)).toContain("res/logo/icon.svg");
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
});
