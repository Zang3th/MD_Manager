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
  await save.click();
  await expect(save).toHaveText("Save");
  await expect(save).not.toHaveClass(/dirty/);
});
