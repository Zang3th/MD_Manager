const { test, expect } = require("./fixtures");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appUrl = pathToFileURL(path.resolve(__dirname, "../../MD_Manager.html")).href;
const entry = (/** @type {string} */ title, /** @type {string[]} */ dates) => `## ${title}\n#Version\n- 1.2.3\n#Date\n${dates.map(date => `- ${date}`).join("\n")}\n### Done\n- [x] done`;
const edges = `# Edges\n#Archive\n# Archive\n${[
  entry("First range", ["2026-01-01 - 2026-01-02"]),
  entry("First point", ["01.01.26"]),
  entry("Last point", ["2026-12-31"]),
  entry("Last range", ["2026-12-30 - 2026-12-31"]),
  entry("Full range", ["2026-01-01 - 2026-12-31"])
].join("\n\n")}`;
const large = (/** @type {number} */ count) => `# Rows\n#Archive\n# Archive\n${Array.from({ length: count }, (_, index) => entry(`Row ${String(index).padStart(3, "0")}`, [new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)])).join("\n\n")}`;
const geometrySource = `# Geometry\n#Archive\n# Archive\n${[
  entry("Full range", ["2026-01-01 - 2026-12-31"]),
  entry("Mixed caps", ["2026-01-02 - 2026-01-03", "2026-07-01 - 2026-12-30"]),
  entry("Fractional caps", ["2026-02-03 - 2026-10-17"]),
  entry("Single day", ["2026-04-01"]),
  entry("Short pair", ["2026-01-01 - 2026-01-02"])
].join("\n\n")}`;
const durationSource = `# Durations\n#Archive\n# Archive\n${[
  entry("First full range", ["2026-01-01 - 2026-12-31"]),
  entry("Second paused range", ["2026-01-02 - 2026-01-03", "2026-07-01 - 2026-12-30"]),
  entry("Third regular range", ["2026-02-03 - 2026-10-17"]),
  entry("Fourth edge range", ["2026-12-30 - 2026-12-31"])
].join("\n\n")}`;

/** @param {import("@playwright/test").Locator} mark */
async function durationGeometry(mark) {
  const label = mark.locator(".archive-object-label");
  await expect(label).toHaveClass(/is-positioned/);
  await expect(label).toHaveCSS("opacity", "1");
  return mark.evaluate(node => {
    const box = (/** @type {Element} */ target) => {
      const bounds = target.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const label = node.querySelector(".archive-object-label");
    const plot = node.closest(".archive-swimlane-plot");
    const frozen = node.closest(".archive-swimlane-row").querySelector(".archive-swimlane-label");
    const style = getComputedStyle(label);
    return { anchor: box(node), label: box(label), plot: box(plot), frozen: box(frozen), axis: box(document.querySelector(".archive-date-axis")), whiteSpace: style.whiteSpace, lineHeight: parseFloat(style.lineHeight), clipped: label.scrollWidth - label.clientWidth, windowWidth: innerWidth };
  });
}

for (const theme of ["dark", "light"]) {
  for (const ratio of [1, 2]) {
    test.describe(`Archive duration labels (${theme}, DPR ${ratio})`, () => {
      test.use({ deviceScaleFactor: ratio });
      test("range and pause durations stay by their own period without wrapping or scroll growth", async ({ page }, testInfo) => {
        for (const width of [1441, 800]) {
          await page.setViewportSize({ width, height: 900 });
          await open(page, durationSource);
          await setTheme(page, theme);
          await expect.poll(() => page.locator(".archive-date-timeline").evaluate(node => Number(/** @type {HTMLElement} */ (node).dataset.archiveDateLayout?.split(":")[0]) === node.querySelector(".archive-axis-plot").getBoundingClientRect().width)).toBe(true);
          const content = page.locator(".archive-content");
          const extent = await content.evaluate(node => ({ width: node.scrollWidth, height: node.scrollHeight }));
          const marks = page.locator(".archive-active-segment,.archive-pause-segment");
          await expect(marks).toHaveCount(6);
          for (let index = 0; index < 6; index++) {
            const mark = marks.nth(index);
            await mark.hover();
            const value = await durationGeometry(mark);
            expect(value.whiteSpace).toBe("nowrap");
            expect(value.label.height).toBeLessThanOrEqual(value.lineHeight + .05);
            expect(value.clipped).toBeLessThanOrEqual(1);
            expect(value.label.left).toBeGreaterThanOrEqual(value.frozen.right + 3.9);
            expect(value.label.right).toBeLessThanOrEqual(Math.min(value.plot.right + 8, value.windowWidth - 12) + .1);
            if (!index) expect(value.label.top).toBeCloseTo(value.anchor.bottom + 8, 1);
            else expect(value.label.bottom).toBeCloseTo(value.anchor.top - 8, 1);
            expect(value.label.top).toBeGreaterThanOrEqual(value.axis.bottom);
            expect(await content.evaluate(node => ({ width: node.scrollWidth, height: node.scrollHeight }))).toEqual(extent);
            await page.screenshot({ path: testInfo.outputPath(`duration-${width}-${index}.png`), animations: "disabled" });
            await page.mouse.move(0, 0);
            await expect(mark.locator(".archive-object-label")).not.toHaveClass(/is-positioned/);
          }
        }
      });

      test("stationary-pointer scrolling and resizing retain the hovered duration and clear departed periods", async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 600 });
        await open(page, `# Scroll\n#Archive\n# Archive\n${Array.from({ length: 48 }, (_, index) => entry(`Range ${index}`, ["2026-01-01 - 2026-12-31"])).join("\n\n")}`);
        await setTheme(page, theme);
        const content = page.locator(".archive-content");
        const marks = page.locator(".archive-active-segment");
        await marks.first().hover();
        const before = await durationGeometry(marks.first());
        await content.evaluate(node => { node.scrollTop = 4; });
        await settle(page);
        const partial = await durationGeometry(marks.first());
        expect(partial.label.top).toBeCloseTo(before.label.top - 4, 1);
        expect(partial.label.top).toBeCloseTo(partial.anchor.bottom + 8, 1);
        await content.evaluate(node => { node.scrollTop = 52; });
        await settle(page);
        await expect(marks.first().locator(".archive-object-label")).not.toHaveClass(/is-positioned/);
        const next = await durationGeometry(marks.nth(1));
        expect(next.label.top).toBeCloseTo(next.anchor.bottom + 8, 1);
        await page.setViewportSize({ width: 1231, height: 600 });
        await settle(page);
        const resized = await durationGeometry(marks.nth(1));
        expect(resized.label.top).toBeCloseTo(resized.anchor.bottom + 8, 1);
        expect(resized.label.height).toBeLessThanOrEqual(resized.lineHeight + .05);
        await content.evaluate(node => { node.scrollLeft = 80; });
        await settle(page);
        const horizontal = await durationGeometry(marks.nth(1));
        expect(horizontal.label.top).toBeCloseTo(horizontal.anchor.bottom + 8, 1);
        expect(horizontal.label.left).toBeGreaterThanOrEqual(horizontal.frozen.right + 3.9);
        await page.locator("#projectTitle").hover();
        await expect(page.locator(".archive-object-label.is-positioned")).toHaveCount(0);
        await page.locator("#showWorkspaceView").click();
        await expect(page.locator(".archive-object-label.is-positioned")).toHaveCount(0);
      });
    });
  }
}

/** @param {import("@playwright/test").Page} page @param {Buffer} png @param {Array<{x:number,y:number,width:number,height:number,color:number[]}>} samples */
async function pixelMasks(page, png, samples) {
  return page.evaluate(async ({ encoded, samples }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    context.drawImage(image, 0, 0);
    return samples.map(sample => {
      const pixels = context.getImageData(sample.x, sample.y, sample.width, sample.height).data;
      return Array.from({ length: sample.height }, (_, row) => Array.from({ length: sample.width }, (_, column) => {
        const offset = (row * sample.width + column) * 4;
        return sample.color.every((channel, index) => Math.abs(pixels[offset + index] - channel) <= 1) ? "1" : "0";
      }).join(""));
    });
  }, { encoded: png.toString("base64"), samples });
}

for (const theme of ["dark", "light"]) {
  for (const ratio of [1, 2]) {
    test.describe(`Archive corrected geometry (${theme}, DPR ${ratio})`, () => {
      test.use({ deviceScaleFactor: ratio });
      test("paired caps share dimensions and physical pixel coverage after resizing", async ({ page }, testInfo) => {
        await open(page, geometrySource);
        await setTheme(page, theme);
        for (const viewportWidth of [1441, 1231]) {
          await page.setViewportSize({ width: viewportWidth, height: 900 });
          await settle(page);
          await page.mouse.move(0, 0);
          const pairs = await page.locator(".archive-swimlane-feature").evaluateAll(rows => rows.flatMap(row => {
            const start = row.querySelector(".archive-track-start");
            const end = row.querySelector(".archive-track-end");
            if (!start || !end) return [];
            const cap = (/** @type {Element} */ node, /** @type {string} */ side) => {
              const bounds = node.getBoundingClientRect();
              const style = getComputedStyle(node, side);
              const canvas = document.createElement("canvas");
              canvas.width = canvas.height = 1;
              const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
              context.fillStyle = style.backgroundColor;
              context.fillRect(0, 0, 1, 1);
              return { x: bounds.left + parseFloat(style.left), y: bounds.top + parseFloat(style.top), width: parseFloat(style.width), height: parseFloat(style.height), color: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3) };
            };
            return [[cap(start, "::before"), cap(end, "::after")]];
          }));
          expect(pairs).toHaveLength(4);
          const samples = pairs.flatMap(pair => pair.map(cap => {
            expect(cap.width).toBe(3);
            expect(cap.height).toBe(28);
            expect(Math.abs(cap.x * ratio - Math.round(cap.x * ratio))).toBeLessThan(.04);
            return { x: Math.round(cap.x * ratio) - 2, y: Math.floor(cap.y * ratio) - 2, width: 3 * ratio + 4, height: 28 * ratio + 4, color: cap.color };
          }));
          const png = await page.screenshot({ path: testInfo.outputPath(`caps-${viewportWidth}.png`), animations: "disabled" });
          const masks = await pixelMasks(page, png, samples);
          for (let index = 0; index < masks.length; index += 2) {
            expect(masks[index], `start/end cap ${index / 2} at ${viewportWidth}`).toEqual(masks[index + 1]);
            expect(masks[index][14 * ratio].replaceAll("0", "")).toHaveLength(3 * ratio);
          }
        }
      });

      test("crosshair overlays minor, major and endpoint strokes with identical pixel coverage", async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1441, height: 900 });
        await open(page, geometrySource);
        await setTheme(page, theme);
        await page.addStyleTag({ content: ".archive-date-grid .archive-grid-path{stroke:#fff!important}.archive-swimlane-plot{background:transparent!important}.archive-crosshair-line{stroke:#fff!important;stroke-dasharray:none!important}.archive-swimlane-rows.pixel-grid-hidden>.archive-date-grid:not(.archive-crosshair-track){visibility:hidden}" });
        const timeline = page.locator(".archive-date-timeline");
        const rows = page.locator(".archive-swimlane-rows");
        for (const viewportWidth of [1441, 1231]) {
          await page.setViewportSize({ width: viewportWidth, height: 900 });
          await settle(page);
          const targets = await timeline.evaluate(node => {
            const plot = node.querySelector(".archive-swimlane-plot").getBoundingClientRect();
            const axis = /** @type {HTMLElement} */ (node.querySelector(".archive-date-axis"));
            return ["endpoint", "minor", "major"].map(level => {
              const path = /** @type {SVGPathElement} */ (node.querySelector(`.archive-swimlane-rows>.archive-date-grid .archive-grid-path-${level}`));
              const x = Number(path.getAttribute("d")?.match(/M([\d.]+)/)?.[1]);
              const day = level === "endpoint" ? 0 : Math.round(x / plot.width * Number(axis.dataset.archivePlotSpan));
              return { level, x: plot.left + x, pointerX: plot.left + day / Number(axis.dataset.archivePlotSpan) * plot.width, y: plot.bottom - 5, width: parseFloat(getComputedStyle(path).strokeWidth) };
            });
          });
          for (const target of targets) {
            await rows.evaluate(node => node.classList.remove("pixel-grid-hidden"));
            await page.mouse.move(0, 0);
            const sample = { x: Math.floor(target.x * ratio) - 5, y: Math.floor(target.y * ratio), width: 12, height: 1, color: [255, 255, 255] };
            const [gridMask] = await pixelMasks(page, await page.screenshot({ animations: "disabled" }), [sample]);
            await page.mouse.move(target.pointerX + .01, target.y);
            await expect(timeline).toHaveClass(/archive-crosshair-active/);
            const line = timeline.locator(".archive-crosshair-line");
            await expect(line).toHaveCSS("stroke-width", `${target.width}px`);
            const bounds = await line.boundingBox();
            expect(Math.abs(bounds.x + bounds.width / 2 - target.x)).toBeLessThan(.04);
            await rows.evaluate(node => node.classList.add("pixel-grid-hidden"));
            const [lineMask] = await pixelMasks(page, await page.screenshot({ path: testInfo.outputPath(`crosshair-${target.level}-${viewportWidth}.png`), animations: "disabled" }), [sample]);
            expect(lineMask, target.level).toEqual(gridMask);
            expect(lineMask[0].replaceAll("0", "")).toHaveLength(Math.round(target.width * ratio));
          }
        }
      });
    });
  }

  test(`Archive popover remains vertically aligned and labels reach the divider (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await open(page, large(48));
    await setTheme(page, theme);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const labels = page.locator(".archive-swimlane-label");
    const popover = page.locator("#archiveFeaturePopover");
    const content = page.locator(".archive-content");
    for (const index of [0, 3, 8]) {
      await labels.nth(index).click();
      const [anchor, bounds] = await Promise.all([labels.nth(index).boundingBox(), popover.boundingBox()]);
      expect(bounds.y).toBeCloseTo(anchor.y, 5);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(588.02);
      expect(await popover.evaluate(node => document.getAnimations().filter(animation => animation.effect instanceof KeyframeEffect && animation.effect.target === node).every(animation => /** @type {KeyframeEffect} */ (animation.effect).getKeyframes().every(frame => frame.transform === undefined)))).toBe(true);
      await popover.locator(".archive-feature-popover-close").click();
    }
    await labels.first().click();
    await content.evaluate(node => { node.scrollTop = 30; });
    await settle(page);
    await expect(popover.locator("h3")).toHaveText("Row 000");
    expect((await popover.boundingBox()).y).toBeCloseTo((await page.locator(".archive-date-axis").boundingBox()).y + (await page.locator(".archive-date-axis").boundingBox()).height, 5);
    await content.evaluate(node => { node.scrollTop = 0; });
    await popover.locator(".archive-feature-popover-close").click();
    for (const left of [0, 110]) {
      await content.evaluate((node, value) => { node.scrollLeft = value; }, left);
      await settle(page);
      const geometry = await labels.first().evaluate(node => {
        const label = node.getBoundingClientRect();
        const corner = document.querySelector(".archive-axis-corner").getBoundingClientRect();
        const plot = node.closest(".archive-swimlane-row").querySelector(".archive-swimlane-plot").getBoundingClientRect();
        return {labelRight:label.right,cornerRight:corner.right,plotLeft:plot.left};
      });
      expect(geometry.labelRight).toBeCloseTo(geometry.cornerRight, 5);
      if (!left) expect(geometry.labelRight).toBeCloseTo(geometry.plotLeft, 5);
      expect(geometry.labelRight).toBeGreaterThanOrEqual(geometry.plotLeft);
    }
  });
}

/** @param {import("@playwright/test").Page} page @param {string} source */
async function open(page, source) {
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    window.MDManager.files.open = async () => ({ handle: { name: "Archive.md" }, markdown });
    window.MDManager.files.remember = async () => {};
  }, source);
  await page.locator("#openFile").click();
  await page.locator("#showArchiveView").click();
  await settle(page);
}

/** @param {import("@playwright/test").Page} page */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** @param {import("@playwright/test").Page} page @param {string} theme */
async function setTheme(page, theme) {
  await page.evaluate(value => {
    if (document.body.dataset.theme !== `gruvbox-${value}`) window.MDManager.theme.next();
  }, theme);
  await settleTransitions(page);
}

/** @param {import("@playwright/test").Page} page */
async function settleTransitions(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {}))));
}

/** @param {import("@playwright/test").Page} page */
async function contrasts(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    const rgba = (/** @type {string} */ color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].map(value => value / 255);
    };
    const composite = (/** @type {number[]} */ foreground, /** @type {number[]} */ background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3])).concat(1);
    const luminance = (/** @type {number[]} */ color) => color.slice(0, 3).reduce((sum, value, index) => sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index], 0);
    const selectors = [".archive-range", ".archive-count", ".archive-grid-label:not([hidden])", ".archive-swimlane-version", ".archive-popover-section h4", ".archive-popover-metrics dt", ".archive-popover-tasks li", ".archive-collision-group>.archive-object-label.is-positioned"];
    return selectors.flatMap(selector => {
      const node = document.querySelector(selector);
      if (!node || node.closest("[hidden]")) return [];
      let background = rgba(getComputedStyle(document.body).backgroundColor);
      const ancestors = [];
      for (let ancestor = /** @type {HTMLElement | null} */ (node); ancestor; ancestor = ancestor.parentElement) ancestors.push(ancestor);
      for (const ancestor of ancestors.reverse()) background = composite(rgba(getComputedStyle(ancestor).backgroundColor), background);
      if ([".archive-range", ".archive-count"].includes(selector) || selector.startsWith(".archive-grid-label")) background = rgba(getComputedStyle(document.querySelector(".archive-axis-corner"), "::before").backgroundColor);
      const foreground = composite(rgba(getComputedStyle(node).color), background);
      const a = luminance(foreground), b = luminance(background);
      return [{ selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }];
    });
  });
}

for (const theme of ["dark", "light"]) {
  for (const ratio of [1, 2]) {
    test.describe(`${theme}, DPR ${ratio}`, () => {
      test.use({ deviceScaleFactor: ratio });
      test("Archive edge coordinates, labels, caps and secondary text agree", async ({ page }, testInfo) => {
        await open(page, edges);
        await setTheme(page, theme);
        const content = page.locator(".archive-content");
        expect(await content.evaluate(node => Math.max(0, node.scrollWidth - /** @type {HTMLElement} */ (node).offsetWidth))).toBe(0);
        const extent = await content.evaluate(node => node.scrollWidth);
        const points = page.locator(".archive-date-point");
        for (let index = 0; index < 2; index++) {
          const point = points.nth(index);
          const before = await point.boundingBox();
          const geometry = await point.evaluate(node => {
            const mark = node.getBoundingClientRect();
            const plot = node.closest(".archive-swimlane-plot").getBoundingClientRect();
            return { actual: mark.left + mark.width / 2, expected: plot.left + parseFloat(node.style.getPropertyValue("--archive-position")) / 100 * plot.width };
          });
          expect(Math.abs(geometry.actual - geometry.expected)).toBeLessThanOrEqual(index ? .51 / ratio : 1.02);
          await page.mouse.move(geometry.actual, before.y + before.height / 2 + 16);
          await expect(page.locator(".archive-crosshair-readout")).toHaveText(index ? "31.12.2026" : "01.01.2026");
          await point.hover();
          const label = point.locator(".archive-object-label");
          await expect(label).not.toHaveClass(/is-positioned/);
          await expect(label).toHaveText(index ? "31.12.2026" : "01.01.2026");
          await expect(label).toBeHidden();
          const readout = page.locator(".archive-crosshair-readout");
          await expect(readout).toHaveCSS("opacity", "1");
          await expect(readout).toHaveText(index ? "31.12.2026" : "01.01.2026");
          expect(await readout.evaluate(node => {
            const canvas = document.createElement("canvas");
            const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
            context.fillStyle = getComputedStyle(node).getPropertyValue("--orange");
            return context.fillStyle;
          })).toBe(await readout.evaluate(node => {
            const context = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
            context.fillStyle = getComputedStyle(node).borderTopColor;
            return context.fillStyle;
          }));
          const bounds = await readout.boundingBox();
          const frozen = await point.locator("xpath=ancestor::article").locator(".archive-swimlane-label").boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(frozen.x + frozen.width);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width - 11);
          expect(await point.boundingBox()).toEqual(before);
          expect(await content.evaluate(node => node.scrollWidth)).toBe(extent);
          await page.screenshot({ path: testInfo.outputPath(`edge-${index}.png`), animations: "disabled" });
        }
        const full = page.locator(".archive-swimlane-feature").filter({ hasText: "Full range" }).locator(".archive-active-segment");
        expect(await full.evaluate(node => [getComputedStyle(node, "::before").width, getComputedStyle(node, "::after").width])).toEqual(["3px", "3px"]);
        for (const value of await contrasts(page)) expect(value.ratio, value.selector).toBeGreaterThanOrEqual(4.5);
        const first = page.locator(".archive-swimlane-label").first();
        await first.hover();
        await settleTransitions(page);
        for (const value of await contrasts(page)) expect(value.ratio, `hover ${value.selector}`).toBeGreaterThanOrEqual(4.5);
        await first.click();
        await settleTransitions(page);
        for (const value of await contrasts(page)) expect(value.ratio, `selected ${value.selector}`).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
  test(`Archive frozen cells retain opaque paint through horizontal scrolling (${theme})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await open(page, large(48));
    await setTheme(page, theme);
    await page.mouse.move(0, 0);
    const label = page.locator(".archive-swimlane-label").first();
    const corner = page.locator(".archive-axis-corner");
    const [beforeLabel, beforeCorner] = await Promise.all([label.screenshot({ animations: "disabled" }), corner.screenshot({ animations: "disabled" })]);
    await page.locator(".archive-content").evaluate(node => { node.scrollLeft = 110; });
    await settle(page);
    expect(await label.screenshot({ animations: "disabled" })).toEqual(beforeLabel);
    expect(await corner.screenshot({ animations: "disabled" })).toEqual(beforeCorner);
    await page.locator(".archive-content").evaluate(node => { node.scrollTop = 450; });
    await page.screenshot({ path: testInfo.outputPath("scrolled.png"), animations: "disabled" });
    const visible = page.locator(".archive-swimlane-label").nth(10);
    await visible.hover();
    expect(await visible.evaluate(node => getComputedStyle(node).backgroundColor)).not.toMatch(/\/|rgba/);
  });
}

test("Archive collision hover names all dense dates and restores isolated marks after resize", async ({ page }, testInfo) => {
  await open(page, `# Dense\n#Archive\n# Archive\n${entry("Span", ["2020-01-01 - 2030-12-31"])}\n\n${entry("Dense", ["2026-01-01 - 2026-01-02", "2026-01-03 - 2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07"])}\n${entry("Following", ["2026-01-01 - 2030-12-31"])}`);
  const group = page.locator(".archive-collision-group");
  await expect(group).toHaveCount(1);
  await expect(group.locator(".archive-mark-count")).toHaveText("5");
  await group.locator(".archive-mark-count").hover();
  const label = group.locator(".archive-object-label");
  await expect(label).toHaveClass(/is-positioned/);
  await expect(label).toHaveText("01.01.2026 - 02.01.2026 (2 days)\n03.01.2026 - 04.01.2026 (2 days)\n05.01.2026\n06.01.2026\n07.01.2026");
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    expect(await label.evaluate(node => getComputedStyle(node).backgroundColor)).not.toMatch(/\/|rgba/);
    for (const value of await contrasts(page)) expect(value.ratio, `${theme} ${value.selector}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({ path: testInfo.outputPath("dense.png"), animations: "disabled" });
  const extent = await page.locator(".archive-content").evaluate(node => node.scrollWidth);
  await label.hover();
  expect(await page.locator(".archive-content").evaluate(node => node.scrollWidth)).toBe(extent);
  await page.setViewportSize({ width: 800, height: 600 });
  await open(page, `# Resize\n#Archive\n# Archive\n${entry("Span", ["2026-01-01 - 2026-12-31"])}\n${entry("Near", ["2026-01-10", "2026-01-14"])}`);
  await expect(page.locator(".archive-mark-count")).toHaveText("2");
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect(page.locator(".archive-mark-count")).toHaveCount(0);
  await expect(page.locator(".archive-collision-member")).toHaveCount(0);
  await expect(page.locator(".archive-date-point>.archive-object-label")).toHaveText(["10.01.2026", "14.01.2026"]);
});

test("Archive crosshair reuses its date text and leaves unchanged days and root classes untouched", async ({ page }) => {
  await open(page, large(48));
  const evidence = await page.evaluate(async () => {
    const archive = document.getElementById("archive");
    const timeline = document.querySelector(".archive-date-timeline");
    const plot = document.querySelector(".archive-swimlane-plot");
    const axis = /** @type {HTMLElement} */ (document.querySelector(".archive-date-axis"));
    const badge = document.querySelector(".archive-crosshair-readout");
    const line = document.querySelector(".archive-crosshair-line");
    const bounds = plot.getBoundingClientRect();
    /** @type {MutationRecord[]} */
    const records = [];
    const observer = new MutationObserver(batch => records.push(...batch));
    observer.observe(archive, { attributes: true, attributeFilter: ["class"] });
    observer.observe(timeline, { attributes: true, attributeFilter: ["class"] });
    observer.observe(line, { attributes: true, attributeFilter: ["d"] });
    observer.observe(badge, { childList: true, characterData: true, subtree: true });
    const move = async (/** @type {number} */ dayOffset) => {
      for (let index = 0; index < 20; index++) plot.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: bounds.left + dayOffset / Number(axis.dataset.archivePlotSpan) * bounds.width, clientY: bounds.top + 4 }));
      await new Promise(resolve => requestAnimationFrame(resolve));
    };
    await move(10);
    const textNode = badge.firstChild;
    await move(10);
    await move(10);
    await move(11);
    records.push(...observer.takeRecords());
    observer.disconnect();
    return {
      sameTextNode: badge.firstChild === textNode,
      text: badge.textContent,
      archiveClasses: records.filter(record => record.target === archive).length,
      timelineClasses: records.filter(record => record.target === timeline).length,
      paths: records.filter(record => record.target === line).length,
      badgeChildren: records.filter(record => record.target === badge && record.type === "childList").length
    };
  });
  expect(evidence.sameTextNode).toBe(true);
  expect(evidence.text).toBe("10.01.2026");
  expect(evidence.archiveClasses).toBeLessThanOrEqual(1);
  expect(evidence.timelineClasses).toBe(1);
  expect(evidence.paths).toBe(2);
  expect(evidence.badgeChildren).toBeLessThanOrEqual(1);
});

test("Archive scrolling retains partial anchors and closes fully hidden rows without switching features", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await open(page, large(48));
  const content = page.locator(".archive-content");
  const toggles = page.locator(".archive-swimlane-label");
  const title = page.locator(".archive-popover-title");
  await toggles.first().click();
  await content.evaluate(node => { node.scrollTop = 51; });
  await settle(page);
  await expect(title).toHaveText("Row 000");
  await content.evaluate(node => { node.scrollTop = 52; });
  await expect(page.locator("#archiveFeaturePopover")).toBeHidden();
  await expect(page.locator('.archive-feature-toggle[aria-expanded="true"]')).toHaveCount(0);
  await toggles.nth(21).click();
  await expect(title).toHaveText("Row 021");
  await content.evaluate(node => { node.scrollTop = 1100; });
  await expect(title).toHaveText("Row 021");
  await expect(page.locator('.archive-feature-toggle[aria-expanded="true"]')).toHaveCount(1);
  await content.evaluate(node => { node.scrollTop = 0; });
  await expect(page.locator("#archiveFeaturePopover")).toBeHidden();
  await toggles.first().click();
  await expect(title).toHaveText("Row 000");
  await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.locator("#archiveFeaturePopover")).toBeHidden();
  await expect(page.locator('.archive-feature-toggle[aria-expanded="true"]')).toHaveCount(0);
});

test("Archive is mouse-operated while Workspace shortcuts still work", async ({ page }) => {
  await open(page, large(48));
  await page.evaluate(() => {
    window.__archiveOpenCalls = window.__archiveSaveCalls = 0;
    window.MDManager.files.open = async () => { window.__archiveOpenCalls++; return null; };
    window.MDManager.files.save = async () => { window.__archiveSaveCalls++; };
  });
  await page.locator(".archive-swimlane-label").first().click();
  await page.locator(".archive-popover-unarchive").click();
  await expect(page.locator(".archive-swimlane-label")).toHaveCount(47);
  await page.locator(".archive-swimlane-label").first().click();
  const popover = page.locator("#archiveFeaturePopover");
  const action = popover.locator(".archive-popover-unarchive");
  await action.focus();
  const before = await page.locator(".archive-content").evaluate(node => [node.scrollLeft, node.scrollTop]);
  for (const key of ["Enter", "Space", "Tab", "Shift+Tab", "Escape", "ArrowDown", "ArrowRight", "PageDown", "End", "Home", "w", "f", "a", "b", "p", "s", "Control+s", "Control+o", "Control+z", "Control+Shift+z", "Control+y"]) await page.keyboard.press(key);
  await expect(page.locator("#archive")).toBeVisible();
  await expect(popover).toBeVisible();
  await expect(page.locator(".archive-swimlane-label")).toHaveCount(47);
  await expect(page.locator("#searchPalette")).toBeHidden();
  expect(await page.evaluate(() => [window.__archiveOpenCalls, window.__archiveSaveCalls])).toEqual([0, 0]);
  expect(await page.locator(".archive-content").evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual(before);
  expect(await page.locator("#archive button").evaluateAll(nodes => nodes.every(node => node.tabIndex === -1))).toBe(true);
  await popover.locator(".archive-feature-popover-close").click();
  await expect(popover).toBeHidden();
  await page.locator("#showWorkspaceView").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".archive-swimlane-label")).toHaveCount(48);
  await page.locator("#showWorkspaceView").click();
  await page.keyboard.press("f");
  await expect(page.locator("#searchPalette")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#searchPalette")).toBeHidden();
});

test("Archive scrolling closes undated anchors and closes when no row can be visible", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await open(page, `# Undated\n#Archive\n# Archive\n${Array.from({ length: 96 }, (_, index) => entry(`Card ${String(index).padStart(3, "0")}`, ["TBD"])).join("\n\n")}`);
  await page.locator(".archive-feature-toggle").first().click();
  await page.locator(".archive-content").evaluate(node => { node.scrollTop = 1000; });
  await settle(page);
  await expect(page.locator("#archiveFeaturePopover")).toBeHidden();
  await expect(page.locator('.archive-feature-toggle[aria-expanded="true"]')).toHaveCount(0);
  await page.locator(".archive-content").evaluate(node => { node.scrollTop = 0; });
  await page.locator(".archive-feature-toggle").first().click();
  await expect(page.locator(".archive-popover-title")).toHaveAttribute("data-full-title", "Card 000");
  await open(page, large(48));
  await page.locator(".archive-swimlane-label").first().click();
  await page.setViewportSize({ width: 1024, height: 100 });
  await expect(page.locator("#archiveFeaturePopover")).toBeHidden();
  await expect(page.locator('.archive-feature-toggle[aria-expanded="true"]')).toHaveCount(0);
});

test("Archive popover titles use the existing single-line hover marquee", async ({ page }) => {
  const title = "An archived title with many words that continues well beyond the available heading width and remains one line";
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, `# Titles\n#Archive\n# Archive\n${entry(title, ["2026-01-01"])}`);
  const rowTitle = page.locator(".archive-feature-title");
  await rowTitle.hover();
  await expect(rowTitle).toHaveClass(/title-scroll/);
  await page.locator(".archive-feature-toggle").click();
  const heading = page.locator(".archive-popover-title");
  await heading.hover();
  await expect(heading).toHaveClass(/title-scroll/);
  await expect(heading.locator(".title-text")).toHaveText(title);
  await page.evaluate(async () => {
    window.__archiveTitleMutations = 0;
    const observer = new MutationObserver(records => { window.__archiveTitleMutations += records.length; });
    document.querySelectorAll("#archive .title-text").forEach(node => observer.observe(node, { childList: true, characterData: true, subtree: true }));
    window.MDManager.layout.layout();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
  });
  await expect(heading.locator(".title-text")).toHaveText(title);
  expect(await page.evaluate(() => window.__archiveTitleMutations)).toBe(0);
  await expect(heading).toHaveCSS("white-space", "nowrap");
  await expect(heading.locator(".title-text")).toHaveCSS("animation-name", "title-scroll");
  await page.mouse.move(0, 0);
  await expect(heading).not.toHaveClass(/title-scroll/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await heading.hover();
  await expect(heading).toHaveClass(/title-scroll/);
  await expect(heading.locator(".title-text")).toHaveCSS("animation-duration", "1e-05s");
});
