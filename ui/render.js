window.MDManager = window.MDManager || {};

(function (app) {
  const deleteIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-close"></use></svg>';
  const checkIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-check"></use></svg>';
  const editIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-edit"></use></svg>';
  const addIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-plus"></use></svg>';
  const archiveIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-archive"></use></svg>';
  const unarchiveIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-undo"></use></svg>';
  const dotsIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-dots"></use></svg>';
  const pinIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-pin"></use></svg>';
  const featureWidths = [380, 460, 540];
  let taskContentCache = new WeakMap();
  /** @type {WeakMap<MDFeature, MDArchiveTimelineLane>} */
  let archiveLaneByFeature = new WeakMap();

  /** @param {number} width @returns {number} */
  function setFeatureWidth(width) {
    const index = featureWidths.indexOf(width);
    const selectedIndex = index < 0 ? 0 : index;
    const selectedWidth = featureWidths[selectedIndex];
    const percentage = 100 + selectedIndex * 20;
    const slider = /** @type {HTMLInputElement} */ (document.getElementById("featureWidth"));
    document.documentElement.style.setProperty("--feature-width", `${selectedWidth}px`);
    slider.value = String(selectedIndex);
    slider.style.setProperty("--zoom-progress", `${selectedIndex * 50}%`);
    document.querySelectorAll(".workspace-zoom-stops > span").forEach((stop, stopIndex) => stop.classList.toggle("is-reached", stopIndex <= selectedIndex));
    slider.setAttribute("aria-valuetext", `${percentage}%, ${selectedWidth} pixels`);
    document.getElementById("featureZoomValue").textContent = `${percentage}%`;
    document.getElementById("toggleWorkspaceZoom").setAttribute("aria-label", `Feature card zoom: ${percentage}%`);
    return selectedWidth;
  }

  /** @param {string} value */
  function escapeHtml(value) {
    /** @type {Record<string, string>} */
    const entities = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    };
    return value.replace(/[&<>"']/g, character => entities[character]);
  }

  /** @param {string} value */
  function inlineCode(value) {
    let markup = "";
    for (let index = 0; index < value.length;) {
      const operator = value.slice(index, index + 2);
      if (operator === "=>" || operator === "->" || operator === "::") {
        markup += `${escapeHtml(operator)}${index + 2 < value.length ? "<wbr>" : ""}`;
        index += 2;
        continue;
      }
      const previous = value[index - 1] || "";
      const character = value[index];
      const next = value[index + 1] || "";
      if ((/[a-z0-9]/.test(previous) && /[A-Z]/.test(character)) || (/[A-Z]/.test(previous) && /[A-Z]/.test(character) && /[a-z]/.test(next))) markup += "<wbr>";
      markup += escapeHtml(character);
      if (index + 1 < value.length && /[.,_/\\:;=+\-*<>()[\]{}|&]/.test(character)) markup += "<wbr>";
      index += 1;
    }
    return markup;
  }

  /** @param {string} value */
  function inlineMarkdown(value) {
    const tokens = /(`([^`\n]+)`|\[([^\]\n]+)]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|~([^~\n]+)~|\*([^*\n]+)\*)/g;
    let markup = "";
    let offset = 0;
    for (const match of value.matchAll(tokens)) {
      markup += escapeHtml(value.slice(offset, match.index));
      if (match[2] !== undefined) markup += `<code>${inlineCode(match[2])}</code>`;
      else if (match[3] !== undefined) markup += `<a href="${escapeHtml(match[4])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[3])}</a>`;
      else if (match[5] !== undefined) markup += `<strong>${escapeHtml(match[5])}</strong>`;
      else if (match[6] !== undefined) markup += `<s>${escapeHtml(match[6])}</s>`;
      else markup += `<em>${escapeHtml(match[7])}</em>`;
      offset = (match.index || 0) + match[0].length;
    }
    return markup + escapeHtml(value.slice(offset));
  }

  /** @param {{text: string, indent: number, children: Array<*>}[]} items */
  function nestedNoteList(items) {
    /** @type {{text: string, indent: number, children: Array<*>}[]} */
    const roots = [];
    /** @type {{text: string, indent: number, children: Array<*>}[]} */
    const stack = [];
    for (const item of items) {
      while (stack.length && item.indent <= stack[stack.length - 1].indent) stack.pop();
      const node = { ...item, children: [] };
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      stack.push(node);
    }
    /** @param {typeof roots} nodes @returns {string} */
    const render = nodes => `<ul>${nodes.map(node => `<li><span>${inlineMarkdown(node.text)}</span>${node.children.length ? render(node.children) : ""}</li>`).join("")}</ul>`;
    return render(roots);
  }

  /** @param {MDTask} task @returns {MDTaskContent} */
  function taskContent(task) {
    if (!taskContentCache.has(task)) taskContentCache.set(task, app.markdown.taskContent(task));
    return taskContentCache.get(task);
  }

  /** @param {MDTask} task */
  function todos(task) {
    return taskContent(task).todos;
  }

  /** @param {MDNote[]} notes @param {boolean} [collapsible] */
  function notesMarkup(notes, collapsible = false) {
    return notes.map(note => {
      const noteType = note.noteType || note.type;
      const title = noteType === "warn" ? "Warn" : "Info";
      let content = "";
      /** @type {{text: string, indent: number, children: Array<*>}[]} */
      let listItems = [];
      const flushList = () => {
        if (!listItems.length) return;
        content += nestedNoteList(listItems);
        listItems = [];
      };
      for (const item of note.items) {
        if (item.paragraph) {
          flushList();
          content += `<p>${inlineMarkdown(item.text)}</p>`;
        } else listItems.push({ text: item.text, indent: item.indent || 0, children: [] });
      }
      flushList();
      return `<section class="task-note task-${noteType}${collapsible ? " feature-note collapsed" : ""}"${collapsible ? ' aria-expanded="false"' : ""}>${collapsible ? `<button class="note-toggle" type="button">${title}</button>` : `<h4>${title}</h4>`}${content}</section>`;
    }).join("");
  }

  /** @param {MDTask} task */
  function taskBody(task) {
    const content = taskContent(task);
    const notes = content.blocks.filter(block => block.type === "note");
    let hasPreviousTodo = false;
    return `${notes.length ? `<div class="task-notes">${notesMarkup(notes)}</div>` : ""}
      <div class="task-blocks">${content.blocks.map(block => {
      if (block.type === "note") return "";
      if (block.type === "paragraph") {
        return `<p>${inlineMarkdown(block.text)}</p>`;
      }
      if (!block.title && !block.descriptions.length && !block.todos.length && content.todos.length > 0) return "";
      const showSeparator = hasPreviousTodo;
      if (block.todos.length) hasPreviousTodo = true;
      return `<section class="todo-group">${block.title ? `<div class="todo-separator${showSeparator ? " todo-separator-divided" : ""}">${inlineMarkdown(block.title)}</div>` : ""}
        ${block.sections.map(section => `${section.descriptions.map(description => `<p class="todo-description">${inlineMarkdown(description.text)}</p>`).join("")}
        <div class="todo-list" data-anchor-line="${section.lineIndex}">${section.todos.map(todo => `<div class="todo-item" data-line="${todo.lineIndex}">
          <button class="checkbox${todo.checked ? " checked" : ""}" data-checked="${todo.checked}" type="button" aria-label="Toggle todo" aria-pressed="${todo.checked}">${todo.checked ? checkIcon : ""}</button>
          <span class="todo-text${todo.checked ? " completed" : ""}">${inlineMarkdown(todo.text)}</span>
          <button class="delete-btn" data-delete="todo" type="button" aria-label="Delete todo" data-tooltip="Delete todo">${deleteIcon}</button>
        </div>`).join("")}</div>`).join("")}</section>`;
    }).join("")}</div>`;
  }

  /** @param {MDViewState} [viewState] */
  function restoreViewState(viewState) {
    if (!viewState) return;
    document.querySelectorAll(".card").forEach((task, index) => {
      if (task.classList.contains("bodyless-task")) {
        task.removeAttribute("aria-expanded");
        task.querySelector(".card-body").hidden = true;
        return;
      }
      const expanded = !task.classList.contains("bodyless-task") && (viewState.tasks[index] ?? false);
      task.setAttribute("aria-expanded", String(expanded));
      task.querySelector(".card-body").hidden = !expanded;
    });
    document.querySelectorAll(".feature-note").forEach((note, index) => {
      const expanded = viewState.featureNotes?.[index] ?? false;
      note.classList.toggle("collapsed", !expanded);
      note.setAttribute("aria-expanded", String(expanded));
    });
  }

  /** @param {MDTask} task @param {number} taskIndex */
  function taskMarkup(task, taskIndex) {
    const content = taskContent(task);
    const { entries: taskTodos, complete: taskComplete, inProgress: taskInProgress } = taskProgress(task);
    const hasBody = content.blocks.some(block => block.type === "paragraph" || block.type === "note" && block.items.length || block.type === "group" && (Boolean(block.title) || block.descriptions.length || block.todos.length));
    return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}${hasBody ? "" : " bodyless-task"}" data-task="${taskIndex}"${hasBody ? ' tabindex="0" aria-expanded="false"' : ""}>
      <header class="card-header"><h3 class="card-title" data-full-title="${escapeHtml(task.title)}"><span class="title-text">${escapeHtml(task.title)}</span></h3><span class="task-status">${taskStatusMarkup(task)}</span><button class="edit-btn action-btn" data-edit="task" type="button" aria-label="Edit task" data-tooltip="Edit task">${editIcon}</button><button class="delete-btn action-btn" data-delete="task" type="button" aria-label="Delete task" data-tooltip="Delete task">${deleteIcon}</button></header>
      <div class="card-body" hidden>${taskBody(task)}</div>
    </section>`;
  }

  /** @param {MDTask} task */
  function taskProgress(task) {
    return app.status.progress(todos(task));
  }

  /** @param {MDTask} task */
  function taskStatusMarkup(task) {
    const { entries, done, complete, inProgress } = taskProgress(task);
    const icon = complete ? `<span class="task-check" data-tooltip="Complete" aria-label="Complete">${checkIcon}</span>` : inProgress ? '<span class="task-in-progress" data-tooltip="In progress" aria-label="In progress"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-progress"></use></svg></span>' : "";
    return `${icon}<span class="task-progress">${done}/${entries.length}</span>`;
  }

  /** @param {MDFeature} feature */
  function backlogContents(feature) {
    const visibleTasks = feature.tasks.filter(task => !task.ignored);
    const taskCount = visibleTasks.length;
    return `<header class="backlog-header"><div class="backlog-heading"><h2 class="backlog-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></h2><span class="backlog-count">${taskCount} ${taskCount === 1 ? "Task" : "Tasks"}</span></div><button class="backlog-close" type="button" aria-label="Close backlog" data-tooltip="Close backlog">${deleteIcon}</button></header>
      <div class="backlog-content">${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
        <div class="board">${visibleTasks.map(task => taskMarkup(task, feature.tasks.indexOf(task))).join("")}</div>
        <div class="add-task-footer"><button class="add-task-btn backlog-add-task action-btn" data-add-task type="button" aria-label="New task in ${escapeHtml(feature.title)}" data-tooltip="New task">${addIcon}</button></div>
      </div>`;
  }

  /** @param {MDFeature} feature */
  function archiveFeatureVersion(feature) {
    return feature.version ? (/^v/i.test(feature.version.trim()) ? feature.version.trim() : `v${feature.version.trim()}`) : "";
  }

  /** @param {MDFeature} feature */
  function archiveFeatureDates(feature) {
    return feature.dates.filter(date => date.from || date.to).map(date => [date.from, date.to && date.to !== date.from ? date.to : ""].filter(Boolean).join(" – "));
  }

  /** @param {MDFeature} feature @param {number} featureIndex */
  function archiveFeatureMarkup(feature, featureIndex) {
    const version = archiveFeatureVersion(feature);
    return `<article class="archive-feature" data-feature="${featureIndex}">
      <button class="archive-feature-toggle" type="button" aria-haspopup="dialog" aria-controls="archiveFeaturePopover" aria-expanded="false">
        <span class="archive-feature-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></span>
        ${version ? `<span class="archive-feature-version">${escapeHtml(version)}</span>` : ""}
      </button>
    </article>`;
  }

  /** @param {MDArchiveTimelineLane} lane @param {number} featureIndex */
  function archiveSwimlaneMarkup(lane, featureIndex) {
    const feature = lane.feature;
    const version = archiveFeatureVersion(feature);
    const objectLabel = (/** @type {string} */ label) => `<span class="archive-object-label">${escapeHtml(label)}</span>`;
    const durationLabel = (/** @type {number} */ days) => `${days} ${days === 1 ? "day" : "days"}`;
    const baselines = '<span class="archive-lane-baseline"></span>';
    const ranges = lane.ranges.map(range => {
      const ends = `${range.startDay === lane.startDay ? " archive-track-start" : ""}${range.endExclusive === lane.endExclusive ? " archive-track-end" : ""}`;
      return `<span class="archive-active-segment${ends}" style="--archive-position:${range.position}%;--archive-width:${range.width}%">${objectLabel(durationLabel(range.durationDays))}</span>`;
    }).join("");
    const pauses = lane.pauses.map(pause => `<span class="archive-pause-segment" style="--archive-position:${pause.position}%;--archive-width:${pause.width}%">${objectLabel(durationLabel(pause.durationDays))}</span>`).join("");
    const points = lane.points.map(point => `<span class="archive-date-point" style="--archive-position:${point.position}%">${objectLabel(point.label)}</span>`).join("");
    return `<article class="archive-feature archive-swimlane-feature" data-feature="${featureIndex}">
      <div class="archive-swimlane-row">
        <button class="archive-feature-toggle archive-swimlane-label" type="button" aria-haspopup="dialog" aria-controls="archiveFeaturePopover" aria-expanded="false" aria-label="${escapeHtml(lane.accessibleSummary)}">
          <span class="archive-feature-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></span>
          ${version ? `<span class="archive-swimlane-version">${escapeHtml(version)}</span>` : ""}
        </button>
        <div class="archive-swimlane-plot" aria-hidden="true"><div class="archive-date-scale">${baselines}${pauses}${ranges}${points}</div></div>
      </div>
    </article>`;
  }

  /** @param {number} count @param {MDArchiveTimeline} timeline */
  function archiveSummaryMarkup(count, timeline) {
    const range = timeline.from ? `${escapeHtml(timeline.from)}${timeline.to !== timeline.from ? ` – ${escapeHtml(timeline.to)}` : ""}` : "No matching metadata";
    return `<div class="archive-axis-summary"><div class="archive-summary-line"><h2 class="archive-title">Archive</h2><span class="archive-summary-separator" aria-hidden="true">/</span><span class="archive-count">${count} ${count === 1 ? "Feature" : "Features"}</span></div>${count ? `<p class="archive-range${timeline.from ? "" : " archive-range-empty"}">${range}</p>` : ""}</div>`;
  }

  /** @param {MDProject} project @param {MDArchiveTimeline} timeline @param {number} count */
  function archiveDateTimelineMarkup(project, timeline, count) {
    const featureIndexes = new Map(project.features.map((feature, index) => [feature, index]));
    const unmatched = timeline.unmatched.length ? `<section class="archive-date-unmatched"><h3>Without date</h3><div>${timeline.unmatched.map(feature => archiveFeatureMarkup(feature, featureIndexes.get(feature) ?? -1)).join("")}</div></section>` : "";
    const lanes = timeline.lanes;
    const sortedTicks = timeline.ticks.filter(tick => tick.position > 0 && tick.position < 100).slice().sort((left, right) => left.position - right.position);
    const boundaries = [0, ...sortedTicks.map(tick => tick.position), 100];
    const steps = boundaries.slice(1).map((position, index) => position - boundaries[index]).filter(step => step > 0).sort((left, right) => left - right);
    const regularStep = steps.length ? steps[Math.floor(steps.length / 2)] : 100;
    const edgeClearance = regularStep / 2;
    const interiorTicks = sortedTicks.filter(tick => tick.position >= edgeClearance && tick.position <= 100 - edgeClearance);
    const majorPositions = interiorTicks.filter(tick => tick.level === "major").map(tick => tick.position);
    const fallbackTicks = interiorTicks.filter(tick => tick.level === "major" || majorPositions.every(position => Math.abs(position - tick.position) >= edgeClearance));
    const pathData = (/** @type {MDArchiveTickLevel} */ level, /** @type {number} */ fromY, /** @type {number} */ toY) => fallbackTicks.filter(tick => tick.level === level).map(tick => `M${tick.position} ${fromY}V${toY}`).join("");
    const tickPaths = (/** @type {number} */ fromY, /** @type {number} */ toY) => `<path class="archive-grid-path archive-grid-path-minor" d="${pathData("minor", fromY, toY)}"></path><path class="archive-grid-path archive-grid-path-major" d="${pathData("major", fromY, toY)}"></path>`;
    const edgePath = (/** @type {number} */ fromY, /** @type {number} */ toY) => `<path class="archive-grid-path archive-grid-path-endpoint" d="M0 ${fromY}V${toY}"></path>`;
    const labels = sortedTicks.filter(tick => tick.label).map(tick => `<span class="archive-grid-label" data-archive-label-position="${tick.labelPosition}" style="--archive-label-position:${tick.labelPosition}%">${escapeHtml(tick.label)}</span>`).join("");
    // Paint order is document order: the ticks and the period boundary go down first, the rule closes
    // them off, and the left plot edge frames everything on top.
    const headerGrid = `<svg class="archive-axis-grid" aria-hidden="true" focusable="false" viewBox="0 0 100 100" preserveAspectRatio="none" shape-rendering="crispEdges">${tickPaths(52, 100)}<path class="archive-axis-line" d="M0 52H100"></path>${edgePath(0, 100)}</svg>`;
    const bodyGrid = `<svg class="archive-date-grid" aria-hidden="true" focusable="false" viewBox="0 0 100 100" preserveAspectRatio="none" shape-rendering="crispEdges">${tickPaths(0, 100)}</svg>`;
    // The plot edges bound the table, so they are drawn after the lanes and above them; a bar that
    // reaches an edge must not paint over the frame that encloses it.
    const edgeOverlay = `<svg class="archive-date-grid archive-edge-overlay" aria-hidden="true" focusable="false" viewBox="0 0 100 100" preserveAspectRatio="none" shape-rendering="crispEdges">${edgePath(0, 100)}</svg>`;
    // The coarse row names the periods; the summary line above already states the domain range, so
    // the ruler does not repeat it.
    const cells = timeline.headerCells.map(cell => `<span class="archive-axis-cell" style="--archive-position:${cell.position}%;--archive-width:${cell.width}%"><span class="archive-axis-cell-label">${escapeHtml(cell.label)}</span></span>`).join("");
    const gridData = escapeHtml(JSON.stringify(sortedTicks.map(tick => [tick.position, tick.level, tick.labelPosition])));
    const empty = count ? "" : '<div class="empty start-screen archive-empty"><p class="recent-files-empty">No archived features yet.</p></div>';
    // With no lane there is no timeline to head, so the table chrome stays away entirely and the
    // summary stands on its own above whatever is left to show.
    if (!lanes.length) return `<div class="archive-date-heading">${archiveSummaryMarkup(count, timeline)}</div>${empty ? `<div class="archive-swimlane-list-empty">${empty}</div>` : ""}${unmatched}`;
    const crosshair = '<div class="archive-crosshair-track" aria-hidden="true"><span class="archive-crosshair-line"></span></div>';
    return `<div class="archive-date-axis" data-archive-grid="${gridData}" data-archive-ruler-per-cell="${timeline.rulerPerCell}" data-archive-scale="${timeline.scale}" data-archive-plot-start="${timeline.plotStartDay}" data-archive-plot-span="${timeline.spanDays}"><div class="archive-axis-corner">${archiveSummaryMarkup(count, timeline)}</div><div class="archive-axis-plot"><div class="archive-date-scale"><div class="archive-axis-cells">${cells}</div>${headerGrid}${labels}<span class="archive-crosshair-readout" aria-hidden="true"></span></div></div></div>
      <div class="archive-swimlane-list${empty ? " archive-swimlane-list-empty" : ""}">${empty || `<div class="archive-swimlane-rows">${bodyGrid}${lanes.map(lane => archiveSwimlaneMarkup(lane, featureIndexes.get(lane.feature) ?? -1)).join("")}${crosshair}${edgeOverlay}</div>`}</div>${unmatched}`;
  }

  /** @param {MDProject} project @param {MDFeature[]} features */
  function archiveTimelineContents(project, features) {
    /** @type {MDArchiveTimeline} */
    const timeline = app.archive.timeline(features);
    archiveLaneByFeature = new WeakMap(timeline.lanes.map(lane => [lane.feature, lane]));
    return archiveDateTimelineMarkup(project, timeline, features.length);
  }

  /** @param {MDProject} project @param {MDFeature[]} features */
  function archiveContents(project, features) {
    const timeline = archiveTimelineContents(project, features);
    return `<div class="archive-content"><div class="archive-stage"><div class="archive-timeline archive-date-timeline">${timeline}</div></div></div>
      <aside class="archive-feature-popover" id="archiveFeaturePopover" role="dialog" aria-modal="false" tabindex="-1" hidden></aside>`;
  }

  /** @param {MDProject} project */
  function renderArchive(project) {
    const archivedFeatures = project.features.filter(feature => feature.isArchived && !feature.ignored);
    const archive = document.getElementById("archive");
    archive.innerHTML = archiveContents(project, archivedFeatures);
    archive.setAttribute("aria-label", project.archiveTitle || "Archive");
  }

  /** @param {MDProject} project @param {number} featureIndex @returns {HTMLElement | null} */
  function renderArchiveFeaturePopover(project, featureIndex) {
    const feature = project.features[featureIndex];
    const popover = /** @type {HTMLElement | null} */ (document.getElementById("archiveFeaturePopover"));
    if (!popover || !feature?.isArchived) return null;
    const version = archiveFeatureVersion(feature);
    const dates = archiveFeatureDates(feature);
    const visibleTasks = feature.tasks.filter(task => !task.ignored);
    const lane = archiveLaneByFeature.get(feature);
    const dayValue = (/** @type {number} */ days) => `${days} ${days === 1 ? "day" : "days"}`;
    const timelineMetrics = [
      ["Work", lane ? dayValue(lane.metrics.recordedDays) : "—"],
      ["Pause", lane ? dayValue(lane.metrics.pauseDays) : "—"],
      ["Total", lane ? dayValue(lane.metrics.spanDays) : "—"]
    ];
    const titleId = `archiveFeaturePopoverTitle${featureIndex}`;
    popover.dataset.feature = String(featureIndex);
    popover.setAttribute("aria-labelledby", titleId);
    popover.innerHTML = `<header class="archive-feature-popover-header"><div><h3 id="${titleId}">${escapeHtml(feature.title)}</h3>${version ? `<span class="archive-popover-version">${escapeHtml(version)}</span>` : ""}</div><button class="archive-feature-popover-close" type="button" aria-label="Close feature details">${deleteIcon}</button></header>
      <div class="archive-feature-popover-content">${dates.length ? `<section class="archive-popover-section"><h4>Date${dates.length === 1 ? "" : "s"}</h4><div class="archive-popover-dates">${dates.map(date => `<span>${escapeHtml(date)}</span>`).join("")}</div></section>` : ""}
        <section class="archive-popover-section archive-popover-timeline"><h4>Timeline</h4><dl class="archive-popover-metrics">${timelineMetrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl></section>
        <section class="archive-popover-section archive-popover-tasks"><h4>Tasks</h4>${visibleTasks.length ? `<ul>${visibleTasks.map(task => `<li>${escapeHtml(task.title)}</li>`).join("")}</ul>` : '<p class="archive-no-tasks">No tasks</p>'}</section>
      </div>
      <footer class="archive-feature-popover-footer"><button class="archive-popover-unarchive" data-unarchive-feature="${featureIndex}" type="button">${unarchiveIcon}<span>Move to Workspace</span></button></footer>`;
    popover.hidden = false;
    return popover;
  }

  /** @param {MDFeature} feature */
  function featureProgress(feature) {
    return app.status.progress(feature.tasks.filter(task => !task.ignored).flatMap(todos));
  }

  /** @param {MDProject} project */
  function statisticsMarkup(project) {
    const counts = app.status.statistics(project.features, todos);
    /** @param {string} label @param {{done: number, active: number, open: number, backlog: number, archive: number}} counts */
    const row = (label, counts) => `<tr><th scope="row">${label}</th><td class="archive-stat">${counts.archive}</td><td class="done">${counts.done}</td><td class="active">${counts.active}</td><td class="open">${counts.open}</td><td class="backlog-stat">${counts.backlog}</td></tr>`;
    return `<div class="stats-header"><span class="stats-title">Statistics</span><button class="stats-close" type="button" aria-label="Close statistics" data-tooltip="Close statistics">${deleteIcon}</button></div><table><thead><tr><th></th><th class="archive-stat" scope="col">Archive</th><th class="done" scope="col">Done</th><th class="active" scope="col">Active</th><th class="open" scope="col">Open</th><th class="backlog-stat" scope="col">Backlog</th></tr></thead><tbody>${row("Features", counts.features)}${row("Tasks", counts.tasks)}${row("Todos", counts.entries)}</tbody></table>`;
  }

  /** @param {MDProject} project @param {MDViewState | undefined} viewState @param {string} fileName @param {number} [featureWidth] */
  function render(project, viewState, fileName, featureWidth = 380) {
    taskContentCache = new WeakMap();
    app.layout.reset();
    setFeatureWidth(featureWidth);
    document.body.classList.remove("start-view");
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("undoSystemControls").hidden = false;
    document.getElementById("saveFile").hidden = false;
    document.getElementById("addFeature").hidden = false;
    document.getElementById("appVersion").hidden = true;
    document.getElementById("watermark").hidden = true;
    document.getElementById("projectTitle").textContent = project.title;
    const regularFeatures = project.features.filter(feature => !feature.isBacklog && !feature.isArchived && !feature.ignored);
    const backlogFeature = project.features.find(feature => feature.isBacklog && !feature.ignored);
    const stats = document.getElementById("projectStats");
    stats.hidden = false;
    stats.innerHTML = statisticsMarkup(project);
    document.title = `MD_Manager - ${fileName}`;
    const content = document.getElementById("content");
    if (!regularFeatures.length) {
      content.innerHTML = '<div class="empty start-screen"><p class="recent-files-empty">No features found. At least one level <code>##</code> heading is required.</p></div>';
    } else content.innerHTML = regularFeatures.map(feature => {
      const featureIndex = project.features.indexOf(feature);
      const { complete, inProgress, percentage } = featureProgress(feature);
      return `<section class="release${complete ? " complete" : ""}${inProgress ? " in-progress" : ""}${feature.isPinned ? " pinned" : ""}" data-feature="${featureIndex}">
        <header class="release-header" tabindex="0"><div class="release-heading"><div class="feature-menu"><button class="feature-menu-button action-btn" type="button" aria-label="Feature actions" data-tooltip="Feature actions" aria-expanded="false" aria-controls="featureOptions${featureIndex}">${dotsIcon}</button><div class="feature-options" id="featureOptions${featureIndex}" hidden>
          <button class="feature-option action-btn" data-feature-action="archive" type="button" aria-label="Archive feature">${archiveIcon}<span>Archive</span></button>
          <button class="feature-option feature-delete action-btn" data-delete="feature" type="button" aria-label="Delete feature">${deleteIcon}<span>Delete</span></button>
          <button class="feature-option action-btn" data-edit="feature" type="button" aria-label="Edit feature">${editIcon}<span>Edit</span></button>
          <button class="feature-option action-btn" data-feature-action="pin" type="button" aria-label="${feature.isPinned ? "Unpin" : "Pin"} feature">${pinIcon}<span>${feature.isPinned ? "Unpin" : "Pin"}</span></button>
        </div></div>
          <span class="feature-progress"><span class="status-value">${percentage}%</span></span>
          ${feature.isPinned ? `<span class="feature-pin" aria-hidden="true">${pinIcon}</span>` : ""}<h2 class="release-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></h2>
        </div>${feature.dates.length || feature.version ? `<div class="release-meta">${feature.dates.length ? `<ul class="release-dates">${feature.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul>` : ""}${feature.version ? `<p class="release-version">v${escapeHtml(feature.version)}</p>` : ""}</div>` : ""}</header>
        <div class="release-content">${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
          <div class="board">${feature.tasks.filter(task => !task.ignored).map(task => taskMarkup(task, feature.tasks.indexOf(task))).join("")}</div>
          <div class="add-task-footer"><button class="add-task-btn action-btn" data-add-task type="button" aria-label="New task in ${escapeHtml(feature.title)}" data-tooltip="New task">${addIcon}</button></div>
        </div>
      </section>`;
    }).join("");
    const archiveActive = viewState?.view === "archive";
    document.getElementById("workspaceZoom").hidden = archiveActive;
    document.body.classList.toggle("archive-view-active", archiveActive);
    document.getElementById("showWorkspaceView").setAttribute("aria-pressed", String(!archiveActive));
    document.getElementById("showArchiveView").setAttribute("aria-pressed", String(archiveActive));
    content.hidden = archiveActive;
    const archive = document.getElementById("archive");
    renderArchive(project);
    archive.hidden = !archiveActive;
    document.getElementById("addFeature").hidden = archiveActive;
    document.getElementById("toggleBacklog").hidden = archiveActive;
    document.getElementById("toggleMetadata").hidden = archiveActive;
    const statsButton = document.getElementById("toggleStats");
    statsButton.hidden = archiveActive;
    const statsOpen = viewState ? viewState.statsOpen : true;
    statsButton.setAttribute("aria-pressed", String(statsOpen));
    document.body.classList.toggle("hide-stats", archiveActive || !statsOpen);
    const backlog = document.getElementById("backlog");
    const backlogButton = document.getElementById("toggleBacklog");
    const backlogOpen = viewState ? viewState.backlogOpen : false;
    backlogButton.disabled = !backlogFeature;
    backlogButton.setAttribute("aria-pressed", String(Boolean(backlogFeature && backlogOpen)));
    if (backlogFeature) {
      backlog.dataset.feature = String(project.features.indexOf(backlogFeature));
      backlog.innerHTML = backlogContents(backlogFeature);
      backlog.hidden = archiveActive || !backlogOpen;
    } else {
      backlog.removeAttribute("data-feature");
      backlog.innerHTML = "";
      backlog.hidden = true;
    }
    restoreViewState(viewState);
    app.layout.equalizeReleaseHeaders();
    app.layout.layout();
  }

  /** @param {MDProject} project @param {number} featureIndex @param {number} taskIndex @param {number} lineIndex */
  function updateTodo(project, featureIndex, taskIndex, lineIndex) {
    const feature = project.features[featureIndex];
    const task = feature.tasks[taskIndex];
    taskContentCache.delete(task);
    const release = document.querySelector(`.release[data-feature="${featureIndex}"]`);
    const card = release.querySelector(`.card[data-task="${taskIndex}"]`);
    const todo = todos(task).find(entry => entry.lineIndex === lineIndex);
    if (!todo) return;
    const item = card.querySelector(`.todo-item[data-line="${lineIndex}"]`);
    const checkbox = item.querySelector(".checkbox");
    checkbox.dataset.checked = String(todo.checked);
    checkbox.setAttribute("aria-pressed", String(todo.checked));
    checkbox.classList.toggle("checked", todo.checked);
    checkbox.innerHTML = todo.checked ? checkIcon : "";
    item.querySelector(".todo-text").classList.toggle("completed", todo.checked);

    const taskState = taskProgress(task);
    card.classList.toggle("complete", taskState.complete);
    card.classList.toggle("in-progress", taskState.inProgress);
    card.querySelector(".task-status").innerHTML = taskStatusMarkup(task);

    if (!feature.isBacklog) {
      const featureState = featureProgress(feature);
      release.classList.toggle("complete", featureState.complete);
      release.classList.toggle("in-progress", featureState.inProgress);
      release.querySelector(".status-value").textContent = `${featureState.percentage}%`;
    }
    document.getElementById("projectStats").innerHTML = statisticsMarkup(project);

    app.layout.statusChanged();
  }

  /** @param {number} timestamp */
  function formatRecentTime(timestamp) {
    const date = new Date(timestamp);
    const part = (/** @type {number} */ value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
  }

  /** @param {MDRecentFile[]} entries */
  function showStart(entries) {
    document.body.classList.add("start-view");
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("undoSystemControls").hidden = true;
    document.getElementById("saveFile").hidden = true;
    document.getElementById("addFeature").hidden = true;
    document.getElementById("appVersion").hidden = false;
    document.getElementById("appClock").hidden = true;
    document.getElementById("projectStats").hidden = true;
    document.getElementById("workspaceZoom").hidden = true;
    document.body.classList.remove("archive-view-active");
    document.getElementById("showWorkspaceView").setAttribute("aria-pressed", "true");
    document.getElementById("showArchiveView").setAttribute("aria-pressed", "false");
    document.getElementById("archive").hidden = true;
    document.getElementById("archive").innerHTML = "";
    document.getElementById("toggleBacklog").disabled = true;
    document.getElementById("toggleBacklog").setAttribute("aria-pressed", "false");
    document.getElementById("backlog").hidden = true;
    document.getElementById("watermark").hidden = false;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle"><h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `<div class="recent-file"><button class="recent-file-open" data-recent="${index}" type="button"><span class="recent-file-details"><span class="recent-project-name">${escapeHtml(entry.projectTitle || entry.name)}</span>${entry.projectTitle ? `<span class="recent-file-name">${escapeHtml(entry.name)}</span>` : ""}</span><time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${formatRecentTime(entry.openedAt)}</time></button><div class="recent-file-actions"><button class="recent-delete" data-remove-recent="${index}" type="button" aria-label="Remove ${escapeHtml(entry.name)} from recent files" data-tooltip="Remove from recent files">${deleteIcon}</button></div></div>`).join("") : '<p class="recent-files-empty">No recent files.</p>'}</div>
        <div class="start-actions"><button class="btn start-file-action" id="openFile" type="button">Open File</button><button class="btn start-file-action" id="newProject" type="button">Create File</button></div>
      </section></div>`;
  }

  /** @param {string} message */
  function showSaveError(message) {
    const button = document.getElementById("saveFile");
    document.getElementById("saveStateLabel").textContent = "Save failed";
    button.querySelector("use").setAttribute("href", "#icon-close");
    button.setAttribute("aria-label", "Save failed");
    button.classList.add("save-error");
    button.dataset.tooltip = message;
  }

  app.render = {
    project: render,
    archive: renderArchive,
    archiveFeaturePopover: renderArchiveFeaturePopover,
    start: showStart,
    saveError: showSaveError,
    featureWidth: setFeatureWidth,
    updateTodo,
    // Rendering and the statistics panel already parse every non-ignored task, so this
    // memoised accessor lets the search index reuse that work instead of parsing the
    // whole project a second time. Its cache is reset with every render and dropped per
    // task in `updateTodo`, so callers always see current content.
    taskContent,
    equalizeReleaseHeaders: app.layout.equalizeReleaseHeaders,
    layout: app.layout.layout,
    fitTitles: app.layout.fitTitles,
    startTitleScroll: app.layout.startTitleScroll,
    stopTitleScroll: app.layout.stopTitleScroll
  };
})(window.MDManager);
