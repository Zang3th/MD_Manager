const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { undoSystem } = load("domain/history.js");

test("undo system executes named reversible actions and tracks the saved revision", () => {
  const state = undoSystem.create();
  let value = "a";
  undoSystem.execute(state, { label: "Value changed", redo: () => { value = "b"; }, undo: () => { value = "a"; } });

  assert.equal(value, "b");
  assert.equal(undoSystem.undoLabel(state), "Value changed");
  assert.equal(undoSystem.isDirty(state), true);
  undoSystem.markSaved(state);
  assert.equal(undoSystem.isDirty(state), false);

  assert.equal(undoSystem.undo(state).label, "Value changed");
  assert.equal(value, "a");
  assert.equal(undoSystem.isDirty(state), true);
  assert.equal(undoSystem.redo(state).label, "Value changed");
  assert.equal(value, "b");
  assert.equal(undoSystem.isDirty(state), false);
});

test("undo system ignores no-ops and discards redo only after a real branch", () => {
  const state = undoSystem.create();
  let value = 0;
  undoSystem.execute(state, { label: "One", redo: () => { value = 1; }, undo: () => { value = 0; } });
  undoSystem.undo(state);

  assert.equal(undoSystem.execute(state, { label: "No-op", redo: () => false, undo: () => {} }), false);
  assert.equal(undoSystem.canRedo(state), true);
  undoSystem.execute(state, { label: "Two", redo: () => { value = 2; }, undo: () => { value = 0; } });
  assert.equal(value, 2);
  assert.equal(undoSystem.canRedo(state), false);
  assert.equal(undoSystem.undoLabel(state), "Two");
});

test("undo system rolls back a failed transaction and bounds retained actions", () => {
  const state = undoSystem.create();
  let value = 0;
  assert.throws(() => undoSystem.execute(state, {
    label: "Broken",
    redo: () => { value = 1; throw new Error("broken"); },
    undo: () => { value = 0; }
  }), /broken/);
  assert.equal(value, 0);
  assert.equal(undoSystem.canUndo(state), false);

  for (let index = 1; index <= 120; index += 1) {
    undoSystem.execute(state, { label: String(index), redo: () => { value = index; }, undo: () => { value = index - 1; }, size: 1 });
  }
  assert.equal(state.entries.length, 100);
  assert.equal(state.entries[0].label, "21");
  assert.equal(state.totalSize, 100);
});
