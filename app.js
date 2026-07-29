window.MDManager = window.MDManager || {};

/** @param {any} app */
(function (app) {
  /** @type {MDProject | null} */
  let project = null;
  /** @type {MDFileHandle | null} */
  let fileHandle = null;
  /** @type {MDRecentFile[]} */
  let recentFiles = [];
  let savedMarkdown = "";
  /** @type {MDHistory | null} */
  let history = null;

  /** @param {MDViewState} [viewState] @param {string} [markdown] */
  function render(viewState, markdown) {
    if (!project || !fileHandle) return;
    app.render.project(project, viewState, fileHandle.name);
    app.interactions.setProject(project, recordChange);
    updateHistoryControls(markdown);
  }

  function currentMarkdown() {
    return app.markdown.serialize(project);
  }

  /** @param {string} [current] */
  function updateHistoryControls(current = project ? currentMarkdown() : "") {
    app.interactions.setHistoryState({
      dirty: Boolean(project) && current !== savedMarkdown,
      canUndo: Boolean(history) && app.history.canUndo(history),
      canRedo: Boolean(history) && app.history.canRedo(history)
    });
  }

  /** @param {Error} error */
  function formatErrorBody(error) {
    const lineNumber = /** @type {Error & {lineNumber?: number}} */ (error).lineNumber || 1;
    return `Line ${lineNumber}: ${error.message}`;
  }

  /** @param {MDViewState} viewState @param {any} [options] */
  function recordChange(viewState, options = {}) {
    const markdown = currentMarkdown();
    app.history.record(history, markdown);
    if (options.render === false) updateHistoryControls(markdown);
    else render(viewState, markdown);
  }

  async function save() {
    if (!project || !fileHandle) return;
    const markdown = currentMarkdown();
    if (markdown === savedMarkdown) return;
    await app.files.save(fileHandle, markdown);
    savedMarkdown = markdown;
    updateHistoryControls(markdown);
    app.notifications.show("info", "File saved", [{ value: fileHandle.name }, " saved."]);
  }

  /** @param {string} markdown @param {MDViewState} viewState */
  function restore(markdown, viewState) {
    project = app.markdown.parse(markdown);
    render(viewState);
  }

  /** @param {MDOpenedFile | null} opened */
  async function useOpenedFile(opened) {
    if (!opened) return;
    const openedProject = app.markdown.parse(opened.markdown);
    fileHandle = opened.handle;
    project = openedProject;
    savedMarkdown = opened.markdown;
    history = app.history.create(opened.markdown);
    render();
    app.interactions.startClock();
    app.notifications.show("info", "File loaded", [{ value: fileHandle.name }, " is ready."]);
    app.files.remember(fileHandle, openedProject.title).catch((/** @type {Error} */ error) => {
      app.notifications.show("error", "Recent files", `Recent-files list could not be updated: ${error.message}`);
    });
  }

  document.getElementById("openFile").addEventListener("click", async () => {
    /** @type {MDOpenedFile | null} */
    let opened = null;
    try {
      opened = await app.files.open();
      await useOpenedFile(opened);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === "AbortError") return;
      const formatError = error.name === "MarkdownFormatError";
      if (!formatError) app.render.error(`The file could not be read: ${error.message}`);
      app.notifications.show("error", formatError ? "File format" : "File read", formatError ? formatErrorBody(error) : `File could not be read: ${error.message}`);
    }
  });

  app.interactions.setOpenRecent(async (/** @type {number} */ index) => {
    try {
      await useOpenedFile(await app.files.read(recentFiles[index].handle));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const formatError = error.name === "MarkdownFormatError";
      if (!formatError) app.render.recentError(`The file could not be opened: ${error.message}`);
      app.notifications.show("error", formatError ? "File format" : "File open", formatError ? formatErrorBody(error) : `Recent file could not be opened: ${error.message}`);
    }
  });

  app.interactions.setRemoveRecent(async (/** @type {number} */ index) => {
    const entry = recentFiles[index];
    if (!entry) return;
    try {
      await app.files.forget(entry.id);
      recentFiles.splice(index, 1);
      app.render.start(recentFiles);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.render.start(recentFiles);
      app.notifications.show("error", "Recent files", `File could not be removed from recent-files list: ${error.message}`);
    }
  });

  app.interactions.setHistoryActions({
    save,
    undo() {
      if (history && app.history.canUndo(history)) restore(app.history.undo(history), app.interactions.getViewState());
    },
    redo() {
      if (history && app.history.canRedo(history)) restore(app.history.redo(history), app.interactions.getViewState());
    }
  });

  app.files.recent().then((/** @type {MDRecentFile[]} */ entries) => {
    recentFiles = entries;
    app.render.start(entries);
    updateHistoryControls();
  }).catch((/** @type {Error} */ error) => {
    recentFiles = [];
    app.render.start(recentFiles);
    app.render.recentError(`Recent files could not be loaded: ${error.message}`);
    app.notifications.show("error", "Recent files", `Recent-files list could not be loaded: ${error.message}`);
    updateHistoryControls();
  });
})(window.MDManager);
