const { test, expect } = require("./fixtures");
const path = require("node:path");

const appUrl = `file:///${path.resolve(__dirname, "../../MD_Manager.html").replaceAll("\\", "/")}`;
const editorFixture = "# A\n\n## Feature\n### Task\n- [ ] A item";

/** @param {import("@playwright/test").Page} page @param {string} source */
async function openFixture(page, source) {
  await page.goto(appUrl);
  await page.evaluate(markdown => {
    window.MDManager.files.open = async () => ({ handle: { name: "Review.md" }, markdown });
    window.MDManager.files.remember = async () => {};
    window.MDManager.files.save = async (/** @type {unknown} */ _handle, /** @type {string} */ value) => { window.__reviewSaved = value; };
  }, source);
  await page.locator("#openFile").click();
  await expect(page.locator("#projectTitle")).toHaveText(source.match(/^# (.+)/)?.[1] || "");
}

/** @param {import("@playwright/test").Page} page @param {"task" | "feature"} kind */
async function openEditor(page, kind) {
  if (kind === "task") {
    await page.locator(".card-header").hover();
    await page.locator('[data-edit="task"]').click();
  } else {
    await page.locator(".release-heading").hover();
    await page.locator(".feature-menu-button").click();
    await page.locator('[data-edit="feature"]').click();
  }
}

for (const kind of ["task", "feature"]) {
  test(`file-opening shortcuts preserve an open ${kind} editor and its draft`, async ({ page }) => {
    await openFixture(page, editorFixture);
    await page.evaluate(() => {
      window.__reviewOpenCount = 0;
      window.MDManager.files.open = async () => {
        window.__reviewOpenCount++;
        return { handle: { name: "B.md" }, markdown: "# B\n## B feature\n### B task\n- [ ] B item" };
      };
    });
    await openEditor(page, /** @type {"task" | "feature"} */ (kind));
    await page.locator(`#${kind}EditorTitle`).fill("Draft title");
    for (const shortcut of ["Control+o", "Meta+o"]) await page.keyboard.press(shortcut);
    expect(await page.evaluate(() => window.__reviewOpenCount)).toBe(0);
    await expect(page.locator(`#${kind}Editor`)).toBeVisible();
    await expect(page.locator(`#${kind}EditorTitle`)).toHaveValue("Draft title");
    await expect(page.locator("#projectTitle")).toHaveText("A");
    await page.locator(kind === "task" ? "#cancelTaskEditor" : "#cancelFeatureEditor").click();
    await page.keyboard.press("Control+o");
    await expect(page.locator("#projectTitle")).toHaveText("B");
  });

  test(`project replacement closes the ${kind} editor and rejects its stale callback`, async ({ page }) => {
    await openFixture(page, editorFixture);
    await page.evaluate(kind => {
      const method = kind === "task" ? "open" : "openFeature";
      const original = window.MDManager.editor[method];
      /** @param {...any} args */
      window.MDManager.editor[method] = (...args) => {
        window.__reviewDraftCallback = args[2];
        original(...args);
      };
      window.MDManager.files.open = () => new Promise(resolve => {
        window.__reviewFinishOpen = () => resolve({ handle: { name: "B.md" }, markdown: "# B\n## B feature\n### B task\n- [ ] B item" });
      });
    }, kind);
    await page.keyboard.press("Control+o");
    await expect.poll(() => page.evaluate(() => typeof window.__reviewFinishOpen)).toBe("function");
    await openEditor(page, /** @type {"task" | "feature"} */ (kind));
    await page.locator(`#${kind}EditorTitle`).fill("Stale draft");
    await page.evaluate(() => window.__reviewFinishOpen());
    await expect(page.locator("#projectTitle")).toHaveText("B");
    await expect(page.locator(`#${kind}Editor`)).not.toBeVisible();
    await page.evaluate(kind => {
      window.__reviewDraftCallback(kind === "task" ? { title: "Stale draft", lines: ["- [ ] Stale item"] } : { title: "Stale draft", metadata: "", info: "", warn: "" });
    }, kind);
    await expect(page.locator(".release-title")).toHaveAttribute("data-full-title", "B feature");
    await expect(page.locator(".card-title")).toHaveAttribute("data-full-title", "B task");
    await expect(page.locator(".todo-text")).toHaveText("B item");
    await expect(page.locator("#undoChange")).toBeDisabled();
    await expect(page.locator("#saveFile")).toHaveText("Saved");
  });
}

const sortingFixture = `# Sorting
#Ignore
## Hidden feature
### Hidden feature task
- [ ] Feature secret

## A
#Ignore
### Hidden first
- [ ] First secret
### First
- [ ] First item
#Ignore
### Hidden middle
- [ ] Middle secret
### Second
- [ ] Second item

#Ignore
## Hidden middle feature
### Hidden middle feature task
- [ ] Middle feature secret

## B
#Ignore
### Hidden target
- [ ] Target secret
### Target
- [ ] Target item

#Backlog
## Backlog
#Ignore
### Hidden backlog
- [ ] Backlog secret
`;

/** @param {import("@playwright/test").Page} page @param {{kind: "task" | "feature", sourceFeature: number, task?: number, targetFeature?: number, beforeFeature?: number, beforeTask?: number}} move */
async function sortableMove(page, move) {
  await page.evaluate(move => {
    const feature = document.querySelector(`.release[data-feature="${move.sourceFeature}"]`);
    const source = move.kind === "feature" ? document.getElementById("content") : feature.querySelector(".board");
    const item = move.kind === "feature" ? feature : source.querySelector(`.card[data-task="${move.task}"]`);
    const target = move.kind === "feature" ? source : document.querySelector(`.release[data-feature="${move.targetFeature}"] .board`);
    const before = move.kind === "feature" ? target.querySelector(`.release[data-feature="${move.beforeFeature}"]`) : move.beforeTask === undefined ? null : target.querySelector(`.card[data-task="${move.beforeTask}"]`);
    const oldIndex = [...source.children].indexOf(item);
    /** @type {any} */
    const sortable = /** @type {any} */ (window).Sortable.get(source);
    sortable.option("onStart")({ item, from: source });
    target.insertBefore(item, before);
    const newIndex = [...target.children].indexOf(item);
    sortable.option("onEnd")({ item, from: source, to: target, oldIndex, newIndex });
  }, move);
}

/** @param {import("@playwright/test").Page} page */
async function savedProject(page) {
  await page.locator("#saveFile").click();
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  return page.evaluate(() => {
    const parsed = window.MDManager.markdown.parse(window.__reviewSaved);
    return parsed.features.map((/** @type {any} */ feature) => ({ title: feature.title, ignored: feature.ignored, tasks: feature.tasks.map((/** @type {any} */ task) => ({ title: task.title, ignored: task.ignored })) }));
  });
}

test("feature sorting maps ignored gaps correctly and restores view state with undo and redo", async ({ page }) => {
  await openFixture(page, sortingFixture);
  await page.locator('.release[data-feature="1"] .card[data-task="1"] .card-header').click();
  await sortableMove(page, { kind: "feature", sourceFeature: 3, beforeFeature: 1 });
  await expect(page.locator("#content > .release .release-title").first()).toHaveAttribute("data-full-title", "B");
  let persisted = await savedProject(page);
  expect(persisted.map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "B", "A", "Hidden middle feature", "Backlog"]);
  expect(persisted.filter((/** @type {any} */ feature) => feature.ignored).map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "Hidden middle feature"]);
  await expect(page.locator('.release[data-feature="2"] .card[data-task="1"]')).toHaveAttribute("aria-expanded", "true");
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release .release-title").first()).toHaveAttribute("data-full-title", "A");
  await expect(page.locator('.release[data-feature="1"] .card[data-task="1"]')).toHaveAttribute("aria-expanded", "true");
  persisted = await savedProject(page);
  expect(persisted.map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "A", "Hidden middle feature", "B", "Backlog"]);
  await page.locator("#redoChange").click();
  persisted = await savedProject(page);
  expect(persisted.map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "B", "A", "Hidden middle feature", "Backlog"]);
});

test("task sorting within ignored gaps and across features/backlog preserves the intended tasks", async ({ page }) => {
  await openFixture(page, sortingFixture);
  await page.locator('.release[data-feature="1"] .card[data-task="3"] .card-header').click();
  await sortableMove(page, { kind: "task", sourceFeature: 1, task: 3, targetFeature: 1, beforeTask: 1 });
  let persisted = await savedProject(page);
  expect(persisted[1].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "Second", "First", "Hidden middle"]);
  await expect(page.locator('.release[data-feature="1"] .card[data-task="1"]')).toHaveAttribute("aria-expanded", "true");
  await page.locator("#undoChange").click();
  persisted = await savedProject(page);
  expect(persisted[1].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "First", "Hidden middle", "Second"]);
  await page.locator("#redoChange").click();
  await sortableMove(page, { kind: "task", sourceFeature: 1, task: 1, targetFeature: 3, beforeTask: 1 });
  persisted = await savedProject(page);
  expect(persisted[1].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "First", "Hidden middle"]);
  expect(persisted[3].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden target", "Second", "Target"]);
  await page.keyboard.press("b");
  await expect(page.locator("#backlog")).toBeVisible();
  await sortableMove(page, { kind: "task", sourceFeature: 3, task: 1, targetFeature: 4 });
  persisted = await savedProject(page);
  expect(persisted[4].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden backlog", "Second"]);
  expect(persisted[4].tasks[0].ignored).toBe(true);
  await page.locator("#undoChange").click();
  persisted = await savedProject(page);
  expect(persisted[3].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden target", "Second", "Target"]);
  expect(persisted[4].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden backlog"]);
  await page.locator("#redoChange").click();
  persisted = await savedProject(page);
  expect(persisted[3].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden target", "Target"]);
  expect(persisted[4].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden backlog", "Second"]);
});

test("moving features and tasks to the visible end crosses ignored gaps and undo restores their positions", async ({ page }) => {
  await openFixture(page, sortingFixture);
  await sortableMove(page, { kind: "feature", sourceFeature: 1 });
  let persisted = await savedProject(page);
  expect(persisted.map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "Hidden middle feature", "B", "A", "Backlog"]);
  await sortableMove(page, { kind: "task", sourceFeature: 3, task: 1, targetFeature: 3 });
  persisted = await savedProject(page);
  expect(persisted[3].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "Hidden middle", "Second", "First"]);
  await page.locator("#undoChange").click();
  await page.locator("#undoChange").click();
  persisted = await savedProject(page);
  expect(persisted.map((/** @type {any} */ feature) => feature.title)).toEqual(["Hidden feature", "A", "Hidden middle feature", "B", "Backlog"]);
  expect(persisted[1].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "First", "Hidden middle", "Second"]);
  await page.locator("#redoChange").click();
  await page.locator("#redoChange").click();
  persisted = await savedProject(page);
  expect(persisted[3].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "Hidden middle", "Second", "First"]);
});

test("an unchanged drag across ignored gaps creates no persistent action", async ({ page }) => {
  await openFixture(page, sortingFixture);
  await sortableMove(page, { kind: "task", sourceFeature: 1, task: 1, targetFeature: 1, beforeTask: 3 });
  await expect(page.locator("#saveFile")).toHaveText("Saved");
  await expect(page.locator("#undoChange")).toBeDisabled();
});

test("a mouse drag moves the visible task rather than its ignored predecessor", async ({ page }) => {
  await openFixture(page, sortingFixture);
  const source = page.locator('.release[data-feature="1"] .card[data-task="1"]');
  const target = page.locator('.release[data-feature="3"] .board');
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(target.locator(".card")).toHaveCount(2);
  const persisted = await savedProject(page);
  expect(persisted[1].tasks.map((/** @type {any} */ task) => task.title)).toEqual(["Hidden first", "Hidden middle", "Second"]);
  expect(persisted[3].tasks.filter((/** @type {any} */ task) => !task.ignored).map((/** @type {any} */ task) => task.title)).toContain("First");
});

test("archive eligibility after a note gap preserves a reopenable file and undo/redo", async ({ page }) => {
  await openFixture(page, "# Archive regression\n## F\n### T\n#Info\nNote\n\n- [ ] Open\n#### Group\n- [x] Done");
  await page.locator(".release-heading").hover();
  await page.locator(".feature-menu-button").click();
  await page.locator('[data-feature-action="archive"]').click();
  await expect(page.locator("#content > .release")).toHaveCount(1);
  await expect(page.locator(".notification-warning .notification-title")).toHaveText("Feature not archived");
  await expect(page.locator("#undoChange")).toBeDisabled();
  await page.locator(".card-header").click();
  await page.locator(".checkbox").first().click();
  await page.locator(".release-heading").hover();
  await page.locator(".feature-menu-button").click();
  await page.locator('[data-feature-action="archive"]').click();
  await expect(page.locator("#content > .release")).toHaveCount(0);
  const archived = await savedProject(page);
  expect(archived[0].title).toBe("F");
  expect(await page.evaluate(() => window.MDManager.markdown.parse(window.__reviewSaved).features[0].isArchived)).toBe(true);
  await page.locator("#undoChange").click();
  await expect(page.locator("#content > .release")).toHaveCount(1);
  await page.locator("#redoChange").click();
  await expect(page.locator("#content > .release")).toHaveCount(0);
  await savedProject(page);
  expect(await page.evaluate(() => window.MDManager.markdown.parse(window.__reviewSaved).features[0].isArchived)).toBe(true);
});
