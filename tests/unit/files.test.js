const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadFiles() {
  const records = new Map();
  let now = 0;
  /** @type {any} */
  const database = {
    createObjectStore() {},
    close() {},
    transaction() {
      /** @type {any} */
      const transaction = {
        objectStore() {
          return {
            getAll() {
              /** @type {any} */
              const request = {};
              queueMicrotask(() => { request.result = [...records.values()]; request.onsuccess(); });
              return request;
            },
            put(/** @type {any} */ record) {
              records.set(record.id, record);
              queueMicrotask(() => transaction.oncomplete());
            },
            delete(/** @type {string} */ id) {
              records.delete(id);
              queueMicrotask(() => transaction.oncomplete());
            }
          };
        }
      };
      return transaction;
    }
  };
  /** @type {any} */
  const indexedDB = {
    open() {
      /** @type {any} */
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (records.size === 0) request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    }
  };
  const context = vm.createContext({ window: { MDManager: {} }, indexedDB, queueMicrotask, Date: { now: () => ++now } });
  const source = fs.readFileSync(path.join(__dirname, "../../io/files.js"), "utf8");
  vm.runInContext(source, context, { filename: "io/files.js" });
  return { files: context.window.MDManager.files, records, window: context.window };
}

test("save serializes writes", async () => {
  const { files } = loadFiles();
  /** @type {string[]} */
  const events = [];
  const handle = {
    async createWritable() {
      return {
        async write(/** @type {string} */ value) { events.push(`write:${value}`); },
        async close() { events.push("close"); }
      };
    }
  };
  await Promise.all([files.save(handle, "one"), files.save(handle, "two")]);
  assert.deepEqual(events, ["write:one", "close", "write:two", "close"]);
});

test("a failed save does not block the next save", async () => {
  const { files } = loadFiles();
  await assert.rejects(files.save({ async createWritable() { throw new Error("failed"); } }, "one"));
  let written = "";
  await files.save({ async createWritable() { return { async write(/** @type {string} */ value) { written = value; }, async close() {} }; } }, "two");
  assert.equal(written, "two");
});

test("read and open respect permissions and selected handles", async () => {
  const { files, window } = loadFiles();
  const granted = { async requestPermission() { return "granted"; }, async getFile() { return { async text() { return "# Project"; } }; } };
  const denied = { async requestPermission() { return "denied"; } };
  assert.equal(await files.read(denied), null);
  window.showOpenFilePicker = async () => [granted];
  const opened = await files.open();
  assert.equal(opened.handle, granted);
  assert.equal(opened.markdown, "# Project");
});

test("createProject writes a minimal Markdown project through the save picker", async () => {
  const { files, window } = loadFiles();
  let pickerOptions = null;
  let written = "";
  const handle = {
    name: "Project.md",
    async createWritable() {
      return { async write(/** @type {string} */ value) { written = value; }, async close() {} };
    },
    async getFile() { return { lastModified: 7, size: written.length }; }
  };
  window.showSaveFilePicker = async (/** @type {any} */ options) => { pickerOptions = options; return handle; };
  const opened = await files.createProject();

  assert.equal(/** @type {any} */ (pickerOptions).suggestedName, "Project.md");
  assert.equal(/** @type {any} */ (pickerOptions).id, "md-manager-files");
  assert.equal(written, "# New Project\n");
  assert.equal(opened.handle, handle);
  assert.equal(opened.markdown, written);
});

test("recent entries are sorted, deduplicated, limited, and removable", async () => {
  const { files, records } = loadFiles();
  for (let index = 0; index < 6; index++) {
    const handle = { name: `${index}.md`, async isSameEntry(/** @type {{name: string}} */ other) { return other.name === this.name; } };
    await files.remember(handle);
  }
  const recent = await files.recent();
  assert.equal(recent.length, 5);
  assert.equal(recent[0].name, "5.md");
  const newestId = recent[0].id;
  await files.remember({ name: "5.md", async isSameEntry(/** @type {{name: string}} */ other) { return other.name === this.name; } }, "Project Five");
  assert.equal(records.size, 5);
  assert.equal((await files.recent())[0].projectTitle, "Project Five");
  await files.forget(newestId);
  assert.equal(records.has(newestId), false);
});

test("recent entries persist the last valid feature-card width per file", async () => {
  const { files, records } = loadFiles();
  const handle = { name: "Project.md", async isSameEntry(/** @type {{name: string}} */ other) { return other.name === this.name; } };

  const first = await files.remember(handle, "Project", 460);
  assert.equal(first.featureWidth, 460);
  const updated = await files.remember(handle, "Project", 540);
  assert.equal(updated.id, first.id);
  assert.equal(updated.featureWidth, 540);
  assert.equal(records.size, 1);

  await files.remember(handle, "Project", 999);
  assert.equal((await files.recent())[0].featureWidth, 540);
});
