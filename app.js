window.MDManager = window.MDManager || {};

(function (app) {
  let project = null;
  let fileHandle = null;
  let recentFiles = [];
  let savedMarkdown = "";
  let history = null;

  function render() {
    app.render.project(project);
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

  function recordChange() {
    app.history.record(history, currentMarkdown());
    render();
  }

  async function save() {
    if (!project || currentMarkdown() === savedMarkdown) return;
    const markdown = currentMarkdown();
    await app.files.save(fileHandle, markdown);
    savedMarkdown = markdown;
    updateHistoryControls();
  }

  function restore(markdown) {
    project = app.markdown.parse(markdown);
    render();
  }

  async function useOpenedFile(opened) {
    if (!opened) return;
    fileHandle = opened.handle;
    project = app.markdown.parse(opened.markdown);
    savedMarkdown = opened.markdown;
    history = app.history.create(opened.markdown);
    await app.files.remember(fileHandle);
    render();
  }

  document.getElementById("openFile").addEventListener("click", async () => {
    try {
      const opened = await app.files.open();
      await useOpenedFile(opened);
    } catch (error) {
      if (error.name === "AbortError") return;
      document.getElementById("content").innerHTML = `<div class="error">The file could not be read: ${app.render.escapeHtml(error.message)}</div>`;
    }
  });

  app.interactions.setOpenRecent(async index => {
    try {
      await useOpenedFile(await app.files.read(recentFiles[index].handle));
    } catch (error) {
      document.querySelector(".recent-files-list").innerHTML = `<p class="recent-files-empty">The file could not be opened: ${app.render.escapeHtml(error.message)}</p>`;
    }
  });

  app.interactions.setHistoryActions({
    save,
    undo() {
      if (history && app.history.canUndo(history)) restore(app.history.undo(history));
    },
    redo() {
      if (history && app.history.canRedo(history)) restore(app.history.redo(history));
    }
  });

  app.files.recent().then(entries => {
    recentFiles = entries;
    app.render.start(entries);
    updateHistoryControls();
  });
})(window.MDManager);
