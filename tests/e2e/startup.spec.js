const { test, expect } = require("./fixtures");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;

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
  await expect(page.locator(".header")).toHaveCSS("opacity", "0.45");

  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__fallbackCopy)).toContain("Error: Code MDM-002 Unsupported browser\nDetails: A Chromium-based browser is required.");
  await expect.poll(() => page.evaluate(() => window.__fallbackCopy)).toContain("window.showOpenFilePicker()");
  await error.getByRole("button", { name: "Close error" }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
});

test("missing runtime files block startup and identify the failed component", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Sortable", { configurable: true, get: () => undefined, set() {} });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedStartupError = value; } }
    });
  });
  await page.goto(appUrl);

  const error = page.locator(".notification-error");
  await expect(error.locator(".notification-title")).toHaveText("Application files missing");
  await expect(error.locator(".notification-text")).toHaveText("Required application files are missing. Restore the complete release folder and reload MD_Manager.");
  await expect(error.locator(".notification-body")).not.toContainText("vendor/Sortable.min.js");
  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedStartupError)).toContain("vendor/Sortable.min.js");
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
});

test("missing local resources block startup with the affected path", async ({ page }) => {
  test.info().annotations.push({ type: "allow-browser-error", description: "^console: Failed to load resource: net::ERR_FAILED$" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedStartupError = value; } }
    });
  });
  await page.route("**/res/logo/Logo.svg", route => route.abort("failed"));
  await page.goto(appUrl);

  const error = page.locator(".notification-error");
  await expect(error.locator(".notification-title")).toHaveText("Application resources missing");
  await expect(error.locator(".notification-text")).toHaveText("Required application resources are missing. Restore the complete release folder and reload MD_Manager.");
  await expect(error.locator(".notification-body")).not.toContainText("res/logo/Logo.svg");
  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedStartupError)).toContain("res/logo/Logo.svg");
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
});
