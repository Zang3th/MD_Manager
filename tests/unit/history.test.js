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

test("history bounds retained snapshots by entry count and total size", () => {
  const countLimited = history.create("0");
  for (let index = 1; index <= 120; index++) history.record(countLimited, String(index));
  assert.equal(countLimited.entries.length, 100);
  assert.equal(countLimited.entries[0], "21");
  assert.equal(countLimited.totalSize, countLimited.entries.reduce((size, entry) => size + entry.length, 0));

  const chunk = "x".repeat(1024 * 1024);
  const sizeLimited = history.create(`${chunk}0`);
  for (let index = 1; index <= 9; index++) history.record(sizeLimited, `${chunk}${index}`);
  assert.equal(sizeLimited.entries.length, 7);
  assert.ok(sizeLimited.totalSize <= 8 * 1024 * 1024);
  assert.equal(sizeLimited.entries.at(-1), `${chunk}9`);
});
