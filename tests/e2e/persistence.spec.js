const { test, expect } = require("./fixtures");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;

test("a failed save stays dirty, reports the error, and allows a later save", async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    const markdown = "# Project\n\n## Feature\n### Task\n- [ ] Todo";
    const handle = { name: "Project.md" };
    window.MDManager.files.open = async () => ({ handle, markdown });
    window.MDManager.files.remember = async () => {};
    let attempts = 0;
    window.MDManager.files.save = async () => {
      attempts++;
      if (attempts === 1) throw new Error("Disk unavailable");
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedError = value; } }
    });
  });
  await page.locator("#openFile").click();
  await page.locator(".card-header").click();
  await page.locator(".checkbox").click();
  const save = page.locator("#saveFile");
  await save.click();
  await expect(save).toHaveText("Save failed");
  await expect(save).toHaveAttribute("data-tooltip", "Disk unavailable");
  await expect(save).toHaveClass(/dirty/);
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File save");
  const saveError = page.locator(".notification-error");
  await expect(saveError.locator(".notification-text")).toHaveText("The open file could not be saved.");
  await expect(saveError.locator(".notification-body")).not.toContainText("Disk unavailable");
  await saveError.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedError)).toBe("Error: Code MDM-114 File save\nDetails: File could not be saved: Disk unavailable");
  await save.click();
  await expect(save).toHaveText("Saved");
  await expect(save).not.toHaveClass(/dirty/);
});

test("read and unsupported Markdown failures produce error notifications", async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedError = value; } }
    });
    window.MDManager.files.open = async () => { throw new Error("Device read failed"); };
  });
  await page.locator("#openFile").click();
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File read");
  let error = page.locator(".notification-error");
  await expect(error.locator(".notification-text")).toHaveText("The selected file could not be read.");
  await expect(error.locator(".notification-body")).not.toContainText("Device read failed");
  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedError)).toBe("Error: Code MDM-107 File read\nDetails: File could not be read: Device read failed");
  await expect(page.locator(".recent-files-empty")).toHaveText("No recent files.");

  await page.goto(appUrl);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedError = value; } }
    });
    const handle = { name: "Broken.md" };
    window.MDManager.files.open = async () => ({ handle, markdown: "# Project\ninvalid\u0000content" });
  });
  await page.locator("#openFile").click();
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File format");
  error = page.locator(".notification-error");
  await expect(error.locator(".notification-text")).toHaveText("The selected file has an invalid Markdown format.");
  await expect(error.locator(".notification-body")).not.toContainText("Line 2");
  await error.getByRole("button", { name: "Copy error" }).click();
  await expect.poll(() => page.evaluate(() => window.__copiedError)).toBe("Error: Code MDM-106 File format\nDetails: Line 2: Unreadable character at column 8.");
  await expect(page.locator("#content .start-screen")).toBeVisible();
  await expect(page.locator("#content > .error")).toHaveCount(0);
});

test("recent-file failures keep the start content and use error notifications", async ({ page }) => {
  await page.addInitScript(() => {
    const handle = {
      name: "Unavailable.md",
      requestPermission: async () => "granted",
      getFile: async () => { throw new Error("Recent file unavailable"); }
    };
    /** @type {any} */
    const database = {
      close() {},
      transaction() {
        return { objectStore: () => ({ getAll: () => {
          /** @type {any} */
          const request = { result: [{ id: "recent", name: handle.name, projectTitle: "Recent project", openedAt: Date.now(), handle }] };
          queueMicrotask(() => request.onsuccess());
          return request;
        } }) };
      }
    };
    indexedDB.open = /** @type {any} */ (() => {
      /** @type {any} */
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    });
  });
  await page.goto(appUrl);
  await page.locator(".recent-file-open").click();

  await expect(page.locator(".recent-project-name")).toHaveText("Recent project");
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File open");
  await expect(page.locator(".notification-error .notification-text")).toHaveText("The recent file could not be opened.");
});

test("recent-list loading failures keep the empty state and use an error notification", async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new Error("Recent database unavailable"); };
  });
  await page.goto(appUrl);

  await expect(page.locator(".recent-files-empty")).toHaveText("No recent files.");
  await expect(page.locator(".notification-error .notification-title")).toHaveText("Recent files unavailable");
  await expect(page.locator(".notification-error .notification-text")).toHaveText("Browser storage for recent files is unavailable. Enable storage for local files and reload MD_Manager.");
  await expect(page.locator("body")).toHaveAttribute("data-startup-state", "blocked");
  await expect(page.locator("#openFile")).toBeDisabled();
  await expect(page.locator("#newProject")).toBeDisabled();
});

test("feature-card zoom is restored from the matching recent file after reload", async ({ page }) => {
  await page.addInitScript(() => {
    const markdown = "# Project\n\n## Feature\n### Task\n- [ ] Todo";
    const handle = {
      name: "Project.md",
      requestPermission: async () => "granted",
      getFile: async () => ({ text: async () => markdown, lastModified: 1, size: markdown.length }),
      isSameEntry: async (/** @type {unknown} */ other) => other === handle
    };
    let record = { id: "project", name: handle.name, projectTitle: "Project", openedAt: 1, featureWidth: Number(window.name) || 540, handle };
    /** @type {any} */
    const database = {
      close() {},
      transaction() {
        /** @type {any} */
        const transaction = {};
        transaction.objectStore = () => ({
          getAll() {
            /** @type {any} */
            const request = {};
            queueMicrotask(() => { request.result = [record]; request.onsuccess(); });
            return request;
          },
          put(/** @type {any} */ next) {
            record = next;
            window.name = String(next.featureWidth);
            queueMicrotask(() => transaction.oncomplete());
          },
          delete() {}
        });
        return transaction;
      }
    };
    indexedDB.open = /** @type {any} */ (() => {
      /** @type {any} */
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    });
  });

  await page.goto(appUrl);
  await page.locator(".recent-file-open").click();
  await expect(page.locator("#content > .release")).toHaveCSS("width", "540px");
  await expect(page.locator("#featureZoomValue")).toHaveText("140%");
  await page.locator("#toggleWorkspaceZoom").click();
  const slider = page.locator("#featureWidth");
  await slider.press("ArrowLeft");
  await expect(page.locator("#content > .release")).toHaveCSS("width", "460px");
  await expect.poll(() => page.evaluate(() => window.name)).toBe("460");

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.name)).toBe("460");
  await page.locator(".recent-file-open").click();
  await expect(page.locator("#featureZoomValue")).toHaveText("120%");
  await expect(page.locator("#content > .release")).toHaveCSS("width", "460px");
});
