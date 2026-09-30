const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

function mutableFile() {
  const state = { markdown: "base", revision: 1, writes: 0 };
  const handle = {
    async getFile() {
      const markdown = state.markdown;
      return { lastModified: state.revision, size: markdown.length, text: async () => markdown };
    },
    async createWritable() {
      state.writes++;
      let next = "";
      return {
        async write(/** @type {string} */ markdown) { next = markdown; },
        async close() { state.markdown = next; state.revision++; }
      };
    }
  };
  return { state, handle };
}

test("guarded saves report changed content without creating a writable stream", async () => {
  const { files } = load("io/files.js");
  const { state, handle } = mutableFile();
  state.markdown = "external";
  await assert.rejects(files.save(handle, "local", "base"), error => {
    const conflict = /** @type {Error & {markdown: string, stamp: string}} */ (error);
    assert.equal(conflict.name, "FileConflictError");
    assert.equal(conflict.markdown, "external");
    assert.equal(conflict.stamp, "1:8");
    return true;
  });
  assert.equal(state.markdown, "external");
  assert.equal(state.writes, 0);
  await files.save(handle, "local");
  assert.equal(state.markdown, "local");
  assert.equal(state.writes, 1);
});

test("expected content is checked when a queued write starts and later writes recover", async () => {
  const { files } = load("io/files.js");
  const { state, handle } = mutableFile();
  /** @type {() => void} */
  let release = () => {};
  /** @type {() => void} */
  let started = () => {};
  const blocking = new Promise(resolve => { started = () => resolve(undefined); });
  const first = files.save({ async createWritable() {
    return { async write() {}, async close() {
      started();
      await new Promise(resolve => { release = () => resolve(undefined); });
    } };
  } }, "other file");
  await blocking;
  const guarded = files.save(handle, "local", "base");
  const rejected = assert.rejects(guarded, { name: "FileConflictError" });
  state.markdown = "external while queued";
  release();
  await first;
  await rejected;
  assert.equal(state.writes, 0);
  await files.save(handle, "latest", state.markdown);
  assert.equal(state.markdown, "latest");
});

test("guarded save preserves disk data if the verification read fails", async () => {
  const { files } = load("io/files.js");
  let writes = 0;
  await assert.rejects(files.save({
    async getFile() { throw new Error("Read unavailable"); },
    async createWritable() { writes++; }
  }, "local", "base"), /Read unavailable/);
  assert.equal(writes, 0);
});
