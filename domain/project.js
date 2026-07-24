window.MDManager = window.MDManager || {};

(function (app) {
  function moveItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
  }

  app.domain = {
    moveFeature(project, fromIndex, toIndex) {
      moveItem(project.features, fromIndex, toIndex);
    },
    moveTask(project, fromFeature, fromIndex, toFeature, toIndex) {
      const task = project.features[fromFeature].tasks.splice(fromIndex, 1)[0];
      project.features[toFeature].tasks.splice(toIndex, 0, task);
    },
    deleteFeature(project, featureIndex) {
      project.features.splice(featureIndex, 1);
    },
    deleteTask(project, featureIndex, taskIndex) {
      project.features[featureIndex].tasks.splice(taskIndex, 1);
    },
    deleteTodo(task, lineIndex) {
      task.lines.splice(lineIndex, 1);
    },
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
    setTodo(task, lineIndex, checked) {
      const match = task.lines[lineIndex].match(/^(\s*[-*+]\s+)(?:\[[ xX]\]\s+)?(.*)$/);
      if (!match) return;
      const text = match[2].replace(/^~(.*)~$/, "$1");
      task.lines[lineIndex] = `${match[1]}[${checked ? "x" : " "}] ${checked ? `~${text}~` : text}`;
    }
  };
})(window.MDManager);
