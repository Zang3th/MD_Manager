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
  let taskContentCache = new WeakMap();

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

  /** @param {MDProject} project @param {MDFeature} feature @param {MDArchiveOrder} order @param {Set<number>} expandedFeatures @param {MDArchiveTimelineEntry} [entry] */
  function archiveFeatureMarkup(project, feature, order, expandedFeatures, entry) {
    const featureIndex = project.features.indexOf(feature);
    const expanded = expandedFeatures.has(featureIndex);
    const visibleTasks = feature.tasks.filter(task => !task.ignored);
    const version = feature.version ? (/^v/i.test(feature.version.trim()) ? feature.version.trim() : `v${feature.version.trim()}`) : "";
    const dates = feature.dates.filter(date => date.from || date.to).map(date => [date.from, date.to && date.to !== date.from ? date.to : ""].filter(Boolean).join(" – ")).join(" · ");
    const entryRanges = entry?.ranges || [];
    const metadata = order === "date" ? version : dates;
    let inactive = "";
    if (order === "date" && entry?.date && entry.endDate && entryRanges.length > 1) {
      const duration = entry.endDate.time - entry.date.time;
      let workedUntil = entry.date.time;
      for (const range of entryRanges) {
        if (range.from.time > workedUntil) {
          const left = (workedUntil - entry.date.time) / duration * 100;
          const width = (range.from.time - workedUntil) / duration * 100;
          inactive += `<span class="archive-feature-inactive" style="left:${left}%;width:${width}%"></span>`;
        }
        workedUntil = Math.max(workedUntil, (range.to || range.from).time);
      }
    }
    const tasksId = `archiveTasks${featureIndex}`;
    return `<article class="archive-feature${expanded ? " expanded" : ""}" data-feature="${featureIndex}">${inactive}
      <button class="archive-feature-toggle" type="button" aria-expanded="${expanded}" aria-controls="${tasksId}">
        <span class="archive-feature-title">${escapeHtml(feature.title)}</span>
        ${metadata ? `<span class="archive-feature-meta">${escapeHtml(metadata)}</span>` : ""}
      </button>
      <div class="archive-tasks" id="${tasksId}"${expanded ? "" : " hidden"}>${visibleTasks.length ? `<ul>${visibleTasks.map(task => `<li>${escapeHtml(task.title)}</li>`).join("")}</ul>` : '<p class="archive-no-tasks">No tasks</p>'}</div>
      <button class="archive-unarchive" data-unarchive-feature="${featureIndex}" type="button" aria-label="Move to Workspace" data-tooltip="Move to Workspace">${unarchiveIcon}</button>
    </article>`;
  }

  /** @param {MDProject} project @param {MDArchiveTimeline} timeline @param {Set<number>} expandedFeatures */
  function archiveDateTimelineMarkup(project, timeline, expandedFeatures) {
    const unmatched = timeline.unmatched.length ? `<section class="archive-date-unmatched"><h3>Without date</h3><div>${timeline.unmatched.map(feature => archiveFeatureMarkup(project, feature, "date", expandedFeatures)).join("")}</div></section>` : "";
    if (timeline.fromTime === undefined || timeline.toTime === undefined) return unmatched;
    /** @type {Map<number, string>} */
    const markerLevels = new Map();
    /** @type {Map<number, number>} */
    const pointCounts = new Map();
    const entries = (timeline.entries || []).filter(entry => entry.date);
    for (const entry of entries) {
      const start = /** @type {MDArchiveDate} */ (entry.date);
      const end = entry.endDate || start;
      markerLevels.set(start.time, "main");
      markerLevels.set(end.time, "main");
      if (!entry.endDate) pointCounts.set(start.time, (pointCounts.get(start.time) || 0) + 1);
      for (const range of entry.ranges || []) {
        if (!markerLevels.has(range.from.time)) markerLevels.set(range.from.time, "sub");
        if (range.to && !markerLevels.has(range.to.time)) markerLevels.set(range.to.time, "sub");
      }
    }
    const markers = (timeline.markers || []).map(date => {
      const endpoint = date.time === timeline.fromTime || date.time === timeline.toTime;
      const shared = (pointCounts.get(date.time) || 0) > 1 ? " archive-date-marker-shared" : "";
      return `<span class="archive-date-marker archive-date-marker-${markerLevels.get(date.time) || "sub"}${endpoint ? " archive-date-marker-endpoint" : ""}${shared}" data-time="${date.time}"><span>${escapeHtml(date.value)}</span></span>`;
    }).join("");
    const ticks = (timeline.ticks || []).map(tick => `<span class="archive-date-tick archive-date-tick-${tick.level}" data-time="${tick.time}"></span>`).join("");
    /** @type {string[]} */
    const guides = [];
    const cards = entries.map((entry, index) => {
      const start = /** @type {MDArchiveDate} */ (entry.date);
      const end = entry.endDate || start;
      const interior = new Set();
      for (const range of entry.ranges || []) {
        interior.add(range.from.time);
        if (range.to) interior.add(range.to.time);
      }
      interior.delete(start.time);
      interior.delete(end.time);
      guides.push(`<path class="archive-date-guide archive-date-guide-start" data-entry="${index}"></path>`);
      if (entry.endDate) guides.push(`<path class="archive-date-guide archive-date-guide-end" data-entry="${index}"></path>`);
      for (const time of interior) guides.push(`<path class="archive-date-guide archive-date-guide-sub" data-entry="${index}" data-time="${time}"></path>`);
      return `<div class="archive-date-card${entry.endDate ? "" : " archive-date-card-point"}" data-entry="${index}" data-start="${start.time}" data-end="${end.time}">${archiveFeatureMarkup(project, entry.feature, "date", expandedFeatures, entry)}</div>`;
    }).join("");
    return `<svg class="archive-date-lines" aria-hidden="true" focusable="false"><path class="archive-date-axis-line"></path>${guides.join("")}</svg>
      <div class="archive-date-ticks" aria-hidden="true">${ticks}</div>
      <div class="archive-date-markers" aria-hidden="true">${markers}</div>
      <div class="archive-date-cards">${cards}</div>${unmatched}`;
  }

  /** @param {MDProject} project @param {MDFeature[]} features @param {MDArchiveOrder} order @param {number[]} expandedFeatureIndices */
  function archiveTimelineContents(project, features, order, expandedFeatureIndices) {
    /** @type {MDArchiveTimeline} */
    const timeline = app.archive.timeline(features, order);
    const expandedFeatures = new Set(expandedFeatureIndices);
    const range = timeline.from ? `<p class="archive-range">${escapeHtml(timeline.from)}${timeline.to !== timeline.from ? ` – ${escapeHtml(timeline.to)}` : ""}</p>` : '<p class="archive-range archive-range-empty">No matching metadata</p>';
    if (order === "date") {
      /** @type {Record<string, string>} */
      const dataset = {};
      if (timeline.fromTime !== undefined && timeline.toTime !== undefined) {
        dataset.fromTime = String(timeline.fromTime);
        dataset.toTime = String(timeline.toTime);
        dataset.scale = timeline.scale;
      }
      return { range, dataset, timeline: archiveDateTimelineMarkup(project, timeline, expandedFeatures) };
    }
    const groups = timeline.groups.map(group => `<section class="archive-period" data-period="${escapeHtml(group.key)}">
      <h3 class="archive-period-title"><span>${escapeHtml(group.label)}</span></h3>
      <span class="archive-period-dot" aria-hidden="true"></span>
      <div class="archive-period-features">${group.entries.map(entry => archiveFeatureMarkup(project, entry.feature, order, expandedFeatures, entry)).join("")}</div>
    </section>`).join("");
    const unmatched = timeline.unmatched.length ? `<section class="archive-period archive-unmatched" data-period="unmatched">
      <h3 class="archive-period-title"><span>Without ${order}</span></h3>
      <span class="archive-period-dot" aria-hidden="true"></span>
      <div class="archive-period-features">${timeline.unmatched.map(feature => archiveFeatureMarkup(project, feature, order, expandedFeatures)).join("")}</div>
    </section>` : "";
    return { range, dataset: {}, timeline: `<svg class="archive-timeline-line" aria-hidden="true" focusable="false"><path class="archive-timeline-path" vector-effect="non-scaling-stroke"></path></svg>${groups}${unmatched}` };
  }

  /** @param {Record<string, string>} dataset */
  function datasetAttributes(dataset) {
    return Object.entries(dataset).map(([name, value]) => ` data-${name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)}="${escapeHtml(value)}"`).join("");
  }

  /** @param {HTMLElement} element @param {Record<string, string>} dataset */
  function applyDataset(element, dataset) {
    for (const name of ["fromTime", "toTime", "scale"]) {
      if (dataset[name] === undefined) delete element.dataset[name];
      else element.dataset[name] = dataset[name];
    }
  }

  /** @param {MDProject} project @param {MDFeature[]} features @param {Partial<MDViewState>} [viewState] */
  function archiveContents(project, features, viewState) {
    const order = viewState?.archiveOrder || "date";
    const count = features.length;
    const timelineContents = archiveTimelineContents(project, features, order, viewState?.archiveExpandedFeatures || []);
    const controlsOpen = viewState?.archiveControlsOpen !== false;
    const stage = count ? `<div class="archive-stage"><div class="archive-timeline${order === "date" ? " archive-date-timeline" : ""}"${datasetAttributes(timelineContents.dataset)}>${timelineContents.timeline}</div></div>` : '<div class="archive-stage archive-stage-empty"><div class="empty start-screen archive-empty"><p class="recent-files-empty">No archived features yet.</p></div></div>';
    return `<div class="archive-summary"><div class="archive-summary-line"><h2 class="archive-title">Archive</h2><span class="archive-summary-separator" aria-hidden="true">/</span><span class="archive-count">${count} ${count === 1 ? "Feature" : "Features"}</span></div>${count ? timelineContents.range : ""}</div>
      <div class="archive-content">${stage}</div>
      <aside class="archive-control-panel" aria-label="Timeline controls"${controlsOpen ? "" : " hidden"}><div class="archive-control-panel-header"><span>Timeline controls</span><button class="archive-controls-close" type="button" aria-label="Close timeline controls" data-tooltip="Close timeline controls">${deleteIcon}</button></div><div class="archive-controls">
        <div class="archive-control-group"><span class="archive-control-label">Sort by</span><div class="archive-order" role="group" aria-label="Archive order"><button type="button" data-archive-order="date" aria-pressed="${order === "date"}">Date</button><button type="button" data-archive-order="version" aria-pressed="${order === "version"}">Version</button></div></div>
      </div></aside>`;
  }

  /** @param {MDProject} project @param {Partial<MDViewState>} [viewState] */
  function renderArchive(project, viewState) {
    const archivedFeatures = project.features.filter(feature => feature.isArchived && !feature.ignored);
    const archive = document.getElementById("archive");
    archive.innerHTML = archiveContents(project, archivedFeatures, viewState);
    archive.setAttribute("aria-label", project.archiveTitle || "Archive");
    document.getElementById("toggleArchiveControls").setAttribute("aria-pressed", String(viewState?.archiveControlsOpen !== false));
  }

  /** @param {MDProject} project @param {MDViewState} viewState */
  function updateArchiveTimeline(project, viewState) {
    const archive = document.getElementById("archive");
    const features = project.features.filter(feature => feature.isArchived && !feature.ignored);
    const contents = archiveTimelineContents(project, features, viewState.archiveOrder, viewState.archiveExpandedFeatures);
    archive.querySelector(".archive-range")?.replaceWith(/** @type {HTMLElement} */ (document.createRange().createContextualFragment(contents.range).firstElementChild));
    const timeline = /** @type {HTMLElement | null} */ (archive.querySelector(".archive-timeline"));
    if (!timeline) return;
    timeline.classList.toggle("archive-date-timeline", viewState.archiveOrder === "date");
    applyDataset(timeline, contents.dataset);
    timeline.innerHTML = contents.timeline;
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

  /** @param {MDProject} project @param {MDViewState | undefined} viewState @param {string} fileName */
  function render(project, viewState, fileName) {
    taskContentCache = new WeakMap();
    app.layout.reset();
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
    document.body.classList.toggle("archive-view-active", archiveActive);
    document.getElementById("showWorkspaceView").setAttribute("aria-pressed", String(!archiveActive));
    document.getElementById("showArchiveView").setAttribute("aria-pressed", String(archiveActive));
    content.hidden = archiveActive;
    const archive = document.getElementById("archive");
    renderArchive(project, viewState);
    archive.hidden = !archiveActive;
    document.getElementById("addFeature").hidden = archiveActive;
    document.getElementById("toggleBacklog").hidden = archiveActive;
    document.getElementById("toggleMetadata").hidden = archiveActive;
    const statsButton = document.getElementById("toggleStats");
    statsButton.hidden = archiveActive;
    document.getElementById("toggleArchiveControls").hidden = !archiveActive;
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
    archiveTimeline: updateArchiveTimeline,
    start: showStart,
    saveError: showSaveError,
    updateTodo,
    escapeHtml,
    equalizeReleaseHeaders: app.layout.equalizeReleaseHeaders,
    layout: app.layout.layout,
    fitTitles: app.layout.fitTitles,
    startTitleScroll: app.layout.startTitleScroll,
    stopTitleScroll: app.layout.stopTitleScroll
  };
})(window.MDManager);
