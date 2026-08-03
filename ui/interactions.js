window.MDManager = window.MDManager || {};

(function (app) {
  /** @typedef {{kind: "task", value: MDTask, source: MDTask, expanded: boolean} | {kind: "feature", value: MDFeature, source: MDFeature, taskExpanded: boolean[], noteExpanded: boolean[]}} ClipboardEntry */
  /** @type {MDProject | null} */
  let project = null;
  /** @type {((action: MDUndoAction, options?: {render?: boolean}) => boolean) | null} */
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
  /** @type {(() => Promise<boolean>) | null} */
  let reloadExternal = null;
  /** @type {(() => Promise<boolean>) | null} */
  let overwriteExternal = null;
  let resolvingExternal = false;
  /** @type {MDViewState | null} */
  let expandedBeforeGrid = null;
  /** @type {number | null} */
  let clockInterval = null;
  /** @type {HTMLElement | null} */
  let hoveredElement = null;
  /** @type {ClipboardEntry[]} */
  let clipboard = [];
  /** @type {HTMLElement[]} */
  let clipboardIndicators = [];
  /** @type {number | null} */
  let clipboardPositionFrame = null;
  /** @type {{x: number, y: number} | null} */
  let lastPointer = null;
  /** @type {MDViewState | null} */
  let dragViewState = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clipboardIndicatorTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById("clipboardIndicatorTemplate"));
  const clipboardResizeObserver = new ResizeObserver(scheduleClipboardPosition);
  const clipboardMutationObserver = new MutationObserver(scheduleClipboardPosition);
  let clipboardTracking = false;

  /** @param {MDViewState} viewState @returns {MDViewState} */
  function copyViewState(viewState) {
    return {
      ...viewState,
      tasks: viewState.tasks.slice(),
      featureNotes: viewState.featureNotes.slice(),
      featureScrolls: viewState.featureScrolls.map(scroll => ({ ...scroll }))
    };
  }

  /** @param {string} label @param {() => boolean | void} redo @param {() => void} undo @param {MDViewState} beforeViewState @param {MDViewState} afterViewState @param {{render?: boolean}} [options] @param {number} [size] */
  function perform(label, redo, undo, beforeViewState, afterViewState, options, size) {
    return changed?.({ label, redo, undo, beforeViewState, afterViewState, size }, options) || false;
  }

  /** @param {MDTask} task */
  function taskComplete(task) {
    return app.status.progress(app.markdown.taskContent(task).todos).complete;
  }

  /** @param {MDFeature} feature */
  function featureComplete(feature) {
    const todos = feature.tasks.filter(task => !task.ignored).flatMap(task => app.markdown.taskContent(task).todos);
    return app.status.progress(todos).complete;
  }

  /** @param {number} seconds */
  function clockValue(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainingSeconds = seconds % 60;
    return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, "0")).join(":");
  }

  function updateClock() {
    const now = new Date();
    const current = clockValue(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    const currentTime = document.getElementById("clockCurrent");
    document.getElementById("clockHours").textContent = current.slice(0, 2);
    document.getElementById("clockMinutes").textContent = current.slice(3, 5);
    document.getElementById("clockSeconds").textContent = current.slice(6, 8);
    currentTime.setAttribute("datetime", current);
  }

  function startClock() {
    if (clockInterval !== null) window.clearInterval(clockInterval);
    document.getElementById("appClock").hidden = document.getElementById("toggleClock").getAttribute("aria-pressed") !== "true";
    updateClock();
    clockInterval = window.setInterval(updateClock, 1000);
  }

  async function saveFile() {
    try {
      await save?.();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.render.saveError(error.message);
      app.notifications.show("error", "File save", `File could not be saved: ${error.message}`);
    }
  }

  /** @param {"reload" | "overwrite"} selection */
  async function resolveExternalFile(selection) {
    if (resolvingExternal) return;
    resolvingExternal = true;
    const reloadButton = document.getElementById("reloadExternal");
    const overwriteButton = document.getElementById("overwriteExternal");
    reloadButton.disabled = true;
    overwriteButton.disabled = true;
    reloadButton.setAttribute("aria-pressed", String(selection === "reload"));
    overwriteButton.setAttribute("aria-pressed", String(selection === "overwrite"));
    try {
      if (selection === "reload") await reloadExternal?.();
      else await overwriteExternal?.();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      app.render.saveError(error.message);
      app.notifications.show("error", "File save", `File could not be saved: ${error.message}`);
    } finally {
      resolvingExternal = false;
      reloadButton.disabled = false;
      overwriteButton.disabled = false;
      reloadButton.setAttribute("aria-pressed", "false");
      overwriteButton.setAttribute("aria-pressed", "false");
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

  /** @param {ClipboardEntry} entry @returns {HTMLElement | null} */
  function clipboardSourceElement(entry) {
    if (!project) return null;
    if (entry.kind === "feature") {
      const featureIndex = project.features.indexOf(entry.source);
      return featureIndex >= 0 ? /** @type {HTMLElement | null} */ (document.querySelector(`#content > .release[data-feature="${featureIndex}"]`)) : null;
    }
    const source = entry.source;
    const featureIndex = project.features.findIndex(feature => feature.tasks.includes(source));
    const taskIndex = featureIndex >= 0 ? project.features[featureIndex].tasks.indexOf(source) : -1;
    return taskIndex >= 0 ? /** @type {HTMLElement | null} */ (document.querySelector(`.release[data-feature="${featureIndex}"] .card[data-task="${taskIndex}"]`)) : null;
  }

  function positionClipboardIndicators() {
    clipboardPositionFrame = null;
    clipboard.forEach((entry, index) => {
      const sourceElement = clipboardSourceElement(entry);
      const indicator = clipboardIndicators[index];
      if (!indicator) return;
      if (!sourceElement) {
        indicator.hidden = true;
        return;
      }
      const rect = sourceElement.getBoundingClientRect();
      const clippingElement = entry.kind === "task" ? sourceElement.closest(".release-content,.backlog-content") : document.getElementById("content");
      const clippingRect = clippingElement?.getBoundingClientRect();
      const visible = rect.right > 0 && rect.top < window.innerHeight && (!clippingRect || (rect.right >= clippingRect.left && rect.right <= clippingRect.right && rect.top >= clippingRect.top && rect.top <= clippingRect.bottom));
      indicator.hidden = !visible;
      indicator.style.left = `${rect.right}px`;
      indicator.style.top = `${rect.top}px`;
    });
  }

  function scheduleClipboardPosition() {
    if (clipboardPositionFrame !== null) return;
    clipboardPositionFrame = window.requestAnimationFrame(positionClipboardIndicators);
  }

  function startClipboardTracking() {
    if (clipboardTracking) return;
    clipboardTracking = true;
    window.addEventListener("resize", scheduleClipboardPosition);
    document.addEventListener("scroll", scheduleClipboardPosition, true);
    clipboardMutationObserver.observe(/** @type {HTMLElement} */ (document.querySelector(".workspace")), {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-expanded"]
    });
  }

  function stopClipboardTracking() {
    if (!clipboardTracking) return;
    clipboardTracking = false;
    window.removeEventListener("resize", scheduleClipboardPosition);
    document.removeEventListener("scroll", scheduleClipboardPosition, true);
    clipboardMutationObserver.disconnect();
    clipboardResizeObserver.disconnect();
    if (clipboardPositionFrame !== null) window.cancelAnimationFrame(clipboardPositionFrame);
    clipboardPositionFrame = null;
  }

  function placeClipboardIndicators() {
    document.querySelectorAll(".clipboard-source").forEach(element => element.classList.remove("clipboard-source"));
    clipboardIndicators.forEach(indicator => indicator.remove());
    clipboardResizeObserver.disconnect();
    const indicatorTemplate = /** @type {HTMLElement} */ (clipboardIndicatorTemplate.content.firstElementChild);
    clipboardIndicators = clipboard.map(entry => {
      const indicator = /** @type {HTMLElement} */ (indicatorTemplate.cloneNode(true));
      indicator.hidden = true;
      const sourceElement = clipboardSourceElement(entry);
      sourceElement?.classList.add("clipboard-source");
      if (sourceElement) {
        clipboardResizeObserver.observe(sourceElement);
        const layoutContainer = sourceElement.closest(".board,.release-content,.backlog-content");
        if (layoutContainer) clipboardResizeObserver.observe(layoutContainer);
      }
      document.body.append(indicator);
      return indicator;
    });
    positionClipboardIndicators();
  }

  /** @param {ClipboardEntry[]} value */
  function setClipboard(value) {
    clipboard = value;
    if (clipboard.length) startClipboardTracking();
    else stopClipboardTracking();
    placeClipboardIndicators();
  }

  /** @param {HTMLElement} element */
  function copyFeedback(element) {
    element.classList.remove("copy-feedback");
    void element.offsetWidth;
    element.classList.add("copy-feedback");
    window.setTimeout(() => element.classList.remove("copy-feedback"), 300);
  }

  /** @param {Element} target @returns {HTMLElement | null} */
  function hoveredCopyTarget(target) {
    const taskHeader = target.closest(".card-header");
    if (taskHeader) return requiredClosest(taskHeader, ".card");
    const featureHeader = target.closest("#content > .release > .release-header");
    return featureHeader ? requiredClosest(featureHeader, ".release") : null;
  }

  /** @param {boolean} [additive] */
  function copyHovered(additive = false) {
    if (!project || !hoveredElement?.isConnected) return false;
    const taskElement = hoveredElement.matches(".card") ? hoveredElement : null;
    if (taskElement) {
      const featureElement = requiredClosest(taskElement, ".release");
      const task = project.features[Number(featureElement.dataset.feature)]?.tasks[Number(taskElement.dataset.task)];
      if (!task) return false;
      if (additive && clipboard[0]?.kind === "task") {
        const existing = clipboard.findIndex(entry => entry.source === task);
        if (existing >= 0) {
          setClipboard(clipboard.filter((_, index) => index !== existing));
          app.notifications.show("info", "Task removed", [{ value: task.title }, " removed from clipboard."]);
          return true;
        }
        setClipboard([...clipboard, { kind: "task", value: app.domain.copyTask(task), source: task, expanded: taskElement.getAttribute("aria-expanded") === "true" }]);
      } else setClipboard([{ kind: "task", value: app.domain.copyTask(task), source: task, expanded: taskElement.getAttribute("aria-expanded") === "true" }]);
      copyFeedback(taskElement);
      app.notifications.show("info", "Task copied", [{ value: task.title }, " copied to clipboard."]);
      return true;
    }
    if (!hoveredElement.matches("#content > .release")) return false;
    const feature = project.features[Number(hoveredElement.dataset.feature)];
    if (!feature || feature.isBacklog) return false;
    const taskExpanded = [...hoveredElement.querySelectorAll(".card")].map(task => task.getAttribute("aria-expanded") === "true");
    const noteExpanded = [...hoveredElement.querySelectorAll(".feature-note")].map(note => note.getAttribute("aria-expanded") === "true");
    if (additive && clipboard[0]?.kind === "feature") {
      const existing = clipboard.findIndex(entry => entry.source === feature);
      if (existing >= 0) {
        setClipboard(clipboard.filter((_, index) => index !== existing));
        app.notifications.show("info", "Feature removed", [{ value: feature.title }, " removed from clipboard."]);
        return true;
      }
      setClipboard([...clipboard, { kind: "feature", value: app.domain.copyFeature(feature), source: feature, taskExpanded, noteExpanded }]);
    } else setClipboard([{ kind: "feature", value: app.domain.copyFeature(feature), source: feature, taskExpanded, noteExpanded }]);
    copyFeedback(hoveredElement);
    app.notifications.show("info", "Feature copied", [{ value: feature.title }, " copied to clipboard."]);
    return true;
  }

  /** @param {{x: number, y: number}} position */
  function featureInsertionIndex(position) {
    const features = [...document.querySelectorAll("#content > .release")];
    if (!features.length) return 0;
    const pointed = document.elementFromPoint(position.x, position.y)?.closest(".release");
    const direct = pointed?.parentElement?.id === "content" ? pointed : null;
    const target = direct || features.reduce((nearest, feature) => {
      const rect = feature.getBoundingClientRect();
      const dx = Math.max(rect.left - position.x, 0, position.x - rect.right);
      const dy = Math.max(rect.top - position.y, 0, position.y - rect.bottom);
      const distance = dx * dx + dy * dy;
      return distance < nearest.distance ? { feature, distance } : nearest;
    }, { feature: features[0], distance: Number.POSITIVE_INFINITY }).feature;
    const rect = target.getBoundingClientRect();
    return Number(target.dataset.feature) + (position.x >= rect.left + rect.width / 2 ? 1 : 0);
  }

  /** @param {HTMLElement} featureElement @param {HTMLElement | null} beforeCard */
  function taskViewIndex(featureElement, beforeCard) {
    const allCards = [...document.querySelectorAll(".card")];
    if (beforeCard) return allCards.indexOf(beforeCard);
    const featureCards = [...featureElement.querySelectorAll(".card")];
    if (featureCards.length) return allCards.indexOf(featureCards[featureCards.length - 1]) + 1;
    const releases = [...document.querySelectorAll("#content > .release, #backlog.release")];
    const featurePosition = releases.indexOf(featureElement);
    const nextCard = releases.slice(featurePosition + 1).map(release => release.querySelector(".card")).find(Boolean);
    return nextCard ? allCards.indexOf(nextCard) : allCards.length;
  }

  /** @param {{x: number, y: number}} position */
  function pasteAt(position) {
    if (!project || !clipboard.length) return false;
    const beforeViewState = captureViewState();
    const viewState = copyViewState(beforeViewState);
    if (clipboard[0].kind === "feature") {
      const entries = /** @type {Array<Extract<ClipboardEntry, {kind: "feature"}>>} */ (clipboard);
      const index = featureInsertionIndex(position);
      const taskIndex = document.querySelectorAll(`#content > .release[data-feature] .card`).length;
      const targetFeature = [...document.querySelectorAll("#content > .release")].find(feature => Number(feature.dataset.feature) >= index);
      const firstTargetTask = targetFeature?.querySelector(".card");
      const viewIndex = firstTargetTask ? [...document.querySelectorAll(".card")].indexOf(firstTargetTask) : taskIndex;
      viewState.tasks.splice(viewIndex, 0, ...entries.flatMap(entry => entry.taskExpanded));
      const regularFeatures = [...document.querySelectorAll("#content > .release")];
      const targetPosition = targetFeature ? regularFeatures.indexOf(targetFeature) : regularFeatures.length;
      const firstTargetNote = regularFeatures.slice(targetPosition).map(feature => feature.querySelector(".feature-note")).find(Boolean);
      const noteIndex = firstTargetNote ? [...document.querySelectorAll(".feature-note")].indexOf(firstTargetNote) : document.querySelectorAll("#content .feature-note").length;
      viewState.featureNotes.splice(noteIndex, 0, ...entries.flatMap(entry => entry.noteExpanded));
      viewState.featureScrolls.splice(targetPosition, 0, ...entries.map(() => ({ left: 0, top: 0 })));
      const redo = () => {
        entries.forEach((entry, offset) => app.domain.insertFeature(project, index + offset, entry.value));
        return true;
      };
      const undoAction = () => {
        for (let offset = entries.length - 1; offset >= 0; offset -= 1) app.domain.deleteFeature(project, index + offset);
      };
      const size = entries.reduce((total, entry) => total + entry.value.title.length + entry.value.headerLines.join("\n").length + entry.value.tasks.reduce((sum, task) => sum + task.title.length + task.lines.join("\n").length, 0), 0);
      if (!perform(entries.length === 1 ? "Feature pasted" : "Features pasted", redo, undoAction, beforeViewState, viewState, undefined, size)) return false;
      setClipboard([]);
      hoveredElement = null;
      window.requestAnimationFrame(() => {
        for (let offset = 0; offset < entries.length; offset += 1) {
          const inserted = document.querySelector(`#content > .release[data-feature="${index + offset}"]`);
          if (inserted) animate(/** @type {HTMLElement} */ (inserted), [{ opacity: 0, transform: "scale(.98)" }, { opacity: 1, transform: "scale(1)" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
      });
      return true;
    }

    const entries = /** @type {Array<Extract<ClipboardEntry, {kind: "task"}>>} */ (clipboard);
    const pointed = document.elementFromPoint(position.x, position.y);
    const featureElement = pointed?.closest(".release");
    if (!featureElement) return false;
    const featureIndex = Number(featureElement.dataset.feature);
    const board = featureElement.querySelector(".board");
    if (!board || !project.features[featureIndex]) return false;
    const cards = [...board.querySelectorAll(":scope > .card")];
    const beforeCard = /** @type {HTMLElement | null} */ (cards.find(card => {
      const rect = card.getBoundingClientRect();
      return position.y < rect.top + rect.height / 2;
    }) || null);
    const taskIndex = beforeCard ? Number(beforeCard.dataset.task) : project.features[featureIndex].tasks.length;
    viewState.tasks.splice(taskViewIndex(/** @type {HTMLElement} */ (featureElement), beforeCard), 0, ...entries.map(entry => entry.expanded));
    const redo = () => {
      entries.forEach((entry, offset) => app.domain.insertTask(project, featureIndex, taskIndex + offset, entry.value));
      return true;
    };
    const undoAction = () => {
      for (let offset = entries.length - 1; offset >= 0; offset -= 1) app.domain.deleteTask(project, featureIndex, taskIndex + offset);
    };
    const size = entries.reduce((total, entry) => total + entry.value.title.length + entry.value.lines.join("\n").length, 0);
    if (!perform(entries.length === 1 ? "Task pasted" : "Tasks pasted", redo, undoAction, beforeViewState, viewState, undefined, size)) return false;
    setClipboard([]);
    hoveredElement = null;
    window.requestAnimationFrame(() => {
      for (let offset = 0; offset < entries.length; offset += 1) {
        const inserted = document.querySelector(`.release[data-feature="${featureIndex}"] .card[data-task="${taskIndex + offset}"]`);
        if (inserted) animate(/** @type {HTMLElement} */ (inserted), [{ opacity: 0, transform: "translateY(5px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    });
    return true;
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
    const backlogContent = backlog.querySelector(".backlog-content");
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const feature = active?.closest(".release");
    const task = active?.closest(".card");
    const todo = active?.closest(".todo-item");
    const controlClass = active?.matches(".checkbox") ? ".checkbox" : active?.matches(".edit-btn") ? ".edit-btn" : active?.matches(".delete-btn") ? ".delete-btn" : active?.matches(".add-task-btn") ? ".add-task-btn" : "";
    const focusSelector = feature ? `.release[data-feature="${feature.dataset.feature}"]${task ? ` .card[data-task="${task.dataset.task}"]` : ""}${todo ? ` .todo-item[data-line="${todo.dataset.line}"]` : ""}${controlClass}` : undefined;
    return {
      tasks: [...document.querySelectorAll(".card")].map(task => task.getAttribute("aria-expanded") === "true"),
      featureNotes: [...document.querySelectorAll(".feature-note")].map(note => note.getAttribute("aria-expanded") === "true"),
      backlogOpen: !backlog.hidden,
      contentScrollLeft: content.scrollLeft,
      contentScrollTop: content.scrollTop,
      featureScrolls: [...content.querySelectorAll(":scope > .release > .release-content")].map(featureContent => ({ left: featureContent.scrollLeft, top: featureContent.scrollTop })),
      backlogScrollLeft: backlogContent?.scrollLeft || 0,
      backlogScrollTop: backlogContent?.scrollTop || 0,
      focusSelector
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
    const backlogContent = backlog.querySelector(".backlog-content");
    content.scrollLeft = viewState.contentScrollLeft;
    content.scrollTop = viewState.contentScrollTop;
    document.querySelectorAll("#content > .release > .release-content").forEach((featureContent, index) => {
      featureContent.scrollLeft = viewState.featureScrolls[index]?.left || 0;
      featureContent.scrollTop = viewState.featureScrolls[index]?.top || 0;
    });
    if (backlogContent) {
      backlogContent.scrollLeft = viewState.backlogScrollLeft;
      backlogContent.scrollTop = viewState.backlogScrollTop;
    }
  }

  /** @param {MDViewState | undefined} viewState */
  function restoreInteractionState(viewState) {
    if (!viewState) return;
    requestAnimationFrame(() => {
      restoreScrollState(viewState);
      if (viewState.focusSelector) {
        const target = document.querySelector(viewState.focusSelector);
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      }
    });
  }

  function toggleBacklog() {
    const backlog = document.getElementById("backlog");
    const button = document.getElementById("toggleBacklog");
    if (button.disabled) return;
    const open = backlog.hidden;
    backlog.hidden = !open;
    button.setAttribute("aria-pressed", String(open));
    if (open) app.layout.fitTitles(backlog.querySelectorAll(".backlog-title, .card-title"));
    app.layout.contentOverflowChanged();
    if (open && !document.body.classList.contains("toggle-grid-view")) {
      const content = document.getElementById("content");
      requestAnimationFrame(() => {
        if (!backlog.hidden) content.scrollLeft = content.scrollWidth;
      });
    }
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
      onStart() { dragViewState = captureViewState(); },
      /** @param {any} event */
      onEnd(event) {
        const beforeViewState = dragViewState || captureViewState();
        const afterViewState = captureViewState();
        dragViewState = null;
        perform("Feature moved", () => app.domain.moveFeature(project, event.oldIndex, event.newIndex), () => { app.domain.moveFeature(project, event.newIndex, event.oldIndex); }, beforeViewState, afterViewState);
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
        onStart() { dragViewState = captureViewState(); },
        /** @param {any} event */
        onEnd(event) {
          if (!project) return;
          const fromFeature = Number(event.from.closest(".release").dataset.feature);
          const toFeature = Number(event.to.closest(".release").dataset.feature);
          const beforeViewState = dragViewState || captureViewState();
          const afterViewState = captureViewState();
          dragViewState = null;
          perform("Task moved", () => app.domain.moveTask(project, fromFeature, event.oldIndex, toFeature, event.newIndex), () => { app.domain.moveTask(project, toFeature, event.newIndex, fromFeature, event.oldIndex); }, beforeViewState, afterViewState);
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
        onStart() { dragViewState = captureViewState(); },
        /** @param {any} event */
        onEnd(event) {
          if (!project) return;
          const fromTask = event.from.closest(".card");
          const toTask = event.to.closest(".card");
          const fromFeature = event.from.closest(".release");
          const toFeature = event.to.closest(".release");
          const fromFeatureIndex = Number(fromFeature.dataset.feature);
          const fromTaskIndex = Number(fromTask.dataset.task);
          const toFeatureIndex = Number(toFeature.dataset.feature);
          const toTaskIndex = Number(toTask.dataset.task);
          const source = project.features[fromFeatureIndex].tasks[fromTaskIndex];
          const target = project.features[toFeatureIndex].tasks[toTaskIndex];
          const sourceBefore = source.lines.slice();
          const targetBefore = target === source ? sourceBefore : target.lines.slice();
          /** @type {string[] | null} */
          let sourceAfter = null;
          /** @type {string[] | null} */
          let targetAfter = null;
          const redo = () => {
            if (sourceAfter && targetAfter) {
              source.lines = sourceAfter.slice();
              if (target !== source) target.lines = targetAfter.slice();
              return true;
            }
            app.domain.moveTodo(project, fromFeatureIndex, fromTaskIndex, Number(event.item.dataset.line), toFeatureIndex, toTaskIndex, Number(event.to.dataset.anchorLine), event.newIndex);
            sourceAfter = source.lines.slice();
            targetAfter = target === source ? sourceAfter : target.lines.slice();
            return sourceBefore.join("\n") !== sourceAfter.join("\n") || targetBefore.join("\n") !== targetAfter.join("\n");
          };
          const undoAction = () => {
            source.lines = sourceBefore.slice();
            if (target !== source) target.lines = targetBefore.slice();
          };
          const beforeViewState = dragViewState || captureViewState();
          const afterViewState = captureViewState();
          dragViewState = null;
          perform("Todo moved", redo, undoAction, beforeViewState, afterViewState, undefined, sourceBefore.join("\n").length + targetBefore.join("\n").length);
        }
      }));
    });

  }

  /** @param {MDProject} nextProject @param {(action: MDUndoAction, options?: {render?: boolean}) => boolean} onChanged */
  function setProject(nextProject, onChanged) {
    hoveredElement = null;
    project = nextProject;
    changed = onChanged;
    connectSortable();
    placeClipboardIndicators();
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
      const beforeViewState = captureViewState();
      app.editor.open({ title: "New Task", lines: [] }, { project: project.title, feature: feature.title }, (/** @type {{title: string, lines: string[]}} */ draft) => {
        const task = { title: draft.title, lines: draft.lines.slice() };
        const taskIndex = feature.tasks.length;
        const afterViewState = copyViewState(beforeViewState);
        const featureCards = [...featureElement.querySelectorAll(".card")];
        const viewIndex = featureCards.length ? [...document.querySelectorAll(".card")].indexOf(/** @type {Element} */ (featureCards.at(-1))) + 1 : taskViewIndex(featureElement, null);
        afterViewState.tasks.splice(viewIndex, 0, false);
        perform("Task added", () => app.domain.insertTask(project, featureIndex, taskIndex, task), () => { app.domain.deleteTask(project, featureIndex, taskIndex); }, beforeViewState, afterViewState, undefined, task.title.length + task.lines.join("\n").length);
        app.notifications.show("info", "Task added", [{ value: draft.title }, " added to ", { value: feature.title }, "."]);
      }, true);
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
        const before = app.domain.copyFeature(feature);
        app.editor.openFeature(project, feature, (/** @type {{title: string, metadata: string, info: string, warn: string}} */ draft) => {
          const after = app.markdown.composeFeatureMetadata(draft);
          perform("Feature edited", () => app.domain.updateFeature(project, featureIndex, draft.title, after), () => { app.domain.updateFeature(project, featureIndex, before.title, before); }, viewState, viewState, undefined, before.headerLines.join("\n").length + draft.metadata.length);
        });
      } else {
        const taskElement = requiredClosest(editButton, ".card");
        const featureElement = requiredClosest(editButton, ".release");
        const featureIndex = Number(featureElement.dataset.feature);
        const taskIndex = Number(taskElement.dataset.task);
        const viewState = captureViewState();
        const task = project.features[featureIndex].tasks[taskIndex];
        const before = { title: task.title, lines: task.lines.slice() };
        app.editor.open(project.features[featureIndex].tasks[taskIndex], { project: project.title, feature: project.features[featureIndex].title }, (/** @type {{title: string, lines: string[]}} */ draft) => {
          const after = { title: draft.title, lines: draft.lines.slice() };
          perform("Task edited", () => app.domain.updateTask(project, featureIndex, taskIndex, after), () => { app.domain.updateTask(project, featureIndex, taskIndex, before); }, viewState, viewState, undefined, before.title.length + before.lines.join("\n").length + after.title.length + after.lines.join("\n").length);
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
      const beforeViewState = captureViewState();
      const viewState = copyViewState(beforeViewState);
      const removedElement = requiredClosest(deleteButton, ".todo-item, .card, .release");
      deleteButton.disabled = true;
      await animateRemoval(removedElement);
      if (deleteButton.dataset.delete === "feature") {
        const firstTask = [...document.querySelectorAll(".card")].indexOf(featureElement.querySelector(".card"));
        if (firstTask >= 0) viewState.tasks.splice(firstTask, featureElement.querySelectorAll(".card").length);
        const firstNote = [...document.querySelectorAll(".feature-note")].indexOf(featureElement.querySelector(".feature-note"));
        if (firstNote >= 0) viewState.featureNotes.splice(firstNote, featureElement.querySelectorAll(".feature-note").length);
        const renderedFeatureIndex = [...document.querySelectorAll("#content > .release")].indexOf(featureElement);
        if (renderedFeatureIndex >= 0) viewState.featureScrolls.splice(renderedFeatureIndex, 1);
        const feature = project.features[featureIndex];
        perform("Feature deleted", () => app.domain.deleteFeature(project, featureIndex), () => { app.domain.insertFeature(project, featureIndex, feature); }, beforeViewState, viewState, undefined, feature.title.length + feature.headerLines.join("\n").length + feature.tasks.reduce((size, task) => size + task.title.length + task.lines.join("\n").length, 0));
      } else if (deleteButton.dataset.delete === "task") {
        const taskElement = requiredClosest(deleteButton, ".card");
        viewState.tasks.splice([...document.querySelectorAll(".card")].indexOf(taskElement), 1);
        const taskIndex = Number(taskElement.dataset.task);
        const task = project.features[featureIndex].tasks[taskIndex];
        perform("Task deleted", () => app.domain.deleteTask(project, featureIndex, taskIndex), () => { app.domain.insertTask(project, featureIndex, taskIndex, task); }, beforeViewState, viewState, undefined, task.title.length + task.lines.join("\n").length);
      } else {
        const taskElement = requiredClosest(deleteButton, ".card");
        const task = project.features[featureIndex].tasks[Number(taskElement.dataset.task)];
        const lineIndex = Number(requiredClosest(deleteButton, ".todo-item").dataset.line);
        const line = task.lines[lineIndex];
        perform("Todo deleted", () => app.domain.deleteTodo(task, lineIndex), () => { app.domain.insertTodo(task, lineIndex, line); }, beforeViewState, viewState, undefined, line.length);
      }
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
      const feature = project.features[featureIndex];
      const task = feature.tasks[taskIndex];
      const wasTaskComplete = taskComplete(task);
      const wasFeatureComplete = featureComplete(feature);
      const completingTodo = checkbox.dataset.checked !== "true";
      const beforeLine = task.lines[lineIndex];
      const viewState = captureViewState();
      const didChange = perform(completingTodo ? "Todo completed" : "Todo reopened", () => app.domain.setTodo(task, lineIndex, completingTodo), () => { task.lines[lineIndex] = beforeLine; }, viewState, viewState, { render: false }, beforeLine.length);
      if (!didChange) return;
      app.render.updateTodo(project, featureIndex, taskIndex, lineIndex);
      animateTodoToggle(featureIndex, taskIndex, lineIndex);
      const taskFinished = !wasTaskComplete && taskComplete(task);
      if (taskFinished) {
        void app.sounds.play();
        app.notifications.show("info", "Task finished", [{ value: task.title }, " completed."], "rocket");
      }
      if (!feature.isBacklog && !wasFeatureComplete && featureComplete(feature)) app.notifications.show("info", "Feature finished", [{ value: feature.title }, " completed."], "confetti");
      return;
    }

    const taskHeader = eventElement(event).closest(".card-header");
    if (taskHeader) {
      const task = requiredClosest(taskHeader, ".card");
      const body = task.querySelector(".card-body");
      body.hidden = !body.hidden;
      task.setAttribute("aria-expanded", String(!body.hidden));
      app.layout.contentOverflowChanged();
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
      app.layout.contentOverflowChanged();
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

  /** @param {MouseEvent} event */
  function handleContextMenu(event) {
    if (!project) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    const target = eventElement(event);
    const copyTarget = hoveredCopyTarget(target);
    if (copyTarget) {
      hoveredElement = copyTarget;
      if (copyHovered(event.ctrlKey || event.metaKey)) event.preventDefault();
      return;
    }
    if (clipboard.length) {
      if (pasteAt(lastPointer)) event.preventDefault();
      return;
    }
    hoveredElement = null;
  }

  /** @param {PointerEvent} event */
  function rememberPointer(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
    hoveredElement = hoveredCopyTarget(eventElement(event));
  }

  [document.getElementById("content"), document.getElementById("backlog")].forEach(container => {
    container.addEventListener("click", handleContentClick);
    container.addEventListener("contextmenu", handleContextMenu);
    container.addEventListener("pointermove", rememberPointer);
    container.addEventListener("pointerleave", () => { hoveredElement = null; });
    container.addEventListener("mouseover", handleTitleEnter);
    container.addEventListener("mouseout", handleTitleLeave);
  });
  document.getElementById("toggleBacklog").addEventListener("click", toggleBacklog);
  document.getElementById("addFeature").addEventListener("click", () => {
    if (!project) return;
    const activeProject = project;
    const projectTitle = activeProject.title;
    const beforeViewState = captureViewState();
    const draftFeature = { title: "New Feature", headerLines: [], version: "", dates: [], notes: [], tasks: [], isBacklog: false };
    app.editor.openFeature(activeProject, draftFeature, (/** @type {{title: string, metadata: string, info: string, warn: string}} */ draft) => {
      const metadata = app.markdown.composeFeatureMetadata(draft);
      const feature = { ...metadata, title: draft.title, tasks: [], isBacklog: false };
      const backlogIndex = activeProject.features.findIndex(item => item.isBacklog);
      const featureIndex = backlogIndex < 0 ? activeProject.features.length : backlogIndex;
      const afterViewState = copyViewState(beforeViewState);
      const noteIndex = document.querySelectorAll("#content .feature-note").length;
      afterViewState.featureNotes.splice(noteIndex, 0, ...feature.notes.map(() => false));
      afterViewState.featureScrolls.push({ left: 0, top: 0 });
      perform("Feature added", () => app.domain.insertFeature(activeProject, featureIndex, feature), () => { app.domain.deleteFeature(activeProject, featureIndex); }, beforeViewState, afterViewState, undefined, feature.title.length + feature.headerLines.join("\n").length);
      app.notifications.show("info", "Feature added", [{ value: draft.title }, " added to \"", { value: projectTitle }, "\"."]);
    }, true);
  });
  document.getElementById("toggleViewMenu").addEventListener("click", event => {
    closeHelp();
    const options = document.getElementById("viewOptions");
    options.hidden = !options.hidden;
    (/** @type {HTMLElement} */ (event.currentTarget)).setAttribute("aria-expanded", String(!options.hidden));
  });
  document.getElementById("toggleSounds").addEventListener("click", event => {
    const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
    const muted = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Unmute sounds" : "Mute sounds");
    button.title = muted ? "Unmute sounds" : "Mute sounds";
    app.sounds.setMuted(muted);
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
    if (shortcut && !editsText && !event.shiftKey && key === "c" && window.getSelection()?.isCollapsed !== false) {
      if (copyHovered()) event.preventDefault();
    }
    if (shortcut && !editsText && !event.shiftKey && key === "v" && clipboard.length && lastPointer) {
      if (pasteAt(lastPointer)) event.preventDefault();
    }
    if (shortcut && !editsText && !event.shiftKey && key === "z") {
      event.preventDefault();
      undo?.();
    }
    if (shortcut && !editsText && ((event.shiftKey && key === "z") || (!event.metaKey && !event.shiftKey && key === "y"))) {
      event.preventDefault();
      redo?.();
    }
    if (event.ctrlKey && !event.altKey && !event.shiftKey && !editsText && event.key.toLowerCase() === "b" && !document.getElementById("toggleBacklog").disabled) {
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
  document.getElementById("toggleClock").addEventListener("click", event => {
    const clock = document.getElementById("appClock");
    const active = clock.hidden;
    clock.hidden = !active;
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
  document.getElementById("reloadExternal").addEventListener("click", () => { void resolveExternalFile("reload"); });
  document.getElementById("overwriteExternal").addEventListener("click", () => { void resolveExternalFile("overwrite"); });
  document.addEventListener("click", event => {
    const target = eventElement(event);
    if (!target.closest(".view-menu")) closeViewMenu();
    if (!target.closest(".help-menu")) closeHelp();
    if (!target.closest(".release,.card,.task-editor-dialog,.feature-editor-dialog")) {
      hoveredElement = null;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  });

  app.interactions = {
    setProject,
    clearClipboard() { setClipboard([]); },
    startClock,
    getViewState: captureViewState,
    restoreViewState: restoreInteractionState,
    /** @param {(index: number) => void} callback */
    setOpenRecent(callback) { openRecent = callback; },
    /** @param {(index: number) => void} callback */
    setRemoveRecent(callback) { removeRecent = callback; },
    /** @param {{save: () => Promise<void>, undo: () => void, redo: () => void, reloadExternal: () => Promise<boolean>, overwriteExternal: () => Promise<boolean>}} actions */
    setUndoSystemActions(actions) {
      save = actions.save;
      undo = actions.undo;
      redo = actions.redo;
      reloadExternal = actions.reloadExternal;
      overwriteExternal = actions.overwriteExternal;
    },
    /** @param {{dirty: boolean, canUndo: boolean, canRedo: boolean, undoLabel: string, redoLabel: string, externalChange: boolean}} state */
    setUndoSystemState(state) {
      const saveButton = document.getElementById("saveFile");
      saveButton.textContent = "Save";
      saveButton.removeAttribute("title");
      saveButton.classList.toggle("dirty", state.dirty);
      const undoButton = document.getElementById("undoChange");
      const redoButton = document.getElementById("redoChange");
      undoButton.disabled = !state.canUndo;
      redoButton.disabled = !state.canRedo;
      undoButton.setAttribute("title", state.undoLabel ? `Undo: ${state.undoLabel}` : "Undo");
      redoButton.setAttribute("title", state.redoLabel ? `Redo: ${state.redoLabel}` : "Redo");
      document.getElementById("externalActions").hidden = !state.externalChange;
    }
  };
})(window.MDManager);
