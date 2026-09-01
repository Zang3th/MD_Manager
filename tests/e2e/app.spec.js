const { test, expect } = require("./fixtures");
const fs = require("node:fs");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const goldenFixture = fs.readFileSync(path.resolve(__dirname, "../../data/parsing/Layout.md"), "utf8");
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

/** @param {import("@playwright/test").Page} page @param {string} markdown */
async function openFixture(page, markdown = fixture) {
  await page.goto(appUrl);
  await page.evaluate(value => {
    const handle = { name: "Fixture.md" };
    window.MDManager.files.open = async () => ({ handle, markdown: value });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async (/** @type {unknown} */ _handle, /** @type {string} */ value) => { window.__savedMarkdown = value; };
  }, markdown);
  await page.getByRole("button", { name: "Open File", exact: true }).click();
  await expect(page.locator("#projectTitle")).toHaveText(markdown.match(/^#\s+(.+)$/m)?.[1] || "");
}

/** @param {import("@playwright/test").Page} page */
async function openGoldenFixture(page) {
  await openFixture(page, goldenFixture);
  await expect(page.locator("#projectTitle")).toHaveText("Lorem Ipsum Product Roadmap");
}

/**
 * Waits until no layout pass is still pending. Font loading schedules one more pass of its own, so
 * a geometry baseline taken before this can be invalidated by a relayout the test never triggered.
 * @param {import("@playwright/test").Page} page
 */
function settleLayout(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** @param {import("@playwright/test").Page} page */
async function prepareVisualPage(page) {
  await page.addStyleTag({ content: ".app-tooltip,.notifications,.app-clock{visibility:hidden!important}" });
  await settleLayout(page);
  await page.mouse.move(720, 700);
}

/** @param {import("@playwright/test").Page} page @param {"dark" | "light"} theme */
async function setVisualTheme(page, theme) {
  const expected = `gruvbox-${theme}`;
  if (await page.locator("body").getAttribute("data-theme") !== expected) {
    await page.evaluate(() => window.MDManager.theme.next());
  }
  await expect(page.locator("body")).toHaveAttribute("data-theme", expected);
}

/** @param {import("@playwright/test").Page} page @param {string} scene */
async function captureVisualThemePair(page, scene) {
  for (const theme of ["dark", "light"]) {
    await setVisualTheme(page, /** @type {"dark" | "light"} */ (theme));
    await prepareVisualPage(page);
    await expect(page).toHaveScreenshot(`${scene}-${theme}.png`, { animations: "disabled", maxDiffPixels: 100 });
  }
}

/** @param {import("@playwright/test").Page} page */
async function toggleBacklogFromView(page) {
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleBacklog").click();
  await expect(page.locator("#viewOptions")).toBeHidden();
}

/** @param {import("@playwright/test").Page} page */
async function toggleArchiveFromView(page) {
  await page.locator("#showArchiveView").click();
}

/** @param {number} offset */
function archiveIsoDate(offset) {
  return new Date(Date.UTC(2026, 0, 1) + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** @param {number} count */
function largeArchiveFixture(count) {
  const features = Array.from({ length: count }, (_, index) => `## Archived ${String(index + 1).padStart(3, "0")}\n#Version\n- ${Math.floor(index / 10) + 1}.${index % 10}.0\n#Date\n- ${archiveIsoDate(index)}\n### Done ${index + 1}\n- [x] ~done~`).join("\n\n");
  return `# Large Archive\n\n#Archive\n# Archive\n\n${features}`;
}

const swimlaneFixture = `# Swimlane Review

#Archive
# Archive

## Missing metadata
#Version
- 9.0.0
### Undated task
- [x] ~done~

## Later feature
#Version
- v3.2.1
#Date
- 2026-02-05 - 2026-02-07
### Later task
- [x] ~done~

## Early feature
#Version
- 2.1.0
#Date
- 01.01.26 - 03.01.26
- 10.01.2026 - 12.01.2026
- 15.01.2026
### First task
- [x] ~done~
### Second task
- [x] ~done~`;

/** @param {import("@playwright/test").Locator} feature */
async function openFeatureActions(feature) {
  await feature.locator(".release-heading").hover();
  await feature.locator(".feature-menu-button").click();
}

/** @param {import("@playwright/test").Locator} parent @param {import("@playwright/test").Locator} child @param {"both" | "vertical" | "horizontal"} axes */
async function expectCentered(parent, child, axes = "both") {
  const offset = await parent.evaluate((container, childElement) => {
    const outer = container.getBoundingClientRect();
    const inner = childElement.getBoundingClientRect();
    return {
      x: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
      y: inner.top + inner.height / 2 - (outer.top + outer.height / 2)
    };
  }, await child.elementHandle());
  if (axes !== "vertical") expect(Math.abs(offset.x)).toBeLessThanOrEqual(0.01);
  if (axes !== "horizontal") expect(Math.abs(offset.y)).toBeLessThanOrEqual(0.01);
}

/** @param {import("@playwright/test").Page} page */
async function expectVisibleIconButtonsCentered(page) {
  const offsets = await page.locator("button svg, button img").evaluateAll(graphics => graphics.flatMap(graphic => {
    const button = graphic.closest("button");
    const outer = button.getBoundingClientRect();
    const inner = graphic.getBoundingClientRect();
    if (button.innerText.trim() || !outer.width || !outer.height || !inner.width || !inner.height) return [];
    return [{
      label: button.getAttribute("aria-label") || button.id || button.className,
      x: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
      y: inner.top + inner.height / 2 - (outer.top + outer.height / 2)
    }];
  }));
  expect(offsets.length).toBeGreaterThan(0);
  for (const offset of offsets) {
    expect(Math.abs(offset.x), `${offset.label} horizontal center`).toBeLessThanOrEqual(0.01);
    expect(Math.abs(offset.y), `${offset.label} vertical center`).toBeLessThanOrEqual(0.01);
  }
}

/** @param {import("@playwright/test").Locator} button @param {import("@playwright/test").Locator} svg */
async function expectSvgInkCentered(button, svg) {
  const offset = await button.evaluate((container, graphic) => {
    const svgGraphic = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (graphic));
    const outer = container.getBoundingClientRect();
    const inner = svgGraphic.getBoundingClientRect();
    const ink = svgGraphic.getBBox();
    const viewBox = svgGraphic.viewBox.baseVal;
    return {
      x: inner.left + (ink.x + ink.width / 2 - viewBox.x) * inner.width / viewBox.width - (outer.left + outer.width / 2),
      y: inner.top + (ink.y + ink.height / 2 - viewBox.y) * inner.height / viewBox.height - (outer.top + outer.height / 2)
    };
  }, await svg.elementHandle());
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(0.05);
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(0.05);
}

test("start screen exposes the application identity and open action", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page).toHaveTitle("MD_Manager");
  await expect(page.locator("#appVersion")).toHaveText("v0.8.0");
  await expect(page.locator("#appVersion")).toHaveCSS("font-family", '"JetBrains Mono", monospace');
  expect(await page.locator("#appVersion").evaluate(element => getComputedStyle(element, "::before").content)).toBe("none");
  const versionClockStyles = await page.locator("#appVersion, #appClock").evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return [style.height, style.padding, style.borderWidth, style.borderRadius, style.backgroundImage, style.boxShadow, style.font];
  }));
  expect(versionClockStyles[0]).toEqual(versionClockStyles[1]);
  const startActions = page.locator(".start-actions");
  await expect(startActions).toHaveCSS("margin-top", "64px");
  const openFile = startActions.getByRole("button", { name: "Open File", exact: true });
  const createFile = startActions.getByRole("button", { name: "Create File", exact: true });
  await expect(openFile).toBeVisible();
  expect(await openFile.evaluate(element => element.getBoundingClientRect().x)).toBeLessThan(await createFile.evaluate(element => element.getBoundingClientRect().x));
  for (const action of [openFile, createFile]) {
    await expect(action).toHaveCSS("background-color", "rgb(40, 40, 40)");
    await expect(action).toHaveCSS("border-color", "rgb(80, 73, 69)");
    await expect(action).toHaveCSS("color", "rgb(235, 219, 178)");
  }
  const restingActionShadow = await openFile.evaluate(element => getComputedStyle(element).boxShadow);
  await openFile.hover();
  await expect(openFile).toHaveCSS("background-color", "rgb(60, 56, 54)");
  await expect(openFile).toHaveCSS("border-color", "rgb(235, 219, 178)");
  await expect(openFile).toHaveCSS("color", "rgb(235, 219, 178)");
  await expect(openFile).toHaveCSS("box-shadow", restingActionShadow);
  await createFile.hover();
  await expect(createFile).toHaveCSS("background-color", "rgb(60, 56, 54)");
  await expect(createFile).toHaveCSS("border-color", "rgb(235, 219, 178)");
  await expect(createFile).toHaveCSS("color", "rgb(235, 219, 178)");
  await expect(createFile).toHaveCSS("box-shadow", restingActionShadow);
  await expect(page.locator(".header").getByRole("button", { name: /Open/ })).toHaveCount(0);
  await expect(page.locator("#watermark")).toBeVisible();
  await expect(page.locator("#watermark")).toContainText("MD_Manager v0.8.0");
  const help = page.getByRole("button", { name: "Help", exact: true });
  const sound = page.locator("#toggleSounds");
  const theme = page.locator("#toggleTheme");
  await expect(help).toBeVisible();
  const positions = await Promise.all([help, sound, theme].map(locator => locator.evaluate(node => node.getBoundingClientRect().x)));
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  await expect(page.locator(".help-menu")).toHaveCSS("border-left-style", "none");
  await help.click();
  await expect(page.locator("#helpPopover")).toBeVisible();
});

test("recent files show the Markdown project title and filename", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator(".recent-files-empty")).toHaveText("No recent files.");
  await page.evaluate(() => window.MDManager.render.start([{
    id: "roadmap",
    name: "Roadmap.md",
    projectTitle: "MD Manager",
    openedAt: new Date(2026, 7, 3, 12, 34).getTime(),
    handle: {}
  }]));
  await expect(page.locator(".recent-project-name")).toHaveText("MD Manager");
  await expect(page.locator(".recent-file-name")).toHaveText("Roadmap.md");
  await expect(page.locator(".recent-file-time")).toHaveText("2026-08-03 12:34");
  await expect(page.locator(".recent-file")).toHaveCSS("border-top-width", "2px");
  await expect(page.locator(".recent-file-actions")).toHaveCSS("border-left-width", "0px");
  await expect(page.locator(".recent-delete")).toHaveCSS("border-top-width", "0px");
  await page.locator(".recent-delete").hover();
  await expect(page.locator(".recent-file")).toHaveCSS("border-color", "rgb(254, 128, 25)");
  expect(await page.locator(".recent-file").evaluate(element => getComputedStyle(element, "::after").content)).toBe("none");
});

test("local fonts, SVG symbols, custom tooltips, and editor controls are deterministic", async ({ page }) => {
  await page.goto(appUrl);
  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      status: document.fonts.status,
      inter: (await document.fonts.load('400 14px "Inter"')).length,
      mono: (await document.fonts.load('400 14px "JetBrains Mono"')).length,
      body: getComputedStyle(document.body).fontFamily
    };
  });
  expect(fontState).toEqual({ status: "loaded", inter: 1, mono: 1, body: "Inter, sans-serif" });
  await expect(page.locator("body [title]")).toHaveCount(0);
  await expect(page.locator("#addFeature")).toBeHidden();
  await expect(page.locator(".app-logo-mark")).toHaveCSS("cursor", "pointer");
  await expect(page.locator(".app-logo-mark")).toHaveAttribute("aria-label", "Reload application");
  await expect(page.locator(".app-logo-mark")).not.toHaveAttribute("data-tooltip");
  await page.locator(".app-logo-mark").hover();
  await expect(page.locator(".app-logo-mark")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("#toggleTheme svg")).toBeVisible();
  await expect(page.locator("#toggleViewMenu .view-chevron")).toBeAttached();
  await expect(page.locator("#icon-volume path").nth(1)).toHaveAttribute("stroke-width", "3");

  const help = page.getByRole("button", { name: "Help", exact: true });
  await help.hover();
  await expect(page.locator("#appTooltip")).toHaveText("Help");
  await expect(page.locator("#appTooltip")).toBeVisible();
  await expect(help).toHaveAttribute("aria-describedby", "appTooltip");

  await openFixture(page);
  await expect(page.locator("body [title]")).toHaveCount(0);
  await expect(page.locator("#toggleHelp use")).toHaveAttribute("href", "#icon-help");
  await expect(page.locator("#icon-help path")).toHaveAttribute("stroke-width", "4");
  await expect(page.locator("#icon-help path")).toHaveAttribute("d", /M16 25H16\.01/);
  await expect(page.locator("#addFeature")).toBeVisible();
  await expect(page.locator("#addFeature")).toHaveAttribute("data-tooltip", "New feature");
  await page.locator("#addFeature").hover();
  await expect(page.locator("#appTooltip")).toHaveText("New feature");
  await expect(page.locator("#toggleViewMenu .view-chevron")).toBeVisible();
  await expect(page.locator('.task-check .ui-icon use[href="#icon-check"]')).toBeVisible();
  await expect(page.locator('.task-in-progress .ui-icon use[href="#icon-progress"]')).toBeVisible();
  await expect(page.locator('.delete-btn .ui-icon use[href="#icon-close"]').first()).toBeAttached();
  const firstTask = page.locator("#content .card").first();
  await expect(firstTask).toHaveCSS("border-top-width", "0px");
  await firstTask.locator(".card-header").hover();
  await expect(firstTask).toHaveCSS("box-shadow", /0px 0px 0px 2px inset/);
  await expect(page.locator("#content .release-header").first()).toHaveCSS("border-bottom-width", "0px");
  await firstTask.dblclick();
  await expect(page.locator("#taskEditorForm")).toHaveAttribute("spellcheck", "false");
  await expect(page.locator("#taskEditorMarkdown")).toHaveAttribute("spellcheck", "false");
  await expect(page.locator("#taskEditorMarkdown")).toHaveCSS("font-family", '"JetBrains Mono", monospace');
});

test("symbols, progress values, and the clock stay optically aligned in their controls", async ({ page }) => {
  await openFixture(page);

  await expectSvgInkCentered(page.locator("#toggleSounds"), page.locator("#toggleSounds .sound-toggle-on"));
  await expectSvgInkCentered(page.locator("#toggleTheme"), page.locator("#toggleTheme svg"));
  const viewControl = page.locator("#toggleViewMenu");
  const viewChevron = viewControl.locator(".view-chevron");
  await expectCentered(viewControl, viewChevron, "vertical");
  expect(await viewControl.evaluate((button, icon) => {
    const outer = button.getBoundingClientRect();
    const inner = icon.getBoundingClientRect();
    return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
  }, await viewChevron.elementHandle())).toBe(true);
  await expectCentered(page.locator(".feature-progress").first(), page.locator(".status-value").first());
  await expectCentered(page.locator(".task-status").first(), page.locator(".task-progress").first(), "vertical");
  await expectCentered(page.locator("#appClock"), page.locator("#appClock .clock-current"));

  const completeCard = page.locator(".card").filter({ hasText: "Complete Task" });
  await completeCard.click();
  await expectCentered(page.locator(".add-task-btn").first(), page.locator(".add-task-btn svg").first());
  await expectCentered(completeCard.locator(".checkbox"), completeCard.locator(".checkbox .ui-icon"));
  const todoDelete = completeCard.locator(".todo-item .delete-btn");
  await expectCentered(todoDelete, todoDelete.locator(".ui-icon"));
  await expect(todoDelete.locator(".ui-icon")).toHaveCSS("width", "16px");
  await expect(todoDelete.locator(".ui-icon")).toHaveCSS("height", "16px");
  await expectVisibleIconButtonsCentered(page);

  await expect(page.locator(".stats-close")).toHaveCSS("width", "24px");
  await expect(page.locator(".stats-close")).toHaveCSS("height", "24px");
  await toggleBacklogFromView(page);
  await expect(page.locator(".backlog-close")).toHaveCSS("width", "32px");
  await expect(page.locator(".backlog-close")).toHaveCSS("height", "32px");
  const featurePlus = page.locator("#content .add-task-btn").first();
  const backlogPlus = page.locator("#backlog .add-task-btn");
  await expect(featurePlus).toHaveCSS("width", "32px");
  await expect(featurePlus).toHaveCSS("height", "32px");
  await expect(featurePlus.locator("xpath=..")).toHaveCSS("border-top-width", "0px");
  const workspaceSpacing = await page.locator("#content > .release").first().evaluate(release => {
    const cards = release.querySelectorAll(".card");
    const last = cards[cards.length - 1].getBoundingClientRect();
    const add = release.querySelector(".add-task-btn").getBoundingClientRect();
    const previous = cards[cards.length - 2].getBoundingClientRect();
    return { task: last.top - previous.bottom, add: add.top - last.bottom };
  });
  expect(workspaceSpacing.add).toBeCloseTo(workspaceSpacing.task, 5);
  await expect(featurePlus.locator("svg")).toHaveCSS("width", "16px");
  await expect(featurePlus.locator("svg")).toHaveCSS("height", "16px");
  await expect(backlogPlus).toHaveCSS("width", "32px");
  await expect(backlogPlus).toHaveCSS("height", "32px");
  await expect(backlogPlus.locator("xpath=..")).toHaveCSS("border-top-width", "0px");
  await expect(backlogPlus.locator("svg")).toHaveCSS("width", "16px");
  await expect(backlogPlus.locator("svg")).toHaveCSS("height", "16px");
  await expect(page.locator("#backlog .card").first()).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".backlog-header")).toHaveCSS("border-bottom-width", "0px");
  const surfaceColors = await page.evaluate(() => ({
    feature: getComputedStyle(document.querySelector("#content > .release")).backgroundColor,
    backlog: getComputedStyle(document.getElementById("backlog")).backgroundColor
  }));
  expect(surfaceColors.backlog).toBe(surfaceColors.feature);
  const borderlessActions = page.locator(".add-task-btn,.delete-btn,.edit-btn,.stats-close,.backlog-close,.help-close,.task-editor-close");
  expect(await borderlessActions.evaluateAll(buttons => buttons.every(button => getComputedStyle(button).borderTopWidth === "0px"))).toBe(true);
  await expectCentered(featurePlus, featurePlus.locator("svg"));
  await expectCentered(backlogPlus, backlogPlus.locator("svg"));
  await expect(page.locator(".help-close").first()).toHaveCSS("width", "32px");
  await expect(page.locator(".help-close").first()).toHaveCSS("height", "32px");
  await expect(page.locator(".help-close").first()).toHaveCSS("border-radius", "4px");
  await expect(page.locator(".view-mode")).toHaveCSS("width", "192px");
  await expect(page.locator("#showWorkspaceView")).toHaveCSS("height", "32px");
  await expect(page.locator("#showArchiveView")).toHaveCSS("height", "32px");
  const rasterContract = await page.evaluate(() => {
    const namespace = "http://www.w3.org/2000/svg";
    const visibleInk = (/** @type {SVGUseElement} */ use, /** @type {SVGSymbolElement} */ symbol) => {
      const bounds = use.getBBox();
      const strokeWidth = symbol.getAttribute("fill") === "none" ? Math.max(0, ...Array.from(symbol.children, child => parseFloat(child.getAttribute("stroke-width") || "0"))) : 0;
      const expansion = strokeWidth / 2;
      return { x: bounds.x - expansion, y: bounds.y - expansion, width: bounds.width + strokeWidth, height: bounds.height + strokeWidth };
    };
    const definitions = Array.from(document.querySelectorAll('.icon-sprite symbol[id^="icon-"]')).map(symbol => {
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("viewBox", "0 0 32 32");
      svg.style.cssText = "position:fixed;left:-32px;top:-32px;width:16px;height:16px";
      const use = document.createElementNS(namespace, "use");
      use.setAttribute("href", `#${symbol.id}`);
      svg.append(use);
      document.body.append(svg);
      const ink = visibleInk(/** @type {SVGUseElement} */ (use), /** @type {SVGSymbolElement} */ (symbol));
      svg.remove();
      return { id: symbol.id, ink: [ink.x, ink.y, ink.width, ink.height], center: [ink.x + ink.width / 2, ink.y + ink.height / 2] };
    });
    const visualizations = Array.from(document.querySelectorAll("body svg:not(.icon-sprite):not(.ui-icon)"), element => element.getAttribute("class") || "");
    const rendered = Array.from(document.querySelectorAll("body svg.ui-icon")).map(icon => {
      const use = icon.querySelector(":scope > use");
      const style = getComputedStyle(icon);
      return {
        classed: icon.classList.contains("ui-icon"),
        viewBox: icon.getAttribute("viewBox"),
        href: use?.getAttribute("href") || "",
        childCount: icon.children.length,
        transform: style.transform,
        size: [style.width, style.height]
      };
    });
    const framed = Array.from(document.querySelectorAll("button svg.ui-icon")).flatMap(icon => {
      const button = icon.closest("button");
      const use = icon.querySelector("use");
      const bounds = icon.getBoundingClientRect();
      if (!button || button.innerText.trim() || !use || !bounds.width || !bounds.height) return [];
      const outer = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const href = use.getAttribute("href");
      if (!href) return [];
      const symbol = document.querySelector(href);
      if (!(symbol instanceof SVGSymbolElement)) return [];
      const ink = visibleInk(/** @type {SVGUseElement} */ (/** @type {unknown} */ (use)), symbol);
      const inner = [outer.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth), outer.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)];
      const renderedInk = [ink.width * bounds.width / 32, ink.height * bounds.height / 32];
      return [{ href: use.getAttribute("href"), canvas: [bounds.width, bounds.height], gaps: [(inner[0] - renderedInk[0]) / 2, (inner[1] - renderedInk[1]) / 2] }];
    });
    return { definitions, rendered, framed, visualizations };
  });
  // An empty Archive renders no table header, so this fixture carries no visualization at all. The
  // contract is that nothing else ever becomes one; that the axis grid itself exists is asserted by
  // the Archive alignment test, which drives a populated Archive.
  expect(rasterContract.visualizations.every(name => name === "archive-axis-grid")).toBe(true);
  expect(rasterContract.visualizations.length).toBeLessThanOrEqual(1);
  expect(rasterContract.definitions.length).toBe(26);
  for (const definition of rasterContract.definitions) {
    const [x, y, width, height] = definition.ink;
    expect(definition.ink.every(Number.isFinite), `${definition.id} has finite source geometry`).toBe(true);
    expect(width, `${definition.id} has visible width`).toBeGreaterThan(0);
    expect(height, `${definition.id} has visible height`).toBeGreaterThan(0);
    expect(x, `${definition.id} stays inside the source canvas horizontally`).toBeGreaterThanOrEqual(0);
    expect(y, `${definition.id} stays inside the source canvas vertically`).toBeGreaterThanOrEqual(0);
    expect(x + width, `${definition.id} stays inside the source canvas horizontally`).toBeLessThanOrEqual(32);
    expect(y + height, `${definition.id} stays inside the source canvas vertically`).toBeLessThanOrEqual(32);
    const centerTolerance = definition.id === "icon-check" || definition.id === "icon-chevron" ? 1 : .25;
    expect(definition.center.every(value => Math.abs(value - 16) <= centerTolerance), `${definition.id} stays within its source-defined center tolerance`).toBe(true);
  }
  for (const icon of rasterContract.rendered) {
    expect(icon.classed).toBe(true);
    expect(icon.viewBox).toBe("0 0 32 32");
    expect(icon.href).toMatch(/^#icon-/);
    expect(icon.childCount).toBe(1);
    expect(icon.transform).toBe("none");
    expect(icon.size).toEqual(["16px", "16px"]);
  }
  expect(rasterContract.framed.length).toBeGreaterThan(0);
  for (const icon of rasterContract.framed) {
    expect(icon.canvas).toEqual([16, 16]);
    expect(icon.gaps.every(value => Number.isFinite(value) && value >= 0), `${icon.href} fits its framed control`).toBe(true);
  }
  const checkReferences = await page.locator('.view-option use[href="#icon-check"],.checkbox use[href="#icon-check"],.task-check use[href="#icon-check"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  expect(new Set(checkReferences)).toEqual(new Set(["#icon-check"]));
});

test("start page matches its platform visual baselines in both color schemes", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page.locator("body")).toHaveClass(/start-view/);
  await expect(page.locator(".header")).toHaveCSS("box-shadow", "none");
  await captureVisualThemePair(page, "start");
});

test("Golden File Workspace pinned jump with Backlog matches platform visual baselines", async ({ page }) => {
  await openGoldenFixture(page);
  await expect(page.locator(".header")).toHaveCSS("box-shadow", "none");
  await toggleBacklogFromView(page);
  await page.keyboard.press("p");
  const pinned = page.locator("#content > .release.pinned");
  await expect(pinned).toHaveCount(1);
  await expect(pinned).toBeInViewport();
  await expect(pinned.locator(".card").first()).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#backlog")).toBeVisible();
  await captureVisualThemePair(page, "workspace-pinned-backlog");
});

test("Golden File Help dialog matches platform visual baselines", async ({ page }) => {
  await openGoldenFixture(page);
  await page.locator("#toggleHelp").click();
  await expect(page.locator("#helpPopover")).toBeVisible();
  await expect(page.locator("#toggleHelp")).toHaveAttribute("aria-expanded", "true");
  await captureVisualThemePair(page, "help-dialog");
});

test("Golden File Search palette matches platform visual baselines", async ({ page }) => {
  await openGoldenFixture(page);
  await page.keyboard.press("f");
  await expect(page.locator("#searchPalette")).toBeVisible();
  await page.locator("#searchInput").fill("arch");
  await expect(page.locator("#searchResults .search-result").first()).toBeVisible();
  await captureVisualThemePair(page, "search-palette");
});

test("Golden File Archive matches platform visual baselines", async ({ page }) => {
  await openGoldenFixture(page);
  await toggleArchiveFromView(page);
  await expect(page.locator("#archive .archive-swimlane-label")).toHaveCount(1);
  await expect(page.locator("#archive .archive-swimlane-label .title-text")).toHaveText("Archived Date Fixture");
  await expect(page.locator("#archive .archive-axis-cell-label").first()).toHaveText("KW 40");
  await expect(page.locator("#archive .archive-active-segment")).toHaveCount(1);
  await expect(page.locator("#archive .archive-date-unmatched .archive-feature")).toHaveCount(2);
  await captureVisualThemePair(page, "archive");
});

test("Golden File Task Edit dialog matches platform visual baselines", async ({ page }) => {
  await openGoldenFixture(page);
  await page.keyboard.press("p");
  const task = page.locator("#content > .release.pinned .card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("Markdown editing");
  await captureVisualThemePair(page, "task-edit-dialog");
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
  await page.getByRole("button", { name: "Open File", exact: true }).click();
  await expect(toggle).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "gruvbox-light");
  await expect(page.locator(".task-in-progress")).toHaveCSS("color", "rgb(204, 36, 29)");
  await page.evaluate(() => window.MDManager.notifications.show("error", "Application", "Preview"));
  await expect(page.locator(".notification-error .notification-tag")).toHaveCSS("color", "rgb(204, 36, 29)");

  await toggle.click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "gruvbox-dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(29, 32, 33)");
});

test("Markdown import renders features, tasks, progress states, and filename title", async ({ page }) => {
  await openFixture(page);
  await expect(page).toHaveTitle("MD_Manager - Fixture.md");
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await expect(page.locator("#content .card")).toHaveCount(3);
  await expect(page.locator('.task-in-progress .ui-icon use[href="#icon-progress"]')).toBeVisible();
  await expect(page.locator('.task-check .ui-icon use[href="#icon-check"]')).toBeVisible();
  await expect(page.locator("#toggleBacklog")).toBeEnabled();
  await expect(page.locator("#redoChange")).toHaveCSS("border-top-right-radius", "6px");
  await expect(page.locator("#redoChange")).toHaveCSS("border-bottom-right-radius", "6px");
  await expect(page.locator(".notification-title").last()).toHaveText("File loaded");
  await expect(page.locator(".notification-body").last()).toHaveText("Fixture.md is ready.");
  await expect(page.locator(".notification").last().locator(".notification-value")).toHaveText("Fixture.md");
});

test("open project keeps only the project name in the header", async ({ page }) => {
  await openFixture(page);
  await expect(page.locator("#projectTitle")).toHaveText("Test Project");
});

test("application logo reloads the start screen and an open project", async ({ page }) => {
  await page.goto(appUrl);
  await page.evaluate(() => { window.__logoReloadMarker = true; });
  await page.locator("#reloadApp").click();
  await expect.poll(() => page.evaluate(() => window.__logoReloadMarker)).toBeUndefined();

  await openFixture(page);
  await expect(page.locator("#projectTitle")).toHaveText("Test Project");
  await page.locator("#reloadApp").click();
  await expect(page.locator(".start-screen")).toBeVisible();
  await expect(page.locator("#projectTitle")).toHaveText("MD_Manager");
});

test("New, Undo, and Redo are adjacent borderless tools before Save", async ({ page }) => {
  await openFixture(page);
  const tools = page.locator("#addFeature, #undoChange, #redoChange");
  await expect(tools).toHaveCount(3);
  const layout = await page.evaluate(() => {
    const tools = ["addFeature", "undoChange", "redoChange"].map(id => document.getElementById(id).getBoundingClientRect());
    const save = document.getElementById("saveFile").getBoundingClientRect();
    return { gaps: [tools[1].left - tools[0].right, tools[2].left - tools[1].right], saveGap: save.left - tools[2].right };
  });
  expect(layout.gaps.every(gap => Math.abs(gap) <= .01)).toBe(true);
  expect(Math.abs(layout.saveGap)).toBeLessThanOrEqual(.01);
  for (let index = 0; index < 3; index += 1) {
    const tool = tools.nth(index);
    await expect(tool).toHaveCSS("width", "32px");
    await expect(tool).toHaveCSS("height", "32px");
    await expect(tool).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    await expect(tool).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
});

test("save state uses existing icons and colors without a border", async ({ page }) => {
  await openFixture(page);
  const save = page.locator("#saveFile");
  await expect(save).toHaveText("Saved");
  await expect(save).toHaveCSS("color", "rgb(184, 187, 38)");
  await expect(save).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
  await expect(save.locator("use")).toHaveAttribute("href", "#icon-check");
  await page.locator(".card-header").first().click();
  await page.locator(".card").first().locator(".checkbox").nth(1).click();
  await expect(save).toHaveText("Unsaved");
  await expect(save).toHaveCSS("color", "rgb(254, 128, 25)");
  await expect(save.locator("use")).toHaveAttribute("href", "#icon-progress");
});

test("View uses an overflow button to the right of the theme control", async ({ page }) => {
  await openFixture(page);
  const theme = page.locator("#toggleTheme");
  const view = page.locator("#toggleViewMenu");
  await expect(view).toHaveAttribute("aria-label", "View");
  await expect(view.locator('.dots-icon use')).toHaveAttribute("href", "#icon-dots");
  expect(await theme.evaluate(node => node.getBoundingClientRect().x)).toBeLessThan(await view.evaluate(node => node.getBoundingClientRect().x));
  await view.click();
  await expect(page.locator("#viewOptions")).toHaveCSS("width", "128px");
});

test("feature actions use a consistent overflow menu", async ({ page }) => {
  await openFixture(page);
  const feature = page.locator("#content > .release").first();
  await openFeatureActions(feature);
  const menuButton = feature.locator(".feature-menu-button");
  const options = feature.locator(".feature-option");
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(feature.locator(".feature-options")).toHaveCSS("width", "128px");
  await expect(feature.locator(".release-header")).toHaveCSS("border-top-left-radius", "8px");
  await expect(feature.locator(".release-header")).toHaveCSS("border-top-right-radius", "8px");
  await expect(menuButton.locator('use')).toHaveAttribute("href", "#icon-dots");
  await expect(options).toHaveText(["Archive", "Delete", "Edit", "Pin"]);
  await expect(options.locator("[data-tooltip]" )).toHaveCount(0);
  expect(await options.locator("use").evaluateAll(uses => uses.map(use => use.getAttribute("href")))).toEqual(["#icon-archive", "#icon-close", "#icon-edit", "#icon-pin"]);
  const deleteOption = options.filter({ hasText: "Delete" });
  const regularOption = options.filter({ hasText: "Edit" });
  await regularOption.hover();
  // The hover colors transition, so the reference has to be read once that transition has settled;
  // sampling it mid-flight pins an intermediate color the delete option never reaches. The frame
  // hop lets the hover style apply first, otherwise there is no transition to wait for yet.
  await regularOption.evaluate(async button => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await Promise.all(button.getAnimations().map(animation => animation.finished));
  });
  const regularHover = await regularOption.evaluate(button => ({ color: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor }));
  await deleteOption.hover();
  await expect(deleteOption).toHaveCSS("color", regularHover.color);
  await expect(deleteOption).toHaveCSS("background-color", regularHover.background);
  await expect(feature).toHaveCSS("border-color", "rgb(254, 128, 25)");
  await expect(feature.locator(".release-content")).toHaveCSS("opacity", "0.55");
  await options.filter({ hasText: "Pin" }).click();
  await expect(feature).toBeAttached();
  await expect(feature.locator(".feature-options")).toBeHidden();
  await expect(feature).toHaveClass(/pinned/);
  await expect(feature.locator(".feature-pin")).toHaveCSS("color", "rgb(131, 165, 152)");
  await openFeatureActions(feature);
  await options.filter({ hasText: "Archive" }).click();
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Active Feature", "Open Feature"]);
  await expect(page.locator(".notification-title").last()).toHaveText("Feature not archived");
  await expect(page.locator(".notification-body").last()).toHaveText("Active Feature is not 100% complete.");
});

test("archive action persists the complete feature at the end and undo restores it", async ({ page }) => {
  await openFixture(page);
  await page.locator(".card-header").first().click();
  await page.locator(".card").first().locator(".checkbox").nth(1).click();
  await page.keyboard.press("Control+s");
  const feature = page.locator("#content > .release").first();
  await openFeatureActions(feature);
  await feature.getByRole("button", { name: "Archive feature" }).click();
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Open Feature"]);
  await expect(page.locator("#projectStats .archive-stat")).toHaveText(["Archive", "1", "2", "3"]);
  await expect(page.locator(".notification-title").last()).toHaveText("Feature archived");
  await expect(page.locator(".notification-body").last()).toHaveText("Active Feature archived.");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Active Feature", "Open Feature"]);
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty/);
  await page.locator("#redoChange").click();
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Open Feature"]);
  await page.keyboard.press("Control+s");
  const saved = await page.evaluate(() => window.__savedMarkdown);
  expect(saved.indexOf("#Archive")).toBeGreaterThan(saved.indexOf("#Backlog"));
  expect(saved.slice(saved.indexOf("#Archive"))).toContain("## Active Feature");
  expect(saved.slice(saved.indexOf("#Archive"))).toContain("### Started Task");
  expect(saved.trim().endsWith("- [x] ~first~")).toBe(true);
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Active Feature", "Open Feature"]);
  await expect(page.locator("#saveFile")).toHaveClass(/dirty/);
});

test("empty features stay compact and show their complete action menu", async ({ page }) => {
  await openFixture(page, `# Empty states

## Empty Feature

## Task Feature
### Movable Task
Task details`);
  const emptyFeature = page.locator("#content > .release").first();
  const emptyBoard = emptyFeature.locator(".board");
  expect(await emptyBoard.evaluate(node => node.getBoundingClientRect().height)).toBe(8);

  await openFeatureActions(emptyFeature);
  const options = emptyFeature.locator(".feature-options");
  const featureBox = await emptyFeature.boundingBox();
  const optionsBox = await options.boundingBox();
  expect(optionsBox.y + optionsBox.height).toBeGreaterThan(featureBox.y + featureBox.height);
  expect(await options.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.bottom - 2));
  })).toBe(true);

  await page.keyboard.press("Escape");
  const source = page.locator("#content > .release").nth(1).locator(".card");
  const from = await source.boundingBox();
  const to = await emptyBoard.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(emptyBoard.locator(".card")).toHaveCount(1);
});

test("bodyless tasks do not expand but accept todos through a temporary drop target", async ({ page }) => {
  await openFixture(page, `# Empty tasks

## Feature
### Source Task
- [ ] movable

### Empty Task

### Text Task
Visible details`);
  const cards = page.locator("#content > .release .card");
  const emptyTask = cards.nth(1);
  const textTask = cards.nth(2);

  await emptyTask.locator(".card-header").click();
  await expect(emptyTask).not.toHaveAttribute("aria-expanded");
  await expect(emptyTask).not.toHaveAttribute("tabindex");
  await expect(emptyTask.locator(".card-body")).toBeHidden();
  await textTask.locator(".card-header").click();
  await expect(textTask.locator(".card-body")).toContainText("Visible details");
  await expect(textTask.locator(".card-body")).toBeVisible();

  const sourceTask = cards.first();
  await sourceTask.locator(".card-header").click();
  const todo = sourceTask.locator(".todo-text");
  const from = await todo.boundingBox();
  const feature = page.locator("#content > .release");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  const featureHeightBeforeDrag = await feature.evaluate(node => node.getBoundingClientRect().height);
  const emptyTaskHeightBeforeDrag = await emptyTask.evaluate(node => node.getBoundingClientRect().height);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 });
  await expect(emptyTask.locator(".card-body")).toBeVisible();
  expect(await feature.evaluate(node => node.getBoundingClientRect().height)).toBe(featureHeightBeforeDrag);
  expect(await emptyTask.evaluate(node => node.getBoundingClientRect().height)).toBe(emptyTaskHeightBeforeDrag);
  const target = await emptyTask.locator(".todo-list").boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await expect(emptyTask).toHaveClass(/todo-drop-preview/);
  const previewHeight = await emptyTask.evaluate(node => node.getBoundingClientRect().height);
  expect(previewHeight).toBeGreaterThan(emptyTaskHeightBeforeDrag);
  const previewTarget = await emptyTask.locator(".todo-list").boundingBox();
  await page.mouse.move(previewTarget.x + previewTarget.width / 2, previewTarget.y + previewTarget.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(emptyTask.locator(".todo-item")).toHaveCount(1);
  await expect(emptyTask).toHaveAttribute("aria-expanded", "true");
  await expect(emptyTask.locator(".card-body")).toBeVisible();
  expect(await emptyTask.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(previewHeight, 1);
});

test("features can be pinned, reached with P, persisted, and unpinned", async ({ page }) => {
  const features = Array.from({ length: 8 }, (_, index) => `## Feature ${index + 1}\n### Task ${index + 1}\n- [ ] pending`).join("\n\n");
  await openFixture(page, `# Pin Test\n\n${features}`);
  const target = page.locator("#content > .release").nth(3);
  await openFeatureActions(target);
  await target.getByRole("button", { name: "Pin feature" }).click();
  await expect(target).toHaveClass(/pinned/);
  await expect(target.locator('.feature-pin use')).toHaveAttribute("href", "#icon-pin");
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).toMatch(/#Pin\n## Feature 4/);

  const content = page.locator("#content");
  await content.evaluate(element => { element.scrollLeft = 0; });
  await expect(content).toHaveJSProperty("scrollLeft", 0);
  await expect(target.locator(".card")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("p");
  await expect(target.locator(".card")).toHaveAttribute("aria-expanded", "true");
  await expect(target.locator(".card-body")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const feature = document.querySelector("#content > .release.pinned").getBoundingClientRect();
    const clock = document.getElementById("appClock").getBoundingClientRect();
    return Math.abs(feature.left + feature.width / 2 - (clock.left + clock.width / 2));
  })).toBeLessThanOrEqual(1);

  const last = page.locator("#content > .release").last();
  await openFeatureActions(last);
  await last.getByRole("button", { name: "Pin feature" }).click();
  await content.evaluate(element => { element.scrollLeft = 0; });
  await page.keyboard.press("p");
  await expect.poll(() => content.evaluate(element => { const html = /** @type {HTMLElement} */ (element); return Math.abs(html.scrollWidth - html.offsetWidth - html.scrollLeft); })).toBeLessThanOrEqual(1);

  await openFeatureActions(last);
  const unpin = last.getByRole("button", { name: "Unpin feature" });
  await expect(unpin).toHaveText("Unpin");
  await unpin.click();
  await expect(last).not.toHaveClass(/pinned/);
  await expect(last.locator(".feature-pin")).toHaveCount(0);
  await page.locator("#saveFile").click();
  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).not.toMatch(/#Pin/);
});

test("duplicate and misplaced #Pin tags load with warnings", async ({ page }) => {
  await openFixture(page, "# P\n\n#Pin\n## First\n### A\n- [ ] one\n\n#Pin\n## Second\n### B\n- [ ] two");
  await expect(page.locator("#content > .release").first()).toHaveClass(/pinned/);
  await expect(page.locator("#content > .release").nth(1)).not.toHaveClass(/pinned/);
  await expect(page.locator(".notification-warning")).toContainText("multiple #Pin tags");

  await openFixture(page, "# P\n\n## Feature\n#Pin\n### Task\n- [ ] work");
  await expect(page.locator("#content > .release")).not.toHaveClass(/pinned/);
  await expect(page.locator(".notification-warning")).toContainText("only supported directly before a feature heading");
});

test("right header tools use stable borderless icon buttons", async ({ page }) => {
  await openFixture(page);
  const tools = page.locator("#toggleHelp, #toggleSounds, #toggleTheme, #toggleViewMenu");
  await expect(tools).toHaveCount(4);
  const gaps = await tools.evaluateAll(buttons => buttons.slice(1).map((button, index) => {
    const previous = buttons[index].getBoundingClientRect();
    return button.getBoundingClientRect().left - previous.right;
  }));
  expect(gaps.every(gap => Math.abs(gap) <= .01)).toBe(true);
  for (let index = 0; index < 4; index += 1) {
    const tool = tools.nth(index);
    await expect(tool).toHaveCSS("width", "32px");
    await expect(tool).toHaveCSS("height", "32px");
    await expect(tool).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
    await expect(tool).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await tool.hover();
    await expect(tool).toHaveCSS("background-color", "rgb(60, 56, 54)");
  }
});

test("Workspace and Archive use a two-pixel segmented control with the standard action gap", async ({ page }) => {
  await openFixture(page);
  await expect(page.locator(".header")).toHaveCSS("border-bottom-width", "0px");
  const workspace = page.locator("#showWorkspaceView");
  const archive = page.locator("#showArchiveView");
  await expect(workspace).toHaveCSS("border-left-width", "2px");
  await expect(workspace).toHaveCSS("border-right-width", "2px");
  await archive.hover();
  await expect(archive).toHaveCSS("border-left-width", "2px");
  await expect(archive).toHaveCSS("border-right-width", "2px");
  await expect(page.locator(".view-mode")).toHaveCSS("border-left-style", "none");
  await expect(page.locator(".control-bar > .help-menu")).toHaveCSS("border-left-style", "none");

  const gaps = await page.evaluate(() => {
    const project = document.getElementById("projectTitle").getBoundingClientRect();
    const add = document.getElementById("addFeature").getBoundingClientRect();
    const view = document.querySelector(".view-mode").getBoundingClientRect();
    const help = document.getElementById("toggleHelp").getBoundingClientRect();
    return { left: add.left - project.right, view: help.left - view.right };
  });
  expect(gaps.view).toBeCloseTo(gaps.left, 5);
});

test("text below a task label keeps its position and visual hierarchy", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n### Task\n\n#### Label\nDescription text\n- [ ] Todo text");
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

test("task group dividers only appear after an earlier todo", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n### After notes\n#Info\nDetails\n#Warn\nWarning\n#### First group\n- [ ] first grouped todo\n#### Later group\n- [ ] later grouped todo\n\n### After global todo\n- [ ] global todo\n#### Group after global\n- [ ] grouped todo");
  const cards = page.locator(".card");
  await cards.nth(0).locator(".card-header").click();
  await cards.nth(1).locator(".card-header").click();

  const firstGroupTitle = cards.nth(0).locator(".todo-separator").nth(0);
  await expect(firstGroupTitle).toHaveClass("todo-separator");
  await expect(firstGroupTitle).toHaveCSS("border-top-style", "none");
  await expect(firstGroupTitle).toHaveCSS("margin-top", "0px");
  await expect(firstGroupTitle).toHaveCSS("padding-top", "0px");

  const laterGroupTitle = cards.nth(0).locator(".todo-separator").nth(1);
  const afterGlobalTitle = cards.nth(1).locator(".todo-separator");
  await expect(laterGroupTitle).toHaveClass("todo-separator todo-separator-divided");
  await expect(afterGlobalTitle).toHaveClass("todo-separator todo-separator-divided");
  await expect(laterGroupTitle).toHaveCSS("border-top-style", "solid");
  await expect(afterGlobalTitle).toHaveCSS("border-top-style", "solid");
});

test("inline code wraps at punctuation and case transitions", async ({ page }) => {
  const source = "HTTPServer.longIdentifier_value=>NextCase(argument_one)";
  await openFixture(page, `# Project\n\n## Feature\n\n### Task\n\`${source}\``);
  await page.locator(".card-header").click();
  const code = page.locator(".card-body code");
  await expect(code).toHaveText(source);
  await expect(code.locator("wbr")).toHaveCount(8);
  await expect(code).toHaveCSS("overflow-wrap", "break-word");
  await code.evaluate(element => { if (!element.parentElement) throw new Error("Code parent missing"); element.parentElement.style.width = "8rem"; });
  await expect.poll(() => code.evaluate(element => element.getClientRects().length)).toBeGreaterThan(1);
});

test("a task label renders repeated descriptions with their following todos in source order", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n### Task\n\n#### Anti-Aliasing\nGeometry.\n- [ ] segments\nShader AA.\n- [ ] smoothstep\n- [ ] distance\nMSAA.\n- [ ] samples");
  const card = page.locator(".card");
  await card.locator(".card-header").click();
  const group = card.locator(".todo-group");
  await expect(group.locator(":scope > *")).toHaveCount(7);
  await expect(group.locator(":scope > *")).toHaveClass(["todo-separator", "todo-description", "todo-list", "todo-description", "todo-list", "todo-description", "todo-list"]);
  await expect(group.locator(".todo-description")).toHaveText(["Geometry.", "Shader AA.", "MSAA."]);
  await expect(group.locator(".todo-text")).toHaveText(["segments", "smoothstep", "distance", "samples"]);
  await expect(group.locator(".todo-list")).toHaveCount(3);
});

test("tag content renders nested lists, code, and URLs while task todos stay flat", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n#Info\n- Parent `literal * code` [docs](https://example.com/a_b)\n  + Child\n    * Grandchild\n\n### Task\n\n#### Work\n  + [ ] Plus\n* [x] ~Star~\n- Minus\n\n#Warn\n- Warning `literal * code` [docs](https://example.com/warn_a)\n  + Nested\n\n#Info\nParagraph content");

  const featureNote = page.locator(".feature-note");
  const collapsedTagTop = (await featureNote.locator(".note-toggle").boundingBox()).y;
  await expect(featureNote.locator(".note-toggle")).toHaveCSS("border-bottom-width", "0px");
  await featureNote.locator(".note-toggle").click();
  await expect(featureNote.locator(".note-toggle")).toHaveCSS("border-bottom-width", "1px");
  await expect(featureNote.locator(".note-toggle")).toHaveCSS("border-bottom-color", "rgb(131, 165, 152)");
  expect((await featureNote.locator(".note-toggle").boundingBox()).y).toBeCloseTo(collapsedTagTop, 1);
  await expect(featureNote.locator("ul > li > ul > li > ul > li")).toHaveText("Grandchild");
  const noteFontSizes = await featureNote.locator("ul > li").evaluateAll(items => items.slice(0, 2).map(item => Number.parseFloat(getComputedStyle(item).fontSize)));
  expect(noteFontSizes[0] - noteFontSizes[1]).toBe(1);
  await expect(featureNote.locator("code")).toHaveText("literal * code");
  await expect(featureNote.locator("code")).toHaveCSS("color", "rgb(184, 187, 38)");
  await expect(featureNote.locator("code")).not.toHaveCSS("box-shadow", "none");
  await expect(featureNote.locator("a")).toHaveAttribute("href", "https://example.com/a_b");
  await expect(featureNote.locator("a")).toHaveCSS("color", "rgb(211, 134, 155)");

  const card = page.locator(".card");
  await card.locator(".card-header").click();
  await expect(card.locator(".task-warn h4")).toHaveCSS("border-bottom-width", "1px");
  await expect(card.locator(".task-warn h4")).toHaveCSS("border-bottom-color", "rgb(215, 153, 33)");
  const noteContentGaps = await card.locator(".task-note").evaluateAll(notes => notes.map(note => {
    const header = note.querySelector("h4").getBoundingClientRect();
    const content = note.querySelector("h4 + *").getBoundingClientRect();
    return content.top - header.bottom;
  }));
  expect(noteContentGaps[0]).toBeCloseTo(noteContentGaps[1], 1);
  await expect(card.locator(".task-warn ul > li > ul > li")).toHaveText("Nested");
  await expect(card.locator(".task-warn code")).toHaveText("literal * code");
  const taskLink = card.locator(".task-warn a");
  await expect(taskLink).toHaveAttribute("href", "https://example.com/warn_a");
  await expect(taskLink).toHaveCSS("pointer-events", "auto");
  await taskLink.evaluate(link => link.addEventListener("click", event => { event.preventDefault(); link.dataset.clicked = "true"; }, { once: true }));
  await taskLink.click();
  await expect(taskLink).toHaveAttribute("data-clicked", "true");
  await expect(card.locator(".todo-item")).toHaveCount(3);
  const todoOffsets = await card.locator(".todo-item").evaluateAll(items => items.map(item => item.getBoundingClientRect().left));
  expect(new Set(todoOffsets.map(offset => Math.round(offset))).size).toBe(1);
});

test("rendered emphasis stays slanted everywhere inline Markdown appears", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n#Info\n- Feature note *italic*\n\n### Task\n\n#Warn\n- Task note *italic*\n\nTask paragraph *italic*\n\n#### Group *italic*\nDescription *italic*\n- [ ] Todo **bold** *italic* ~struck~");

  await page.locator(".feature-note .note-toggle").click();
  const card = page.locator(".card");
  await card.locator(".card-header").click();
  const emphasis = page.locator(".feature-note em,.card-body em");
  await expect(emphasis).toHaveText(["italic", "italic", "italic", "italic", "italic", "italic"]);
  // Inter and JetBrains Mono ship no italic face, so the body-wide font-synthesis:none would leave em upright.
  for (const style of await emphasis.evaluateAll(items => items.map(item => getComputedStyle(item).fontStyle))) expect(style).toBe("italic");
  for (const synthesis of await emphasis.evaluateAll(items => items.map(item => getComputedStyle(item).fontSynthesis))) expect(synthesis).not.toBe("none");
  await expect(card.locator(".todo-text strong")).toHaveText("bold");
  await expect(card.locator(".todo-text strong")).toHaveCSS("font-weight", "700");
  await expect(card.locator(".todo-text s")).toHaveText("struck");
  await expect(card.locator(".todo-text s")).toHaveCSS("text-decoration-line", "line-through");
});

test("a task paragraph after a blank line renders inside the tag above it and survives an editor round trip", async ({ page }) => {
  const source = "# Project\n\n## Feature\n\n### Task\n\n#Warn\n- Careful with this\n\nStill part of the warning.\n\n- [ ] A real todo\n\nPlain task text.";
  await openFixture(page, source);

  const card = page.locator(".card");
  await card.locator(".card-header").click();
  await expect(card.locator(".task-warn p")).toHaveText("Still part of the warning.");
  await expect(card.locator(".task-blocks > p")).toHaveText("Plain task text.");
  await expect(card.locator(".todo-item")).toHaveCount(1);
  await expect(card.locator(".todo-text")).toHaveText("A real todo");

  await card.locator(".card-header").hover();
  await card.locator('[data-edit="task"]').click();
  const editor = page.locator("#taskEditor");
  await expect(editor).toBeVisible();
  const before = await page.locator("#taskEditorMarkdown").inputValue();
  expect(before).toContain("- Careful with this\n\nStill part of the warning.");
  await page.locator("#taskEditorMarkdown").fill(before);
  await page.locator("#saveTaskEditor").click();
  await expect(editor).toBeHidden();
  await expect(card.locator(".task-warn p")).toHaveText("Still part of the warning.");
  await expect(card.locator(".task-blocks > p")).toHaveText("Plain task text.");
});

test("feature Info and Warn use the card vertical spacing rhythm", async ({ page }) => {
  await openFixture(page, "# Project\n\n## Feature\n\n#Info\nInformation paragraph.\n\n#Warn\n- Warning item.\n\n### Task\n\n#### Work\n- [ ] Todo");
  const feature = page.locator("#content > .release");
  const notes = feature.locator(".feature-note");
  await notes.locator(".note-toggle").evaluateAll(toggles => toggles.forEach(toggle => /** @type {HTMLElement} */ (toggle).click()));

  const spacing = await feature.evaluate(node => {
    const releaseContent = /** @type {HTMLElement} */ (node.querySelector(".release-content"));
    const featureNotes = /** @type {HTMLElement} */ (node.querySelector(".feature-notes"));
    const noteElements = [...featureNotes.querySelectorAll(".feature-note")];
    const card = /** @type {HTMLElement} */ (node.querySelector(".card"));
    const first = noteElements[0].getBoundingClientRect();
    const second = noteElements[1].getBoundingClientRect();
    const content = releaseContent.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const insets = noteElements.map(note => {
      const bounds = note.getBoundingClientRect();
      const toggle = /** @type {HTMLElement} */ (note.querySelector(".note-toggle")).getBoundingClientRect();
      const lastContent = /** @type {HTMLElement} */ (note.lastElementChild).getBoundingClientRect();
      return [toggle.top - bounds.top, bounds.bottom - lastContent.bottom];
    });
    return {
      cardPaddingTop: Number.parseFloat(getComputedStyle(card).paddingTop),
      insets,
      outerGaps: [first.top - content.top, second.top - first.bottom, cardRect.top - second.bottom]
    };
  });

  for (const [top, bottom] of spacing.insets) {
    expect(top).toBeCloseTo(bottom, 1);
    expect(top).toBeCloseTo(spacing.cardPaddingTop, 1);
  }
  expect(spacing.outerGaps[0]).toBeCloseTo(spacing.outerGaps[1], 1);
  expect(spacing.outerGaps[1]).toBeCloseTo(spacing.outerGaps[2], 1);
});

test("metadata uses natural Workspace header heights while keeping title rows aligned", async ({ page }) => {
  await openFixture(page);
  await expect(page.locator("#toggleMetadata")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".release-version")).toHaveText("v1.2.3");
  await expect(page.locator(".release-dates")).toContainText("2026-01-01");
  const titleHeights = await page.locator("#content > .release .release-title").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(new Set(titleHeights).size).toBe(1);
  const headerHeights = await page.locator("#content > .release > .release-header").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(headerHeights[0]).toBeGreaterThan(headerHeights[1]);
});

test("feature editor saves title, metadata, info, and warn as one undo step", async ({ page }) => {
  await openFixture(page);
  const feature = page.locator("#content > .release").first();
  const heading = feature.locator(".release-heading");
  await openFeatureActions(feature);
  const editFeature = heading.locator('[data-edit="feature"]');
  await expect(editFeature).not.toHaveAttribute("data-tooltip");
  await expect(editFeature).toHaveAccessibleName("Edit feature");
  await editFeature.click();
  const dialog = page.locator("#featureEditor");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#featureEditorMetadata")).toHaveValue(/#Version/);
  await expect(page.locator("#featureEditorMetadata")).toHaveValue(/#Info/);
  await page.locator("#featureEditorTitle").fill("Renamed Feature");
  await page.locator("#featureEditorMetadata").fill("#Version\n- 2.0.0\n#Date\n- 2027-01-01 - 2027-06-30\n\n#Info\n- Updated metadata\n\n#Warn\n- Check this");
  await expect(page.locator("#saveFeatureEditor")).toHaveClass(/dirty/);
  await page.locator("#saveFeatureEditor").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#toggleMetadata")).toHaveAttribute("aria-pressed", "true");
  await expect(feature.locator(".release-title")).toHaveText("Renamed Feature");
  await expect(feature.locator(".release-version")).toHaveText("v2.0.0");
  await expect(feature.locator(".release-dates")).toContainText("2027-06-30");
  await expect(feature.locator(".feature-notes")).toContainText("Updated metadata");
  await expect(feature.locator(".feature-notes")).toContainText("Check this");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release").first().locator(".release-title")).toHaveText("Active Feature");
  await expect(page.locator("#content > .release").first().locator(".release-version")).toHaveText("v1.2.3");
});

test("editors open without focusing a field and keep immediate field clicks", async ({ page }) => {
  await openFixture(page);
  const featureHeading = page.locator(".release-heading").first();
  await openFeatureActions(featureHeading.locator(".."));
  await featureHeading.locator('[data-edit="feature"]').click();
  await expect(page.locator("#featureEditor")).toBeFocused();
  await page.locator("#featureEditorMetadata").click();
  await expect(page.locator("#featureEditorMetadata")).toBeFocused();
  await page.locator("#cancelFeatureEditor").click();

  const taskHeader = page.locator(".card-header").first();
  await taskHeader.hover();
  await taskHeader.locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeFocused();
  await page.locator("#taskEditorMarkdown").click();
  await expect(page.locator("#taskEditorMarkdown")).toBeFocused();
});

test("Control+Enter saves feature and task dialogs", async ({ page }) => {
  await openFixture(page);
  const feature = page.locator("#content > .release").first();
  await openFeatureActions(feature);
  await feature.locator('[data-edit="feature"]').click();
  await page.locator("#featureEditorTitle").fill("Feature shortcut");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#featureEditor")).toBeHidden();
  await expect(feature.locator(".release-title")).toHaveText("Feature shortcut");

  const task = feature.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await page.locator("#taskEditorTitle").fill("Task shortcut");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#taskEditor")).toBeHidden();
  await expect(task.locator(".card-title")).toHaveText("Task shortcut");
});

test("unchanged dialogs close without creating a project change", async ({ page }) => {
  await openFixture(page);
  const initialSaveClass = await page.locator("#saveFile").getAttribute("class");
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await page.locator("#taskEditorTitle").focus();
  await page.locator("#taskEditorTitle").press("Tab");
  await expect(page.locator("#saveTaskEditor")).not.toHaveClass(/dirty/);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#taskEditor")).toBeHidden();
  await expect(page.locator("#saveFile")).toHaveAttribute("class", initialSaveClass);
  await expect(page.locator("#undoChange")).toBeDisabled();

  const feature = page.locator(".release").first();
  await openFeatureActions(feature);
  await feature.locator('[data-edit="feature"]').click();
  await page.locator("#featureEditorTitle").focus();
  await page.locator("#featureEditorTitle").press("Tab");
  await expect(page.locator("#saveFeatureEditor")).not.toHaveClass(/dirty/);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#featureEditor")).toBeHidden();
  await expect(page.locator("#saveFile")).toHaveAttribute("class", initialSaveClass);
  await expect(page.locator("#undoChange")).toBeDisabled();
});

test("Markdown toolbars format defaults and selected text in the active field", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  const textarea = page.locator("#taskEditorMarkdown");
  const title = page.locator("#taskEditorTitle");
  const toolbar = page.locator("#taskMarkdownToolbar");
  await expect(page.locator("#taskEditor")).toHaveCSS("transform", "none");
  await expect(toolbar).toHaveCSS("height", "44px");
  await expect(toolbar).toHaveCSS("border-bottom-width", "0px");
  const toolMetrics = await toolbar.locator(":scope > .markdown-tool-group > .markdown-tool, :scope > .markdown-help-menu > .markdown-tool").evaluateAll(buttons => buttons.flatMap(button => {
    const bounds = button.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return [];
    const icon = button.querySelector(":scope > .ui-icon");
    const iconBounds = icon?.getBoundingClientRect();
    return [{
      size: [bounds.width, bounds.height],
      iconOffset: iconBounds ? [iconBounds.left + iconBounds.width / 2 - (bounds.left + bounds.width / 2), iconBounds.top + iconBounds.height / 2 - (bounds.top + bounds.height / 2)] : null
    }];
  }));
  expect(toolMetrics.length).toBe(7);
  for (const metric of toolMetrics) {
    expect(metric.size).toEqual([32, 32]);
    if (metric.iconOffset) expect(metric.iconOffset).toEqual([0, 0]);
  }
  const formattingGaps = await toolbar.locator(":scope > .markdown-tool-group > .markdown-tool").evaluateAll(buttons => buttons.slice(1).map((button, index) => {
    const previous = buttons[index].getBoundingClientRect();
    return button.getBoundingClientRect().left - previous.right;
  }));
  expect(formattingGaps).toEqual([4, 4, 4, 4, 4]);
  await expect(toolbar.locator(".markdown-tool-group").first()).toHaveCSS("border-right-width", "0px");
  expect(await toolbar.locator(".markdown-tool, .markdown-tags > summary").evaluateAll(controls => controls.every(control => getComputedStyle(control).borderTopWidth === "0px"))).toBe(true);
  await expect(page.getByText("Content, todos, #Info and #Warn", { exact: true })).toHaveCount(0);
  await expect(toolbar.locator(".markdown-tool-group")).toHaveCount(2);
  await expect(toolbar.locator("[data-editor-history]")).toHaveCount(0);
  await expect(toolbar.locator(".markdown-tags > summary")).toHaveText("Tags");
  await expect(toolbar.locator(".markdown-tags > summary")).toHaveCSS("height", "32px");
  await expect(page.locator("#taskEditorForm .editor-header-tool").first()).toHaveCSS("width", "32px");
  await expect(page.locator("#taskEditorForm .editor-header-tool").first()).toHaveCSS("height", "32px");
  await expect(page.locator("#closeTaskEditor")).toHaveCSS("width", "32px");
  await expect(page.locator("#closeTaskEditor")).toHaveCSS("height", "32px");
  expect(await page.locator(".task-editor-header, .feature-editor-header").evaluateAll(headers => headers.every(header => getComputedStyle(header).borderBottomWidth === "0px"))).toBe(true);
  expect(await page.locator("#taskEditor, #featureEditor").evaluateAll(dialogs => dialogs.every(dialog => getComputedStyle(dialog).borderTopWidth === "0px"))).toBe(true);
  expect(await page.locator(".task-editor-footer").evaluateAll(footers => footers.every(footer => getComputedStyle(footer).borderTopWidth === "0px"))).toBe(true);
  await expect(page.locator("#taskEditor .task-editor-footer")).toHaveCSS("background-color", "rgb(40, 40, 40)");
  await expect(page.locator("#cancelTaskEditor")).toHaveCSS("width", "64px");
  await expect(page.locator("#cancelTaskEditor")).toHaveCSS("border-top-width", "2px");
  await expect(page.locator("#saveTaskEditor")).toHaveCSS("border-top-width", "2px");
  const editorActionOffsets = await page.locator("#cancelTaskEditor, #saveTaskEditor").evaluateAll(buttons => buttons.map(button => {
    const buttonBounds = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(button);
    const textBounds = range.getBoundingClientRect();
    return {
      horizontal: Math.abs(textBounds.x + textBounds.width / 2 - (buttonBounds.x + buttonBounds.width / 2)),
      vertical: Math.abs(textBounds.y + textBounds.height / 2 - (buttonBounds.y + buttonBounds.height / 2))
    };
  }));
  expect(editorActionOffsets.every(offset => offset.horizontal <= 1 && offset.vertical <= 1)).toBe(true);
  await expect(page.locator("#cancelTaskEditor")).toHaveCSS("height", "32px");
  await expect(page.locator("#saveTaskEditor")).toHaveCSS("width", "64px");
  await expect(page.locator("#saveTaskEditor")).toHaveCSS("height", "32px");
  const separateEditorStyle = await page.locator("#cancelTaskEditor, #saveTaskEditor, #showArchiveView").evaluateAll(buttons => buttons.map(button => {
    const style = getComputedStyle(button);
    return [style.backgroundColor, style.borderColor, style.borderWidth, style.color, style.fontSize, style.fontWeight];
  }));
  expect(separateEditorStyle[0]).toEqual(separateEditorStyle[2]);
  expect(separateEditorStyle[1]).toEqual(separateEditorStyle[2]);
  await expect(toolbar.getByRole("button", { name: "URL" })).toHaveText("URL");
  await expect(toolbar.getByRole("button", { name: "URL" }).locator("svg")).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Bold" })).toBeDisabled();
  await textarea.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); input.setSelectionRange(input.value.length, input.value.length); });
  await title.focus();
  await title.press("Tab");
  await expect(textarea).toBeFocused();
  await expect.poll(() => textarea.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); return [input.selectionStart, input.selectionEnd]; })).toEqual([0, 0]);
  expect(await toolbar.evaluate(node => node.parentElement?.querySelector("textarea")?.id)).toBe("taskEditorMarkdown");
  expect(await toolbar.evaluate(node => {
    const toolbarBounds = node.getBoundingClientRect();
    if (!node.nextElementSibling) throw new Error("Editor sibling missing");
    const editorBounds = node.nextElementSibling.getBoundingClientRect();
    return Math.abs(toolbarBounds.bottom - editorBounds.top);
  })).toBeLessThanOrEqual(1);
  await textarea.click();
  await expect(textarea).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(textarea).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const editorHeightRatio = await page.locator(".task-editor-dialog").evaluate((dialog, editor) => editor.getBoundingClientRect().height / dialog.getBoundingClientRect().height, await page.locator("#taskEditorMarkdown").elementHandle());
  expect(editorHeightRatio).toBeGreaterThan(.55);
  await expect(toolbar.getByRole("button", { name: "Bold" })).toBeEnabled();
  await expect(toolbar).toHaveCSS("border-top-color", "rgb(235, 219, 178)");
  await expect(toolbar).toHaveCSS("border-right-color", "rgb(235, 219, 178)");
  await expect(toolbar).toHaveCSS("border-bottom-color", "rgb(235, 219, 178)");
  await expect(toolbar).toHaveCSS("border-left-color", "rgb(235, 219, 178)");
  const editorStack = page.locator("#taskMarkdownHighlight").locator("..");
  await expect(editorStack).toHaveCSS("border-right-color", "rgb(235, 219, 178)");
  await expect(editorStack).toHaveCSS("border-bottom-color", "rgb(235, 219, 178)");
  await expect(editorStack).toHaveCSS("border-left-color", "rgb(235, 219, 178)");
  await textarea.fill("word next");
  await textarea.evaluate(element => {
    const input = /** @type {HTMLTextAreaElement} */ (element);
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 }));
  });
  await expect.poll(() => textarea.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); return [input.selectionStart, input.selectionEnd]; })).toEqual([0, 4]);
  const helpButton = toolbar.getByRole("button", { name: "Formatting help" });
  await helpButton.click();
  const formattingHelp = toolbar.locator(".help-popover");
  await expect(formattingHelp).toBeVisible();
  await expect(formattingHelp.locator(".markdown-reference")).toHaveCount(0);
  await expect(formattingHelp).toContainText("Bold");
  await expect(formattingHelp).toContainText("Ctrl");
  await expect(formattingHelp).not.toContainText("press twice");
  await expect(formattingHelp).toContainText("or Command B");
  await expect(formattingHelp).toContainText("Command Shift Z");
  await expect(formattingHelp.locator(".shortcut-list > div").filter({ hasText: "Redo" }).locator("kbd")).toHaveText(["Ctrl", "Shift", "Z"]);
  await formattingHelp.getByRole("button", { name: "Close formatting help" }).click();
  await expect(formattingHelp).toBeHidden();

  const defaults = [
    ["Bold", "**bold text**"],
    ["Italic", "*italic text*"],
    ["Strikethrough", "~strikethrough text~"],
    ["Todo list", "- [ ] list item"],
    ["Code", "`code`"],
    ["URL", "[link text](https://example.com)"]
  ];
  for (const [name, expected] of defaults) {
    await textarea.fill("");
    await toolbar.getByRole("button", { name }).click();
    await expect(textarea).toHaveValue(expected);
    await expect(textarea).toBeFocused();
  }

  const selections = [
    ["Bold", "chosen", "**chosen**"],
    ["Italic", "chosen", "*chosen*"],
    ["Strikethrough", "chosen", "~chosen~"],
    ["Todo list", "one\ntwo", "- [ ] one\n- [ ] two"],
    ["Code", "chosen", "`chosen`"],
    ["URL", "chosen", "[chosen](https://example.com)"]
  ];
  for (const [name, selected, expected] of selections) {
    const button = toolbar.getByRole("button", { name });
    await textarea.fill(selected);
    await textarea.selectText();
    await button.click();
    await expect(textarea).toHaveValue(expected);
    await expect(button).toHaveClass(/active/);
    await page.mouse.move(0, 0);
    await expect(button).toHaveCSS("border-top-width", "0px");
    await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await button.click();
    await expect(textarea).toHaveValue(selected);
    await expect(button).not.toHaveClass(/active/);
    await button.click();
    await expect(textarea).toHaveValue(expected);
  }
  await page.locator("#taskEditor").getByRole("button", { name: "Undo dialog edit" }).click();
  await expect(textarea).toHaveValue("chosen");
  await page.locator("#taskEditor").getByRole("button", { name: "Redo dialog edit" }).click();
  await expect(textarea).toHaveValue("[chosen](https://example.com)");
  await textarea.fill("**bold**");
  await textarea.selectText();
  await toolbar.getByRole("button", { name: "Bold" }).click();
  await expect(textarea).toHaveValue("bold");
  await textarea.fill("**bold**");
  await textarea.selectText();
  await toolbar.getByRole("button", { name: "Italic" }).click();
  await expect(textarea).toHaveValue("***bold***");
  await toolbar.getByRole("button", { name: "Italic" }).click();
  await expect(textarea).toHaveValue("**bold**");
  await expect(page.locator("#taskEditorDirty")).toBeVisible();
});

test("portrait editors wrap the highlight exactly like the plain textarea text", async ({ page }) => {
  const sample = "- [ ] Lokal im Entity zwischenspeichern bis `Freigeben` und `Abschliessen` gedrueckt wird\n- [ ] Danach `resolveTarget()` sowie `validate()` und `commit()` in dieser Reihenfolge pruefen\n- [ ] Zum Schluss `flush()` aufrufen damit der `cache` sauber geleert wird und nichts bleibt";
  await page.setViewportSize({ width: 1080, height: 1920 });
  await openFixture(page);
  await page.evaluate(async () => { await document.fonts.ready; });

  /** @param {string} stackSelector @param {string} value */
  const drift = (stackSelector, value) => page.evaluate(([selector, text]) => {
    const stack = /** @type {HTMLElement} */ (document.querySelector(selector));
    const textarea = /** @type {HTMLTextAreaElement} */ (stack.querySelector("textarea"));
    const highlight = /** @type {HTMLElement} */ (stack.querySelector(".markdown-highlight"));
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    // Reference layer: the same text without highlight spans, in an identically styled box.
    const plain = document.createElement("pre");
    plain.className = highlight.className;
    plain.style.visibility = "hidden";
    plain.textContent = text;
    stack.appendChild(plain);

    /** @param {HTMLElement} root */
    const positions = root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const origin = root.getBoundingClientRect();
      const range = document.createRange();
      /** @type {{x: number, y: number}[]} */
      const list = [];
      let offset = 0;
      let node;
      while ((node = walker.nextNode())) {
        const characters = node.nodeValue || "";
        for (let index = 0; index < characters.length; index += 1) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          list[offset + index] = { x: rect.left - origin.left, y: rect.top - origin.top };
        }
        offset += characters.length;
      }
      return list;
    };

    const highlighted = positions(highlight);
    const reference = positions(plain);
    let maxX = 0;
    let maxY = 0;
    for (let index = 0; index < reference.length; index += 1) {
      const expected = reference[index];
      const actual = highlighted[index];
      if (!expected || !actual) continue;
      maxX = Math.max(maxX, Math.abs(expected.x - actual.x));
      maxY = Math.max(maxY, Math.abs(expected.y - actual.y));
    }
    const result = {
      textMatches: highlight.textContent === text,
      maxX,
      maxY,
      // Both layers must reserve the same scrollbar gutter, otherwise they wrap at different widths.
      sameWidth: textarea.clientWidth === highlight.clientWidth,
      sameHeight: textarea.scrollHeight === highlight.scrollHeight
    };
    plain.remove();
    return result;
  }, /** @type {[string, string]} */ ([stackSelector, value]));

  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();
  const taskDrift = await drift("#taskEditor .markdown-editor-stack", sample);
  expect(taskDrift.textMatches).toBe(true);
  expect(taskDrift.sameWidth).toBe(true);
  expect(taskDrift.sameHeight).toBe(true);
  expect(taskDrift.maxX).toBeLessThan(0.5);
  expect(taskDrift.maxY).toBeLessThan(0.5);
  await page.locator("#closeTaskEditor").click();

  const feature = page.locator(".release").first();
  await openFeatureActions(feature);
  await feature.locator('[data-edit="feature"]').click();
  await expect(page.locator("#featureEditor")).toBeVisible();
  const featureDrift = await drift("#featureEditor .markdown-editor-stack", sample);
  expect(featureDrift.textMatches).toBe(true);
  expect(featureDrift.sameWidth).toBe(true);
  expect(featureDrift.sameHeight).toBe(true);
  expect(featureDrift.maxX).toBeLessThan(0.5);
  expect(featureDrift.maxY).toBeLessThan(0.5);
});

test("portrait editor highlight keeps textarea height and scroll with a trailing newline", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await openFixture(page);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.locator(".card").first().locator(".card-header").hover();
  await page.locator(".card").first().locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();

  const newline = String.fromCharCode(10);
  const body = Array.from({ length: 60 }, (_, index) => `- [ ] line ${index} padding words here`).join(newline);
  // A textarea renders a final empty line for a trailing newline; a pre does not. Without the
  // sentinel the layer is one line shorter, its scrollTop clamps, and the visible text drifts.
  for (const tail of ["", newline, newline + newline]) {
    const state = await page.evaluate(async value => {
      const highlight = /** @type {HTMLElement} */ (document.getElementById("taskMarkdownHighlight"));
      const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
      textarea.value = value;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      textarea.scrollTop = textarea.scrollHeight;
      highlight.scrollTop = textarea.scrollTop;
      return {
        height: highlight.scrollHeight - textarea.scrollHeight,
        scroll: highlight.scrollTop - textarea.scrollTop,
        sameText: highlight.textContent === textarea.value,
        overflowing: textarea.scrollHeight > textarea.clientHeight
      };
    }, body + tail);
    expect(state.overflowing).toBe(true);
    expect(state.height).toBe(0);
    expect(state.scroll).toBe(0);
    expect(state.sameText).toBe(true);
  }
});

test("editor highlight coalesces a burst of input into one render", async ({ page }) => {
  await openFixture(page);
  await page.locator(".card").first().locator(".card-header").hover();
  await page.locator(".card").first().locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();

  const renders = await page.evaluate(async () => {
    const highlight = /** @type {HTMLElement} */ (document.getElementById("taskMarkdownHighlight"));
    const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(highlight, { childList: true });
    for (let index = 0; index < 10; index++) {
      textarea.value = `- [ ] burst ${"x".repeat(index + 1)}`;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return { count, sameText: highlight.textContent === textarea.value };
  });
  expect(renders.count).toBeLessThanOrEqual(2);
  expect(renders.sameText).toBe(true);
});

test("editor highlight survives a pathological inline run without going stale", async ({ page }) => {
  await openFixture(page);
  await page.locator(".card").first().locator(".card-header").hover();
  await page.locator(".card").first().locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeVisible();

  // Unbounded recursion over a long marker run exhausted the call stack and froze the layer
  // on the previous text, which is the only state where the visible content is truly wrong.
  const state = await page.evaluate(async () => {
    const highlight = /** @type {HTMLElement} */ (document.getElementById("taskMarkdownHighlight"));
    const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
    textarea.value = "seed";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const value = "*".repeat(30000);
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { sameText: highlight.textContent === value, length: (highlight.textContent || "").length };
  });
  expect(state.sameText).toBe(true);
  expect(state.length).toBe(30000);
});

test("task and feature editors share the requested responsive width", async ({ page }) => {
  await openFixture(page);

  for (const [viewportWidth, expectedWidth] of [[800, 500], [1080, 648], [1920, 1000]]) {
    await page.setViewportSize({ width: viewportWidth, height: 1080 });

    const feature = page.locator(".release").first();
    await openFeatureActions(feature);
    await feature.locator('[data-edit="feature"]').click();
    await expect(page.locator("#featureEditor")).toHaveCSS("width", `${expectedWidth}px`);
    await page.locator("#closeFeatureEditor").click();

    const task = page.locator(".card").first();
    await task.locator(".card-header").hover();
    await task.locator('[data-edit="task"]').click();
    await expect(page.locator("#taskEditor")).toHaveCSS("width", `${expectedWidth}px`);
    await page.locator("#closeTaskEditor").click();
  }
});

test("Markdown fields continue and finish lists while formatting shortcuts wrap selections", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  const textarea = page.locator("#taskEditorMarkdown");

  await textarea.fill("- first");
  await textarea.press("End");
  await textarea.press("Enter");
  await textarea.type("second");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("- first\n- [ ] second\n- [ ] ");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("- first\n- [ ] second\n");

  await textarea.fill("- [x] done");
  await textarea.press("End");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("- [x] done\n- [ ] ");

  await textarea.fill("  + [x] nested todo");
  await textarea.press("End");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("  + [x] nested todo\n- [ ] ");

  await textarea.fill("#Info\n  * nested note");
  await textarea.press("End");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("#Info\n  * nested note\n  - ");

  const beforeContinuedList = "- [ ] selected";
  await textarea.fill(beforeContinuedList);
  await textarea.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); input.setSelectionRange(6, input.value.length); });
  await textarea.press("End");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue(`${beforeContinuedList}\n- [ ] `);
  await textarea.press("Control+z");
  await expect(textarea).toHaveValue(beforeContinuedList);
  await expect.poll(() => textarea.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); return [input.selectionStart, input.selectionEnd]; })).toEqual([beforeContinuedList.length, beforeContinuedList.length]);

  const shortcuts = [
    ["Control+b", "**text**"],
    ["Control+i", "*text*"],
    ["Control+Shift+x", "~text~"],
    ["Control+e", "`text`"],
    ["Control+k", "[text](https://example.com)"]
  ];
  for (const [shortcut, expected] of shortcuts) {
    await textarea.fill("text");
    await textarea.selectText();
    await textarea.press(shortcut);
    await expect(textarea).toHaveValue(expected);
  }
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "false");
});

test("dialog undo and redo include all fields and reset when the dialog reopens", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  const title = page.locator("#taskEditorTitle");
  const markdown = page.locator("#taskEditorMarkdown");
  const originalTitle = await title.inputValue();
  const originalMarkdown = await markdown.inputValue();
  const undo = page.getByRole("button", { name: "Undo dialog edit" });
  const redo = page.getByRole("button", { name: "Redo dialog edit" });
  await expect(page.locator("#taskEditor .editor-header-history").getByRole("button")).toHaveCount(2);
  expect(await undo.evaluate(element => element.closest("header")?.className)).toContain("task-editor-header");
  await expect(undo).toHaveCSS("width", "32px");
  await expect(undo).toHaveCSS("height", "32px");
  await expect(undo).toHaveCSS("border-radius", "6px");
  await expect(redo).toHaveCSS("width", "32px");
  await expect(redo).toHaveCSS("height", "32px");
  await expect(redo).toHaveCSS("border-radius", "6px");
  await expect(undo).toHaveCSS("border-left-width", "0px");
  await expect(redo).toHaveCSS("border-left-width", "0px");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await title.evaluate(element => {
    const input = /** @type {HTMLInputElement} */ (element);
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 }));
  });
  await expect.poll(() => title.evaluate(element => /** @type {HTMLInputElement} */ (element).selectionEnd)).toBe(originalTitle.indexOf(" "));

  await title.fill("Temporary title");
  await title.fill(originalTitle);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue(originalTitle);

  await title.fill("Changed title");
  await markdown.fill("Changed Markdown");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(title).toHaveValue("Changed title");
  await expect(markdown).toHaveValue(originalMarkdown);
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue(originalTitle);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(title).toHaveValue("Changed title");
  await page.keyboard.press("Control+Shift+z");
  await expect(markdown).toHaveValue("Changed Markdown");
  await expect(page.locator("#taskEditorDirty")).toBeVisible();
  await page.keyboard.press("Control+z");
  await title.fill("Branched title");
  await expect(redo).toBeDisabled();

  await page.locator("#cancelTaskEditor").click();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await expect(page.getByRole("button", { name: "Undo dialog edit" })).toBeDisabled();
  await expect(title).toHaveValue(originalTitle);
  await expect(markdown).toHaveValue(originalMarkdown);
});

test("merged feature Markdown highlights syntax and inserts tags", async ({ page }) => {
  await openFixture(page);
  const feature = page.locator(".release").first();
  await openFeatureActions(feature);
  await feature.locator('[data-edit="feature"]').click();
  const metadata = page.locator("#featureEditorMetadata");
  const highlight = page.locator("#featureMarkdownHighlight");
  await expect(page.getByText("#Version, #Date, #Info and #Warn", { exact: true })).toHaveCount(0);
  await metadata.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); input.setSelectionRange(input.value.length, input.value.length); });
  await page.locator("#featureEditorTitle").focus();
  await page.locator("#featureEditorTitle").press("Tab");
  await expect(metadata).toBeFocused();
  await expect.poll(() => metadata.evaluate(element => { const input = /** @type {HTMLTextAreaElement} */ (element); return [input.selectionStart, input.selectionEnd]; })).toEqual([0, 0]);
  await expect(metadata).toHaveValue(/#Info/);
  await expect(highlight.locator(".markdown-syntax-info")).toHaveText("#Info");
  await expect(highlight.locator(".markdown-syntax-info")).toHaveCSS("color", "rgb(131, 165, 152)");
  await expect(highlight.locator(".markdown-syntax-tag")).toHaveText(["#Version", "#Date"]);
  await expect(highlight.locator(".markdown-syntax-tag").first()).toHaveCSS("color", "rgb(211, 134, 155)");
  await metadata.fill("#Info\n**bold** *italic* ~done~ `code` [link](https://example.com)\n#### Label");
  await expect(highlight.locator(".markdown-syntax-bold")).toHaveCSS("font-weight", "800");
  await expect(highlight.locator(".markdown-syntax-italic")).toHaveCSS("font-style", "italic");
  // JetBrains Mono ships no italic face, so an unsynthesised slant would leave the highlight upright.
  await expect(highlight.locator(".markdown-syntax-italic")).not.toHaveCSS("font-synthesis", "none");
  await expect(highlight.locator(".markdown-syntax-strike")).toHaveCSS("text-decoration-line", "line-through");
  await expect(highlight.locator(".markdown-syntax-code")).toHaveCSS("font-family", '"JetBrains Mono", monospace');
  await expect(highlight.locator(".markdown-syntax-code")).toHaveCSS("color", "rgb(184, 187, 38)");
  await expect(highlight.locator(".markdown-syntax-code")).not.toHaveCSS("box-shadow", "none");
  await expect(highlight.locator(".markdown-syntax-link")).toHaveCSS("color", "rgb(211, 134, 155)");
  await expect(highlight.locator(".markdown-syntax-label")).toHaveText("#### Label");
  await metadata.fill("~**bold** *italic* `code` [link](https://example.com)~ **~nested strike~**");
  const combinedStrike = highlight.locator(".markdown-syntax-strike").first();
  await expect(combinedStrike.locator(".markdown-syntax-bold")).toHaveText("**bold**");
  await expect(combinedStrike.locator(".markdown-syntax-italic")).toHaveText("*italic*");
  await expect(combinedStrike.locator(".markdown-syntax-italic")).toHaveCSS("font-style", "italic");
  await expect(combinedStrike.locator(".markdown-syntax-code")).toHaveText("`code`");
  await expect(combinedStrike.locator(".markdown-syntax-code")).toHaveCSS("color", "rgb(184, 187, 38)");
  await expect(combinedStrike.locator(".markdown-syntax-link")).toHaveText("[link](https://example.com)");
  await expect(combinedStrike.locator(".markdown-syntax-link")).toHaveCSS("color", "rgb(211, 134, 155)");
  await expect(highlight.locator(".markdown-syntax-bold .markdown-syntax-strike")).toHaveText("~nested strike~");
  await metadata.fill("**bold with *nested italic*** __strong__ _underscore italic_ \\*plain*");
  await expect(highlight.locator(".markdown-syntax-bold .markdown-syntax-italic")).toHaveText("*nested italic*");
  await expect(highlight.locator(".markdown-syntax-bold")).toHaveCount(2);
  await expect(highlight.locator(".markdown-syntax-italic")).toHaveCount(2);
  await expect(highlight.locator(".markdown-syntax-italic").last()).toHaveText("_underscore italic_");
  await metadata.press("End");
  const featureToolbar = page.locator("#featureMarkdownToolbar");
  await featureToolbar.locator(".markdown-tags > summary").click();
  await expect(featureToolbar.getByRole("button", { name: "Insert Version tag" })).toHaveCSS("color", "rgb(211, 134, 155)");
  await expect(featureToolbar.getByRole("button", { name: "Insert Date tag" })).toHaveCSS("color", "rgb(211, 134, 155)");
  await featureToolbar.getByRole("button", { name: "Insert Warn tag" }).click();
  await expect(metadata).toHaveValue(/#Warn\n$/);
  await expect(highlight.locator(".markdown-syntax-warn")).toHaveText("#Warn");
  await expect(highlight.locator(".markdown-syntax-warn")).toHaveCSS("color", "rgb(215, 153, 33)");
  await featureToolbar.locator(".markdown-tags > summary").click();
  await featureToolbar.getByRole("button", { name: "Insert Version tag" }).click();
  await featureToolbar.locator(".markdown-tags > summary").click();
  await featureToolbar.getByRole("button", { name: "Insert Date tag" }).click();
  await expect(metadata).toHaveValue(/#Version\n\n#Date\n$/);
});

test("New button and task buttons create features and tasks through existing editors", async ({ page }) => {
  await openFixture(page);
  const addFeature = page.getByRole("button", { name: "New", exact: true });
  await expect(addFeature).toBeEnabled();
  expect(await addFeature.evaluate(button => button.nextElementSibling?.id)).toBe("undoSystemControls");
  expect(await addFeature.evaluate(button => button.parentElement?.nextElementSibling?.querySelector("button")?.id)).toBe("saveFile");
  await addFeature.click();
  await expect(page.locator("#featureEditorTitle")).toHaveValue("New Feature");
  await page.locator("#cancelFeatureEditor").click();
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await addFeature.click();
  await page.evaluate(() => {
    const serialize = window.MDManager.markdown.serialize;
    window.__serializationCount = 0;
    window.MDManager.markdown.serialize = (/** @type {unknown} */ project) => {
      window.__serializationCount += 1;
      return serialize(project);
    };
  });
  await page.locator("#saveFeatureEditor").click();
  expect(await page.evaluate(() => window.__serializationCount)).toBe(1);
  await expect(page.locator("#content > .release")).toHaveCount(3);
  await expect(page.locator("#content > .release").last().locator(".release-title")).toHaveText("New Feature");
  await expect(page.locator(".notification-title").last()).toHaveText("Feature added");
  await expect(page.locator(".notification-body").last()).toHaveText('New Feature added to "Test Project".');
  await expect(page.locator(".notification").last().locator(".notification-value")).toHaveText(["New Feature", "Test Project"]);

  const firstFeature = page.locator("#content > .release").first();
  const tasksBefore = await firstFeature.locator(".card").count();
  const addTask = firstFeature.getByRole("button", { name: /New task in Active Feature/ });
  await expect(addTask).toHaveAttribute("data-tooltip", "New task");
  await addTask.click();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("New Task");
  await expect(page.locator("#taskEditorMarkdown")).toHaveValue(/#### Definition of Done/);
  await page.locator("#saveTaskEditor").click();
  await expect(firstFeature.locator(".card")).toHaveCount(tasksBefore + 1);
  await expect(firstFeature.locator(".card-title").last()).toHaveText("New Task");
  await expect(page.locator(".notification-title").last()).toHaveText("Task added");
  await expect(page.locator(".notification-body").last()).toHaveText("New Task added to Active Feature.");
  await expect(page.locator(".notification").last().locator(".notification-value")).toHaveText(["New Task", "Active Feature"]);
});

test("feature and task creation can start from their bundled templates", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.locator("#featureEditorTitle")).toHaveValue("New Feature");
  await expect(page.locator("#featureEditorMetadata")).toHaveValue(/#Version/);
  await page.locator("#saveFeatureEditor").click();
  const feature = page.locator("#content > .release").last();
  await expect(feature.locator(".release-title")).toHaveText("New Feature");
  await expect(feature.locator(".feature-note.task-warn")).toContainText("Describe where to be careful.");
  await expect(feature.locator(".card-title")).toHaveText("New Task");

  const firstFeature = page.locator("#content > .release").first();
  await firstFeature.getByRole("button", { name: /New task in Active Feature/ }).click();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("New Task");
  await expect(page.locator("#taskEditorMarkdown")).toHaveValue(/#### Checklist/);
  await page.locator("#saveTaskEditor").click();
  await expect(firstFeature.locator(".card-title").last()).toHaveText("New Task");
});

test("adding a feature scrolls its column into view", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const features = Array.from({ length: 5 }, (_, index) => `## Feature ${index + 1}\n\n### Task\n- [ ] Todo`).join("\n\n");
  await openFixture(page, `# Scroll Project\n\n${features}`);
  const content = page.locator("#content");
  await content.evaluate(element => { element.scrollLeft = 0; });
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.locator("#saveFeatureEditor").click();
  const addedFeature = page.locator("#content > .release").last();
  await expect(addedFeature.locator(".release-title")).toHaveText("New Feature");
  await expect.poll(async () => content.evaluate((element, feature) => {
    const contentBounds = element.getBoundingClientRect();
    const featureBounds = feature.getBoundingClientRect();
    return featureBounds.left >= contentBounds.left && featureBounds.right <= contentBounds.right + 1;
  }, await addedFeature.elementHandle())).toBe(true);
  expect(await content.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});

test("start screen Create File creates and opens a filesystem Markdown and help names the template folder", async ({ page }) => {
  await page.goto(appUrl);
  const newProject = page.getByRole("button", { name: "Create File", exact: true });
  const recentFiles = page.locator(".recent-files-list");
  const [newBounds, recentBounds] = await Promise.all([newProject.boundingBox(), recentFiles.boundingBox()]);
  expect(newBounds.y).toBeGreaterThan(recentBounds.y + recentBounds.height);
  expect(newBounds.width).toBeGreaterThanOrEqual(160);
  await expect(newProject.locator("img")).toHaveCount(0);
  const recentOffset = await page.locator(".recent-files").evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m42);
  expect(recentOffset).toBe(0);
  await page.evaluate(() => {
    window.MDManager.files.createProject = async () => ({ handle: { name: "Project.md" }, markdown: "# New Project\n", stamp: "1:14" });
    window.MDManager.files.remember = async () => {};
  });
  await newProject.click();
  await expect(page.locator("#projectTitle")).toHaveText("New Project");
  await expect(page.locator("#content .empty")).toContainText("No features found");

  await page.locator("#toggleHelp").click();
  await page.getByRole("tab", { name: "Markdown syntax", exact: true }).click();
  const templateHelp = page.locator('.help-section[aria-labelledby="templateHelpTitle"]');
  await expect(templateHelp.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(templateHelp.locator("p")).toHaveCSS("color", "rgb(146, 131, 116)");
  await expect(page.locator("#helpPopover")).toContainText("'data/templates/'");
});

test("an empty Workspace uses the start-screen empty message even when a Backlog exists", async ({ page }) => {
  await page.goto(appUrl);
  const recentEmptyStyle = await page.locator(".recent-files-empty").evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, padding: style.padding };
  });
  await openFixture(page, "# Empty Workspace\n\n#Backlog\n## Later\n### Deferred\n- [ ] someday");
  const content = page.locator("#content");
  const message = content.locator(".empty.start-screen .recent-files-empty");
  await expect(content.locator(":scope > .release")).toHaveCount(0);
  await expect(message).toContainText("No features found");
  expect(await message.evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, padding: style.padding };
  })).toEqual(recentEmptyStyle);
  expect(await content.locator(":scope > .empty").evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const parent = node.parentElement?.getBoundingClientRect();
    if (!parent) return Number.POSITIVE_INFINITY;
    return Math.abs(bounds.top + bounds.height / 2 - (parent.top + parent.height / 2));
  })).toBeLessThanOrEqual(1);
  await expect(page.locator("#toggleBacklog")).toBeEnabled();
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
  expect(width / viewportWidth).toBeGreaterThan(.55);
  expect(width / viewportWidth).toBeLessThan(.65);
  await expect(page.locator("#taskEditorMarkdown")).not.toHaveValue(/\n$/);
  await page.locator("#taskEditorTitle").fill("Edited Task");
  await page.locator("#taskEditorMarkdown").fill("**Next**\n- [ ] added todo\n\n#Info\nEdited content\n\n#Warn\nReview this task");
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

test("Escape ends field editing before cancelling feature and task dialogs", async ({ page }) => {
  await openFixture(page);
  const featureHeading = page.locator(".release-heading").first();
  await openFeatureActions(featureHeading.locator(".."));
  await featureHeading.locator('[data-edit="feature"]').click();
  await page.locator("#featureEditorTitle").fill("Discarded feature");
  await page.keyboard.press("Escape");
  await expect(page.locator("#featureEditor")).toBeVisible();
  await expect(page.locator("#featureEditorTitle")).not.toBeFocused();
  await expect(page.locator("#featureEditorTitle")).toHaveValue("Discarded feature");
  await page.keyboard.press("Escape");
  await expect(page.locator("#featureEditor")).not.toBeVisible();
  await expect(featureHeading.locator(".release-title")).toHaveText("Active Feature");

  const taskHeader = page.locator(".card-header").first();
  await taskHeader.hover();
  await taskHeader.locator('[data-edit="task"]').click();
  await page.locator("#taskEditorTitle").fill("Discarded task");
  await page.locator("#taskEditorMarkdown").fill("Discarded Markdown");
  await page.keyboard.press("Escape");
  await expect(page.locator("#taskEditor")).toBeVisible();
  await expect(page.locator("#taskEditorMarkdown")).not.toBeFocused();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("Discarded task");
  await expect(page.locator("#taskMarkdownToolbar").getByRole("button", { name: "Bold" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#taskEditor")).not.toBeVisible();
  await expect(taskHeader.locator(".card-title")).toHaveText("Started Task");
  await expect.poll(() => page.evaluate(() => ({ active: document.activeElement?.tagName, selection: window.getSelection()?.toString() }))).toEqual({ active: "BODY", selection: "" });
});

test("dragging a Markdown selection beyond the dialog does not cancel editing", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await page.locator("#taskEditorMarkdown").dispatchEvent("pointerdown", { bubbles: true, button: 0 });
  await page.locator("#taskEditor").dispatchEvent("pointerup", { bubbles: true, button: 0 });
  await page.locator("#taskEditor").dispatchEvent("click", { bubbles: true, button: 0 });
  await expect(page.locator("#taskEditor")).toBeVisible();
  await page.locator("#taskEditor").dispatchEvent("pointerdown", { bubbles: true, button: 0 });
  await expect(page.locator("#taskEditor")).toBeHidden();
});

test("backlog opens as a separate pane and closes from its framed button", async ({ page }) => {
  await openFixture(page);
  await toggleBacklogFromView(page);
  await expect(page.locator("#backlog")).toBeVisible();
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#viewOptions")).toBeVisible();
  expect(await page.locator("#toggleBacklog").evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest("#toggleBacklog") === node;
  })).toBe(true);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator(".backlog-title")).toHaveText("Later");
  const backlogPane = page.locator(".backlog-pane");
  await expect(backlogPane).toHaveCSS("border-left-width", "0px");
  const backlogEdgeOffsets = async () => {
    const viewBounds = await page.locator(".view-mode").boundingBox();
    const paneBounds = await backlogPane.boundingBox();
    const viewport = page.viewportSize();
    return {
      left: Math.abs(viewBounds.x - paneBounds.x),
      right: Math.abs(viewport.width - (paneBounds.x + paneBounds.width))
    };
  };
  await expect.poll(async () => (await backlogEdgeOffsets()).left).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await backlogEdgeOffsets()).right).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(async () => (await backlogEdgeOffsets()).left).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await backlogEdgeOffsets()).right).toBeLessThanOrEqual(1);
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

test("last Workspace feature remains reachable while Backlog is visible", async ({ page }) => {
  const features = Array.from({ length: 5 }, (_, index) => `## Feature ${index + 1}\n### Task ${index + 1}\n- [ ] pending`).join("\n\n");
  await page.setViewportSize({ width: 1000, height: 720 });
  await openFixture(page, `# Wide Project\n\n${features}\n\n#Backlog\n## Later\n### Deferred Task\n- [ ] someday`);
  await toggleBacklogFromView(page);

  const content = page.locator("#content");
  await content.evaluate(node => { node.scrollLeft = node.scrollWidth; });

  const maximumScrollLeft = await content.evaluate(node => node.scrollLeft);
  await content.evaluate(node => { node.scrollLeft += 100; });
  await expect.poll(() => content.evaluate(node => node.scrollLeft)).toBe(maximumScrollLeft);
  await expect.poll(async () => {
    const lastFeature = await content.locator(":scope > .release").last().boundingBox();
    const backlog = await page.locator(".backlog-pane").boundingBox();
    return backlog.x - (lastFeature.x + lastFeature.width);
  }).toBeGreaterThanOrEqual(11);
});

test("an empty Archive uses the centered shared empty-state message", async ({ page }) => {
  await page.goto(appUrl);
  const recentEmptyStyle = await page.locator(".recent-files-empty").evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, padding: style.padding };
  });
  await openFixture(page);
  await toggleArchiveFromView(page);
  const archiveContent = page.locator("#archive .archive-content");
  const empty = archiveContent.locator(".archive-empty");
  const message = empty.locator(".recent-files-empty");
  await expect(message).toHaveText("No archived features yet.");
  expect(await message.evaluate(node => {
    const style = getComputedStyle(node);
    return { color: style.color, fontSize: style.fontSize, padding: style.padding };
  })).toEqual(recentEmptyStyle);
  expect(await empty.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const parent = node.closest(".archive-swimlane-list-empty")?.getBoundingClientRect();
    if (!parent) return Number.POSITIVE_INFINITY;
    return Math.abs(bounds.top + bounds.height / 2 - (parent.top + parent.height / 2));
  })).toBeLessThanOrEqual(1);
  await expect(page.locator("#archive .archive-range")).toHaveCount(0);
});

test("Archive renders one chronological Date swimlane per dated feature and separates unmatched metadata", async ({ page }) => {
  await openFixture(page, swimlaneFixture);
  await toggleArchiveFromView(page);
  await settleLayout(page);

  const archive = page.locator("#archive");
  await expect(archive.locator(".archive-title")).toHaveText("Archive");
  await expect(archive.locator(".archive-count")).toHaveText("3 Features");
  await expect(archive.locator(".archive-range")).toHaveText("01.01.2026 – 07.02.2026");
  await expect(archive.locator(".archive-swimlane-feature .archive-feature-title")).toHaveText(["Early feature", "Later feature"]);
  await expect(archive.locator(".archive-swimlane-version")).toHaveText(["v2.1.0", "v3.2.1"]);
  expect(await archive.locator(".archive-swimlane-label").evaluateAll(labels => labels.every(label => !label.textContent.includes("01.01.26")))).toBe(true);
  await expect(archive.locator(".archive-date-unmatched h3")).toHaveText("Without date");
  await expect(archive.locator(".archive-date-unmatched .archive-feature-title")).toHaveText("Missing metadata");
  await expect(archive.locator(".archive-date-unmatched .archive-feature-version")).toHaveText("v9.0.0");
  await expect(archive.locator(".archive-active-segment")).toHaveCount(3);
  await expect(archive.locator(".archive-date-point")).toHaveCount(1);
  await expect(archive.locator(".archive-pause-segment")).toHaveCount(2);
  await expect(archive.locator(".archive-pause-segment .archive-object-label")).toHaveText(["6 days", "2 days"]);
  await expect(archive.locator(".archive-swimlane-label").first()).toHaveAccessibleName(/Early feature\. 01\.01\.2026 to 03\.01\.2026; 10\.01\.2026 to 12\.01\.2026; 15\.01\.2026; 6 days pause; 2 days pause\./);
  await expect(archive.locator("[data-archive-order],.archive-order,.archive-version-timeline,.archive-feature-details")).toHaveCount(0);
  await expect(archive.locator(".archive-active-segment[title],.archive-pause-segment[title],.archive-date-point[title]")).toHaveCount(0);

  const rowHeights = await archive.locator(".archive-swimlane-feature").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(new Set(rowHeights).size).toBe(1);
  expect(rowHeights[0]).toBe(52);
  await expect(archive.locator(".archive-active-segment").first()).toHaveCSS("height", "24px");
  await expect(archive.locator(".archive-pause-segment").first()).toHaveCSS("height", "24px");
  await expectCentered(archive.locator(".archive-axis-corner"), archive.locator(".archive-axis-summary"), "vertical");
  expect(await archive.locator(".archive-swimlane-list").evaluate((list, unmatched) => list.getBoundingClientRect().bottom <= unmatched.getBoundingClientRect().top, await archive.locator(".archive-date-unmatched").elementHandle())).toBe(true);
});

test("Archive object hover is stationary, centered, and theme-consistent", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openFixture(page, swimlaneFixture);
  await toggleArchiveFromView(page);
  await settleLayout(page);

  for (const theme of ["dark", "light"]) {
    await setVisualTheme(page, /** @type {"dark" | "light"} */ (theme));
    const range = page.locator("#archive .archive-active-segment").first();
    const rangeLabel = range.locator(".archive-object-label");
    const rangeBefore = await range.boundingBox();
    const backgroundBefore = await range.evaluate(node => getComputedStyle(node).backgroundImage);
    await range.hover();
    const rangeAfter = await range.boundingBox();
    expect(rangeAfter).toEqual(rangeBefore);
    await expect(rangeLabel).toHaveCSS("opacity", "1");
    expect(await range.evaluate((node, label) => {
      const object = node.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      return Math.abs(object.left + object.width / 2 - (text.left + text.width / 2));
    }, await rangeLabel.elementHandle())).toBeLessThanOrEqual(0.1);
    expect(await range.evaluate(node => getComputedStyle(node).backgroundImage)).not.toBe(backgroundBefore);

    const dot = page.locator("#archive .archive-date-point");
    const dotBefore = await dot.evaluate(node => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, background: style.backgroundColor, border: style.borderTopColor };
    });
    await dot.hover();
    const dotAfter = await dot.evaluate(node => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, background: style.backgroundColor, border: style.borderTopColor };
    });
    expect({ x: dotAfter.x, y: dotAfter.y, width: dotAfter.width, height: dotAfter.height }).toEqual({ x: dotBefore.x, y: dotBefore.y, width: dotBefore.width, height: dotBefore.height });
    expect(dotAfter.background).toBe(dotBefore.background);
    expect(dotAfter.border).not.toBe(dotBefore.border);
    await expect(dot.locator(".archive-object-label")).toHaveCSS("opacity", "1");

    const pause = page.locator("#archive .archive-pause-segment").first();
    await pause.hover();
    await expect(pause.locator(".archive-object-label")).toHaveCSS("opacity", "1");
  }
});

test("Archive feature popover owns one expanded anchor, closes globally, and stays in the viewport", async ({ page }) => {
  await openFixture(page, swimlaneFixture);
  await toggleArchiveFromView(page);
  const toggles = page.locator("#archive .archive-swimlane-label");
  const popover = page.locator("#archiveFeaturePopover");

  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
  const anchoredFeature = page.locator("#archive .archive-swimlane-feature").first();
  const featureBounds = await anchoredFeature.boundingBox();
  await toggles.first().click();
  await expect(popover).toBeVisible();
  await expect(popover).toBeFocused();
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "true");
  await expect(popover.locator("h3")).toHaveText("Early feature");
  await expect(popover.locator(".archive-popover-version")).toHaveText("v2.1.0");
  await expect(popover.locator(".archive-popover-dates > span")).toHaveText(["01.01.26 – 03.01.26", "10.01.2026 – 12.01.2026", "15.01.2026"]);
  await expect(popover.locator(".archive-popover-tasks li")).toHaveText(["First task", "Second task"]);
  await expect(popover.locator(".archive-popover-unarchive")).toHaveCSS("border-top-width", "2px");
  await page.locator("#archive .archive-swimlane-plot").first().hover();
  expect(await anchoredFeature.boundingBox()).toEqual(featureBounds);

  await toggles.nth(1).click();
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(popover.locator("h3")).toHaveText("Later feature");
  await page.locator("#projectTitle").click();
  await expect(popover).toBeHidden();
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");

  await toggles.first().click();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(toggles.first()).toBeFocused();

  await page.setViewportSize({ width: 500, height: 240 });
  await toggles.first().click();
  await expect.poll(async () => popover.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
  })).toBe(true);
  // The clamp is what the tiny viewport is for. Switching views is driven back at a supported size,
  // because the application header itself overlaps below roughly 900px and is not a target width.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("#showWorkspaceView").click();
  await page.locator("#showArchiveView").click();
  await expect(popover).toBeHidden();
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");
});

test("Archive header, feature column, and shared grids stay aligned through two-axis scroll and resize", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await openFixture(page, largeArchiveFixture(48));
  await toggleArchiveFromView(page);
  await settleLayout(page);
  const content = page.locator("#archive > .archive-content");
  const axis = page.locator("#archive .archive-date-axis");
  const firstLabel = page.locator("#archive .archive-swimlane-label").first();
  const timeline = page.locator("#archive .archive-date-timeline");

  expect(await content.evaluate(node => node.scrollHeight > node.clientHeight && node.scrollWidth > node.clientWidth)).toBe(true);
  await expect(axis).toHaveCSS("position", "sticky");
  await expect(axis).toHaveCSS("box-shadow", "none");
  const initial = await page.evaluate(() => ({
    axisTop: document.querySelector(".archive-date-axis").getBoundingClientRect().top,
    labelLeft: document.querySelector(".archive-swimlane-label").getBoundingClientRect().left,
    scrollportTop: document.querySelector("#archive > .archive-content").getBoundingClientRect().top
  }));
  // The header is fixed: it carries the inset above the table as its own padding, so it starts
  // pinned and never travels. Nothing may appear in the strip between the application bar and it.
  const laneAboveAxis = () => page.evaluate(() => {
    const axis = document.querySelector(".archive-date-axis").getBoundingClientRect();
    const port = document.querySelector("#archive > .archive-content").getBoundingClientRect();
    if (axis.top - port.top < 1) return false;
    const probe = document.elementsFromPoint(port.left + port.width / 2, (port.top + axis.top) / 2);
    return probe.some(node => node.closest(".archive-swimlane-rows"));
  });
  expect(initial.axisTop).toBeCloseTo(initial.scrollportTop, 5);
  for (const offset of [1, 6, 12, 300]) {
    await content.evaluate((node, top) => { node.scrollTop = top; node.scrollLeft = 80; }, offset);
    await expect.poll(() => axis.evaluate(node => node.getBoundingClientRect().top)).toBeCloseTo(initial.axisTop, 5);
    await expect.poll(laneAboveAxis).toBe(false);
  }
  await expect.poll(() => firstLabel.evaluate(node => node.getBoundingClientRect().left)).toBeCloseTo(initial.labelLeft, 5);

  const grid = await timeline.evaluate(node => {
    const xValues = (/** @type {string} */ selector) => [...(node.querySelector(selector)?.getAttribute("d")?.matchAll(/M([\d.]+)/g) || [])].map(match => Number(match[1]));
    const plot = node.querySelector(".archive-axis-plot").getBoundingClientRect();
    const lanePlot = node.querySelector(".archive-swimlane-plot").getBoundingClientRect();
    const rows = node.querySelector(".archive-swimlane-rows").getBoundingClientRect();
    const bodyGrid = node.querySelector(".archive-date-grid:not(.archive-edge-overlay)").getBoundingClientRect();
    const endpointX = [...node.querySelectorAll(".archive-grid-path-endpoint")].map(path => Number(path.getAttribute("d")?.match(/M([\d.]+)/)?.[1]));
    const headerMinor = node.querySelector(".archive-axis-grid .archive-grid-path-minor");
    const bodyMinor = node.querySelector(".archive-date-grid:not(.archive-edge-overlay) .archive-grid-path-minor");
    const axisLine = node.querySelector(".archive-axis-grid .archive-axis-line");
    return {
      headerMinor: xValues(".archive-axis-grid .archive-grid-path-minor"),
      bodyMinor: xValues(".archive-date-grid:not(.archive-edge-overlay) .archive-grid-path-minor"),
      headerMajor: xValues(".archive-axis-grid .archive-grid-path-major"),
      bodyMajor: xValues(".archive-date-grid:not(.archive-edge-overlay) .archive-grid-path-major"),
      endpointX,
      gridTopDifference: Math.abs(rows.top - bodyGrid.top),
      gridBottomDifference: Math.abs(rows.bottom - bodyGrid.bottom),
      // The header stubs hang off the rule and wear its colour; the body grid stays recessive.
      minorStrokeMatchesRule: getComputedStyle(headerMinor).stroke === getComputedStyle(axisLine).stroke,
      minorStrokeSeparatesFromBody: getComputedStyle(headerMinor).stroke !== getComputedStyle(bodyMinor).stroke,
      rightDifference: Math.abs(plot.right - lanePlot.right),
      signature: node.dataset.archiveDateLayout
    };
  });
  expect(grid.headerMinor).toEqual(grid.bodyMinor);
  expect(grid.headerMajor).toEqual(grid.bodyMajor);
  expect(grid.endpointX).toHaveLength(2);
  expect(grid.endpointX.every(value => value >= 0 && value < 2)).toBe(true);
  expect(grid.gridTopDifference).toBeLessThanOrEqual(0.1);
  expect(grid.gridBottomDifference).toBeLessThanOrEqual(0.1);
  expect(grid.minorStrokeMatchesRule).toBe(true);
  expect(grid.minorStrokeSeparatesFromBody).toBe(true);
  expect(grid.rightDifference).toBeLessThanOrEqual(0.1);
  expect(grid.signature).toBeTruthy();

  await content.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await expect(content).not.toHaveClass(/archive-can-scroll-right/);
  await page.setViewportSize({ width: 1300, height: 650 });
  await settleLayout(page);
  await expect.poll(() => timeline.getAttribute("data-archive-date-layout")).not.toBe(grid.signature);
});

test("a large Archive keeps shared calendar DOM bounded per lane", async ({ page }) => {
  await openFixture(page, largeArchiveFixture(300));
  await toggleArchiveFromView(page);
  await settleLayout(page);

  await expect(page.locator("#archive .archive-swimlane-feature")).toHaveCount(300);
  await expect(page.locator("#archive .archive-lane-baseline")).toHaveCount(300);
  await expect(page.locator("#archive .archive-date-point")).toHaveCount(300);
  await expect(page.locator("#archive .archive-axis-grid")).toHaveCount(1);
  await expect(page.locator("#archive .archive-date-grid")).toHaveCount(2);
  expect(await page.locator("#archive *").count()).toBeLessThan(5000);
  await expect(page.locator("#archive .archive-date-timeline")).toHaveAttribute("data-archive-date-layout", /.+/);
});

test("Archive scrolling appears only for overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  await openFixture(page, "# Short Archive\n\n#Archive\n# Releases\n\n## Release\n#Date\n- 01.01.2024\n### Task\n- [x] ~done~");
  await toggleArchiveFromView(page);
  const archive = page.locator("#archive");
  const content = archive.locator(":scope > .archive-content");
  expect(await content.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await expect(content).toHaveCSS("overflow-y", "auto");
});

test("incomplete features cannot be archived from their Workspace action", async ({ page }) => {
  await openFixture(page);
  const openFeature = page.locator("#content > .release").nth(1);
  await openFeatureActions(openFeature);
  await openFeature.locator('[data-feature-action="archive"]').click();
  await expect(page.locator(".notification-title").last()).toHaveText("Feature not archived");
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Active Feature", "Open Feature"]);
});

test("complete features move to Archive and can be returned to Workspace with undo", async ({ page }) => {
  await openFixture(page, "# Archive Test\n\n## Spacer Feature\n### Open Task\n- [ ] open\n\n## Complete Feature\n### Done Task\n- [x] ~done~\n\n#Backlog\n## Later");
  const completeFeature = page.locator("#content > .release").nth(1);
  await openFeatureActions(completeFeature);
  await completeFeature.locator('[data-feature-action="archive"]').click();
  await expect(page.locator(".notification-title").last()).toHaveText("Feature archived");
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Spacer Feature"]);
  await page.keyboard.press("a");
  const archive = page.locator("#archive");
  await expect(archive.locator(".archive-feature-title")).toHaveText("Complete Feature");
  await archive.locator(".archive-feature-toggle").click();
  await archive.locator(".archive-popover-unarchive").click();
  await expect(page.locator(".notification-title").last()).toHaveText("Feature unarchived");
  await expect(page.locator(".notification-body").last()).toHaveText("Complete Feature moved to Workspace.");
  await page.keyboard.press("w");
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Complete Feature", "Spacer Feature"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#archive")).toBeVisible();
  await expect(page.locator("#archive .archive-feature-title")).toHaveText("Complete Feature");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#archive .archive-feature-title")).toHaveCount(0);
  await page.keyboard.press("w");
  await expect(page.locator("#content > .release .release-title")).toHaveText(["Complete Feature", "Spacer Feature"]);
});

test("statistics can close and reopen in Workspace and are unavailable in Archive", async ({ page }) => {
  await openFixture(page);
  const stats = page.locator("#projectStats");
  const content = page.locator("#content");
  const firstRelease = page.locator("#content > .release").first();
  await expect(stats).toBeVisible();
  await expect(stats).toHaveCSS("width", "360px");
  await expect(stats.locator("thead th")).toHaveText(["", "Archive", "Done", "Active", "Open", "Backlog"]);
  await expect(stats.locator(".archive-stat").first()).toHaveCSS("color", "rgb(131, 165, 152)");
  await expect(stats).toHaveCSS("border-top-width", "0px");
  expect(await stats.evaluate(node => getComputedStyle(node, "::before").content)).toBe("none");
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
  await expect(stats).toBeVisible();
  await expect(stats).toHaveCSS("width", "360px");
  await expect(stats.locator("td").first()).toHaveCSS("font-size", "12px");
  await expect.poll(() => stats.evaluate(node => node.getBoundingClientRect().bottom)).toBe(page.viewportSize().height - 12);
  await expect.poll(async () => (await stats.boundingBox()).x).toBe((await firstRelease.boundingBox()).x);
  await page.keyboard.press("a");
  await expect(stats).toBeHidden();
  await expect(page.locator("#toggleStats")).toBeHidden();
});

test("Workspace zoom changes only feature-card width and stays available across view rerenders", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const zoomFixture = fixture.replace("\n#Backlog", "\n\n## Third Feature\n### Third Task\n- [ ] pending\n\n## Fourth Feature\n### Fourth Task\n- [ ] pending\n\n## Fifth Feature\n### Fifth Task\n- [ ] pending\n\n#Backlog");
  await openFixture(page, `${zoomFixture}\n\n#Archive\n# Archive\n\n## Archived Feature\n#Date\n- 2025-01-01\n### Done\n- [x] ~done~`);
  const zoom = page.locator("#workspaceZoom");
  const button = page.locator("#toggleWorkspaceZoom");
  const sliderPanel = page.locator("#workspaceZoomSlider");
  const slider = page.locator("#featureWidth");
  const releases = page.locator("#content > .release");
  const stats = page.locator("#projectStats");
  const content = page.locator("#content");
  const anchoredRelease = releases.nth(2);

  await expect(zoom).toBeVisible();
  await expect(button).toHaveAccessibleName("Feature card zoom: 100%");
  await expect(button.locator("use")).toHaveAttribute("href", "#icon-zoom");
  await expect(button).not.toHaveAttribute("data-tooltip");
  await expect(button).toHaveCSS("border-top-width", "0px");
  await expect(page.locator("#featureZoomValue")).toHaveText("100%");
  await expect(releases.first()).toHaveCSS("width", "380px");
  await expect(slider).toBeHidden();

  await button.hover();
  await expect(slider).toBeHidden();
  await button.focus();
  await expect(slider).toBeHidden();
  await button.press("Enter");
  await expect(slider).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(slider).toBeHidden();
  await button.click();
  await expect(slider).toBeVisible();
  await expect(slider).toBeFocused();
  await expect(sliderPanel).toHaveCSS("border-top-width", "0px");
  await expect(sliderPanel.locator(".workspace-zoom-stops > span")).toHaveCount(3);
  await expect(sliderPanel.locator(".workspace-zoom-stops")).toBeVisible();
  const readStopColors = () => sliderPanel.locator(".workspace-zoom-stops > span").evaluateAll(stops => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolveColor = (/** @type {string} */ variable) => {
      probe.style.backgroundColor = `var(${variable})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const colors = {
      stops: stops.map(stop => getComputedStyle(stop).backgroundColor),
      reached: resolveColor("--link"),
      remaining: resolveColor("--border")
    };
    probe.remove();
    return colors;
  });
  let stopColors = await readStopColors();
  expect(stopColors.stops).toEqual([stopColors.reached, stopColors.remaining, stopColors.remaining]);

  // The thumb centre rests half a thumb width in from each track edge, so the stop marking a step
  // has to sit there too. Laying the stops out by their own edges would offset the outer two by
  // half a stop and the thumb would visibly miss them.
  await sliderPanel.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  const stopGeometry = await page.locator(".workspace-zoom-track").evaluate(node => {
    const trackBounds = node.getBoundingClientRect();
    return {
      trackWidth: trackBounds.width,
      centers: [...node.querySelectorAll(".workspace-zoom-stops > span")].map(stop => {
        const bounds = stop.getBoundingClientRect();
        return bounds.left + bounds.width / 2 - trackBounds.left;
      })
    };
  });
  const thumbRadius = 8;
  const stopTargets = [thumbRadius, stopGeometry.trackWidth / 2, stopGeometry.trackWidth - thumbRadius];
  stopGeometry.centers.forEach((center, index) => expect(center, `stop ${index} sits on its thumb centre`).toBeCloseTo(stopTargets[index], 1));

  await anchoredRelease.evaluate(node => {
    const content = document.getElementById("content");
    const featureBounds = node.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    content.scrollLeft += featureBounds.left + featureBounds.width / 2 - (contentBounds.left + contentBounds.width / 2);
  });
  await settleLayout(page);
  const anchoredCenter = await anchoredRelease.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left + bounds.width / 2;
  });
  const viewportCenter = await content.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left + bounds.width / 2;
  });
  expect(Math.abs(anchoredCenter - viewportCenter)).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    window.MDManager.files.remember = async (/** @type {unknown} */ _handle, /** @type {string} */ _title, /** @type {number} */ width) => { window.__rememberedFeatureWidth = width; };
  });
  await page.evaluate(({ featureIndex, expectedCenter }) => {
    window.__zoomAnchorDeltas = [];
    document.getElementById("featureWidth").addEventListener("input", () => {
      const release = document.querySelectorAll("#content > .release")[featureIndex];
      const deadline = performance.now() + 260;
      const sample = (/** @type {number} */ timestamp) => {
        const bounds = release.getBoundingClientRect();
        window.__zoomAnchorDeltas.push(Math.abs(bounds.left + bounds.width / 2 - expectedCenter));
        if (timestamp < deadline) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true });
  }, { featureIndex: 2, expectedCenter: anchoredCenter });
  await slider.press("ArrowRight");
  await expect(page.locator("#featureZoomValue")).toHaveText("120%");
  await expect(slider).toHaveAttribute("aria-valuetext", "120%, 460 pixels");
  await expect(releases.first()).toHaveCSS("width", "460px");
  stopColors = await readStopColors();
  expect(stopColors.stops).toEqual([stopColors.reached, stopColors.reached, stopColors.remaining]);
  await expect.poll(() => anchoredRelease.evaluate((node, expectedCenter) => {
    const bounds = node.getBoundingClientRect();
    return Math.abs(bounds.left + bounds.width / 2 - expectedCenter);
  }, anchoredCenter)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.__zoomAnchorDeltas.length)).toBeGreaterThan(3);
  expect(await page.evaluate(() => Math.max(...window.__zoomAnchorDeltas))).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.__rememberedFeatureWidth)).toBe(460);
  await expect(stats).toHaveCSS("width", "360px");
  await expect(page.locator("#saveFile")).not.toHaveClass(/dirty/);

  await toggleBacklogFromView(page);
  const backlogWidth = await page.locator("#backlog").evaluate(node => node.getBoundingClientRect().width);
  await slider.evaluate(input => {
    const range = /** @type {HTMLInputElement} */ (input);
    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#featureZoomValue")).toHaveText("140%");
  await expect(releases.first()).toHaveCSS("width", "540px");
  stopColors = await readStopColors();
  expect(stopColors.stops).toEqual([stopColors.reached, stopColors.reached, stopColors.reached]);
  // Layout widths are fractional, so the claim is that the backlog did not resize, not that two
  // floating point measurements match bit for bit.
  await expect.poll(() => page.locator("#backlog").evaluate(node => node.getBoundingClientRect().width)).toBeCloseTo(backlogWidth, 1);

  await page.keyboard.press("a");
  await expect(zoom).toBeHidden();
  await page.keyboard.press("w");
  await expect(zoom).toBeVisible();
  await expect(page.locator("#featureZoomValue")).toHaveText("140%");
  await expect(releases.first()).toHaveCSS("width", "540px");
});

test("Workspace zoom holds the spot under the viewport centre from any scroll position", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const zoomFixture = `# Test Project\n\n${Array.from({ length: 12 }, (_, index) => `## Feature ${index}\n### Task ${index}\n- [ ] pending`).join("\n\n")}\n\n#Backlog\n## Later\n### Deferred Task\n- [ ] someday`;
  await openFixture(page, zoomFixture);
  await page.locator("#toggleWorkspaceZoom").click();
  await expect(page.locator("#featureWidth")).toBeVisible();
  await settleLayout(page);

  // A centred card is the one position a card-centre anchor also gets right, so the offsets below
  // park the viewport centre inside a card and in the gap between two instead.
  for (const offset of [-190, -120, -20, 60, 190, 220]) {
    const displacement = await page.evaluate(async shift => {
      const content = document.getElementById("content");
      const slider = /** @type {HTMLInputElement} */ (document.getElementById("featureWidth"));
      slider.value = "0";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 400));

      const contentBounds = content.getBoundingClientRect();
      const viewportCenter = (contentBounds.left + contentBounds.right) / 2;
      const releases = () => /** @type {HTMLElement[]} */ ([...content.querySelectorAll(":scope > .release")]);
      const middle = releases()[5].getBoundingClientRect();
      content.scrollLeft += middle.left + middle.width / 2 - viewportCenter + shift;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const rects = releases().map(release => release.getBoundingClientRect());
      const covering = rects.findIndex(rect => rect.left <= viewportCenter && viewportCenter <= rect.right);
      const index = covering < 0 ? rects.findIndex(rect => rect.left > viewportCenter) : covering;
      const fraction = covering < 0 ? 0 : (viewportCenter - rects[index].left) / rects[index].width;

      slider.value = "1";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 700));

      const moved = releases()[index].getBoundingClientRect();
      return Math.abs(moved.left + fraction * moved.width - viewportCenter);
    }, offset);
    expect(displacement, `offset ${offset} keeps the centred spot in place`).toBeLessThanOrEqual(1);
  }
});

test("the reserved scrollbar gutter is published instead of assumed", async ({ page }) => {
  await openFixture(page, `${fixture}\n\n#Archive\n# Archive\n\n## Shipped\n#Date\n- 15.01.2024\n### Done task\n- [x] ~detail~`);
  const gutter = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow-y:auto;scrollbar-gutter:stable;visibility:hidden";
    document.body.appendChild(probe);
    const reserved = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return {
      reserved,
      published: getComputedStyle(document.documentElement).getPropertyValue("--scrollbar-size").trim()
    };
  });
  expect(gutter.published).toBe(`${gutter.reserved}px`);
});

test("Archive round-trips preserve open and closed Workspace panels", async ({ page }) => {
  await openFixture(page);
  const backlog = page.locator("#backlog");
  const stats = page.locator("#projectStats");
  await toggleBacklogFromView(page);
  await expect(backlog).toBeVisible();
  await expect(stats).toBeVisible();

  await page.keyboard.press("a");
  await expect(backlog).toBeHidden();
  await expect(stats).toBeHidden();
  await page.keyboard.press("w");
  await expect(backlog).toBeVisible();
  await expect(stats).toBeVisible();

  await toggleBacklogFromView(page);
  await page.locator(".stats-close").click();
  await expect(backlog).toBeHidden();
  await expect(stats).toBeHidden();
  await page.keyboard.press("a");
  await page.keyboard.press("w");
  await expect(backlog).toBeHidden();
  await expect(stats).toBeHidden();
});

test("Feature drag cursor appears only after holding or dragging the header", async ({ page }) => {
  await openFixture(page);
  const featureHeader = page.locator(".release-header").first();
  const taskHeader = page.locator(".card-header").first();
  const featureBounds = await featureHeader.boundingBox();
  if (!featureBounds) throw new Error("Feature header has no bounds");
  await page.mouse.move(featureBounds.x + featureBounds.width / 2, featureBounds.y + featureBounds.height / 2);
  await page.mouse.down();
  await expect(featureHeader).toHaveCSS("cursor", "pointer");
  await page.mouse.up();
  await expect(featureHeader).toHaveCSS("cursor", "pointer");

  await page.mouse.down();
  await expect(featureHeader).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(featureHeader).toHaveCSS("cursor", "pointer");

  const taskBounds = await taskHeader.boundingBox();
  if (!taskBounds) throw new Error("Task header has no bounds");
  await page.mouse.move(taskBounds.x + taskBounds.width / 2, taskBounds.y + taskBounds.height / 2);
  await page.mouse.down();
  await expect(taskHeader).toHaveCSS("cursor", "pointer");
  await page.mouse.up();
});

test("clock is app-only, centered, and controlled from View", async ({ page }) => {
  await page.goto(appUrl);
  const clock = page.locator("#appClock");
  await expect(clock).toBeHidden();
  await openFixture(page);
  await expect(clock).toBeVisible();
  await expect(clock).toHaveCSS("height", "32px");
  await expect(clock).toHaveCSS("border-top-width", "0px");
  expect(await clock.evaluate(node => getComputedStyle(node, "::before").content)).toBe("none");
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
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(clock).toBeHidden();
  await page.setViewportSize({ width: 800, height: 900 });
  for (const control of ["#addFeature", "#undoChange", "#redoChange", "#saveFile", "#showWorkspaceView", "#showArchiveView", "#toggleHelp", "#toggleSounds", "#toggleTheme", "#toggleViewMenu"]) {
    await expect(page.locator(control)).toBeVisible();
  }
  await page.setViewportSize({ width: 1001, height: 900 });
  await expect(clock).toBeVisible();
});

test("notifications keep errors actionable while transient severities disappear automatically", async ({ page }) => {
  await openFixture(page);
  await page.locator("#notifications").evaluate(node => node.replaceChildren());
  const notifications = page.locator(".notification");
  await page.evaluate(() => {
    window.MDManager.notifications.show("info", "Information", "Operation completed.");
    window.MDManager.notifications.show("warning", "Warning", "Operation needs attention.");
    window.MDManager.notifications.show("error", "Application", "Operation failed.");
  });
  await expect(notifications).toHaveCount(3);
  await expect(notifications.nth(0).locator(".notification-tag")).toHaveText("Info");
  await expect(notifications.nth(1).locator(".notification-tag")).toHaveText("Warning");
  await expect(notifications.nth(2).locator(".notification-tag")).toHaveText("Error");
  await expect(notifications.nth(0)).toHaveCSS("width", "280px");
  await expect(notifications.nth(0)).toHaveCSS("height", "88px");

  const longMessage = "UnbrokenDiagnostic".repeat(40);
  await page.evaluate(message => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (/** @type {string} */ value) => { window.__copiedError = value; } }
    });
    window.MDManager.notifications.show("error", "Long error", "The operation failed.", undefined, message, "MDM-999");
  }, longMessage);
  const longNotification = notifications.last();
  await expect(longNotification.locator(".notification-text")).toHaveText("The operation failed.");
  await expect(longNotification.locator(".notification-copy-note")).toHaveText("Extended details can be copied with the clipboard button.");
  await expect(longNotification.locator(".notification-body")).not.toContainText("UnbrokenDiagnostic");
  const errorActions = longNotification.locator(".notification-action");
  await expect(errorActions).toHaveCount(2);
  const copyError = longNotification.locator(".notification-copy-action");
  const closeError = longNotification.getByRole("button", { name: "Close error" });
  await expect(closeError).toBeVisible();
  await expect(copyError).toHaveCSS("width", "24px");
  await expect(copyError).toHaveCSS("height", "24px");
  await expect(copyError).toHaveCSS("border-top-width", "0px");
  await copyError.click();
  await expect.poll(() => page.evaluate(() => window.__copiedError)).toBe(`Error: Code MDM-999 Long error\nDetails: ${longMessage}`);
  await expect(copyError.locator("use")).toHaveAttribute("href", "#icon-check");
  await expect(copyError).toHaveAttribute("data-tooltip", "Copied");

  const longLayout = await longNotification.evaluate(notification => {
    const body = notification.querySelector(".notification-body");
    const notificationBounds = notification.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    const messageBounds = notification.querySelector(".notification-message").getBoundingClientRect();
    const copyBounds = notification.querySelector(".notification-copy-action").getBoundingClientRect();
    const closeBounds = notification.querySelector('[aria-label="Close error"]').getBoundingClientRect();
    return {
      height: notificationBounds.height,
      contained: bodyBounds.bottom <= notificationBounds.bottom,
      horizontalOverflow: body.scrollWidth > body.clientWidth,
      copyCentered: Math.abs((copyBounds.top + copyBounds.bottom) / 2 - (messageBounds.top + messageBounds.bottom) / 2),
      actionsRightDifference: Math.abs(copyBounds.right - closeBounds.right)
    };
  });
  expect(longLayout.height).toBeGreaterThanOrEqual(88);
  expect(longLayout.height).toBeLessThanOrEqual(144);
  expect(longLayout.contained).toBe(true);
  expect(longLayout.horizontalOverflow).toBe(false);
  expect(longLayout.copyCentered).toBeLessThanOrEqual(1);
  expect(longLayout.actionsRightDifference).toBeLessThanOrEqual(1);

  await toggleBacklogFromView(page);
  await expect(notifications.nth(0)).toHaveCSS("transform", "none");
  await expect(page.locator("#backlog")).toHaveCSS("transform", "none");
  const accentBars = await page.locator(".backlog-header, .notification-info").evaluateAll(nodes => nodes.map(node => {
    const bounds = node.getBoundingClientRect();
    const accent = getComputedStyle(node, "::before");
    return { elementWidth: bounds.width, barWidth: Number.parseFloat(accent.width), barHeight: Number.parseFloat(accent.height), color: accent.backgroundColor };
  }));
  for (const accent of accentBars) {
    expect(accent.barHeight).toBe(2);
    expect(Math.round(Math.abs(accent.elementWidth - accent.barWidth))).toBeLessThanOrEqual(2);
  }
  expect(accentBars.map(accent => accent.color)).toEqual(["rgb(211, 134, 155)", "rgb(131, 165, 152)"]);
  const positions = await notifications.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
  expect(positions[0]).toBeLessThan(positions[1]);
  await page.evaluate(() => {
    const clearTimeout = window.clearTimeout;
    window.__clearedNotificationTimers = 0;
    window.clearTimeout = timer => {
      window.__clearedNotificationTimers += 1;
      clearTimeout(timer);
    };
    for (let index = 0; index < 20; index += 1) window.MDManager.notifications.show("info", `Rapid ${index}`, `Notification ${index}`);
  });
  expect(await notifications.count()).toBeLessThan(24);
  expect(await page.evaluate(() => window.__clearedNotificationTimers)).toBeGreaterThan(0);
  await expect(notifications.last().locator(".notification-title")).toHaveText("Rapid 19");
  const notificationBounds = await notifications.first().boundingBox();
  const headerBounds = await page.locator(".header").boundingBox();
  expect(notificationBounds.y).toBeGreaterThan(headerBounds.y + headerBounds.height);
  await expect(page.locator(".notification-info,.notification-warning")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".notification-error")).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) await page.locator('.notification-error [aria-label="Close error"]').first().click();
  await expect(notifications).toHaveCount(0);

  await page.evaluate(() => {
    for (let index = 0; index < 20; index += 1) window.MDManager.notifications.show("error", `Persistent ${index}`, `Error ${index}`);
  });
  await expect(page.locator(".notification-error")).toHaveCount(20);
  expect(await page.locator("#notifications").evaluate(container => container.scrollHeight > container.clientHeight)).toBe(true);
});

test("todo completion sound can be muted", async ({ page }) => {
  await openFixture(page);
  const soundToggle = page.locator("#toggleSounds");
  await expect(page.locator("[data-notification-test]")).toHaveCount(0);
  await expect(soundToggle).toHaveAttribute("aria-pressed", "false");
  await expect(soundToggle).toHaveAttribute("aria-label", "Mute sounds");
  const soundToggleX = await soundToggle.evaluate(button => button.getBoundingClientRect().x);
  const themeToggleX = await page.locator("#toggleTheme").evaluate(button => button.getBoundingClientRect().x);
  expect(soundToggleX).toBeLessThan(themeToggleX);
  await soundToggle.click();
  await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
  await expect(soundToggle).toHaveAttribute("aria-label", "Unmute sounds");
  await expect(soundToggle.locator(".sound-toggle-off")).toBeVisible();
  expect(await page.evaluate(() => window.MDManager.sounds.isMuted())).toBe(true);
  await soundToggle.click();
  await expect(soundToggle).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.MDManager.sounds.isMuted())).toBe(false);
  await page.evaluate(() => {
    window.__completionSounds = 0;
    window.MDManager.sounds.play = async () => { window.__completionSounds += 1; };
  });
  await page.locator(".card-header").first().click();
  const todos = page.locator(".card").first().locator(".checkbox");
  await todos.nth(0).click();
  await todos.nth(1).click();
  expect(await page.evaluate(() => window.__completionSounds)).toBe(0);
  await todos.nth(0).click();
  expect(await page.evaluate(() => window.__completionSounds)).toBe(1);
});

test("keyboard copy pastes a task at the pointer and resets completed todos", async ({ page }) => {
  await openFixture(page, "# Copy\n\n## Alpha\n#Info\n- Details\n- More details\n### Finished\n- [x] ~done~\n\n## Beta\n### Existing\n- [ ] open");
  const source = page.locator("#content > .release").nth(0).locator(".card");
  await source.locator(".card-header").click();
  await page.locator("#content").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".clipboard-source")).toHaveCount(0);
  await source.locator(".card-header").hover();
  await expect(source).toHaveCSS("border-color", "rgb(235, 219, 178)");
  await expect(page.locator(".clipboard-source")).toHaveCount(0);
  await page.keyboard.press("Control+c");
  await expect(source).toHaveClass(/copy-feedback/);
  await expect(source).toHaveClass(/clipboard-source/);
  await expect(source).toHaveCSS("outline-color", "rgb(131, 165, 152)");
  expect(await source.evaluate(element => getComputedStyle(element, "::after").backgroundColor)).toBe("rgb(131, 165, 152)");
  expect(await source.evaluate(element => getComputedStyle(element, "::after").animationFillMode)).toBe("forwards");
  await expect(page.locator(".clipboard-indicator")).toHaveCount(1);
  await expect(page.locator(".notification-title").last()).toHaveText("Task copied");
  await expect(page.locator(".notification-body").last()).toHaveText("Finished copied to clipboard.");
  await expect(page.locator(".notification-value").last()).toHaveText("Finished");
  const sourceBounds = await source.boundingBox();
  const indicatorBounds = await page.locator(".clipboard-indicator").boundingBox();
  expect(Math.abs(indicatorBounds.x + indicatorBounds.width / 2 - sourceBounds.x - sourceBounds.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(indicatorBounds.y + indicatorBounds.height / 2 - sourceBounds.y)).toBeLessThanOrEqual(1);
  await expect(page.locator(".clipboard-indicator")).toHaveCSS("width", "20px");
  await expect(page.locator(".clipboard-indicator")).toHaveCSS("height", "20px");

  await page.locator("#content > .release").nth(0).locator(".note-toggle").click();
  await expect.poll(async () => {
    const movedSource = await source.boundingBox();
    const movedIndicator = await page.locator(".clipboard-indicator").boundingBox();
    return Math.max(
      Math.abs(movedIndicator.x + movedIndicator.width / 2 - movedSource.x - movedSource.width),
      Math.abs(movedIndicator.y + movedIndicator.height / 2 - movedSource.y)
    );
  }).toBeLessThanOrEqual(1);

  await source.locator(".checkbox").click();
  await page.locator("#undoChange").click();
  await expect(page.locator(".clipboard-indicator")).toBeHidden();

  const existing = page.locator("#content > .release").nth(1).locator(".card");
  await existing.locator(".card-header").click({ button: "right" });
  await expect(existing).toHaveClass(/clipboard-source/);
  await expect(source).not.toHaveClass(/clipboard-source/);
  await expect(page.locator(".notification-body").last()).toHaveText("Existing copied to clipboard.");
  await source.locator(".card-header").click({ button: "right" });
  await expect(source).toHaveClass(/clipboard-source/);

  await page.keyboard.down("Control");
  await existing.locator(".card-header").click({ button: "right" });
  await page.keyboard.up("Control");
  await expect(page.locator(".clipboard-source")).toHaveCount(2);
  await expect(page.locator(".clipboard-indicator")).toHaveCount(2);
  await page.keyboard.down("Control");
  await existing.locator(".card-header").click({ button: "right" });
  await page.keyboard.up("Control");
  await expect(page.locator(".clipboard-source")).toHaveCount(1);
  await expect(page.locator(".notification-body").last()).toHaveText("Existing removed from clipboard.");
  await page.keyboard.down("Control");
  await existing.locator(".card-header").click({ button: "right" });
  await page.keyboard.up("Control");
  await expect(page.locator(".clipboard-source")).toHaveCount(2);

  const targetBoard = page.locator("#content > .release").nth(1).locator(".board");
  await targetBoard.hover({ position: { x: 10, y: 2 } });
  await page.keyboard.press("Control+v");
  await expect(page.locator(".clipboard-indicator")).toHaveCount(0);
  const targetCards = page.locator("#content > .release").nth(1).locator(".card");
  await expect(targetCards).toHaveCount(3);
  await expect(targetCards.locator(".card-title")).toHaveText(["Finished", "Existing", "Existing"]);
  await expect(targetCards.nth(0)).toHaveAttribute("aria-expanded", "true");
  await expect(targetCards.nth(1)).toHaveAttribute("aria-expanded", "false");
  await expect(targetCards.first().locator(".card-body")).toBeVisible();
  await expect(targetCards.first().locator(".checkbox")).toHaveAttribute("data-checked", "false");
  await expect(targetCards.first().locator(".todo-text")).not.toHaveClass(/completed/);
  await expect(page.locator("#saveFile")).toHaveClass(/dirty/);
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release").nth(1).locator(".card")).toHaveCount(1);
});

test("context copy inserts feature cards before or after the pointed midpoint", async ({ page }) => {
  await openFixture(page, "# Copy\n\n## Alpha\n#Info\n- Details\n### Finished\n- [x] ~done~\n\n## Beta\n### Existing\n- [ ] open");
  const features = page.locator("#content > .release");
  await features.nth(0).locator(".card-header").click();
  await features.nth(0).locator(".note-toggle").click();
  await features.nth(0).locator(".release-header").click({ button: "right" });
  await expect(features.nth(0)).toHaveClass(/copy-feedback/);
  await expect(features.nth(0)).toHaveClass(/clipboard-source/);
  expect(await features.nth(0).evaluate(element => getComputedStyle(element, "::after").backgroundColor)).toBe("rgb(131, 165, 152)");
  await expect(page.locator(".notification-title").last()).toHaveText("Feature copied");

  await features.nth(1).locator(".release-header").click({ button: "right" });
  await expect(features.nth(1)).toHaveClass(/clipboard-source/);
  await expect(page.locator(".notification-body").last()).toHaveText("Beta copied to clipboard.");
  await features.nth(0).locator(".release-header").click({ button: "right" });
  await expect(features.nth(0)).toHaveClass(/clipboard-source/);

  let betaBounds = await features.nth(1).boundingBox();
  await page.mouse.click(betaBounds.x + betaBounds.width * .75, betaBounds.y + betaBounds.height - 4, { button: "right" });
  await expect(page.locator(".clipboard-indicator")).toHaveCount(0);
  await expect(page.locator("#content .release-title")).toHaveText(["Alpha", "Beta", "Alpha"]);
  const copiedTask = features.nth(2).locator(".card");
  await expect(copiedTask).toHaveAttribute("aria-expanded", "true");
  await expect(features.nth(2).locator(".feature-note")).toHaveAttribute("aria-expanded", "true");
  await expect(copiedTask.locator(".checkbox")).toHaveAttribute("data-checked", "false");

  await features.nth(0).locator(".release-header").click({ button: "right" });
  betaBounds = await features.nth(1).boundingBox();
  await page.mouse.click(betaBounds.x + betaBounds.width * .25, betaBounds.y + betaBounds.height - 4, { button: "right" });
  await expect(page.locator("#content .release-title")).toHaveText(["Alpha", "Alpha", "Beta", "Alpha"]);
  await expect(page.locator(".clipboard-indicator")).toHaveCount(0);
});

test("help popover documents shortcuts and Markdown and closes predictably", async ({ page }) => {
  await openFixture(page);
  const helpButton = page.getByRole("button", { name: "Help", exact: true });
  const soundButton = page.locator("#toggleSounds");
  const positions = await Promise.all([helpButton, soundButton].map(locator => locator.evaluate(node => node.getBoundingClientRect().x)));
  expect(positions[0]).toBeLessThan(positions[1]);
  await expect(page.locator(".help-menu")).toHaveCSS("border-left-style", "none");
  await helpButton.click();
  const help = page.locator("#helpPopover");
  await expect(help).toBeVisible();
  await expect(helpButton).toHaveAttribute("aria-expanded", "true");
  await expect(help).toContainText("Quick reference");
  const shortcutTab = help.getByRole("tab", { name: "Shortcuts", exact: true });
  const markdownTab = help.getByRole("tab", { name: "Markdown syntax", exact: true });
  const shortcutPanel = page.locator("#shortcutHelpPanel");
  const markdownPanel = page.locator("#markdownHelpPanel");
  await expect(shortcutTab).toHaveAttribute("aria-selected", "true");
  await expect(markdownTab).toHaveAttribute("aria-selected", "false");
  await expect(shortcutPanel).toBeVisible();
  await expect(markdownPanel).toBeHidden();
  await expect(shortcutPanel).toContainText("Ctrl");
  const keySurfaces = await shortcutPanel.locator("kbd").evaluateAll(keys => keys.map(key => {
    const style = getComputedStyle(key);
    return { minWidth: style.minWidth, height: style.height, display: style.display, overflow: style.overflow };
  }));
  expect(keySurfaces.length).toBeGreaterThan(0);
  expect(keySurfaces.every(key => key.minWidth === "22px" && key.height === "22px" && key.display === "grid" && key.overflow === "hidden")).toBe(true);
  await expect(shortcutPanel.locator(".shortcut-list > div").filter({ hasText: "Open workspace" }).locator("kbd")).toHaveText("W");
  await expect(shortcutPanel.locator(".shortcut-list > div").filter({ hasText: "Open archive" }).locator("kbd")).toHaveText("A");
  await expect(shortcutPanel.locator(".shortcut-list > div").filter({ hasText: "Toggle backlog" }).locator("kbd")).toHaveText("B");
  await expect(shortcutPanel.locator(".shortcut-list > div").filter({ hasText: "Toggle statistics" }).locator("kbd")).toHaveText("S");
  await expect(shortcutPanel).toContainText("Jump to pinned feature");
  await shortcutTab.focus();
  await page.keyboard.press("End");
  await expect(markdownTab).toBeFocused();
  await expect(markdownTab).toHaveAttribute("aria-selected", "true");
  await expect(shortcutPanel).toBeHidden();
  await expect(markdownPanel).toBeVisible();
  await page.keyboard.press("Home");
  await expect(shortcutTab).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(markdownTab).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(shortcutTab).toBeFocused();
  await markdownTab.click();
  await expect(markdownPanel).toContainText("#Backlog");
  await expect(markdownPanel).toContainText("#Pin");
  await expect(markdownPanel).toContainText("#Ignore");
  await expect(markdownPanel.locator(".markdown-reference > div").filter({ hasText: "#Version" }).locator("dd")).toHaveText("Feature version numbering");
  await expect(markdownPanel.locator(".markdown-reference > div").filter({ hasText: "#Info" }).locator("dd")).toHaveText("Informational note for a feature or task");
  await expect(markdownPanel.locator(".markdown-reference > div").filter({ hasText: "#Warn" }).locator("dd")).toHaveText("Warning note for a feature or task");
  const structure = markdownPanel.locator(".markdown-reference").first();
  await expect(structure).toContainText("#### Label");
  await expect(structure).toContainText("- [ ] Todo");
  await expect(markdownPanel.getByText("Task content", { exact: true })).toHaveCount(0);
  await expect(markdownPanel).not.toContainText("Starts a");
  await expect(markdownPanel).not.toContainText("Marks the");
  const formatting = markdownPanel.locator(".help-formatting");
  await expect(formatting.locator(".markdown-syntax-bold")).toHaveText("**Bold**");
  await expect(formatting.locator(".markdown-syntax-bold")).toHaveCSS("font-weight", "800");
  await expect(formatting.locator(".markdown-syntax-italic")).toHaveCSS("font-style", "italic");
  await expect(formatting.locator(".markdown-syntax-strike")).toHaveCSS("text-decoration-line", "line-through");
  await expect(formatting.locator(".markdown-syntax-code")).toHaveText("`Code`");
  await expect(formatting.locator(".markdown-syntax-link")).toHaveText("[URL](url)");
  await expect(formatting).not.toContainText("Bullet");
  await expect(formatting).not.toContainText("Nested");
  await expect(markdownPanel.locator(".help-tag-info")).toHaveCSS("color", "rgb(131, 165, 152)");
  await expect(markdownPanel.locator(".help-tag-warn")).toHaveCSS("color", "rgb(215, 153, 33)");
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

test("Workspace tasks use the scrollbar space only when the feature overflows", async ({ page }) => {
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
  const todos = Array.from({ length: 40 }, (_, index) => `- [ ] Todo ${index + 1}`).join("\n");
  await openFixture(page, `# Backlog Width\n\n## Feature\n### Task\n- [ ] current\n\n#Backlog\n## Later\n### Backlog Task\n${todos}`);
  await toggleBacklogFromView(page);
  await expect(page.locator("#backlog")).toHaveCSS("transform", "none");
  const before = await metrics();
  const headerBefore = await page.locator(".backlog-header").boundingBox();
  const closeBefore = await page.locator(".backlog-close").boundingBox();
  expect(before.overflow).toBe(false);
  expect(Math.abs(before.leftGap - before.rightGap)).toBeLessThanOrEqual(1);

  await page.locator("#backlog .card-header").click();
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
  await page.evaluate(() => {
    const serialize = window.MDManager.markdown.serialize;
    window.__serializationCount = 0;
    window.MDManager.markdown.serialize = (/** @type {unknown} */ project) => {
      window.__serializationCount += 1;
      return serialize(project);
    };
  });
  const openTodo = page.locator(".card").first().locator(".checkbox").nth(1);
  await page.locator(".card-header").first().click();
  await openTodo.click();
  expect(await page.evaluate(() => window.__serializationCount)).toBe(1);
  const finishedTask = page.locator(".notification").filter({ hasText: "Task finished" });
  const finishedFeature = page.locator(".notification").filter({ hasText: "Feature finished" });
  await expect(finishedTask.locator(".notification-body")).toHaveText("Started Task completed.");
  await expect(finishedTask.locator(".notification-value")).toHaveText("Started Task");
  await expect(finishedTask.locator(".notification-symbol-rocket")).toBeVisible();
  await expect(finishedFeature.locator(".notification-body")).toHaveText("Active Feature completed.");
  await expect(finishedFeature.locator(".notification-value")).toHaveText("Active Feature");
  await expect(finishedFeature.locator(".notification-symbol-confetti")).toBeVisible();
  await expect(page.locator(".card").first().locator(".task-check")).toBeVisible();
  await expect(page.locator("#saveFile")).toHaveClass(/dirty/);
  await page.locator("#undoChange").click();
  await expect(page.locator(".card").first().locator(".task-in-progress")).toBeVisible();
  await page.locator("#redoChange").click();
  await page.locator("#saveFile").click();
  await expect(page.locator(".notification-title").last()).toHaveText("File saved");
  await expect(page.locator(".notification-body").last()).toHaveText("Fixture.md saved.");
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
  await expect(page.locator(".notification-title").last()).toHaveText("Task deleted");
  await expect(page.locator(".notification-body").last()).toHaveText("Started Task deleted.");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content .card")).toHaveCount(3);
});

test("adding and immediately deleting a task or feature returns to the saved state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page);
  const save = page.locator("#saveFile");
  const firstFeature = page.locator("#content > .release").first();
  const initialTaskCount = await firstFeature.locator(".card").count();

  await firstFeature.getByRole("button", { name: /New task in Active Feature/ }).click();
  await page.locator("#saveTaskEditor").click();
  await expect(save).toHaveClass(/dirty/);
  const addedTask = firstFeature.locator(".card").last();
  await addedTask.locator(".card-header").hover();
  await addedTask.locator('[data-delete="task"]').click();
  await expect(firstFeature.locator(".card")).toHaveCount(initialTaskCount);
  await expect(page.locator(".notification-title").last()).toHaveText("Task deleted");
  await expect(page.locator(".notification-body").last()).toHaveText("New Task deleted.");
  await expect(save).not.toHaveClass(/dirty/);
  await expect(page.locator("#undoChange")).toBeEnabled();

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.locator("#saveFeatureEditor").click();
  await expect(save).toHaveClass(/dirty/);
  const addedFeature = page.locator("#content > .release").last();
  await addedFeature.locator('[data-delete="feature"]').evaluate(button => /** @type {HTMLElement} */ (button).click());
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await expect(page.locator(".notification-title").last()).toHaveText("Feature deleted");
  await expect(page.locator(".notification-body").last()).toHaveText("New Feature deleted.");
  await expect(save).not.toHaveClass(/dirty/);
  await expect(page.locator("#undoChange")).toBeEnabled();
});

test("view menu, keyboard shortcut, and accessibility states stay synchronized", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleViewMenu")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#viewOptions > button")).toHaveText(["Backlog", "Clock", "Metadata", "Statistics"]);
  await expect(page.locator("#toggleBacklog")).toHaveCSS("color", "rgb(235, 219, 178)");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewOptions")).toBeHidden();
  await page.keyboard.press("b");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+b");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Meta+b");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("B");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("s");
  await expect(page.locator("#toggleStats")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#projectStats")).toBeHidden();
  await page.keyboard.press("Control+s");
  await expect(page.locator("#toggleStats")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("S");
  await expect(page.locator("#toggleStats")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#projectStats")).toBeVisible();
  await page.keyboard.press("a");
  await expect(page.locator("#showArchiveView")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("w");
  await expect(page.locator("#showWorkspaceView")).toHaveAttribute("aria-pressed", "true");
});

test("letter shortcuts are disabled in edit dialogs", async ({ page }) => {
  await openFixture(page);
  const task = page.locator(".card").first();
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await expect(page.locator("#taskEditor")).toBeFocused();
  await page.evaluate(() => {
    window.__dialogShortcutDefaults = [];
    window.addEventListener("keydown", event => {
      if (["a", "b", "p", "s", "w"].includes(event.key.toLowerCase())) window.__dialogShortcutDefaults.push(event.defaultPrevented);
    });
  });
  await page.keyboard.press("a");
  await page.keyboard.press("b");
  await page.keyboard.press("p");
  await page.keyboard.press("s");
  await page.keyboard.press("w");
  await expect(page.locator("#toggleBacklog")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#toggleStats")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__dialogShortcutDefaults)).toEqual([false, false, false, false, false]);
});

test("long titles remain clipped to their headers and scroll only on hover", async ({ page }) => {
  await openFixture(page);
  const title = page.locator(".release-title").first();
  await title.evaluate(node => { node.dataset.fullTitle = "An extremely long feature title that cannot fit into the available header width"; window.MDManager.render.fitTitles(); });
  const heading = title.locator("..");
  await heading.hover();
  await expect(title).toHaveClass(/title-scroll/);
  const titleBox = await title.boundingBox();
  const menuBox = await heading.locator(".feature-menu-button").boundingBox();
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(menuBox.x);
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

test("Workspace uses 380px features and 360px tasks on common and 4K viewports", async ({ page }) => {
  await openFixture(page);
  const normalWidth = await page.locator("#content > .release").first().evaluate(node => node.getBoundingClientRect().width);
  const normalTaskWidth = await page.locator("#content > .release").first().locator(".card").first().evaluate(node => node.getBoundingClientRect().width);
  await page.setViewportSize({ width: 3840, height: 2160 });
  const wideWidth = await page.locator("#content > .release").first().evaluate(node => node.getBoundingClientRect().width);
  const wideTaskWidth = await page.locator("#content > .release").first().locator(".card").first().evaluate(node => node.getBoundingClientRect().width);
  expect(normalWidth).toBe(380);
  expect(normalTaskWidth).toBe(360);
  expect(wideWidth).toBe(380);
  expect(wideTaskWidth).toBe(360);
});
