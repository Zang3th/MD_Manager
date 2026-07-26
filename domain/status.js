window.MDManager = window.MDManager || {};

(function (app) {
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

  function statistics(features, entriesForTask) {
    const regularFeatures = features.filter(feature => !feature.isBacklog);
    const backlog = features.find(feature => feature.isBacklog);
    const tasks = regularFeatures.flatMap(feature => feature.tasks);
    const backlogTasks = backlog?.tasks || [];
    const entries = tasks.flatMap(entriesForTask);
    const backlogEntries = backlogTasks.flatMap(entriesForTask);
    const entryProgress = progress(entries);
    return {
      features: { ...counts(regularFeatures, feature => feature.tasks.flatMap(entriesForTask)), backlog: "/" },
      tasks: { ...counts(tasks, entriesForTask), backlog: backlogTasks.length },
      entries: { done: entryProgress.done, active: "/", open: entries.length - entryProgress.done, backlog: backlogEntries.length }
    };
  }

  app.status = { progress, counts, statistics };
})(window.MDManager);
