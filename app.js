window.MDManager = window.MDManager || {};

(function (app) {
  let project = null;
  let fileHandle = null;
  let recentFiles = [];
  let savedMarkdown = "";
  let history = null;

  function render(viewState) {
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

  function recordChange(viewState) {
    app.history.record(history, currentMarkdown());
    render(viewState);
  }

  async function save() {
    if (!project || currentMarkdown() === savedMarkdown) return;
    const markdown = currentMarkdown();
    await app.files.save(fileHandle, markdown);
    savedMarkdown = markdown;
    updateHistoryControls();
  }

  function restore(markdown, viewState) {
    project = app.markdown.parse(markdown);
    render(viewState);
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

  app.interactions.setRemoveRecent(async index => {
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

  app.files.recent().then(entries => {
    recentFiles = entries;
    app.render.start(entries);
    updateHistoryControls();
  });
})(window.MDManager);
