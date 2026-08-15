const { test, expect } = require("./fixtures");
const fs = require("node:fs");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const goldenFixture = fs.readFileSync(path.resolve(__dirname, "../../data/parsing/Layout.md"), "utf8");

/** @param {import("@playwright/test").Page} page @param {string} markdown */
async function openFixture(page, markdown) {
  await page.goto(appUrl);
  await page.evaluate(value => {
    const handle = { name: "Fixture.md" };
    window.MDManager.files.open = async () => ({ handle, markdown: value });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async () => {};
  }, markdown);
  await page.getByRole("button", { name: "Open File", exact: true }).click();
  await expect(page.locator("#projectTitle")).toHaveText(markdown.match(/^#\s+(.+)$/m)?.[1] || "");
}

/** @param {import("@playwright/test").Page} page */
async function openPalette(page) {
  await page.keyboard.press("f");
  await expect(page.locator("#searchPalette")).toBeVisible();
  // The entrance animation scales the panel, so measurements must wait it out.
  await page.locator("#searchPalette").evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
}

/** @param {import("@playwright/test").Page} page @param {string} query */
async function search(page, query) {
  await openPalette(page);
  await page.locator("#searchInput").fill(query);
}

const rows = "#searchResults .search-result";

test("F opens the palette and Esc, outside click, and a closed project keep it predictable", async ({ page }) => {
  await page.goto(appUrl);
  await page.keyboard.press("f");
  await expect(page.locator("#searchPalette")).toBeHidden();

  await openFixture(page, goldenFixture);
  await openPalette(page);
  await expect(page.locator("#searchInput")).toBeFocused();
  await expect(page.locator(".search-scope .search-badge")).toHaveCount(7);

  await page.keyboard.press("Escape");
  await expect(page.locator("#searchPalette")).toBeHidden();

  await openPalette(page);
  await page.mouse.click(5, 5);
  await expect(page.locator("#searchPalette")).toBeHidden();

  await page.locator(".card").first().locator(".card-header").hover();
  await page.locator(".card").first().locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();
  await page.keyboard.press("f");
  await expect(page.locator("#searchPalette")).toBeHidden();
});

test("typing filters live and every result carries badge, state, breadcrumb, and highlight", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "keyboard");

  const first = page.locator(rows).first();
  await expect(first.locator(".search-badge")).toHaveText("Group");
  await expect(first.locator(".search-text mark")).toHaveText("Keyboard");
  await expect(first.locator(".search-breadcrumb")).toHaveText("Editor Experience / Accessibility review");
  await expect(first).toHaveAttribute("data-state", "open");
  await expect(page.locator("#searchSummary")).toHaveAttribute("aria-label", /matches/);

  await page.locator("#searchInput").fill("archived");
  await expect(page.locator(`${rows} .search-pill[data-location="archive"]`).first()).toHaveText("Archive");

  await page.locator("#searchInput").fill("research archive");
  await expect(page.locator(`${rows} .search-pill[data-location="backlog"]`).first()).toHaveText("Backlog");

  await page.locator("#searchInput").fill("zzzzzz");
  await expect(page.locator(".search-empty")).toHaveText("No matches.");
});

test("every badge kind reaches the result list", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await openPalette(page);

  /** @param {string} query */
  const badgeFor = async query => {
    await page.locator("#searchInput").fill(query);
    await expect(page.locator(rows).first()).toBeVisible();
    return page.locator(rows).first().locator(".search-badge").textContent();
  };

  expect(await badgeFor("Editor Experience")).toBe("Feature");
  expect(await badgeFor("Markdown editing")).toBe("Task");
  expect(await badgeFor("Formatting toolbar")).toBe("Group");
  expect(await badgeFor("Continue a todo after")).toBe("ToDo");
  expect(await badgeFor("Toolbar actions participate")).toBe("Info");
  expect(await badgeFor("Unsaved lorem ipsum")).toBe("Warn");
  expect(await badgeFor("Selections remain stable")).toBe("Text");
});

test("arrows and Tab move the selection in both directions and wrap", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "a");

  const count = await page.locator(rows).count();
  expect(count).toBeGreaterThan(2);
  const selected = () => page.locator(`${rows}[aria-selected="true"]`);

  await expect(selected()).toHaveAttribute("data-index", "0");
  await expect(page.locator("#searchInput")).toHaveAttribute("aria-activedescendant", "searchResult-0");

  await page.keyboard.press("ArrowDown");
  await expect(selected()).toHaveAttribute("data-index", "1");
  await page.keyboard.press("Tab");
  await expect(selected()).toHaveAttribute("data-index", "2");
  await page.keyboard.press("Shift+Tab");
  await expect(selected()).toHaveAttribute("data-index", "1");
  await page.keyboard.press("ArrowUp");
  await expect(selected()).toHaveAttribute("data-index", "0");

  await page.keyboard.press("ArrowUp");
  await expect(selected()).toHaveAttribute("data-index", String(count - 1));
  await page.keyboard.press("ArrowDown");
  await expect(selected()).toHaveAttribute("data-index", "0");

  await expect(page.locator("#searchInput")).toBeFocused();
});

test("the panel keeps its dimensions between an empty query and a full result list", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await openPalette(page);
  const empty = await page.locator("#searchPalette").boundingBox();

  await page.locator("#searchInput").fill("a");
  await expect(page.locator(rows).first()).toBeVisible();
  const filled = await page.locator("#searchPalette").boundingBox();

  expect(filled.width).toBeCloseTo(empty.width, 1);
  expect(filled.height).toBeCloseTo(empty.height, 1);
  expect(filled.y).toBeCloseTo(empty.y, 1);
});

test("Enter reveals a workspace todo by expanding its card and highlighting the row", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "Continue a todo after");
  await page.keyboard.press("Enter");

  await expect(page.locator("#searchPalette")).toBeHidden();
  const card = page.locator('#content > .release[data-feature="1"] .card[data-task="0"]');
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".todo-item.search-hit")).toHaveCount(1);
  await expect(card.locator(".todo-item.search-hit .todo-text")).toHaveText("Continue a todo after pressing Enter");
});

test("clicking a note result expands the collapsed feature note and marks the exact item", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "Preserve Info and Warn");
  await page.locator(rows).first().click();

  await expect(page.locator("#searchPalette")).toBeHidden();
  const note = page.locator('#content > .release[data-feature="1"] .feature-notes .task-note.task-warn');
  await expect(note).toHaveAttribute("aria-expanded", "true");
  await expect(note).not.toHaveClass(/collapsed/);
  await expect(note.locator(".search-hit")).toHaveCount(1);
  // Note bullets are inline spans; the highlight must still trace a row rather than
  // hugging the text, so every target is framed the same way.
  await expect(note.locator(".search-hit")).toHaveCSS("display", "block");
});

test("an archive result switches the view and lands on the task row inside the archive card", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "Complete the date-based archive fixture");
  await page.keyboard.press("Enter");

  await expect(page.locator("body")).toHaveClass(/archive-view-active/);
  const feature = page.locator("#archive .archive-feature").filter({ hasText: "Archived Date Fixture" });
  await expect(feature.locator(".archive-feature-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(feature.locator(".archive-tasks li.search-hit")).toHaveText("Date archive task");
});

test("a backlog result opens the backlog before revealing the target", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await expect(page.locator("#backlog")).toBeHidden();

  await search(page, "Compare archive structures");
  await page.keyboard.press("Enter");

  await expect(page.locator("#backlog")).toBeVisible();
  await expect(page.locator("#backlog .todo-item.search-hit .todo-text")).toHaveText("Compare archive structures");
});

test("a group result reveals its heading and a text result reveals its paragraph", async ({ page }) => {
  await openFixture(page, goldenFixture);

  await search(page, "Formatting toolbar");
  await page.keyboard.press("Enter");
  await expect(page.locator('#content > .release[data-feature="1"] .card[data-task="0"] .todo-separator.search-hit')).toHaveText("Formatting toolbar");

  await search(page, "Selections remain stable");
  await page.keyboard.press("Enter");
  await expect(page.locator("#content .task-blocks p.search-hit")).toHaveText("Selections remain stable after each toolbar action.");
});

test("results stay capped while the summary reports the full match count", async ({ page }) => {
  const lines = ["# Capped Project", "", "## Feature", "", "### Task"];
  for (let count = 0; count < 60; count++) lines.push(`- [ ] alpha entry ${count}`);
  await openFixture(page, lines.join("\n"));

  await search(page, "alpha");
  await expect(page.locator(rows)).toHaveCount(50);
  await expect(page.locator("#searchSummary")).toHaveText("50/60");
  await expect(page.locator("#searchSummary")).toHaveAttribute("aria-label", "50 of 60 matches");
});

test("toggling a todo without a full render still updates the next search", async ({ page }) => {
  await openFixture(page, ["# P", "", "## F", "", "### T", "", "#### Work", "- [ ] alpha target todo", "- [ ] beta other"].join("\n"));

  await search(page, "alpha target");
  await expect(page.locator(rows).first()).toHaveAttribute("data-state", "open");
  await page.keyboard.press("Escape");

  await page.locator(".card .card-header").click();
  await page.locator('.todo-item[data-line="1"] .checkbox').click();
  await expect(page.locator('.todo-item[data-line="1"] .checkbox')).toHaveAttribute("data-checked", "true");

  await search(page, "alpha target");
  await expect(page.locator(rows).first()).toHaveAttribute("data-state", "done");
});
