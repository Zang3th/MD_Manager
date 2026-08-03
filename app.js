window.MDManager = window.MDManager || {};

/** @param {any} app */
(function (app) {
  /** @type {MDProject | null} */
  let project = null;
  /** @type {MDFileHandle | null} */
  let fileHandle = null;
  /** @type {MDRecentFile[]} */
  let recentFiles = [];
  /** @type {MDUndoSystem | null} */
  let undoSystem = null;
  let diskMarkdown = "";
  let diskStamp = "";
  let serializedMarkdown = "";
  let savedMarkdown = "";
  /** @type {{markdown: string, stamp: string} | null} */
  let externalChange = null;
  let checkingExternal = false;
  let lastExternalContentCheck = 0;
  let lastExternalCheckError = "";

  /** @param {MDViewState} [viewState] */
  function render(viewState) {
    if (!project || !fileHandle) return;
    app.render.project(project, viewState, fileHandle.name);
    app.interactions.setProject(project, executeAction);
    app.interactions.restoreViewState(viewState);
    updateUndoSystemControls();
  }

  function currentMarkdown() {
    return app.markdown.serialize(project);
  }

  function updateUndoSystemControls() {
    app.interactions.setUndoSystemState({
      dirty: Boolean(undoSystem) && serializedMarkdown !== savedMarkdown,
      canUndo: Boolean(undoSystem) && app.undoSystem.canUndo(undoSystem),
      canRedo: Boolean(undoSystem) && app.undoSystem.canRedo(undoSystem),
      undoLabel: undoSystem ? app.undoSystem.undoLabel(undoSystem) : "",
      redoLabel: undoSystem ? app.undoSystem.redoLabel(undoSystem) : "",
      externalChange: Boolean(externalChange)
    });
  }

  /** @param {Error} error */
  function formatErrorBody(error) {
    const lineNumber = /** @type {Error & {lineNumber?: number}} */ (error).lineNumber || 1;
    return `Line ${lineNumber}: ${error.message}`;
  }

  /** @param {unknown} error */
  function isMissingFile(error) {
    return typeof error === "object" && error !== null && /** @type {{name?: unknown}} */ (error).name === "NotFoundError";
  }

  /** @param {MDUndoAction} action @param {{render?: boolean}} [options] @returns {boolean} */
  function executeAction(action, options = {}) {
    if (!undoSystem) return false;
    const changed = app.undoSystem.execute(undoSystem, action);
    if (!changed) {
      updateUndoSystemControls();
      return false;
    }
    serializedMarkdown = currentMarkdown();
    if (options.render === false) updateUndoSystemControls();
    else render(action.afterViewState);
    return true;
  }

  /** @param {boolean} [force] */
  async function save(force = false) {
    if (!project || !fileHandle || !undoSystem) return;
    if (externalChange && !force) {
      app.notifications.show("warning", "File changed externally", "Choose Reload or Overwrite before saving.");
      return;
    }
    if (!force && serializedMarkdown === savedMarkdown) return;
    const markdown = serializedMarkdown;
    await app.files.save(fileHandle, markdown);
    diskMarkdown = markdown;
    if (typeof fileHandle.getFile === "function") {
      const inspected = await app.files.inspect(fileHandle);
      diskStamp = inspected.markdown === markdown ? inspected.stamp : "";
    } else diskStamp = "";
    externalChange = null;
    app.undoSystem.markSaved(undoSystem);
    savedMarkdown = markdown;
    updateUndoSystemControls();
    app.notifications.show("info", "File saved", [{ value: fileHandle.name }, " saved."]);
  }

  /** @param {MDOpenedFile | null} opened */
  async function useOpenedFile(opened) {
    if (!opened) return;
    const openedProject = app.markdown.parse(opened.markdown);
    fileHandle = opened.handle;
    project = openedProject;
    serializedMarkdown = app.markdown.serialize(openedProject);
    savedMarkdown = serializedMarkdown;
    diskMarkdown = opened.markdown;
    diskStamp = opened.stamp || "";
    externalChange = null;
    undoSystem = app.undoSystem.create();
    render();
    app.interactions.startClock();
    app.notifications.show("info", "File loaded", [{ value: fileHandle.name }, " is ready."]);
    app.files.remember(fileHandle, openedProject.title).catch((/** @type {Error} */ error) => {
      app.notifications.show("error", "Recent files", `Recent-files list could not be updated: ${error.message}`);
    });
  }

  async function checkExternalChange() {
    if (!fileHandle || typeof fileHandle.getFile !== "function" || checkingExternal) return;
    checkingExternal = true;
    try {
      const stamp = await app.files.stat(fileHandle);
      lastExternalCheckError = "";
      const now = Date.now();
      if (diskStamp && stamp !== "0:0" && stamp === diskStamp && now - lastExternalContentCheck < 30000) return;
      const inspected = await app.files.inspect(fileHandle);
      lastExternalContentCheck = now;
      lastExternalCheckError = "";
      if (inspected.markdown === diskMarkdown) {
        diskStamp = inspected.stamp;
        if (externalChange) {
          externalChange = null;
          updateUndoSystemControls();
        }
        return;
      }
      if (externalChange?.markdown === inspected.markdown) return;
      externalChange = inspected;
      updateUndoSystemControls();
      app.notifications.show("warning", "File changed externally", [{ value: fileHandle.name }, " changed on disk. Choose Reload or Overwrite."]);
    } catch (error) {
      if (isMissingFile(error)) {
        const errorKey = `deleted:${fileHandle.name}`;
        if (errorKey !== lastExternalCheckError) {
          lastExternalCheckError = errorKey;
          externalChange = null;
          updateUndoSystemControls();
          app.notifications.show("error", "File deleted", [{ value: fileHandle.name }, " was deleted from disk. Your work remains open."]);
        }
        return;
      }
      if (error instanceof Error && error.message !== lastExternalCheckError) {
        lastExternalCheckError = error.message;
        app.notifications.show("error", "File check", `External changes could not be checked: ${error.message}`);
      }
    } finally {
      checkingExternal = false;
    }
  }

  async function reloadExternal() {
    if (!externalChange || !fileHandle) return false;
    try {
      const viewState = app.interactions.getViewState();
      const reloadedProject = app.markdown.parse(externalChange.markdown);
      project = reloadedProject;
      serializedMarkdown = app.markdown.serialize(reloadedProject);
      savedMarkdown = serializedMarkdown;
      diskMarkdown = externalChange.markdown;
      diskStamp = externalChange.stamp;
      externalChange = null;
      undoSystem = app.undoSystem.create();
      render(viewState);
      app.notifications.show("info", "File reloaded", [{ value: fileHandle.name }, " reloaded from disk."]);
      return true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.notifications.show("error", "File reload", error.name === "MarkdownFormatError" ? formatErrorBody(error) : error.message);
      return false;
    }
  }

  async function overwriteExternal() {
    if (!externalChange) return false;
    await save(true);
    return true;
  }

  app.interactions.setOpenFile(async () => {
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

  app.interactions.setCreateProject(async () => {
    try {
      await useOpenedFile(await app.files.createProject());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === "AbortError") return;
      app.notifications.show("error", "Project creation", `Project could not be created: ${error.message}`);
    }
  });

  app.interactions.setUndoSystemActions({
    save,
    undo() {
      if (!undoSystem) return;
      const result = app.undoSystem.undo(undoSystem);
      if (result) {
        serializedMarkdown = currentMarkdown();
        app.interactions.clearClipboard();
        render(result.viewState);
      }
    },
    redo() {
      if (!undoSystem) return;
      const result = app.undoSystem.redo(undoSystem);
      if (result) {
        serializedMarkdown = currentMarkdown();
        render(result.viewState);
      }
    },
    reloadExternal,
    overwriteExternal
  });

  window.addEventListener("focus", () => { void checkExternalChange(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkExternalChange();
  });
  window.setInterval(() => { if (!document.hidden) void checkExternalChange(); }, 2000);

  app.files.recent().then((/** @type {MDRecentFile[]} */ entries) => {
    recentFiles = entries;
    app.render.start(entries);
    updateUndoSystemControls();
  }).catch((/** @type {Error} */ error) => {
    recentFiles = [];
    app.render.start(recentFiles);
    app.render.recentError(`Recent files could not be loaded: ${error.message}`);
    app.notifications.show("error", "Recent files", `Recent-files list could not be loaded: ${error.message}`);
    updateUndoSystemControls();
  });
})(window.MDManager);
