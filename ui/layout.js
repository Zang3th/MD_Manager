window.MDManager = window.MDManager || {};

(function (app) {
  const dayMs = 24 * 60 * 60 * 1000;
  const archiveTurnInset = 8;
  const archiveTurnHandleScale = 2 / 3;
  const archiveMinimumCardWidth = 220;
  const archiveLaneGap = 16;
  // Width every compressed stretch gets, whatever it skipped. Fixed in pixels so the axis never
  // rescales a break, and wide enough to carry its duration label.
  const archiveGapWidth = 120;
  // Vertical step styles.css lifts each further date-label row by, and the clearance two labels keep
  // before they count as sharing a row.
  const archiveLabelStep = 18;
  const archiveLabelGap = 10;
  const archiveAxisGap = 46;
  const archiveRowGap = 34;
  // Upper bound on how far the date ruler may outgrow the room it is shown in. Beyond this the
  // scale gives way instead, so a sparse span with one dense cluster cannot stretch without end.
  const archiveMaximumAxisWidths = 8;
  /** @type {Record<string, {pixels: number, span: number}>} */
  const archiveRulerPitch = {
    day: { pixels: 26, span: dayMs },
    week: { pixels: 46, span: 7 * dayMs },
    month: { pixels: 78, span: 30.4375 * dayMs },
    year: { pixels: 190, span: 365.25 * dayMs }
  };
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

  function applyArchiveGrid() {
    const archive = document.getElementById("archive");
    const timeline = /** @type {HTMLElement | null} */ (archive.querySelector(".archive-timeline"));
    if (timeline?.classList.contains("archive-date-timeline")) {
      if (!archive.hidden) applyArchiveDateLayout(timeline);
      return;
    }
    // The date ruler carries its own content width. The version grid fills the stage instead, so a
    // width left behind by a previous date layout has to go before the grid is measured.
    timeline?.style.removeProperty("width");
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
    const timelineLeft = timeline.getBoundingClientRect().left;
    const periodLefts = periods.map(period => period.getBoundingClientRect().left - timelineLeft);
    closedTasks.forEach(tasks => { tasks.hidden = true; });
    /** @type {number[]} */
    const rowHeights = [];
    expandedHeights.forEach((height, index) => {
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row] || 0, height);
    });
    periods.forEach((period, index) => { period.style.minHeight = `${rowHeights[Math.floor(index / columns)]}px`; });
    // Distributed grid columns land on fractional positions, which rasterises every period's dot,
    // connector and card border differently. A relative offset pulls each period onto the device
    // pixel grid without changing how the grid distributes the columns.
    const pixelRatio = window.devicePixelRatio || 1;
    periods.forEach((period, index) => {
      const drift = snapToDevicePixel(periodLefts[index], pixelRatio) - periodLefts[index];
      if (drift) period.style.left = `${(parseFloat(period.style.left) || 0) + drift}px`;
    });
    schedule({ archivePath: true });
  }

  /**
   * Plans the date ruler. The whole archived span runs along one straight axis at a single
   * pixels-per-millisecond scale, and a span that needs more room than the view has scrolls
   * horizontally rather than wrapping.
   * @param {HTMLElement} timeline
   */
  function applyArchiveDateLayout(timeline) {
    const style = getComputedStyle(timeline);
    const lines = /** @type {SVGSVGElement | null} */ (timeline.querySelector(".archive-date-lines"));
    const axis = /** @type {SVGPathElement | null} */ (lines?.querySelector(".archive-date-axis-line") || null);
    const fromTime = Number(timeline.dataset.fromTime);
    const toTime = Number(timeline.dataset.toTime);
    if (!lines || !axis || !Number.isFinite(fromTime) || !Number.isFinite(toTime)) return;

    const cards = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-card")]);
    const ticks = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-tick")]);
    const markers = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-marker")]);
    const breaks = /** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-date-break")]);
    const guides = /** @type {SVGPathElement[]} */ ([...lines.querySelectorAll(".archive-date-guide")]);
    const unmatched = /** @type {HTMLElement | null} */ (timeline.querySelector(".archive-date-unmatched"));
    const pixelRatio = window.devicePixelRatio || 1;
    /** @param {number} value */
    const snap = value => snapToDevicePixel(value, pixelRatio);
    /** @param {number} value */
    const snapUp = value => Math.ceil(value * pixelRatio) / pixelRatio;
    const cardBorder = cards.length ? parseFloat(getComputedStyle(/** @type {HTMLElement} */ (cards[0].firstElementChild)).borderLeftWidth) || 0 : 0;
    const tickWidth = ticks.length ? parseFloat(getComputedStyle(ticks[0]).width) || 0 : 0;
    // A date sits on the centre of the card border it opens, not on that border's outer edge, so the
    // guide covering the border still drops exactly out of the dot. The timeline padding is one half
    // border short of the axis inset, which keeps the outermost cards inside the padding box.
    const guideInset = cardBorder / 2;
    const leftInset = (parseFloat(style.paddingLeft) || 0) + guideInset;
    const rightInset = (parseFloat(style.paddingRight) || 0) + guideInset;
    const axisTop = parseFloat(style.paddingTop) || 0;
    // The ruler writes its own width onto the timeline, so the room it has to fill is read from the
    // stage around it. The stage keeps that width whether or not the ruler overflows it.
    const stageWidth = (/** @type {HTMLElement | null} */ (timeline.parentElement))?.clientWidth || timeline.clientWidth;
    const viewWidth = Math.max(1, stageWidth - leftInset - rightInset);
    const totalSpan = Math.max(1, toTime - fromTime);
    const cardTimes = cards.map(card => ({ start: Number(card.dataset.start), end: Number(card.dataset.end) }));
    const minimumWidth = snap(Math.min(archiveMinimumCardWidth, viewWidth));

    // Distinct point dates need a card width plus a lane gap between them, otherwise their columns
    // interleave into one deep pile that no longer says which card belongs to which date. Ranges are
    // excluded: overlapping ranges are concurrent work, and stacking those is the honest picture.
    const pointStarts = [...new Set(cardTimes.filter(times => times.end === times.start).map(times => times.start))].sort((left, right) => left - right);
    let closest = 0;
    for (let index = 1; index < pointStarts.length; index += 1) {
      const distance = pointStarts[index] - pointStarts[index - 1];
      if (distance > 0 && (closest === 0 || distance < closest)) closest = distance;
    }

    // A compressed stretch spends a fixed budget instead of its duration, so the scale below is
    // pixels per millisecond of active time and the whole axis budget reaches the work rather than
    // the void between it. Everything else keeps measuring in that one scale.
    const skipped = breaks.map(node => ({ node, from: Number(node.dataset.from), to: Number(node.dataset.to) }))
      .filter(gap => Number.isFinite(gap.from) && Number.isFinite(gap.to) && gap.to > gap.from)
      .sort((left, right) => left.from - right.from);
    const gapPixels = skipped.length * archiveGapWidth;
    const activeSpan = Math.max(1, totalSpan - skipped.reduce((sum, gap) => sum + (gap.to - gap.from), 0));
    const activeWidth = Math.max(1, viewWidth - gapPixels);

    const pitch = archiveRulerPitch[timeline.dataset.scale || "day"] || archiveRulerPitch.day;
    const densityScale = closest ? (minimumWidth + archiveLaneGap) / closest : 0;
    let scale = Math.max(activeWidth / activeSpan, pitch.pixels / pitch.span, densityScale);
    scale = Math.min(scale, archiveMaximumAxisWidths * activeWidth / activeSpan);
    // The axis carries the whole span in one run, so it is as wide as the scale asks for and never
    // narrower than the view. Everything past the view edge is reached by scrolling.
    const axisWidth = snap(Math.max(viewWidth, activeSpan * scale + gapPixels));

    // Active runs and compressed stretches alternate along the axis, each starting where the one
    // before it ended. Without a compressed stretch this is the single run the ruler always was.
    /** @type {{from: number, to: number, x: number, rate: number}[]} */
    const segments = [];
    let axisCursor = leftInset;
    let segmentStart = fromTime;
    for (const gap of skipped) {
      segments.push({ from: segmentStart, to: gap.from, x: axisCursor, rate: scale });
      axisCursor += (gap.from - segmentStart) * scale;
      segments.push({ from: gap.from, to: gap.to, x: axisCursor, rate: archiveGapWidth / (gap.to - gap.from) });
      axisCursor += archiveGapWidth;
      segmentStart = gap.to;
    }
    segments.push({ from: segmentStart, to: toTime, x: axisCursor, rate: scale });

    /** @param {number} time */
    const xOf = time => {
      const clamped = Math.max(fromTime, Math.min(toTime, time));
      let segment = segments[0];
      for (const candidate of segments) {
        if (candidate.from > clamped) break;
        segment = candidate;
      }
      return snap(segment.x + (clamped - segment.from) * segment.rate);
    };

    const placements = cards.map((card, index) => {
      const { start, end } = cardTimes[index];
      const startX = xOf(start);
      const endX = xOf(end);
      return { card, startX, endX, span: endX - startX + cardBorder };
    });

    // A date at the closing end of the axis has no room left to run along it, so its card turns back
    // and meets the previous column head on. Both then have to share the gap between their dates,
    // which is the one case where the card minimum gives way instead of the columns piling up on top
    // of each other. Half the minimum is the floor; below that piling up reads better than a sliver
    // of a card.
    const closing = leftInset + axisWidth + guideInset;
    const reach = placements.map(item => Math.min(closing - item.startX, closing - item.endX));
    let cardMinimum = minimumWidth;
    if (placements.some((item, index) => item.span < minimumWidth && reach[index] < minimumWidth)) {
      cardMinimum = placements.reduce((closest, item, index) => {
        if (reach[index] < minimumWidth) return closest;
        return Math.min(closest, item.span < minimumWidth ? (reach[index] - archiveLaneGap) / 2 : reach[index] - archiveLaneGap);
      }, cardMinimum);
    }
    cardMinimum = snap(Math.max(minimumWidth / 2, cardMinimum));

    const geometry = placements.map(({ card, startX, endX, span }) => {
      const width = Math.max(cardMinimum, span);
      const left = Math.max(leftInset - guideInset, Math.min(startX - guideInset, closing - width));
      return { card, startX, endX, left, right: left + width, width, lane: 0, top: 0, height: 0 };
    });

    // Written before the heights are read, so the one measured box that depends on the ruler width,
    // the unmatched block, is measured against the width it will actually have.
    timeline.style.width = `${leftInset + axisWidth + rightInset}px`;

    for (const item of geometry) {
      item.card.style.left = `${item.left}px`;
      item.card.style.width = `${item.width}px`;
    }

    /** @type {number[]} */
    const lanes = [];
    for (const item of [...geometry].sort((left, right) => left.left - right.left || left.right - right.right)) {
      let lane = lanes.findIndex(edge => edge + archiveLaneGap <= item.left);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = item.right;
      item.lane = lane;
    }

    // Rounded heights would let a reserved gap drift by the rounding, so the exact box is measured.
    const cardHeights = geometry.map(item => item.card.getBoundingClientRect().height);
    const unmatchedHeight = unmatched ? unmatched.offsetHeight : 0;
    // A label never wraps and is taken out of flow, so its box and its offset from its own dot are
    // the same wherever that dot lands, which makes both readable before the axis is placed.
    const markerBoxes = markers.map(marker => marker.getBoundingClientRect());
    const labelBoxes = markers.map(marker => /** @type {HTMLElement} */ (marker.firstElementChild).getBoundingClientRect());
    // Card widths are set above, so the shared title fitter has to run here rather than in runLayout.
    fitTitles(/** @type {HTMLElement[]} */ ([...timeline.querySelectorAll(".archive-feature-title")]));

    geometry.forEach((item, index) => { item.height = cardHeights[index]; });

    // In date order the axis is the only place a date is written, so a crowded run lifts its labels
    // into rows instead of dropping any of them. Each side of the axis is packed on its own, left to
    // right into the first row the label clears, which keeps the common case on the row it always
    // used and spends a row only where the dates actually collide.
    const labelled = markers.map((marker, index) => {
      const sub = marker.classList.contains("archive-date-marker-sub");
      const centre = markerBoxes[index].top + markerBoxes[index].height / 2;
      // Any row a previous pass already applied is taken back out, so a relayout measures the same
      // reach as a first render instead of compounding its own offset.
      const applied = (Number(marker.style.getPropertyValue("--marker-row")) || 0) * archiveLabelStep;
      return {
        marker,
        sub,
        width: labelBoxes[index].width,
        reach: (sub ? labelBoxes[index].bottom - centre : centre - labelBoxes[index].top) - applied,
        x: xOf(Number(marker.dataset.time))
      };
    });
    /** @param {typeof labelled} tier */
    const assignLabelRows = tier => {
      /** @type {number[]} */
      const rowEnds = [];
      let reserved = 0;
      for (const item of tier) {
        const left = item.x - item.width / 2;
        let row = rowEnds.findIndex(end => left >= end);
        if (row < 0) row = rowEnds.length;
        rowEnds[row] = left + item.width + archiveLabelGap;
        item.marker.style.setProperty("--marker-row", String(row));
        reserved = Math.max(reserved, row * archiveLabelStep + item.reach);
      }
      return reserved;
    };
    const labelsAbove = assignLabelRows(labelled.filter(item => !item.sub));
    const labelsBelow = assignLabelRows(labelled.filter(item => item.sub));

    // Rounding up keeps a reserved gap a gap instead of shaving half a pixel off it.
    const axisY = snapUp(Math.max(axisTop, labelsAbove));
    const axisGap = Math.max(archiveAxisGap, labelsBelow + archiveLaneGap);
    // A card only clears the cards it actually overlaps horizontally, so expanding one stack never
    // reserves space under an unrelated date. Lanes ascend, so every lower lane is already placed.
    const stacked = [...geometry].sort((left, right) => left.lane - right.lane || left.left - right.left);
    let cursor = axisY + axisGap;
    for (const item of stacked) {
      let top = axisY + axisGap;
      for (const placed of stacked) {
        if (placed.lane >= item.lane) break;
        // Actual overlap, without the lane gap padded onto both sides. The gap is what lanes are
        // packed with; demanding it here as well spends a whole row on two cards that already sit
        // clear of each other, which is exactly what the density scale works to avoid.
        if (placed.left < item.right && item.left < placed.right) {
          top = Math.max(top, placed.top + placed.height + archiveLaneGap);
        }
      }
      item.top = snap(top);
      cursor = Math.max(cursor, item.top + item.height);
    }
    cursor += archiveRowGap;

    geometry.forEach(item => {
      item.card.dataset.lane = String(item.lane);
      item.card.style.top = `${item.top}px`;
    });

    // Ticks are one pixel wide, so their box is snapped by its left edge instead of by its centre.
    // A half pixel centre offset would smear every tick across two device pixels, and it would smear
    // each of them by a different amount.
    for (const tick of ticks) {
      tick.style.left = `${snap(xOf(Number(tick.dataset.time)) - tickWidth / 2)}px`;
      tick.style.top = `${axisY}px`;
    }
    for (const marker of markers) {
      marker.style.left = `${xOf(Number(marker.dataset.time))}px`;
      marker.style.top = `${axisY}px`;
    }
    for (const gap of skipped) {
      const left = xOf(gap.from);
      gap.node.style.left = `${left}px`;
      gap.node.style.width = `${xOf(gap.to) - left}px`;
      gap.node.style.top = `${axisY}px`;
    }

    // Guides that share a column would stack their strokes and read darker than a single one, so only
    // the deepest of each column is drawn. It covers every shorter one exactly.
    /** @type {Map<string, {guide: SVGPathElement, bottom: number}>} */
    const columns = new Map();
    for (const guide of guides) {
      const item = geometry[Number(guide.dataset.entry)];
      if (!item) {
        guide.removeAttribute("d");
        continue;
      }
      const subordinate = guide.classList.contains("archive-date-guide-sub");
      const anchorX = guide.classList.contains("archive-date-guide-end") ? item.endX
        : subordinate ? xOf(Number(guide.dataset.time))
          : item.startX;
      const x = snap(Math.min(Math.max(anchorX, item.left + guideInset), item.right - guideInset));
      const bottom = item.top + (subordinate ? 2 : 10);
      const key = `${subordinate ? "sub" : "main"}:${Math.round(x * pixelRatio)}`;
      const current = columns.get(key);
      if (current && current.bottom >= bottom) {
        guide.removeAttribute("d");
        continue;
      }
      if (current) current.guide.removeAttribute("d");
      columns.set(key, { guide, bottom });
      guide.setAttribute("d", `M ${x} ${axisY} L ${x} ${bottom}`);
    }

    // The axis stops at every compressed stretch and picks up again behind it, so the ruler never
    // draws a solid run over time it did not spend.
    let axisPath = `M ${leftInset} ${axisY}`;
    for (const gap of skipped) axisPath += ` L ${xOf(gap.from)} ${axisY} M ${xOf(gap.to)} ${axisY}`;
    axis.setAttribute("d", `${axisPath} L ${leftInset + axisWidth} ${axisY}`);

    if (unmatched) unmatched.style.top = `${snapUp(cursor)}px`;
    const height = Math.max(cursor + (unmatched ? unmatchedHeight + 28 : 0), axisY + 120);
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
    applyScrollbarSize();
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
    schedule({ archive: true, titles: true });
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
