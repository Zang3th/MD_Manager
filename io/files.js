import { handles, startup, storage } from "@zang3th/md-libs/platform";

window.MDManager = window.MDManager || {};

// Local file access on top of MD_Libs platform/storage (version check, write queue) and
// platform/handles (recent files in IndexedDB). app.js reaches the files only through this module.
(function (app) {
  /** One adapter per handle, so that the writes to a file share one queue. @type {WeakMap<object, import("@zang3th/md-libs/platform").storage.MDLStorageAdapter>} */
  const adapters = new WeakMap();
  /** @type {import("@zang3th/md-libs/platform").handles.MDLHandleStore<Omit<MDRecentFile, "id" | "name" | "openedAt" | "handle">> | null} */
  let recentStore = null;

  /** @param {MDFileHandle} handle */
  function adapter(handle) {
    let existing = adapters.get(handle);
    if (!existing) {
      existing = storage.file(/** @type {any} */ (handle));
      adapters.set(handle, existing);
    }
    return existing;
  }

  function recentFiles() {
    recentStore ||= handles.create({ indexedDB, database: "MD_Manager", store: "recentFiles", limit: 5 });
    return recentStore;
  }

  /** @returns {Promise<MDRecentFile[]>} */
  async function recent() {
    return /** @type {Promise<MDRecentFile[]>} */ (recentFiles().list());
  }

  /** @param {MDFileHandle} handle @param {string} [projectTitle] @param {number} [featureWidth] @param {MDViewOptions} [options] @returns {Promise<MDRecentFile>} */
  function remember(handle, projectTitle, featureWidth, options = {}) {
    return /** @type {Promise<MDRecentFile>} */ (recentFiles().remember(/** @type {any} */ (handle), existing => {
      const selectedFeatureWidth = [380, 460, 540].includes(featureWidth || 0) ? featureWidth : existing?.featureWidth;
      return {
        projectTitle: projectTitle || existing?.projectTitle || "",
        ...(selectedFeatureWidth ? { featureWidth: /** @type {380 | 460 | 540} */ (selectedFeatureWidth) } : {}),
        showArchived: options.showArchived ?? existing?.showArchived ?? false,
        showDone: options.showDone ?? existing?.showDone ?? false
      };
    }));
  }

  /** @param {string} id */
  function forget(id) {
    return recentFiles().forget(id);
  }

  /** @param {MDFileHandle} handle @returns {Promise<MDOpenedFile | null>} */
  async function read(handle) {
    if (!await storage.ensurePermission(handle, "readwrite", { query: false })) return null;
    const file = /** @type {{text: string, stamp: string}} */ (await adapter(handle).read(handle.name));
    return { handle, markdown: file.text, stamp: file.stamp };
  }

  /** @param {MDFileHandle} handle @returns {Promise<{text: string, stamp: string} | null>} */
  function inspect(handle) {
    return adapter(handle).read(handle.name);
  }

  /** @param {MDFileHandle} handle @returns {Promise<string | null>} */
  function stat(handle) {
    return adapter(handle).stat(handle.name);
  }

  async function open() {
    const picked = await window.showOpenFilePicker({
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
      multiple: false
    });
    return read(picked[0]);
  }

  /** @returns {Promise<MDOpenedFile>} */
  async function createProject() {
    const handle = await window.showSaveFilePicker({
      id: "md-manager-files",
      suggestedName: "Project.md",
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }]
    });
    const markdown = "# New Project\n";
    const stamp = await save(handle, markdown);
    return { handle, markdown, stamp };
  }

  /**
   * Writes the file; with `expectedMarkdown` only while the file still has that content, otherwise
   * it rejects with MDLStorageConflictError carrying the content on disk.
   * @param {MDFileHandle | null} handle @param {string} markdown @param {string} [expectedMarkdown] @returns {Promise<string>}
   */
  function save(handle, markdown, expectedMarkdown) {
    if (!handle) return Promise.resolve("");
    return adapter(handle).write(handle.name, markdown, expectedMarkdown);
  }

  function missingFileSystemApis() {
    return startup.missingApis({ window, apis: ["showOpenFilePicker()", "showSaveFilePicker()"] });
  }

  app.files = { open, createProject, read, stat, inspect, save, recent, remember, forget, missingFileSystemApis };
})(window.MDManager);
