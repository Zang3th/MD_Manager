window.MDManager = window.MDManager || {};

(function (app) {
  const deleteIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-close"></use></svg>';
  const checkIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-check"></use></svg>';
  const editIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-edit"></use></svg>';
  const addIcon = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-plus"></use></svg>';
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
    return `${notes.length ? `<div class="task-notes">${notesMarkup(notes)}</div>` : ""}
      <div class="task-blocks">${content.blocks.map(block => {
      if (block.type === "note") return "";
      if (block.type === "paragraph") {
        return `<p>${inlineMarkdown(block.text)}</p>`;
      }
      if (!block.title && !block.descriptions.length && !block.todos.length && content.todos.length > 0) return "";
      return `<section class="todo-group">${block.title ? `<div class="todo-separator">${inlineMarkdown(block.title)}</div>` : ""}
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
      const expanded = viewState.tasks[index] ?? false;
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
    const { entries: taskTodos, complete: taskComplete, inProgress: taskInProgress } = taskProgress(task);
    return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}" data-task="${taskIndex}" tabindex="0" aria-expanded="false">
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
  function featureProgress(feature) {
    return app.status.progress(feature.tasks.filter(task => !task.ignored).flatMap(todos));
  }

  /** @param {MDProject} project */
  function statisticsMarkup(project) {
    const counts = app.status.statistics(project.features, todos);
    /** @param {string} label @param {{done: number, active: number, open: number, backlog: number}} counts */
    const row = (label, counts) => `<tr><th scope="row">${label}</th><td class="done">${counts.done}</td><td class="active">${counts.active}</td><td class="open">${counts.open}</td><td class="backlog-stat">${counts.backlog}</td></tr>`;
    return `<div class="stats-header"><span class="stats-title">Statistics</span><button class="stats-close" type="button" aria-label="Close statistics" data-tooltip="Close statistics">${deleteIcon}</button></div><table><thead><tr><th></th><th class="done" scope="col">Done</th><th class="active" scope="col">Active</th><th class="open" scope="col">Open</th><th class="backlog-stat" scope="col">Backlog</th></tr></thead><tbody>${row("Features", counts.features)}${row("Tasks", counts.tasks)}${row("Todos", counts.entries)}</tbody></table>`;
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
    const regularFeatures = project.features.filter(feature => !feature.isBacklog && !feature.ignored);
    const backlogFeature = project.features.find(feature => feature.isBacklog && !feature.ignored);
    const stats = document.getElementById("projectStats");
    stats.hidden = false;
    stats.innerHTML = statisticsMarkup(project);
    document.title = `MD_Manager - ${fileName}`;
    const content = document.getElementById("content");
    if (!project.features.length) {
      document.getElementById("toggleBacklog").disabled = true;
      document.getElementById("toggleBacklog").setAttribute("aria-pressed", "false");
      document.getElementById("backlog").hidden = true;
      document.getElementById("backlog").innerHTML = "";
      content.innerHTML = '<div class="empty">No features found. At least one level <code>##</code> heading is required.</div>';
      return;
    }

    content.innerHTML = regularFeatures.map(feature => {
      const featureIndex = project.features.indexOf(feature);
      const { complete, inProgress, percentage } = featureProgress(feature);
      return `<section class="release${complete ? " complete" : ""}${inProgress ? " in-progress" : ""}" data-feature="${featureIndex}">
        <header class="release-header" tabindex="0"><div class="release-heading"><button class="edit-btn action-btn" data-edit="feature" type="button" aria-label="Edit feature" data-tooltip="Edit feature">${editIcon}</button><button class="delete-btn action-btn" data-delete="feature" type="button" aria-label="Delete feature" data-tooltip="Delete feature">${deleteIcon}</button>
          <span class="feature-progress"><span class="status-value">${percentage}%</span></span>
          <h2 class="release-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></h2>
        </div>${feature.dates.length || feature.version ? `<div class="release-meta">${feature.dates.length ? `<ul class="release-dates">${feature.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul>` : ""}${feature.version ? `<p class="release-version">v${escapeHtml(feature.version)}</p>` : ""}</div>` : ""}</header>
        <div class="release-content">${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
          <div class="board">${feature.tasks.filter(task => !task.ignored).map(task => taskMarkup(task, feature.tasks.indexOf(task))).join("")}</div>
          <div class="add-task-footer"><button class="add-task-btn action-btn" data-add-task type="button" aria-label="New task in ${escapeHtml(feature.title)}" data-tooltip="New task">${addIcon}</button></div>
        </div>
      </section>`;
    }).join("");
    const backlog = document.getElementById("backlog");
    const backlogButton = document.getElementById("toggleBacklog");
    const backlogOpen = viewState ? viewState.backlogOpen : false;
    backlogButton.disabled = !backlogFeature;
    backlogButton.setAttribute("aria-pressed", String(Boolean(backlogFeature && backlogOpen)));
    if (backlogFeature) {
      backlog.dataset.feature = String(project.features.indexOf(backlogFeature));
      backlog.innerHTML = backlogContents(backlogFeature);
      backlog.hidden = !backlogOpen;
    } else {
      backlog.removeAttribute("data-feature");
      backlog.innerHTML = "";
      backlog.hidden = true;
    }
    restoreViewState(viewState);
    app.layout.equalizeReleaseHeaders();
    app.layout.layoutGrid();
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
    document.getElementById("toggleBacklog").disabled = true;
    document.getElementById("toggleBacklog").setAttribute("aria-pressed", "false");
    document.getElementById("backlog").hidden = true;
    document.getElementById("watermark").hidden = false;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle"><h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `<div class="recent-file"><button class="recent-file-open" data-recent="${index}" type="button"><span class="recent-file-details"><span class="recent-project-name">${escapeHtml(entry.projectTitle || entry.name)}</span>${entry.projectTitle ? `<span class="recent-file-name">${escapeHtml(entry.name)}</span>` : ""}</span><time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${formatRecentTime(entry.openedAt)}</time></button><div class="recent-file-actions"><button class="recent-delete" data-remove-recent="${index}" type="button" aria-label="Remove ${escapeHtml(entry.name)} from recent files" data-tooltip="Remove from recent files">${deleteIcon}</button></div></div>`).join("") : '<p class="recent-files-empty">No recent files</p>'}</div>
        <div class="start-actions"><button class="btn start-file-action" id="openFile" type="button">Open File</button><button class="btn start-file-action" id="newProject" type="button">Create File</button></div>
      </section></div>`;
  }

  /** @param {string} message */
  function showError(message) {
    document.getElementById("content").innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
  }

  /** @param {string} message */
  function showRecentError(message) {
    const list = document.querySelector(".recent-files-list");
    if (list) list.innerHTML = `<p class="recent-files-empty">${escapeHtml(message)}</p>`;
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
    start: showStart,
    error: showError,
    recentError: showRecentError,
    saveError: showSaveError,
    updateTodo,
    escapeHtml,
    equalizeReleaseHeaders: app.layout.equalizeReleaseHeaders,
    layoutGrid: app.layout.layoutGrid,
    fitTitles: app.layout.fitTitles,
    startTitleScroll: app.layout.startTitleScroll,
    stopTitleScroll: app.layout.stopTitleScroll
  };
})(window.MDManager);
