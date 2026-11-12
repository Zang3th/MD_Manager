import { markdown, search } from "@zang3th/md-libs/core";

window.MDManager = window.MDManager || {};

(function (app) {
  /** @type {Record<MDSearchKind, number>} */
  const kindWeight = { feature: 0, task: 1, group: 2, todo: 3, note: 4, text: 5 };
  /** @type {Record<MDSearchLocation, number>} */
  const locationWeight = { workspace: 0, backlog: 1, archive: 2 };

  // Inline Markdown is stripped once at index time. Searching the raw source would let the markers sit
  // between the characters the user types, which destroys the contiguity bonus and shifts every highlight.
  // Matching, ranking and narrowing are MD_Libs core/search; this module builds the index of a project.

  /** @param {Array<{checked: boolean}>} todos @returns {MDSearchState} */
  function progressState(todos) {
    if (!todos.length) return "open";
    const done = todos.filter(todo => todo.checked).length;
    if (done === todos.length) return "done";
    return done > 0 ? "active" : "open";
  }

  /**
   * @param {MDSearchKind} kind @param {MDSearchBadge} badge @param {string} source
   * @param {Omit<MDSearchItem, "kind" | "badge" | "text">} rest
   * @returns {MDSearchItem | null}
   */
  function item(kind, badge, source, rest) {
    const text = markdown.plainText(source);
    if (!text) return null;
    return { kind, badge, text, ...rest };
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
      const place = feature.isBacklog ? "backlog" : feature.isArchived ? "archive" : "workspace";
      const tasks = feature.tasks.filter(task => !task.ignored);
      /** @type {Omit<MDSearchItem, "kind" | "badge" | "text">} */
      const featureAnchor = { featureIndex, taskIndex: -1, taskPosition: -1, noteType: "", itemIndex: -1, lineIndex: -1, location: place, state: "", breadcrumb: [] };

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
        /** @type {Omit<MDSearchItem, "kind" | "badge" | "text">} */
        const taskAnchor = { featureIndex, taskIndex, taskPosition, noteType: "", itemIndex: -1, lineIndex: -1, location: place, state: "", breadcrumb: [feature.title, task.title] };

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

    return search.create({ items, fields: [{ get: entry => entry.text }], tieBreak });
  }

  /** Equal scores of equally long texts prefer the kind, then the location. @param {MDSearchItem} left @param {MDSearchItem} right */
  function tieBreak(left, right) {
    return (kindWeight[left.kind] - kindWeight[right.kind]) || (locationWeight[left.location] - locationWeight[right.location]);
  }

  /**
   * @param {MDSearchIndex} searchIndex @param {string} text @param {number} [limit]
   * @returns {{results: MDSearchResult[], total: number}}
   */
  function query(searchIndex, text, limit = 50) {
    return searchIndex.query(text, { limit });
  }

  app.search = { index, query };
})(window.MDManager);
