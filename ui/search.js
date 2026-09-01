window.MDManager = window.MDManager || {};

(function (app) {
  const resultLimit = 50;
  const excerptLimit = 88;
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
  /** @type {Element[]} */
  let resultRows = [];
  /** @type {Element | null} */
  let selectedRow = null;
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

  /**
   * Keeps the densest run of subsequence matches visible instead of assuming the first
   * matched character explains the result. The full item text remains the accessible
   * name and activation source.
   * @param {string} text @param {number[]} positions
   * @returns {{text: string, positions: number[]}}
   */
  function matchedExcerpt(text, positions) {
    if (text.length <= excerptLimit || !positions.length) return { text, positions };

    const windowLength = excerptLimit - 2;
    let left = 0;
    let bestLeft = 0;
    let bestRight = 0;
    for (let right = 0; right < positions.length; right++) {
      while (positions[right] - positions[left] >= windowLength) left++;
      if (right - left > bestRight - bestLeft) {
        bestLeft = left;
        bestRight = right;
      }
    }

    const matchStart = positions[bestLeft];
    const matchEnd = positions[bestRight] + 1;
    const context = windowLength - (matchEnd - matchStart);
    const start = Math.max(0, Math.min(matchStart - Math.floor(context * 0.4), text.length - windowLength));
    const end = Math.min(text.length, start + windowLength);
    const leading = start ? "…" : "";
    const trailing = end < text.length ? "…" : "";
    return {
      text: `${leading}${text.slice(start, end)}${trailing}`,
      positions: positions.filter(position => position >= start && position < end).map(position => position - start + leading.length)
    };
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
    const excerpt = matchedExcerpt(item.text, result.positions);
    return `<div class="search-result" role="option" id="searchResult-${index}" data-index="${index}" data-state="${item.state}" aria-selected="false" aria-label="${escapeHtml(accessibleName(item))}">
      <span class="search-body">
        <span class="search-title"><span class="search-state" aria-hidden="true"></span><span class="search-text">${highlightMarkup(excerpt.text, excerpt.positions)}</span></span>
        ${item.breadcrumb.length ? `<span class="search-breadcrumb">${escapeHtml(item.breadcrumb.join(" / "))}</span>` : ""}
      </span>
      <span class="search-badge" data-badge="${item.badge}">${badgeLabels[item.badge]}</span>
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
    resultRows = [];
    selectedRow = null;
    list.scrollTop = 0;
    if (!input.value.trim()) {
      list.innerHTML = `<div class="search-empty-state" aria-hidden="true">
        <strong class="search-empty-title">Search the entire project</strong>
        <span class="search-empty-copy">Find features, tasks, notes, and todos.</span>
      </div>`;
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
    resultRows = Array.from(list.querySelectorAll(".search-result"));
    setCount(`${results.length}/${total}`, total > results.length ? `${results.length} of ${total} matches` : `${total} ${total === 1 ? "match" : "matches"}`);
    input.setAttribute("aria-expanded", "true");
    applySelection(false);
  }

  /** @param {boolean} ensureVisible */
  function applySelection(ensureVisible) {
    const active = resultRows[selected];
    if (!active) {
      selectedRow = null;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    if (selectedRow !== active) {
      if (selectedRow) {
        selectedRow.classList.remove("is-selected");
        selectedRow.setAttribute("aria-selected", "false");
      }
      active.classList.add("is-selected");
      active.setAttribute("aria-selected", "true");
      selectedRow = active;
    }
    if (input.getAttribute("aria-activedescendant") !== active.id) input.setAttribute("aria-activedescendant", active.id);
    if (ensureVisible) active.scrollIntoView({ block: "nearest" });
  }

  /** @param {number} step */
  function moveSelection(step) {
    if (!results.length) return;
    selected = (selected + step + results.length) % results.length;
    applySelection(true);
  }

  function runQuery() {
    if (!searchIndex && project) searchIndex = app.search.index(project, app.render.taskContent);
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

  /** @param {Element} root @returns {Element | null} */
  function revealArchived(root) {
    const featureIndex = root.getAttribute("data-feature");
    const openPopover = document.querySelector(`#archive .archive-feature-popover:not([hidden])[data-feature="${featureIndex}"]`);
    if (openPopover) return openPopover;
    const toggle = root.querySelector(".archive-feature-toggle");
    if (toggle) /** @type {HTMLElement} */ (toggle).click();
    return document.querySelector(`#archive .archive-feature-popover:not([hidden])[data-feature="${featureIndex}"]`);
  }

  /** @param {MDSearchItem} item */
  function reveal(item) {
    const root = featureRoot(item);
    if (!root) return;
    const behavior = app.interactions.navigation.reducedMotion() ? "auto" : "smooth";

    if (item.location === "archive") {
      root.scrollIntoView({ behavior, block: "center" });
      const details = revealArchived(root);
      const target = item.kind === "feature" ? root : details?.querySelectorAll(".archive-popover-tasks li")[item.taskPosition] || null;
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
    applySelection(false);
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
