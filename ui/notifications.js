window.MDManager = window.MDManager || {};

(function (app) {
  const duration = 4000;
  let resizeFrame = 0;
  const dismissTimers = new WeakMap();

  /** @param {HTMLElement} notification */
  function remove(notification) {
    const timer = dismissTimers.get(notification);
    if (timer !== undefined) window.clearTimeout(timer);
    dismissTimers.delete(notification);
    notification.remove();
  }

  /** @param {HTMLElement} container */
  function trim(container) {
    const notifications = /** @type {HTMLElement[]} */ ([...container.children]);
    const gap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
    let usedHeight = notifications.reduce((height, notification) => height + notification.offsetHeight, Math.max(0, notifications.length - 1) * gap);
    let removeCount = 0;
    while (usedHeight > container.clientHeight && removeCount < notifications.length) {
      usedHeight -= notifications[removeCount].offsetHeight;
      if (removeCount < notifications.length - 1) usedHeight -= gap;
      removeCount += 1;
    }
    notifications.slice(0, removeCount).forEach(remove);
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
    rocket: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.2 11.8 5.7 14.3l-.3-2.2-2.2-.3 2.5-2.5m3.1 4.2-1.1 3.1 2.7-.9 1.2-2.2M6.5 8.4C8.3 4.3 11.4 2.5 16 2c-.4 4.6-2.2 7.7-6.4 9.5L6.5 8.4Z"/><circle cx="12.4" cy="5.6" r="1.3"/></svg>',
    confetti: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 16 3.2-8 4.8 4.8L4 16Z"/><path d="m7.2 8 4.8 4.8M11 5l.8-2.2M14 8l2.6-.8M8 4.2 6.8 2.4"/><circle cx="15.2" cy="3.7" r=".8"/><circle cx="16.1" cy="11.2" r=".7"/></svg>'
  };

  /** @param {"info" | "error"} severity @param {string} title @param {string | Array<string | {value: string}>} body @param {"rocket" | "confetti"} [symbol] */
  function show(severity, title, body, symbol) {
    const notification = document.createElement("article");
    notification.className = `notification notification-${severity}`;
    notification.setAttribute("role", severity === "info" ? "status" : "alert");
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
    header.append(heading, tag);

    const notificationBody = document.createElement("div");
    notificationBody.className = "notification-body";
    if (typeof body === "string") notificationBody.textContent = body;
    else body.forEach(part => {
      if (typeof part === "string") notificationBody.append(part);
      else {
        const value = document.createElement("span");
        value.className = "notification-value";
        value.textContent = part.value;
        notificationBody.append(value);
      }
    });
    notification.append(header, notificationBody);
    const container = document.getElementById("notifications");
    container.append(notification);
    trim(container);
    if (notification.isConnected) dismissTimers.set(notification, window.setTimeout(() => dismiss(notification), duration));
  }

  /** @param {unknown} value */
  function errorMessage(value) {
    if (value instanceof Error) return value.message;
    return typeof value === "string" ? value : "Unknown error occurred.";
  }

  window.addEventListener("error", event => {
    show("error", "Application", errorMessage(event.error || event.message));
  });
  window.addEventListener("unhandledrejection", event => {
    show("error", "Application", errorMessage(event.reason));
  });

  window.addEventListener("resize", () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      trim(document.getElementById("notifications"));
    });
  });

  app.notifications = { show };
})(window.MDManager);
