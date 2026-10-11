const { test, expect } = require("./fixtures");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appUrl = pathToFileURL(path.resolve(__dirname, "../../MD_Manager.html")).href;
const entry = (/** @type {string} */ title, /** @type {string} */ date) => `## ${title}\n#Version\n- 1.0.0\n#Date\n${date.split(" | ").map(range => `- ${range}`).join("\n")}\n### Done\n- [x] done`;
const source = `# Caps\n#Archive\n# Archive\n${[
  entry("Long", "2026-01-03 - 2026-02-17"),
  entry("Middle", "2026-02-09 - 2026-03-04"),
  entry("Odd", "2026-03-11 - 2026-03-26"),
  entry("Late", "2026-04-02 - 2026-05-29"),
  entry("Short", "2026-05-12 - 2026-05-13"),
  entry("Brief", "2026-06-01 - 2026-06-02"),
  entry("Paused", "2026-01-05 - 2026-01-20 | 2026-02-02 - 2026-02-03 | 2026-03-01 - 2026-04-10")
].join("\n\n")}`;

// Device pixel ratio emulation lays boxes out differently from a real scaled display, so these
// tests run a browser with a real device scale factor, as on a scaled Windows desktop.
for (const ratio of [1.25, 1.5, 1.75]) {
  for (const width of [1440, 1291]) {
    test(`start and end caps rasterise mirror-symmetrically at a real device scale factor of ${ratio} (${width}px)`, async ({ playwright }) => {
      const browser = await playwright.chromium.launch({ args: [`--force-device-scale-factor=${ratio}`, `--window-size=${width},900`] });
      try {
        const page = await browser.newPage({ viewport: null, deviceScaleFactor: undefined });
        /** @type {string[]} */
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(appUrl);
        await page.evaluate(markdown => {
          window.MDManager.files.open = async () => ({ handle: { name: "Caps.md" }, markdown });
          window.MDManager.files.remember = async () => {};
        }, source);
        await page.locator("#openFile").click();
        await page.locator("#showArchiveView").click();
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(ratio);
        await page.evaluate(() => document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
        const edges = await page.evaluate(() => [...document.querySelectorAll(".archive-active-segment.archive-track-start.archive-track-end")].map(segment => {
          const body = segment.classList.contains("archive-short-segment") ? /** @type {Element} */ (segment.querySelector(".archive-short-band")) : segment;
          const bounds = body.getBoundingClientRect();
          return { left: bounds.left * devicePixelRatio, right: bounds.right * devicePixelRatio, y: Math.round((bounds.top + bounds.height / 2) * devicePixelRatio) };
        }));
        expect(edges.length).toBe(6);
        for (const edge of edges) {
          expect(edge.left).toBeCloseTo(Math.round(edge.left), 1);
          expect(edge.right).toBeCloseTo(Math.round(edge.right), 1);
        }
        const screenshot = (await page.screenshot({ scale: "device" })).toString("base64");
        const profiles = await page.evaluate(async ({ data, edges }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
          context.drawImage(image, 0, 0);
          return edges.map(edge => {
            const row = context.getImageData(0, edge.y, image.width, 1).data;
            const pixel = (/** @type {number} */ x) => [row[x * 4], row[x * 4 + 1], row[x * 4 + 2]];
            const left = Math.round(edge.left);
            const right = Math.round(edge.right) - 1;
            const fill = pixel(Math.floor((left + right) / 2));
            const distance = (/** @type {number[]} */ color) => Math.abs(color[0] - fill[0]) + Math.abs(color[1] - fill[1]) + Math.abs(color[2] - fill[2]);
            const start = [];
            const end = [];
            for (let offset = 0; offset < Math.min(8, Math.floor((right - left) / 2)); offset += 1) {
              start.push(distance(pixel(left + offset)));
              end.push(distance(pixel(right - offset)));
            }
            return { start, end };
          });
        }, { data: screenshot, edges });
        for (const profile of profiles) {
          expect(profile.start.some(value => value > 24)).toBe(true);
          profile.start.forEach((value, index) => expect(Math.abs(value - profile.end[index])).toBeLessThanOrEqual(6));
        }
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
}

test("caps mark only lane ends, pause edges stay plain, and no range carries an extra ring", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    window.MDManager.files.open = async () => ({ handle: { name: "Caps.md" }, markdown });
    window.MDManager.files.remember = async () => {};
  }, source);
  await page.locator("#openFile").click();
  await page.locator("#showArchiveView").click();
  await expect(page.locator(".archive-pause-segment")).toHaveCount(2);
  const lanes = await page.locator(".archive-swimlane-feature").evaluateAll(rows => rows.map(row => [...row.querySelectorAll(".archive-active-segment")].map(node => {
    const body = node.classList.contains("archive-short-segment") ? /** @type {Element} */ (node.querySelector(".archive-short-band")) : node;
    const style = getComputedStyle(body);
    const cap = (/** @type {string} */ side) => {
      const pseudo = getComputedStyle(node, side);
      return [pseudo.content, pseudo.width, pseudo.top, pseudo.bottom, pseudo.backgroundColor].join(" ");
    };
    return { short: node.classList.contains("archive-short-segment"), start: cap("::before"), end: cap("::after"), shadow: style.boxShadow, image: style.backgroundImage };
  })));
  const ranges = lanes.flat();
  expect(ranges).toHaveLength(9);
  expect(ranges.some(range => range.short)).toBe(true);
  const laneCap = lanes[0][0].start;
  expect(laneCap).toMatch(/^"" /);
  for (const lane of lanes) {
    lane.forEach((range, index) => {
      expect(range.start).toBe(index === 0 ? laneCap : "none auto auto auto rgba(0, 0, 0, 0)");
      expect(range.end).toBe(index === lane.length - 1 ? laneCap : "none auto auto auto rgba(0, 0, 0, 0)");
      expect(range.shadow).toBe(ranges[0].shadow);
      expect(range.image).toBe(ranges[0].image);
    });
  }
  expect(lanes.some(lane => lane.length === 3)).toBe(true);
});

test("over a multi-year span no range is drawn narrower than the single-day diamond", async ({ page }) => {
  const years = `# Years\n#Archive\n# Archive\n${[
    entry("One day", "2021-03-01"),
    entry("Two days", "2022-06-01 - 2022-06-02"),
    entry("Five days", "2024-09-02 - 2024-09-06"),
    entry("Long", "2021-01-04 - 2025-12-31")
  ].join("\n\n")}`;
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    window.MDManager.files.open = async () => ({ handle: { name: "Years.md" }, markdown });
    window.MDManager.files.remember = async () => {};
  }, years);
  await page.locator("#openFile").click();
  await page.locator("#showArchiveView").click();
  await expect(page.locator(".archive-short-segment")).toHaveCount(2);
  const geometry = await page.evaluate(() => {
    const marker = getComputedStyle(/** @type {Element} */ (document.querySelector(".archive-date-point")), "::before");
    return {
      diamond: parseFloat(marker.width) * Math.SQRT2,
      bands: [...document.querySelectorAll(".archive-short-segment > .archive-short-band")].map(band => band.getBoundingClientRect().width)
    };
  });
  expect(geometry.bands).toHaveLength(2);
  for (const band of geometry.bands) {
    expect(band).toBeGreaterThanOrEqual(geometry.diamond);
    expect(band - geometry.diamond).toBeLessThan(1);
  }
});
