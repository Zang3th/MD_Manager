window.MDManager = window.MDManager || {};

(function (app) {
  const deleteIcon = '<span aria-hidden="true">✕</span>';

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

  function todos(task) {
    return app.markdown.taskContent(task).todos;
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
    const content = app.markdown.taskContent(task);
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

  function equalizeReleaseHeaders() {
    requestAnimationFrame(() => {
      const titles = [...document.querySelectorAll("#content > .release .release-title")];
      const headers = [...document.querySelectorAll("#content > .release > .release-header")];
      titles.forEach(title => title.style.height = "auto");
      headers.forEach(header => header.style.height = "auto");
      const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
      titles.forEach(title => title.style.height = `${titleHeight}px`);
      const headerHeight = Math.max(0, ...headers.map(header => header.offsetHeight));
      headers.forEach(header => header.style.height = `${headerHeight}px`);
    });
  }

  function shortenedTitle(value) {
    if (value.length <= 12) return value;
    let boundary = -1;
    for (let index = 1; index <= 12; index++) {
      if (/\s/.test(value[index])) boundary = index;
      else if (/[a-zäöüß]/.test(value[index - 1]) && /[A-ZÄÖÜ]/.test(value[index])) boundary = index;
      else if (index > 1 && /[A-ZÄÖÜ]/.test(value[index - 2]) && /[A-ZÄÖÜ]/.test(value[index - 1]) && /[a-zäöüß]/.test(value[index])) boundary = index - 1;
    }
    return `${value.slice(0, boundary > 0 ? boundary : 12).trimEnd()} ...`;
  }

  function taskMarkup(task, taskIndex) {
    const taskTodos = todos(task);
    const done = taskTodos.filter(todo => todo.checked).length;
    const taskComplete = taskTodos.length > 0 && done === taskTodos.length;
    const taskInProgress = done > 0 && !taskComplete;
    return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}" data-task="${taskIndex}" tabindex="0" aria-expanded="false">
      <header class="card-header"><h3 class="card-title" data-full-title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3><span class="task-status">${taskComplete ? '<span class="task-check" title="Complete" aria-label="Complete">✓</span>' : ""}<span class="task-progress">${done}/${taskTodos.length}</span></span><button class="delete-btn" data-delete="task" type="button" aria-label="Delete task" title="Delete task">${deleteIcon}</button></header>
      <div class="card-body" hidden>${taskBody(task)}</div>
    </section>`;
  }

  function backlogContents(feature) {
    const taskCount = feature.tasks.length;
    return `<header class="backlog-header"><div class="backlog-heading"><h2 class="backlog-title">${escapeHtml(feature.title)}</h2><span class="backlog-count">${taskCount} ${taskCount === 1 ? "Task" : "Tasks"}</span></div><button class="backlog-close" type="button" aria-label="Close backlog" title="Close backlog">${deleteIcon}</button></header>
      ${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes, true)}</div>` : ""}
      <div class="board">${feature.tasks.map(taskMarkup).join("")}</div>`;
  }

  function setGridTitles(active) {
    document.querySelectorAll(".release-title, .card-title").forEach(title => {
      title.textContent = active ? shortenedTitle(title.dataset.fullTitle) : title.dataset.fullTitle;
    });
  }

  function layoutGrid() {
    requestAnimationFrame(() => {
      const content = document.getElementById("content");
      if (!document.body.classList.contains("toggle-grid-view")) {
        content.style.removeProperty("--grid-card-width");
        content.style.removeProperty("--grid-feature-height");
        document.body.style.removeProperty("--grid-card-width");
        document.body.style.removeProperty("--grid-feature-height");
        return;
      }
      content.style.removeProperty("--grid-feature-height");
      document.body.style.removeProperty("--grid-feature-height");
      const elements = [...content.querySelectorAll(".release-title, .card-title")];
      const widths = elements.map(element => {
        element.style.whiteSpace = "nowrap";
        let width;
        if (element.classList.contains("release-title")) {
          const heading = element.closest(".release-heading");
          const progressWidth = heading.querySelector(".feature-progress")?.offsetWidth || 0;
          const versionWidth = heading.querySelector(".release-version")?.offsetWidth || 0;
          width = element.scrollWidth + Math.max(48, progressWidth, versionWidth) * 2 + 24;
        } else {
          const statusWidth = element.closest(".card-header").querySelector(".task-status")?.offsetWidth || 0;
          width = element.scrollWidth + statusWidth + 40;
        }
        element.style.whiteSpace = "";
        return width;
      });
      const cardWidth = Math.min(Math.max(240, ...widths), content.clientWidth);
      content.style.setProperty("--grid-card-width", `${cardWidth}px`);
      document.body.style.setProperty("--grid-card-width", `${cardWidth}px`);
      equalizeReleaseHeaders();
      requestAnimationFrame(() => {
        const featureHeight = Math.max(0, ...[...content.querySelectorAll(":scope > .release")].map(feature => feature.offsetHeight));
        content.style.setProperty("--grid-feature-height", `${featureHeight}px`);
        document.body.style.setProperty("--grid-feature-height", `${featureHeight}px`);
      });
    });
  }

  function render(project, viewState) {
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("historyControls").hidden = false;
    document.getElementById("saveFile").hidden = false;
    document.getElementById("appVersion").hidden = true;
    document.getElementById("watermark").hidden = true;
    document.getElementById("projectTitle").textContent = project.title;
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
    function statRow(label, counts) {
      return `<tr><th scope="row">${label}</th><td class="done">${counts.done}</td><td class="active">${counts.active}</td><td class="open">${counts.open}</td><td class="backlog-stat">${counts.backlog}</td></tr>`;
    }
    const stats = document.getElementById("projectStats");
    stats.hidden = false;
    stats.innerHTML = `<div class="stats-header"><span class="stats-title">Statistics</span><button class="stats-close" type="button" aria-label="Close statistics" title="Close statistics">${deleteIcon}</button></div><table><thead><tr><th></th><th class="done" scope="col">Done</th><th class="active" scope="col">Active</th><th class="open" scope="col">Open</th><th class="backlog-stat" scope="col">Backlog</th></tr></thead><tbody>${statRow("Features", featureCounts)}${statRow("Tasks", taskCounts)}${statRow("Todos", todoCounts)}</tbody></table>`;
    document.title = `MD_Manager - ${project.title}`;
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
      const featureTodos = feature.tasks.flatMap(todos);
      const completed = featureTodos.filter(todo => todo.checked).length;
      const complete = featureTodos.length > 0 && completed === featureTodos.length;
      const inProgress = completed > 0 && !complete;
      const percentage = featureTodos.length ? Math.round(completed / featureTodos.length * 100) : 0;
      return `<section class="release${complete ? " complete" : ""}${inProgress ? " in-progress" : ""}" data-feature="${featureIndex}">
        <header class="release-header" tabindex="0"><div class="release-heading"><button class="delete-btn" data-delete="feature" type="button" aria-label="Delete feature" title="Delete feature">${deleteIcon}</button>
          <span class="feature-progress"><span class="status-value">${percentage}%</span></span>
          <h2 class="release-title" data-full-title="${escapeHtml(feature.title)}">${escapeHtml(feature.title)}</h2>
          ${feature.version ? `<p class="release-version">v${escapeHtml(feature.version)}</p>` : ""}
        </div>${feature.dates.length ? `<div class="release-meta"><ul class="release-dates">${feature.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul></div>` : ""}</header>
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
    setGridTitles(document.body.classList.contains("toggle-grid-view"));
    restoreViewState(viewState);
    equalizeReleaseHeaders();
    layoutGrid();
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

  window.addEventListener("resize", () => { equalizeReleaseHeaders(); layoutGrid(true); });
  app.render = { project: render, start: showStart, escapeHtml, equalizeReleaseHeaders, layoutGrid, setGridTitles };
})(window.MDManager);
