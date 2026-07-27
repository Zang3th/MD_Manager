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

async function openFixture(page, markdown = fixture) {
  await page.goto(appUrl);
  await page.evaluate(value => {
    const handle = { name: "Fixture.md" };
    window.MDManager.files.open = async () => ({ handle, markdown: value });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async (_handle, value) => { window.__savedMarkdown = value; };
  }, markdown);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#projectTitle")).toHaveText(markdown.match(/^#\s+(.+)$/m)[1]);
}

test("start screen exposes the application identity and open action", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page).toHaveTitle("MD_Manager");
  await expect(page.locator("#appVersion")).toHaveText(/^v\d+\.\d+\.\d+$/);
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await expect(page.locator("#watermark")).toBeVisible();
  const help = page.getByRole("button", { name: "Help", exact: true });
  const theme = page.locator("#toggleTheme");
  await expect(help).toBeVisible();
  const positions = await Promise.all([help, theme].map(locator => locator.evaluate(node => node.getBoundingClientRect().x)));
  expect(positions[0]).toBeLessThan(positions[1]);
  await help.click();
  await expect(page.locator("#helpPopover")).toBeVisible();
});

test("theme toggle switches Gruvbox themes on the start screen and in the app", async ({ page }) => {
  await page.goto(appUrl);
  const toggle = page.locator("#toggleTheme");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label", "Switch to Light Mode");
  await toggle.click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "gruvbox-light");
  await expect(toggle).toHaveAttribute("aria-label", "Switch to Dark Mode");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(251, 241, 199)");

  await page.evaluate(markdown => {
    const handle = { name: "Fixture.md" };
    window.MDManager.files.open = async () => ({ handle, markdown });
    window.MDManager.files.remember = async () => {};
  }, fixture);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(toggle).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "gruvbox-light");

  await toggle.click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "gruvbox-dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(29, 32, 33)");
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

test("metadata uses natural board header heights while keeping title rows aligned", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleMetadata").click();
  await expect(page.locator(".release-version")).toHaveText("v1.2.3");
  await expect(page.locator(".release-dates")).toContainText("2026-01-01");
  const titleHeights = await page.locator("#content > .release .release-title").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(new Set(titleHeights).size).toBe(1);
  const headerHeights = await page.locator("#content > .release > .release-header").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(headerHeights[0]).toBeGreaterThan(headerHeights[1]);
});

test("metadata recalculates grid row height when cards wrap onto another row", async ({ page }) => {
  const features = Array.from({ length: 6 }, (_, index) => `## Feature ${index + 1}\n#Version\n- 1.0.${index}\n#Date\n- 2026-01-01 - 2026-12-31\n### Task ${index + 1}\n- [ ] pending`).join("\n\n");
  await openFixture(page, `# Grid Metadata\n\n${features}`);
  await page.locator("#toggleGridView").click();
  const heightBefore = await page.locator("#content").evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue("--grid-feature-height")));

  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleMetadata").click();

  await expect.poll(() => page.locator("#content").evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue("--grid-feature-height")))).toBeGreaterThan(heightBefore);
  await expect(page.locator("#content > .release")).toHaveCount(6);
});

test("feature editor saves title, metadata, info, and warn as one undo step", async ({ page }) => {
  await openFixture(page);
  const feature = page.locator("#content > .release").first();
  const heading = feature.locator(".release-heading");
  await heading.hover();
  await heading.locator('[data-edit="feature"]').click();
  const dialog = page.locator("#featureEditor");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#featureEditorMetadata")).toHaveValue(/#Version/);
  await page.locator("#featureEditorTitle").fill("Renamed Feature");
  await page.locator("#featureEditorMetadata").fill("#Version\n- 2.0.0\n#Date\n- 2027-01-01 - 2027-06-30");
  await page.locator("#featureEditorInfo").fill("- Updated metadata");
  await page.locator("#featureEditorWarn").fill("- Check this");
  await expect(page.locator("#saveFeatureEditor")).toHaveClass(/dirty/);
  await page.locator("#saveFeatureEditor").click();
  await expect(dialog).toBeHidden();
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleMetadata").click();
  await expect(feature.locator(".release-title")).toHaveText("Renamed Feature");
  await expect(feature.locator(".release-version")).toHaveText("v2.0.0");
  await expect(feature.locator(".release-dates")).toContainText("2027-06-30");
  await expect(feature.locator(".feature-notes")).toContainText("Updated metadata");
  await expect(feature.locator(".feature-notes")).toContainText("Check this");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release").first().locator(".release-title")).toHaveText("Active Feature");
  await expect(page.locator("#content > .release").first().locator(".release-version")).toHaveText("v1.2.3");
});

test("logo and feature new buttons create features and tasks through existing editors", async ({ page }) => {
  await openFixture(page);
  const addFeature = page.getByRole("button", { name: "New feature" });
  await expect(addFeature).toBeEnabled();
  await addFeature.click();
  await expect(page.locator("#featureEditorTitle")).toHaveValue("New Feature");
  await page.locator("#cancelFeatureEditor").click();
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await addFeature.click();
  await page.locator("#saveFeatureEditor").click();
  await expect(page.locator("#content > .release")).toHaveCount(3);
  await expect(page.locator("#content > .release").last().locator(".release-title")).toHaveText("New Feature");

  const firstFeature = page.locator("#content > .release").first();
  const tasksBefore = await firstFeature.locator(".card").count();
  const addTask = firstFeature.getByRole("button", { name: /New task in Active Feature/ });
  await expect(addTask).toHaveAttribute("title", "New task");
  await addTask.click();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("New Task");
  await page.locator("#saveTaskEditor").click();
  await expect(firstFeature.locator(".card")).toHaveCount(tasksBefore + 1);
  await expect(firstFeature.locator(".card-title").last()).toHaveText("New Task");
});

test("task editor opens in the foreground and saves title and Markdown as one undo step", async ({ page }) => {
  await openFixture(page);
  const card = page.locator("#content .card").first();
  const header = card.locator(".card-header");
  await header.hover();
  await expect(header.locator(".edit-btn")).toBeVisible();
  await expect(header.locator(".task-status")).toHaveCSS("opacity", "0");
  await header.locator(".edit-btn").click();

  const dialog = page.locator("#taskEditor");
  await expect(dialog).toBeVisible();
  const width = await dialog.evaluate(node => node.getBoundingClientRect().width);
  const viewportWidth = page.viewportSize().width;
  expect(width / viewportWidth).toBeGreaterThan(.45);
  expect(width / viewportWidth).toBeLessThan(.55);
  await expect(page.locator("#taskEditorMarkdown")).not.toHaveValue(/\n$/);
  await page.locator("#taskEditorTitle").fill("Edited Task");
  await page.locator("#taskEditorMarkdown").fill("**Next**\n- [ ] added todo");
  await page.locator("#taskEditorInfo").fill("Edited content");
  await page.locator("#taskEditorWarn").fill("Review this task");
  await expect(page.locator("#taskEditorDirty")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await expect(card.locator(".card-title")).toHaveText("Edited Task");
  await card.locator(".card-header").click();
  await expect(card.locator(".card-body")).toContainText("Edited content");
  await expect(card.locator(".card-body")).toContainText("Review this task");
  await expect(card.locator(".card-body")).toContainText("added todo");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content .card").first().locator(".card-title")).toHaveText("Started Task");
});

test("Escape cancels feature and task edits without leaving focus or selection behind", async ({ page }) => {
  await openFixture(page);
  const featureHeading = page.locator(".release-heading").first();
  await featureHeading.hover();
  await featureHeading.locator('[data-edit="feature"]').click();
  await page.locator("#featureEditorTitle").fill("Discarded feature");
  await page.keyboard.press("Escape");
  await expect(page.locator("#featureEditor")).not.toBeVisible();
  await expect(featureHeading.locator(".release-title")).toHaveText("Active Feature");

  const taskHeader = page.locator(".card-header").first();
  await taskHeader.hover();
  await taskHeader.locator('[data-edit="task"]').click();
  await page.locator("#taskEditorTitle").fill("Discarded task");
  await page.keyboard.press("Escape");
  await expect(page.locator("#taskEditor")).not.toBeVisible();
  await expect(taskHeader.locator(".card-title")).toHaveText("Started Task");
  await expect.poll(() => page.evaluate(() => ({ active: document.activeElement?.tagName, selection: window.getSelection()?.toString() }))).toEqual({ active: "BODY", selection: "" });
});

test("backlog opens as a separate pane and closes from its framed button", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleBacklog").click();
  await expect(page.locator("#backlog")).toBeVisible();
  await expect(page.locator("#backlog .card-title")).toHaveText("Deferred Task");
  const backlogTasks = page.locator("#backlog .card");
  await page.locator("#backlog .backlog-add-task").click();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("New Task");
  await page.locator("#saveTaskEditor").click();
  await expect(backlogTasks).toHaveCount(2);
  await expect(backlogTasks.last().locator(".card-title")).toHaveText("New Task");
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

test("help popover documents shortcuts and Markdown and closes predictably", async ({ page }) => {
  await openFixture(page);
  const helpButton = page.getByRole("button", { name: "Help", exact: true });
  const backlogButton = page.locator("#toggleBacklog");
  const positions = await Promise.all([helpButton, backlogButton].map(locator => locator.evaluate(node => node.getBoundingClientRect().x)));
  expect(positions[0]).toBeLessThan(positions[1]);
  await helpButton.click();
  const help = page.locator("#helpPopover");
  await expect(help).toBeVisible();
  await expect(helpButton).toHaveAttribute("aria-expanded", "true");
  await expect(help).toContainText("Quick reference");
  await expect(help).toContainText("Shortcuts");
  await expect(help).toContainText("Ctrl");
  await expect(help).toContainText("#Backlog");
  await expect(help).toContainText("#Ignore");
  await expect(help).toContainText("**Label**");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(helpButton).toHaveAttribute("aria-expanded", "false");
});

test("Ignore hides the following feature or task from the application", async ({ page }) => {
  await openFixture(page, "# Ignore Test\n\n#Ignore\n## Hidden Feature\n### Child\n- [ ] hidden feature task\n\n## Visible Feature\n#Ignore\n### Hidden Task\n- [ ] hidden task\n\n### Visible Task\n- [ ] shown");
  await expect(page.locator("#content > .release")).toHaveCount(1);
  await expect(page.locator("#content .release-title")).toHaveText("Visible Feature");
  await expect(page.locator("#content .card")).toHaveCount(1);
  await expect(page.locator("#content .card-title")).toHaveText("Visible Task");
  await expect(page.locator("#projectStats tbody tr").nth(0).locator("td").first()).toHaveText("0");
  await expect(page.locator("#projectStats tbody tr").nth(2).locator("td.open")).toHaveText("1");
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

test("Control+S saves the current project through the global save action", async ({ page }) => {
  await openFixture(page);
  await page.locator(".card-header").first().click();
  await page.locator(".card").first().locator(".checkbox").nth(1).click();
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).toContain("- [x] ~open~");
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty/);
});

test("global keyboard shortcuts open files and undo and redo project changes", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => {
    const open = window.MDManager.files.open;
    window.__openCount = 0;
    window.MDManager.files.open = async () => {
      window.__openCount += 1;
      return open();
    };
  });
  await page.locator(".card-header").first().click();
  const todo = page.locator(".card").first().locator(".checkbox").nth(1);
  await todo.click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".card").first().locator(".task-in-progress")).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(page.locator(".card").first().locator(".task-check")).toBeVisible();
  await page.keyboard.press("Control+o");
  await expect.poll(() => page.evaluate(() => window.__openCount)).toBe(1);
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
