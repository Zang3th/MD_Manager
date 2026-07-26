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
  let expandedBeforeGrid = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function animate(element, keyframes, options) {
    if (reducedMotion.matches) return Promise.resolve();
    return element.animate(keyframes, options).finished.catch(() => {});
  }

  function animateRemoval(element) {
    return animate(element, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(.98)" }
    ], { duration: 120, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  }

  function animateTodoToggle(featureIndex, taskIndex, lineIndex) {
    const checkbox = document.querySelector(`.release[data-feature="${featureIndex}"] .card[data-task="${taskIndex}"] .todo-item[data-line="${lineIndex}"] .checkbox`);
    if (!checkbox) return;
    animate(checkbox, [
      { transform: "scale(.82)" },
      { transform: "scale(1.08)", offset: .65 },
      { transform: "scale(1)" }
    ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function closeViewMenu() {
    document.getElementById("viewOptions").hidden = true;
    document.getElementById("toggleViewMenu").setAttribute("aria-expanded", "false");
  }

  function setGridView(active) {
    if (document.body.classList.contains("toggle-grid-view") === active) return;
    if (active) {
      expandedBeforeGrid = captureViewState();
    }
    document.body.classList.toggle("toggle-grid-view", active);
    document.getElementById("toggleGridView").setAttribute("aria-pressed", String(active));
    document.getElementById("showBoardView").setAttribute("aria-pressed", String(!active));
    if (active) {
      closeViewMenu();
    } else {
      if (expandedBeforeGrid) restoreExpandedState(expandedBeforeGrid);
    }
    app.render.fitTitles();
    if (active) collapseAll();
    app.render.equalizeReleaseHeaders();
    app.render.layoutGrid(true);
    if (!active && expandedBeforeGrid) requestAnimationFrame(() => restoreScrollState(expandedBeforeGrid));
  }

  function captureViewState() {
    const content = document.getElementById("content");
    const backlog = document.getElementById("backlog");
    return {
      tasks: [...document.querySelectorAll(".card")].map(task => task.getAttribute("aria-expanded") === "true"),
      featureNotes: [...document.querySelectorAll(".feature-note")].map(note => note.getAttribute("aria-expanded") === "true"),
      backlogOpen: !backlog.hidden,
      contentScrollLeft: content.scrollLeft,
      contentScrollTop: content.scrollTop,
      featureScrolls: [...content.querySelectorAll(":scope > .release > .release-content")].map(featureContent => ({ left: featureContent.scrollLeft, top: featureContent.scrollTop })),
      backlogScrollLeft: backlog.scrollLeft,
      backlogScrollTop: backlog.scrollTop
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

  function restoreExpandedState(viewState) {
    document.querySelectorAll(".card").forEach((task, index) => {
      const expanded = viewState.tasks[index] ?? false;
      task.setAttribute("aria-expanded", String(expanded));
      task.querySelector(".card-body").hidden = !expanded;
    });
    document.querySelectorAll(".feature-note").forEach((note, index) => {
      const expanded = viewState.featureNotes[index] ?? false;
      note.classList.toggle("collapsed", !expanded);
      note.setAttribute("aria-expanded", String(expanded));
    });
  }

  function restoreScrollState(viewState) {
    const content = document.getElementById("content");
    const backlog = document.getElementById("backlog");
    content.scrollLeft = viewState.contentScrollLeft;
    content.scrollTop = viewState.contentScrollTop;
    document.querySelectorAll("#content > .release > .release-content").forEach((featureContent, index) => {
      featureContent.scrollLeft = viewState.featureScrolls[index]?.left || 0;
      featureContent.scrollTop = viewState.featureScrolls[index]?.top || 0;
    });
    backlog.scrollLeft = viewState.backlogScrollLeft;
    backlog.scrollTop = viewState.backlogScrollTop;
  }

  function toggleBacklog() {
    const backlog = document.getElementById("backlog");
    const button = document.getElementById("toggleBacklog");
    if (button.disabled) return;
    const open = backlog.hidden;
    const workspace = document.querySelector(".workspace");
    if (open && !document.body.classList.contains("toggle-grid-view")) {
      const feature = document.querySelector("#content > .release");
      if (feature) workspace.style.setProperty("--backlog-width", `${feature.getBoundingClientRect().width}px`);
    }
    backlog.hidden = !open;
    if (!open) workspace.style.removeProperty("--backlog-width");
    button.setAttribute("aria-pressed", String(open));
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
      animation: reducedMotion.matches ? 0 : 150,
      easing: "cubic-bezier(.2,0,0,1)",
      draggable: "> .release",
      handle: ".release-header",
      filter: ".delete-btn",
      preventOnFilter: false,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd(event) {
        app.domain.moveFeature(project, event.oldIndex, event.newIndex);
        changed(captureViewState());
      }
    }));

    document.querySelectorAll(".board").forEach(board => {
      sortables.push(Sortable.create(board, {
        group: "tasks",
        animation: reducedMotion.matches ? 0 : 150,
        easing: "cubic-bezier(.2,0,0,1)",
        draggable: "> .card",
        handle: ".card-header",
        filter: ".delete-btn",
        preventOnFilter: false,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
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
        animation: reducedMotion.matches ? 0 : 150,
        easing: "cubic-bezier(.2,0,0,1)",
        draggable: "> .todo-item",
        handle: ".todo-text",
        filter: ".delete-btn",
        preventOnFilter: false,
        emptyInsertThreshold: 30,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
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

  async function handleContentClick(event) {
    if (event.target.closest(".backlog-close")) {
      toggleBacklog();
      return;
    }

    const removeRecentButton = event.target.closest(".recent-delete");
    if (removeRecentButton) {
      removeRecentButton.disabled = true;
      await animateRemoval(removeRecentButton.closest(".recent-file"));
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
      if (!document.body.classList.contains("toggle-grid-view")) app.render.layoutGrid(true);
      return;
    }

    const deleteButton = event.target.closest(".delete-btn");
    if (deleteButton) {
      event.stopPropagation();
      const featureElement = deleteButton.closest(".release");
      const featureIndex = Number(featureElement.dataset.feature);
      const viewState = captureViewState();
      const removedElement = deleteButton.closest(".todo-item, .card, .release");
      deleteButton.disabled = true;
      await animateRemoval(removedElement);
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
      const featureIndex = Number(featureElement.dataset.feature);
      const taskIndex = Number(taskElement.dataset.task);
      const lineIndex = Number(todo.dataset.line);
      const task = project.features[featureIndex].tasks[taskIndex];
      app.domain.setTodo(task, lineIndex, checkbox.dataset.checked !== "true");
      changed(captureViewState());
      animateTodoToggle(featureIndex, taskIndex, lineIndex);
      return;
    }

    const taskHeader = event.target.closest(".card-header");
    if (taskHeader) {
      const task = taskHeader.closest(".card");
      const body = task.querySelector(".card-body");
      body.hidden = !body.hidden;
      task.setAttribute("aria-expanded", String(!body.hidden));
      if (!document.body.classList.contains("toggle-grid-view")) app.render.layoutGrid(true);
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
      if (!document.body.classList.contains("toggle-grid-view")) app.render.layoutGrid(true);
    }
  }

  function handleTitleEnter(event) {
    const header = event.target.closest(".card-header, .release-heading, .backlog-header");
    if (!header || header.contains(event.relatedTarget)) return;
    const title = header.querySelector(".card-title, .release-title, .backlog-title");
    if (title) app.render.startTitleScroll(title);
  }

  function handleTitleLeave(event) {
    const header = event.target.closest(".card-header, .release-heading, .backlog-header");
    if (!header || header.contains(event.relatedTarget)) return;
    const title = header.querySelector(".card-title, .release-title, .backlog-title");
    if (title) app.render.stopTitleScroll(title);
  }

  [document.getElementById("content"), document.getElementById("backlog")].forEach(container => {
    container.addEventListener("click", handleContentClick);
    container.addEventListener("mouseover", handleTitleEnter);
    container.addEventListener("mouseout", handleTitleLeave);
  });

  document.getElementById("toggleBacklog").addEventListener("click", toggleBacklog);
  document.getElementById("toggleViewMenu").addEventListener("click", event => {
    const options = document.getElementById("viewOptions");
    options.hidden = !options.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!options.hidden));
  });
  document.getElementById("showBoardView").addEventListener("click", () => setGridView(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeViewMenu();
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
  });
  document.getElementById("projectStats").addEventListener("click", event => {
    if (!event.target.closest(".stats-close")) return;
    document.body.classList.add("hide-stats");
    document.getElementById("toggleStats").setAttribute("aria-pressed", "false");
  });

  document.getElementById("toggleGridView").addEventListener("click", () => setGridView(true));

  document.getElementById("saveFile").addEventListener("click", () => save());
  document.getElementById("undoChange").addEventListener("click", () => undo());
  document.getElementById("redoChange").addEventListener("click", () => redo());
  document.addEventListener("click", event => {
    if (!event.target.closest(".view-menu")) closeViewMenu();
  });

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
