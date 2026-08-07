window.MDManager = window.MDManager || {};

(function (app) {
  const duration = 4000;
  const maxTextLength = 180;
  const errorCopyHint = "Extended details can be copied with the clipboard button.";
  let resizeFrame = 0;
  const dismissTimers = new WeakMap();
  const copyTimers = new WeakMap();

  /** @param {HTMLElement} notification */
  function remove(notification) {
    const timer = dismissTimers.get(notification);
    if (timer !== undefined) window.clearTimeout(timer);
    dismissTimers.delete(notification);
    const copyTimer = copyTimers.get(notification);
    if (copyTimer !== undefined) window.clearTimeout(copyTimer);
    copyTimers.delete(notification);
    notification.remove();
  }

  /** @param {HTMLElement} container */
  function trim(container) {
    const notifications = /** @type {HTMLElement[]} */ ([...container.children]);
    const gap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
    let usedHeight = notifications.reduce((height, notification) => height + notification.offsetHeight, Math.max(0, notifications.length - 1) * gap);
    while (usedHeight > container.clientHeight) {
      const removeIndex = notifications.findIndex(notification => !notification.classList.contains("notification-error"));
      if (removeIndex < 0) break;
      usedHeight -= notifications[removeIndex].offsetHeight;
      if (notifications.length > 1) usedHeight -= gap;
      remove(notifications[removeIndex]);
      notifications.splice(removeIndex, 1);
    }
  }

  /** @param {HTMLElement} notification */
  function fitErrorTag(notification) {
    if (!notification.classList.contains("notification-error")) return;
    const tag = /** @type {HTMLElement | null} */ (notification.querySelector(".notification-tag"));
    const title = /** @type {HTMLElement | null} */ (notification.querySelector(".notification-title"));
    if (!tag || !title) return;
    tag.hidden = false;
    if (title.scrollWidth > title.clientWidth) tag.hidden = true;
  }

  /** @param {HTMLElement} notification */
  function dismiss(notification) {
    if (!notification.isConnected || notification.classList.contains("notification-leaving")) return;
    const timer = dismissTimers.get(notification);
    if (timer !== undefined) window.clearTimeout(timer);
    dismissTimers.delete(notification);
    notification.classList.add("notification-leaving");
    notification.addEventListener("animationend", () => remove(notification), { once: true });
  }

  const symbols = {
    rocket: '<svg class="ui-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="#icon-rocket"></use></svg>',
    confetti: '<svg class="ui-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="#icon-confetti"></use></svg>'
  };

  /** @param {string} value */
  function readableText(value) {
    const leading = /^\s/.test(value) ? " " : "";
    const trailing = /\s$/.test(value) ? " " : "";
    const compact = `${leading}${value.trim().replace(/\s+/g, " ")}${trailing}`;
    return compact.length <= maxTextLength ? compact : `${compact.slice(0, maxTextLength - 1).trimEnd()}…`;
  }

  /** @param {string | Array<string | {value: string}>} body */
  function fullText(body) {
    return typeof body === "string" ? body : body.map(part => typeof part === "string" ? part : part.value).join("");
  }

  /** @param {string} value */
  async function writeClipboard(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy is unavailable.");
  }

  /** @param {HTMLElement} notification @param {HTMLButtonElement} button @param {string} value */
  async function copyError(notification, button, value) {
    try {
      await writeClipboard(value);
      button.querySelector("use")?.setAttribute("href", "#icon-check");
      button.setAttribute("aria-label", "Error copied");
      button.dataset.tooltip = "Copied";
      const currentTimer = copyTimers.get(notification);
      if (currentTimer !== undefined) window.clearTimeout(currentTimer);
      copyTimers.set(notification, window.setTimeout(() => {
        if (!button.isConnected) return;
        button.querySelector("use")?.setAttribute("href", "#icon-clipboard");
        button.setAttribute("aria-label", "Copy error");
        button.dataset.tooltip = "Copy error";
        copyTimers.delete(notification);
      }, 2000));
    } catch {
      button.dataset.tooltip = "Copy failed";
    }
  }

  /** @param {"info" | "warning" | "error"} severity @param {string} title @param {string | Array<string | {value: string}>} body @param {"rocket" | "confetti"} [symbol] @param {string | Array<string | {value: string}>} [copyBody] @param {string} [errorCode] */
  function show(severity, title, body, symbol, copyBody = body, errorCode = "MDM-000") {
    const notification = document.createElement("article");
    notification.className = `notification notification-${severity}`;
    notification.setAttribute("role", severity === "error" ? "alert" : "status");
    notification.setAttribute("aria-atomic", "true");

    const header = document.createElement("header");
    header.className = "notification-header";
    const notificationTitle = document.createElement("span");
    notificationTitle.className = "notification-title";
    notificationTitle.textContent = title;
    const heading = document.createElement("span");
    heading.className = "notification-heading";
    if (symbol) {
      const notificationSymbol = document.createElement("span");
      notificationSymbol.className = `notification-symbol notification-symbol-${symbol}`;
      notificationSymbol.innerHTML = symbols[symbol];
      heading.append(notificationSymbol);
    }
    heading.append(notificationTitle);
    const tag = document.createElement("span");
    tag.className = "notification-tag";
    tag.textContent = severity[0].toUpperCase() + severity.slice(1);
    const controls = document.createElement("div");
    controls.className = "notification-controls";
    controls.append(tag);
    if (severity === "error") {
      const actions = document.createElement("div");
      actions.className = "notification-actions";
      const closeButton = document.createElement("button");
      closeButton.className = "notification-action";
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "Close error");
      closeButton.dataset.tooltip = "Close error";
      closeButton.innerHTML = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-close"></use></svg>';
      closeButton.addEventListener("click", () => dismiss(notification));
      actions.append(closeButton);
      controls.append(actions);
    }
    header.append(heading, controls);

    const notificationBody = document.createElement("div");
    notificationBody.className = "notification-body";
    const notificationMessage = document.createElement("div");
    notificationMessage.className = "notification-message";
    const notificationText = document.createElement("div");
    notificationText.className = "notification-text";
    if (typeof body === "string") notificationText.textContent = readableText(body);
    else body.forEach(part => {
      if (typeof part === "string") notificationText.append(readableText(part));
      else {
        const value = document.createElement("span");
        value.className = "notification-value";
        value.textContent = readableText(part.value);
        notificationText.append(value);
      }
    });
    notificationMessage.append(notificationText);
    notificationBody.append(notificationMessage);
    if (severity === "error") {
      const copyNote = document.createElement("span");
      copyNote.className = "notification-copy-note";
      copyNote.textContent = errorCopyHint;
      const copyButton = document.createElement("button");
      copyButton.className = "notification-action notification-copy-action";
      copyButton.type = "button";
      copyButton.setAttribute("aria-label", "Copy error");
      copyButton.dataset.tooltip = "Copy error";
      copyButton.innerHTML = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 32 32"><use href="#icon-clipboard"></use></svg>';
      copyButton.addEventListener("click", () => { void copyError(notification, copyButton, `Error: Code ${errorCode} ${title}\nDetails: ${fullText(copyBody)}`); });
      notificationBody.append(copyButton, copyNote);
    }
    notification.append(header, notificationBody);
    const container = document.getElementById("notifications");
    container.append(notification);
    fitErrorTag(notification);
    trim(container);
    container.scrollTop = container.scrollHeight;
    if (severity !== "error" && notification.isConnected) dismissTimers.set(notification, window.setTimeout(() => dismiss(notification), duration));
  }

  function blockApplication() {
    document.body.classList.add("startup-blocked");
    document.body.dataset.startupState = "blocked";
    document.querySelectorAll(".header,.workspace,dialog,.watermark").forEach(element => {
      if (element instanceof HTMLElement) element.inert = true;
    });
    document.querySelectorAll("button,input,textarea,select").forEach(control => {
      if (!control.closest("#notifications")) control.disabled = true;
    });
  }

  /** @param {string} title @param {string} body @param {string} [copyBody] @param {string} [errorCode] */
  function fatal(title, body, copyBody = body, errorCode = "MDM-000") {
    blockApplication();
    show("error", title, body, undefined, copyBody, errorCode);
  }

  /** @param {unknown} value */
  function errorMessage(value) {
    if (value instanceof Error) return value.message;
    return typeof value === "string" ? value : "Unknown error occurred.";
  }

  window.addEventListener("error", event => {
    show("error", "Application", "An unexpected application error occurred.", undefined, `Unexpected application error: ${errorMessage(event.error || event.message)}`, "MDM-900");
  });
  window.addEventListener("unhandledrejection", event => {
    show("error", "Application", "An unexpected application error occurred.", undefined, `Unhandled promise rejection: ${errorMessage(event.reason)}`, "MDM-901");
  });

  window.addEventListener("resize", () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const container = document.getElementById("notifications");
      container.querySelectorAll(".notification-error").forEach(notification => {
        if (notification instanceof HTMLElement) fitErrorTag(notification);
      });
      trim(container);
    });
  });

  app.notifications = { show, fatal };
})(window.MDManager);
