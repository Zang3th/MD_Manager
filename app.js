// Entry point of the bundle (see README.md): the imports replace the former script tags and keep
// their order: SortableJS, domain, IO, UI, then this file.
import "sortablejs/Sortable.min.js";
import { history } from "@zang3th/md-libs/core";
import { audio, session, startup } from "@zang3th/md-libs/platform";
import { tooltips } from "@zang3th/md-libs/ui";
import "./domain/project.js";
import "./domain/status.js";
import "./domain/search.js";
import "./io/markdown.js";
import "./io/templates.js";
import "./io/files.js";
import "./ui/theme.js";
import "./ui/layout.js";
import "./ui/render.js";
import "./ui/editor.js";
import "./ui/notifications.js";
import "./ui/interactions.js";
import "./ui/search.js";

window.MDManager = window.MDManager || {};

/** @param {any} app */
(function (app) {
  tooltips.create({ window, element: document.getElementById("appTooltip") });

  // Completion sound, played with MD_Libs platform/audio: two upward octave sweeps.
  /** @type {import("@zang3th/md-libs/platform").audio.MDLSound} */
  const completionSound = {
    gain: .12,
    dry: .8,
    wet: .2,
    voices: [
      { start: 0, points: [{ time: 0, frequency: 65.41 }, { time: .085, frequency: 130.81 }], attack: .01, hold: .13, release: .255, gain: .9 },
      { start: .22, points: [{ time: 0, frequency: 196 }, { time: .07, frequency: 392 }], attack: .02, hold: .16, release: .305, gain: 1 }
    ]
  };
  const synth = audio.create({ window, AudioContext });
  app.sounds = { play: () => synth.play(completionSound), setMuted: synth.setMuted, isMuted: synth.isMuted };

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
    const missingApis = app.files.missingFileSystemApis();
    if (missingApis.length) {
      document.body.classList.add("fonts-ready");
      startupFailure("Unsupported browser", "A Chromium-based browser is required, such as Chrome, Edge, Brave, or Chromium.", `A Chromium-based browser is required. Open MD_Manager in Chrome, Edge, Brave, Chromium, or another Chromium-based browser. The required File System Access API is unavailable, so local Markdown files cannot be opened, created, or saved. Missing browser functions: ${missingApis.join(", ")}.`, "MDM-002");
      return;
    }

    const missingResources = await startup.missingResources({
      document,
      styles: { token: "--bg-primary", file: "styles.css" },
      fonts: [
        { font: '400 14px "Inter"', file: "res/fonts/InterVariable.woff2" },
        { font: '400 14px "JetBrains Mono"', file: "res/fonts/JetBrainsMonoVariable.woff2" }
      ],
      images: [{ image: document.querySelector(".app-logo"), file: "res/logo/icon.svg" }]
    });
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
  /** @type {MDHistory | null} */
  let undoSystem = null;
  /** Saving and external-change handling of the open file (MD_Libs platform/session). @type {MDSession | null} */
  let fileSession = null;
  let serializedMarkdown = "";
  let featureWidth = 380;
  /** @type {Required<MDViewOptions>} */
  let viewOptions = { showArchived: false, showDone: false };

  /** @type {import("@zang3th/md-libs/core").history.MDLControlStrings} */
  const controlStrings = {
    undo: label => label ? `Undo: ${label}` : "Undo",
    redo: label => label ? `Redo: ${label}` : "Redo",
    save: status => status === "conflict" ? "Conflict" : status === "unsaved" ? "Unsaved" : "Saved"
  };

  /** @param {MDViewState} [viewState] */
  function render(viewState) {
    if (!project || !fileHandle) return;
    app.render.project(project, viewState, fileHandle.name, featureWidth, viewOptions);
    app.interactions.setProject(project, executeAction);
    app.searchPalette.setProject(project);
    app.interactions.restoreViewState(viewState);
    updateUndoSystemControls();
  }

  function currentMarkdown() {
    return app.markdown.serialize(project);
  }

  function updateUndoSystemControls() {
    app.interactions.setUndoSystemState(history.controls({
      history: undoSystem,
      unsaved: fileSession?.unsaved ?? 0,
      conflict: Boolean(fileSession?.hasConflict),
      strings: controlStrings
    }));
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

  /** @param {number | undefined} width */
  function normalizedFeatureWidth(width) {
    return [380, 460, 540].includes(width || 0) ? /** @type {380 | 460 | 540} */ (width) : 380;
  }

  /** @param {MDFileHandle} handle @returns {Promise<MDRecentFile | undefined>} */
  async function rememberedFile(handle) {
    for (const entry of recentFiles) {
      if (await entry.handle.isSameEntry(handle)) return entry;
    }
    return undefined;
  }

  function rememberOpenedFile() {
    if (!fileHandle || !project) return;
    const activeHandle = fileHandle;
    app.files.remember(activeHandle, project.title, featureWidth, viewOptions).then((/** @type {MDRecentFile | undefined} */ record) => {
      if (!record) return;
      recentFiles = recentFiles.filter(entry => entry.id !== record.id).concat(record).sort((left, right) => right.openedAt - left.openedAt).slice(0, 5);
    }).catch((/** @type {Error} */ error) => {
      app.notifications.show("error", "Recent files", "The recent-files list could not be updated.", undefined, `Recent-files list could not be updated: ${error.message}`, "MDM-101");
    });
  }

  /** @param {MDUndoAction} action @param {{render?: boolean}} [options] @returns {boolean} */
  function executeAction(action, options = {}) {
    if (!undoSystem) return false;
    const changed = undoSystem.execute(action);
    if (!changed) {
      updateUndoSystemControls();
      return false;
    }
    app.interactions.invalidateStatistics();
    serializedMarkdown = currentMarkdown();
    if (options.render === false) updateUndoSystemControls();
    else render(action.afterViewState);
    return true;
  }

  /**
   * The open file as a storage adapter. It calls app.files at call time, so the file access stays replaceable.
   * @param {MDFileHandle} handle
   * @returns {import("@zang3th/md-libs/platform").storage.MDLStorageAdapter}
   */
  function fileAdapter(handle) {
    return {
      name: handle.name,
      canCheck: typeof handle.getFile === "function",
      list: async () => [handle.name],
      read: () => app.files.inspect(handle),
      stat: () => app.files.stat(handle),
      write: async (_name, markdown, expected) => {
        await app.files.save(handle, markdown, expected);
        return "";
      }
    };
  }

  /** Parses changed Markdown from disk into a new project with a new undo system. @param {string | null} markdown */
  function loadProject(markdown) {
    const reloadedProject = app.markdown.parse(markdown ?? "");
    project = reloadedProject;
    serializedMarkdown = app.markdown.serialize(reloadedProject);
    undoSystem = history.create();
  }

  /** @param {MDFileHandle} handle @param {{text: string, stamp: string}} opened */
  function startSession(handle, opened) {
    fileSession?.destroy();
    const started = session.create({
      adapter: fileAdapter(handle),
      files: { [handle.name]: { serialize: () => serializedMarkdown, load: loadProject } },
      initial: { [handle.name]: opened },
      window
    });
    started.on("change", updateUndoSystemControls);
    started.on("conflict", () => {
      app.notifications.show("warning", "File changed externally", [{ value: handle.name }, " changed on disk. Choose Reload or Overwrite."]);
    });
    started.on("blocked", () => {
      app.notifications.show("warning", "File changed externally", "Choose Reload or Overwrite before saving.");
    });
    started.on("saved", ({ files }) => {
      if (files.length) app.notifications.show("info", "File saved", [{ value: handle.name }, " saved."]);
    });
    started.on("checkError", ({ error, deleted }) => {
      if (deleted) app.notifications.show("error", "File deleted", [{ value: handle.name }, " was deleted from disk. Your work remains open."], undefined, [{ value: handle.name }, " was deleted from disk. Your work remains open."], "MDM-102");
      else app.notifications.show("error", "File check", "External changes could not be checked.", undefined, `External changes could not be checked: ${/** @type {Error} */ (error).message}`, "MDM-103");
    });
    fileSession = started;
  }

  /** @param {boolean} [force] @returns {Promise<void>} */
  function save(force = false) {
    if (!project || !fileHandle || !undoSystem || !fileSession) return Promise.resolve();
    return fileSession.save(force);
  }

  /** @param {MDOpenedFile | null} opened @param {MDRecentFile} [remembered] */
  async function useOpenedFile(opened, remembered) {
    if (!opened) return;
    const openedProject = app.markdown.parse(opened.markdown);
    fileHandle = opened.handle;
    project = openedProject;
    serializedMarkdown = app.markdown.serialize(openedProject);
    undoSystem = history.create();
    startSession(opened.handle, { text: opened.markdown, stamp: opened.stamp || "" });
    featureWidth = normalizedFeatureWidth(remembered?.featureWidth);
    viewOptions = { showArchived: Boolean(remembered?.showArchived), showDone: Boolean(remembered?.showDone) };
    render();
    app.interactions.startClock();
    app.notifications.show("info", "File loaded", [{ value: fileHandle.name }, " is ready."]);
    showMarkdownWarnings(openedProject);
    rememberOpenedFile();
  }

  async function reloadExternal() {
    if (!fileSession?.hasConflict || !fileHandle) return false;
    try {
      const viewState = app.interactions.getViewState();
      fileSession.reload();
      render(viewState);
      app.notifications.show("info", "File reloaded", [{ value: fileHandle.name }, " reloaded from disk."]);
      showMarkdownWarnings(/** @type {MDProject} */ (project));
      return true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      const formatError = error.name === "MarkdownFormatError";
      app.notifications.show("error", "File reload", formatError ? "The changed file has an invalid Markdown format." : "The changed file could not be reloaded.", undefined, formatError ? formatErrorBody(error) : `File reload failed: ${error.message}`, formatError ? "MDM-104" : "MDM-105");
      return false;
    }
  }

  async function overwriteExternal() {
    if (!fileSession?.hasConflict) return false;
    await save(true);
    return true;
  }

  app.interactions.setOpenFile(async () => {
    /** @type {MDOpenedFile | null} */
    let opened = null;
    try {
      opened = await app.files.open();
      await useOpenedFile(opened, opened ? await rememberedFile(opened.handle) : undefined);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (error.name === "AbortError") return;
      const formatError = error.name === "MarkdownFormatError";
      app.notifications.show("error", formatError ? "File format" : "File read", formatError ? "The selected file has an invalid Markdown format." : "The selected file could not be read.", undefined, formatError ? formatErrorBody(error) : `File could not be read: ${error.message}`, formatError ? "MDM-106" : "MDM-107");
    }
  });

  app.interactions.setOpenRecent(async (/** @type {number} */ index) => {
    try {
      await useOpenedFile(await app.files.read(recentFiles[index].handle), recentFiles[index]);
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
      const result = undoSystem.undo();
      if (result) {
        serializedMarkdown = currentMarkdown();
        app.interactions.clearClipboard();
        render(result.viewState);
      }
    },
    redo() {
      if (!undoSystem) return;
      const result = undoSystem.redo();
      if (result) {
        serializedMarkdown = currentMarkdown();
        render(result.viewState);
      }
    },
    reloadExternal,
    overwriteExternal
  });

  app.interactions.setFeatureWidthCommitted((/** @type {number} */ width) => {
    featureWidth = normalizedFeatureWidth(width);
    rememberOpenedFile();
  });

  app.interactions.setViewOptionsChanged((/** @type {MDViewOptions} */ changes, /** @type {MDViewState} */ viewState) => {
    viewOptions = { ...viewOptions, ...changes };
    render(viewState);
    rememberOpenedFile();
  });

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
