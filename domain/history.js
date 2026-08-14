window.MDManager = window.MDManager || {};

(function (app) {
  const maxEntries = 100;
  const maxSize = 8 * 1024 * 1024;

  /** @param {MDUndoSystem} undoSystem */
  function discardRedo(undoSystem) {
    const discarded = undoSystem.entries.splice(undoSystem.index + 1);
    undoSystem.totalSize -= discarded.reduce((size, entry) => size + entry.size, 0);
  }

  /** @param {MDUndoSystem} undoSystem */
  function trimUndoSystem(undoSystem) {
    while (undoSystem.entries.length > 1 && (undoSystem.entries.length > maxEntries || undoSystem.totalSize > maxSize)) {
      const removed = undoSystem.entries.shift();
      if (removed) undoSystem.totalSize -= removed.size;
      undoSystem.index -= 1;
    }
  }

  app.undoSystem = {
    /** @returns {MDUndoSystem} */
    create() { return { entries: [], index: -1, totalSize: 0 }; },
    /** @param {MDUndoSystem} undoSystem @param {MDUndoAction} action @returns {boolean} */
    execute(undoSystem, action) {
      let changed = false;
      try { changed = action.redo() !== false; }
      catch (error) {
        try { action.undo(); } catch { /* Preserve the original action failure. */ }
        throw error;
      }
      if (!changed) return false;
      this.commit(undoSystem, action);
      return true;
    },
    /** @param {MDUndoSystem} undoSystem @param {MDUndoAction} action */
    commit(undoSystem, action) {
      discardRedo(undoSystem);
      const entry = { ...action, size: Math.max(0, action.size || 0) };
      undoSystem.entries.push(entry);
      undoSystem.index += 1;
      undoSystem.totalSize += entry.size;
      trimUndoSystem(undoSystem);
    },
    /** @param {MDUndoSystem} undoSystem @param {MDUndoAction} action */
    replaceCurrent(undoSystem, action) {
      if (undoSystem.index < 0 || undoSystem.index !== undoSystem.entries.length - 1) return;
      const current = undoSystem.entries[undoSystem.index];
      undoSystem.totalSize -= current.size;
      current.label = action.label;
      current.redo = action.redo;
      current.afterViewState = action.afterViewState;
      current.size = Math.max(0, action.size || 0);
      undoSystem.totalSize += current.size;
      trimUndoSystem(undoSystem);
    },
    /** @param {MDUndoSystem} undoSystem */
    clear(undoSystem) {
      undoSystem.entries = [];
      undoSystem.index = -1;
      undoSystem.totalSize = 0;
    },
    /** @param {MDUndoSystem} undoSystem @returns {MDUndoResult | null} */
    undo(undoSystem) {
      if (undoSystem.index < 0) return null;
      const entry = undoSystem.entries[undoSystem.index];
      entry.undo();
      undoSystem.index -= 1;
      return { label: entry.label, viewState: entry.beforeViewState };
    },
    /** @param {MDUndoSystem} undoSystem @returns {MDUndoResult | null} */
    redo(undoSystem) {
      if (undoSystem.index >= undoSystem.entries.length - 1) return null;
      const entry = undoSystem.entries[undoSystem.index + 1];
      entry.redo();
      undoSystem.index += 1;
      return { label: entry.label, viewState: entry.afterViewState };
    },
    /** @param {MDUndoSystem} undoSystem @returns {boolean} */
    canUndo(undoSystem) { return undoSystem.index >= 0; },
    /** @param {MDUndoSystem} undoSystem @returns {boolean} */
    canRedo(undoSystem) { return undoSystem.index < undoSystem.entries.length - 1; },
    /** @param {MDUndoSystem} undoSystem @returns {string} */
    undoLabel(undoSystem) { return undoSystem.entries[undoSystem.index]?.label || ""; },
    /** @param {MDUndoSystem} undoSystem @returns {string} */
    redoLabel(undoSystem) { return undoSystem.entries[undoSystem.index + 1]?.label || ""; }
  };

})(window.MDManager);
