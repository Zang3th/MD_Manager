const test = require("node:test");
const assert = require("node:assert/strict");
const fakes = require("@zang3th/md-libs/harness/testing");
const { loadWithGlobals } = require("./load-classic");

// Storage, write queue, conflicts and the recent-files store are tested in MD_Libs; these tests cover
// what MD_Manager adds: pickers, permissions and the per-file data kept with a recent file.
function loadFiles() {
  const window = loadWithGlobals({ indexedDB: fakes.indexedDB() }, "io/files.js");
  return { files: window.MDManager.files, window };
}

test("read and open request write permission and use the selected handle", async () => {
  const { files, window } = loadFiles();
  const disk = fakes.fileSystem({ "Project.md": "# Project" });
  const granted = disk.fileHandle("Project.md");
  assert.equal(await files.read({ async requestPermission() { return "denied"; } }), null);
  window.showOpenFilePicker = async () => [granted];
  const opened = await files.open();
  assert.equal(opened.handle, granted);
  assert.equal(opened.markdown, "# Project");
  assert.equal(disk.hooks.requests, 1);
});

test("createProject writes a minimal Markdown project through the save picker", async () => {
  const { files, window } = loadFiles();
  const disk = fakes.fileSystem({ "Project.md": "" });
  const handle = disk.fileHandle("Project.md");
  /** @type {any} */
  let pickerOptions = null;
  window.showSaveFilePicker = async (/** @type {any} */ options) => { pickerOptions = options; return handle; };
  const opened = await files.createProject();

  assert.equal(pickerOptions.suggestedName, "Project.md");
  assert.equal(pickerOptions.id, "md-manager-files");
  assert.equal(disk.text("Project.md"), "# New Project\n");
  assert.equal(opened.handle, handle);
  assert.equal(opened.markdown, "# New Project\n");
  assert.equal(opened.stamp, (await files.inspect(handle)).stamp);
});

test("recent entries persist the last valid feature-card width per file", async () => {
  const { files } = loadFiles();
  const handle = fakes.fileSystem().fileHandle("Project.md");

  const first = await files.remember(handle, "Project", 460);
  assert.equal(first.featureWidth, 460);
  const updated = await files.remember(handle, "Project", 540);
  assert.equal(updated.id, first.id);
  assert.equal(updated.featureWidth, 540);
  assert.equal((await files.recent()).length, 1);

  await files.remember(handle, "Project", 999);
  assert.equal((await files.recent())[0].featureWidth, 540);
});

test("recent entries persist the project title and archive view options and keep them when omitted", async () => {
  const { files } = loadFiles();
  const handle = fakes.fileSystem().fileHandle("Project.md");

  const initial = await files.remember(handle, "Project");
  assert.deepEqual([initial.projectTitle, initial.showArchived, initial.showDone], ["Project", false, false]);
  await files.remember(handle, "", 460, { showArchived: true });
  await files.remember(handle, "Project", 460, { showDone: true });
  const kept = await files.remember(handle);
  assert.deepEqual([kept.projectTitle, kept.showArchived, kept.showDone], ["Project", true, true]);
  await files.remember(handle, "Project", 460, { showArchived: false, showDone: false });
  const [stored] = await files.recent();
  assert.deepEqual([stored.showArchived, stored.showDone, stored.featureWidth], [false, false, 460]);
});
