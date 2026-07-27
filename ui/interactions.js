window.MDManager = window.MDManager || {};

(function (app) {
  /** @type {MDProject | null} */
  let project = null;
  /** @type {((viewState: MDViewState, options?: any) => void) | null} */
  let changed = null;
  /** @type {Array<{destroy(): void}>} */
  let sortables = [];
  /** @type {((index: number) => void) | null} */
  let openRecent = null;
  /** @type {((index: number) => void) | null} */
  let removeRecent = null;
  /** @type {(() => Promise<void>) | null} */
  let save = null;
  /** @type {(() => void) | null} */
  let undo = null;
  /** @type {(() => void) | null} */
  let redo = null;
  /** @type {MDViewState | null} */
  let expandedBeforeGrid = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  async function saveFile() {
    try {
      await save?.();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.render.saveError(error.message);
    }
  }

  /** @param {HTMLElement} element @param {Keyframe[]} keyframes @param {KeyframeAnimationOptions} options */
  function animate(element, keyframes, options) {
    if (reducedMotion.matches) return Promise.resolve();
    return element.animate(keyframes, options).finished.catch(() => {});
  }

  /** @param {HTMLElement} element */
  function animateRemoval(element) {
    return animate(element, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(.98)" }
    ], { duration: 120, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  }

  /** @param {number} featureIndex @param {number} taskIndex @param {number} lineIndex */
  function animateTodoToggle(featureIndex, taskIndex, lineIndex) {
    const checkbox = document.querySelector(`.release[data-feature="${featureIndex}"] .card[data-task="${taskIndex}"] .todo-item[data-line="${lineIndex}"] .checkbox`);
    if (!checkbox) return;
    animate(/** @type {HTMLElement} */ (checkbox), [
      { transform: "scale(.82)" },
      { transform: "scale(1.08)", offset: .65 },
      { transform: "scale(1)" }
    ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function closeViewMenu() {
    document.getElementById("viewOptions").hidden = true;
    document.getElementById("toggleViewMenu").setAttribute("aria-expanded", "false");
  }

  function closeHelp() {
    document.getElementById("helpPopover").hidden = true;
    document.getElementById("toggleHelp").setAttribute("aria-expanded", "false");
  }

  /** @param {boolean} active */
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
    if (active) collapseAll();
    app.layout.layoutGrid();
    const stateBeforeGrid = expandedBeforeGrid;
    if (!active && stateBeforeGrid) requestAnimationFrame(() => restoreScrollState(stateBeforeGrid));
  }

  /** @returns {MDViewState} */
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

  /** @param {MDViewState} viewState */
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

  /** @param {MDViewState} viewState */
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
    backlog.hidden = !open;
    button.setAttribute("aria-pressed", String(open));
    if (open) app.layout.fitTitles(backlog.querySelectorAll(".backlog-title, .card-title"));
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
      filter: ".action-btn",
      preventOnFilter: false,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      /** @param {any} event */
      onEnd(event) {
        app.domain.moveFeature(project, event.oldIndex, event.newIndex);
        changed?.(captureViewState());
      }
    }));

    document.querySelectorAll(".board").forEach(board => {
      sortables.push(Sortable.create(board, {
        group: "tasks",
        animation: reducedMotion.matches ? 0 : 150,
        easing: "cubic-bezier(.2,0,0,1)",
        draggable: "> .card",
        handle: ".card-header",
        filter: ".action-btn",
        preventOnFilter: false,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        /** @param {any} event */
        onEnd(event) {
          const fromFeature = Number(event.from.closest(".release").dataset.feature);
          const toFeature = Number(event.to.closest(".release").dataset.feature);
          app.domain.moveTask(project, fromFeature, event.oldIndex, toFeature, event.newIndex);
          changed?.(captureViewState());
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
        filter: ".action-btn",
        preventOnFilter: false,
        emptyInsertThreshold: 30,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        /** @param {any} event */
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
          changed?.(captureViewState());
        }
      }));
    });

  }

  /** @param {MDProject} nextProject @param {(viewState: MDViewState, options?: any) => void} onChanged */
  function setProject(nextProject, onChanged) {
    project = nextProject;
    changed = onChanged;
    connectSortable();
  }

  /** @param {Event} event @returns {Element} */
  function eventElement(event) {
    return /** @type {Element} */ (event.target);
  }

  /** @param {Element} element @param {string} selector @returns {HTMLElement} */
  function requiredClosest(element, selector) {
    return /** @type {HTMLElement} */ (element.closest(selector));
  }

  /** @param {MouseEvent} event */
  async function handleContentClick(event) {
    if (!project && !eventElement(event).closest(".recent-file")) return;
    if (eventElement(event).closest(".backlog-close")) {
      toggleBacklog();
      return;
    }

    const removeRecentButton = eventElement(event).closest(".recent-delete");
    if (removeRecentButton) {
      removeRecentButton.disabled = true;
      await animateRemoval(requiredClosest(removeRecentButton, ".recent-file"));
      removeRecent?.(Number(removeRecentButton.dataset.removeRecent));
      return;
    }

    const recentFile = eventElement(event).closest(".recent-file-open");
    if (recentFile) {
      openRecent?.(Number(recentFile.dataset.recent));
      return;
    }

    if (!project) return;

    const addTaskButton = eventElement(event).closest("[data-add-task]");
    if (addTaskButton) {
      event.stopPropagation();
      const featureElement = requiredClosest(addTaskButton, ".release");
      const featureIndex = Number(featureElement.dataset.feature);
      const feature = project.features[featureIndex];
      const viewState = captureViewState();
      app.editor.open({ title: "New Task", lines: [] }, { project: project.title, feature: feature.title }, (/** @type {{title: string, lines: string[]}} */ draft) => {
        app.domain.addTask(project, featureIndex, { title: draft.title, lines: draft.lines.slice() });
        changed?.(viewState);
      });
      return;
    }

    const editButton = eventElement(event).closest("[data-edit]");
    if (editButton) {
      event.stopPropagation();
      if (editButton.dataset.edit === "feature") {
        const featureElement = requiredClosest(editButton, ".release");
        const featureIndex = Number(featureElement.dataset.feature);
        const viewState = captureViewState();
        const feature = project.features[featureIndex];
        app.editor.openFeature(project, feature, (/** @type {{title: string, metadata: string, info: string, warn: string}} */ draft) => {
          app.domain.updateFeature(project, featureIndex, draft.title, app.markdown.composeFeatureMetadata(draft));
          changed?.(viewState);
        });
      } else {
        const taskElement = requiredClosest(editButton, ".card");
        const featureElement = requiredClosest(editButton, ".release");
        const featureIndex = Number(featureElement.dataset.feature);
        const taskIndex = Number(taskElement.dataset.task);
        const viewState = captureViewState();
        app.editor.open(project.features[featureIndex].tasks[taskIndex], { project: project.title, feature: project.features[featureIndex].title }, (/** @type {{title: string, lines: string[]}} */ draft) => {
          app.domain.updateTask(project, featureIndex, taskIndex, draft);
          changed?.(viewState);
        });
      }
      return;
    }

    const noteToggle = eventElement(event).closest(".note-toggle");
    if (noteToggle) {
      const note = requiredClosest(noteToggle, ".feature-note");
      const expanded = note.classList.toggle("collapsed") === false;
      note.setAttribute("aria-expanded", String(expanded));
      return;
    }

    const deleteButton = eventElement(event).closest(".delete-btn");
    if (deleteButton) {
      event.stopPropagation();
      const featureElement = requiredClosest(deleteButton, ".release");
      const featureIndex = Number(featureElement.dataset.feature);
      const viewState = captureViewState();
      const removedElement = requiredClosest(deleteButton, ".todo-item, .card, .release");
      deleteButton.disabled = true;
      await animateRemoval(removedElement);
      if (deleteButton.dataset.delete === "feature") {
        const firstTask = [...document.querySelectorAll(".card")].indexOf(featureElement.querySelector(".card"));
        if (firstTask >= 0) viewState.tasks.splice(firstTask, featureElement.querySelectorAll(".card").length);
        app.domain.deleteFeature(project, featureIndex);
      } else if (deleteButton.dataset.delete === "task") {
        const taskElement = requiredClosest(deleteButton, ".card");
        viewState.tasks.splice([...document.querySelectorAll(".card")].indexOf(taskElement), 1);
        app.domain.deleteTask(project, featureIndex, Number(taskElement.dataset.task));
      } else {
        const taskElement = requiredClosest(deleteButton, ".card");
        const task = project.features[featureIndex].tasks[Number(taskElement.dataset.task)];
        app.domain.deleteTodo(task, Number(requiredClosest(deleteButton, ".todo-item").dataset.line));
      }
      changed?.(viewState);
      return;
    }

    const checkbox = eventElement(event).closest(".checkbox");
    if (checkbox) {
      event.stopPropagation();
      const todo = requiredClosest(checkbox, ".todo-item");
      const taskElement = requiredClosest(checkbox, ".card");
      const featureElement = requiredClosest(checkbox, ".release");
      const featureIndex = Number(featureElement.dataset.feature);
      const taskIndex = Number(taskElement.dataset.task);
      const lineIndex = Number(todo.dataset.line);
      const task = project.features[featureIndex].tasks[taskIndex];
      app.domain.setTodo(task, lineIndex, checkbox.dataset.checked !== "true");
      app.render.updateTodo(project, featureIndex, taskIndex, lineIndex);
      changed?.(captureViewState(), { render: false });
      animateTodoToggle(featureIndex, taskIndex, lineIndex);
      return;
    }

    const taskHeader = eventElement(event).closest(".card-header");
    if (taskHeader) {
      const task = requiredClosest(taskHeader, ".card");
      const body = task.querySelector(".card-body");
      body.hidden = !body.hidden;
      task.setAttribute("aria-expanded", String(!body.hidden));
      return;
    }

    const featureHeader = eventElement(event).closest(".release-header");
    if (featureHeader) {
      const feature = requiredClosest(featureHeader, ".release");
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
    }
  }

  /** @param {MouseEvent} event */
  function handleTitleEnter(event) {
    const header = eventElement(event).closest(".card-header, .release-heading, .backlog-header");
    if (!header || header.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
    const title = header.querySelector(".card-title, .release-title, .backlog-title");
    if (title?.classList.contains("is-editing")) return;
    if (title) app.layout.startTitleScroll(title);
  }

  /** @param {MouseEvent} event */
  function handleTitleLeave(event) {
    const header = eventElement(event).closest(".card-header, .release-heading, .backlog-header");
    if (!header || header.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
    const title = header.querySelector(".card-title, .release-title, .backlog-title");
    if (title?.classList.contains("is-editing")) return;
    if (title) app.layout.stopTitleScroll(title);
  }

  [document.getElementById("content"), document.getElementById("backlog")].forEach(container => {
    container.addEventListener("click", handleContentClick);
    container.addEventListener("mouseover", handleTitleEnter);
    container.addEventListener("mouseout", handleTitleLeave);
  });

  document.getElementById("toggleBacklog").addEventListener("click", toggleBacklog);
  document.getElementById("addFeature").addEventListener("click", () => {
    if (!project) return;
    const viewState = captureViewState();
    const draftFeature = { title: "New Feature", headerLines: [], version: "", dates: [], notes: [], tasks: [], isBacklog: false };
    app.editor.openFeature(project, draftFeature, (/** @type {{title: string, metadata: string, info: string, warn: string}} */ draft) => {
      const metadata = app.markdown.composeFeatureMetadata(draft);
      app.domain.addFeature(project, { ...metadata, title: draft.title, tasks: [], isBacklog: false });
      changed?.(viewState);
    });
  });
  document.getElementById("toggleViewMenu").addEventListener("click", event => {
    closeHelp();
    const options = document.getElementById("viewOptions");
    options.hidden = !options.hidden;
    (/** @type {HTMLElement} */ (event.currentTarget)).setAttribute("aria-expanded", String(!options.hidden));
  });
  document.getElementById("toggleHelp").addEventListener("click", event => {
    closeViewMenu();
    const help = document.getElementById("helpPopover");
    help.hidden = !help.hidden;
    (/** @type {HTMLElement} */ (event.currentTarget)).setAttribute("aria-expanded", String(!help.hidden));
  });
  document.getElementById("closeHelp").addEventListener("click", closeHelp);
  document.getElementById("showBoardView").addEventListener("click", () => setGridView(false));
  document.addEventListener("keydown", event => {
    const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
    const target = eventElement(event);
    const editsText = target.matches("input,textarea,[contenteditable='true']");
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      closeViewMenu();
      closeHelp();
    }
    if (shortcut && !event.shiftKey && key === "s") {
      event.preventDefault();
      void saveFile();
    }
    if (shortcut && !event.shiftKey && key === "o") {
      event.preventDefault();
      document.getElementById("openFile").click();
    }
    if (shortcut && !editsText && !event.shiftKey && key === "z") {
      event.preventDefault();
      undo?.();
    }
    if (shortcut && !editsText && ((event.shiftKey && key === "z") || (!event.metaKey && !event.shiftKey && key === "y"))) {
      event.preventDefault();
      redo?.();
    }
    if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b" && !document.getElementById("toggleBacklog").disabled) {
      event.preventDefault();
      toggleBacklog();
    }
  });

  document.getElementById("toggleMetadata").addEventListener("click", event => {
    const active = document.body.classList.toggle("show-metadata");
    (/** @type {HTMLElement} */ (event.currentTarget)).setAttribute("aria-pressed", String(active));
    app.layout.equalizeReleaseHeaders();
    app.layout.layoutGrid();
  });

  document.getElementById("toggleStats").addEventListener("click", event => {
    const active = document.body.classList.toggle("hide-stats") === false;
    (/** @type {HTMLElement} */ (event.currentTarget)).setAttribute("aria-pressed", String(active));
  });
  document.getElementById("projectStats").addEventListener("click", event => {
    if (!eventElement(event).closest(".stats-close")) return;
    document.body.classList.add("hide-stats");
    document.getElementById("toggleStats").setAttribute("aria-pressed", "false");
  });

  document.getElementById("toggleGridView").addEventListener("click", () => setGridView(true));

  document.getElementById("saveFile").addEventListener("click", saveFile);
  document.getElementById("undoChange").addEventListener("click", () => undo?.());
  document.getElementById("redoChange").addEventListener("click", () => redo?.());
  document.addEventListener("click", event => {
    if (!eventElement(event).closest(".view-menu")) closeViewMenu();
    if (!eventElement(event).closest(".help-menu")) closeHelp();
  });

  app.interactions = {
    setProject,
    getViewState: captureViewState,
    /** @param {(index: number) => void} callback */
    setOpenRecent(callback) { openRecent = callback; },
    /** @param {(index: number) => void} callback */
    setRemoveRecent(callback) { removeRecent = callback; },
    /** @param {{save: () => Promise<void>, undo: () => void, redo: () => void}} actions */
    setHistoryActions(actions) { save = actions.save; undo = actions.undo; redo = actions.redo; },
    /** @param {{dirty: boolean, canUndo: boolean, canRedo: boolean}} state */
    setHistoryState(state) {
      const saveButton = document.getElementById("saveFile");
      saveButton.textContent = "Save";
      saveButton.removeAttribute("title");
      saveButton.classList.toggle("dirty", state.dirty);
      document.getElementById("undoChange").disabled = !state.canUndo;
      document.getElementById("redoChange").disabled = !state.canRedo;
    }
  };
})(window.MDManager);
