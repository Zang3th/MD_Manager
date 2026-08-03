const { test, expect } = require("@playwright/test");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const initialMarkdown = "# Local Project\n\n## Feature\n### Task\n- [ ] Todo";

async function openMutableFile(page) {
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    window.__diskMarkdown = markdown;
    window.__diskRevision = 1;
    window.__diskDeleted = false;
    const handle = {
      name: "Project.md",
      async getFile() {
        if (window.__diskDeleted) throw new DOMException(`Missing file ${"details".repeat(300)}`, "NotFoundError");
        return {
          lastModified: window.__diskRevision,
          size: window.__diskMarkdown.length,
          text: async () => window.__diskMarkdown
        };
      },
      async createWritable() {
        let value = "";
        return {
          async write(markdownValue) { value = markdownValue; },
          async close() {
            if (window.__holdWrite) await new Promise(resolve => { window.__finishWrite = resolve; });
            window.__diskMarkdown = value;
            window.__diskRevision += 1;
          }
        };
      }
    };
    window.MDManager.files.open = async () => ({ handle, markdown, stamp: `1:${markdown.length}` });
    window.MDManager.files.remember = async () => {};
  }, initialMarkdown);
  await page.locator("#openFile").click();
}

async function changeDisk(page, markdown) {
  await page.evaluate(value => {
    window.__diskMarkdown = value;
    window.__diskRevision += 1;
    window.dispatchEvent(new Event("focus"));
  }, markdown);
}

test("external changes show warning actions and Reload starts a clean undo system", async ({ page }) => {
  await openMutableFile(page);
  const reload = page.getByRole("button", { name: "Reload" });
  const overwrite = page.getByRole("button", { name: "Overwrite" });
  await expect(reload).toBeHidden();
  await expect(overwrite).toBeHidden();
  await page.locator(".card-header").click();
  await expect(page.locator(".card")).toHaveAttribute("aria-expanded", "true");

  await changeDisk(page, "# External Project\n\n## Feature\n### Task\n- [ ] Changed");
  await expect(reload).toBeVisible();
  await expect(overwrite).toBeVisible();
  const buttonStyles = await page.locator("#externalActions .btn").evaluateAll(buttons => buttons.map(button => {
    const style = getComputedStyle(button);
    return { width: style.width, color: style.color, background: style.backgroundColor, border: style.borderColor };
  }));
  expect(buttonStyles.map(style => style.width)).toEqual(["64px", "64px"]);
  expect(await page.locator("#externalActions .btn").evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
  expect(buttonStyles[0].background).toBe("rgb(215, 153, 33)");
  expect(buttonStyles[1].background).toBe("rgb(254, 128, 25)");
  expect(buttonStyles.map(style => style.color)).toEqual(["rgb(29, 32, 33)", "rgb(29, 32, 33)"]);
  const buttonBounds = await page.locator("#externalActions .btn").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
  expect(buttonBounds[1].left - buttonBounds[0].right).toBeGreaterThan(0);
  expect(buttonBounds[1].left - buttonBounds[0].right).toBeLessThan(4);
  await reload.hover();
  await expect(reload).toHaveCSS("opacity", "1");
  await expect(reload).toHaveCSS("background-color", "rgb(60, 56, 54)");
  await expect(reload).toHaveCSS("border-color", "rgb(215, 153, 33)");
  await expect(reload).toHaveCSS("color", "rgb(215, 153, 33)");
  await expect(overwrite).toHaveCSS("opacity", "0.45");
  await overwrite.hover();
  await expect(reload).toHaveCSS("opacity", "0.45");
  await expect(overwrite).toHaveCSS("opacity", "1");
  await expect(overwrite).toHaveCSS("background-color", "rgb(60, 56, 54)");
  await expect(overwrite).toHaveCSS("border-color", "rgb(254, 128, 25)");
  await expect(overwrite).toHaveCSS("color", "rgb(254, 128, 25)");
  const warning = page.locator(".notification-warning").last();
  await expect(warning.locator(".notification-title")).toHaveText("File changed externally");
  await expect(warning.locator(".notification-body")).toContainText("Choose Reload or Overwrite");

  await reload.click();
  await expect(page.locator("#projectTitle")).toHaveText("External Project");
  await expect(page.locator(".card")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#undoChange")).toBeDisabled();
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty/);
  await expect(reload).toBeHidden();
  await expect(overwrite).toBeHidden();
});

test("Overwrite resolves an external conflict with the current local revision", async ({ page }) => {
  await openMutableFile(page);
  await page.locator(".card-header").click();
  await page.locator(".checkbox").click();
  await expect(page.locator("#saveFile")).toHaveClass(/dirty/);

  await changeDisk(page, "# External Project\n\n## Feature\n### Task\n- [ ] External");
  await page.evaluate(() => { window.__holdWrite = true; });
  const reload = page.getByRole("button", { name: "Reload" });
  const overwrite = page.getByRole("button", { name: "Overwrite" });
  await expect(overwrite).toBeVisible();
  await overwrite.click();
  await expect(overwrite).toBeDisabled();
  await expect(reload).toBeDisabled();
  await expect(overwrite).toHaveAttribute("aria-pressed", "true");
  await expect(reload).toHaveAttribute("aria-pressed", "false");
  await expect(overwrite).toHaveCSS("opacity", "1");
  await expect(reload).toHaveCSS("opacity", "1");
  await page.evaluate(() => { window.__finishWrite(); });

  await expect.poll(() => page.evaluate(() => window.__diskMarkdown)).toContain("# Local Project");
  await expect.poll(() => page.evaluate(() => window.__diskMarkdown)).toContain("- [x] ~Todo~");
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty/);
  await expect(overwrite).toBeHidden();
  await expect(reload).toBeHidden();
});

test("deleting the open file shows one concise and readable notification", async ({ page }) => {
  await openMutableFile(page);
  await page.evaluate(() => {
    window.__diskDeleted = true;
    window.dispatchEvent(new Event("focus"));
  });

  const deleted = page.locator(".notification-error").filter({ hasText: "File deleted" });
  await expect(deleted).toHaveCount(1);
  await expect(deleted.locator(".notification-title")).toHaveText("File deleted");
  await expect(deleted.locator(".notification-body")).toHaveText("Project.md was deleted from disk. Your work remains open.");
  await expect(page.getByRole("button", { name: "Reload" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Overwrite" })).toBeHidden();

  const layout = await deleted.evaluate(notification => {
    const body = notification.querySelector(".notification-body");
    const notificationBounds = notification.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    return { contained: bodyBounds.bottom <= notificationBounds.bottom, horizontalOverflow: body.scrollWidth > body.clientWidth };
  });
  expect(layout).toEqual({ contained: true, horizontalOverflow: false });

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(deleted).toHaveCount(1);
});
