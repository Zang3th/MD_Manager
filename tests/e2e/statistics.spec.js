const { test, expect } = require("./fixtures");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appUrl = pathToFileURL(path.resolve(__dirname, "../../MD_Manager.html")).href;
const fixture = `# Statistics Project

## First feature
#Date
- 01.01.26 - 03.01.2026
### First task
- [x] ~one~
- [x] ~two~

## Second feature
#Date
- 2026-01-01 - 2026-01-02
- 2026-01-10
### Second task
- [x] ~one~
- [x] ~two~

## Active feature
#Date
- 2026-01-12
### Active task
- [x] ~one~
- [ ] two

## Missing date
### Done task
- [x] ~one~

## Open date
#Date
- 2026-01-01 - TBD
### Done task
- [x] ~one~

#Backlog
## Backlog
### Later
- [ ] pending

#Archive
# Archive

## Archived feature
#Date
- 2026-02-01 - 2026-02-03
### Done task
- [x] ~one~
- [x] ~two~
- [x] ~three~

## Longer feature
#Date
- 2026-03-01 - 2026-03-17
### Done task
- [x] ~one~`;

/** @param {import("@playwright/test").Page} page @param {string} [markdown] @param {boolean} [disk] */
async function openFixture(page, markdown = fixture, disk = false) {
  await page.goto(appUrl);
  await page.waitForFunction(() => document.body.dataset.startupState === "ready");
  await page.evaluate(({ markdown, disk }) => {
    const probe = /** @type {any} */ (window);
    probe.statisticsProbe = { markdown, stamp: 1, calls: 0, saves: 0 };
    const handle = disk ? {
      name: "Statistics.md",
      getFile: async () => ({ text: async () => probe.statisticsProbe.markdown, lastModified: probe.statisticsProbe.stamp, size: probe.statisticsProbe.markdown.length })
    } : { name: "Statistics.md" };
    window.MDManager.files.open = async () => ({ handle, markdown });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async () => { probe.statisticsProbe.saves++; };
    const charts = window.MDManager.status.charts;
    window.MDManager.status.charts = (/** @type {unknown[]} */ ...args) => { probe.statisticsProbe.calls++; return charts(...args); };
  }, { markdown, disk });
  await page.getByRole("button", { name: "Open File", exact: true }).click();
  await expect(page.locator("#projectTitle")).toHaveText(markdown.match(/^# (.+)/)?.[1] || "");
}

/** @param {import("@playwright/test").Page} page */
async function openStatistics(page) {
  await page.getByRole("button", { name: "Expand statistics", exact: true }).click();
  await expect(page.locator("#statisticsDialog")).toBeVisible();
  await expect(page.locator("#statisticsDialog")).toHaveCSS("transform", "none");
  if (await page.locator(".statistics-plot").count()) await expect(page.locator(".statistics-chart-svg")).toHaveCount(2);
}

/** @param {import("@playwright/test").Page} page */
async function closeStatistics(page) {
  await page.getByRole("button", { name: "Close expanded statistics" }).click();
  await expect(page.locator("#statisticsDialog")).toBeHidden();
}

test("statistics expands beside its close control, preserves the matrix and follows the existing modal schema", async ({ page }) => {
  await openFixture(page);
  const matrix = await page.locator("#projectStats table").innerText();
  const controls = await page.locator(".stats-actions button").evaluateAll(buttons => buttons.map(button => ({ name: button.getAttribute("aria-label"), x: button.getBoundingClientRect().x, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  expect(controls.map(control => control.name)).toEqual(["Expand statistics", "Close statistics"]);
  expect(controls[0].x).toBeLessThan(controls[1].x);
  expect(controls.map(control => [control.width, control.height])).toEqual([[24, 24], [24, 24]]);
  await openStatistics(page);
  expect(await page.locator(".statistics-table table").innerText()).toBe(matrix);
  await expect(page.locator(".statistics-section-heading")).toHaveText("Project overview");
  await expect(page.locator(".statistics-section-heading>span")).toHaveCount(0);
  await expect(page.locator(".statistics-sample-count")).toHaveText("4 features analyzed");
  await expect(page.locator(".statistics-sample > span:not([class])")).toHaveCount(0);
  await expect(page.locator(".statistics-excluded")).toHaveText("2 excluded: missing or invalid dates");
  await expect(page.locator(".chart-point")).toHaveCount(3);
  await expect(page.locator("#scatterTitle")).toHaveText("Todo Count vs. Recorded Days");
  await expect(page.locator("#histogramTitle")).toHaveText("Number of features by duration");
  const geometry = await page.locator("#statisticsDialog").evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog, "::backdrop");
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, radius: getComputedStyle(dialog).borderRadius, blur: style.backdropFilter, backdrop: style.backgroundColor, focused: document.activeElement === dialog };
  });
  expect(geometry).toEqual({ x: 288, y: 99, width: 864, height: 702, radius: "12px", blur: "blur(2px)", backdrop: "rgba(0, 0, 0, 0.54)", focused: true });
  await expect(page.locator(".statistics-chart footer")).toHaveCount(0);
  await expect(page.locator('.statistics-scatter .chart-axis-label:not([transform])')).toHaveText("Recorded Days");
  await expect(page.locator('.statistics-scatter .chart-axis-label[transform]')).toHaveText("Todo Count");
  const positions = await page.locator(".chart-point").evaluateAll(points => points.map(point => {
    const matrix = (/** @type {SVGGElement} */ (point)).transform.baseVal.consolidate()?.matrix;
    return { x: matrix?.e || 0, y: matrix?.f || 0 };
  }));
  expect(positions[0].x).toBe(positions[1].x);
  expect(positions[0].y).toBeGreaterThan(positions[1].y);
  expect(positions[2].x).toBeGreaterThan(positions[0].x);
  expect(positions[2].y).toBeGreaterThan(positions[0].y);
  await page.keyboard.press("Tab");
  await expect(page.locator("#closeStatistics")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.getElementById("statisticsDialog").contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#statisticsDialog")).toBeHidden();
  await expect(page.locator(".stats-expand")).toBeFocused();
  await expect(page.locator("#projectStats")).toBeVisible();
  const task = page.locator('#content .release[data-feature="0"] .card');
  await task.hover();
  await task.locator(".edit-btn").click();
  await expect(page.locator("#taskEditor")).toBeVisible();
  await expect(page.locator("#taskEditor")).toHaveCSS("transform", "none");
  const editBounds = await page.locator("#taskEditor").boundingBox();
  expect(editBounds?.width).toBe(geometry.width);
  expect(editBounds?.height).toBe(geometry.height);
});

test("bundled points expose exact details while histogram bins keep their values without popovers", async ({ page }) => {
  await openFixture(page);
  await openStatistics(page);
  const bundle = page.locator(".chart-point-group");
  await expect(bundle.locator(".chart-point-count")).toHaveText("2");
  await bundle.hover();
  const details = page.locator("#chartDetails");
  await expect(details).toBeVisible();
  await expect(details.locator("li")).toHaveText(["First feature", "Second feature"]);
  await expect(details.locator("dd")).toHaveText(["2 todos", "3 days"]);
  await details.hover();
  await expect(details).toBeVisible();
  await page.mouse.move(1000, 150);
  await bundle.focus();
  await expect(bundle).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(details.locator("li")).toHaveText(["First feature", "Second feature"]);
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-chart-point="1"]')).toBeFocused();
  await expect(details.locator("li")).toHaveText(["Archived feature"]);
  await page.locator('[data-chart-bin="0"]').focus();
  await expect(details).toBeHidden();
  await expect(page.locator('[data-chart-bin="0"]')).toHaveAttribute("aria-label", "3\u201310 days: 3 features");
  await page.keyboard.press("Enter");
  await expect(details).toBeHidden();
  await page.locator('[data-chart-bin="1"]').focus();
  await expect(details).toBeHidden();
  await expect(page.locator('[data-chart-bin="1"]')).toHaveAttribute("aria-label", "11\u201318 days: 1 feature");
  await closeStatistics(page);
  await expect(details).toBeHidden();
});

test("chart headings and feature detail headers are concise and match their values", async ({ page }) => {
  await openFixture(page);
  await openStatistics(page);
  await expect(page.locator(".statistics-chart header p")).toHaveCount(0);
  await expect(page.locator(".statistics-histogram svg")).toHaveAttribute("aria-label", "Number of features by duration");
  const details = page.locator("#chartDetails");
  await page.locator('[data-chart-point="1"]').hover();
  await expect(details.locator("header")).toHaveText("Archived feature");
  await expect(details.locator("li")).toHaveCount(1);
  await expect(details.locator("dt")).toHaveText(["Count", "Duration"]);
  await expect(details.locator("dd")).toHaveText(["3 todos", "3 days"]);
  await page.locator(".chart-point-group").focus();
  await expect(details.locator("header>span").first()).toHaveText("2 features");
  await expect(details.locator(".chart-group-count")).toHaveText("2 features");
  await expect(details.locator("li")).toHaveText(["First feature", "Second feature"]);
  await expect(details.locator("dt")).toHaveText(["Count", "Duration"]);
  await expect(details.locator("dd")).toHaveText(["2 todos", "3 days"]);
});

test("shared counts stay blue and left aligned while histogram values stay accessible without details", async ({ page }) => {
  await openFixture(page);
  await openStatistics(page);
  const details = page.locator("#chartDetails");
  for (const theme of ["dark", "light"]) {
    if (await page.locator("body").getAttribute("data-theme") !== `gruvbox-${theme}`) await page.evaluate(() => window.MDManager.theme.next());
    await page.locator(".chart-point-group").hover();
    await expect(details).toBeVisible();
    await expect(details.locator("header")).toHaveText("2 features");
    await expect(details.locator("header>span")).toHaveCount(1);
    await expect(details.locator(".chart-group-count")).toHaveCSS("color", theme === "dark" ? "rgb(131, 165, 152)" : "rgb(7, 102, 120)");
    const alignment = await details.evaluate(popup => {
      const header = popup.querySelector("header");
      return { badge: header.querySelector(".chart-group-count").getBoundingClientRect().left, left: header.getBoundingClientRect().left + parseFloat(getComputedStyle(header).paddingLeft) };
    });
    expect(alignment.badge).toBe(alignment.left);
    await expect(details.locator("li")).toHaveText(["First feature", "Second feature"]);
    await expect(details.locator("dd")).toHaveText(["2 todos", "3 days"]);
    await page.locator('[data-chart-bin="0"]').hover();
    await expect(details).toBeHidden();
    await expect(page.locator('[data-chart-bin="0"]')).toHaveAttribute("aria-label", "3\u201310 days: 3 features");
    await page.locator("#closeStatistics").focus();
    await page.locator('[data-chart-bin="1"]').focus();
    await expect(details).toBeHidden();
    await expect(page.locator('[data-chart-bin="1"]')).toHaveAttribute("aria-label", "11\u201318 days: 1 feature");
  }
});

test("chart details start at half width, grow with their current content and stay inside the dialog", async ({ page }) => {
  const title = "Long feature title ".repeat(30).trim();
  const names = ["A", "A descriptive feature name", title, "Another descriptive feature name"];
  const sizes = [1, 2, 3, 2];
  const features = names.map((name, index) => `## ${name}\n#Date\n- 2026-01-01\n### Done\n${Array.from({ length: sizes[index] }, () => "- [x] ~done~").join("\n")}`).join("\n\n");
  await openFixture(page, `# Adaptive details\n\n${features}`);
  await openStatistics(page);
  await page.mouse.move(4, 4);
  const details = page.locator("#chartDetails");
  await page.locator('[data-chart-point="0"]').focus();
  await expect(details).toBeVisible();
  await expect(details.locator("header")).toHaveText("A");
  await expect.poll(() => details.evaluate(popup => popup.getBoundingClientRect().width)).toBe(140);
  await page.locator(".chart-point-group").focus();
  await expect(details.locator("li")).toHaveText([names[1], names[3]]);
  const grown = await details.evaluate(popup => popup.getBoundingClientRect().width);
  expect(grown).toBeGreaterThan(140);
  await page.locator('[data-chart-point="2"]').focus();
  await expect(details.locator("header")).toHaveText(title);
  const wide = await page.locator("#statisticsDialog").boundingBox();
  await expect.poll(() => details.evaluate(popup => popup.getBoundingClientRect().width)).toBe((wide?.width || 0) - 24);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(details).toBeVisible();
  await expect.poll(() => details.evaluate(popup => popup.getBoundingClientRect().width)).toBe(334);
  const narrow = await page.locator("#statisticsDialog").boundingBox();
  await expect.poll(() => details.evaluate(popup => popup.getBoundingClientRect().left)).toBe((narrow?.x || 0) + 12);
  expect(await details.evaluate(popup => popup.scrollWidth === popup.clientWidth)).toBe(true);
  await expect(details.locator("header")).toHaveText(title);
  await expect(details.locator("dd")).toHaveText(["3 todos", "1 day"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-chart-point="0"]').focus();
  await expect(details.locator("header")).toHaveText("A");
  await expect.poll(() => details.evaluate(popup => popup.getBoundingClientRect().width)).toBe(140);
  await page.locator('[data-chart-bin="0"]').focus();
  await expect(details).toBeHidden();
  await expect(page.locator('[data-chart-bin="0"]')).toHaveAttribute("aria-label", "1 day: 4 features");
  expect(await page.evaluate(() => (/** @type {any} */ (window)).statisticsProbe.calls)).toBe(1);
});

test("clicking the statistics backdrop closes without activating the project and restores focus", async ({ page }) => {
  await openFixture(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openStatistics(page);
    await page.locator("#statisticsTitle").click();
    await expect(page.locator("#statisticsDialog")).toBeVisible();
    await page.locator(".statistics-table tbody th").first().click();
    await expect(page.locator("#statisticsDialog")).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(page.locator("#statisticsDialog")).toBeHidden();
    await expect(page.locator(".stats-expand")).toBeFocused();
    await expect(page.locator("#projectTitle")).toHaveText("Statistics Project");
    await expect(page.locator("#saveStateLabel")).toHaveText("Saved");
    await expect(page.locator("#undoChange")).toBeDisabled();
    await expect(page.locator("#redoChange")).toBeDisabled();
  }
  expect(await page.evaluate(() => (/** @type {any} */ (window)).statisticsProbe.saves)).toBe(0);
});

test("opening preserves workspace context and cannot edit the inert project through global shortcuts", async ({ page }) => {
  await openFixture(page);
  const task = page.locator('#content .release[data-feature="0"] .card');
  await task.locator(".card-header").click();
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleBacklog").click();
  await page.locator("#content").evaluate(content => { content.scrollLeft = 170; });
  const before = await page.locator("#content").evaluate(content => ({ left: content.scrollLeft, html: content.innerHTML }));
  await openStatistics(page);
  for (const key of ["Control+z", "Control+Shift+z", "Control+v", "Control+o", "Control+s", "a", "w", "b", "f", "p", "s"]) await page.keyboard.press(key);
  await expect(page.locator("#statisticsDialog")).toBeVisible();
  await expect(page.locator("#searchPalette")).toBeHidden();
  expect(await page.evaluate(() => (/** @type {any} */ (window)).statisticsProbe.saves)).toBe(0);
  await closeStatistics(page);
  expect(await page.locator("#content").evaluate(content => ({ left: content.scrollLeft, html: content.innerHTML }))).toEqual(before);
  await expect(page.locator("#backlog")).toBeVisible();
  await expect(page.locator("#saveStateLabel")).toHaveText("Saved");
  await expect(page.locator("#undoChange")).toBeDisabled();
  await expect(page.locator("#redoChange")).toBeDisabled();
  await page.locator(".stats-close").click();
  await expect(page.locator("#projectStats")).toBeHidden();
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleStats").click();
  await openStatistics(page);
  await closeStatistics(page);
  await page.locator("#showArchiveView").click();
  await expect(page.locator(".stats-expand")).toBeHidden();
});

test("chart aggregation is lazy, reused across reopen and resize, and invalidated by todo undo and redo", async ({ page }) => {
  await openFixture(page);
  const calls = () => page.evaluate(() => (/** @type {any} */ (window)).statisticsProbe.calls);
  expect(await calls()).toBe(0);
  await openStatistics(page);
  expect(await calls()).toBe(1);
  await closeStatistics(page);
  await openStatistics(page);
  expect(await calls()).toBe(1);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(() => page.locator(".statistics-plot").first().evaluate(element => Number(element.querySelector("svg").getAttribute("viewBox")?.split(" ")[2]) === Math.floor(element.clientWidth))).toBe(true);
  expect(await calls()).toBe(1);
  await closeStatistics(page);
  const active = page.locator('#content .release[data-feature="2"] .card');
  await active.locator(".card-header").click();
  await active.locator('.checkbox[data-checked="false"]').click();
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("5 features analyzed");
  expect(await calls()).toBe(2);
  await closeStatistics(page);
  await page.locator("#undoChange").click();
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("4 features analyzed");
  expect(await calls()).toBe(3);
  await closeStatistics(page);
  await page.locator("#redoChange").click();
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("5 features analyzed");
  expect(await calls()).toBe(4);
});

test("empty, single-date and unsafe long feature titles render without invented duration or HTML", async ({ page }) => {
  await openFixture(page, "# Empty sample\n\n## Done without date\n### Task\n- [x] ~done~");
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("0 features analyzed");
  await expect(page.locator(".statistics-chart-empty")).toHaveCount(2);
  await expect(page.locator(".statistics-chart-svg")).toHaveCount(0);
  await closeStatistics(page);
  const title = "<img src=x onerror=alert(1)> " + "Long feature title ".repeat(30);
  await page.evaluate(markdown => { window.MDManager.files.open = async () => ({ handle: { name: "Single.md" }, markdown }); }, `# One feature\n\n## ${title}\n#Date\n- 2024-02-29\n### Done\n- [x] ~done~`);
  await page.keyboard.press("Control+o");
  await expect(page.locator("#projectTitle")).toHaveText("One feature");
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("1 feature analyzed");
  await page.mouse.move(1000, 150);
  await page.locator(".chart-point").focus();
  await expect(page.locator("#chartDetails li")).toHaveText(title.trim());
  await expect(page.locator("#chartDetails header")).toHaveText(title.trim());
  await expect(page.locator("#chartDetails img")).toHaveCount(0);
  await expect(page.locator("#chartDetails dd")).toHaveText(["1 todo", "1 day"]);
  await expect(page.locator(".chart-bar")).toHaveAttribute("aria-label", "1 day: 1 feature");
});

test("external reload replaces the cached project and re-evaluates feature duration", async ({ page }) => {
  await openFixture(page, fixture, true);
  await openStatistics(page);
  await closeStatistics(page);
  await page.evaluate(() => {
    const probe = (/** @type {any} */ (window)).statisticsProbe;
    probe.markdown = "# Reloaded\n\n## Reloaded feature\n#Date\n- 2026-01-01 - 2026-01-04\n### Task\n- [x] ~done~";
    probe.stamp++;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("#saveStateLabel")).toHaveText("Conflict");
  await page.locator("#saveFile").click();
  await page.locator("#reloadExternal").click();
  await expect(page.locator("#projectTitle")).toHaveText("Reloaded");
  await openStatistics(page);
  await expect(page.locator(".statistics-sample-count")).toHaveText("1 feature analyzed");
  await page.mouse.move(1000, 150);
  await page.locator(".chart-point").focus();
  await expect(page.locator("#chartDetails dd")).toHaveText(["1 todo", "4 days"]);
});

test("reduced motion disables modal animation and narrow keyboard navigation keeps detail values visible", async ({ page }) => {
  await openFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openStatistics(page);
  await expect(page.locator("#statisticsDialog")).toHaveCSS("animation-name", "none");
  expect(await page.locator("#statisticsDialog").evaluate(dialog => getComputedStyle(dialog, "::backdrop").animationName)).toBe("none");
  await page.locator('[data-chart-bin="1"]').focus();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await expect(page.locator('[data-chart-bin="1"]')).toHaveAttribute("aria-label", "11\u201318 days: 1 feature");
  await page.locator('[data-chart-point="2"]').focus();
  await expect(page.locator("#chartDetails")).toBeVisible();
  await expect(page.locator("#chartDetails dd")).toHaveText(["1 todo", "17 days"]);
  const popup = await page.locator("#chartDetails").boundingBox();
  expect(popup?.x).toBeGreaterThanOrEqual(16);
  expect((popup?.x || 0) + (popup?.width || 0)).toBeLessThanOrEqual(374);
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-chart-bin="0"]')).toBeFocused();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-chart-bin="1"]')).toBeFocused();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(page.locator("#closeStatistics")).toBeFocused();
  await page.locator('[data-chart-point="2"]').focus();
  await expect(page.locator("#chartDetails")).toBeVisible();
  await page.locator("#chartDetails").focus();
  await expect(page.locator("#chartDetails")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#closeStatistics")).toBeFocused();
});

test("dense shared positions keep every feature title accessible in a bounded scrollable detail panel", async ({ page }) => {
  const features = Array.from({ length: 120 }, (_, index) => `## Feature ${String(index).padStart(3, "0")}\n#Date\n- 2026-01-01\n### Done\n- [x] ~done~`).join("\n\n");
  await openFixture(page, `# Dense sample\n\n${features}`);
  await openStatistics(page);
  await expect(page.locator(".chart-point")).toHaveCount(1);
  await expect(page.locator(".chart-point-count")).toHaveText("120");
  await page.mouse.move(1000, 120);
  await page.locator(".chart-point").focus();
  const details = page.locator("#chartDetails");
  await expect(details).toBeVisible();
  await expect(details.locator("li")).toHaveCount(120);
  await details.focus();
  expect(await details.evaluate(element => element.scrollHeight > element.clientHeight && element.getBoundingClientRect().height <= 360)).toBe(true);
  await page.keyboard.press("End");
  await expect(details.locator("li").last()).toBeInViewport();
});

test("histogram hover has no bottom outline, including an empty duration interval", async ({ page }) => {
  const features = Array.from({ length: 9 }, (_, index) => `## Feature ${index}\n#Date\n- 2026-01-01 - 2026-01-${index === 8 ? "20" : "01"}\n### Done\n- [x] ~done~`).join("\n\n");
  await openFixture(page, `# Bar hover\n\n${features}`);
  await openStatistics(page);
  const filled = page.locator('[data-chart-bin="0"]');
  await filled.hover();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await expect(filled.locator(".chart-bar-fill")).toHaveCSS("stroke", "none");
  const empty = page.locator('[data-chart-bin="1"]');
  await empty.hover();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await expect(empty).toHaveAttribute("aria-label", "8\u201314 days: 0 features");
  await expect(empty.locator(".chart-bar-fill")).toHaveCSS("stroke", "none");
  expect(await empty.locator(".chart-bar-fill").evaluate(rect => (/** @type {SVGRectElement} */ (rect)).getBBox().height)).toBe(0);
  for (const bar of [filled, empty]) {
    await page.locator(".chart-point").first().focus();
    await expect(page.locator("#chartDetails")).toBeVisible();
    await bar.hover();
    await expect(page.locator("#chartDetails")).toBeHidden();
    await bar.focus();
    await expect(bar).toBeFocused();
    await expect(bar).toHaveAttribute("role", "img");
    for (const attribute of ["aria-controls", "aria-expanded", "aria-describedby"]) expect(await bar.getAttribute(attribute)).toBeNull();
    await expect(page.locator("#chartDetails")).toBeHidden();
    for (const key of ["Enter", "Space"]) {
      await page.keyboard.press(key);
      await expect(page.locator("#chartDetails")).toBeHidden();
    }
    await page.locator("#statisticsContent").dispatchEvent("scroll");
    await expect(page.locator("#chartDetails")).toBeHidden();
  }
});

test("1080p portrait statistics fits both charts and the table without unnecessary scrollbars", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await openFixture(page);
  await openStatistics(page);
  for (const viewport of [{ width: 1080, height: 1920 }, { width: 1000, height: 1800 }, { width: 1200, height: 1920 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator(".statistics-plot").evaluateAll(plots => plots.every(plot => {
      const dimensions = plot.querySelector("svg")?.getAttribute("viewBox")?.split(" ").map(Number);
      return dimensions?.[2] === Math.floor(plot.clientWidth) && dimensions?.[3] === Math.floor(plot.clientHeight);
    }))).toBe(true);
    const layout = await page.evaluate(() => {
      const dialog = document.getElementById("statisticsDialog").getBoundingClientRect();
      const edit = getComputedStyle(document.getElementById("taskEditor"));
      const plots = Array.from(document.querySelectorAll(".statistics-plot"), plot => plot.getBoundingClientRect().toJSON());
      const overflow = Array.from(document.querySelectorAll("#statisticsDialog,#statisticsContent,.statistics-table,.statistics-chart-scroll,.statistics-charts,.statistics-chart,.statistics-plot"), element => ({ horizontal: element.scrollWidth - element.clientWidth, vertical: element.scrollHeight - element.clientHeight }));
      return { width: dialog.width, height: dialog.height, edit: { width: parseFloat(edit.width), height: parseFloat(edit.height) }, plots, overflow };
    });
    expect(layout.width).toBe(layout.edit.width);
    expect(layout.height).toBe(layout.edit.height);
    expect(layout.overflow).toEqual(layout.overflow.map(() => ({ horizontal: 0, vertical: 0 })));
    expect(layout.plots[0].top).toBe(layout.plots[1].top);
    expect(layout.plots[0].height).toBe(layout.plots[1].height);
    const countersFit = await page.locator(".statistics-table").evaluate(table => {
      const cells = Array.from(table.querySelectorAll("tbody td"));
      const original = cells.map(cell => cell.textContent);
      cells.forEach(cell => { cell.textContent = "99999"; });
      const fits = cells.every(cell => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect();
        const bounds = cell.getBoundingClientRect();
        return text.left >= bounds.left && text.right <= bounds.right;
      });
      cells.forEach((cell, index) => { cell.textContent = original[index]; });
      return fits;
    });
    expect(countersFit).toBe(true);
    await expect(page.locator("#closeStatistics")).toBeInViewport();
    for (const title of ["#scatterTitle", "#histogramTitle"]) await expect(page.locator(title)).toBeInViewport();
    for (const axis of [".statistics-scatter", ".statistics-histogram"]) await expect(page.locator(`${axis} .chart-axis-label:not([transform])`)).toBeInViewport();
  }
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.mouse.move(4, 4);
  for (const theme of ["dark", "light"]) {
    if (await page.locator("body").getAttribute("data-theme") !== `gruvbox-${theme}`) await page.evaluate(() => window.MDManager.theme.next());
    await expect(page.locator("#statisticsDialog")).toHaveScreenshot(`statistics-portrait-${theme}.png`, { animations: "disabled", maxDiffPixels: 100 });
  }
  await page.locator(".chart-point-group").hover();
  await expect(page.locator("#chartDetails")).toBeVisible();
  await expect(page.locator("#chartDetails li")).toHaveText(["First feature", "Second feature"]);
  await page.locator('[data-chart-bin="0"]').focus();
  await expect(page.locator("#chartDetails")).toBeHidden();
  await expect(page.locator('[data-chart-bin="0"]')).toHaveAttribute("aria-label", "3\u201310 days: 3 features");
  await page.locator(".chart-point-group").focus();
  await expect(page.locator("#chartDetails")).toBeVisible();
  await expect(page.locator("#chartDetails li")).toHaveText(["First feature", "Second feature"]);
  const bounds = await page.locator("#statisticsDialog").boundingBox();
  const popup = await page.locator("#chartDetails").boundingBox();
  expect(popup?.x).toBeGreaterThanOrEqual(bounds?.x || 0);
  expect((popup?.x || 0) + (popup?.width || 0)).toBeLessThanOrEqual((bounds?.x || 0) + (bounds?.width || 0));
  expect(await page.locator("#statisticsContent").evaluate(content => ({ top: content.scrollTop, left: content.scrollLeft }))).toEqual({ top: 0, left: 0 });
  expect(await page.evaluate(() => (/** @type {any} */ (window)).statisticsProbe.calls)).toBe(1);
  await page.mouse.click(4, 4);
  await expect(page.locator("#statisticsDialog")).toBeHidden();
  await expect(page.locator(".stats-expand")).toBeFocused();
});

test("statistics maintains themed geometry and readable plots at wide and narrow viewports", async ({ page }) => {
  await openFixture(page);
  await openStatistics(page);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator(".statistics-plot").first().evaluate(element => Number(element.querySelector("svg").getAttribute("viewBox")?.split(" ")[2]) === Math.floor(element.clientWidth))).toBe(true);
    const dimensions = await page.evaluate(() => {
      const dialog = document.getElementById("statisticsDialog").getBoundingClientRect();
      const close = document.getElementById("closeStatistics").getBoundingClientRect();
      const charts = Array.from(document.querySelectorAll(".statistics-chart"), chart => chart.getBoundingClientRect().toJSON());
      const edit = getComputedStyle(document.getElementById("taskEditor"));
      return { dialog: dialog.toJSON(), close: close.toJSON(), charts, edit: { width: Math.min(parseFloat(edit.width), parseFloat(edit.maxWidth)), height: Math.min(parseFloat(edit.height), edit.maxHeight === "none" ? Infinity : parseFloat(edit.maxHeight)), radius: edit.borderRadius } };
    });
    expect(dimensions.dialog.width).toBe(dimensions.edit.width);
    expect(dimensions.dialog.height).toBe(dimensions.edit.height);
    expect(dimensions.close.right).toBeLessThan(viewport.width);
    expect(dimensions.charts[0].top).toBe(dimensions.charts[1].top);
    expect(dimensions.charts[0].width).toBe(dimensions.charts[1].width);
    await expect(page.locator("#closeStatistics")).toBeInViewport();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator("#statisticsContent").evaluate(content => content.scrollHeight === content.clientHeight)).toBe(true);
  await expect(page.locator('.statistics-scatter .chart-axis-label:not([transform])')).toBeInViewport();
  await page.evaluate(() => { document.getElementById("statisticsContent").scrollTop = 0; document.querySelector(".statistics-chart-scroll").scrollLeft = 0; });
  await page.mouse.move(1000, 120);
  for (const theme of ["dark", "light"]) {
    if (await page.locator("body").getAttribute("data-theme") !== `gruvbox-${theme}`) await page.evaluate(() => window.MDManager.theme.next());
    await expect(page.locator("#statisticsDialog")).toHaveCSS("background-color", theme === "dark" ? "rgb(40, 40, 40)" : "rgb(235, 219, 178)");
    await expect(page.locator("#statisticsDialog")).toHaveScreenshot(`statistics-${theme}.png`, { animations: "disabled", maxDiffPixels: 100 });
  }
});
