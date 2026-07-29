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

test("recent files show the Markdown project title and filename", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator(".recent-files-empty")).toBeVisible();
  await page.evaluate(() => window.MDManager.render.start([{
    id: "roadmap",
    name: "Roadmap.md",
    projectTitle: "MD Manager",
    openedAt: Date.now(),
    handle: {}
  }]));
  await expect(page.locator(".recent-project-name")).toHaveText("MD Manager");
  await expect(page.locator(".recent-file-name")).toHaveText("Roadmap.md");
  await expect(page.locator(".recent-file-time")).toBeVisible();
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

test("text below a task label keeps its position and visual hierarchy", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n### Task\n\n**Label**\nDescription text\n- [ ] Todo text");
  const card = page.locator(".card");
  await card.locator(".card-header").click();
  const group = card.locator(".todo-group");
  await expect(group.locator(":scope > *")).toHaveCount(3);
  await expect(group.locator(":scope > *").nth(0)).toHaveClass("todo-separator");
  await expect(group.locator(":scope > *").nth(1)).toHaveClass("todo-description");
  await expect(group.locator(":scope > *").nth(2)).toHaveClass("todo-list");
  await expect(group.locator(".todo-separator")).toHaveCSS("font-size", "13px");
  await expect(group.locator(".todo-description")).toHaveCSS("font-size", "13px");
  await expect(group.locator(".todo-text")).toHaveCSS("font-size", "13px");
  const gaps = await group.locator(":scope > *").evaluateAll(elements => {
    const boxes = elements.map(element => element.getBoundingClientRect());
    return [boxes[1].top - boxes[0].bottom, boxes[2].top - boxes[1].bottom];
  });
  expect(gaps[0]).toBeCloseTo(gaps[1], 5);
});

test("a task label renders repeated descriptions with their following todos in source order", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n### Task\n\n**Anti-Aliasing**\nGeometry.\n- [ ] segments\nShader AA.\n- [ ] smoothstep\n- [ ] distance\nMSAA.\n- [ ] samples");
  const card = page.locator(".card");
  await card.locator(".card-header").click();
  const group = card.locator(".todo-group");
  await expect(group.locator(":scope > *")).toHaveCount(7);
  await expect(group.locator(":scope > *")).toHaveClass(["todo-separator", "todo-description", "todo-list", "todo-description", "todo-list", "todo-description", "todo-list"]);
  await expect(group.locator(".todo-description")).toHaveText(["Geometry.", "Shader AA.", "MSAA."]);
  await expect(group.locator(".todo-text")).toHaveText(["segments", "smoothstep", "distance", "samples"]);
  await expect(group.locator(".todo-list")).toHaveCount(3);
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
  await expect(page.locator(".backlog-title")).toHaveText("Later");
  await expect(page.locator(".backlog-pane")).toHaveCSS("width", "320px");
  await expect.poll(async () => {
    const backlogBounds = await page.locator("#backlog").boundingBox();
    const paneBounds = await page.locator(".backlog-pane").boundingBox();
    return backlogBounds.x >= paneBounds.x && backlogBounds.x + backlogBounds.width <= paneBounds.x + paneBounds.width;
  }).toBe(true);
  await expect.poll(async () => {
    const headerBounds = await page.locator(".backlog-header").boundingBox();
    const paneBounds = await page.locator(".backlog-pane").boundingBox();
    return Math.abs(headerBounds.x + headerBounds.width - (paneBounds.x + paneBounds.width));
  }).toBeLessThanOrEqual(1);
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
  const stats = page.locator("#projectStats");
  const content = page.locator("#content");
  const firstRelease = page.locator("#content > .release").first();
  await expect(stats).toBeVisible();
  await expect(stats).toHaveCSS("width", "320px");
  await expect(stats).toHaveCSS("border-radius", "10px");
  await expect(stats.locator("td").first()).toHaveCSS("font-size", "12px");
  await expect.poll(() => stats.evaluate(node => node.getBoundingClientRect().bottom)).toBe(page.viewportSize().height - 12);
  await expect.poll(async () => (await stats.boundingBox()).x).toBe((await firstRelease.boundingBox()).x);
  await expect.poll(() => content.evaluate(node => node.getBoundingClientRect().left)).toBe(0);
  await page.locator(".stats-close").click();
  await expect(stats).toBeHidden();
  await expect.poll(() => content.evaluate(node => node.getBoundingClientRect().left)).toBe(0);
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleStats").click();
  await page.locator("#toggleGridView").click();
  await expect(stats).toBeVisible();
  await expect(stats).toHaveCSS("width", "260px");
  await expect(stats.locator("td").first()).toHaveCSS("font-size", "11px");
  await expect.poll(() => stats.evaluate(node => node.getBoundingClientRect().bottom)).toBe(page.viewportSize().height - 8);
  await expect.poll(async () => (await stats.boundingBox()).x).toBe((await firstRelease.boundingBox()).x);
});

test("clock is app-only, centered, and controlled from View", async ({ page }) => {
  await page.goto(appUrl);
  const clock = page.locator("#appClock");
  await expect(clock).toBeHidden();
  await openFixture(page);
  await expect(clock).toBeVisible();
  await expect(page.locator("#clockCurrent")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  const centerOffset = await clock.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return Math.abs(bounds.x + bounds.width / 2 - window.innerWidth / 2);
  });
  expect(centerOffset).toBeLessThanOrEqual(1);
  await page.locator("#toggleViewMenu").click();
  const toggle = page.locator("#toggleClock");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(clock).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(clock).toBeVisible();
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

test("board tasks use the scrollbar space only when the feature overflows", async ({ page }) => {
  const todos = Array.from({ length: 40 }, (_, index) => `- [ ] Todo ${index + 1}`).join("\n");
  await page.setViewportSize({ width: 800, height: 500 });
  await openFixture(page, `# Scrollbar Width\n\n## Feature\n### Task\n${todos}`);
  const content = page.locator("#content > .release .release-content");
  const metrics = () => content.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const cardBounds = node.querySelector(".card").getBoundingClientRect();
    return {
      overflow: node.scrollHeight > node.clientHeight,
      cardWidth: cardBounds.width,
      leftGap: cardBounds.left - bounds.left,
      rightGap: bounds.right - cardBounds.right
    };
  });
  const before = await metrics();
  expect(before.overflow).toBe(false);
  expect(Math.abs(before.leftGap - before.rightGap)).toBeLessThanOrEqual(1);
  await page.locator(".card-header").click();
  await expect.poll(async () => (await metrics()).overflow).toBe(true);
  await expect.poll(async () => before.cardWidth - (await metrics()).cardWidth).toBeGreaterThanOrEqual(9);
  await content.evaluate(node => node.scrollTop = node.scrollHeight);
  const buttonBounds = await content.locator(".add-task-btn").boundingBox();
  const contentBounds = await content.boundingBox();
  expect(buttonBounds.y).toBeGreaterThanOrEqual(contentBounds.y);
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(contentBounds.y + contentBounds.height);
});

test("backlog tasks use the scrollbar space only when the backlog overflows", async ({ page }) => {
  const metrics = () => page.locator("#backlog > .backlog-content").evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const cardBounds = node.querySelector(".card").getBoundingClientRect();
    return {
      overflow: node.scrollHeight > node.clientHeight,
      cardWidth: cardBounds.width,
      leftGap: cardBounds.left - bounds.left,
      rightGap: bounds.right - cardBounds.right
    };
  });
  await openFixture(page);
  await page.locator("#toggleBacklog").click();
  const before = await metrics();
  const headerBefore = await page.locator(".backlog-header").boundingBox();
  const closeBefore = await page.locator(".backlog-close").boundingBox();
  expect(before.overflow).toBe(false);
  expect(Math.abs(before.leftGap - before.rightGap)).toBeLessThanOrEqual(1);

  const tasks = Array.from({ length: 40 }, (_, index) => `### Backlog Task ${index + 1}\n- [ ] pending`).join("\n\n");
  await openFixture(page, `# Backlog Width\n\n## Feature\n### Task\n- [ ] current\n\n#Backlog\n## Later\n${tasks}`);
  await page.locator("#toggleBacklog").click();
  await expect.poll(async () => (await metrics()).overflow).toBe(true);
  await expect.poll(async () => before.cardWidth - (await metrics()).cardWidth).toBeGreaterThanOrEqual(9);
  const headerAfter = await page.locator(".backlog-header").boundingBox();
  const closeAfter = await page.locator(".backlog-close").boundingBox();
  const backlogContentBounds = await page.locator("#backlog > .backlog-content").boundingBox();
  expect(headerAfter.width).toBeCloseTo(headerBefore.width, 0);
  const closeOffsetBefore = headerBefore.x + headerBefore.width - closeBefore.x - closeBefore.width;
  const closeOffsetAfter = headerAfter.x + headerAfter.width - closeAfter.x - closeAfter.width;
  expect(closeOffsetAfter).toBeCloseTo(closeOffsetBefore, 0);
  expect(backlogContentBounds.y).toBeCloseTo(headerAfter.y + headerAfter.height, 0);
  const backlog = page.locator("#backlog > .backlog-content");
  await backlog.evaluate(node => node.scrollTop = node.scrollHeight);
  const buttonBounds = await backlog.locator(".add-task-btn").boundingBox();
  const backlogBounds = await backlog.boundingBox();
  expect(buttonBounds.y).toBeGreaterThanOrEqual(backlogBounds.y);
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(backlogBounds.y + backlogBounds.height);
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
  const heading = title.locator("..");
  await heading.hover();
  await expect(title).toHaveClass(/title-scroll/);
  const titleBox = await title.boundingBox();
  const editBox = await heading.locator(".edit-btn").boundingBox();
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(editBox.x);
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
  expect(normalWidth).toBe(320);
  expect(wideWidth).toBe(320);
});

test("fixed grid uses 260px columns and backlog overlays without shifting it", async ({ page }) => {
  const features = Array.from({ length: 9 }, (_, index) => `## Feature ${index + 1}\n### Task ${index + 1}\n- [ ] pending`).join("\n\n");
  await page.setViewportSize({ width: 1080, height: 1920 });
  await openFixture(page, `# Portrait Grid\n\n${features}\n\n#Backlog\n## Backlog\n### Deferred\n- [ ] later`);
  await page.locator("#toggleGridView").click();

  const releases = page.locator("#content > .release");
  const positions = await releases.evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
  expect(new Set(positions.slice(0, 4).map(position => position.x)).size).toBe(4);
  expect(positions[4].y).toBeGreaterThan(positions[0].y);
  await expect(releases.first()).toHaveCSS("width", "260px");
  await expect(releases.first().locator(".release-title")).toHaveCSS("font-size", "14px");
  await expect(releases.first().locator(".card-title").first()).toHaveCSS("font-size", "12px");

  const before = await releases.first().boundingBox();
  await page.locator("#toggleBacklog").click();
  await expect(page.locator(".backlog-title")).toHaveText("Backlog");
  const after = await releases.first().boundingBox();
  expect(after).toEqual(before);
  const backlog = await page.locator(".backlog-pane").boundingBox();
  const content = await page.locator("#content").boundingBox();
  expect(backlog.width).toBe(260);
  await expect.poll(() => page.locator("#projectStats").evaluate(node => node.getBoundingClientRect().bottom)).toBe(page.viewportSize().height - 8);
  expect(backlog.x + backlog.width).toBeCloseTo(content.x + content.width, 0);

  await page.setViewportSize({ width: 1707, height: 960 });
  await expect.poll(async () => {
    const widePositions = await releases.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()));
    return widePositions.filter(position => Math.abs(position.y - widePositions[0].y) < 1).length;
  }).toBe(6);
});
