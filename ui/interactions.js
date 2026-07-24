window.MDManager = window.MDManager || {};

(function (app) {
  let project = null;
  let changed = null;
  let sortables = [];
  let openRecent = null;
  let save = null;
  let undo = null;
  let redo = null;

  function captureViewState() {
    return {
      tasks: [...document.querySelectorAll(".card")].map(task => task.getAttribute("aria-expanded") === "true")
    };
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
  }

  document.getElementById("content").addEventListener("click", event => {
    const recentFile = event.target.closest(".recent-file");
    if (recentFile) {
      openRecent(Number(recentFile.dataset.recent));
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
      return;
    }

    const featureHeader = event.target.closest(".release-header");
    if (featureHeader) {
      const tasks = [...featureHeader.closest(".release").querySelectorAll(".card")];
      const expand = tasks.some(task => task.getAttribute("aria-expanded") !== "true");
      tasks.forEach(task => {
        task.setAttribute("aria-expanded", String(expand));
        task.querySelector(".card-body").hidden = !expand;
      });
    }
  });

  document.getElementById("toggleMetadata").addEventListener("click", event => {
    const active = document.body.classList.toggle("show-metadata");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    app.render.equalizeReleaseHeaders();
  });

  document.getElementById("toggleGridView").addEventListener("click", event => {
    const active = document.body.classList.toggle("toggle-grid-view");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    if (active) document.querySelectorAll(".card").forEach(task => {
      task.setAttribute("aria-expanded", "false");
      task.querySelector(".card-body").hidden = true;
    });
    app.render.equalizeReleaseHeaders();
    app.render.layoutGrid(true);
  });

  document.getElementById("saveFile").addEventListener("click", () => save());
  document.getElementById("undoChange").addEventListener("click", () => undo());
  document.getElementById("redoChange").addEventListener("click", () => redo());

  app.interactions = {
    setProject,
    getViewState: captureViewState,
    setOpenRecent(callback) { openRecent = callback; },
    setHistoryActions(actions) { save = actions.save; undo = actions.undo; redo = actions.redo; },
    setHistoryState(state) {
      document.getElementById("saveFile").classList.toggle("dirty", state.dirty);
      document.getElementById("undoChange").disabled = !state.canUndo;
      document.getElementById("redoChange").disabled = !state.canRedo;
    }
  };
})(window.MDManager);
