window.MDManager = window.MDManager || {};

(function () {
  const tooltip = document.getElementById("appTooltip");
  const showDelay = 350;
  let showTimer = 0;
  let positionFrame = 0;
  /** @type {HTMLElement | null} */
  let target = null;

  function hide() {
    window.clearTimeout(showTimer);
    if (positionFrame) cancelAnimationFrame(positionFrame);
    showTimer = 0;
    positionFrame = 0;
    if (target?.getAttribute("aria-describedby") === "appTooltip") target.removeAttribute("aria-describedby");
    target = null;
    tooltip.hidden = true;
  }

  function position() {
    positionFrame = 0;
    if (!target || tooltip.hidden) return;
    const targetBounds = target.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const margin = 8;
    const preferredLeft = targetBounds.left + (targetBounds.width - tooltipBounds.width) / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - tooltipBounds.width - margin, preferredLeft));
    const below = targetBounds.bottom + margin;
    const top = below + tooltipBounds.height <= window.innerHeight - margin ? below : targetBounds.top - tooltipBounds.height - margin;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  /** @param {HTMLElement} nextTarget @param {boolean} immediate */
  function schedule(nextTarget, immediate) {
    hide();
    target = nextTarget;
    target.setAttribute("aria-describedby", "appTooltip");
    showTimer = window.setTimeout(() => {
      if (!target) return;
      tooltip.textContent = target.dataset.tooltip || "";
      tooltip.hidden = false;
      positionFrame = requestAnimationFrame(position);
    }, immediate ? 0 : showDelay);
  }

  /** @param {EventTarget | null} eventTarget */
  function tooltipTarget(eventTarget) {
    return eventTarget instanceof Element ? /** @type {HTMLElement | null} */ (eventTarget.closest("[data-tooltip]")) : null;
  }

  document.addEventListener("pointerover", event => {
    const nextTarget = tooltipTarget(event.target);
    if (nextTarget && nextTarget !== target) schedule(nextTarget, false);
  });
  document.addEventListener("pointerout", event => {
    if (target && !target.contains(/** @type {Node | null} */ (event.relatedTarget))) hide();
  });
  document.addEventListener("focusin", event => {
    const nextTarget = tooltipTarget(event.target);
    if (nextTarget) schedule(nextTarget, true);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, true);
})();
