window.MDManager = window.MDManager || {};

(function (app) {
  /** @template T @param {T[]} items @param {number} fromIndex @param {number} toIndex */
  function moveItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
  }

  app.domain = {
    /** @param {MDProject} project @param {number} featureIndex @param {string} title @param {MDFeature} metadata */
    updateFeature(project, featureIndex, title, metadata) {
      const feature = project.features[featureIndex];
      feature.title = title;
      feature.headerLines = metadata.headerLines.slice();
      feature.version = metadata.version;
      feature.dates = metadata.dates.map(date => ({ ...date }));
      feature.notes = metadata.notes.map(note => ({ ...note, items: note.items.map(item => ({ ...item })) }));
    },
    /** @param {MDProject} project @param {number} featureIndex @param {number} taskIndex @param {{title: string, lines: string[]}} draft */
    updateTask(project, featureIndex, taskIndex, draft) {
      const task = project.features[featureIndex].tasks[taskIndex];
      task.title = draft.title;
      task.lines = draft.lines.slice();
    },
    /** @param {MDProject} project @param {number} fromIndex @param {number} toIndex */
    moveFeature(project, fromIndex, toIndex) {
      if (project.features[fromIndex]?.isBacklog) return;
      const backlogIndex = project.features.findIndex(feature => feature.isBacklog);
      moveItem(project.features, fromIndex, backlogIndex >= 0 ? Math.min(toIndex, backlogIndex - 1) : toIndex);
    },
    /** @param {MDProject} project @param {number} fromFeature @param {number} fromIndex @param {number} toFeature @param {number} toIndex */
    moveTask(project, fromFeature, fromIndex, toFeature, toIndex) {
      const task = project.features[fromFeature].tasks.splice(fromIndex, 1)[0];
      project.features[toFeature].tasks.splice(toIndex, 0, task);
    },
    /** @param {MDProject} project @param {number} featureIndex */
    deleteFeature(project, featureIndex) {
      project.features.splice(featureIndex, 1);
    },
    /** @param {MDProject} project @param {number} featureIndex @param {number} taskIndex */
    deleteTask(project, featureIndex, taskIndex) {
      project.features[featureIndex].tasks.splice(taskIndex, 1);
    },
    /** @param {MDTask} task @param {number} lineIndex */
    deleteTodo(task, lineIndex) {
      task.lines.splice(lineIndex, 1);
    },
    /** @param {MDProject} project @param {number} fromFeature @param {number} fromTask @param {number} fromLine @param {number} toFeature @param {number} toTask @param {number} toAnchorLine @param {number} toIndex */
    moveTodo(project, fromFeature, fromTask, fromLine, toFeature, toTask, toAnchorLine, toIndex) {
      const source = project.features[fromFeature].tasks[fromTask];
      const target = project.features[toFeature].tasks[toTask];
      const todo = source.lines.splice(fromLine, 1)[0];
      if (source === target && fromLine < toAnchorLine) toAnchorLine--;
      const nextBoundary = target.lines.findIndex((line, index) => index > toAnchorLine && /^\s*(?:#(?:Info|Warn)|\*\*.+\*\*)\s*$/i.test(line));
      const groupEnd = nextBoundary >= 0 ? nextBoundary : target.lines.length;
      const targetLines = target.lines.map((line, index) => index > toAnchorLine && index < groupEnd && /^\s*[-*+]\s+/.test(line) ? index : -1)
        .filter(index => index >= 0);
      let insertionLine;
      if (toIndex < targetLines.length) insertionLine = targetLines[toIndex];
      else if (targetLines.length) insertionLine = targetLines[targetLines.length - 1] + 1;
      else insertionLine = toAnchorLine + 1;
      target.lines.splice(insertionLine, 0, todo);
    },
    /** @param {MDTask} task @param {number} lineIndex @param {boolean} checked */
    setTodo(task, lineIndex, checked) {
      const match = task.lines[lineIndex].match(/^(\s*[-*+]\s+)(?:\[[ xX]\]\s+)?(.*)$/);
      if (!match) return;
      const text = match[2].replace(/^~(.*)~$/, "$1");
      task.lines[lineIndex] = `${match[1]}[${checked ? "x" : " "}] ${checked ? `~${text}~` : text}`;
    }
  };
})(window.MDManager);
