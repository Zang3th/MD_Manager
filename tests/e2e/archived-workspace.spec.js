const { test, expect, appUrl } = require("./fixtures");

const source = `# Project

## Open
#Version
- 2.0.0
### Work
- [ ] todo

## Ready
#Version
- 1.5.0
#Date
- 2026-03-01 - 2026-03-05
### Done
- [x] ~done~

#Backlog
## Backlog
### Later
- [ ] later

#Archive
# Archive

## Second
#Version
- 1.1.0
#Date
- 2026-02-01
### Shipped
- [x] ~shipped~
- [x] ~polished~

## First
#Version
- 1.0.0
#Date
- 2026-01-01 - 2026-01-10
### Base
- [x] ~base~
`;

/** @param {import("@playwright/test").Page} page @param {string} [markdown] */
async function open(page, markdown = source) {
  await page.goto(appUrl);
  await page.evaluate(value => {
    /** @type {any} */ (window).__remembered = [];
    window.MDManager.files.open = async () => ({ handle: { name: "Project.md" }, markdown: value });
    window.MDManager.files.remember = async (/** @type {unknown} */ _handle, /** @type {string} */ _title, /** @type {number} */ _width, /** @type {{showArchived?: boolean, showDone?: boolean}} */ options) => {
      /** @type {any} */ (window).__remembered.push({ ...options });
    };
    window.MDManager.files.save = async () => {};
  }, markdown);
  await page.locator("#openFile").click();
  await expect(page.locator("#projectTitle")).toHaveText("Project");
}

/** @param {import("@playwright/test").Page} page @param {"#toggleArchived" | "#toggleDone"} option */
async function toggle(page, option) {
  await page.locator("#toggleViewMenu").click();
  await page.locator(option).click();
}

/** @param {import("@playwright/test").Locator} feature */
async function openFeatureActions(feature) {
  await feature.locator(".release-heading").hover();
  await feature.locator(".feature-menu-button").click();
}

const workspaceTitles = "#content > .release .release-title";

test("archived features stay hidden by default and appear first in archive order with a divider", async ({ page }) => {
  await open(page);
  await expect(page.locator(workspaceTitles)).toHaveText(["Open", "Ready"]);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleArchived")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#toggleDone")).toBeHidden();
  await page.locator("#toggleArchived").click();

  await expect(page.locator("#toggleArchived")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#content > .release.archived")).toHaveCount(2);
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Open", "Ready"]);
  const order = await page.locator("#content > *").evaluateAll(nodes => nodes.map(node => node.classList.contains("archived-divider") ? "divider" : node.querySelector(".release-title")?.textContent));
  expect(order).toEqual(["First", "Second", "divider", "Open", "Ready"]);
  await expect(page.locator("#saveFile")).toHaveAttribute("aria-label", "Saved");
  await expect(page.locator("#undoChange")).toBeDisabled();
  expect(await page.evaluate(() => /** @type {any} */ (window).__remembered.at(-1))).toEqual({ showArchived: true, showDone: false });

  await toggle(page, "#toggleArchived");
  await expect(page.locator("#content > .release.archived")).toHaveCount(0);
  await expect(page.locator(".archived-divider")).toHaveCount(0);
});

test("archived cards use the archive blue, a hatched surface, and a watermark", async ({ page }) => {
  for (const theme of ["dark", "light"]) {
    await open(page);
    if (theme === "light") await page.evaluate(() => window.MDManager.theme.next());
    await toggle(page, "#toggleArchived");
    const look = await page.locator("#content > .release.archived").first().evaluate(card => {
      const probe = document.createElement("span");
      probe.style.color = "var(--link)";
      document.body.append(probe);
      const link = getComputedStyle(probe).color;
      probe.remove();
      const watermark = /** @type {HTMLElement} */ (card.querySelector(".archived-watermark"));
      const text = /** @type {HTMLElement} */ (watermark.firstElementChild);
      return {
        link,
        border: getComputedStyle(card).borderTopColor,
        progress: getComputedStyle(/** @type {Element} */ (card.querySelector(".feature-progress"))).color,
        taskProgress: getComputedStyle(/** @type {Element} */ (card.querySelector(".task-progress"))).color,
        check: getComputedStyle(/** @type {Element} */ (card.querySelector(".task-check"))).color,
        header: getComputedStyle(/** @type {Element} */ (card.querySelector(".release-header"))).backgroundImage,
        content: getComputedStyle(/** @type {Element} */ (card.querySelector(".release-content"))).backgroundImage,
        watermark: text.textContent,
        hidden: watermark.getAttribute("aria-hidden"),
        pointerEvents: getComputedStyle(watermark).pointerEvents,
        transform: getComputedStyle(text).transform,
        fits: text.getBoundingClientRect().width <= card.getBoundingClientRect().width
      };
    });
    expect(look.border).toBe(look.link);
    expect(look.progress).toBe(look.link);
    expect(look.taskProgress).toBe(look.link);
    expect(look.check).toBe(look.link);
    expect(look.header).toContain("repeating-linear-gradient");
    expect(look.content).toContain("repeating-linear-gradient");
    expect(look.watermark).toBe("Archived");
    expect(look.hidden).toBe("true");
    expect(look.pointerEvents).toBe("none");
    expect(look.transform).not.toBe("none");
    expect(look.fits).toBe(true);
    const regular = await page.locator("#content > .release:not(.archived)").first().evaluate(card => getComputedStyle(card).borderTopColor);
    expect(regular).not.toBe(look.link);
  }
});

test("archived cards are read only and offer only Unarchive", async ({ page }) => {
  await open(page);
  await toggle(page, "#toggleArchived");
  const card = page.locator("#content > .release.archived", { hasText: "Second" });
  await expect(card.locator(".add-task-btn, .edit-btn, .delete-btn, button.checkbox")).toHaveCount(0);
  await openFeatureActions(card);
  await expect(card.locator(".feature-option")).toHaveText(["Unarchive"]);
  await page.keyboard.press("Escape");

  await card.locator(".card-header").click();
  await expect(card.locator(".card")).toHaveAttribute("aria-expanded", "true");
  await card.locator(".todo-item .checkbox").first().click();
  await expect(card.locator(".todo-item .checkbox.checked")).toHaveCount(2);
  await expect(page.locator("#undoChange")).toBeDisabled();

  const header = await card.locator(".release-header").boundingBox();
  const target = await page.locator("#content > .release", { hasText: "Open" }).locator(".release-header").boundingBox();
  if (!header || !target) throw new Error("missing card geometry");
  await page.mouse.move(header.x + 20, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width - 10, target.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Open", "Ready"]);
  await expect(page.locator("#undoChange")).toBeDisabled();
  await expect(card.locator(".card")).toHaveAttribute("aria-expanded", "true");
});

test("regular features stop at the start of the regular block when dragged towards archived cards", async ({ page }) => {
  await open(page);
  await toggle(page, "#toggleArchived");
  const header = await page.locator("#content > .release", { hasText: "Ready" }).locator(".release-header").boundingBox();
  const target = await page.locator("#content > .release.archived", { hasText: "First" }).locator(".release-header").boundingBox();
  if (!header || !target) throw new Error("missing card geometry");
  await page.mouse.move(header.x + 20, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(target.x + 10, target.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Ready", "Open"]);
  await expect(page.locator("#content > .release.archived")).toHaveCount(2);
  await page.locator("#undoChange").click();
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Open", "Ready"]);
});

test("Unarchive moves the card into the regular features and undo restores it with its expansion", async ({ page }) => {
  await open(page);
  await toggle(page, "#toggleArchived");
  const first = page.locator("#content > .release[data-feature]", { hasText: "First" });
  await first.locator(".card-header").click();
  await page.locator("#content > .release", { hasText: "Open" }).locator(".card-header").click();
  await openFeatureActions(first);
  await first.locator("[data-feature-action='unarchive']").click();

  await expect(page.locator("#content > .release.archived")).toHaveCount(1);
  await expect(page.locator(workspaceTitles)).toHaveText(["Second", "Open", "First", "Ready"]);
  await expect(first).not.toHaveClass(/archived/);
  await expect(first.locator(".card")).toHaveAttribute("aria-expanded", "true");
  await expect(first.locator(".add-task-btn")).toHaveCount(1);
  await expect(page.locator("#content > .release", { hasText: "Open" }).locator(".card")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#content > .release", { hasText: "Ready" }).locator(".card")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#undoChange").click();
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Open", "Ready"]);
  await expect(page.locator("#content > .release.archived", { hasText: "First" }).locator(".card")).toHaveAttribute("aria-expanded", "true");
});

test("archiving a feature while archived cards are shown carries its expansion into the archived block", async ({ page }) => {
  await open(page);
  await toggle(page, "#toggleArchived");
  const ready = page.locator("#content > .release", { hasText: "Ready" });
  await ready.locator(".card-header").click();
  await openFeatureActions(ready);
  await ready.locator("[data-feature-action='archive']").click();
  await expect(page.locator(workspaceTitles)).toHaveText(["First", "Second", "Ready", "Open"]);
  await expect(page.locator("#content > .release.archived", { hasText: "Ready" }).locator(".card")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#content > .release.archived", { hasText: "Second" }).locator(".card")).toHaveAttribute("aria-expanded", "false");
});

test("toggling archived cards keeps the regular features in place and shows the divider completely", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await open(page);
  const open_ = page.locator("#content > .release", { hasText: "Open" });
  const before = await open_.evaluate(node => node.getBoundingClientRect().left);
  await toggle(page, "#toggleArchived");
  const divider = page.locator("#content > .archived-divider");
  // At the start of the regular features the divider is revealed instead of being cut off, which
  // moves the regular features right by exactly the divider and its gap.
  const shift = await divider.evaluate(node => node.getBoundingClientRect().width + parseFloat(getComputedStyle(node).marginLeft) + parseFloat(getComputedStyle(node).marginRight) + parseFloat(getComputedStyle(/** @type {Element} */ (node.parentElement)).columnGap));
  await expect.poll(() => open_.evaluate(node => node.getBoundingClientRect().left)).toBeCloseTo(before + shift, 0);
  const edges = await divider.evaluate(node => ({ left: node.getBoundingClientRect().left, content: /** @type {Element} */ (node.parentElement).getBoundingClientRect().left }));
  expect(edges.left).toBeGreaterThanOrEqual(edges.content);
  expect(await page.locator("#content").evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await toggle(page, "#toggleArchived");
  await expect.poll(() => open_.evaluate(node => node.getBoundingClientRect().left)).toBeCloseTo(before, 0);

  // Scrolled further into the regular features, the view stays exactly where it was.
  const ready = page.locator("#content > .release", { hasText: "Ready" });
  await page.locator("#content").evaluate(node => { node.scrollLeft = node.scrollWidth; });
  const readyBefore = await ready.evaluate(node => node.getBoundingClientRect().left);
  await toggle(page, "#toggleArchived");
  await expect.poll(() => ready.evaluate(node => node.getBoundingClientRect().left)).toBeCloseTo(readyBefore, 0);
});

test("the divider is a continuous rounded archive-blue line aligned with the cards", async ({ page }) => {
  await open(page);
  await toggle(page, "#toggleArchived");
  const divider = page.locator("#content > .archived-divider");
  await expect(divider).toBeVisible();
  await expect(divider.locator("*")).toHaveCount(0);
  const look = await divider.evaluate(node => {
    const probe = document.createElement("span");
    probe.style.color = "var(--link)";
    document.body.append(probe);
    const link = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(node);
    const bounds = node.getBoundingClientRect();
    const content = /** @type {HTMLElement} */ (node.parentElement);
    const area = content.getBoundingClientRect();
    const card = /** @type {Element} */ (content.querySelector(".release")).getBoundingClientRect();
    return { link, color: style.backgroundColor, image: style.backgroundImage, radius: parseFloat(style.borderTopLeftRadius), width: bounds.width, top: bounds.top - area.top, bottom: area.bottom - bounds.bottom - (content.offsetHeight - content.clientHeight), cardTop: card.top };
  });
  expect(look.color).toBe(look.link);
  expect(look.image).toBe("none");
  expect(look.radius).toBeGreaterThanOrEqual(look.width / 2);
  expect(look.top).toBeCloseTo(look.bottom, 1);
  expect(await divider.evaluate(node => node.getBoundingClientRect().top)).toBeCloseTo(look.cardTop, 1);
});

test("search reveals archived hits in the Workspace while archived cards are shown", async ({ page }) => {
  await open(page);
  await page.keyboard.press("f");
  await page.locator("#searchInput").fill("polished");
  await page.keyboard.press("Enter");
  await expect(page.locator("#showArchiveView")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#showWorkspaceView").click();
  await toggle(page, "#toggleArchived");
  await page.keyboard.press("f");
  await page.locator("#searchInput").fill("polished");
  await page.keyboard.press("Enter");
  await expect(page.locator("#showWorkspaceView")).toHaveAttribute("aria-pressed", "true");
  const hit = page.locator("#content > .release.archived", { hasText: "Second" }).locator(".todo-item").nth(1);
  await expect(hit).toHaveClass(/search-hit/);
  await expect(hit).toBeVisible();
});

test("done lanes appear in the archive timeline in green and can be archived from their popover", async ({ page }) => {
  await open(page);
  await page.locator("#showArchiveView").click();
  await expect(page.locator(".archive-done-feature")).toHaveCount(0);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleArchived")).toBeHidden();
  await page.locator("#toggleDone").click();

  const lane = page.locator(".archive-done-feature");
  await expect(lane).toHaveCount(1);
  await expect(lane.locator(".archive-feature-title")).toHaveText("Ready");
  await expect(page.locator(".archive-done-count")).toHaveText("+ 1 done");
  const colors = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (/** @type {string} */ value) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const activity = (/** @type {string} */ selector) => resolve(getComputedStyle(/** @type {Element} */ (document.querySelector(selector))).getPropertyValue("--archive-activity"));
    const result = { done: activity(".archive-done-feature"), archived: activity(".archive-swimlane-feature:not(.archive-done-feature)"), success: resolve("var(--success)") };
    probe.remove();
    return result;
  });
  expect(colors.done).toBe(colors.success);
  expect(colors.archived).not.toBe(colors.success);
  expect(await page.evaluate(() => /** @type {any} */ (window).__remembered.at(-1))).toEqual({ showArchived: false, showDone: true });

  await lane.locator(".archive-feature-toggle").click();
  await expect(page.locator("#archiveFeaturePopover [data-unarchive-feature]")).toHaveCount(0);
  const popoverColors = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (/** @type {string} */ value) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const popover = /** @type {Element} */ (document.getElementById("archiveFeaturePopover"));
    const result = {
      success: resolve("var(--success)"),
      link: resolve("var(--link)"),
      version: getComputedStyle(/** @type {Element} */ (popover.querySelector(".archive-popover-version"))).color,
      button: getComputedStyle(/** @type {Element} */ (popover.querySelector(".archive-popover-archive > .ui-icon"))).color
    };
    probe.remove();
    return result;
  });
  expect(popoverColors.version).toBe(popoverColors.success);
  expect(popoverColors.button).toBe(popoverColors.success);
  await page.locator("#archiveFeaturePopover [data-archive-feature]").click();
  await expect(page.locator(".archive-done-feature")).toHaveCount(0);
  await expect(page.locator(".archive-count")).toHaveText("3 Features");
  await expect(page.locator(".archive-done-count")).toHaveCount(0);
  await expect(page.locator("#archiveFeaturePopover [data-unarchive-feature]")).toBeVisible();

  await page.locator("#undoChange").click();
  await expect(page.locator(".archive-done-feature")).toHaveCount(1);
});

test("both options are restored from the matching recent file after reload", async ({ page }) => {
  await page.addInitScript(markdown => {
    const handle = {
      name: "Project.md",
      requestPermission: async () => "granted",
      getFile: async () => ({ text: async () => markdown, lastModified: 1, size: markdown.length }),
      isSameEntry: async (/** @type {unknown} */ other) => other === handle
    };
    const stored = window.name ? JSON.parse(window.name) : {};
    let record = { id: "project", name: handle.name, projectTitle: "Project", openedAt: 1, handle, ...stored };
    /** @type {any} */
    const database = {
      close() {},
      transaction() {
        /** @type {any} */
        const transaction = {};
        transaction.objectStore = () => ({
          getAll() {
            /** @type {any} */
            const request = {};
            queueMicrotask(() => { request.result = [record]; request.onsuccess(); });
            return request;
          },
          put(/** @type {any} */ next) {
            record = next;
            window.name = JSON.stringify({ showArchived: next.showArchived, showDone: next.showDone });
            queueMicrotask(() => transaction.oncomplete());
          },
          delete() {}
        });
        return transaction;
      }
    };
    indexedDB.open = /** @type {any} */ (() => {
      /** @type {any} */
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    });
  }, source);

  await page.goto(appUrl);
  await page.locator(".recent-file-open").click();
  await expect(page.locator("#content > .release.archived")).toHaveCount(0);
  await toggle(page, "#toggleArchived");
  await page.locator("#showArchiveView").click();
  await toggle(page, "#toggleDone");
  await expect.poll(() => page.evaluate(() => window.name)).toBe(JSON.stringify({ showArchived: true, showDone: true }));

  await page.reload();
  await page.locator(".recent-file-open").click();
  await expect(page.locator("#content > .release.archived")).toHaveCount(2);
  await page.locator("#showArchiveView").click();
  await expect(page.locator(".archive-done-feature")).toHaveCount(1);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleDone")).toHaveAttribute("aria-pressed", "true");
});

test("a done lane at the bottom opens its popover with the complete content instead of a squeezed scroll area", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const rows = Array.from({ length: 12 }, (_, index) => `## Archived ${index}\n#Version\n- 0.${index}.0\n#Date\n- 2026-01-${String(index + 1).padStart(2, "0")}\n### Done\n- [x] ~done~`).join("\n\n");
  const tasks = Array.from({ length: 3 }, (_, index) => `### Task ${index}\n- [x] ~done~`).join("\n");
  await open(page, `# Project\n\n## Latest\n#Version\n- 1.0.0\n#Date\n- 2026-03-01 - 2026-03-05\n${tasks}\n\n#Archive\n# Archive\n\n${rows}\n`);
  await page.locator("#showArchiveView").click();
  await toggle(page, "#toggleDone");
  const label = page.locator(".archive-done-feature .archive-feature-toggle");
  await label.scrollIntoViewIfNeeded();
  await page.locator(".archive-content").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await label.click();
  const popover = page.locator("#archiveFeaturePopover");
  await expect(popover).toBeVisible();
  const geometry = await popover.evaluate(node => {
    const content = /** @type {HTMLElement} */ (node.querySelector(".archive-feature-popover-content"));
    const bounds = node.getBoundingClientRect();
    return { overflow: content.scrollHeight - content.clientHeight, bottom: bounds.bottom, height: bounds.height, viewport: innerHeight };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.height).toBeGreaterThan(200);
});
