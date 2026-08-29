window.MDManager = window.MDManager || {};

(function (app) {
  /** @param {Array<{checked: boolean}>} entries */
  function progress(entries) {
    const done = entries.filter(entry => entry.checked).length;
    const complete = entries.length > 0 && done === entries.length;
    return {
      entries,
      done,
      complete,
      inProgress: done > 0 && !complete,
      percentage: entries.length ? Math.round(done / entries.length * 100) : 0
    };
  }

  /** @template T @param {T[]} items @param {(item: T) => Array<{checked: boolean}>} entriesFor */
  function counts(items, entriesFor) {
    const result = { done: 0, active: 0, open: 0 };
    items.forEach(item => {
      const state = progress(entriesFor(item));
      if (state.complete) result.done++;
      else if (state.inProgress) result.active++;
      else result.open++;
    });
    return result;
  }

  /** @param {MDFeature[]} features @param {(task: MDTask) => MDTodo[]} entriesForTask */
  function statistics(features, entriesForTask) {
    const regularFeatures = features.filter(feature => !feature.isBacklog && !feature.isArchived && !feature.ignored);
    const backlog = features.find(feature => feature.isBacklog && !feature.ignored);
    const archivedFeatures = features.filter(feature => feature.isArchived && !feature.ignored);
    const tasks = regularFeatures.flatMap(feature => feature.tasks.filter(task => !task.ignored));
    const backlogTasks = backlog?.tasks.filter(task => !task.ignored) || [];
    const archivedTasks = archivedFeatures.flatMap(feature => feature.tasks.filter(task => !task.ignored));
    const featureEntries = regularFeatures.map(feature => feature.tasks.filter(task => !task.ignored).flatMap(entriesForTask));
    const entries = tasks.flatMap(entriesForTask);
    const backlogEntries = backlogTasks.flatMap(entriesForTask);
    const archivedEntries = archivedTasks.flatMap(entriesForTask);
    const entryProgress = progress(entries);
    const activeEntries = featureEntries.reduce((open, featureTodos) => {
      const featureState = progress(featureTodos);
      return featureState.inProgress ? open + featureTodos.length - featureState.done : open;
    }, 0);
    return {
      features: { ...counts(featureEntries, featureTodos => featureTodos), backlog: "/", archive: archivedFeatures.length },
      tasks: { ...counts(tasks, entriesForTask), backlog: backlogTasks.length, archive: archivedTasks.length },
      entries: { done: entryProgress.done, active: activeEntries, open: entries.length - entryProgress.done, backlog: backlogEntries.length, archive: archivedEntries.length }
    };
  }

  app.status = { progress, counts, statistics };
})(window.MDManager);
