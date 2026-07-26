const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { history } = load("domain/history.js");

test("history starts at its initial value", () => {
  const state = history.create("a");
  assert.equal(state.index, 0);
  assert.deepEqual(Array.from(state.entries), ["a"]);
  assert.equal(history.canUndo(state), false);
  assert.equal(history.canRedo(state), false);
});

test("history records, undoes, and redoes values", () => {
  const state = history.create("a");
  history.record(state, "b"); history.record(state, "c");
  assert.equal(history.undo(state), "b");
  assert.equal(history.undo(state), "a");
  assert.equal(history.undo(state), "a");
  assert.equal(history.redo(state), "b");
  assert.equal(history.redo(state), "c");
  assert.equal(history.redo(state), "c");
});

test("history ignores duplicates and discards the redo branch", () => {
  const state = history.create("a");
  history.record(state, "a"); history.record(state, "b"); history.record(state, "c");
  history.undo(state); history.record(state, "d");
  assert.deepEqual(Array.from(state.entries), ["a", "b", "d"]);
  assert.equal(history.canRedo(state), false);
});
