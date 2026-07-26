window.MDManager = window.MDManager || {};

(function (app) {
  const deleteIcon = '<span aria-hidden="true">✕</span>';
  let taskContentCache = new WeakMap();
  const titleFitCache = new Map();
  const textWidthCache = new Map();
  const titleStyleCache = new Map();
  const headerHeightCache = new Map();
  const gridHeightCache = new Map();
  const measureContext = document.createElement("canvas").getContext("2d");
  let gridIntrinsicWidth = null;
  let layoutFrame = 0;
  let layoutNeeds = { titles: false, headers: false, gridWidth: false, gridHeight: false };

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function inlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function taskContent(task) {
    if (!taskContentCache.has(task)) taskContentCache.set(task, app.markdown.taskContent(task));
    return taskContentCache.get(task);
  }

  function todos(task) {
    return taskContent(task).todos;
  }

  function notesMarkup(notes, collapsible = false) {
    return notes.map(note => {
      const noteType = note.noteType || note.type;
      const title = noteType === "warn" ? "Warn" : "Info";
      let listOpen = false;
      const content = note.items.map(item => {
        const text = typeof item === "string" ? item : item.text;
        const indent = typeof item === "string" ? 0 : item.indent;
        if (item.paragraph) {
          const markup = `${listOpen ? "</ul>" : ""}<p>${inlineMarkdown(text)}</p>`;
          listOpen = false;
          return markup;
        }
        const markup = `${listOpen ? "" : "<ul>"}<li${indent ? ` style="margin-left:${indent}ch"` : ""}>${inlineMarkdown(text)}</li>`;
        listOpen = true;
        return markup;
      }).join("");
      return `<section class="task-note task-${noteType}${collapsible ? " feature-note collapsed" : ""}"${collapsible ? ' aria-expanded="false"' : ""}>${collapsible ? `<button class="note-toggle" type="button">${title}</button>` : `<h4>${title}</h4>`}${content}${listOpen ? "</ul>" : ""}</section>`;
    }).join("");
  }

  function taskBody(task) {
    const content = taskContent(task);
    const notes = content.blocks.filter(block => block.type === "note");
    return `${notes.length ? `<div class="task-notes">${notesMarkup(notes)}</div>` : ""}
      <div class="task-blocks">${content.blocks.map(block => {
      if (block.type === "note") return "";
      if (block.type === "paragraph") {
        return `<p>${inlineMarkdown(block.text)}</p>`;
      }
      if (!block.title && !block.todos.length && content.todos.length > 0) return "";
      return `<section class="todo-group">${block.title ? `<div class="todo-separator">${inlineMarkdown(block.title)}</div>` : ""}
        <div class="todo-list" data-anchor-line="${block.lineIndex}">${block.todos.map(todo => `<div class="todo-item" data-line="${todo.lineIndex}">
          <button class="checkbox${todo.checked ? " checked" : ""}" data-checked="${todo.checked}" type="button" aria-label="Toggle todo" aria-pressed="${todo.checked}">${todo.checked ? '<span aria-hidden="true">✓</span>' : ""}</button>
          <span class="todo-text${todo.checked ? " completed" : ""}">${inlineMarkdown(todo.text)}</span>
          <button class="delete-btn" data-delete="todo" type="button" aria-label="Delete todo" title="Delete todo">${deleteIcon}</button>
        </div>`).join("")}</div></section>`;
    }).join("")}</div>`;
  }

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

  function fontKey(style) {
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}|${style.letterSpacing}`;
  }

  function titleStyle(title) {
    const type = title.classList.contains("release-title") ? "feature" : title.classList.contains("backlog-title") ? "backlog" : "task";
    const key = `${layoutKey()}|${type}`;
    if (!titleStyleCache.has(key)) {
      const style = getComputedStyle(title);
      titleStyleCache.set(key, {
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight
      });
    }
    return titleStyleCache.get(key);
  }

  function measuredTextWidth(value, style) {
    const font = fontKey(style);
    const key = `${font}|${value}`;
    if (textWidthCache.has(key)) return textWidthCache.get(key);
    measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
    const width = measureContext.measureText(value).width + Math.max(0, Array.from(value).length - 1) * spacing;
    textWidthCache.set(key, width);
    return width;
  }

  function fittedTitle(value, availableWidth, style) {
    const characters = Array.from(value);
    const key = `${fontKey(style)}|${Math.floor(availableWidth)}|${value}`;
    if (titleFitCache.has(key)) return titleFitCache.get(key);
    if (measuredTextWidth(value, style) <= availableWidth) {
      titleFitCache.set(key, value);
      return value;
    }
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const length = Math.ceil((low + high) / 2);
      if (measuredTextWidth(characters.slice(0, length).join(""), style) <= availableWidth) low = length;
      else high = length - 1;
    }
    const fitted = characters.slice(0, low).join("");
    titleFitCache.set(key, fitted);
    return fitted;
  }

  function fitTitles(targets) {
    const titles = targets ? [...targets] : [...document.querySelectorAll(".release-title, .card-title, .backlog-title")];
    const values = titles.map(title => {
      if (title.closest("[hidden]")) return title.dataset.fullTitle;
      const style = titleStyle(title);
      const available = title.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return fittedTitle(title.dataset.fullTitle, available, style);
    });
    titles.forEach((title, index) => title.querySelector(".title-text").textContent = values[index]);
  }

  function startTitleScroll(title) {
    const text = title.querySelector(".title-text");
    text.textContent = title.dataset.fullTitle;
    title.classList.add("title-hover");
    requestAnimationFrame(() => {
      const style = getComputedStyle(title);
      const availableWidth = title.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const overflow = Math.ceil(text.scrollWidth - availableWidth);
      if (overflow <= 0) return;
      const distance = Math.ceil(text.scrollWidth + 32);
      text.dataset.scrollText = title.dataset.fullTitle;
      title.style.setProperty("--title-scroll-distance", `${-distance}px`);
      title.style.setProperty("--title-scroll-duration", `${Math.max(1200, distance * 30)}ms`);
      title.classList.add("title-scroll");
    });
  }

  function stopTitleScroll(title) {
    title.classList.remove("title-hover", "title-scroll");
    title.style.removeProperty("--title-scroll-distance");
    title.style.removeProperty("--title-scroll-duration");
    title.querySelector(".title-text").removeAttribute("data-scroll-text");
    fitTitles([title]);
  }

  function taskMarkup(task, taskIndex) {
    const { entries: taskTodos, done, complete: taskComplete, inProgress: taskInProgress } = taskProgress(task);
    return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}" data-task="${taskIndex}" tabindex="0" aria-expanded="false">
      <header class="card-header"><h3 class="card-title" data-full-title="${escapeHtml(task.title)}"><span class="title-text">${escapeHtml(task.title)}</span></h3><span class="task-status">${taskStatusMarkup(task)}</span><button class="delete-btn" data-delete="task" type="button" aria-label="Delete task" title="Delete task">${deleteIcon}</button></header>
      <div class="card-body" hidden>${taskBody(task)}</div>
    </section>`;
  }

  function taskProgress(task) {
    const entries = todos(task);
    const done = entries.filter(todo => todo.checked).length;
    const complete = entries.length > 0 && done === entries.length;
    return { entries, done, complete, inProgress: done > 0 && !complete };
  }

  function taskStatusMarkup(task) {
    const { entries, done, complete, inProgress } = taskProgress(task);
    const icon = complete ? '<span class="task-check" title="Complete" aria-label="Complete">✓</span>' : inProgress ? '<span class="task-in-progress" title="In progress" aria-label="In progress">◐</span>' : "";
    return `${icon}<span class="task-progress">${done}/${entries.length}</span>`;
  }

  function backlogContents(feature) {
    const taskCount = feature.tasks.length;
    return `<header class="backlog-header"><div class="backlog-heading"><h2 class="backlog-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></h2><span class="backlog-count">${taskCount} ${taskCount === 1 ? "Task" : "Tasks"}</span></div><button class="backlog-close" type="button" aria-label="Close backlog" title="Close backlog">${deleteIcon}</button></header>
      ${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
      <div class="board">${feature.tasks.map(taskMarkup).join("")}</div>`;
  }

  function layoutKey() {
    return `${document.body.classList.contains("toggle-grid-view") ? "grid" : "board"}:${document.body.classList.contains("show-metadata") ? "metadata" : "plain"}`;
  }

  function applyHeaderHeights() {
    const titles = [...document.querySelectorAll("#content > .release .release-title")];
    const headers = [...document.querySelectorAll("#content > .release > .release-header")];
    const key = layoutKey();
    let cached = headerHeightCache.get(key);
    if (!cached) {
      titles.forEach(title => title.style.height = "auto");
      headers.forEach(header => header.style.height = "auto");
      const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
      titles.forEach(title => title.style.height = `${titleHeight}px`);
      const headerHeight = Math.max(0, ...headers.map(header => header.offsetHeight));
      cached = { titleHeight, headerHeight };
      headerHeightCache.set(key, cached);
    }
    titles.forEach(title => title.style.height = `${cached.titleHeight}px`);
    headers.forEach(header => header.style.height = `${cached.headerHeight}px`);
  }

  function intrinsicGridWidth(content) {
    if (gridIntrinsicWidth !== null) return gridIntrinsicWidth;
    const elements = [...content.querySelectorAll(".release-title, .card-title")];
    const widths = elements.map(element => {
      const style = titleStyle(element);
      const textWidth = measuredTextWidth(element.dataset.fullTitle, style);
      if (element.classList.contains("release-title")) {
        return textWidth + (element.closest(".release-heading").querySelector(".feature-progress")?.offsetWidth || 0) + 32;
      }
      return textWidth + (element.closest(".card-header").querySelector(".task-status")?.offsetWidth || 0) + 40;
    });
    gridIntrinsicWidth = Math.max(240, ...widths);
    return gridIntrinsicWidth;
  }

  function runLayout() {
    layoutFrame = 0;
    const needs = layoutNeeds;
    layoutNeeds = { titles: false, headers: false, gridWidth: false, gridHeight: false };
    const content = document.getElementById("content");
    const grid = document.body.classList.contains("toggle-grid-view");
    if (!grid) {
      content.style.removeProperty("--grid-card-width");
      content.style.removeProperty("--grid-feature-height");
      document.body.style.removeProperty("--grid-card-width");
      document.body.style.removeProperty("--grid-feature-height");
    } else {
      document.querySelectorAll(".title-hover").forEach(stopTitleScroll);
      if (needs.gridWidth) {
        const width = Math.min(intrinsicGridWidth(content), content.clientWidth);
        content.style.setProperty("--grid-card-width", `${width}px`);
        document.body.style.setProperty("--grid-card-width", `${width}px`);
      }
    }
    if (needs.headers) applyHeaderHeights();
    if (needs.titles) fitTitles();
    if (grid && needs.gridHeight) {
      const key = layoutKey();
      let height = gridHeightCache.get(key);
      if (!height) {
        const cards = [...content.querySelectorAll(".card")].map(card => ({ card, expanded: card.getAttribute("aria-expanded"), body: card.querySelector(".card-body"), hidden: card.querySelector(".card-body").hidden }));
        const notes = [...content.querySelectorAll(".feature-note")].map(note => ({ note, expanded: note.getAttribute("aria-expanded"), collapsed: note.classList.contains("collapsed") }));
        cards.forEach(({ card, body }) => { card.setAttribute("aria-expanded", "false"); body.hidden = true; });
        notes.forEach(({ note }) => { note.setAttribute("aria-expanded", "false"); note.classList.add("collapsed"); });
        content.style.removeProperty("--grid-feature-height");
        document.body.style.removeProperty("--grid-feature-height");
        height = Math.max(0, ...[...content.querySelectorAll(":scope > .release")].map(feature => feature.offsetHeight));
        gridHeightCache.set(key, height);
        cards.forEach(({ card, body, expanded, hidden }) => { card.setAttribute("aria-expanded", expanded); body.hidden = hidden; });
        notes.forEach(({ note, expanded, collapsed }) => { note.setAttribute("aria-expanded", expanded); note.classList.toggle("collapsed", collapsed); });
      }
      content.style.setProperty("--grid-feature-height", `${height}px`);
      document.body.style.setProperty("--grid-feature-height", `${height}px`);
    }
  }

  function scheduleLayout(needs) {
    Object.keys(needs).forEach(key => layoutNeeds[key] ||= needs[key]);
    if (!layoutFrame) layoutFrame = requestAnimationFrame(runLayout);
  }

  function equalizeReleaseHeaders() {
    scheduleLayout({ headers: true, titles: true });
  }

  function layoutGrid(resize = false) {
    scheduleLayout({ titles: true, headers: !resize, gridWidth: true, gridHeight: !resize });
  }

  function resetLayoutCaches() {
    titleFitCache.clear();
    textWidthCache.clear();
    titleStyleCache.clear();
    headerHeightCache.clear();
    gridHeightCache.clear();
    gridIntrinsicWidth = null;
  }

  function featureProgress(feature) {
    const entries = feature.tasks.flatMap(todos);
    const done = entries.filter(todo => todo.checked).length;
    const complete = entries.length > 0 && done === entries.length;
    return { entries, done, complete, inProgress: done > 0 && !complete, percentage: entries.length ? Math.round(done / entries.length * 100) : 0 };
  }

  function statisticsMarkup(project) {
    const regularFeatures = project.features.filter(feature => !feature.isBacklog);
    const backlogFeature = project.features.find(feature => feature.isBacklog);
    const projectTasks = regularFeatures.flatMap(feature => feature.tasks);
    const projectTodos = projectTasks.flatMap(todos);
    const backlogTasks = backlogFeature?.tasks || [];
    const backlogTodos = backlogTasks.flatMap(todos);
    function statusCounts(items, itemTodos) {
      const counts = { done: 0, active: 0, open: 0 };
      items.forEach(item => {
        const entries = itemTodos(item);
        const completed = entries.filter(entry => entry.checked).length;
        if (entries.length > 0 && completed === entries.length) counts.done++;
        else if (completed > 0) counts.active++;
        else counts.open++;
      });
      return counts;
    }
    const featureCounts = statusCounts(regularFeatures, feature => feature.tasks.flatMap(todos));
    const taskCounts = statusCounts(projectTasks, todos);
    const todoCounts = { done: projectTodos.filter(todo => todo.checked).length, active: "/", open: projectTodos.filter(todo => !todo.checked).length };
    featureCounts.backlog = "/";
    taskCounts.backlog = backlogTasks.length;
    todoCounts.backlog = backlogTodos.length;
    const row = (label, counts) => `<tr><th scope="row">${label}</th><td class="done">${counts.done}</td><td class="active">${counts.active}</td><td class="open">${counts.open}</td><td class="backlog-stat">${counts.backlog}</td></tr>`;
    return `<div class="stats-header"><span class="stats-title">Statistics</span><button class="stats-close" type="button" aria-label="Close statistics" title="Close statistics">${deleteIcon}</button></div><table><thead><tr><th></th><th class="done" scope="col">Done</th><th class="active" scope="col">Active</th><th class="open" scope="col">Open</th><th class="backlog-stat" scope="col">Backlog</th></tr></thead><tbody>${row("Features", featureCounts)}${row("Tasks", taskCounts)}${row("Todos", todoCounts)}</tbody></table>`;
  }

  function render(project, viewState, fileName) {
    taskContentCache = new WeakMap();
    resetLayoutCaches();
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("historyControls").hidden = false;
    document.getElementById("saveFile").hidden = false;
    document.getElementById("appVersion").hidden = true;
    document.getElementById("watermark").hidden = true;
    document.getElementById("projectTitle").textContent = project.title;
    const regularFeatures = project.features.filter(feature => !feature.isBacklog);
    const backlogFeature = project.features.find(feature => feature.isBacklog);
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
        <header class="release-header" tabindex="0"><div class="release-heading"><button class="delete-btn" data-delete="feature" type="button" aria-label="Delete feature" title="Delete feature">${deleteIcon}</button>
          <span class="feature-progress"><span class="status-value">${percentage}%</span></span>
          <h2 class="release-title" data-full-title="${escapeHtml(feature.title)}"><span class="title-text">${escapeHtml(feature.title)}</span></h2>
        </div>${feature.dates.length || feature.version ? `<div class="release-meta">${feature.dates.length ? `<ul class="release-dates">${feature.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul>` : ""}${feature.version ? `<p class="release-version">v${escapeHtml(feature.version)}</p>` : ""}</div>` : ""}</header>
        <div class="release-content">${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
          <div class="board">${feature.tasks.map(taskMarkup).join("")}</div>
        </div>
      </section>`;
    }).join("");
    const backlog = document.getElementById("backlog");
    const backlogButton = document.getElementById("toggleBacklog");
    backlogButton.disabled = !backlogFeature;
    backlogButton.setAttribute("aria-pressed", String(Boolean(backlogFeature && viewState?.backlogOpen)));
    if (backlogFeature) {
      backlog.dataset.feature = String(project.features.indexOf(backlogFeature));
      backlog.innerHTML = backlogContents(backlogFeature);
      backlog.hidden = !viewState?.backlogOpen;
    } else {
      backlog.removeAttribute("data-feature");
      backlog.innerHTML = "";
      backlog.hidden = true;
    }
    restoreViewState(viewState);
    equalizeReleaseHeaders();
    layoutGrid();
  }

  function updateTodo(project, featureIndex, taskIndex, lineIndex) {
    const feature = project.features[featureIndex];
    const task = feature.tasks[taskIndex];
    taskContentCache.delete(task);
    const release = document.querySelector(`.release[data-feature="${featureIndex}"]`);
    const card = release.querySelector(`.card[data-task="${taskIndex}"]`);
    const todo = todos(task).find(entry => entry.lineIndex === lineIndex);
    const item = card.querySelector(`.todo-item[data-line="${lineIndex}"]`);
    const checkbox = item.querySelector(".checkbox");
    checkbox.dataset.checked = String(todo.checked);
    checkbox.setAttribute("aria-pressed", String(todo.checked));
    checkbox.classList.toggle("checked", todo.checked);
    checkbox.innerHTML = todo.checked ? '<span aria-hidden="true">✓</span>' : "";
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

    titleFitCache.clear();
    gridIntrinsicWidth = null;
    scheduleLayout({ titles: true, gridWidth: true });
  }

  function showStart(entries) {
    document.getElementById("viewerControls").hidden = true;
    document.getElementById("historyControls").hidden = true;
    document.getElementById("saveFile").hidden = true;
    document.getElementById("appVersion").hidden = false;
    document.getElementById("projectStats").hidden = true;
    document.getElementById("toggleBacklog").disabled = true;
    document.getElementById("toggleBacklog").setAttribute("aria-pressed", "false");
    document.getElementById("backlog").hidden = true;
    document.getElementById("watermark").hidden = false;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle"><h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `<div class="recent-file"><button class="recent-file-open" data-recent="${index}" type="button"><span class="recent-file-name">${escapeHtml(entry.name)}</span><time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${new Date(entry.openedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</time></button><div class="recent-file-actions"><button class="recent-delete" data-remove-recent="${index}" type="button" aria-label="Remove ${escapeHtml(entry.name)} from recent files" title="Remove from recent files">${deleteIcon}</button></div></div>`).join("") : '<p class="recent-files-empty">No recent files</p>'}</div>
      </section></div>`;
  }

  window.addEventListener("resize", () => layoutGrid(true));
  document.fonts.ready.then(() => {
    resetLayoutCaches();
    equalizeReleaseHeaders();
    layoutGrid();
  });
  app.render = { project: render, start: showStart, updateTodo, escapeHtml, equalizeReleaseHeaders, layoutGrid, fitTitles, startTitleScroll, stopTitleScroll };
})(window.MDManager);
