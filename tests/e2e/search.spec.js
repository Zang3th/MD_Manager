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
  await expect(page.locator("#searchInput")).toHaveAttribute("placeholder", "Search project…");
  await expect(page.locator(".search-empty-title")).toHaveText("Search the entire project");
  await expect(page.locator(".search-empty-copy")).toHaveText("Find features, tasks, notes, and todos.");
  await expect(page.locator(".search-empty-state .search-badge")).toHaveCount(0);

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

test("long results expose the matched excerpt while retaining their full accessible name", async ({ page }) => {
  const fullText = `${"leading context ".repeat(12)}the distant marker remains visible`;
  await openFixture(page, ["# P", "", "## F", "", "### T", "", `- [ ] ${fullText}`].join("\n"));
  await search(page, "distant marker");

  const first = page.locator(rows).first();
  const visibleText = await first.locator(".search-text").textContent();
  expect(visibleText).not.toBeNull();
  expect(visibleText?.startsWith("…")).toBe(true);
  expect(visibleText?.length).toBeLessThanOrEqual(88);
  await expect(first.locator(".search-text mark")).toHaveText("distant marker");
  expect(await first.getAttribute("aria-label")).toContain(fullText);
});

test("the refined result hierarchy and keyboard legend stay application-native", async ({ page }) => {
  await openFixture(page, goldenFixture);
  await search(page, "keyboard");

  const first = page.locator(rows).first();
  await expect(first.locator(":scope > .search-body")).toHaveCount(1);
  await expect(first.locator(":scope > .search-badge")).toHaveCount(1);
  await expect(first.locator(".search-caret")).toHaveCount(0);
  expect(await first.locator(":scope > *").evaluateAll(elements => elements.map(element => element.className))).toEqual(["search-body", "search-badge"]);
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.locator(".search-legend kbd")).toHaveText(["↑", "↓", "Enter", "Esc"]);
  await expect(page.locator(".search-legend")).toContainText("Navigate");
  await expect(page.locator(".search-legend")).toContainText("Go to");
  await expect(page.locator(".search-legend")).toContainText("Close");
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

test("selection work stays targeted and pointer hover does not fight scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const lines = ["# Large Project", "", "## Feature", "", "### Task"];
  for (let count = 0; count < 60; count++) lines.push(`- [ ] alpha entry ${count}`);
  await openFixture(page, lines.join("\n"));
  await search(page, "alpha");
  await expect(page.locator(rows)).toHaveCount(50);

  const mutationCounts = await page.locator("#searchResults").evaluate(list => {
    const observer = new MutationObserver(() => {});
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
    document.getElementById("searchInput").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const records = observer.takeRecords();
    observer.disconnect();
    return {
      classes: records.filter(record => record.attributeName === "class").length,
      selections: records.filter(record => record.attributeName === "aria-selected").length
    };
  });
  expect(mutationCounts).toEqual({ classes: 2, selections: 2 });

  const pointerSelection = await page.locator("#searchResults").evaluate(async list => {
    list.scrollTop = 320;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const listRect = list.getBoundingClientRect();
    const partial = Array.from(list.querySelectorAll(".search-result")).find(row => {
      const rect = row.getBoundingClientRect();
      return rect.top < listRect.bottom && rect.bottom > listRect.bottom;
    });
    if (!(partial instanceof HTMLElement)) return null;
    const before = list.scrollTop;
    partial.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    return { before, after: list.scrollTop, index: Number(partial.dataset.index) };
  });
  expect(pointerSelection).not.toBeNull();
  if (!pointerSelection) throw new Error("expected a partially visible search result");
  expect(pointerSelection.after).toBe(pointerSelection.before);
  await expect(page.locator(`${rows}[aria-selected="true"]`)).toHaveAttribute("data-index", String(pointerSelection.index));

  await page.keyboard.press("ArrowDown");
  await expect(page.locator(`${rows}[aria-selected="true"]`)).toHaveAttribute("data-index", String(pointerSelection.index + 1));
  expect(await page.locator("#searchResults").evaluate(list => list.scrollTop)).toBeGreaterThan(pointerSelection.after);

  const accent = await page.locator(rows).first().evaluate(row => {
    const style = getComputedStyle(row, "::before");
    return { transform: style.transform, transitionDuration: style.transitionDuration };
  });
  expect(accent).toEqual({ transform: "none", transitionDuration: "0s" });
  expect(await page.locator(rows).evaluateAll(resultRows => resultRows.reduce((total, row) => total + row.getAnimations({ subtree: true }).length, 0))).toBe(0);
});

test("query rendering resets scroll without using selection geometry", async ({ page }) => {
  const lines = ["# Large Project", "", "## Feature", "", "### Task"];
  for (let count = 0; count < 60; count++) lines.push(`- [ ] alpha entry ${count}`);
  await openFixture(page, lines.join("\n"));
  await search(page, "alpha");
  await expect(page.locator(rows)).toHaveCount(50);

  const reset = await page.locator("#searchResults").evaluate(list => {
    list.scrollTop = 320;
    const original = Element.prototype.scrollIntoView;
    let calls = 0;
    /** @param {boolean | ScrollIntoViewOptions} [parameter] */
    Element.prototype.scrollIntoView = function (parameter) {
      calls++;
      return original.call(this, parameter);
    };
    const input = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
    input.value = "alpha entry";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    Element.prototype.scrollIntoView = original;
    return { calls, scrollTop: list.scrollTop };
  });

  expect(reset).toEqual({ calls: 0, scrollTop: 0 });
  await expect(page.locator(`${rows}[aria-selected="true"]`)).toHaveAttribute("data-index", "0");
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, goldenFixture);
  await search(page, "Continue a todo after");
  await page.keyboard.press("Enter");

  await expect(page.locator("#searchPalette")).toBeHidden();
  const card = page.locator('#content > .release[data-feature="1"] .card[data-task="0"]');
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".todo-item.search-hit")).toHaveCount(1);
  await expect(card.locator(".todo-item.search-hit .todo-text")).toHaveText("Continue a todo after pressing Enter");
  const feedback = await card.locator(".todo-item.search-hit").evaluate(target => {
    const style = getComputedStyle(target);
    const plate = getComputedStyle(target, "::after");
    return {
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationName: style.animationName,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      plateAnimationName: plate.animationName,
      plateBorderRadius: plate.borderRadius,
      plateExtendsPastRow: [plate.top, plate.right, plate.bottom, plate.left].every(value => Number.parseFloat(value) < 0),
      plateHasTint: plate.backgroundColor !== "rgba(0, 0, 0, 0)",
      plateHasShadow: plate.boxShadow !== "none",
      platePointerEvents: plate.pointerEvents
    };
  });
  expect(feedback).toEqual({
    reducedMotion: true,
    animationName: "none",
    outlineStyle: "none",
    outlineWidth: "0px",
    plateAnimationName: "none",
    plateBorderRadius: "7px",
    plateExtendsPastRow: true,
    plateHasTint: true,
    plateHasShadow: true,
    platePointerEvents: "none"
  });
});

test("a row highlight stays faded between animation completion and class cleanup", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openFixture(page, ["# P", "", "## F", "", "### T", "", "- [ ] alpha target"].join("\n"));
  await search(page, "alpha target");
  await page.keyboard.press("Enter");

  const target = page.locator(".todo-item.search-hit");
  await expect(target).toBeVisible();
  const finalState = await target.evaluate(element => {
    const animation = element.getAnimations({ subtree: true }).find(candidate => candidate instanceof CSSAnimation && candidate.animationName === "search-hit-row");
    if (!animation) return null;
    animation.finish();
    const plate = getComputedStyle(element, "::after");
    return {
      fillMode: plate.animationFillMode,
      opacity: plate.opacity,
      stillHighlighted: element.classList.contains("search-hit")
    };
  });
  expect(finalState).toEqual({ fillMode: "forwards", opacity: "0", stillHighlighted: true });
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

test("an archive result switches the view and lands on the task row inside floating details", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, goldenFixture);
  await search(page, "Complete the date-based archive fixture");
  await page.keyboard.press("Enter");

  await expect(page.locator("body")).toHaveClass(/archive-view-active/);
  const feature = page.locator("#archive .archive-feature").filter({ hasText: "Archived Date Fixture" });
  await expect(feature.locator(".archive-feature-toggle")).toHaveClass(/is-popover-anchor/);
  const task = page.locator("#archive .archive-popover-tasks li.search-hit");
  await expect(task).toHaveText("Date archive task");
  const feedback = await task.evaluate(target => {
    const bullet = getComputedStyle(target, "::before");
    const plate = getComputedStyle(target, "::after");
    return {
      bulletWidth: bullet.width,
      bulletHeight: bullet.height,
      plateBorderRadius: plate.borderRadius,
      plateHasTint: plate.backgroundColor !== "rgba(0, 0, 0, 0)",
      plateHasShadow: plate.boxShadow !== "none"
    };
  });
  expect(feedback).toEqual({ bulletWidth: "4px", bulletHeight: "4px", plateBorderRadius: "7px", plateHasTint: true, plateHasShadow: true });
});

test("an archive feature result frames its complete square label cell", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, goldenFixture);
  await search(page, "Archived Date Fixture");
  await page.keyboard.press("Enter");

  const feature = page.locator("#archive .archive-feature").filter({ hasText: "Archived Date Fixture" });
  const label = feature.locator(".archive-feature-toggle");
  const plot = feature.locator(".archive-swimlane-plot");
  await expect(feature).not.toHaveClass(/search-hit/);
  await expect(label).toHaveClass(/search-hit/);
  await expect(label).toHaveCSS("outline-style", "none");
  await expect(label).toHaveCSS("position", "sticky");
  const [labelBounds, plotBounds, cornerBounds] = await Promise.all([
    label.boundingBox(),
    plot.boundingBox(),
    page.locator(".archive-axis-corner").boundingBox()
  ]);
  expect(labelBounds).not.toBeNull();
  expect(plotBounds).not.toBeNull();
  expect(cornerBounds).not.toBeNull();
  expect(labelBounds?.x).toBeCloseTo(cornerBounds?.x || 0, 1);
  expect((labelBounds?.x || 0) + (labelBounds?.width || 0)).toBeCloseTo(plotBounds?.x || 0, 1);
  const frame = await label.evaluate(target => {
    const style = getComputedStyle(target, "::after");
    return {
      inset: [style.top, style.right, style.bottom, style.left],
      borderRadius: style.borderRadius,
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
      pointerEvents: style.pointerEvents
    };
  });
  expect(frame).toEqual({
    inset: ["0px", "0px", "0px", "0px"],
    borderRadius: "0px",
    borderWidths: ["2px", "2px", "2px", "2px"],
    borderStyles: ["solid", "solid", "solid", "solid"],
    pointerEvents: "none"
  });
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

test("invalidating an open palette rebuilds the index and keeps later queries live", async ({ page }) => {
  await openFixture(page, ["# P", "", "## F", "", "### T", "", "- [ ] alpha target todo", "- [ ] beta other"].join("\n"));
  await search(page, "alpha target");
  await expect(page.locator(rows).first()).toContainText("alpha target todo");

  await page.evaluate(() => window.MDManager.searchPalette.invalidate());
  await expect(page.locator(rows).first()).toContainText("alpha target todo");

  await page.locator("#searchInput").fill("beta other");
  await expect(page.locator(rows).first()).toContainText("beta other");
});
