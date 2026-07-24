window.MDManager = window.MDManager || {};

(function (app) {
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

  function todos(card) {
    return card.lines.map((line, lineIndex) => {
      const match = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      return match ? { lineIndex, checked: match[1]?.toLowerCase() === "x", text: match[2] } : null;
    }).filter(Boolean);
  }

  function cardBody(card) {
    const parts = [];
    let listOpen = false;
    for (let lineIndex = 0; lineIndex < card.lines.length; lineIndex++) {
      const line = card.lines[lineIndex];
      const match = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (match) {
        if (!listOpen) parts.push("<ul>");
        listOpen = true;
        const checked = match[1]?.toLowerCase() === "x";
        parts.push(`<li><button class="checkbox${checked ? " checked" : ""}" data-line="${lineIndex}" type="button">${checked ? "☑" : "☐"}</button><span>${inlineMarkdown(match[2])}</span></li>`);
      } else {
        if (listOpen) parts.push("</ul>");
        listOpen = false;
        if (line.trim()) parts.push(`<p>${inlineMarkdown(line.trim())}</p>`);
      }
    }
    if (listOpen) parts.push("</ul>");
    return parts.join("");
  }

  function render(project) {
    document.getElementById("viewerControls").hidden = false;
    document.getElementById("historyControls").hidden = false;
    document.getElementById("projectTitle").textContent = project.title;
    document.title = `${project.title} – MD_Manager`;
    const content = document.getElementById("content");
    if (!project.releases.length) {
      content.innerHTML = '<div class="empty">No releases found. At least one level <code>##</code> heading is required.</div>';
      return;
    }

    content.innerHTML = project.releases.map((release, releaseIndex) => {
      const releaseTodos = release.features.flatMap(feature => feature.cards.flatMap(todos));
      const complete = releaseTodos.length && releaseTodos.every(todo => todo.checked);
      return `<section class="release" data-release="${releaseIndex}">
        <header class="release-header" tabindex="0"><div class="release-heading">
          ${complete ? '<span class="release-check">✓</span>' : ""}
          <h2 class="release-title">${escapeHtml(release.title)}</h2>
          ${release.version ? `<p class="release-version">v${escapeHtml(release.version)}</p>` : ""}
        </div>${release.dates.length ? `<div class="release-meta"><ul class="release-dates">${release.dates.map(date => `<li>${escapeHtml(date.from)}${date.to ? ` – ${escapeHtml(date.to)}` : ""}</li>`).join("")}</ul></div>` : ""}</header>
        <div class="board">${release.features.map((feature, featureIndex) => {
          const featureTodos = feature.cards.flatMap(todos);
          const done = featureTodos.filter(todo => todo.checked).length;
          return `<article class="column collapsed${featureTodos.length && done === featureTodos.length ? " complete" : ""}" data-feature="${featureIndex}">
            <header class="column-header" tabindex="0"><h3 class="column-title">${escapeHtml(feature.title)}</h3><span class="feature-progress">${featureTodos.length ? Math.round(done / featureTodos.length * 100) : 0}%</span></header>
            <div class="card-list">${feature.cards.map((card, cardIndex) => {
              const cardTodos = todos(card);
              const completed = cardTodos.filter(todo => todo.checked).length;
              return `<section class="card${cardTodos.length && completed === cardTodos.length ? " complete" : ""}" data-card="${cardIndex}" tabindex="0" aria-expanded="false">
                <header class="card-header"><h4 class="card-title">${escapeHtml(card.title)}</h4><span class="task-progress">${completed}/${cardTodos.length}</span></header>
                <div class="card-body" hidden>${cardBody(card)}</div>
              </section>`;
            }).join("")}</div>
          </article>`;
        }).join("")}</div>
      </section>`;
    }).join("");
  }

  function showStart(entries) {
    document.getElementById("viewerControls").hidden = true;
    document.getElementById("historyControls").hidden = true;
    document.getElementById("content").innerHTML = `<div class="empty start-screen">
      <section class="recent-files" aria-labelledby="recentFilesTitle">
        <h2 id="recentFilesTitle">Recent files</h2>
        <div class="recent-files-list">${entries.length ? entries.map((entry, index) => `
          <button class="recent-file" data-recent="${index}" type="button">
            <span class="recent-file-name">${escapeHtml(entry.name)}</span>
            <time class="recent-file-time" datetime="${new Date(entry.openedAt).toISOString()}">${new Date(entry.openedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</time>
          </button>`).join("") : '<p class="recent-files-empty">No recent files</p>'}</div>
      </section>
    </div>`;
  }

  app.render = { project: render, start: showStart, escapeHtml };
})(window.MDManager);
