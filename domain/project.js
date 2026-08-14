window.MDManager = window.MDManager || {};

(function (app) {
  const archiveMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayMs = 24 * 60 * 60 * 1000;
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

  /** @param {MDFeature} feature */
  function featureComplete(feature) {
    const states = feature.tasks.filter(task => !task.ignored).flatMap(task => {
      let note = false;
      return task.lines.flatMap(line => {
        if (/^\s*#(?:Info|Warn)\s*$/i.test(line)) { note = true; return []; }
        if (/^####\s+.+?\s*#*\s*$/.test(line)) { note = false; return []; }
        if (note) return [];
        const todo = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
        return todo ? [todo[1]?.toLowerCase() === "x" || /^~.*~$/.test(todo[2])] : [];
      });
    });
    return states.length > 0 && states.every(Boolean);
  }

  /** @param {MDFeature | undefined} feature */
  function canArchiveFeature(feature) {
    return Boolean(feature && !feature.isBacklog && !feature.isArchived && featureComplete(feature));
  }

  /** @param {MDFeature} feature */
  function archiveSortKey(feature) {
    const version = feature.version?.trim().match(/^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/i);
    if (version) return { kind: 0, parts: version[1].split(".").map(Number), value: 0 };
    const date = feature.dates?.map(range => parsedArchiveDate(range.from)).find(Boolean);
    if (date) return { kind: 1, parts: [], value: date.time };
    return { kind: 2, parts: [], value: 0 };
  }

  /** @param {MDFeature} left @param {MDFeature} right */
  function compareArchivedFeatures(left, right) {
    const a = archiveSortKey(left);
    const b = archiveSortKey(right);
    if (a.kind !== b.kind) return a.kind - b.kind;
    if (a.kind === 0) {
      const length = Math.max(a.parts.length, b.parts.length);
      for (let index = 0; index < length; index++) {
        const difference = (a.parts[index] || 0) - (b.parts[index] || 0);
        if (difference) return difference;
      }
      return 0;
    }
    return a.value - b.value;
  }

  /** @param {MDProject} project */
  function sortArchivedFeatures(project) {
    const archived = project.features.filter(feature => feature.isArchived).sort(compareArchivedFeatures);
    const ordered = [...project.features.filter(feature => !feature.isBacklog && !feature.isArchived), ...project.features.filter(feature => feature.isBacklog), ...archived];
    project.features.splice(0, project.features.length, ...ordered);
  }

  /** @param {string} value @returns {MDArchiveDate | null} */
  function parsedArchiveDate(value) {
    const source = value.trim();
    const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const european = source.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
    if (!iso && !european) return null;
    const europeanYear = european?.[3] || "";
    const year = Number(iso?.[1] || (europeanYear.length === 2 ? `20${europeanYear}` : europeanYear));
    const month = Number(iso?.[2] || european?.[2]);
    const day = Number(iso?.[3] || european?.[1]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { value: source, time, year, month, day };
  }

  /** @param {string} value @returns {number[]} */
  function versionParts(value) {
    const match = value.trim().match(/^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/i);
    return match ? match[1].split(".").map(Number) : [];
  }

  /** @param {string} value */
  function versionLabel(value) {
    return /^v/i.test(value.trim()) ? value.trim() : `v${value.trim()}`;
  }

  /** @param {number[]} a @param {number[]} b */
  function compareVersionParts(a, b) {
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index++) {
      const difference = (a[index] || 0) - (b[index] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  /** @param {MDFeature} feature */
  function earliestFeatureDate(feature) {
    /** @type {ReturnType<typeof parsedArchiveDate>} */
    let earliest = null;
    for (const range of feature.dates || []) {
      const date = parsedArchiveDate(range.from);
      if (date && (!earliest || date.time < earliest.time)) earliest = date;
    }
    return earliest;
  }

  /** @param {MDProject} project @param {MDFeature} feature */
  function unarchiveInsertionIndex(project, feature) {
    const workspace = project.features.map((item, index) => ({ feature: item, index })).filter(item => !item.feature.isBacklog && !item.feature.isArchived);
    const date = earliestFeatureDate(feature);
    if (date) {
      const dated = workspace.map(item => ({ ...item, date: earliestFeatureDate(item.feature) })).filter(item => item.date);
      if (dated.length) {
        const later = dated.find(item => /** @type {NonNullable<typeof item.date>} */ (item.date).time > date.time);
        return later ? later.index : /** @type {typeof dated[number]} */ (dated.at(-1)).index + 1;
      }
    }
    const version = versionParts(feature.version || "");
    if (version.length) {
      const versioned = workspace.map(item => ({ ...item, version: versionParts(item.feature.version || "") })).filter(item => item.version.length);
      if (versioned.length) {
        const later = versioned.find(item => compareVersionParts(item.version, version) > 0);
        return later ? later.index : /** @type {typeof versioned[number]} */ (versioned.at(-1)).index + 1;
      }
    }
    return 0;
  }

  /** @param {{time: number, year: number, month: number, day: number}} date */
  function isoWeek(date) {
    const value = new Date(date.time);
    const weekday = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - weekday);
    const weekYear = value.getUTCFullYear();
    const yearStart = Date.UTC(weekYear, 0, 1);
    return { year: weekYear, week: Math.ceil(((value.getTime() - yearStart) / dayMs + 1) / 7) };
  }

  /** @param {MDArchiveScale} scale @param {{value: string, time: number, year: number, month: number, day: number}} date */
  function archivePeriod(scale, date) {
    if (scale === "day") return { key: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`, label: date.value };
    if (scale === "week") {
      const week = isoWeek(date);
      return { key: `${week.year}-${String(week.week).padStart(2, "0")}`, label: `Week ${week.week}, ${week.year}` };
    }
    if (scale === "month") return { key: `${date.year}-${String(date.month).padStart(2, "0")}`, label: `${archiveMonthNames[date.month - 1]} ${date.year}` };
    return { key: String(date.year), label: String(date.year) };
  }

  const maxArchiveTicks = 400;
  /** @type {Record<MDArchiveScale, {minor: string, major: string}>} */
  const archiveTickUnits = {
    day: { minor: "day", major: "week" },
    week: { minor: "week", major: "month" },
    month: { minor: "month", major: "quarter" },
    year: { minor: "quarter", major: "year" }
  };

  /** @param {string} unit @param {number} time @returns {number} */
  function archiveUnitStart(unit, time) {
    const date = new Date(time);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    if (unit === "day") return dayStart;
    if (unit === "week") return dayStart - ((new Date(dayStart).getUTCDay() || 7) - 1) * dayMs;
    if (unit === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    if (unit === "quarter") return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
    return Date.UTC(date.getUTCFullYear(), 0, 1);
  }

  /** @param {string} unit @param {number} time @returns {number} */
  function archiveUnitNext(unit, time) {
    if (unit === "day") return time + dayMs;
    if (unit === "week") return time + 7 * dayMs;
    const date = new Date(time);
    if (unit === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    if (unit === "quarter") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 3, 1);
    return Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  }

  /** @param {string} unit @param {number} first @param {number} last @returns {number[]} */
  function archiveUnitBoundaries(unit, first, last) {
    /** @type {number[]} */
    const times = [];
    for (let time = archiveUnitStart(unit, first); time < last; time = archiveUnitNext(unit, time)) {
      if (time > first) times.push(time);
    }
    return times;
  }

  /** @param {MDArchiveScale} scale @param {number} first @param {number} last @returns {MDArchiveTick[]} */
  function archiveTicks(scale, first, last) {
    if (!(last > first)) return [];
    const units = archiveTickUnits[scale];
    const majorTimes = archiveUnitBoundaries(units.major, first, last);
    const majors = new Set(majorTimes);
    /** @type {MDArchiveTick[]} */
    const ticks = majorTimes.map(time => ({ time, level: /** @type {MDArchiveTickLevel} */ ("major") }));
    if (ticks.length <= maxArchiveTicks) {
      for (const time of archiveUnitBoundaries(units.minor, first, last)) {
        if (!majors.has(time)) ticks.push({ time, level: "minor" });
      }
    }
    ticks.sort((left, right) => left.time - right.time);
    if (ticks.length <= maxArchiveTicks) return ticks;
    const stride = Math.ceil(ticks.length / maxArchiveTicks);
    return ticks.filter((_, index) => index % stride === 0);
  }

  /** @param {MDFeature[]} features @param {MDArchiveOrder} [order] @returns {MDArchiveTimeline} */
  function archiveTimeline(features, order = "date") {
    /** @type {MDArchiveTimelineEntry[]} */
    const entries = [];
    /** @type {MDFeature[]} */
    const unmatched = [];
    /** @type {MDArchiveDate[]} */
    const rangeDates = [];
    for (const feature of features) {
      if (order === "version") {
        const parts = versionParts(feature.version || "");
        if (parts.length) entries.push({ feature, label: versionLabel(feature.version || "") });
        else unmatched.push(feature);
        continue;
      }
      /** @type {MDArchiveTimelineRange[]} */
      const ranges = [];
      for (const range of feature.dates) {
        const from = parsedArchiveDate(range.from);
        if (!from) continue;
        const parsedTo = parsedArchiveDate(range.to);
        const to = parsedTo && parsedTo.time >= from.time ? parsedTo : undefined;
        rangeDates.push(from);
        if (to) rangeDates.push(to);
        ranges.push({ from, to, label: to && to.time !== from.time ? `${from.value} – ${to.value}` : from.value });
      }
      if (!ranges.length) {
        unmatched.push(feature);
        continue;
      }
      ranges.sort((left, right) => left.from.time - right.from.time);
      const start = ranges[0].from;
      const end = ranges.reduce((latest, range) => {
        const candidate = range.to || range.from;
        return candidate.time > latest.time ? candidate : latest;
      }, start);
      const rangeLabel = ranges.length === 1 ? ranges[0].label : `${start.value} – ${end.value} · ${ranges.length} periods`;
      entries.push({ feature, date: start, endDate: end.time > start.time ? end : undefined, label: start.value, rangeLabel, ranges, rangeCount: ranges.length });
    }
    if (order === "version") {
      entries.sort((left, right) => compareVersionParts(versionParts(left.feature.version || ""), versionParts(right.feature.version || "")));
      /** @type {Map<string, MDArchiveTimelineGroup>} */
      const versionGroups = new Map();
      for (const entry of entries) {
        const parts = versionParts(entry.feature.version || "");
        const key = parts.join(".");
        let group = versionGroups.get(key);
        if (!group) {
          group = { key: `version-${key}`, label: entry.label, entries: [] };
          versionGroups.set(key, group);
        }
        group.entries.push(entry);
      }
      return { order, scale: "day", from: entries[0]?.label || "", to: entries[entries.length - 1]?.label || "", entries, groups: [...versionGroups.values()], unmatched };
    }
    rangeDates.sort((left, right) => left.time - right.time);
    entries.sort((left, right) => /** @type {NonNullable<typeof left.date>} */ (left.date).time - /** @type {NonNullable<typeof right.date>} */ (right.date).time);
    if (!rangeDates.length) return { order, scale: "day", from: "", to: "", entries, markers: [], ticks: [], groups: [], unmatched };
    const first = /** @type {NonNullable<ReturnType<typeof parsedArchiveDate>>} */ (rangeDates[0]);
    const last = /** @type {NonNullable<ReturnType<typeof parsedArchiveDate>>} */ (rangeDates[rangeDates.length - 1]);
    const span = Math.round((last.time - first.time) / dayMs);
    /** @type {MDArchiveScale} */
    const scale = span <= 31 ? "day" : span <= 183 ? "week" : span <= 731 ? "month" : "year";
    /** @type {Map<string, MDArchiveTimelineGroup>} */
    const groups = new Map();
    for (const date of rangeDates) {
      const value = archivePeriod(scale, date);
      if (!groups.has(value.key)) groups.set(value.key, { ...value, entries: [] });
    }
    for (const entry of entries) {
      const value = archivePeriod(scale, /** @type {NonNullable<typeof entry.date>} */ (entry.date));
      groups.get(value.key)?.entries.push(entry);
    }
    const markerDates = [...new Map(rangeDates.map(date => [date.time, date])).values()];
    return { order, scale, from: first.value, to: last.value, fromTime: first.time, toTime: last.time, entries, markers: markerDates, ticks: archiveTicks(scale, first.time, last.time), groups: [...groups.values()], unmatched };
  }

  /** @param {MDProject} project */
  function featureBoundary(project) {
    const boundary = project.features.findIndex(item => item.isBacklog || item.isArchived);
    return boundary < 0 ? project.features.length : boundary;
  }

  app.archive = { timeline: archiveTimeline };
  app.domain = {
    featureComplete,
    canArchiveFeature,
    copyTask,
    /** @param {MDFeature} feature @returns {MDFeature} */
    copyFeature(feature) {
      return {
        ...feature,
        headerLines: (feature.headerLines || []).slice(),
        dates: (feature.dates || []).map(date => ({ ...date })),
        notes: (feature.notes || []).map(note => ({ ...note, items: note.items.map(item => typeof item === "string" ? item : { ...item }) })),
        tasks: feature.tasks.map(copyTask),
        isBacklog: false,
        isArchived: false,
        isPinned: false
      };
    },
    /** @param {MDProject} project @param {number} index @param {MDFeature} feature */
    insertFeature(project, index, feature) {
      const boundary = featureBoundary(project);
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
      if (project.features[fromIndex]?.isBacklog || project.features[fromIndex]?.isArchived) return false;
      const boundary = featureBoundary(project);
      return moveItem(project.features, fromIndex, Math.min(toIndex, boundary - 1));
    },
    /** @param {MDProject} project @param {number} featureIndex */
    archiveFeature(project, featureIndex) {
      const feature = project.features[featureIndex];
      if (!canArchiveFeature(feature)) return false;
      feature.isArchived = true;
      feature.isPinned = false;
      project.hasArchive = true;
      project.archiveTitle ||= "Archive";
      sortArchivedFeatures(project);
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex */
    unarchiveFeature(project, featureIndex) {
      const feature = project.features[featureIndex];
      if (!feature?.isArchived) return false;
      const toIndex = unarchiveInsertionIndex(project, feature);
      project.features.splice(featureIndex, 1);
      feature.isArchived = false;
      project.features.splice(Math.max(0, Math.min(toIndex, featureBoundary(project))), 0, feature);
      return true;
    },
    /** @param {MDProject} project @param {MDFeature} feature @param {number} featureIndex @param {boolean} pinned @param {boolean} hadArchive */
    restoreArchivedFeature(project, feature, featureIndex, pinned, hadArchive) {
      const archivedIndex = project.features.indexOf(feature);
      if (archivedIndex < 0 || !feature.isArchived) return false;
      project.features.splice(archivedIndex, 1);
      feature.isArchived = false;
      feature.isPinned = pinned;
      project.features.splice(Math.max(0, Math.min(featureIndex, featureBoundary(project))), 0, feature);
      project.hasArchive = hadArchive;
      return true;
    },
    /** @param {MDProject} project @param {number} featureIndex @param {boolean} pinned */
    setFeaturePinned(project, featureIndex, pinned) {
      const feature = project.features[featureIndex];
      if (!feature || feature.isBacklog || feature.isArchived || Boolean(feature.isPinned) === pinned && (!pinned || project.features.filter(item => item.isPinned).length === 1)) return false;
      if (pinned) project.features.forEach(item => { item.isPinned = item === feature; });
      else feature.isPinned = false;
      return true;
    },
    /** @param {MDProject} project @param {number} fromFeature @param {number} fromIndex @param {number} toFeature @param {number} toIndex */
    moveTask(project, fromFeature, fromIndex, toFeature, toIndex) {
      if (fromFeature === toFeature && fromIndex === toIndex) return false;
      if (project.features[toFeature]?.isArchived) return false;
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
