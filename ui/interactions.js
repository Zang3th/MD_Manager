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
      features: [...document.querySelectorAll(".column")].map(column => column.classList.contains("collapsed")),
      cards: [...document.querySelectorAll(".card")].map(card => card.getAttribute("aria-expanded") === "true")
    };
  }

  function resetSortables() {
    for (const sortable of sortables) sortable.destroy();
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
      ghostClass: "sortable-ghost",
      onEnd(event) {
        app.domain.moveRelease(project, event.oldIndex, event.newIndex);
        changed(captureViewState());
      }
    }));

    document.querySelectorAll(".board").forEach(board => {
      sortables.push(Sortable.create(board, {
        group: "features",
        animation: 150,
        draggable: "> .column",
        handle: ".column-header",
        ghostClass: "sortable-ghost",
        onEnd(event) {
          const fromRelease = Number(event.from.closest(".release").dataset.release);
          const toRelease = Number(event.to.closest(".release").dataset.release);
          app.domain.moveFeature(project, fromRelease, event.oldIndex, toRelease, event.newIndex);
          changed(captureViewState());
        }
      }));
    });

    document.querySelectorAll(".card-list").forEach(list => {
      sortables.push(Sortable.create(list, {
        group: "cards",
        animation: 150,
        draggable: "> .card",
        handle: ".card-header",
        ghostClass: "sortable-ghost",
        onEnd(event) {
          const fromColumn = event.from.closest(".column");
          const toColumn = event.to.closest(".column");
          app.domain.moveCard(
            project,
            Number(fromColumn.closest(".release").dataset.release), Number(fromColumn.dataset.feature), event.oldIndex,
            Number(toColumn.closest(".release").dataset.release), Number(toColumn.dataset.feature), event.newIndex
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

    const checkbox = event.target.closest(".checkbox");
    if (checkbox) {
      event.stopPropagation();
      const cardElement = checkbox.closest(".card");
      const column = checkbox.closest(".column");
      const release = checkbox.closest(".release");
      const card = project.releases[release.dataset.release].features[column.dataset.feature].cards[cardElement.dataset.card];
      const checked = checkbox.dataset.checked !== "true";
      app.domain.setTodo(card, Number(checkbox.dataset.line), checked);
      changed(captureViewState());
      return;
    }

    const cardHeader = event.target.closest(".card-header");
    if (cardHeader) {
      const card = cardHeader.closest(".card");
      const body = card.querySelector(".card-body");
      body.hidden = !body.hidden;
      card.setAttribute("aria-expanded", String(!body.hidden));
      return;
    }

    const columnHeader = event.target.closest(".column-header");
    if (columnHeader) columnHeader.closest(".column").classList.toggle("collapsed");
    else if (event.target.closest(".release-header")) {
      const columns = [...event.target.closest(".release").querySelectorAll(".column")];
      const expand = columns.every(column => column.classList.contains("collapsed"));
      columns.forEach(column => column.classList.toggle("collapsed", !expand));
    }
  });

  document.getElementById("toggleDates").addEventListener("click", event => {
    const active = document.body.classList.toggle("show-dates");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    app.render.equalizeReleaseHeaders();
  });

  document.getElementById("toggleGridView").addEventListener("click", event => {
    const active = document.body.classList.toggle("toggle-grid-view");
    event.currentTarget.setAttribute("aria-pressed", String(active));
    if (active) document.querySelectorAll(".column").forEach(column => column.classList.add("collapsed"));
    app.render.equalizeReleaseHeaders();
    app.render.layoutGrid(true);
  });

  document.getElementById("saveFile").addEventListener("click", () => save());
  document.getElementById("undoChange").addEventListener("click", () => undo());
  document.getElementById("redoChange").addEventListener("click", () => redo());

  app.interactions = {
    setProject,
    getViewState: captureViewState,
    setOpenRecent(callback) {
      openRecent = callback;
    },
    setHistoryActions(actions) {
      save = actions.save;
      undo = actions.undo;
      redo = actions.redo;
    },
    setHistoryState(state) {
      document.getElementById("saveFile").classList.toggle("dirty", state.dirty);
      document.getElementById("undoChange").disabled = !state.canUndo;
      document.getElementById("redoChange").disabled = !state.canRedo;
    }
  };
})(window.MDManager);
