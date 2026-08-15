window.MDManager = window.MDManager || {};

(function (app) {
  /** @type {Record<MDSearchKind, number>} */
  const kindWeight = { feature: 0, task: 1, group: 2, todo: 3, note: 4, text: 5 };
  /** @type {Record<MDSearchLocation, number>} */
  const locationWeight = { workspace: 0, backlog: 1, archive: 2 };
  const wordBoundary = new Set([" ", "-", "_", "/", ".", ",", "(", "[", ":"].map(character => character.charCodeAt(0)));

  // Inline Markdown is stripped once at index time. Searching the raw source would let
  // the markers sit between the characters the user types, which destroys the
  // contiguity bonus and shifts every highlight position.
  // Most titles and todos carry no inline markup at all, so one character test skips the
  // whole replace chain for them. At index scale that is thousands of regex passes.
  // The backtick is escaped so this stays a plain regex literal: an unescaped one makes
  // the architecture checker's TypeScript scanner read the rest of the file as a
  // template literal.
  const inlineMarkers = /[\u0060*_~[]/;

  /** @param {string} value */
  function plainText(value) {
    if (!inlineMarkers.test(value)) return value.trim();
    return value
      .replace(/`([^`]*)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/~([^~]+)~/g, "$1")
      .trim();
  }

  // Lowercasing can change a string's length for a few characters. When it does, the
  // match positions would no longer address the displayed text, so that item keeps its
  // original casing and simply matches case-sensitively.
  /** @param {string} text */
  function foldCase(text) {
    const lower = text.toLowerCase();
    return lower.length === text.length ? lower : text;
  }

  /** @param {Array<{checked: boolean}>} todos @returns {MDSearchState} */
  function progressState(todos) {
    if (!todos.length) return "open";
    const done = todos.filter(todo => todo.checked).length;
    if (done === todos.length) return "done";
    return done > 0 ? "active" : "open";
  }

  /**
   * @param {MDSearchKind} kind @param {MDSearchBadge} badge @param {string} source
   * @param {Omit<MDSearchItem, "kind" | "badge" | "text" | "lower">} rest
   * @returns {MDSearchItem | null}
   */
  function item(kind, badge, source, rest) {
    const text = plainText(source);
    if (!text) return null;
    return { kind, badge, text, lower: foldCase(text), ...rest };
  }

  /**
   * Builds the searchable index. `taskContent` is passed in rather than imported so this
   * layer stays free of the IO layer, matching how `domain/status.js` takes its entry
   * accessor.
   * @param {MDProject} project
   * @param {(task: MDTask) => MDTaskContent} taskContent
   * @returns {MDSearchIndex}
   */
  function index(project, taskContent) {
    /** @type {MDSearchItem[]} */
    const items = [];
    /** @param {MDSearchItem | null} entry */
    const add = entry => { if (entry) items.push(entry); };

    project.features.forEach((feature, featureIndex) => {
      if (feature.ignored) return;
      /** @type {MDSearchLocation} */
      const location = feature.isBacklog ? "backlog" : feature.isArchived ? "archive" : "workspace";
      const tasks = feature.tasks.filter(task => !task.ignored);
      /** @type {Omit<MDSearchItem, "kind" | "badge" | "text" | "lower">} */
      const featureAnchor = { featureIndex, taskIndex: -1, taskPosition: -1, noteType: "", itemIndex: -1, lineIndex: -1, location, state: "", breadcrumb: [] };

      add(item("feature", "feature", feature.title, {
        ...featureAnchor,
        state: progressState(tasks.flatMap(task => taskContent(task).todos))
      }));

      for (const note of feature.notes) {
        const noteType = /** @type {MDSearchNoteType} */ (note.noteType || note.type);
        if (noteType !== "info" && noteType !== "warn") continue;
        note.items.forEach((noteItem, itemIndex) => {
          add(item("note", noteType, noteItem.text, { ...featureAnchor, noteType, itemIndex, breadcrumb: [feature.title] }));
        });
      }

      tasks.forEach((task, taskPosition) => {
        const taskIndex = feature.tasks.indexOf(task);
        const content = taskContent(task);
        /** @type {Omit<MDSearchItem, "kind" | "badge" | "text" | "lower">} */
        const taskAnchor = { featureIndex, taskIndex, taskPosition, noteType: "", itemIndex: -1, lineIndex: -1, location, state: "", breadcrumb: [feature.title, task.title] };

        add(item("task", "task", task.title, {
          ...taskAnchor,
          state: progressState(content.todos),
          breadcrumb: [feature.title]
        }));

        // Ordinals address the rendered DOM, so they must be counted in the same order
        // `ui/render.js` emits the elements: blocks in order, and within a group its
        // sections in order with descriptions before todos.
        let paragraphIndex = 0;
        let groupIndex = 0;
        for (const block of content.blocks) {
          if (block.type === "note") {
            const noteType = /** @type {MDSearchNoteType} */ (block.noteType);
            if (noteType !== "info" && noteType !== "warn") continue;
            block.items.forEach((noteItem, itemIndex) => {
              add(item("note", noteType, noteItem.text, { ...taskAnchor, noteType, itemIndex }));
            });
            continue;
          }
          if (block.type === "paragraph") {
            add(item("text", "text", block.text, { ...taskAnchor, itemIndex: paragraphIndex++ }));
            continue;
          }
          if (block.title) {
            // `ui/render.js` emits a `.todo-separator` for exactly the titled groups, in
            // block order, so this ordinal addresses the rendered heading.
            add(item("group", "group", block.title, { ...taskAnchor, itemIndex: groupIndex, state: progressState(block.todos) }));
            groupIndex++;
          }
          for (const section of block.sections) {
            for (const description of section.descriptions) {
              add(item("text", "text", description.text, {
                ...taskAnchor,
                itemIndex: paragraphIndex++,
                breadcrumb: block.title ? [feature.title, task.title, block.title] : taskAnchor.breadcrumb
              }));
            }
            for (const todo of section.todos) {
              add(item("todo", "todo", todo.text, {
                ...taskAnchor,
                lineIndex: todo.lineIndex,
                state: todo.checked ? "done" : "open",
                breadcrumb: block.title ? [feature.title, task.title, block.title] : taskAnchor.breadcrumb
              }));
            }
          }
        }
      });
    });

    return { items, narrow: null };
  }

  /**
   * Greedy left-to-right match, then a backward pass that pulls every position as late
   * as the window allows. Without the second pass "ab" in "a-x-ab" would score as two
   * scattered characters instead of the adjacent pair it actually is.
   * @param {string} haystack @param {string} needle @param {string} original
   * @returns {{score: number, positions: number[]} | null}
   */
  function score(haystack, needle, original) {
    const positions = new Array(needle.length);
    let cursor = 0;
    for (let index = 0; index < needle.length; index++) {
      const code = needle.charCodeAt(index);
      while (cursor < haystack.length && haystack.charCodeAt(cursor) !== code) cursor++;
      if (cursor === haystack.length) return null;
      positions[index] = cursor;
      cursor++;
    }
    let tail = positions[needle.length - 1];
    for (let index = needle.length - 1; index >= 0; index--) {
      const code = needle.charCodeAt(index);
      while (haystack.charCodeAt(tail) !== code) tail--;
      positions[index] = tail;
      tail--;
    }

    let total = 0;
    let previous = -2;
    for (let index = 0; index < needle.length; index++) {
      const position = positions[index];
      total += 16;
      // A solid run must outrank the same letters spread across word starts. With equal
      // bonuses "f o r m a t" ties "the format label", because every scattered letter
      // also sits on a boundary.
      if (position === previous + 1) total += 16;
      if (position === 0 || wordBoundary.has(haystack.charCodeAt(position - 1))) total += 8;
      const character = original.charCodeAt(position);
      if (character >= 65 && character <= 90) total += 4;
      previous = position;
    }
    return { score: total - positions[0] - (haystack.length - needle.length) * 0.05, positions };
  }

  /** @param {MDSearchResult} left @param {MDSearchResult} right */
  function compare(left, right) {
    if (left.score !== right.score) return right.score - left.score;
    if (left.item.text.length !== right.item.text.length) return left.item.text.length - right.item.text.length;
    const kinds = kindWeight[left.item.kind] - kindWeight[right.item.kind];
    if (kinds) return kinds;
    return locationWeight[left.item.location] - locationWeight[right.item.location];
  }

  /**
   * @param {MDSearchIndex} searchIndex @param {string} text @param {number} [limit]
   * @returns {{results: MDSearchResult[], total: number}}
   */
  function query(searchIndex, text, limit = 50) {
    const raw = text.trim();
    if (!raw) {
      searchIndex.narrow = null;
      return { results: [], total: 0 };
    }
    // Smart case, as in fzf and ripgrep: an all-lowercase query ignores case, any
    // uppercase character makes the whole query case-sensitive.
    const sensitive = raw !== raw.toLowerCase();
    const needle = sensitive ? raw : foldCase(raw);

    // Subsequence matching is monotone, so extending a query can only remove matches.
    // Rescoring the previous survivors is therefore exact, not an approximation.
    const reuse = searchIndex.narrow && raw.startsWith(searchIndex.narrow.query) ? searchIndex.narrow.items : searchIndex.items;

    /** @type {MDSearchItem[]} */
    const matched = [];
    /** @type {MDSearchResult[]} */
    const results = [];
    let floor = Number.NEGATIVE_INFINITY;
    for (const entry of reuse) {
      const haystack = sensitive ? entry.text : entry.lower;
      const scored = score(haystack, needle, entry.text);
      if (!scored) continue;
      matched.push(entry);
      if (results.length === limit && scored.score <= floor) continue;
      /** @type {MDSearchResult} */
      const result = { item: entry, score: scored.score, positions: scored.positions };
      let position = results.length;
      while (position > 0 && compare(results[position - 1], result) > 0) position--;
      results.splice(position, 0, result);
      if (results.length > limit) results.pop();
      if (results.length === limit) floor = results[limit - 1].score;
    }

    searchIndex.narrow = { query: raw, items: matched };
    return { results, total: matched.length };
  }

  app.search = { index, query, plainText };
})(window.MDManager);
