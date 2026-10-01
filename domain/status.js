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

  /** @param {number} maximum @returns {MDChartScale} */
  function chartScale(maximum) {
    const rawStep = Math.max(1, maximum / 5);
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const step = /** @type {number} */ ([1, 2, 5, 10].find(value => value * power >= rawStep)) * power;
    const max = Math.max(step, Math.ceil(maximum / step) * step);
    return { max, ticks: Array.from({ length: max / step + 1 }, (_, index) => index * step) };
  }

  /** @param {MDFeature[]} features @param {(task: MDTask) => MDTodo[]} entriesForTask @returns {MDStatisticsCharts} */
  function charts(features, entriesForTask) {
    /** @type {Map<string, MDChartPoint>} */
    const points = new Map();
    /** @type {number[]} */
    const durations = [];
    let excluded = 0;
    let maxSize = 0;
    let minDays = Number.POSITIVE_INFINITY;
    let maxDays = 0;
    for (const feature of features) {
      if (feature.ignored || feature.isBacklog) continue;
      let size = 0;
      let done = 0;
      for (const task of feature.tasks) {
        if (task.ignored) continue;
        for (const entry of entriesForTask(task)) {
          size++;
          if (entry.checked) done++;
        }
      }
      if (!size || size !== done) continue;
      const days = app.archive.recordedDays(feature);
      if (days === null) { excluded++; continue; }
      const key = `${size}:${days}`;
      let point = points.get(key);
      if (!point) { point = { size, days, titles: [] }; points.set(key, point); }
      point.titles.push(feature.title);
      durations.push(days);
      maxSize = Math.max(maxSize, size);
      minDays = Math.min(minDays, days);
      maxDays = Math.max(maxDays, days);
    }
    /** @type {MDChartBin[]} */
    const bins = [];
    let maxFrequency = 0;
    if (durations.length) {
      const target = Math.min(10, Math.ceil(Math.sqrt(durations.length)));
      const width = Math.max(1, Math.ceil((maxDays - minDays + 1) / target));
      for (let from = minDays; from <= maxDays; from += width) bins.push({ from, to: from + width - 1, count: 0 });
      for (const days of durations) {
        const bin = bins[Math.floor((days - minDays) / width)];
        bin.count++;
        maxFrequency = Math.max(maxFrequency, bin.count);
      }
    }
    return { count: durations.length, excluded, points: Array.from(points.values()), bins, sizeScale: chartScale(maxSize), durationScale: chartScale(maxDays), frequencyScale: chartScale(maxFrequency) };
  }

  app.status = { progress, counts, statistics, charts };
})(window.MDManager);
