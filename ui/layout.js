window.MDManager = window.MDManager || {};

(function (app) {
  const titleFitCache = new Map();
  const textWidthCache = new Map();
  const titleStyleCache = new Map();
  const headerHeightCache = new Map();
  const gridHeightCache = new Map();
  const measureContext = /** @type {CanvasRenderingContext2D} */ (document.createElement("canvas").getContext("2d"));
  /** @type {number | null} */
  let gridIntrinsicWidth = null;
  let layoutFrame = 0;
  let layoutNeeds = { titles: false, headers: false, gridWidth: false, gridHeight: false };

  function layoutKey() {
    return `${document.body.classList.contains("toggle-grid-view") ? "grid" : "board"}:${document.body.classList.contains("show-metadata") ? "metadata" : "plain"}`;
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
    const titles = [...document.querySelectorAll("#content > .release .release-title")];
    const headers = [...document.querySelectorAll("#content > .release > .release-header")];
    const key = layoutKey();
    const grid = document.body.classList.contains("toggle-grid-view");
    let cached = headerHeightCache.get(key);
    if (!cached) {
      titles.forEach(title => title.style.height = "auto");
      headers.forEach(header => header.style.height = "auto");
      const titleHeight = Math.max(0, ...titles.map(title => title.offsetHeight));
      titles.forEach(title => title.style.height = `${titleHeight}px`);
      const headerHeight = grid ? Math.max(0, ...headers.map(header => header.offsetHeight)) : null;
      cached = { titleHeight, headerHeight };
      headerHeightCache.set(key, cached);
    }
    titles.forEach(title => title.style.height = `${cached.titleHeight}px`);
    headers.forEach(header => header.style.height = cached.headerHeight === null ? "auto" : `${cached.headerHeight}px`);
  }

  /** @param {HTMLElement} content */
  function intrinsicGridWidth(content) {
    if (gridIntrinsicWidth !== null) return gridIntrinsicWidth;
    const elements = /** @type {HTMLElement[]} */ ([...content.querySelectorAll(".release-title, .card-title")]);
    const widths = elements.map(element => {
      const style = titleStyle(element);
      const textWidth = measuredTextWidth(element.dataset.fullTitle || "", style);
      if (element.classList.contains("release-title")) {
        return textWidth + (element.closest(".release-heading")?.querySelector(".feature-progress")?.offsetWidth || 0) + 32;
      }
      return textWidth + (element.closest(".card-header")?.querySelector(".task-status")?.offsetWidth || 0) + 40;
    });
    gridIntrinsicWidth = Math.max(240, ...widths);
    return gridIntrinsicWidth;
  }

  function runLayout() {
    layoutFrame = 0;
    const needs = layoutNeeds;
    layoutNeeds = { titles: false, headers: false, gridWidth: false, gridHeight: false };
    const content = document.getElementById("content");
    const grid = document.body.classList.contains("toggle-grid-view");
    if (!grid) {
      content.style.removeProperty("--grid-card-width");
      content.style.removeProperty("--grid-feature-height");
      document.body.style.removeProperty("--grid-card-width");
      document.body.style.removeProperty("--grid-feature-height");
    } else {
      document.querySelectorAll(".title-hover").forEach(title => stopTitleScroll(/** @type {HTMLElement} */ (title)));
      if (needs.gridWidth) {
        const width = Math.min(intrinsicGridWidth(content), content.clientWidth);
        content.style.setProperty("--grid-card-width", `${width}px`);
        document.body.style.setProperty("--grid-card-width", `${width}px`);
      }
    }
    if (needs.headers) applyHeaderHeights();
    if (needs.titles) fitTitles();
    if (grid && needs.gridHeight) {
      const key = layoutKey();
      let height = gridHeightCache.get(key);
      if (!height) {
        const cards = [...content.querySelectorAll(".card")].map(card => ({ card, expanded: card.getAttribute("aria-expanded"), body: card.querySelector(".card-body"), hidden: card.querySelector(".card-body").hidden }));
        const notes = [...content.querySelectorAll(".feature-note")].map(note => ({ note, expanded: note.getAttribute("aria-expanded"), collapsed: note.classList.contains("collapsed") }));
        cards.forEach(({ card, body }) => { card.setAttribute("aria-expanded", "false"); body.hidden = true; });
        notes.forEach(({ note }) => { note.setAttribute("aria-expanded", "false"); note.classList.add("collapsed"); });
        content.style.removeProperty("--grid-feature-height");
        document.body.style.removeProperty("--grid-feature-height");
        height = Math.max(0, ...[...content.querySelectorAll(":scope > .release")].map(feature => feature.offsetHeight));
        gridHeightCache.set(key, height);
        cards.forEach(({ card, body, expanded, hidden }) => { card.setAttribute("aria-expanded", expanded || "false"); body.hidden = hidden; });
        notes.forEach(({ note, expanded, collapsed }) => { note.setAttribute("aria-expanded", expanded || "false"); note.classList.toggle("collapsed", collapsed); });
      }
      content.style.setProperty("--grid-feature-height", `${height}px`);
      document.body.style.setProperty("--grid-feature-height", `${height}px`);
    }
  }

  /** @param {Partial<Record<"titles" | "headers" | "gridWidth" | "gridHeight", boolean>>} needs */
  function schedule(needs) {
    for (const [key, value] of Object.entries(needs)) {
      layoutNeeds[/** @type {keyof typeof layoutNeeds} */ (key)] ||= value;
    }
    if (!layoutFrame) layoutFrame = requestAnimationFrame(runLayout);
  }

  function equalizeReleaseHeaders() {
    schedule({ headers: true, titles: true });
  }

  function layoutGrid(resize = false) {
    schedule({ titles: true, headers: !resize, gridWidth: true, gridHeight: !resize });
  }

  function reset() {
    titleFitCache.clear();
    textWidthCache.clear();
    titleStyleCache.clear();
    headerHeightCache.clear();
    gridHeightCache.clear();
    gridIntrinsicWidth = null;
  }

  function statusChanged() {
    titleFitCache.clear();
    gridIntrinsicWidth = null;
    schedule({ titles: true, gridWidth: true });
  }

  window.addEventListener("resize", () => {
    reset();
    layoutGrid();
  });
  document.fonts.ready.then(() => {
    reset();
    equalizeReleaseHeaders();
    layoutGrid();
  });

  app.layout = { reset, statusChanged, equalizeReleaseHeaders, layoutGrid, fitTitles, startTitleScroll, stopTitleScroll };
})(window.MDManager);
