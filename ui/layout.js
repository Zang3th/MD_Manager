window.MDManager = window.MDManager || {};

(function (app) {
  const dayMs = 24 * 60 * 60 * 1000;
  const archiveTurnInset = 8;
  const archiveTurnHandleScale = 2 / 3;
  const archiveMinimumCardWidth = 240;
  const archiveLaneGap = 16;
  const archiveAxisGap = 46;
  const archiveRowGap = 34;
  const archiveMaximumRows = 24;
  /** @type {Record<string, {pixels: number, span: number}>} */
  const archiveRulerPitch = {
    day: { pixels: 26, span: dayMs },
    week: { pixels: 46, span: 7 * dayMs },
    month: { pixels: 78, span: 30.4375 * dayMs },
    year: { pixels: 190, span: 365.25 * dayMs }
  };
  const titleFitCache = new Map();
  const textWidthCache = new Map();
  const titleStyleCache = new Map();
  const headerHeightCache = new Map();
  const measureContext = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  let layoutFrame = 0;
  let layoutNeeds = { titles: false, headers: false, scrollbars: false, backlog: false, archive: false, archivePath: false };

  function layoutKey() {
    return `workspace:${document.body.classList.contains("show-metadata") ? "metadata" : "plain"}`;
  }

  /** @param {CSSStyleDeclaration} style */
  function fontKey(style) {
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}|${style.letterSpacing}`;
  }

  /** @param {HTMLElement} title */
  function titleStyle(title) {
    const type = title.classList.contains("release-title") ? "feature" : title.classList.contains("backlog-title") ? "backlog" : "task";
    const key = `${layoutKey()}|${type}`;
    if (!titleStyleCache.has(key)) {
      const style = getComputedStyle(title);
      titleStyleCache.set(key, {
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight
      });
    }
    return titleStyleCache.get(key);
  }

  /** @param {string} value @param {CSSStyleDeclaration} style */
  function measuredTextWidth(value, style) {
    const font = fontKey(style);
    const key = `${font}|${value}`;
    if (textWidthCache.has(key)) return textWidthCache.get(key);
    measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
    const width = measureContext.measureText(value).width + Math.max(0, Array.from(value).length - 1) * spacing;
    textWidthCache.set(key, width);
    return width;
  }

  /** @param {string} value @param {number} availableWidth @param {CSSStyleDeclaration} style */
  function fittedTitle(value, availableWidth, style) {
    const characters = Array.from(value);
    const key = `${fontKey(style)}|${Math.floor(availableWidth)}|${value}`;
    if (titleFitCache.has(key)) return titleFitCache.get(key);
    if (measuredTextWidth(value, style) <= availableWidth) {
      titleFitCache.set(key, value);
      return value;
    }
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const length = Math.ceil((low + high) / 2);
      if (measuredTextWidth(characters.slice(0, length).join(""), style) <= availableWidth) low = length;
      else high = length - 1;
    }
    const fitted = characters.slice(0, low).join("");
    titleFitCache.set(key, fitted);
    return fitted;
  }

  /** @param {Iterable<HTMLElement>} [targets] */
  function fitTitles(targets) {
    const titles = targets ? [...targets] : /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".release-title, .card-title, .backlog-title")]);
    const values = titles.map(title => {
      if (title.closest("[hidden]")) return title.dataset.fullTitle;
      const style = titleStyle(title);
      const available = title.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return fittedTitle(title.dataset.fullTitle || "", available, style);
    });
    titles.forEach((title, index) => title.querySelector(".title-text").textContent = values[index]);
  }

  /** @param {HTMLElement} title */
  function startTitleScroll(title) {
    const text = title.querySelector(".title-text");
    text.textContent = title.dataset.fullTitle || "";
    title.classList.add("title-hover");
    requestAnimationFrame(() => {
      const style = getComputedStyle(title);
      const availableWidth = title.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const overflow = Math.ceil(text.scrollWidth - availableWidth);
      if (overflow <= 0) return;
      const distance = Math.ceil(text.scrollWidth + 32);
      text.dataset.scrollText = title.dataset.fullTitle;
      title.style.setProperty("--title-scroll-distance", `${-distance}px`);
      title.style.setProperty("--title-scroll-duration", `${Math.max(1200, distance * 30)}ms`);
      title.classList.add("title-scroll");
    });
  }

  /** @param {HTMLElement} title */
  function stopTitleScroll(title) {
    title.classList.remove("title-hover", "title-scroll");
    title.style.removeProperty("--title-scroll-distance");
    title.style.removeProperty("--title-scroll-duration");
    title.querySelector(".title-text").removeAttribute("data-scroll-text");
    fitTitles([title]);
  }

  function applyHeaderHeights() {
    const content = document.getElementById("content");
    if (content.hidden) return;
    const titles = [...document.querySelectorAll("#content > .release .release-title")];
    const headers = [...document.querySelectorAll("#content > .release > .release-header")];
    const key = layoutKey();
    let cached = headerHeightCache.get(key);
    if (!cached) {
      titles.forEach(title => title.style.height = "auto");
      headers.forEach(header => header.style.height = "auto");
      const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
      titles.forEach(title => title.style.height = `${titleHeight}px`);
      cached = { titleHeight };
      headerHeightCache.set(key, cached);
    }
    titles.forEach(title => title.style.height = `${cached.titleHeight}px`);
    headers.forEach(header => header.style.height = "auto");
  }

  function applyArchiveGrid() {
    const archive = document.getElementById("archive");
    const timeline = /** @type {HTMLElement | null} */ (archive.querySelector(".archive-timeline"));
    if (timeline?.classList.contains("archive-date-timeline")) {
      if (!archive.hidden) applyArchiveDateLayout(timeline);
      return;
    }
    const periods = /** @type {HTMLElement[]} */ ([...archive.querySelectorAll(".archive-period")]);
    if (archive.hidden || !timeline || !periods.length) return;
    const style = getComputedStyle(timeline);
    const availableWidth = timeline.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const periodStyle = getComputedStyle(periods[0]);
    const periodWidth = parseFloat(periodStyle.maxWidth) || periods[0].getBoundingClientRect().width;
    const gap = parseFloat(style.columnGap) || 0;
    const maximumColumns = Math.max(1, Math.min(periods.length, Math.floor((availableWidth + gap) / (periodWidth + gap))));
    const remainder = periods.length % maximumColumns;
    const columns = maximumColumns > 2 && remainder === 1 ? maximumColumns - 1 : maximumColumns;
    timeline.style.setProperty("--archive-columns", String(columns));
    timeline.dataset.columns = String(columns);
    periods.forEach((period, index) => {
      const row = Math.floor(index / columns);
      const position = index % columns;
      period.style.gridRow = String(row + 1);
      period.style.gridColumn = String(row % 2 ? columns - position : position + 1);
      period.style.removeProperty("min-height");
      const leftTurnPoint = columns > 1 && (row % 2 ? position === columns - 1 : row > 0 && position === 0);
      period.classList.toggle("archive-left-turn-point", leftTurnPoint);
    });
    const closedTasks = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-tasks[hidden]")]);
    closedTasks.forEach(tasks => { tasks.hidden = false; });
    const expandedHeights = periods.map(period => period.scrollHeight);
    closedTasks.forEach(tasks => { tasks.hidden = true; });
    /** @type {number[]} */
    const rowHeights = [];
    expandedHeights.forEach((height, index) => {
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row] || 0, height);
    });
    periods.forEach((period, index) => { period.style.minHeight = `${rowHeights[Math.floor(index / columns)]}px`; });
    schedule({ archivePath: true });
  }

  /**
   * Plans the wrapped date ruler. Rows are equal-duration, contiguous windows of the archived span
   * that share one pixels-per-millisecond scale, so the ruler stays proportional across rows.
   * @param {HTMLElement} timeline
   */
  function applyArchiveDateLayout(timeline) {
    const style = getComputedStyle(timeline);
    const leftInset = parseFloat(style.paddingLeft) || 0;
    const rightInset = parseFloat(style.paddingRight) || 0;
    const axisTop = parseFloat(style.paddingTop) || 0;
    const timelineWidth = timeline.clientWidth;
    const axisWidth = Math.max(1, timelineWidth - leftInset - rightInset);
    const lines = /** @type {SVGSVGElement | null} */ (timeline.querySelector(".archive-date-lines"));
    const axis = /** @type {SVGPathElement | null} */ (lines?.querySelector(".archive-date-axis-line") || null);
    const fromTime = Number(timeline.dataset.fromTime);
    const toTime = Number(timeline.dataset.toTime);
    if (!lines || !axis || !Number.isFinite(fromTime) || !Number.isFinite(toTime)) return;

    const cards = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-card")]);
    const ticks = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-tick")]);
    const markers = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-marker")]);
    const guides = /** @type {SVGPathElement[]} */ ([...lines.querySelectorAll(".archive-date-guide")]);
    const unmatched = /** @type {HTMLElement | null} */ (timeline.querySelector(".archive-date-unmatched"));
    const totalSpan = Math.max(1, toTime - fromTime);
    const cardTimes = cards.map(card => ({ start: Number(card.dataset.start), end: Number(card.dataset.end) }));
    const longestRange = cardTimes.reduce((longest, times) => Math.max(longest, times.end - times.start), 0);
    const minimumWidth = Math.min(archiveMinimumCardWidth, axisWidth);

    const pitch = archiveRulerPitch[timeline.dataset.scale || "day"] || archiveRulerPitch.day;
    let scale = Math.max(axisWidth / totalSpan, pitch.pixels / pitch.span);
    if (longestRange > 0) scale = Math.min(scale, axisWidth / longestRange);
    let rowCount = Math.max(1, Math.min(archiveMaximumRows, Math.ceil(totalSpan * scale / axisWidth - 1e-9)));
    let rowSpan = totalSpan / rowCount;
    /** @param {number} time */
    const rowOf = time => Math.max(0, Math.min(rowCount - 1, Math.floor((time - fromTime) / rowSpan)));
    while (rowCount > 1 && cardTimes.some(times => rowOf(times.start) !== rowOf(times.end))) {
      rowCount -= 1;
      rowSpan = totalSpan / rowCount;
    }
    /** @param {number} time @param {number} row */
    const xOf = (time, row) => {
      const offset = Math.max(0, Math.min(1, (time - fromTime - row * rowSpan) / rowSpan));
      return leftInset + (row % 2 === 0 ? offset : 1 - offset) * axisWidth;
    };

    const geometry = cards.map((card, index) => {
      const { start, end } = cardTimes[index];
      const row = rowOf(start);
      const startX = xOf(start, row);
      const endX = xOf(end, row);
      const width = Math.max(minimumWidth, Math.abs(endX - startX));
      const anchored = row % 2 === 0 ? Math.min(startX, endX) : Math.max(startX, endX) - width;
      const left = Math.max(leftInset, Math.min(anchored, leftInset + axisWidth - width));
      return { card, row, startX, endX, left, right: left + width, width, lane: 0, top: 0 };
    });

    for (const item of geometry) {
      item.card.style.left = `${item.left}px`;
      item.card.style.width = `${item.width}px`;
    }

    /** @type {number[][]} */
    const laneRights = Array.from({ length: rowCount }, () => []);
    for (const item of [...geometry].sort((left, right) => left.row - right.row || left.left - right.left || left.right - right.right)) {
      const lanes = laneRights[item.row];
      let lane = lanes.findIndex(edge => edge + archiveLaneGap <= item.left);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = item.right;
      item.lane = lane;
    }

    const cardHeights = geometry.map(item => item.card.offsetHeight);
    const unmatchedHeight = unmatched ? unmatched.offsetHeight : 0;

    /** @type {number[]} */
    const rowAxis = [];
    /** @type {number[][]} */
    const laneTops = [];
    let cursor = axisTop;
    for (let row = 0; row < rowCount; row += 1) {
      rowAxis[row] = cursor;
      const heights = laneRights[row].map(() => 0);
      geometry.forEach((item, index) => {
        if (item.row === row) heights[item.lane] = Math.max(heights[item.lane], cardHeights[index]);
      });
      let top = cursor + archiveAxisGap;
      laneTops[row] = [];
      for (let lane = 0; lane < heights.length; lane += 1) {
        laneTops[row][lane] = top;
        top += heights[lane] + archiveLaneGap;
      }
      cursor = (heights.length ? top - archiveLaneGap : cursor + archiveAxisGap) + archiveRowGap;
    }

    geometry.forEach(item => {
      item.top = laneTops[item.row][item.lane];
      item.card.dataset.row = String(item.row);
      item.card.dataset.lane = String(item.lane);
      item.card.style.top = `${item.top}px`;
    });

    for (const tick of ticks) {
      const row = rowOf(Number(tick.dataset.time));
      tick.style.left = `${xOf(Number(tick.dataset.time), row)}px`;
      tick.style.top = `${rowAxis[row]}px`;
    }
    for (const marker of markers) {
      const row = rowOf(Number(marker.dataset.time));
      marker.style.left = `${xOf(Number(marker.dataset.time), row)}px`;
      marker.style.top = `${rowAxis[row]}px`;
    }

    for (const guide of guides) {
      const item = geometry[Number(guide.dataset.entry)];
      if (!item) {
        guide.removeAttribute("d");
        continue;
      }
      const subordinate = guide.classList.contains("archive-date-guide-sub");
      const anchorX = guide.classList.contains("archive-date-guide-end") ? item.endX
        : subordinate ? xOf(Number(guide.dataset.time), item.row)
          : item.startX;
      const x = Math.min(Math.max(anchorX, item.left), item.right);
      guide.setAttribute("d", `M ${x} ${rowAxis[item.row]} L ${x} ${item.top + (subordinate ? 2 : 10)}`);
    }

    let data = "";
    for (let row = 0; row < rowCount; row += 1) {
      const forward = row % 2 === 0;
      const entry = forward ? leftInset : leftInset + axisWidth;
      const exit = forward ? leftInset + axisWidth : leftInset;
      if (row === 0) data = `M ${entry} ${rowAxis[row]}`;
      data += ` L ${exit} ${rowAxis[row]}`;
      if (row + 1 >= rowCount) continue;
      const edge = forward ? timelineWidth - archiveTurnInset : archiveTurnInset;
      const turn = exit + (edge - exit) * archiveTurnHandleScale;
      data += ` C ${turn} ${rowAxis[row]}, ${turn} ${rowAxis[row + 1]}, ${exit} ${rowAxis[row + 1]}`;
    }
    axis.setAttribute("d", data);

    if (unmatched) unmatched.style.top = `${cursor}px`;
    const height = Math.max(cursor + (unmatched ? unmatchedHeight + 28 : 0), axisTop + 120);
    timeline.style.minHeight = `${height}px`;
    lines.style.height = `${height}px`;
  }

  function applyArchivePath() {
    const timeline = /** @type {HTMLElement | null} */ (document.querySelector("#archive .archive-timeline"));
    const line = /** @type {SVGSVGElement | null} */ (timeline?.querySelector(".archive-timeline-line"));
    const path = /** @type {SVGPathElement | null} */ (line?.querySelector(".archive-timeline-path"));
    if (!timeline || !line || !path) return;
    const timelineBounds = timeline.getBoundingClientRect();
    const columns = Number(timeline.dataset.columns) || 1;
    const leftTurn = archiveTurnInset;
    const rightTurn = timelineBounds.width - archiveTurnInset;
    const points = [...timeline.querySelectorAll(".archive-period-dot")].map(dot => {
      const bounds = dot.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2 - timelineBounds.left, y: bounds.top + bounds.height / 2 - timelineBounds.top };
    });
    let data = points.length ? `M ${points[0].x} ${points[0].y}` : "";
    let turnIndex = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (Math.abs(start.y - end.y) < 1 || columns === 1) data += ` L ${end.x} ${end.y}`;
      else {
        const turnEdge = turnIndex % 2 ? leftTurn : rightTurn;
        const turn = start.x + (turnEdge - start.x) * archiveTurnHandleScale;
        data += ` C ${turn} ${start.y}, ${turn} ${end.y}, ${end.x} ${end.y}`;
        turnIndex += 1;
      }
    }
    line.setAttribute("viewBox", `0 0 ${timelineBounds.width} ${timelineBounds.height}`);
    path.setAttribute("d", data);
  }

  function runLayout() {
    layoutFrame = 0;
    const needs = layoutNeeds;
    layoutNeeds = { titles: false, headers: false, scrollbars: false, backlog: false, archive: false, archivePath: false };
    let backlogLeft = null;
    if (needs.backlog) {
      const viewMode = document.querySelector(".view-mode");
      const workspace = document.querySelector(".workspace");
      if (viewMode && workspace) backlogLeft = Math.max(0, viewMode.getBoundingClientRect().left - workspace.getBoundingClientRect().left);
    }
    const backlogGeometryChanged = backlogLeft !== null;
    if (needs.headers) applyHeaderHeights();
    if (needs.titles && !backlogGeometryChanged) fitTitles();
    if (needs.scrollbars && !backlogGeometryChanged) {
      const scrollAreas = [...document.querySelectorAll("#content > .release > .release-content, #backlog > .backlog-content")];
      const overflows = scrollAreas.map(scrollArea => scrollArea.scrollHeight > scrollArea.clientHeight);
      const needsSpace = scrollAreas.map((scrollArea, index) => overflows[index] && scrollArea.offsetWidth - scrollArea.clientWidth < 9);
      scrollAreas.forEach((scrollArea, index) => {
        scrollArea.classList.toggle("has-scrollbar", overflows[index]);
        scrollArea.classList.toggle("needs-scrollbar-space", needsSpace[index]);
      });
    }
    if (needs.archive) applyArchiveGrid();
    if (needs.archivePath && !needs.archive) applyArchivePath();
    if (backlogLeft !== null) {
      document.documentElement.style.setProperty("--backlog-left", `${backlogLeft}px`);
      schedule({ titles: needs.titles, scrollbars: needs.scrollbars });
    }
  }

  /** @param {Partial<Record<"titles" | "headers" | "scrollbars" | "backlog" | "archive" | "archivePath", boolean>>} needs */
  function schedule(needs) {
    for (const [key, value] of Object.entries(needs)) {
      layoutNeeds[/** @type {keyof typeof layoutNeeds} */ (key)] ||= value;
    }
    if (!layoutFrame) layoutFrame = requestAnimationFrame(runLayout);
  }

  function equalizeReleaseHeaders() {
    schedule({ headers: true, titles: true });
  }

  function layout() {
    schedule({ titles: true, headers: true, scrollbars: true, backlog: true, archive: true });
  }

  function archiveTimeline() {
    schedule({ archive: true });
  }

  function contentOverflowChanged() {
    schedule({ scrollbars: true });
  }

  function reset() {
    titleFitCache.clear();
    textWidthCache.clear();
    titleStyleCache.clear();
    headerHeightCache.clear();
  }

  function statusChanged() {
    titleFitCache.clear();
    schedule({ titles: true });
  }

  window.addEventListener("resize", () => {
    reset();
    layout();
  });
  document.fonts.ready.then(() => {
    reset();
    equalizeReleaseHeaders();
    layout();
  });

  app.layout = { reset, statusChanged, equalizeReleaseHeaders, layout, archiveTimeline, contentOverflowChanged, fitTitles, startTitleScroll, stopTitleScroll };
})(window.MDManager);
