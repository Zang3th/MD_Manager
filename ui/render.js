window.MDManager = window.MDManager || {};

(function (app) {
  let gridContentKey = "";
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

  function taskContent(task) {
    const initialGroup = { type: "group", title: "", lineIndex: -1, todos: [] };
    const result = { blocks: [initialGroup], todos: [] };
    let group = initialGroup;
    let note = null;
    task.lines.forEach((line, lineIndex) => {
      const noteMarker = line.match(/^\s*#(Info|Warn)\s*$/i);
      if (noteMarker) {
        note = { type: "note", noteType: noteMarker[1].toLowerCase(), lineIndex, items: [] };
        result.blocks.push(note);
        group = null;
        return;
      }
      const separator = line.match(/^\s*\*\*(.+)\*\*\s*$/);
      if (separator) {
        note = null;
        group = { type: "group", title: separator[1], lineIndex, todos: [] };
        result.blocks.push(group);
        return;
      }
      const listItem = line.match(/^(\s*)[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (listItem) {
        if (note) note.items.push({ text: listItem[3], indent: listItem[1].replace(/\t/g, "    ").length });
        else {
          const checked = listItem[2]?.toLowerCase() === "x" || /^~.*~$/.test(listItem[3]);
          const todo = { type: "todo", lineIndex, checked, text: listItem[3].replace(/^~(.*)~$/, "$1") };
          group.todos.push(todo);
          result.todos.push(todo);
        }
      } else if (line.trim() && !note) result.blocks.push({ type: "paragraph", text: line.trim() });
    });
    return result;
  }

  function todos(task) {
    return taskContent(task).todos;
  }

  function notesMarkup(notes) {
    return notes.map(note => {
      const noteType = note.noteType || note.type;
      return `<section class="task-note task-${noteType}"><h4>${noteType === "warn" ? "Warn" : "Info"}</h4><ul>${note.items.map(item => {
      const text = typeof item === "string" ? item : item.text;
      const indent = typeof item === "string" ? 0 : item.indent;
      return `<li${indent ? ` style="margin-left:${indent}ch"` : ""}>${inlineMarkdown(text)}</li>`;
      }).join("")}</ul></section>`;
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
          <button class="checkbox${todo.checked ? " checked" : ""}" data-checked="${todo.checked}" type="button" aria-label="Toggle todo" aria-pressed="${todo.checked}">${todo.checked ? "☑" : "☐"}</button>
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
  }

  function equalizeReleaseHeaders() {
    requestAnimationFrame(() => {
      const titles = [...document.querySelectorAll(".release-title")];
      const headers = [...document.querySelectorAll(".release-header")];
      titles.forEach(title => title.style.height = "auto");
      headers.forEach(header => header.style.height = "auto");
      const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
      titles.forEach(title => title.style.height = `${titleHeight}px`);
      const headerHeight = Math.max(0, ...headers.map(header => header.offsetHeight));
      headers.forEach(header => header.style.height = `${headerHeight}px`);
    });
  }

  function layoutGrid(force = false) {
    requestAnimationFrame(() => {
      const content = document.getElementById("content");
      if (!document.body.classList.contains("toggle-grid-view")) {
        content.style.removeProperty("--grid-card-width");
        gridContentKey = "";
        return;
      }
      const elements = [...content.querySelectorAll(".release-title, .card-title")];
      const contentKey = elements.map(element => element.textContent).sort().join("\n");
      if (!force && contentKey === gridContentKey && content.style.getPropertyValue("--grid-card-width")) {
        equalizeReleaseHeaders();
        return;
      }
      const widths = elements.map(element => {
        element.style.whiteSpace = "nowrap";
        const width = element.scrollWidth + (element.classList.contains("release-title") ? 96 : 112);
        element.style.whiteSpace = "";
        return width;
      });
      content.style.setProperty("--grid-card-width", `${Math.min(Math.max(240, ...widths), content.clientWidth)}px`);
      gridContentKey = contentKey;
      equalizeReleaseHeaders();
    });
  }

  function render(project, viewState) {
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("historyControls").hidden = false;
    document.getElementById("appVersion").hidden = true;
    document.getElementById("watermark").hidden = true;
    document.getElementById("projectTitle").textContent = project.title;
    const projectTasks = project.features.flatMap(feature => feature.tasks);
    const projectTodos = projectTasks.flatMap(todos);
    const completedFeatures = project.features.filter(feature => {
      const featureTodos = feature.tasks.flatMap(todos);
      return featureTodos.length > 0 && featureTodos.every(todo => todo.checked);
    }).length;
    const completedTasks = projectTasks.filter(task => {
      const taskTodos = todos(task);
      return taskTodos.length > 0 && taskTodos.every(todo => todo.checked);
    }).length;
    const completedTodos = projectTodos.filter(todo => todo.checked).length;
    function statMarkup(label, completed, total) {
      const state = total > 0 && completed === total ? " complete" : completed > 0 ? " in-progress" : "";
      return `<span class="project-stat${state}"><span>${label}</span><strong>${completed} / ${total}</strong></span>`;
    }
    const stats = document.getElementById("projectStats");
    stats.hidden = false;
    stats.innerHTML = `${statMarkup("Features", completedFeatures, project.features.length)}${statMarkup("Tasks", completedTasks, projectTasks.length)}${statMarkup("ToDos", completedTodos, projectTodos.length)}`;
    document.title = `${project.title} – MD_Manager`;
    const content = document.getElementById("content");
    if (!project.features.length) {
      content.innerHTML = '<div class="empty">No features found. At least one level <code>##</code> heading is required.</div>';
      return;
    }

    content.innerHTML = project.features.map((feature, featureIndex) => {
      const featureTodos = feature.tasks.flatMap(todos);
      const completed = featureTodos.filter(todo => todo.checked).length;
      const complete = featureTodos.length > 0 && completed === featureTodos.length;
      const inProgress = completed > 0 && !complete;
      const percentage = featureTodos.length ? Math.round(completed / featureTodos.length * 100) : 0;
      return `<section class="release${complete ? " complete" : ""}${inProgress ? " in-progress" : ""}" data-feature="${featureIndex}">
        <header class="release-header" tabindex="0"><div class="release-heading"><button class="delete-btn" data-delete="feature" type="button" aria-label="Delete feature" title="Delete feature">${deleteIcon}</button>
          <span class="feature-progress">${percentage}%</span>
          <h2 class="release-title">${escapeHtml(feature.title)}</h2>
          ${feature.version ? `<p class="release-version">v${escapeHtml(feature.version)}</p>` : ""}
        </div>${feature.dates.length ? `<div class="release-meta"><ul class="release-dates">${feature.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul></div>` : ""}</header>
        ${feature.notes.length ? `<div class="feature-notes task-notes">${notesMarkup(feature.notes)}</div>` : ""}
        <div class="board">${feature.tasks.map((task, taskIndex) => {
          const taskTodos = todos(task);
          const done = taskTodos.filter(todo => todo.checked).length;
          const taskComplete = taskTodos.length > 0 && done === taskTodos.length;
          const taskInProgress = done > 0 && !taskComplete;
          return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}" data-task="${taskIndex}" tabindex="0" aria-expanded="${taskTodos.length ? "false" : "true"}">
            <header class="card-header"><h3 class="card-title">${escapeHtml(task.title)}</h3><span class="task-status">${taskComplete ? '<span class="task-check" title="Complete" aria-label="Complete">✓</span>' : ""}<span class="task-progress">${done}/${taskTodos.length}</span></span><button class="delete-btn" data-delete="task" type="button" aria-label="Delete task" title="Delete task">${deleteIcon}</button></header>
            <div class="card-body"${taskTodos.length ? " hidden" : ""}>${taskBody(task)}</div>
          </section>`;
        }).join("")}</div>
      </section>`;
    }).join("");
    restoreViewState(viewState);
    equalizeReleaseHeaders();
    layoutGrid();
  }

  function showStart(entries) {
    document.getElementById("viewerControls").hidden = true;
    document.getElementById("historyControls").hidden = true;
    document.getElementById("appVersion").hidden = false;
    document.getElementById("projectStats").hidden = true;
    document.getElementById("watermark").hidden = false;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle"><h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `<div class="recent-file"><button class="recent-file-open" data-recent="${index}" type="button"><span class="recent-file-name">${escapeHtml(entry.name)}</span><time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${new Date(entry.openedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</time></button><div class="recent-file-actions"><button class="recent-delete" data-remove-recent="${index}" type="button" aria-label="Remove ${escapeHtml(entry.name)} from recent files" title="Remove from recent files">${deleteIcon}</button></div></div>`).join("") : '<p class="recent-files-empty">No recent files</p>'}</div>
      </section></div>`;
  }

  window.addEventListener("resize", () => { equalizeReleaseHeaders(); layoutGrid(true); });
  app.render = { project: render, start: showStart, escapeHtml, equalizeReleaseHeaders, layoutGrid };
})(window.MDManager);
