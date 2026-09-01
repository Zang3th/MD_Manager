window.MDManager = window.MDManager || {};

(function (app) {
  const archiveMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  /** @param {number} day */
  function archiveDayLabel(day) {
    const date = new Date(day * dayMs);
    return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}`;
  }

  /**
   * ISO-8601 week number. The week runs Monday to Sunday and belongs to the year holding its
   * Thursday, which is what a reader means by "KW".
   * @param {number} time
   */
  function archiveIsoWeek(time) {
    const date = new Date(time);
    const thursday = new Date(time + (4 - (date.getUTCDay() || 7)) * dayMs);
    const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    return Math.ceil(((thursday.getTime() - yearStart) / dayMs + 1) / 7);
  }

  /** @param {string} unit @param {number} step @param {number} time @returns {number} */
  function archiveUnitStart(unit, step, time) {
    const date = new Date(time);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    if (unit === "day") return dayStart;
    if (unit === "week") return dayStart - ((new Date(dayStart).getUTCDay() || 7) - 1) * dayMs;
    if (unit === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    if (unit === "quarter") return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
    return Date.UTC(Math.floor(date.getUTCFullYear() / step) * step, 0, 1);
  }

  /** @param {string} unit @param {number} step @param {number} time @returns {number} */
  function archiveUnitNext(unit, step, time) {
    if (unit === "day") return time + step * dayMs;
    if (unit === "week") return time + step * 7 * dayMs;
    const date = new Date(time);
    if (unit === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1);
    if (unit === "quarter") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step * 3, 1);
    return Date.UTC(date.getUTCFullYear() + step, 0, 1);
  }

  /** @param {{unit: string, step: number}} interval @param {number} index @param {number} origin @returns {number} */
  function archiveAnchoredTime(interval, index, origin) {
    if (interval.unit === "day") return origin + index * interval.step * dayMs;
    if (interval.unit === "week") return origin + index * interval.step * 7 * dayMs;
    const date = new Date(origin);
    const months = interval.unit === "month" ? 1 : interval.unit === "quarter" ? 3 : 12;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index * interval.step * months, date.getUTCDate());
  }

  /**
   * Ruler positions counted off the first archived date rather than off a calendar boundary, so the
   * opening line marks the day the work actually started and every later line is a whole number of
   * steps from it.
   * @param {{unit: string, step: number}} interval @param {number} origin @param {number} first @param {number} last @returns {number[]}
   */
  function archiveAnchoredTimes(interval, origin, first, last) {
    /** @type {number[]} */
    const times = [];
    // The plot can open before the first archived date. The rhythm still counts off that date, so
    // the steps before it are the same steps with a negative index rather than a second sequence.
    for (let index = -1; index > -400; index -= 1) {
      const time = archiveAnchoredTime(interval, index, origin);
      if (time < first) break;
      times.unshift(time);
    }
    for (let index = 0; index < 400; index += 1) {
      const time = archiveAnchoredTime(interval, index, origin);
      if (time >= last) break;
      if (time >= first) times.push(time);
    }
    return times;
  }

  /** @param {{unit: string, step: number}} interval @param {number} first @param {number} last @returns {number[]} */
  function archiveUnitBoundaries(interval, first, last) {
    /** @type {number[]} */
    const times = [];
    for (let time = archiveUnitStart(interval.unit, interval.step, first); time < last; time = archiveUnitNext(interval.unit, interval.step, time)) {
      if (time > first) times.push(time);
    }
    return times;
  }

  /** @param {MDArchiveScale} scale @param {number} spanDays */
  function archiveTickIntervals(scale, spanDays) {
    if (scale === "day") return { minor: { unit: "day", step: 1 }, major: { unit: "week", step: 1 } };
    if (scale === "week") return { minor: { unit: "day", step: 1 }, major: { unit: "month", step: 1 } };
    if (scale === "month") return { minor: { unit: "week", step: 1 }, major: { unit: "quarter", step: 1 } };
    if (spanDays <= 3653) return { minor: { unit: "quarter", step: 1 }, major: { unit: "year", step: 1 } };
    if (spanDays <= 18263) return { minor: { unit: "year", step: 1 }, major: { unit: "year", step: 5 } };
    return { minor: { unit: "year", step: 5 }, major: { unit: "year", step: 10 } };
  }

  /**
   * A bare day number cannot be read once the coarse row groups by quarters or years, so a ruler
   * label always carries the month it belongs to.
   * @param {string} unit @param {number} time
   */
  function archiveFineLabel(unit, time) {
    const date = new Date(time);
    if (unit === "day" || unit === "week") return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (unit === "month" || unit === "quarter") return `${archiveMonthNames[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
    return String(date.getUTCFullYear());
  }

  /** @param {string} unit @param {number} time */
  function archiveCellLabel(unit, time) {
    const date = new Date(time);
    if (unit === "week") return `KW ${archiveIsoWeek(time)}`;
    if (unit === "month") return `${archiveMonthNames[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
    if (unit === "quarter") return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
    return String(date.getUTCFullYear());
  }

  /** @param {MDArchiveScale} scale @param {number} first @param {number} last @param {number} startDay @param {number} spanDays @param {number} [origin] @param {{unit: string, step: number} | null} [subdivision] @returns {MDArchiveTick[]} */
  function archiveTicks(scale, first, last, startDay, spanDays, origin = first, subdivision = null) {
    if (!(last > first)) return [];
    const intervals = archiveTickIntervals(scale, spanDays);
    const majorTimes = archiveUnitBoundaries(intervals.major, first, last);
    // The coarse row names the periods, so a boundary tick only draws a line. The fine row carries
    // the short labels instead, which is where a reader looks for the exact position.
    /** @type {MDArchiveTick[]} */
    const ticks = majorTimes.map(time => {
      const tickPosition = (time / dayMs - startDay) / spanDays * 100;
      return { time, level: /** @type {MDArchiveTickLevel} */ ("major"), label: "", position: tickPosition, labelPosition: tickPosition };
    });
    // A subdivided cell cuts on its own calendar boundaries, so every cell is ruled identically and
    // a line never lands at some arbitrary fraction of one. Everything else counts off the first
    // archived date.
    const fine = subdivision || intervals.minor;
    const fineTimes = subdivision ? archiveUnitBoundaries(subdivision, first, last) : archiveAnchoredTimes(intervals.minor, origin, first, last);
    const majors = new Set(majorTimes);
    for (const time of fineTimes) {
      // A step that is also a boundary is already drawn as one; emitting it twice would stack two
      // strokes on one position. The rhythm is unaffected, because the boundary rules that position.
      if (majors.has(time)) continue;
      const tickPosition = (time / dayMs - startDay) / spanDays * 100;
      ticks.push({ time, level: "minor", label: archiveFineLabel(fine.unit, time), position: tickPosition, labelPosition: tickPosition });
    }
    ticks.sort((left, right) => left.time - right.time);
    if (ticks.length <= 200) return ticks;
    // Keep the ruler bounded without discarding its tail. Extreme but valid four-digit year spans
    // can produce more calendar boundaries than the browser can use; sampling the complete sorted
    // sequence preserves coverage at both ends instead of concentrating every line at the start.
    return Array.from({ length: 200 }, (_, index) => ticks[Math.round(index * (ticks.length - 1) / 199)]);
  }

  /**
   * How a cell is divided. A quarter reads in months and a year in quarters, so the ruler lands on
   * the boundaries a reader already has names for and every cell is cut the same way. Shorter cells
   * keep the date-anchored ruler, which counts off the first archived day instead.
   * @param {{unit: string, step: number}} cell @returns {{unit: string, step: number} | null}
   */
  function archiveCellSubdivision(cell) {
    if (cell.unit === "quarter") return { unit: "month", step: 1 };
    if (cell.unit === "year") return cell.step === 1 ? { unit: "quarter", step: 1 } : { unit: "year", step: cell.step === 5 ? 1 : 5 };
    return null;
  }

  /**
   * How many ruler steps one cell holds. Thinning the ruler may only drop whole multiples of this,
   * otherwise one cell would keep a line where its neighbour lost one.
   * @param {{unit: string, step: number}} cell
   */
  function archiveCellRulerCount(cell) {
    const subdivision = archiveCellSubdivision(cell);
    if (!subdivision) return 0;
    const cellDays = cell.unit === "quarter" ? 3 : 12 * cell.step;
    const stepDays = subdivision.unit === "month" ? 1 : subdivision.unit === "quarter" ? 3 : 12 * subdivision.step;
    // Interior lines only: the two ends of a cell are its own boundaries.
    return Math.round(cellDays / stepDays) - 1;
  }

  /** @param {MDArchiveScale} scale @param {number} spanDays @returns {{unit: string, step: number}} */
  function archiveCellInterval(scale, spanDays) {
    if (scale === "day") return { unit: "week", step: 1 };
    if (scale === "week") return { unit: "month", step: 1 };
    if (scale === "month") return { unit: "quarter", step: 1 };
    if (spanDays <= 3653) return { unit: "year", step: 1 };
    if (spanDays <= 18263) return { unit: "year", step: 5 };
    return { unit: "year", step: 10 };
  }

  /**
   * Splits the domain into the calendar periods the header names. Only whole calendar containers
   * qualify, so the coarse row always groups by something a reader can name. The cells tile the
   * domain end to end, including the partial periods it opens and closes with. How wide a cell
   * renders, and whether its name fits, is a pixel question the layout answers.
   * @param {MDArchiveScale} scale @param {number} first @param {number} last @param {number} startDay @param {number} spanDays
   * @returns {MDArchiveHeaderCell[]}
   */
  function archiveHeaderCells(scale, first, last, startDay, spanDays) {
    if (!(last > first)) return [];
    const interval = archiveCellInterval(scale, spanDays);
    /** @param {number} time */
    const position = time => (time / dayMs - startDay) / spanDays * 100;
    const edges = [first, ...archiveUnitBoundaries(interval, first, last), last];
    /** @type {MDArchiveHeaderCell[]} */
    const cells = [];
    for (let index = 0; index < edges.length - 1; index += 1) {
      const from = position(edges[index]);
      cells.push({ label: archiveCellLabel(interval.unit, archiveUnitStart(interval.unit, interval.step, edges[index])), position: from, width: position(edges[index + 1]) - from });
    }
    return cells;
  }

  /** @param {MDFeature[]} features @returns {MDArchiveTimeline} */
  function archiveTimeline(features) {
    /** @type {MDFeature[]} */
    const unmatched = [];
    /** @type {MDArchiveTimelineLane[]} */
    const lanes = [];
    for (const feature of features) {
      /** @type {MDArchiveTimelineSegment[]} */
      const ranges = [];
      /** @type {MDArchiveTimelinePoint[]} */
      const points = [];
      for (const range of feature.dates) {
        const from = parsedArchiveDate(range.from);
        if (!from) continue;
        const startDay = from.time / dayMs;
        const parsedTo = parsedArchiveDate(range.to);
        if (range.to.trim() && parsedTo && parsedTo.time > from.time) {
          const endDay = parsedTo.time / dayMs;
          ranges.push({ startDay, endDay, endExclusive: endDay + 1, durationDays: endDay - startDay + 1, label: `${from.value} – ${parsedTo.value}`, position: 0, width: 0 });
        } else {
          points.push({ day: startDay, label: from.value, position: 0 });
        }
      }
      if (!ranges.length && !points.length) {
        unmatched.push(feature);
        continue;
      }

      points.sort((left, right) => left.day - right.day);
      ranges.sort((left, right) => left.startDay - right.startDay || left.endExclusive - right.endExclusive);
      const startDay = Math.min(ranges[0]?.startDay ?? Number.POSITIVE_INFINITY, points[0]?.day ?? Number.POSITIVE_INFINITY);
      let endExclusive = Number.NEGATIVE_INFINITY;
      for (const range of ranges) endExclusive = Math.max(endExclusive, range.endExclusive);
      for (const point of points) endExclusive = Math.max(endExclusive, point.day + 1);
      lanes.push({ feature, startDay, endExclusive, ranges, points, pauses: [], accessibleSummary: "" });
    }

    lanes.sort((left, right) => left.startDay - right.startDay);
    if (!lanes.length) return { scale: "day", from: "", to: "", lanes, headerCells: [], rulerPerCell: 0, ticks: [], unmatched };
    const domainStartDay = lanes[0].startDay;
    let domainEndExclusive = Number.NEGATIVE_INFINITY;
    for (const lane of lanes) domainEndExclusive = Math.max(domainEndExclusive, lane.endExclusive);
    // A little room on both sides keeps the opening and closing marks off the table edge and gives
    // their labels somewhere to sit. The reported range stays the real one.
    const dataSpan = Math.max(1, domainEndExclusive - domainStartDay);
    /** @type {MDArchiveScale} */
    const scale = dataSpan <= 32 ? "day" : dataSpan <= 184 ? "week" : dataSpan <= 732 ? "month" : "year";
    const cell = archiveCellInterval(scale, dataSpan);
    // The plot opens and closes on whole cells wherever the cell is the unit the reader counts in, so
    // no period is shown as a stump: a week view starts on its Monday even when the work does not,
    // and a quarter or year view shows the whole period. Only a month cell keeps a proportional
    // margin instead, because rounding out to a whole month would visibly shrink the work.
    const wholeCells = cell.unit === "week" || cell.unit === "quarter" || cell.unit === "year";
    const padding = Math.max(1, Math.round(dataSpan * 0.04));
    const plotStartDay = wholeCells
      ? archiveUnitStart(cell.unit, cell.step, domainStartDay * dayMs) / dayMs
      : domainStartDay - padding;
    const plotEndExclusive = wholeCells
      ? archiveUnitNext(cell.unit, cell.step, archiveUnitStart(cell.unit, cell.step, (domainEndExclusive - 1) * dayMs)) / dayMs
      : domainEndExclusive + padding;
    const span = plotEndExclusive - plotStartDay;
    /** @param {number} day */
    const position = day => (day - plotStartDay) / span * 100;
    for (const lane of lanes) {
      for (const range of lane.ranges) {
        range.position = position(range.startDay);
        range.width = (range.endExclusive - range.startDay) / span * 100;
      }
      // A date is one instant, not a cell: the day it names begins there. A range already opens at
      // that instant, so anchoring a single day to it as well puts both on the ruler line that
      // carries the same date, and stops one calendar date from rendering in two places.
      for (const point of lane.points) point.position = position(point.day);
      const activity = [
        ...lane.ranges.map(range => ({ startDay: range.startDay, endExclusive: range.endExclusive })),
        ...lane.points.map(point => ({ startDay: point.day, endExclusive: point.day + 1 }))
      ].sort((left, right) => left.startDay - right.startDay || left.endExclusive - right.endExclusive);
      /** @type {Array<{startDay: number, endExclusive: number}>} */
      const activeUnions = [];
      for (const item of activity) {
        const current = activeUnions.at(-1);
        if (current && item.startDay <= current.endExclusive) {
          if (item.endExclusive > current.endExclusive) {
            current.endExclusive = item.endExclusive;
          }
        } else activeUnions.push({ ...item });
      }
      for (let index = 0; index < activeUnions.length - 1; index += 1) {
        const previous = activeUnions[index];
        const next = activeUnions[index + 1];
        const durationDays = next.startDay - previous.endExclusive;
        if (durationDays > 0) {
          lane.pauses.push({ startDay: previous.endExclusive, endExclusive: next.startDay, durationDays, label: `${durationDays} day${durationDays === 1 ? "" : "s"} pause`, position: position(previous.endExclusive), width: durationDays / span * 100 });
        }
      }
      const rangeSummary = lane.ranges.map(range => `${archiveDayLabel(range.startDay)} to ${archiveDayLabel(range.endDay)}`);
      const pointSummary = lane.points.map(point => archiveDayLabel(point.day));
      const pauses = lane.pauses.map(pause => pause.label);
      lane.accessibleSummary = `${lane.feature.title}. ${[...rangeSummary, ...pointSummary, ...pauses].join("; ")}.`;
    }
    const firstTime = plotStartDay * dayMs;
    const lastTime = plotEndExclusive * dayMs;
    return {
      scale,
      from: archiveDayLabel(domainStartDay),
      to: archiveDayLabel(domainEndExclusive - 1),
      lanes,
      headerCells: archiveHeaderCells(scale, firstTime, lastTime, plotStartDay, span),
      rulerPerCell: archiveCellRulerCount(cell),
      ticks: archiveTicks(scale, firstTime, lastTime, plotStartDay, span, domainStartDay * dayMs, archiveCellSubdivision(cell)),
      unmatched
    };
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
