const { test, expect } = require("./fixtures");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const externalMarkdown = "# External\n\n## Feature\n### Task\n- [ ] External";

/** @param {import("@playwright/test").Page} page */
async function openFiles(page) {
  await page.goto(appUrl);
  await page.evaluate(() => {
    /** @type {Record<string, any>} */
    const records = {
      A: { markdown: "# A\n\n## Feature\n### Task\n- [ ] First\n- [ ] Second", revision: 1, writes: 0 },
      B: { markdown: "# B\n\n## B feature\n### B task\n- [ ] B item", revision: 1, writes: 0 }
    };
    window.__reviewRecords = records;
    window.__reviewHandles = Object.fromEntries(Object.entries(records).map(([name, state]) => [name, {
      name: `${name}.md`,
      async getFile() {
        const markdown = state.markdown;
        return { lastModified: state.revision, size: markdown.length, text: async () => markdown };
      },
      async createWritable() {
        state.writes++;
        let next = "";
        return {
          async write(/** @type {string} */ value) { next = value; },
          async close() {
            if (state.holdWrite) {
              state.holdWrite = false;
              await new Promise(resolve => { window.__reviewReleaseWrite = () => resolve(undefined); });
            }
            if (state.failWrite) throw new Error("Held write failed");
            state.markdown = next;
            state.revision++;
            if (state.afterWrite) { state.markdown = state.afterWrite; state.revision++; }
          }
        };
      }
    }]));
    window.__reviewOpen = "A";
    window.__reviewOpenCount = 0;
    window.MDManager.files.open = async () => {
      window.__reviewOpenCount++;
      const state = records[window.__reviewOpen];
      return { handle: window.__reviewHandles[window.__reviewOpen], markdown: state.markdown, stamp: `${state.revision}:${state.markdown.length}` };
    };
    window.MDManager.files.remember = async () => {};
    const save = window.MDManager.files.save;
    /** @param {...any} args */
    window.MDManager.files.save = (...args) => {
      window.__reviewSavePromise = save(...args);
      return window.__reviewSavePromise;
    };
  });
  await page.locator("#openFile").click();
  await expect(page.locator("#projectTitle")).toHaveText("A");
}

/** @param {import("@playwright/test").Page} page */
async function editFirstTodo(page) {
  await page.locator(".card-header").click();
  await page.locator(".checkbox").first().click();
  await expect(page.locator("#saveFile")).toHaveText("Unsaved");
}

/** @param {import("@playwright/test").Page} page */
async function openB(page) {
  await page.evaluate(() => { window.__reviewOpen = "B"; });
  await page.keyboard.press("Control+o");
  await expect(page.locator("#projectTitle")).toHaveText("B");
}

/** @param {import("@playwright/test").Page} page */
async function holdCheck(page) {
  await page.evaluate(() => {
    const inspect = window.MDManager.files.inspect;
    let held = false;
    window.MDManager.files.inspect = (/** @type {any} */ handle) => {
      if (held || handle !== window.__reviewHandles.A) return inspect(handle);
      held = true;
      const operation = inspect(handle).then((/** @type {any} */ snapshot) => new Promise((resolve, reject) => {
        window.__reviewReleaseCheck = () => resolve(snapshot);
        window.__reviewRejectCheck = () => reject(new Error("Stale file check failed"));
      }));
      window.__reviewCheckPromise = operation;
      return operation;
    };
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => page.evaluate(() => typeof window.__reviewReleaseCheck)).toBe("function");
}

test("ordinary Save detects an external change before polling without overwriting it", async ({ page }) => {
  await openFiles(page);
  await editFirstTodo(page);
  await page.evaluate(markdown => {
    window.__reviewRecords.A.markdown = markdown;
    window.__reviewRecords.A.revision++;
    document.getElementById("saveFile").click();
  }, externalMarkdown);
  await expect(page.locator("#saveFile")).toHaveText("Conflict");
  expect(await page.evaluate(() => window.__reviewRecords.A.writes)).toBe(0);
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toBe(externalMarkdown);
  await page.locator("#saveFile").click();
  await page.locator("#overwriteExternal").click();
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [x] ~First~");
});

for (const failure of [false, true]) {
  test(`a delayed ${failure ? "failed" : "successful"} check cannot affect a newly opened project`, async ({ page }) => {
    await openFiles(page);
    await page.evaluate(markdown => {
      window.__reviewRecords.A.markdown = markdown;
      window.__reviewRecords.A.revision++;
    }, externalMarkdown);
    await holdCheck(page);
    await openB(page);
    await page.evaluate(async failure => {
      if (failure) window.__reviewRejectCheck();
      else window.__reviewReleaseCheck();
      await window.__reviewCheckPromise.catch(() => {});
    }, failure);
    await expect(page.locator("#saveFile")).toHaveText("Saved");
    await expect(page.locator(".card-title")).toHaveAttribute("data-full-title", "B task");
    await expect(page.locator(".notification-warning,.notification-error")).toHaveCount(0);
    await expect(page.locator("#undoChange")).toBeDisabled();
  });
}

for (const failure of [false, true]) {
  test(`a delayed ${failure ? "failed" : "successful"} save cannot change the new project's controls`, async ({ page }) => {
    await openFiles(page);
    await editFirstTodo(page);
    await page.evaluate(failure => {
      window.__reviewRecords.A.holdWrite = true;
      window.__reviewRecords.A.failWrite = failure;
    }, failure);
    await page.locator("#saveFile").click();
    await expect.poll(() => page.evaluate(() => typeof window.__reviewReleaseWrite)).toBe("function");
    await openB(page);
    await page.evaluate(async () => {
      window.__reviewReleaseWrite();
      await window.__reviewSavePromise.catch(() => {});
    });
    await expect(page.locator("#saveFile")).toHaveText("Saved");
    await expect(page.locator("#saveFile")).not.toHaveClass(/dirty|save-error/);
    await expect(page.locator(".notification-error")).toHaveCount(0);
    await expect(page.locator(".notification-info").filter({ has: page.locator(".notification-title", { hasText: "File saved" }) })).toHaveCount(0);
    expect(await page.evaluate(() => window.__reviewRecords.B.writes)).toBe(0);
  });
}

test("edits during a save remain dirty and repeated save intent writes the latest revision", async ({ page }) => {
  await openFiles(page);
  await editFirstTodo(page);
  await page.evaluate(() => { window.__reviewRecords.A.holdWrite = true; });
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => typeof window.__reviewReleaseWrite)).toBe("function");
  await page.locator(".checkbox").nth(1).click();
  await page.evaluate(async () => {
    window.__reviewReleaseWrite();
    await window.__reviewSavePromise;
  });
  await expect(page.locator(".notification-title").last()).toHaveText("File saved");
  await expect(page.locator("#saveFile")).toHaveText("Unsaved");
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [ ] Second");

  await page.evaluate(() => {
    window.__reviewReleaseWrite = null;
    window.__reviewRecords.A.holdWrite = true;
  });
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => typeof window.__reviewReleaseWrite)).toBe("function");
  await page.locator(".checkbox").first().click();
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+s");
  await page.evaluate(() => window.__reviewReleaseWrite());
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  expect(await page.evaluate(() => window.__reviewRecords.A.writes)).toBe(3);
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [ ] First");
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [x] ~Second~");
});

test("an external edit after the write remains a resolvable conflict", async ({ page }) => {
  await openFiles(page);
  await editFirstTodo(page);
  await page.evaluate(markdown => { window.__reviewRecords.A.afterWrite = markdown; }, externalMarkdown);
  await page.locator("#saveFile").click();
  await expect(page.locator("#saveFile")).toHaveText("Conflict");
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toBe(externalMarkdown);
  await page.locator("#saveFile").click();
  await page.locator("#reloadExternal").click();
  await expect(page.locator("#projectTitle")).toHaveText("External");
  await expect(page.locator("#saveFile")).toHaveText("Saved");
});

for (const failure of [false, true]) {
  test(`a delayed ${failure ? "failed" : "successful"} post-write inspection cannot affect a newly opened project`, async ({ page }) => {
    await openFiles(page);
    await editFirstTodo(page);
    await page.evaluate(() => {
      const inspect = window.MDManager.files.inspect;
      let held = false;
      window.MDManager.files.inspect = (/** @type {any} */ handle) => {
        if (held || handle !== window.__reviewHandles.A) return inspect(handle);
        held = true;
        window.__reviewCheckPromise = inspect(handle).then((/** @type {any} */ snapshot) => new Promise((resolve, reject) => {
          window.__reviewReleaseCheck = () => resolve(snapshot);
          window.__reviewRejectCheck = () => reject(new Error("Post-write check failed"));
        }));
        return window.__reviewCheckPromise;
      };
    });
    await page.locator("#saveFile").click();
    await expect.poll(() => page.evaluate(() => typeof window.__reviewReleaseCheck)).toBe("function");
    expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [x] ~First~");
    await openB(page);
    await page.evaluate(async failure => {
      if (failure) window.__reviewRejectCheck();
      else window.__reviewReleaseCheck();
      await window.__reviewCheckPromise.catch(() => {});
    }, failure);
    await expect(page.locator("#saveFile")).toHaveText("Saved");
    await expect(page.locator("#saveFile")).not.toHaveClass(/dirty|save-error/);
    await expect(page.locator(".notification-warning,.notification-error")).toHaveCount(0);
    await expect(page.locator(".notification-title").filter({ hasText: "File saved" })).toHaveCount(0);
    await expect(page.locator(".card-title")).toHaveAttribute("data-full-title", "B task");
  });
}

test("a failed post-write inspection reports a check error while the completed write stays saved", async ({ page }) => {
  await openFiles(page);
  await editFirstTodo(page);
  await page.evaluate(() => {
    window.MDManager.files.inspect = async () => { throw new Error("Post-write inspection unavailable"); };
  });
  await page.locator("#saveFile").click();
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty|save-error/);
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File check");
  expect(await page.evaluate(() => window.__reviewRecords.A.writes)).toBe(1);
  expect(await page.evaluate(() => window.__reviewRecords.A.markdown)).toContain("- [x] ~First~");
});

test("a check captured before saving cannot restore an obsolete conflict", async ({ page }) => {
  await openFiles(page);
  await editFirstTodo(page);
  await holdCheck(page);
  await page.locator("#saveFile").click();
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  await page.evaluate(async () => {
    window.__reviewReleaseCheck();
    await window.__reviewCheckPromise;
  });
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  await expect(page.locator(".notification-warning")).toHaveCount(0);
});

test("reload invalidates a check that captured the previous disk revision", async ({ page }) => {
  await openFiles(page);
  await page.evaluate(markdown => {
    window.__reviewRecords.A.markdown = markdown;
    window.__reviewRecords.A.revision++;
    window.dispatchEvent(new Event("focus"));
  }, externalMarkdown);
  await expect(page.locator("#saveFile")).toHaveText("Conflict");
  await holdCheck(page);
  await page.locator("#saveFile").click();
  await page.locator("#reloadExternal").click();
  await expect(page.locator("#projectTitle")).toHaveText("External");
  await page.evaluate(async () => {
    window.__reviewRejectCheck();
    await window.__reviewCheckPromise.catch(() => {});
  });
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  await expect(page.locator(".notification-error")).toHaveCount(0);
});
