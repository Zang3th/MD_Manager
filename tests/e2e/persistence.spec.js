const { test, expect } = require("@playwright/test");
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
  });
  await page.locator("#openFile").click();
  await page.locator(".card-header").click();
  await page.locator(".checkbox").click();
  const save = page.locator("#saveFile");
  await save.click();
  await expect(save).toHaveText("Save failed");
  await expect(save).toHaveAttribute("title", "Disk unavailable");
  await expect(save).toHaveClass(/dirty/);
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File save");
  await expect(page.locator(".notification-error .notification-body")).toHaveText("File could not be saved: Disk unavailable");
  await save.click();
  await expect(save).toHaveText("Save");
  await expect(save).not.toHaveClass(/dirty/);
});

test("read and unsupported Markdown failures produce error notifications", async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => {
    window.MDManager.files.open = async () => { throw new Error("Device read failed"); };
  });
  await page.locator("#openFile").click();
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File read");
  await expect(page.locator(".notification-error .notification-body")).toHaveText("File could not be read: Device read failed");

  await page.goto(appUrl);
  await page.evaluate(() => {
    const handle = { name: "Broken.md" };
    window.MDManager.files.open = async () => ({ handle, markdown: "# Project\ninvalid\u0000content" });
  });
  await page.locator("#openFile").click();
  await expect(page.locator(".notification-error .notification-title")).toHaveText("File format");
  await expect(page.locator(".notification-error .notification-body")).toHaveText("Line 2: Unreadable character at column 8.");
  await expect(page.locator("#content .start-screen")).toBeVisible();
  await expect(page.locator("#content > .error")).toHaveCount(0);
});
