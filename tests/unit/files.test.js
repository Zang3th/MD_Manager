const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadFiles() {
  const records = new Map();
  let now = 0;
  const database = {
    createObjectStore() {},
    close() {},
    transaction() {
      const transaction = {
        objectStore() {
          return {
            getAll() {
              const request = {};
              queueMicrotask(() => { request.result = [...records.values()]; request.onsuccess(); });
              return request;
            },
            put(record) {
              records.set(record.id, record);
              queueMicrotask(() => transaction.oncomplete());
            },
            delete(id) {
              records.delete(id);
              queueMicrotask(() => transaction.oncomplete());
            }
          };
        }
      };
      return transaction;
    }
  };
  const indexedDB = {
    open() {
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
  const events = [];
  const handle = {
    async createWritable() {
      return {
        async write(value) { events.push(`write:${value}`); },
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
  await files.save({ async createWritable() { return { async write(value) { written = value; }, async close() {} }; } }, "two");
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
      return { async write(value) { written = value; }, async close() {} };
    },
    async getFile() { return { lastModified: 7, size: written.length }; }
  };
  window.showSaveFilePicker = async options => { pickerOptions = options; return handle; };
  const opened = await files.createProject();

  assert.equal(pickerOptions.suggestedName, "Project.md");
  assert.equal(pickerOptions.id, "md-manager-files");
  assert.equal(written, "# New Project\n");
  assert.equal(opened.handle, handle);
  assert.equal(opened.markdown, written);
});

test("recent entries are sorted, deduplicated, limited, and removable", async () => {
  const { files, records } = loadFiles();
  for (let index = 0; index < 6; index++) {
    const handle = { name: `${index}.md`, async isSameEntry(other) { return other.name === this.name; } };
    await files.remember(handle);
  }
  const recent = await files.recent();
  assert.equal(recent.length, 5);
  assert.equal(recent[0].name, "5.md");
  const newestId = recent[0].id;
  await files.remember({ name: "5.md", async isSameEntry(other) { return other.name === this.name; } }, "Project Five");
  assert.equal(records.size, 5);
  assert.equal((await files.recent())[0].projectTitle, "Project Five");
  await files.forget(newestId);
  assert.equal(records.has(newestId), false);
});
