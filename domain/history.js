window.MDManager = window.MDManager || {};

(function (app) {
  app.history = {
    /** @param {string} initialValue @returns {MDHistory} */
    create(initialValue) {
      return { entries: [initialValue], index: 0 };
    },
    /** @param {MDHistory} history @param {string} value */
    record(history, value) {
      if (history.entries[history.index] === value) return;
      history.entries.splice(history.index + 1);
      history.entries.push(value);
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
