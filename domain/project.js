window.MDManager = window.MDManager || {};

(function (app) {
  /** @template T @param {T[]} items @param {number} fromIndex @param {number} toIndex */
  function moveItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex || !items[fromIndex]) return false;
    items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
    return true;
  }

  /** @param {string} line */
  function resetCopiedTodo(line) {
    const match = line.match(/^(\s*[-*+]\s+)\[[xX]\]\s+(.*)$/);
    if (!match) return line;
    return `${match[1]}[ ] ${match[2].replace(/^~(.*)~$/, "$1")}`;
  }

  /** @param {MDTask} task @returns {MDTask} */
  function copyTask(task) {
    return { ...task, lines: task.lines.map(resetCopiedTodo) };
  }

  app.domain = {
    /** @param {MDProject} project @param {MDFeature} feature */
    addFeature(project, feature) {
      const backlogIndex = project.features.findIndex(item => item.isBacklog);
      project.features.splice(backlogIndex < 0 ? project.features.length : backlogIndex, 0, feature);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {MDTask} task */
    addTask(project, featureIndex, task) {
      project.features[featureIndex].tasks.push(task);
      return true;
    },
    copyTask,
    /** @param {MDFeature} feature @returns {MDFeature} */
    copyFeature(feature) {
      return {
        ...feature,
        headerLines: (feature.headerLines || []).slice(),
        dates: (feature.dates || []).map(date => ({ ...date })),
        notes: (feature.notes || []).map(note => ({ ...note, items: note.items.map(item => typeof item === "string" ? item : { ...item }) })),
        tasks: feature.tasks.map(copyTask),
        isBacklog: false
      };
    },
    /** @param {MDProject} project @param {number} index @param {MDFeature} feature */
    insertFeature(project, index, feature) {
      const backlogIndex = project.features.findIndex(item => item.isBacklog);
      const boundary = backlogIndex < 0 ? project.features.length : backlogIndex;
      project.features.splice(Math.max(0, Math.min(index, boundary)), 0, feature);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {number} index @param {MDTask} task */
    insertTask(project, featureIndex, index, task) {
      const tasks = project.features[featureIndex].tasks;
      tasks.splice(Math.max(0, Math.min(index, tasks.length)), 0, task);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {string} title @param {MDFeature} metadata */
    updateFeature(project, featureIndex, title, metadata) {
      const feature = project.features[featureIndex];
      const nextHeader = metadata.headerLines;
      if (feature.title === title && feature.headerLines.length === nextHeader.length && feature.headerLines.every((line, index) => line === nextHeader[index])) return false;
      feature.title = title;
      feature.headerLines = metadata.headerLines.slice();
      feature.version = metadata.version;
      feature.dates = metadata.dates.map(date => ({ ...date }));
      feature.notes = metadata.notes.map(note => ({ ...note, items: note.items.map(item => ({ ...item })) }));
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {number} taskIndex @param {{title: string, lines: string[]}} draft */
    updateTask(project, featureIndex, taskIndex, draft) {
      const task = project.features[featureIndex].tasks[taskIndex];
      if (task.title === draft.title && task.lines.length === draft.lines.length && task.lines.every((line, index) => line === draft.lines[index])) return false;
      task.title = draft.title;
      task.lines = draft.lines.slice();
      return true;
    },
    /** @param {MDProject} project @param {number} fromIndex @param {number} toIndex */
    moveFeature(project, fromIndex, toIndex) {
      if (project.features[fromIndex]?.isBacklog) return false;
      const backlogIndex = project.features.findIndex(feature => feature.isBacklog);
      return moveItem(project.features, fromIndex, backlogIndex >= 0 ? Math.min(toIndex, backlogIndex - 1) : toIndex);
    },
    /** @param {MDProject} project @param {number} fromFeature @param {number} fromIndex @param {number} toFeature @param {number} toIndex */
    moveTask(project, fromFeature, fromIndex, toFeature, toIndex) {
      if (fromFeature === toFeature && fromIndex === toIndex) return false;
      const task = project.features[fromFeature].tasks.splice(fromIndex, 1)[0];
      if (!task) return false;
      project.features[toFeature].tasks.splice(toIndex, 0, task);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex */
    deleteFeature(project, featureIndex) {
      if (!project.features[featureIndex]) return false;
      project.features.splice(featureIndex, 1);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {number} taskIndex */
    deleteTask(project, featureIndex, taskIndex) {
      if (!project.features[featureIndex]?.tasks[taskIndex]) return false;
      project.features[featureIndex].tasks.splice(taskIndex, 1);
      return true;
    },
    /** @param {MDTask} task @param {number} lineIndex */
    deleteTodo(task, lineIndex) {
      if (task.lines[lineIndex] === undefined) return false;
      task.lines.splice(lineIndex, 1);
      return true;
    },
    /** @param {MDTask} task @param {number} lineIndex @param {string} line */
    insertTodo(task, lineIndex, line) {
      task.lines.splice(lineIndex, 0, line);
      return true;
    },
    /** @param {MDProject} project @param {number} fromFeature @param {number} fromTask @param {number} fromLine @param {number} toFeature @param {number} toTask @param {number} toAnchorLine @param {number} toIndex */
    moveTodo(project, fromFeature, fromTask, fromLine, toFeature, toTask, toAnchorLine, toIndex) {
      const source = project.features[fromFeature].tasks[fromTask];
      const target = project.features[toFeature].tasks[toTask];
      const todo = source.lines.splice(fromLine, 1)[0];
      if (todo === undefined) return false;
      if (source === target && fromLine < toAnchorLine) toAnchorLine--;
      const nextBoundary = target.lines.findIndex((line, index) => index > toAnchorLine && /^(?:\s*#(?:Info|Warn)\s*|####\s+.+?\s*#*\s*)$/i.test(line));
      const groupEnd = nextBoundary >= 0 ? nextBoundary : target.lines.length;
      const targetLines = target.lines.map((line, index) => index > toAnchorLine && index < groupEnd && /^\s*[-*+]\s+/.test(line) ? index : -1)
        .filter(index => index >= 0);
      let insertionLine;
      if (toIndex < targetLines.length) insertionLine = targetLines[toIndex];
      else if (targetLines.length) insertionLine = targetLines[targetLines.length - 1] + 1;
      else insertionLine = toAnchorLine + 1;
      target.lines.splice(insertionLine, 0, todo);
      return true;
    },
    /** @param {MDTask} task @param {number} lineIndex @param {boolean} checked */
    setTodo(task, lineIndex, checked) {
      const match = task.lines[lineIndex].match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/);
      if (!match) return false;
      const text = match[1].replace(/^~(.*)~$/, "$1");
      const next = `- [${checked ? "x" : " "}] ${checked ? `~${text}~` : text}`;
      if (task.lines[lineIndex] === next) return false;
      task.lines[lineIndex] = next;
      return true;
    }
  };
})(window.MDManager);
