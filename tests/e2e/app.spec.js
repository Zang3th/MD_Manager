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

async function toggleBacklogFromView(page) {
  await page.locator("#toggleViewMenu").click();
  await page.locator("#toggleBacklog").click();
  await page.locator("#toggleViewMenu").click();
}

test("start screen exposes the application identity and open action", async ({ page }) => {
  await page.goto(appUrl);
  await expect(page).toHaveTitle("MD_Manager");
  await expect(page.locator("#appVersion")).toHaveText("v0.3.0");
  expect(await page.locator("#appVersion").evaluate(element => getComputedStyle(element, "::before").height)).toBe("2px");
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await expect(page.locator("#watermark")).toBeVisible();
  await expect(page.locator("#watermark")).toContainText("MD_Manager v0.3.0");
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
  await expect(page.locator(".task-in-progress")).toHaveText("◐");
  await expect(page.locator(".task-check")).toHaveText("✓");
  await expect(page.locator("#toggleBacklog")).toBeEnabled();
  await expect(page.locator(".notification-title").last()).toHaveText("File loaded");
  await expect(page.locator(".notification-body").last()).toHaveText("Fixture.md is ready.");
  await expect(page.locator(".notification").last().locator(".notification-value")).toHaveText("Fixture.md");
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

test("inline code wraps at punctuation and case transitions", async ({ page }) => {
  const source = "HTTPServer.longIdentifier_value=>NextCase(argument_one)";
  await openFixture(page, `# Project\n\n## Feature\n\n### Task\n\`${source}\``);
  await page.locator(".card-header").click();
  const code = page.locator(".card-body code");
  await expect(code).toHaveText(source);
  await expect(code.locator("wbr")).toHaveCount(8);
  await expect(code).toHaveCSS("overflow-wrap", "break-word");
  await code.evaluate(element => { element.parentElement.style.width = "8rem"; });
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
  const editFeature = heading.locator('[data-edit="feature"]');
  await expect(editFeature).toHaveAttribute("title", "Edit feature");
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

test("editors open without focusing a field and keep immediate field clicks", async ({ page }) => {
  await openFixture(page);
  const featureHeading = page.locator(".release-heading").first();
  await featureHeading.hover();
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
  await feature.locator(".release-heading").hover();
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
  await feature.locator(".release-heading").hover();
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
  await expect(page.getByText("Content, todos, #Info and #Warn", { exact: true })).toHaveCount(0);
  await expect(toolbar.locator(".markdown-tool-group")).toHaveCount(2);
  await expect(toolbar.locator("[data-editor-history]")).toHaveCount(0);
  await expect(toolbar.locator(".markdown-tags > summary")).toHaveText("Tags");
  await expect(toolbar.getByRole("button", { name: "Bold" })).toBeDisabled();
  await textarea.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await title.focus();
  await title.press("Tab");
  await expect(textarea).toBeFocused();
  await expect.poll(() => textarea.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([0, 0]);
  expect(await toolbar.evaluate(node => node.parentElement?.querySelector("textarea")?.id)).toBe("taskEditorMarkdown");
  expect(await toolbar.evaluate(node => {
    const toolbarBounds = node.getBoundingClientRect();
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
  await expect(page.locator("#taskMarkdownHighlight").locator("..")).toHaveCSS("border-bottom-color", "rgb(235, 219, 178)");
  await textarea.fill("word next");
  await textarea.evaluate(element => {
    element.setSelectionRange(2, 2);
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 }));
  });
  await expect.poll(() => textarea.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([0, 4]);
  const helpButton = toolbar.getByRole("button", { name: "Formatting help" });
  await helpButton.click();
  const formattingHelp = toolbar.locator(".help-popover");
  await expect(formattingHelp).toBeVisible();
  await expect(formattingHelp.locator(".markdown-reference")).toHaveCount(0);
  await expect(formattingHelp).toContainText("Bold");
  await expect(formattingHelp).toContainText("Ctrl");
  await expect(formattingHelp).not.toContainText("press twice");
  await expect(formattingHelp).toContainText("or ⌘ B");
  await expect(formattingHelp).toContainText("⌘ Shift Z");
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
    await expect(button).toHaveCSS("border-color", "rgb(131, 165, 152)");
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
  await textarea.evaluate(element => element.setSelectionRange(6, element.value.length));
  await textarea.press("End");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue(`${beforeContinuedList}\n- [ ] `);
  await textarea.press("Control+z");
  await expect(textarea).toHaveValue(beforeContinuedList);
  await expect.poll(() => textarea.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([beforeContinuedList.length, beforeContinuedList.length]);

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
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await title.evaluate(element => {
    element.setSelectionRange(2, 2);
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 }));
  });
  await expect.poll(() => title.evaluate(element => element.selectionEnd)).toBe(originalTitle.indexOf(" "));

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
  await feature.locator(".release-heading").hover();
  await feature.locator('[data-edit="feature"]').click();
  const metadata = page.locator("#featureEditorMetadata");
  const highlight = page.locator("#featureMarkdownHighlight");
  await expect(page.getByText("#Version, #Date, #Info and #Warn", { exact: true })).toHaveCount(0);
  await metadata.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
  await page.locator("#featureEditorTitle").focus();
  await page.locator("#featureEditorTitle").press("Tab");
  await expect(metadata).toBeFocused();
  await expect.poll(() => metadata.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([0, 0]);
  await expect(metadata).toHaveValue(/#Info/);
  await expect(highlight.locator(".markdown-syntax-info")).toHaveText("#Info");
  await expect(highlight.locator(".markdown-syntax-info")).toHaveCSS("color", "rgb(131, 165, 152)");
  await expect(highlight.locator(".markdown-syntax-tag")).toHaveText(["#Version", "#Date"]);
  await expect(highlight.locator(".markdown-syntax-tag").first()).toHaveCSS("color", "rgb(211, 134, 155)");
  await metadata.fill("#Info\n**bold** *italic* ~done~ `code` [link](https://example.com)\n#### Label");
  await expect(highlight.locator(".markdown-syntax-bold")).toHaveCSS("font-weight", "800");
  await expect(highlight.locator(".markdown-syntax-italic")).toHaveCSS("font-style", "italic");
  await expect(highlight.locator(".markdown-syntax-strike")).toHaveCSS("text-decoration-line", "line-through");
  await expect(highlight.locator(".markdown-syntax-code")).toHaveCSS("font-family", /Cascadia Mono|Segoe UI Mono|Consolas/);
  await expect(highlight.locator(".markdown-syntax-code")).toHaveCSS("color", "rgb(184, 187, 38)");
  await expect(highlight.locator(".markdown-syntax-code")).not.toHaveCSS("box-shadow", "none");
  await expect(highlight.locator(".markdown-syntax-link")).toHaveCSS("color", "rgb(211, 134, 155)");
  await expect(highlight.locator(".markdown-syntax-label")).toHaveText("#### Label");
  await metadata.fill("~**bold** *italic* `code` [link](https://example.com)~ **~nested strike~**");
  const combinedStrike = highlight.locator(".markdown-syntax-strike").first();
  await expect(combinedStrike.locator(".markdown-syntax-bold")).toHaveText("**bold**");
  await expect(combinedStrike.locator(".markdown-syntax-italic")).toHaveText("*italic*");
  await expect(combinedStrike.locator(".markdown-syntax-code")).toHaveText("`code`");
  await expect(combinedStrike.locator(".markdown-syntax-link")).toHaveText("[link](https://example.com)");
  await expect(highlight.locator(".markdown-syntax-bold .markdown-syntax-strike")).toHaveText("~nested strike~");
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

test("logo and feature new buttons create features and tasks through existing editors", async ({ page }) => {
  await openFixture(page);
  const addFeature = page.getByRole("button", { name: "New feature" });
  await expect(addFeature).toBeEnabled();
  await addFeature.click();
  await expect(page.locator("#featureEditorTitle")).toHaveValue("New Feature");
  await page.locator("#cancelFeatureEditor").click();
  await expect(page.locator("#content > .release")).toHaveCount(2);
  await addFeature.click();
  await page.evaluate(() => {
    const serialize = window.MDManager.markdown.serialize;
    window.__serializationCount = 0;
    window.MDManager.markdown.serialize = project => {
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
  await expect(addTask).toHaveAttribute("title", "New task");
  await addTask.click();
  await expect(page.locator("#taskEditorTitle")).toHaveValue("New Task");
  await page.locator("#saveTaskEditor").click();
  await expect(firstFeature.locator(".card")).toHaveCount(tasksBefore + 1);
  await expect(firstFeature.locator(".card-title").last()).toHaveText("New Task");
  await expect(page.locator(".notification-title").last()).toHaveText("Task added");
  await expect(page.locator(".notification-body").last()).toHaveText("New Task added to Active Feature.");
  await expect(page.locator(".notification").last().locator(".notification-value")).toHaveText(["New Task", "Active Feature"]);
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
  await featureHeading.hover();
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
  await expect(page.locator(".backlog-title")).toHaveText("Later");
  await expect(page.locator(".backlog-pane")).toHaveCSS("width", "300px");
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

test("opening the backlog scrolls the board to its right edge", async ({ page }) => {
  const features = Array.from({ length: 5 }, (_, index) => `## Feature ${index + 1}\n### Task\n- [ ] pending`).join("\n\n");
  await page.setViewportSize({ width: 900, height: 720 });
  await openFixture(page, `# Scroll Test\n\n${features}\n\n#Backlog\n## Backlog\n### Deferred\n- [ ] later`);
  const content = page.locator("#content");
  await expect.poll(() => content.evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  await expect.poll(() => content.evaluate(node => node.scrollLeft)).toBe(0);
  await toggleBacklogFromView(page);
  await expect.poll(() => content.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => content.evaluate(node => {
    const current = node.scrollLeft;
    node.scrollLeft = node.scrollWidth;
    const rightEdge = node.scrollLeft;
    node.scrollLeft = current;
    return Math.abs(current - rightEdge);
  })).toBeLessThanOrEqual(1);
});

test("statistics can close and reopen in board and grid", async ({ page }) => {
  await openFixture(page);
  const stats = page.locator("#projectStats");
  const content = page.locator("#content");
  const firstRelease = page.locator("#content > .release").first();
  await expect(stats).toBeVisible();
  await expect(stats).toHaveCSS("width", "300px");
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

test("notifications stack by severity, use the board width, and disappear automatically", async ({ page }) => {
  await openFixture(page);
  await page.locator("#notifications").evaluate(node => node.replaceChildren());
  const notifications = page.locator(".notification");
  await page.evaluate(() => {
    window.MDManager.notifications.show("info", "Information", "Operation completed.");
    window.MDManager.notifications.show("error", "Application", "Operation failed.");
  });
  await expect(notifications).toHaveCount(2);
  await expect(notifications.nth(0).locator(".notification-tag")).toHaveText("Info");
  await expect(notifications.nth(1).locator(".notification-tag")).toHaveText("Error");
  await expect(notifications.nth(0)).toHaveCSS("width", "300px");
  await expect(notifications.nth(0)).toHaveCSS("height", "88px");
  await toggleBacklogFromView(page);
  await expect(notifications.nth(0)).toHaveCSS("transform", "none");
  await expect(page.locator("#backlog")).toHaveCSS("transform", "none");
  const accentBars = await page.locator("#appClock, #projectStats, .backlog-header, .notification-info").evaluateAll(nodes => nodes.map(node => {
    const bounds = node.getBoundingClientRect();
    const accent = getComputedStyle(node, "::before");
    return { elementWidth: bounds.width, barWidth: Number.parseFloat(accent.width), barHeight: Number.parseFloat(accent.height), color: accent.backgroundColor };
  }));
  for (const accent of accentBars) {
    expect(accent.barHeight).toBe(2);
    expect(Math.round(Math.abs(accent.elementWidth - accent.barWidth))).toBeLessThanOrEqual(2);
  }
  expect(accentBars.map(accent => accent.color)).toEqual(["rgb(184, 187, 38)", "rgb(146, 131, 116)", "rgb(211, 134, 155)", "rgb(131, 165, 152)"]);
  const positions = await notifications.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
  expect(positions[0]).toBeLessThan(positions[1]);
  await page.locator("#toggleGridView").click();
  await expect(notifications.nth(0)).toHaveCSS("width", "260px");
  await page.evaluate(() => {
    const clearTimeout = window.clearTimeout;
    window.__clearedNotificationTimers = 0;
    window.clearTimeout = timer => {
      window.__clearedNotificationTimers += 1;
      clearTimeout(timer);
    };
    for (let index = 0; index < 20; index += 1) window.MDManager.notifications.show("info", `Rapid ${index}`, `Notification ${index}`);
  });
  expect(await notifications.count()).toBeLessThan(20);
  expect(await page.evaluate(() => window.__clearedNotificationTimers)).toBeGreaterThan(0);
  await expect(notifications.last().locator(".notification-title")).toHaveText("Rapid 19");
  const notificationBounds = await notifications.first().boundingBox();
  const headerBounds = await page.locator(".header").boundingBox();
  expect(notificationBounds.y).toBeGreaterThan(headerBounds.y + headerBounds.height);
  await expect(notifications).toHaveCount(0, { timeout: 5000 });
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
  await expect(page.locator(".help-menu")).toHaveCSS("border-left-style", "solid");
  await helpButton.click();
  const help = page.locator("#helpPopover");
  await expect(help).toBeVisible();
  await expect(helpButton).toHaveAttribute("aria-expanded", "true");
  await expect(help).toContainText("Quick reference");
  await expect(help).toContainText("Shortcuts");
  await expect(help).toContainText("Ctrl");
  await expect(help).toContainText("#Backlog");
  await expect(help).toContainText("#Ignore");
  const structure = help.locator(".markdown-reference").first();
  await expect(structure).toContainText("#### Label");
  await expect(structure).toContainText("- [ ] Todo");
  await expect(help.getByText("Task content", { exact: true })).toHaveCount(0);
  await expect(help).not.toContainText("Starts a");
  await expect(help).not.toContainText("Marks the");
  const formatting = help.locator(".help-formatting");
  await expect(formatting.locator(".markdown-syntax-bold")).toHaveText("**Bold**");
  await expect(formatting.locator(".markdown-syntax-bold")).toHaveCSS("font-weight", "800");
  await expect(formatting.locator(".markdown-syntax-italic")).toHaveCSS("font-style", "italic");
  await expect(formatting.locator(".markdown-syntax-strike")).toHaveCSS("text-decoration-line", "line-through");
  await expect(formatting.locator(".markdown-syntax-code")).toHaveText("`Code`");
  await expect(formatting.locator(".markdown-syntax-link")).toHaveText("[URL](url)");
  await expect(formatting).not.toContainText("Bullet");
  await expect(formatting).not.toContainText("Nested");
  await expect(help.locator(".help-tag-info")).toHaveCSS("color", "rgb(131, 165, 152)");
  await expect(help.locator(".help-tag-warn")).toHaveCSS("color", "rgb(215, 153, 33)");
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
    window.MDManager.markdown.serialize = project => {
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
  await page.locator("#undoChange").click();
  await expect(page.locator("#content .card")).toHaveCount(3);
});

test("view menu, keyboard shortcut, and accessibility states stay synchronized", async ({ page }) => {
  await openFixture(page);
  await page.locator("#toggleViewMenu").click();
  await expect(page.locator("#toggleViewMenu")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#viewOptions > button")).toHaveText(["Backlog", "Clock", "Metadata", "Statistics"]);
  await expect(page.locator("#toggleBacklog")).toHaveCSS("color", "rgb(235, 219, 178)");
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

test("board uses 380px features and 360px tasks on common and 4K viewports", async ({ page }) => {
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
  await toggleBacklogFromView(page);
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
