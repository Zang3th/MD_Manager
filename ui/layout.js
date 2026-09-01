window.MDManager = window.MDManager || {};

(function (app) {
  /**
   * Rounds a CSS pixel value onto the device pixel grid. Every date timeline line is placed through
   * this, so all of them share one subpixel phase and rasterise identically at any zoom level.
   * @param {number} value @param {number} ratio
   */
  const snapToDevicePixel = (value, ratio) => Math.round(value * ratio) / ratio;
  /** @type {{size: number, ratio: number} | null} */
  let scrollbarMetric = null;
  /**
   * Publishes the width the browser actually reserves for a stable scrollbar gutter. `scrollbar-width`
   * decides that, not the `::-webkit-scrollbar` box, and its `thin` keyword resolves per platform, so
   * every inset derived from the gutter has to read the real number instead of assuming one. The probe
   * reserves the gutter the same way the panes that matter do, because a plain scrolling box does not
   * reserve the same width. Measured once per device pixel ratio, since browser zoom is what changes it.
   */
  function applyScrollbarSize() {
    const ratio = window.devicePixelRatio || 1;
    if (scrollbarMetric && scrollbarMetric.ratio === ratio) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow-y:auto;scrollbar-gutter:stable;visibility:hidden";
    document.body.appendChild(probe);
    const size = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    scrollbarMetric = { size, ratio };
    document.documentElement.style.setProperty("--scrollbar-size", `${size}px`);
  }
  const titleFitCache = new Map();
  const textWidthCache = new Map();
  const titleStyleCache = new Map();
  const headerHeightCache = new Map();
  const measureContext = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  let layoutFrame = 0;
  let layoutNeeds = { titles: false, headers: false, scrollbars: false, backlog: false, archive: false };

  function layoutKey() {
    return `workspace:${document.body.classList.contains("show-metadata") ? "metadata" : "plain"}`;
  }

  /** @param {CSSStyleDeclaration} style */
  function fontKey(style) {
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}|${style.letterSpacing}`;
  }

  /** @param {HTMLElement} title */
  function titleStyle(title) {
    const type = title.classList.contains("release-title") ? "feature" : title.classList.contains("backlog-title") ? "backlog" : title.classList.contains("archive-feature-title") ? "archive" : "task";
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
    const titles = targets ? [...targets] : /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".release-title, .card-title, .backlog-title, .archive-feature-title")]);
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

  const archiveGridStrides = [1, 2, 3, 4, 5, 7, 10, 14, 20, 28, 40, 60];
  const archiveGridTickCache = new WeakMap();

  /** @param {HTMLElement} timeline */
  function applyArchiveDateGrid(timeline) {
    const axis = /** @type {HTMLElement | null} */ (timeline.querySelector(".archive-date-axis"));
    const plot = /** @type {HTMLElement | null} */ (axis?.querySelector(".archive-axis-plot"));
    if (!axis || !plot) return;
    const plotWidth = plot.getBoundingClientRect().width;
    const pixelRatio = window.devicePixelRatio || 1;
    if (!plotWidth) return;
    const content = /** @type {HTMLElement | null} */ (timeline.closest(".archive-content"));
    // Stable scrollbar gutters reduce clientWidth even though they do not extend the scrollable
    // range. offsetWidth therefore gives the actual horizontal maximum for this borderless pane.
    const horizontalScrollMaximum = content ? Math.max(0, content.scrollWidth - content.offsetWidth) : 0;
    const hasHorizontalOverflow = horizontalScrollMaximum > 1;
    const horizontalScrollLeft = content?.scrollLeft || 0;
    const signature = `${Math.round(plotWidth * pixelRatio)}:${pixelRatio}`;
    content?.classList.toggle("archive-horizontal-overflow", hasHorizontalOverflow);
    content?.classList.toggle("archive-can-scroll-right", horizontalScrollLeft < horizontalScrollMaximum - 1);
    if (timeline.dataset.archiveDateLayout === signature) return;

    let ticks = archiveGridTickCache.get(axis);
    if (!ticks) {
      try {
        ticks = JSON.parse(axis.dataset.archiveGrid || "[]");
      } catch {
        ticks = [];
      }
      archiveGridTickCache.set(axis, ticks);
    }
    const snap = (/** @type {number} */ value) => snapToDevicePixel(value, pixelRatio);
    const positioned = /** @type {Array<{position: number, level: string, labelPosition: number, x: number}>} */ (ticks.map((/** @type {[number, string, number]} */ tick) => ({
      position: tick[0],
      level: tick[1],
      labelPosition: tick[2],
      x: snap(tick[0] / 100 * plotWidth)
    })));
    const majors = positioned.filter(tick => tick.level === "major").sort((left, right) => left.x - right.x);
    const minors = positioned.filter(tick => tick.level === "minor").sort((left, right) => left.x - right.x);
    const minorSteps = minors.slice(1).map((tick, index) => tick.x - minors[index].x).filter(step => step > 0).sort((left, right) => left - right);
    const basePitch = minorSteps.length ? minorSteps[Math.floor(minorSteps.length / 2)] : plotWidth;
    // A ruler that subdivides its cells may only be thinned by a divisor of the steps per cell,
    // otherwise one cell keeps a line where the next one lost it and the cuts stop matching.
    const perCell = Number(axis.dataset.archiveRulerPerCell) || 0;
    // A day view keeps a line on every single day: the days are the unit being read, and the week
    // boundary above them carries the naming.
    const dayScale = axis.dataset.archiveScale === "day";
    const strides = dayScale
      ? [1]
      : perCell > 1
        ? archiveGridStrides.filter(value => perCell % value === 0)
        : archiveGridStrides;
    // A subdivided ruler only has to fit its own label, and its steps are already meaningful
    // boundaries; a date-anchored one needs more room before another arbitrary date earns a line.
    const minimumPitch = perCell > 1 ? 52 : 96;
    const stride = strides.find(value => basePitch * value >= minimumPitch) || strides.at(-1) || 1;
    const minorStroke = Math.max(1, Math.round(pixelRatio)) / pixelRatio;
    const majorStroke = Math.max(1, Math.round(2 * pixelRatio)) / pixelRatio;
    const selectedPitch = basePitch * stride;
    const clearance = selectedPitch / 2;
    const visibleMajors = majors.filter(tick => tick.x >= clearance && tick.x <= plotWidth - clearance);
    // The opening line is the first archived date and always earns its place; it only has to clear
    // the plot edge, not the half-pitch every later line keeps.
    const visibleMinors = minors.filter((tick, index) => index % stride === 0
      && tick.x >= (index === 0 ? majorStroke + 2 : clearance)
      && tick.x <= plotWidth - clearance
      // A subdivision sits inside its cell by construction and can never coincide with a cell
      // boundary, so it does not need the clearance a free-running date line does.
      && (perCell > 1 || visibleMajors.every(major => Math.abs(major.x - tick.x) >= clearance)));
    const endpointInset = majorStroke / 2;
    const segmentMeasurements = [...timeline.querySelectorAll(".archive-active-segment")].map(segment => ({ segment, width: segment.getBoundingClientRect().width }));

    timeline.style.setProperty("--archive-grid-minor-width", `${minorStroke}px`);
    timeline.style.setProperty("--archive-grid-major-width", `${majorStroke}px`);
    for (const svg of timeline.querySelectorAll(".archive-axis-grid,.archive-date-grid")) svg.setAttribute("viewBox", `0 0 ${plotWidth} 100`);
    const pathData = (/** @type {Array<{x: number}>} */ values, /** @type {number} */ fromY, /** @type {number} */ toY) => values.map(tick => `M${tick.x} ${fromY}V${toY}`).join("");
    const endpointData = (/** @type {number} */ fromY, /** @type {number} */ toY) => `M${endpointInset} ${fromY}V${toY}`;
    // The rule sits at y 52 and is drawn last, so a vertical that starts at 51 has its end tucked
    // behind it rather than butting against it. Everything the body grid continues comes up from
    // below and stops there; nothing crosses into the cell row above.
    const ruleUnder = 51;
    const setGridPaths = (/** @type {string} */ selector, /** @type {Array<{x: number}>} */ values, /** @type {number} */ headerTo) => {
      const paths = timeline.querySelectorAll(selector);
      paths[0]?.setAttribute("d", pathData(values, ruleUnder, headerTo));
      paths[1]?.setAttribute("d", pathData(values, 0, 100));
    };
    // A ruler line is a short stub hanging off the rule; a period boundary carries on down through
    // the label row and meets the body grid.
    setGridPaths(".archive-grid-path-minor", visibleMinors, 68);
    setGridPaths(".archive-grid-path-major", visibleMajors, 100);
    // The left plot edge frames the whole header, so it is the one vertical the rule does not close.
    const endpointPaths = timeline.querySelectorAll(".archive-grid-path-endpoint");
    endpointPaths[0]?.setAttribute("d", endpointData(0, 100));
    endpointPaths[1]?.setAttribute("d", endpointData(0, 100));
    timeline.querySelector(".archive-axis-line")?.setAttribute("d", `M${endpointInset} 52H${plotWidth - endpointInset}`);

    // A period name that does not fit its own cell is dropped rather than clipped. Every cell is
    // read before any is written, so this stays one measure pass and one write pass.
    const cellLabels = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-axis-cell-label")]);
    // A label hidden by the previous pass measures zero and would look like it fits, so every one is
    // revealed before any is measured.
    for (const label of cellLabels) label.hidden = false;
    const cellFits = cellLabels.map(label => {
      const cell = /** @type {HTMLElement} */ (label.parentElement);
      return cell.getBoundingClientRect().width - 11 >= label.scrollWidth;
    });
    cellLabels.forEach((label, index) => { label.hidden = !cellFits[index]; });
    // A label belongs to a ruler line, so it appears exactly where one was kept. Deriving both from
    // the same selection stops labels from outnumbering the lines they name.
    const ruledX = new Set([...visibleMinors, ...visibleMajors].map(tick => tick.x));
    // A label always sits on a line, but a line does not always carry a label: a daily ruler is
    // wanted while a date every day is not, so labels keep their own spacing on top of that.
    let previousLabelX = Number.NEGATIVE_INFINITY;
    for (const label of /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-grid-label")])) {
      const x = snap(Number(label.dataset.archiveLabelPosition) / 100 * plotWidth);
      const visible = ruledX.has(x) && x >= 30 && x <= plotWidth - 30 && x - previousLabelX >= 56;
      label.hidden = !visible;
      label.style.left = `${x}px`;
      if (visible) previousLabelX = x;
    }
    segmentMeasurements.forEach(({ segment, width }) => segment.classList.toggle("archive-short-segment", width < 12));
    timeline.dataset.archiveDateLayout = signature;
  }

  function applyArchiveGrid() {
    const archive = document.getElementById("archive");
    const timeline = /** @type {HTMLElement | null} */ (archive.querySelector(".archive-timeline"));
    if (archive.hidden || !timeline) return;
    applyArchiveDateGrid(timeline);
  }

  function runLayout() {
    layoutFrame = 0;
    applyScrollbarSize();
    const needs = layoutNeeds;
    layoutNeeds = { titles: false, headers: false, scrollbars: false, backlog: false, archive: false };
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
    if (backlogLeft !== null) {
      document.documentElement.style.setProperty("--backlog-left", `${backlogLeft}px`);
      schedule({ titles: needs.titles, scrollbars: needs.scrollbars });
    }
  }

  /** @param {Partial<Record<"titles" | "headers" | "scrollbars" | "backlog" | "archive", boolean>>} needs */
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

  app.layout = { reset, statusChanged, equalizeReleaseHeaders, layout, contentOverflowChanged, fitTitles, startTitleScroll, stopTitleScroll };
})(window.MDManager);
