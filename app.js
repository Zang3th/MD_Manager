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

  /** @param {MDViewState} [viewState] */
  function render(viewState) {
    if (!project || !fileHandle) return;
    app.render.project(project, viewState, fileHandle.name);
    app.interactions.setProject(project, recordChange);
    updateHistoryControls();
  }

  function currentMarkdown() {
    return app.markdown.serialize(project);
  }

  function updateHistoryControls() {
    const markdown = project ? currentMarkdown() : "";
    app.interactions.setHistoryState({
      dirty: Boolean(project) && markdown !== savedMarkdown,
      canUndo: Boolean(history) && app.history.canUndo(history),
      canRedo: Boolean(history) && app.history.canRedo(history)
    });
  }

  /** @param {MDViewState} viewState @param {any} [options] */
  function recordChange(viewState, options = {}) {
    app.history.record(history, currentMarkdown());
    if (options.render === false) updateHistoryControls();
    else render(viewState);
  }

  async function save() {
    if (!project || currentMarkdown() === savedMarkdown) return;
    const markdown = currentMarkdown();
    await app.files.save(fileHandle, markdown);
    savedMarkdown = markdown;
    updateHistoryControls();
  }

  /** @param {string} markdown @param {MDViewState} viewState */
  function restore(markdown, viewState) {
    project = app.markdown.parse(markdown);
    render(viewState);
  }

  /** @param {MDOpenedFile} opened */
  async function useOpenedFile(opened) {
    if (!opened) return;
    fileHandle = opened.handle;
    const openedProject = app.markdown.parse(opened.markdown);
    project = openedProject;
    savedMarkdown = opened.markdown;
    history = app.history.create(opened.markdown);
    render();
    app.files.remember(fileHandle, openedProject.title).catch(() => {});
  }

  document.getElementById("openFile").addEventListener("click", async () => {
    try {
      const opened = await app.files.open();
      await useOpenedFile(opened);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === "AbortError") return;
      app.render.error(`The file could not be read: ${error.message}`);
    }
  });

  app.interactions.setOpenRecent(async (/** @type {number} */ index) => {
    try {
      await useOpenedFile(await app.files.read(recentFiles[index].handle));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.render.recentError(`The file could not be opened: ${error.message}`);
    }
  });

  app.interactions.setRemoveRecent(async (/** @type {number} */ index) => {
    const entry = recentFiles[index];
    if (!entry) return;
    await app.files.forget(entry.id);
    recentFiles.splice(index, 1);
    app.render.start(recentFiles);
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
    updateHistoryControls();
  });
})(window.MDManager);
