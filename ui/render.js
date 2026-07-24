window.MDManager = window.MDManager || {};

(function (app) {
  let gridContentKey = "";
  const deleteIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>';

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
      const listItem = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (listItem) {
        if (note) note.items.push(listItem[2]);
        else {
          const checked = listItem[1]?.toLowerCase() === "x" || /^~.*~$/.test(listItem[2]);
          const todo = { type: "todo", lineIndex, checked, text: listItem[2].replace(/^~(.*)~$/, "$1") };
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

  function taskBody(task) {
    const content = taskContent(task);
    const notes = content.blocks.filter(block => block.type === "note");
    return `${notes.length ? `<div class="task-notes">${notes.map(note => `<section class="task-note task-${note.noteType}"><h4>${note.noteType === "warn" ? "Warn" : "Info"}</h4><ul>${note.items.map(text => `<li>${inlineMarkdown(text)}</li>`).join("")}</ul></section>`).join("")}</div>` : ""}
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
      content.style.setProperty("--grid-card-width", `${Math.min(Math.max(208, ...widths), content.clientWidth)}px`);
      gridContentKey = contentKey;
      equalizeReleaseHeaders();
    });
  }

  function render(project, viewState) {
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("historyControls").hidden = false;
    document.getElementById("watermark").hidden = true;
    document.getElementById("projectTitle").textContent = project.title;
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
        <div class="board">${feature.tasks.map((task, taskIndex) => {
          const taskTodos = todos(task);
          const done = taskTodos.filter(todo => todo.checked).length;
          const taskComplete = taskTodos.length > 0 && done === taskTodos.length;
          const taskInProgress = done > 0 && !taskComplete;
          return `<section class="card${taskComplete ? " complete" : ""}${taskInProgress ? " in-progress" : ""}${taskTodos.length ? "" : " empty-task"}" data-task="${taskIndex}" tabindex="0" aria-expanded="${taskTodos.length ? "false" : "true"}">
            <header class="card-header">${taskComplete ? '<span class="task-check" title="Complete" aria-label="Complete">✓</span>' : ""}<h3 class="card-title">${escapeHtml(task.title)}</h3><span class="task-progress">${done}/${taskTodos.length}</span><button class="delete-btn" data-delete="task" type="button" aria-label="Delete task" title="Delete task">${deleteIcon}</button></header>
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
    document.getElementById("watermark").hidden = false;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle"><h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `<button class="recent-file" data-recent="${index}" type="button"><span class="recent-file-name">${escapeHtml(entry.name)}</span><time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${new Date(entry.openedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</time></button>`).join("") : '<p class="recent-files-empty">No recent files</p>'}</div>
      </section></div>`;
  }

  window.addEventListener("resize", () => { equalizeReleaseHeaders(); layoutGrid(true); });
  app.render = { project: render, start: showStart, escapeHtml, equalizeReleaseHeaders, layoutGrid };
})(window.MDManager);
