window.MDManager = window.MDManager || {};

(function (app) {
  let project = null;
  let changed = null;
  let sortables = [];
  let openRecent = null;
  let removeRecent = null;
  let save = null;
  let undo = null;
  let redo = null;

  function updateStatsVisibility() {
    const stats = document.getElementById("projectStats");
    if (stats.hidden) return;
    const statsRect = stats.getBoundingClientRect();
    const obstructed = [...document.querySelectorAll('.card[aria-expanded="true"]')].some(card => {
      const cardRect = card.getBoundingClientRect();
      return cardRect.left < statsRect.right && cardRect.right > statsRect.left && cardRect.top < statsRect.bottom && cardRect.bottom > statsRect.top;
    });
    stats.classList.toggle("obstructed", obstructed);
  }

  function scheduleStatsVisibility() {
    requestAnimationFrame(updateStatsVisibility);
  }

  function updateBacklogSpace() {
    const backlog = document.getElementById("backlog");
    if (backlog.hidden) return;
    backlog.style.removeProperty("max-height");
    const backlogRect = backlog.getBoundingClientRect();
    const featureBottom = Math.max(0, ...[...document.querySelectorAll("#content > .release")]
      .map(feature => feature.getBoundingClientRect())
      .filter(feature => feature.left < backlogRect.right && feature.right > backlogRect.left)
      .map(feature => feature.bottom));
    const bottomGap = parseFloat(getComputedStyle(backlog).bottom) || 0;
    const cardGap = parseFloat(getComputedStyle(document.documentElement).fontSize) * .75;
    backlog.style.maxHeight = `${Math.max(0, window.innerHeight - featureBottom - bottomGap - cardGap)}px`;
  }

  function scheduleBacklogSpace() {
    requestAnimationFrame(updateBacklogSpace);
  }

  function captureViewState() {
    return {
      tasks: [...document.querySelectorAll(".card")].map(task => task.getAttribute("aria-expanded") === "true"),
      featureNotes: [...document.querySelectorAll(".feature-note")].map(note => note.getAttribute("aria-expanded") === "true"),
      backlogOpen: !document.getElementById("backlog").hidden
    };
  }

  function collapseAll() {
    document.querySelectorAll(".card").forEach(task => {
      task.setAttribute("aria-expanded", "false");
      task.querySelector(".card-body").hidden = true;
    });
    document.querySelectorAll(".feature-note").forEach(note => {
      note.classList.add("collapsed");
      note.setAttribute("aria-expanded", "false");
    });
  }

  function toggleBacklog() {
    const backlog = document.getElementById("backlog");
    const button = document.getElementById("toggleBacklog");
    if (button.disabled) return;
    const open = backlog.hidden;
    if (open) collapseAll();
    backlog.hidden = !open;
    button.setAttribute("aria-pressed", String(open));
    scheduleStatsVisibility();
    scheduleBacklogSpace();
  }

  function resetSortables() {
    sortables.forEach(sortable => sortable.destroy());
    sortables = [];
  }

  function connectSortable() {
    resetSortables();
    if (!project) return;
    const content = document.getElementById("content");

    sortables.push(Sortable.create(content, {
      animation: 150,
      draggable: "> .release",
      handle: ".release-header",
      filter: ".delete-btn",
      preventOnFilter: false,
      ghostClass: "sortable-ghost",
      onEnd(event) {
        app.domain.moveFeature(project, event.oldIndex, event.newIndex);
        changed(captureViewState());
      }
    }));

    document.querySelectorAll(".board").forEach(board => {
      sortables.push(Sortable.create(board, {
        group: "tasks",
        animation: 150,
        draggable: "> .card",
        handle: ".card-header",
        filter: ".delete-btn",
        preventOnFilter: false,
        ghostClass: "sortable-ghost",
        onEnd(event) {
          const fromFeature = Number(event.from.closest(".release").dataset.feature);
          const toFeature = Number(event.to.closest(".release").dataset.feature);
          app.domain.moveTask(project, fromFeature, event.oldIndex, toFeature, event.newIndex);
          changed(captureViewState());
        }
      }));
    });

    document.querySelectorAll(".todo-list").forEach(list => {
      sortables.push(Sortable.create(list, {
        group: "todos",
        animation: 150,
        draggable: "> .todo-item",
        handle: ".todo-text",
        filter: ".delete-btn",
        preventOnFilter: false,
        emptyInsertThreshold: 30,
        ghostClass: "sortable-ghost",
        onEnd(event) {
          const fromTask = event.from.closest(".card");
          const toTask = event.to.closest(".card");
          const fromFeature = event.from.closest(".release");
          const toFeature = event.to.closest(".release");
          app.domain.moveTodo(
            project,
            Number(fromFeature.dataset.feature), Number(fromTask.dataset.task), Number(event.item.dataset.line),
            Number(toFeature.dataset.feature), Number(toTask.dataset.task), Number(event.to.dataset.anchorLine), event.newIndex
          );
          changed(captureViewState());
        }
      }));
    });

  }

  function setProject(nextProject, onChanged) {
    project = nextProject;
    changed = onChanged;
    connectSortable();
    scheduleStatsVisibility();
    scheduleBacklogSpace();
  }

  function handleContentClick(event) {
    const removeRecentButton = event.target.closest(".recent-delete");
    if (removeRecentButton) {
      removeRecent(Number(removeRecentButton.dataset.removeRecent));
      return;
    }

    const recentFile = event.target.closest(".recent-file-open");
    if (recentFile) {
      openRecent(Number(recentFile.dataset.recent));
      return;
    }

    const noteToggle = event.target.closest(".note-toggle");
    if (noteToggle) {
      const note = noteToggle.closest(".feature-note");
      const expanded = note.classList.toggle("collapsed") === false;
      note.setAttribute("aria-expanded", String(expanded));
      app.render.layoutGrid(true);
      return;
    }

    const deleteButton = event.target.closest(".delete-btn");
    if (deleteButton) {
      event.stopPropagation();
      const featureElement = deleteButton.closest(".release");
      const featureIndex = Number(featureElement.dataset.feature);
      const viewState = captureViewState();
      if (deleteButton.dataset.delete === "feature") {
        const firstTask = [...document.querySelectorAll(".card")].indexOf(featureElement.querySelector(".card"));
        if (firstTask >= 0) viewState.tasks.splice(firstTask, featureElement.querySelectorAll(".card").length);
        app.domain.deleteFeature(project, featureIndex);
      } else if (deleteButton.dataset.delete === "task") {
        const taskElement = deleteButton.closest(".card");
        viewState.tasks.splice([...document.querySelectorAll(".card")].indexOf(taskElement), 1);
        app.domain.deleteTask(project, featureIndex, Number(taskElement.dataset.task));
      } else {
        const taskElement = deleteButton.closest(".card");
        const task = project.features[featureIndex].tasks[taskElement.dataset.task];
        app.domain.deleteTodo(task, Number(deleteButton.closest(".todo-item").dataset.line));
      }
      changed(viewState);
      return;
    }

    const checkbox = event.target.closest(".checkbox");
    if (checkbox) {
      event.stopPropagation();
      const todo = checkbox.closest(".todo-item");
      const taskElement = checkbox.closest(".card");
      const featureElement = checkbox.closest(".release");
      const task = project.features[featureElement.dataset.feature].tasks[taskElement.dataset.task];
      app.domain.setTodo(task, Number(todo.dataset.line), checkbox.dataset.checked !== "true");
      changed(captureViewState());
      return;
    }

    const taskHeader = event.target.closest(".card-header");
    if (taskHeader) {
      const task = taskHeader.closest(".card");
      const body = task.querySelector(".card-body");
      body.hidden = !body.hidden;
      task.setAttribute("aria-expanded", String(!body.hidden));
      app.render.layoutGrid(true);
      return;
    }

    const featureHeader = event.target.closest(".release-header");
    if (featureHeader) {
      const feature = featureHeader.closest(".release");
      const tasks = [...feature.querySelectorAll(".card")];
      const notes = [...feature.querySelectorAll(".feature-note")];
      const expand = tasks.some(task => task.getAttribute("aria-expanded") !== "true") || notes.some(note => note.getAttribute("aria-expanded") !== "true");
      tasks.forEach(task => {
        task.setAttribute("aria-expanded", String(expand));
        task.querySelector(".card-body").hidden = !expand;
      });
      notes.forEach(note => {
        note.classList.toggle("collapsed", !expand);
        note.setAttribute("aria-expanded", String(expand));
      });
      app.render.layoutGrid(true);
    }
  }

  document.getElementById("content").addEventListener("click", handleContentClick);
  document.getElementById("backlog").addEventListener("click", handleContentClick);

  document.getElementById("toggleBacklog").addEventListener("click", toggleBacklog);
  document.addEventListener("keydown", event => {
    if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b" && !document.getElementById("toggleBacklog").disabled) {
      event.preventDefault();
      toggleBacklog();
    }
  });

  document.getElementById("toggleMetadata").addEventListener("click", event => {
    const active = document.body.classList.toggle("show-metadata");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    app.render.equalizeReleaseHeaders();
    app.render.layoutGrid(true);
  });

  document.getElementById("toggleStats").addEventListener("click", event => {
    const active = document.body.classList.toggle("hide-stats") === false;
    event.currentTarget.setAttribute("aria-pressed", String(active));
    scheduleStatsVisibility();
  });

  document.getElementById("toggleGridView").addEventListener("click", event => {
    const active = document.body.classList.toggle("toggle-grid-view");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    const metadataButton = document.getElementById("toggleMetadata");
    const statsButton = document.getElementById("toggleStats");
    metadataButton.disabled = active;
    statsButton.disabled = active;
    if (active) {
      document.body.classList.remove("show-metadata");
      document.body.classList.add("hide-stats");
      metadataButton.setAttribute("aria-pressed", "false");
      statsButton.setAttribute("aria-pressed", "false");
    }
    app.render.setGridTitles(active);
    if (active) collapseAll();
    app.render.equalizeReleaseHeaders();
    app.render.layoutGrid(true);
  });

  document.getElementById("saveFile").addEventListener("click", () => save());
  document.getElementById("undoChange").addEventListener("click", () => undo());
  document.getElementById("redoChange").addEventListener("click", () => redo());
  document.addEventListener("click", scheduleStatsVisibility);
  document.addEventListener("click", scheduleBacklogSpace);
  document.getElementById("content").addEventListener("scroll", () => { updateStatsVisibility(); updateBacklogSpace(); });
  window.addEventListener("resize", () => { scheduleStatsVisibility(); scheduleBacklogSpace(); });

  app.interactions = {
    setProject,
    getViewState: captureViewState,
    setOpenRecent(callback) { openRecent = callback; },
    setRemoveRecent(callback) { removeRecent = callback; },
    setHistoryActions(actions) { save = actions.save; undo = actions.undo; redo = actions.redo; },
    setHistoryState(state) {
      document.getElementById("saveFile").classList.toggle("dirty", state.dirty);
      document.getElementById("undoChange").disabled = !state.canUndo;
      document.getElementById("redoChange").disabled = !state.canRedo;
    }
  };
})(window.MDManager);
