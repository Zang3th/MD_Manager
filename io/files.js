window.MDManager = window.MDManager || {};

(function (app) {
  let writeQueue = Promise.resolve();

  function openRecentDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("MD_Manager", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("recentFiles", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function recent() {
    const database = await openRecentDatabase();
    const entries = await new Promise((resolve, reject) => {
      const request = database.transaction("recentFiles").objectStore("recentFiles").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return entries.sort((left, right) => right.openedAt - left.openedAt).slice(0, 5);
  }

  async function remember(handle) {
    const entries = await recent();
    let existing = null;
    for (const entry of entries) {
      if (await entry.handle.isSameEntry(handle)) {
        existing = entry;
        break;
      }
    }
    const record = {
      id: existing?.id || `${Date.now()}-${Math.random()}`,
      name: handle.name,
      openedAt: Date.now(),
      handle
    };
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
  }

  async function read(handle) {
    if (await handle.requestPermission({ mode: "readwrite" }) !== "granted") return null;
    return { handle, markdown: await (await handle.getFile()).text() };
  }

  async function open() {
    const handles = await window.showOpenFilePicker({
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
      multiple: false
    });
    return read(handles[0]);
  }

  function save(handle, markdown) {
    if (!handle) return Promise.resolve();
    writeQueue = writeQueue.then(async () => {
      const writable = await handle.createWritable();
      await writable.write(markdown);
      await writable.close();
    });
    return writeQueue;
  }

  app.files = { open, read, save, recent, remember };
})(window.MDManager);
