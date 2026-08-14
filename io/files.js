window.MDManager = window.MDManager || {};

(function (app) {
  let writeQueue = Promise.resolve();
  /** @type {Promise<unknown>} */
  let recentWriteQueue = Promise.resolve();

  /** @param {{lastModified?: number, size?: number}} file */
  function fileStamp(file) {
    return `${file.lastModified || 0}:${file.size || 0}`;
  }

  /** @returns {Promise<IDBDatabase>} */
  function openRecentDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("MD_Manager", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("recentFiles", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** @returns {Promise<MDRecentFile[]>} */
  async function recent() {
    const database = await openRecentDatabase();
    const entries = await new Promise((resolve, reject) => {
      const request = database.transaction("recentFiles").objectStore("recentFiles").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return /** @type {MDRecentFile[]} */ (entries).sort((left, right) => right.openedAt - left.openedAt).slice(0, 5);
  }

  /** @param {MDFileHandle} handle @param {string} [projectTitle] @param {number} [featureWidth] @returns {Promise<MDRecentFile>} */
  async function rememberRecord(handle, projectTitle, featureWidth) {
    const entries = await recent();
    let existing = null;
    for (const entry of entries) {
      if (await entry.handle.isSameEntry(handle)) {
        existing = entry;
        break;
      }
    }
    const selectedFeatureWidth = [380, 460, 540].includes(featureWidth || 0) ? featureWidth : existing?.featureWidth;
    const record = /** @type {MDRecentFile} */ ({
      id: existing?.id || `${Date.now()}-${Math.random()}`,
      name: handle.name,
      projectTitle: projectTitle || existing?.projectTitle || "",
      openedAt: Date.now(),
      handle,
      ...(selectedFeatureWidth ? { featureWidth: selectedFeatureWidth } : {})
    });
    const database = await openRecentDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("recentFiles", "readwrite");
      const store = transaction.objectStore("recentFiles");
      store.put(record);
      entries.filter(entry => entry.id !== record.id).concat(record)
        .sort((left, right) => right.openedAt - left.openedAt)
        .slice(5).forEach(entry => store.delete(entry.id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return record;
  }

  /** @param {MDFileHandle} handle @param {string} [projectTitle] @param {number} [featureWidth] @returns {Promise<MDRecentFile>} */
  function remember(handle, projectTitle, featureWidth) {
    const operation = recentWriteQueue.catch(() => {}).then(() => rememberRecord(handle, projectTitle, featureWidth));
    recentWriteQueue = operation.catch(() => {});
    return operation;
  }

  /** @param {string} id */
  async function forget(id) {
    const database = await openRecentDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("recentFiles", "readwrite");
      transaction.objectStore("recentFiles").delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }

  /** @param {MDFileHandle} handle @returns {Promise<MDOpenedFile | null>} */
  async function read(handle) {
    if (await handle.requestPermission({ mode: "readwrite" }) !== "granted") return null;
    const file = await handle.getFile();
    return { handle, markdown: await file.text(), stamp: fileStamp(file) };
  }

  /** @param {MDFileHandle} handle @returns {Promise<{markdown: string, stamp: string}>} */
  async function inspect(handle) {
    const file = await handle.getFile();
    return { markdown: await file.text(), stamp: fileStamp(file) };
  }

  /** @param {MDFileHandle} handle @returns {Promise<string>} */
  async function stat(handle) {
    const file = await handle.getFile();
    return fileStamp(file);
  }

  async function open() {
    const handles = await window.showOpenFilePicker({
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
      multiple: false
    });
    return read(handles[0]);
  }

  /** @returns {Promise<MDOpenedFile>} */
  async function createProject() {
    const handle = await window.showSaveFilePicker({
      id: "md-manager-files",
      suggestedName: "Project.md",
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }]
    });
    const markdown = "# New Project\n";
    await save(handle, markdown);
    const file = await handle.getFile();
    return { handle, markdown, stamp: fileStamp(file) };
  }

  /** @param {MDFileHandle | null} handle @param {string} markdown */
  function save(handle, markdown) {
    if (!handle) return Promise.resolve();
    const operation = writeQueue.catch(() => {}).then(async () => {
      const writable = await handle.createWritable();
      await writable.write(markdown);
      await writable.close();
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  function missingFileSystemApis() {
    const missing = [];
    if (typeof window.showOpenFilePicker !== "function") missing.push("window.showOpenFilePicker()");
    if (typeof window.showSaveFilePicker !== "function") missing.push("window.showSaveFilePicker()");
    return missing;
  }

  app.files = { open, createProject, read, stat, inspect, save, recent, remember, forget, missingFileSystemApis };
})(window.MDManager);
