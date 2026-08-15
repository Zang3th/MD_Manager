window.MDManager = window.MDManager || {};

(function (app) {
  const resultLimit = 50;
  const highlightDuration = 1200;
  /** @type {Record<MDSearchBadge, string>} */
  const badgeLabels = { feature: "Feature", task: "Task", group: "Group", todo: "ToDo", info: "Info", warn: "Warn", text: "Text" };
  /** @type {Record<MDSearchState, string>} */
  const stateLabels = { done: "done", active: "in progress", open: "open", "": "" };
  /** @type {Record<MDSearchLocation, string>} */
  const locationLabels = { workspace: "", backlog: "Backlog", archive: "Archive" };

  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("searchPalette"));
  const input = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
  const list = document.getElementById("searchResults");
  const summary = document.getElementById("searchSummary");

  /** @type {MDProject | null} */
  let project = null;
  /** @type {MDSearchIndex | null} */
  let searchIndex = null;
  /** @type {MDSearchResult[]} */
  let results = [];
  let total = 0;
  let selected = 0;
  /** @type {Element | null} */
  let highlighted = null;
  let highlightTimer = 0;
  /** @type {Element | null} */
  let opener = null;

  /** @param {string} value */
  function escapeHtml(value) {
    return value.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character] || character);
  }

  /** @param {string} text @param {number[]} positions */
  function highlightMarkup(text, positions) {
    const marked = new Set(positions);
    let markup = "";
    let cursor = 0;
    while (cursor < text.length) {
      const inside = marked.has(cursor);
      let end = cursor;
      while (end < text.length && marked.has(end) === inside) end++;
      const chunk = escapeHtml(text.slice(cursor, end));
      markup += inside ? `<mark>${chunk}</mark>` : chunk;
      cursor = end;
    }
    return markup;
  }

  /** @param {MDSearchItem} item */
  function accessibleName(item) {
    const parts = [badgeLabels[item.badge]];
    if (item.state) parts.push(stateLabels[item.state]);
    parts.push(item.text);
    if (item.breadcrumb.length) parts.push(`in ${item.breadcrumb.join(", ")}`);
    if (locationLabels[item.location]) parts.push(locationLabels[item.location]);
    return parts.join(", ");
  }

  /** @param {MDSearchResult} result @param {number} index */
  function resultMarkup(result, index) {
    const item = result.item;
    const location = locationLabels[item.location];
    return `<div class="search-result" role="option" id="searchResult-${index}" data-index="${index}" data-state="${item.state}" aria-selected="false" aria-label="${escapeHtml(accessibleName(item))}">
      <span class="search-caret" aria-hidden="true">&gt;</span>
      <span class="search-badge" data-badge="${item.badge}">${badgeLabels[item.badge]}</span>
      <span class="search-body">
        <span class="search-title"><span class="search-state" aria-hidden="true"></span><span class="search-text">${highlightMarkup(item.text, result.positions)}</span></span>
        ${item.breadcrumb.length ? `<span class="search-breadcrumb">${escapeHtml(item.breadcrumb.join(" / "))}</span>` : ""}
      </span>
      ${location ? `<span class="search-pill" data-location="${item.location}">${location}</span>` : ""}
    </div>`;
  }

  /** @param {string} text @param {string} label */
  function setCount(text, label) {
    summary.textContent = text;
    if (label) summary.setAttribute("aria-label", label);
    else summary.removeAttribute("aria-label");
  }

  function renderResults() {
    if (!input.value.trim()) {
      // The placeholder already says what can be searched, so the empty body shows the
      // badge vocabulary instead of repeating that sentence in prose.
      list.innerHTML = `<div class="search-scope" aria-hidden="true">${Object.entries(badgeLabels)
        .map(([badge, label]) => `<span class="search-badge" data-badge="${badge}">${label}</span>`).join("")}</div>`;
      setCount("", "");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }
    if (!results.length) {
      list.innerHTML = '<p class="search-empty">No matches.</p>';
      setCount("0/0", "No matches");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }
    list.innerHTML = results.map(resultMarkup).join("");
    setCount(`${results.length}/${total}`, total > results.length ? `${results.length} of ${total} matches` : `${total} ${total === 1 ? "match" : "matches"}`);
    input.setAttribute("aria-expanded", "true");
    applySelection();
  }

  function applySelection() {
    const rows = list.querySelectorAll(".search-result");
    rows.forEach((row, index) => {
      const active = index === selected;
      row.classList.toggle("is-selected", active);
      row.setAttribute("aria-selected", String(active));
    });
    const active = rows[selected];
    if (!active) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  /** @param {number} step */
  function moveSelection(step) {
    if (!results.length) return;
    selected = (selected + step + results.length) % results.length;
    applySelection();
  }

  function runQuery() {
    if (!searchIndex) {
      results = [];
      total = 0;
      renderResults();
      return;
    }
    const outcome = app.search.query(searchIndex, input.value, resultLimit);
    results = outcome.results;
    total = outcome.total;
    selected = 0;
    renderResults();
  }

  // Resolution uses only the classes `ui/render.js` already emits, so the search feature
  // adds no markup of its own. The activation browser tests are what keep this contract
  // honest if that markup ever changes.
  /** @param {MDSearchItem} item */
  function featureRoot(item) {
    if (item.location === "archive") return document.querySelector(`#archive .archive-feature[data-feature="${item.featureIndex}"]`);
    if (item.location === "backlog") {
      const backlog = document.getElementById("backlog");
      return backlog.dataset.feature === String(item.featureIndex) ? backlog : null;
    }
    return document.querySelector(`#content > .release[data-feature="${item.featureIndex}"]`);
  }

  /** @param {Element} root @param {MDSearchItem} item */
  function taskRoot(root, item) {
    return item.taskIndex < 0 ? null : root.querySelector(`.card[data-task="${item.taskIndex}"]`);
  }

  /** @param {Element} section @param {number} itemIndex */
  function noteItem(section, itemIndex) {
    return section.querySelectorAll("p, li > span")[itemIndex] || null;
  }

  /** @param {Element} root @param {MDSearchItem} item @returns {Element | null} */
  function workspaceTarget(root, item) {
    if (item.kind === "feature") return root;
    if (item.kind === "note" && item.taskIndex < 0) {
      const section = root.querySelector(`.feature-notes .task-note.task-${item.noteType}`);
      return section ? noteItem(section, item.itemIndex) : null;
    }
    const card = taskRoot(root, item);
    if (!card) return null;
    if (item.kind === "task") return card;
    if (item.kind === "note") {
      const section = card.querySelector(`.task-notes .task-note.task-${item.noteType}`);
      return section ? noteItem(section, item.itemIndex) : null;
    }
    if (item.kind === "todo") return card.querySelector(`.todo-item[data-line="${item.lineIndex}"]`);
    if (item.kind === "group") return card.querySelectorAll(".task-blocks .todo-separator")[item.itemIndex] || null;
    return card.querySelectorAll(".task-blocks p")[item.itemIndex] || null;
  }

  /** @param {Element} root @param {MDSearchItem} item */
  function expandFor(root, item) {
    if (item.kind === "note" && item.taskIndex < 0) {
      const section = root.querySelector(`.feature-notes .task-note.task-${item.noteType}`);
      if (section) {
        section.classList.remove("collapsed");
        section.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const card = taskRoot(root, item);
    if (!card || card.classList.contains("bodyless-task")) return;
    card.setAttribute("aria-expanded", "true");
    const body = card.querySelector(".card-body");
    if (body) body.hidden = false;
  }

  /** @param {Element | null} target */
  function markTarget(target) {
    window.clearTimeout(highlightTimer);
    highlighted?.classList.remove("search-hit");
    highlighted = target;
    if (!target) return;
    target.classList.add("search-hit");
    highlightTimer = window.setTimeout(() => {
      target.classList.remove("search-hit");
      if (highlighted === target) highlighted = null;
    }, highlightDuration);
  }

  /** @param {Element} root */
  function revealArchived(root) {
    const toggle = root.querySelector(".archive-feature-toggle");
    if (toggle && toggle.getAttribute("aria-expanded") !== "true") /** @type {HTMLElement} */ (toggle).click();
  }

  /** @param {MDSearchItem} item */
  function reveal(item) {
    const root = featureRoot(item);
    if (!root) return;
    const behavior = app.interactions.navigation.reducedMotion() ? "auto" : "smooth";

    if (item.location === "archive") {
      revealArchived(root);
      const target = item.kind === "feature" ? root : root.querySelectorAll(".archive-tasks li")[item.taskPosition] || null;
      (target || root).scrollIntoView({ behavior, block: "center" });
      markTarget(target);
      return;
    }

    expandFor(root, item);
    app.layout.contentOverflowChanged();
    if (item.location === "workspace") app.interactions.navigation.centerFeature(root);
    const target = workspaceTarget(root, item);
    // An unresolved target still scrolls its feature into view, but must not be painted:
    // framing the whole column instead of the item is worse than showing no frame.
    if (target && target !== root) target.scrollIntoView({ behavior, block: "center" });
    markTarget(target);
  }

  /** @param {number} index */
  function activate(index) {
    const result = results[index];
    if (!result) return;
    const item = result.item;
    close();
    const navigation = app.interactions.navigation;
    if (item.location === "archive") navigation.setView("archive");
    else {
      navigation.setView("workspace");
      if (item.location === "backlog") navigation.openBacklog();
    }
    requestAnimationFrame(() => reveal(item));
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function open() {
    if (!project || dialog.open || document.querySelector("dialog[open]")) return;
    opener = document.activeElement instanceof Element ? document.activeElement : null;
    if (!searchIndex) searchIndex = app.search.index(project, app.render.taskContent);
    input.value = "";
    results = [];
    total = 0;
    selected = 0;
    dialog.showModal();
    renderResults();
    input.focus();
  }

  input.addEventListener("input", runQuery);
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activate(selected);
    }
  });

  list.addEventListener("mousemove", event => {
    const row = event.target instanceof Element ? event.target.closest(".search-result") : null;
    if (!(row instanceof HTMLElement)) return;
    const index = Number(row.dataset.index);
    if (index === selected) return;
    selected = index;
    applySelection();
  });
  list.addEventListener("click", event => {
    const row = event.target instanceof Element ? event.target.closest(".search-result") : null;
    if (!(row instanceof HTMLElement)) return;
    activate(Number(row.dataset.index));
  });

  dialog.addEventListener("click", event => {
    if (event.target instanceof Element && !event.target.closest(".search-panel")) close();
  });
  dialog.addEventListener("close", () => {
    // The browser restores dialog focus after this event, so the blur has to happen on
    // the next frame. Focus left inside the closed dialog still counts as a text field,
    // and the next F would be swallowed as typing instead of reopening the palette.
    const target = opener instanceof HTMLElement && opener.isConnected && opener !== input ? opener : null;
    opener = null;
    requestAnimationFrame(() => {
      if (target) target.focus();
      if (document.activeElement === input) input.blur();
    });
  });

  app.searchPalette = {
    open,
    close,
    // Targeted updates that deliberately skip a full render must still drop the index,
    // or a result keeps reporting the state the todo had before it was toggled.
    invalidate() {
      searchIndex = null;
      if (dialog.open) runQuery();
    },
    /** @param {MDProject | null} next */
    setProject(next) {
      project = next;
      searchIndex = null;
      if (dialog.open) runQuery();
    }
  };
})(window.MDManager);
