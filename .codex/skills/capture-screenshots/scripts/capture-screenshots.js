"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const WIDTH = 2540;
const HEIGHT = 1440;
const DIAGONAL_COLOR = "#504945";
const DIAGONAL_WIDTH = 8;
const SURFACES = ["workspace", "task-editor", "archive"];

/** @param {string} filename @returns {string} */
function safeStem(filename) {
  const stem = path.parse(filename).name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

/** @param {string} dataDirectory @returns {{path: string, name: string, stem: string}[]} */
function discoverMarkdownFiles(dataDirectory) {
  if (!fs.existsSync(dataDirectory) || !fs.statSync(dataDirectory).isDirectory()) {
    throw new Error(`Screenshot data directory does not exist: ${dataDirectory}`);
  }
  const filenames = fs.readdirSync(dataDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.md$/i.test(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }));
  if (!filenames.length) throw new Error(`Screenshot data directory contains no Markdown files: ${dataDirectory}`);

  /** @type {Map<string, number>} */
  const stemCounts = new Map();
  return filenames.map(name => {
    const base = safeStem(name);
    const count = (stemCounts.get(base) || 0) + 1;
    stemCounts.set(base, count);
    return { path: path.join(dataDirectory, name), name, stem: count === 1 ? base : `${base}-${count}` };
  });
}

/** @param {string} screenshotDirectory @param {{stem: string}[]} inputs @returns {{prefix: string, dark: string, light: string, modified: string}[]} */
function plannedPairs(screenshotDirectory, inputs) {
  const sourceDirectory = path.join(screenshotDirectory, "source");
  const modifiedDirectory = path.join(screenshotDirectory, "modified");
  const prefixes = ["start"];
  for (const input of inputs) {
    for (const surface of SURFACES) prefixes.push(`${input.stem}-${surface}`);
  }
  return prefixes.map(prefix => ({
    prefix,
    dark: path.join(sourceDirectory, `${prefix}-dark.png`),
    light: path.join(sourceDirectory, `${prefix}-light.png`),
    modified: path.join(modifiedDirectory, `${prefix}.png`)
  }));
}

/** @param {string} screenshotDirectory @param {{stem: string}[]} inputs @returns {string[]} */
function plannedOutputPaths(screenshotDirectory, inputs) {
  return plannedPairs(screenshotDirectory, inputs).flatMap(pair => [pair.dark, pair.light, pair.modified]);
}

/** @param {string} filename @returns {{width: number, height: number}} */
function pngDimensions(filename) {
  const header = Buffer.alloc(24);
  const descriptor = fs.openSync(filename, "r");
  try {
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length || header.toString("ascii", 1, 4) !== "PNG") {
      throw new Error(`Screenshot is not a valid PNG: ${filename}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** @param {import("playwright").Page} page @param {"dark" | "light"} theme */
async function setTheme(page, theme) {
  const expected = `gruvbox-${theme}`;
  for (let attempts = 0; attempts < 2; attempts += 1) {
    if (await page.locator("body").getAttribute("data-theme") === expected) return;
    await page.evaluate(() => window.MDManager.theme.next());
  }
  throw new Error(`Could not activate ${theme} mode.`);
}

/** @param {import("playwright").Page} page */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const fontsReady = await page.evaluate(() => document.fonts.check('12px "Inter"') && document.fonts.check('12px "JetBrains Mono"'));
  if (!fontsReady) throw new Error("Repository-local fonts did not load.");
}

/** @param {import("playwright").Page} page @param {string} filename */
async function capture(page, filename) {
  await settle(page);
  await page.screenshot({ path: filename, animations: "disabled", caret: "hide" });
  const dimensions = pngDimensions(filename);
  if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
    throw new Error(`Screenshot has incorrect dimensions ${dimensions.width}x${dimensions.height}: ${filename}`);
  }
}

/** @param {import("playwright").Page} page @param {string} outputDirectory @param {string} prefix */
async function captureThemePair(page, outputDirectory, prefix) {
  for (const theme of ["dark", "light"]) {
    await setTheme(page, /** @type {"dark" | "light"} */ (theme));
    await capture(page, path.join(outputDirectory, `${prefix}${theme}.png`));
  }
}

/** @param {import("playwright").Page} page @param {string[]} errors */
async function waitForStart(page, errors) {
  await page.waitForFunction(() => document.body.dataset.startupState === "ready");
  await settle(page);
  if (errors.length) throw new Error(errors.join("\n"));
}

/** @param {import("playwright").Page} page */
async function waitForNotificationsToClear(page) {
  await page.waitForFunction(() => !document.querySelector("#notifications .notification"));
}

/** @param {import("playwright").Browser} browser */
async function createPage(browser) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce"
  });
  await context.addInitScript({ content: `
    const NativeDate = Date;
    const fixedTime = Date.parse("2026-01-15T12:34:56Z");
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedTime])); }
      static now() { return fixedTime; }
    };
  ` });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(`Browser console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`Browser page error: ${error.message}`));
  return { page, errors, close: () => context.close() };
}

/** @param {import("playwright").Browser} browser @param {string} appUrl @param {string} outputDirectory */
async function captureStartPage(browser, appUrl, outputDirectory) {
  const { page, errors, close } = await createPage(browser);
  try {
    await page.goto(appUrl);
    await waitForStart(page, errors);
    await captureThemePair(page, outputDirectory, "start-");
    if (errors.length) throw new Error(errors.join("\n"));
  } finally {
    await close();
  }
}

/** @param {import("playwright").Page} page */
async function expandWorkspace(page) {
  const features = page.locator("#content > .release");
  for (let index = 0; index < await features.count(); index += 1) {
    const feature = features.nth(index);
    const collapsible = feature.locator(".card:not(.bodyless-task), .feature-note");
    if (!await collapsible.count()) continue;
    const allExpanded = await collapsible.evaluateAll(items => items.every(item => item.getAttribute("aria-expanded") === "true"));
    if (!allExpanded) await feature.locator(".release-header").click();
  }
  await page.waitForFunction(() => [...document.querySelectorAll("#content > .release .card:not(.bodyless-task), #content > .release .feature-note")]
    .every(item => item.getAttribute("aria-expanded") === "true"));
  await page.locator("#content").evaluate(element => {
    element.scrollLeft = element.scrollWidth;
    element.scrollTop = element.scrollHeight;
  });
}

/** @param {import("playwright").Page} page */
async function openLastTaskEditor(page) {
  const tasks = page.locator("#content > .release .card");
  const count = await tasks.count();
  if (!count) throw new Error("Project contains no Workspace task for the task-editor screenshot.");
  const task = tasks.nth(count - 1);
  await task.locator(".card-header").hover();
  await task.locator('[data-edit="task"]').click();
  await page.locator("#taskEditor").waitFor({ state: "visible" });
}

/** @param {import("playwright").Page} page */
async function openAndExpandArchive(page) {
  await page.locator("#showArchiveView").click();
  const toggles = page.locator("#archive .archive-feature-toggle");
  for (let index = 0; index < await toggles.count(); index += 1) {
    const toggle = toggles.nth(index);
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  }
  await page.waitForFunction(() => [...document.querySelectorAll("#archive .archive-feature-toggle")]
    .every(toggle => toggle.getAttribute("aria-expanded") === "true"));
  await page.locator("#archive .archive-content").evaluate(element => {
    element.scrollLeft = element.scrollWidth;
    element.scrollTop = element.scrollHeight;
  });
}

/** @param {import("playwright").Browser} browser @param {string} appUrl @param {{path: string, name: string, stem: string}} input @param {string} outputDirectory */
async function captureProject(browser, appUrl, input, outputDirectory) {
  const markdown = fs.readFileSync(input.path, "utf8");
  const { page, errors, close } = await createPage(browser);
  try {
    await page.goto(appUrl);
    await waitForStart(page, errors);
    await page.evaluate(({ source, filename }) => {
      const handle = { name: filename };
      window.MDManager.files.open = async () => ({ handle, markdown: source });
      window.MDManager.files.remember = async () => {};
    }, { source: markdown, filename: input.name });
    await page.getByRole("button", { name: "Open File", exact: true }).click();
    await page.waitForFunction(() => !document.body.classList.contains("start-view"));

    await expandWorkspace(page);
    await waitForNotificationsToClear(page);
    await captureThemePair(page, outputDirectory, `${input.stem}-workspace-`);

    await setTheme(page, "dark");
    await openLastTaskEditor(page);
    await captureThemePair(page, outputDirectory, `${input.stem}-task-editor-`);
    await page.locator("#closeTaskEditor").click();
    await page.locator("#taskEditor").waitFor({ state: "hidden" });

    await openAndExpandArchive(page);
    await captureThemePair(page, outputDirectory, `${input.stem}-archive-`);
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (error) {
    throw new Error(`${input.name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await close();
  }
}

/** @param {import("playwright").Page} page @param {{prefix: string, dark: string, light: string, modified: string}} pair */
async function composePair(page, pair) {
  const dark = `data:image/png;base64,${fs.readFileSync(pair.dark).toString("base64")}`;
  const light = `data:image/png;base64,${fs.readFileSync(pair.light).toString("base64")}`;
  const result = await page.evaluate(async ({ darkSource, lightSource, width, height, lineColor, lineWidth }) => {
    /** @param {string} source @returns {Promise<HTMLImageElement>} */
    const loadImage = source => new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", () => reject(new Error("Could not decode source screenshot.")), { once: true });
      image.src = source;
    });
    const [darkImage, lightImage] = await Promise.all([loadImage(darkSource), loadImage(lightSource)]);
    if (darkImage.width !== width || darkImage.height !== height || lightImage.width !== width || lightImage.height !== height) {
      throw new Error("Source screenshots do not have the required dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not create composite canvas context.");
    context.imageSmoothingEnabled = false;
    context.drawImage(darkImage, 0, 0);
    context.save();
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(width, 0);
    context.lineTo(width, height);
    context.closePath();
    context.clip();
    context.drawImage(lightImage, 0, 0);
    context.restore();
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(width, 0);
    context.lineWidth = lineWidth;
    context.lineCap = "butt";
    context.strokeStyle = lineColor;
    context.stroke();

    /** @param {number} x @param {number} y @returns {number[]} */
    const sample = (x, y) => [...context.getImageData(x, y, 1, 1).data];
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
    if (!sourceContext) throw new Error("Could not create source validation canvas context.");
    sourceContext.drawImage(darkImage, 0, 0);
    const expectedDark = [...sourceContext.getImageData(width / 4, height / 4, 1, 1).data];
    sourceContext.drawImage(lightImage, 0, 0);
    const expectedLight = [...sourceContext.getImageData(width * 3 / 4, height * 3 / 4, 1, 1).data];
    return {
      png: canvas.toDataURL("image/png").slice("data:image/png;base64,".length),
      upperMatchesDark: sample(width / 4, height / 4).every((value, index) => value === expectedDark[index]),
      lowerMatchesLight: sample(width * 3 / 4, height * 3 / 4).every((value, index) => value === expectedLight[index]),
      center: sample(width / 2, height / 2)
    };
  }, {
    darkSource: dark,
    lightSource: light,
    width: WIDTH,
    height: HEIGHT,
    lineColor: DIAGONAL_COLOR,
    lineWidth: DIAGONAL_WIDTH
  });
  if (!result.upperMatchesDark || !result.lowerMatchesLight || result.center.slice(0, 3).join(",") !== "80,73,69") {
    throw new Error(`Composite geometry validation failed for ${pair.prefix}.`);
  }
  fs.writeFileSync(pair.modified, Buffer.from(result.png, "base64"));
  const dimensions = pngDimensions(pair.modified);
  if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
    throw new Error(`Composite has incorrect dimensions ${dimensions.width}x${dimensions.height}: ${pair.modified}`);
  }
}

/** @param {import("playwright").Browser} browser @param {{prefix: string, dark: string, light: string, modified: string}[]} pairs */
async function composePairs(browser, pairs) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  try {
    await page.setContent("<!doctype html><title>Screenshot compositor</title>");
    for (const pair of pairs) await composePair(page, pair);
  } finally {
    await page.close();
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, "../../../..");
  const dataDirectory = path.join(projectRoot, "res", "screenshots", "data");
  const screenshotDirectory = path.join(projectRoot, "res", "screenshots");
  const sourceDirectory = path.join(screenshotDirectory, "source");
  const modifiedDirectory = path.join(screenshotDirectory, "modified");
  const inputs = discoverMarkdownFiles(dataDirectory);
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(modifiedDirectory, { recursive: true });
  const appUrl = pathToFileURL(path.join(projectRoot, "MD_Manager.html")).href;
  const browser = await chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    await captureStartPage(browser, appUrl, sourceDirectory);
    for (const input of inputs) await captureProject(browser, appUrl, input, sourceDirectory);
    await composePairs(browser, plannedPairs(screenshotDirectory, inputs));
  } finally {
    await browser.close();
  }
  const pairs = plannedPairs(screenshotDirectory, inputs);
  process.stdout.write(`Captured ${pairs.length * 2} source screenshots and generated ${pairs.length} composites from ${inputs.length} Markdown files in ${screenshotDirectory}\n`);
}

module.exports = {
  DIAGONAL_COLOR,
  DIAGONAL_WIDTH,
  HEIGHT,
  WIDTH,
  discoverMarkdownFiles,
  plannedOutputPaths,
  plannedPairs,
  pngDimensions,
  safeStem
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
