window.MDManager = window.MDManager || {};

(function (app) {
  const maxEntries = 100;
  const maxCharacters = 8 * 1024 * 1024;

  app.history = {
    /** @param {string} initialValue @returns {MDHistory} */
    create(initialValue) {
      return { entries: [initialValue], index: 0, totalSize: initialValue.length };
    },
    /** @param {MDHistory} history @param {string} value */
    record(history, value) {
      if (history.entries[history.index] === value) return;
      const discarded = history.entries.splice(history.index + 1);
      history.totalSize -= discarded.reduce((size, entry) => size + entry.length, 0);
      history.entries.push(value);
      history.totalSize += value.length;
      while (history.entries.length > 1 && (history.entries.length > maxEntries || history.totalSize > maxCharacters)) {
        const removed = history.entries.shift();
        if (removed !== undefined) history.totalSize -= removed.length;
      }
      history.index = history.entries.length - 1;
    },
    /** @param {MDHistory} history @returns {string} */
    undo(history) {
      if (history.index > 0) history.index--;
      return history.entries[history.index];
    },
    /** @param {MDHistory} history @returns {string} */
    redo(history) {
      if (history.index < history.entries.length - 1) history.index++;
      return history.entries[history.index];
    },
    /** @param {MDHistory} history @returns {boolean} */
    canUndo(history) {
      return history.index > 0;
    },
    /** @param {MDHistory} history @returns {boolean} */
    canRedo(history) {
      return history.index < history.entries.length - 1;
    }
  };
})(window.MDManager);
