import { notifications } from "@zang3th/md-libs/ui";

window.MDManager = window.MDManager || {};

// Notifications of MD_Libs ui/notifications with MD_Manager's symbols, codes and startup blocking.
(function (app) {
  const symbols = {
    rocket: '<svg class="ui-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="#icon-rocket"></use></svg>',
    confetti: '<svg class="ui-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="#icon-confetti"></use></svg>'
  };

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

  /** @param {unknown} value */
  function errorMessage(value) {
    if (value instanceof Error) return value.message;
    return typeof value === "string" ? value : "Unknown error occurred.";
  }

  const stack = notifications.create({
    window,
    container: document.getElementById("notifications"),
    symbols,
    defaultCode: "MDM-000",
    block: blockApplication,
    globalErrors: {
      title: "Application",
      body: "An unexpected application error occurred.",
      codes: { error: "MDM-900", rejection: "MDM-901" },
      details: (kind, value) => `${kind === "error" ? "Unexpected application error" : "Unhandled promise rejection"}: ${errorMessage(value)}`
    }
  });

  /** @param {"info" | "warning" | "error"} severity @param {string} title @param {string | Array<string | {value: string}>} body @param {"rocket" | "confetti"} [symbol] @param {string | Array<string | {value: string}>} [copyBody] @param {string} [errorCode] */
  function show(severity, title, body, symbol, copyBody = body, errorCode = "MDM-000") {
    stack.show(severity, title, body, { symbol, details: copyBody, code: errorCode });
  }

  /** @param {string} title @param {string} body @param {string} [copyBody] @param {string} [errorCode] */
  function fatal(title, body, copyBody = body, errorCode = "MDM-000") {
    stack.fatal(title, body, { details: copyBody, code: errorCode });
  }

  app.notifications = { show, fatal };
})(window.MDManager);
