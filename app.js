window.MDManager = window.MDManager || {};

/** @param {any} app */
(function (app) {
  const requiredComponents = /** @type {Array<[string, () => boolean]>} */ ([
    ...(app.interactions ? [[app.interactions.sortableSource, () => app.interactions.sortableReady === true]] : []),
    ["domain/project.js", () => Boolean(app.domain)],
    ["domain/history.js", () => Boolean(app.undoSystem && app.history)],
    ["domain/status.js", () => Boolean(app.status)],
    ["io/markdown.js", () => Boolean(app.markdown)],
    ["io/templates.js", () => Boolean(app.templates)],
    ["io/files.js", () => Boolean(app.files)],
    ["ui/tooltips.js", () => Boolean(app.tooltips)],
    ["ui/theme.js", () => Boolean(app.theme)],
    ["ui/layout.js", () => Boolean(app.layout)],
    ["ui/render.js", () => Boolean(app.render)],
    ["ui/editor.js", () => Boolean(app.editor)],
    ["ui/notifications.js", () => Boolean(app.notifications)],
    ["ui/sounds.js", () => Boolean(app.sounds)],
    ["ui/interactions.js", () => Boolean(app.interactions)]
  ]);

  /** @param {HTMLImageElement} image */
  function imageLoaded(image) {
    if (image.complete) return Promise.resolve(image.naturalWidth > 0);
    return new Promise(resolve => {
      image.addEventListener("load", () => resolve(true), { once: true });
      image.addEventListener("error", () => resolve(false), { once: true });
    });
  }

  /** @param {string} font */
  async function fontLoaded(font) {
    try {
      return (await document.fonts.load(font)).length > 0;
    } catch {
      return false;
    }
  }

  /** @param {string} title @param {string} message @param {string} copyMessage @param {string} errorCode */
  function startupFailure(title, message, copyMessage, errorCode) {
    app.render?.start([]);
    if (app.notifications?.fatal) app.notifications.fatal(title, message, copyMessage, errorCode);
    else {
      document.body.classList.add("startup-blocked");
      document.body.dataset.startupState = "blocked";
      document.querySelectorAll(".header,.workspace,dialog,.watermark").forEach(element => {
        if (element instanceof HTMLElement) element.inert = true;
      });
      document.querySelectorAll("button,input,textarea,select").forEach(control => { control.disabled = true; });
      const content = document.getElementById("content");
      if (content) content.textContent = `${title}: ${message}`;
    }
  }

  async function initialize() {
    const missingComponents = requiredComponents.filter(([, available]) => !available()).map(([file]) => file);
    if (missingComponents.length) {
      document.body.classList.add("fonts-ready");
      startupFailure("Application files missing", "Required application files are missing. Restore the complete release folder and reload MD_Manager.", `Required application files are missing. Restore the complete release folder and open MD_Manager.html directly from that folder. MD_Manager was blocked to prevent incomplete operation. Keep the original directory structure unchanged. Missing components: ${missingComponents.join(", ")}.`, "MDM-001");
      return;
    }

    const missingApis = app.files.missingFileSystemApis();
    if (missingApis.length) {
      document.body.classList.add("fonts-ready");
      startupFailure("Unsupported browser", "A Chromium-based browser is required, such as Chrome, Edge, Brave, or Chromium.", `A Chromium-based browser is required. Open MD_Manager in Chrome, Edge, Brave, Chromium, or another Chromium-based browser. The required File System Access API is unavailable, so local Markdown files cannot be opened, created, or saved. Missing browser functions: ${missingApis.join(", ")}.`, "MDM-002");
      return;
    }

    const missingResources = [];
    if (!getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()) missingResources.push("styles.css");
    const [interLoaded, monoLoaded] = await Promise.all([
      fontLoaded('400 14px "Inter"'),
      fontLoaded('400 14px "JetBrains Mono"')
    ]);
    if (!interLoaded) missingResources.push("res/fonts/InterVariable.woff2");
    if (!monoLoaded) missingResources.push("res/fonts/JetBrainsMonoVariable.woff2");
    const logo = document.querySelector(".app-logo");
    if (!(logo instanceof HTMLImageElement) || !(await imageLoaded(logo))) missingResources.push("res/logo/Logo.svg");
    document.body.classList.add("fonts-ready");
    if (missingResources.length) {
      startupFailure("Application resources missing", "Required application resources are missing. Restore the complete release folder and reload MD_Manager.", `Required local resources did not load. Restore the complete release folder and open MD_Manager.html directly from that folder. MD_Manager was blocked to prevent inconsistent layout or behavior. Keep the original directory structure unchanged. Missing resources: ${missingResources.join(", ")}.`, "MDM-003");
      return;
    }

    startApplication();
  }

  function startApplication() {

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

  /** @param {MDProject} activeProject */
  function showMarkdownWarnings(activeProject) {
    activeProject.warnings.forEach(warning => {
      app.notifications.show("warning", "Markdown warning", `Line ${warning.lineNumber}: ${warning.message}`);
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
    showMarkdownWarnings(openedProject);
    app.files.remember(fileHandle, openedProject.title).catch((/** @type {Error} */ error) => {
      app.notifications.show("error", "Recent files", "The recent-files list could not be updated.", undefined, `Recent-files list could not be updated: ${error.message}`, "MDM-101");
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
          app.notifications.show("error", "File deleted", [{ value: fileHandle.name }, " was deleted from disk. Your work remains open."], undefined, [{ value: fileHandle.name }, " was deleted from disk. Your work remains open."], "MDM-102");
        }
        return;
      }
      if (error instanceof Error && error.message !== lastExternalCheckError) {
        lastExternalCheckError = error.message;
        app.notifications.show("error", "File check", "External file changes could not be checked.", undefined, `External changes could not be checked: ${error.message}`, "MDM-103");
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
      showMarkdownWarnings(reloadedProject);
      return true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const formatError = error.name === "MarkdownFormatError";
      app.notifications.show("error", "File reload", formatError ? "The changed file has an invalid Markdown format." : "The changed file could not be reloaded.", undefined, formatError ? formatErrorBody(error) : `File reload failed: ${error.message}`, formatError ? "MDM-104" : "MDM-105");
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
      app.notifications.show("error", formatError ? "File format" : "File read", formatError ? "The selected file has an invalid Markdown format." : "The selected file could not be read.", undefined, formatError ? formatErrorBody(error) : `File could not be read: ${error.message}`, formatError ? "MDM-106" : "MDM-107");
    }
  });

  app.interactions.setOpenRecent(async (/** @type {number} */ index) => {
    try {
      await useOpenedFile(await app.files.read(recentFiles[index].handle));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const formatError = error.name === "MarkdownFormatError";
      app.notifications.show("error", formatError ? "File format" : "File open", formatError ? "The recent file has an invalid Markdown format." : "The recent file could not be opened.", undefined, formatError ? formatErrorBody(error) : `Recent file could not be opened: ${error.message}`, formatError ? "MDM-108" : "MDM-109");
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
      app.notifications.show("error", "Recent files", "The file could not be removed from the recent-files list.", undefined, `File could not be removed from recent-files list: ${error.message}`, "MDM-110");
    }
  });

  app.interactions.setCreateProject(async () => {
    try {
      await useOpenedFile(await app.files.createProject());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === "AbortError") return;
      app.notifications.show("error", "Project creation", "The project file could not be created.", undefined, `Project could not be created: ${error.message}`, "MDM-111");
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
    document.body.dataset.startupState = "ready";
    updateUndoSystemControls();
  }).catch((/** @type {Error} */ error) => {
    recentFiles = [];
    app.render.start(recentFiles);
    app.notifications.fatal("Recent files unavailable", "Browser storage for recent files is unavailable. Enable storage for local files and reload MD_Manager.", `MD_Manager could not start because browser storage for recent files is unavailable. Reload after enabling storage for local file pages. No project data was changed. Technical details: ${error.message}`, "MDM-112");
    updateUndoSystemControls();
  });
  }

  void initialize().catch((/** @type {unknown} */ error) => {
    document.body.classList.add("fonts-ready");
    const details = error instanceof Error ? error.stack || error.message : String(error);
    startupFailure("Startup failed", "MD_Manager could not start. Restore the complete release folder and reload the application.", `MD_Manager encountered an unexpected error while checking its startup requirements and was blocked to prevent incomplete operation. Restore the complete release folder, then reload the application. Technical details: ${details}`, "MDM-004");
  });
})(window.MDManager);
