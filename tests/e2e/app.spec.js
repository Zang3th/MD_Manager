const { test, expect } = require("@playwright/test");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const fixture = `# Test Project

## Active Feature
#Version
- 1.2.3
#Date
- 2026-01-01 - 2026-02-01
#Info
- Feature information

### Started Task
- [x] ~done~
- [ ] open

### Complete Task
- [x] ~first~

## Open Feature
### Empty Task
- [ ] pending

#Backlog
## Later
### Deferred Task
- [ ] someday`;

async function openFixture(page) {
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    const handle = { name: "Fixture.md" };
    window.MDManager.files.open = async () => ({ handle, markdown });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async (_handle, value) => { window.__savedMarkdown = value; };
  }, fixture);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#projectTitle")).toHaveText("Test Project");
}

test("start screen exposes the application identity and open action", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page).toHaveTitle("MD_Manager");
  await expect(page.locator("#appVersion")).toHaveText(/^v\d+\.\d+\.\d+$/);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await expect(page.locator("#watermark")).toBeVisible();
});

test("Markdown import renders features, tasks, progress states, and filename title", async ({ page }) => {
  await openFixture(page);
  await expect(page).toHaveTitle("MD_Manager - Fixture.md");
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await expect(page.locator("#content .card")).toHaveCount(3);
  await expect(page.locator(".task-in-progress")).toHaveText("◐");
  await expect(page.locator(".task-check")).toHaveText("✓");
  await expect(page.locator("#toggleBacklog")).toBeEnabled();
});

test("metadata toggles without changing the shared header height", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleMetadata").click();
  await expect(page.locator(".release-version")).toHaveText("v1.2.3");
  await expect(page.locator(".release-dates")).toContainText("2026-01-01");
  const heights = await page.locator("#content > .release > .release-header").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
});

test("backlog opens as a separate pane and closes from its framed button", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleBacklog").click();
  await expect(page.locator("#backlog")).toBeVisible();
  await expect(page.locator("#backlog .card-title")).toHaveText("Deferred Task");
  await page.locator(".backlog-close").click();
  await expect(page.locator("#backlog")).toBeHidden();
});

test("statistics can close and reopen in board and grid", async ({ page }) => {
  await openFixture(page);
  await expect(page.locator("#projectStats")).toBeVisible();
  await page.locator(".stats-close").click();
  await expect(page.locator("#projectStats")).toBeHidden();
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleStats").click();
  await page.locator("#toggleGridView").click();
  await expect(page.locator("#projectStats")).toBeVisible();
});

test("grid collapses tasks, uses equal feature heights, and restores board expansion", async ({ page }) => {
  await openFixture(page);
  const first = page.locator(".card").first();
  await first.locator(".card-header").click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await page.locator("#toggleGridView").click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  const heights = await page.locator("#content > .release").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);
  await page.locator("#showBoardView").click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
});

test("collapsed grid cards have no local scrollbar and expanded cards enable it", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleGridView").click();
  const content = page.locator("#content > .release").first().locator(".release-content");
  await expect(content).toHaveCSS("overflow-y", "hidden");
  await page.locator("#content .card-header").first().click();
  await expect(content).toHaveCSS("overflow-y", "auto");
});

test("checking a todo updates progress, dirty state, save output, undo, and redo", async ({ page }) => {
  await openFixture(page);
  const openTodo = page.locator(".card").first().locator(".checkbox").nth(1);
  await page.locator(".card-header").first().click();
  await openTodo.click();
  await expect(page.locator(".card").first().locator(".task-check")).toBeVisible();
  await expect(page.locator("#saveFile")).toHaveClass(/dirty/);
  await page.locator("#undoChange").click();
  await expect(page.locator(".card").first().locator(".task-in-progress")).toBeVisible();
  await page.locator("#redoChange").click();
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).toContain("- [x] ~open~");
});

test("deleting a task updates the model and undo restores it", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-delete="task"]').click();
  await expect(page.locator("#content .card")).toHaveCount(2);
  await page.locator("#undoChange").click();
  await expect(page.locator("#content .card")).toHaveCount(3);
});

test("view menu, keyboard shortcut, and accessibility states stay synchronized", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleViewMenu")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewOptions")).toBeHidden();
  await page.keyboard.press("Control+b");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "true");
});

test("long titles remain clipped to their headers and scroll only on hover", async ({ page }) => {
  await openFixture(page);
  const title = page.locator(".release-title").first();
  await title.evaluate(node => { node.dataset.fullTitle = "An extremely long feature title that cannot fit into the available header width"; window.MDManager.render.fitTitles(); });
  await title.hover();
  await expect(title).toHaveClass(/title-scroll/);
  await page.mouse.move(0, 0);
  await expect(title).not.toHaveClass(/title-scroll/);
});

test("SortableJS moves a task between features and persists the new order", async ({ page }) => {
  await openFixture(page);
  const source = page.locator("#content > .release").first().locator(".card").first();
  const target = page.locator("#content > .release").nth(1).locator(".board");
  const from = await source.boundingBox(); const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(target.locator(".card")).toHaveCount(2);
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).toMatch(/## Open Feature[\s\S]*### Started Task/);
});

test("board feature widths remain bounded on common and 4K viewports", async ({ page }) => {
  await openFixture(page);
  const normalWidth = await page.locator("#content > .release").first().evaluate(node => node.getBoundingClientRect().width);
  await page.setViewportSize({ width: 3840, height: 2160 });
  const wideWidth = await page.locator("#content > .release").first().evaluate(node => node.getBoundingClientRect().width);
  expect(normalWidth).toBeGreaterThanOrEqual(240);
  expect(wideWidth).toBeLessThanOrEqual(342);
});
