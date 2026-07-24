window.MDManager = window.MDManager || {};

(function (app) {
  app.history = {
    create(initialValue) {
      return { entries: [initialValue], index: 0 };
    },
    record(history, value) {
      if (history.entries[history.index] === value) return;
      history.entries.splice(history.index + 1);
      history.entries.push(value);
      history.index = history.entries.length - 1;
    },
    undo(history) {
      if (history.index > 0) history.index--;
      return history.entries[history.index];
    },
    redo(history) {
      if (history.index < history.entries.length - 1) history.index++;
      return history.entries[history.index];
    },
    canUndo(history) {
      return history.index > 0;
    },
    canRedo(history) {
      return history.index < history.entries.length - 1;
    }
  };
})(window.MDManager);
