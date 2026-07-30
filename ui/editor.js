window.MDManager = window.MDManager || {};

(function (app) {
  /** @param {HTMLTextAreaElement} textarea @param {string} replacement @param {number} start @param {number} end @param {number} selectionStart @param {number} selectionEnd */
  function replaceText(textarea, replacement, start, end, selectionStart, selectionEnd) {
    textarea.setRangeText(replacement, start, end);
    textarea.setSelectionRange(selectionStart, selectionEnd);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** @param {HTMLTextAreaElement} textarea @param {string} prefix @param {string} suffix @param {string} fallback */
  function toggleWrappedSelection(textarea, prefix, suffix, fallback) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.slice(start, end);
    if (selection && selection.startsWith(prefix) && selection.endsWith(suffix) && selection.length >= prefix.length + suffix.length) {
      const content = selection.slice(prefix.length, selection.length - suffix.length);
      replaceText(textarea, content, start, end, start, start + content.length);
      return;
    }
    if (selection && textarea.value.slice(start - prefix.length, start) === prefix && textarea.value.slice(end, end + suffix.length) === suffix) {
      replaceText(textarea, selection, start - prefix.length, end + suffix.length, start - prefix.length, end - prefix.length);
      return;
    }
    const content = selection || fallback;
    const replacement = `${prefix}${content}${suffix}`;
    replaceText(textarea, replacement, start, end, start + prefix.length, start + prefix.length + content.length);
  }

  /** @param {string} value @param {number} index @param {-1 | 1} direction */
  function adjacentStars(value, index, direction) {
    let count = 0;
    for (let position = index; value[position] === "*"; position += direction) count += 1;
    return count;
  }

  /** @param {HTMLTextAreaElement} textarea */
  function toggleItalic(textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.slice(start, end);
    if (selection && adjacentStars(selection, 0, 1) % 2 === 1 && adjacentStars(selection, selection.length - 1, -1) % 2 === 1) {
      const content = selection.slice(1, -1);
      replaceText(textarea, content, start, end, start, start + content.length);
      return;
    }
    if (selection && adjacentStars(textarea.value, start - 1, -1) % 2 === 1 && adjacentStars(textarea.value, end, 1) % 2 === 1) {
      replaceText(textarea, selection, start - 1, end + 1, start - 1, end - 1);
      return;
    }
    const content = selection || "italic text";
    replaceText(textarea, `*${content}*`, start, end, start + 1, start + 1 + content.length);
  }

  /** @param {HTMLTextAreaElement} textarea */
  function toggleUrl(textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.slice(start, end);
    const wrapped = /^\[([\s\S]*)\]\(([^)\n]+)\)$/.exec(selection);
    if (wrapped) {
      replaceText(textarea, wrapped[1], start, end, start, start + wrapped[1].length);
      return;
    }
    const suffix = selection ? /^\]\(([^)\n]+)\)/.exec(textarea.value.slice(end)) : null;
    if (selection && textarea.value[start - 1] === "[" && suffix) {
      replaceText(textarea, selection, start - 1, end + suffix[0].length, start - 1, end - 1);
      return;
    }
    toggleWrappedSelection(textarea, "[", "](https://example.com)", "link text");
  }

  /** @param {HTMLTextAreaElement} textarea */
  function toggleList(textarea) {
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    let selection = textarea.value.slice(start, end);
    if (!selection) {
      const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
      const nextLine = textarea.value.indexOf("\n", end);
      const lineEnd = nextLine < 0 ? textarea.value.length : nextLine;
      const line = textarea.value.slice(lineStart, lineEnd);
      if (/^\s*[-*+]\s+/.test(line)) {
        start = lineStart;
        end = lineEnd;
        selection = line;
      }
    }
    const lines = selection.split("\n");
    const listLines = lines.map(line => /^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line));
    if (selection && listLines.every(Boolean)) {
      const replacement = listLines.map(match => match ? `${match[1]}${match[2]}` : "").join("\n");
      replaceText(textarea, replacement, start, end, start, start + replacement.length);
      return;
    }
    const content = selection || "list item";
    const replacement = content.split("\n").map(line => `- [ ] ${line}`).join("\n");
    replaceText(textarea, replacement, start, end, start, start + replacement.length);
  }

  /** @param {HTMLTextAreaElement} textarea @param {string} tag */
  function insertTag(textarea, tag) {
    const existing = new RegExp(`^\\s*${tag}\\s*$`, "im").exec(textarea.value);
    if (existing) {
      const position = existing.index + existing[0].length;
      textarea.focus();
      textarea.setSelectionRange(position, position);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.slice(start, end);
    const before = start > 0 ? textarea.value[start - 1] === "\n" ? "\n" : "\n\n" : "";
    const after = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n\n" : "";
    const replacement = `${before}${tag}\n${selection}${after}`;
    const contentStart = start + before.length + tag.length + 1;
    replaceText(textarea, replacement, start, end, contentStart, contentStart + selection.length);
  }

  /** @param {string} value */
  function escapeHtml(value) {
    return value.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character);
  }

  /** @param {string[]} lines */
  function editorMarkdown(lines) {
    return lines.join("\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
  }

  /** @param {string} line */
  function highlightInline(line) {
    const tokens = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|~[^~\n]+~|\*[^*\n]+\*)/g;
    let result = "";
    let offset = 0;
    for (const match of line.matchAll(tokens)) {
      result += escapeHtml(line.slice(offset, match.index));
      const token = match[0];
      const className = token.startsWith("`") ? "markdown-syntax-code" : token.startsWith("[") ? "markdown-syntax-link" : token.startsWith("**") ? "markdown-syntax-bold" : token.startsWith("~") ? "markdown-syntax-strike" : "markdown-syntax-italic";
      const markerLength = token.startsWith("**") ? 2 : token.startsWith("~") || token.startsWith("*") ? 1 : 0;
      const content = markerLength ? `${escapeHtml(token.slice(0, markerLength))}${highlightInline(token.slice(markerLength, -markerLength))}${escapeHtml(token.slice(-markerLength))}` : escapeHtml(token);
      result += `<span class="${className}">${content}</span>`;
      offset = (match.index || 0) + token.length;
    }
    return result + escapeHtml(line.slice(offset));
  }

  /** @param {string} value */
  function highlightMarkdown(value) {
    let codeBlock = false;
    return value.split("\n").map(line => {
      if (/^\s*```/.test(line)) {
        codeBlock = !codeBlock;
        return `<span class="markdown-syntax-code">${escapeHtml(line)}</span>`;
      }
      if (codeBlock) return `<span class="markdown-syntax-code">${escapeHtml(line)}</span>`;
      if (/^\s*#Info\s*$/i.test(line)) return `<span class="markdown-syntax-info">${escapeHtml(line)}</span>`;
      if (/^\s*#Warn\s*$/i.test(line)) return `<span class="markdown-syntax-warn">${escapeHtml(line)}</span>`;
      if (/^\s*#(?:Version|Date)\s*$/i.test(line)) return `<span class="markdown-syntax-tag">${escapeHtml(line)}</span>`;
      if (/^####\s+.+?\s*#*\s*$/.test(line)) return `<span class="markdown-syntax-label">${escapeHtml(line)}</span>`;
      return highlightInline(line);
    }).join("\n");
  }

  /** @param {HTMLTextAreaElement} textarea @param {string} action */
  function formattingActive(textarea, action) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.slice(start, end);
    const patterns = /** @type {Record<string, RegExp>} */ ({
      bold: /\*\*[^*\n]+\*\*/g,
      italic: /(^|[^*])\*[^*\n]+\*(?!\*)/g,
      strikethrough: /~[^~\n]+~/g,
      code: /`[^`\n]+`|```[\s\S]*?```/g,
      url: /\[[^\]\n]+\]\([^)\n]+\)/g
    });
    if (action === "list") {
      const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
      return /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/.test(textarea.value.slice(lineStart));
    }
    if (action === "info" || action === "warn" || action === "version" || action === "date") {
      const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = textarea.value.indexOf("\n", end);
      return new RegExp(`^\\s*#${action}\\s*$`, "i").test(textarea.value.slice(lineStart, lineEnd < 0 ? undefined : lineEnd));
    }
    const pattern = patterns[action];
    if (!pattern) return false;
    for (const match of textarea.value.matchAll(pattern)) {
      const matchStart = (match.index || 0) + (action === "italic" && match[1] ? match[1].length : 0);
      const matchEnd = (match.index || 0) + match[0].length;
      if (selection ? start >= matchStart && end <= matchEnd : start > matchStart && start < matchEnd) return true;
    }
    return false;
  }

  /** @param {HTMLTextAreaElement} textarea @param {string} action */
  function applyMarkdown(textarea, action) {
    if (action === "bold") {
      toggleWrappedSelection(textarea, "**", "**", "bold text");
      return;
    }
    if (action === "italic") {
      toggleItalic(textarea);
      return;
    }
    if (action === "strikethrough") {
      toggleWrappedSelection(textarea, "~", "~", "strikethrough text");
      return;
    }
    if (action === "code") {
      const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (selection.includes("\n") || selection.startsWith("```\n")) toggleWrappedSelection(textarea, "```\n", "\n```", "code");
      else toggleWrappedSelection(textarea, "`", "`", "code");
      return;
    }
    if (action === "url") {
      toggleUrl(textarea);
      return;
    }
    if (action === "list") {
      toggleList(textarea);
      return;
    }
    if (action === "info") insertTag(textarea, "#Info");
    else if (action === "warn") insertTag(textarea, "#Warn");
    else if (action === "version") insertTag(textarea, "#Version");
    else if (action === "date") insertTag(textarea, "#Date");
  }

  /** @param {HTMLTextAreaElement} textarea @param {KeyboardEvent} event */
  function continueList(textarea, event) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || textarea.selectionStart !== textarea.selectionEnd) return;
    const cursor = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", cursor - 1) + 1;
    const lineBeforeCursor = textarea.value.slice(lineStart, cursor);
    const match = /^(\s*)([-*+]\s+(?:\[[ xX]\]\s+)?)(.*)$/.exec(lineBeforeCursor);
    if (!match) return;
    event.preventDefault();
    if (!match[3].trim()) {
      replaceText(textarea, "", lineStart, cursor, lineStart, lineStart);
      return;
    }
    const beforeLine = textarea.value.slice(0, lineStart);
    const sectionMarker = Array.from(beforeLine.matchAll(/^\s*(#Info|#Warn|####\s+.+?)\s*$/gmi)).at(-1)?.[1] || "";
    const taskNote = textarea.id === "taskEditorMarkdown" && /^#(?:Info|Warn)$/i.test(sectionMarker);
    const todo = textarea.id === "taskEditorMarkdown" && !taskNote;
    const marker = todo ? "- [ ] " : match[2].replace(/^[-*+]/, "-").replace(/\[[xX]\]/, "[ ]");
    const insertion = `\n${todo ? "" : match[1]}${marker}`;
    replaceText(textarea, insertion, cursor, cursor, cursor + insertion.length, cursor + insertion.length);
  }

  /** @param {HTMLFormElement} editorForm @param {HTMLElement} toolbar */
  function setupMarkdownEditing(editorForm, toolbar) {
    /** @type {HTMLTextAreaElement | null} */
    let activeTextarea = null;
    /** @type {HTMLInputElement | HTMLTextAreaElement | null} */
    let activeControl = null;
    const fields = /** @type {(HTMLInputElement | HTMLTextAreaElement)[]} */ ([...editorForm.querySelectorAll("input,textarea")]);
    const formatButtons = toolbar.querySelectorAll("button[data-markdown-action]");
    const markdownTextarea = /** @type {HTMLTextAreaElement} */ (toolbar.closest(".markdown-editor-shell")?.querySelector("textarea"));
    const highlight = /** @type {HTMLElement} */ (toolbar.closest(".markdown-editor-shell")?.querySelector(".markdown-highlight"));
    const undoButton = /** @type {HTMLButtonElement} */ (editorForm.querySelector('[data-editor-history="undo"]'));
    const redoButton = /** @type {HTMLButtonElement} */ (editorForm.querySelector('[data-editor-history="redo"]'));
    const helpButton = /** @type {HTMLButtonElement} */ (toolbar.querySelector('[data-editor-help="toggle"]'));
    const help = /** @type {HTMLElement} */ (toolbar.querySelector(".help-popover"));
    /** @type {{values: string[], activeIndex: number, selectionStart: number, selectionEnd: number}[]} */
    let history = [];
    let historyIndex = -1;
    let lastInputType = "";
    let lastInputField = -1;
    /** @type {HTMLTextAreaElement | null} */
    let formattedTextarea = null;
    let formattedValue = "";
    let formattedStart = -1;
    let formattedEnd = -1;

    function renderHighlight() {
      highlight.innerHTML = highlightMarkdown(markdownTextarea.value);
      syncHighlightScroll();
    }

    function syncHighlightScroll() {
      highlight.scrollTop = markdownTextarea.scrollTop;
      highlight.scrollLeft = markdownTextarea.scrollLeft;
    }

    function updateFormatButtons() {
      const start = activeTextarea?.selectionStart ?? -1;
      const end = activeTextarea?.selectionEnd ?? -1;
      const value = activeTextarea?.value ?? "";
      if (formattedTextarea === activeTextarea && formattedValue === value && formattedStart === start && formattedEnd === end) return;
      formattedTextarea = activeTextarea;
      formattedValue = value;
      formattedStart = start;
      formattedEnd = end;
      formatButtons.forEach(button => {
        const active = activeTextarea ? formattingActive(activeTextarea, button.dataset.markdownAction || "") : false;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    /** @param {HTMLInputElement | HTMLTextAreaElement | null} control */
    function capture(control) {
      return {
        values: fields.map(field => field.value),
        activeIndex: control ? fields.indexOf(control) : -1,
        selectionStart: control?.selectionStart || 0,
        selectionEnd: control?.selectionEnd || 0
      };
    }

    function updateHistoryButtons() {
      undoButton.disabled = historyIndex <= 0;
      redoButton.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
    }

    function closeHelp() {
      help.hidden = true;
      helpButton.setAttribute("aria-expanded", "false");
    }

    /** @param {HTMLInputElement | HTMLTextAreaElement} control */
    function rememberSelection(control) {
      const current = history[historyIndex];
      if (!current || !current.values.every((value, index) => value === fields[index].value)) return;
      current.activeIndex = fields.indexOf(control);
      current.selectionStart = control.selectionStart || 0;
      current.selectionEnd = control.selectionEnd || 0;
    }

    /** @param {{values: string[], activeIndex: number, selectionStart: number, selectionEnd: number}} snapshot */
    function restore(snapshot) {
      fields.forEach((field, index) => { field.value = snapshot.values[index]; });
      const control = fields[snapshot.activeIndex] || activeControl;
      if (control) {
        control.focus();
        const start = Math.min(snapshot.selectionStart, control.value.length);
        const end = Math.min(snapshot.selectionEnd, control.value.length);
        control.setSelectionRange(start, end);
      }
      editorForm.dispatchEvent(new Event("input", { bubbles: true }));
      lastInputType = "";
      lastInputField = -1;
      formattedTextarea = null;
      formattedValue = "";
      formattedStart = -2;
      formattedEnd = -1;
      updateHistoryButtons();
    }

    function undo() {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      restore(history[historyIndex]);
    }

    function redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      restore(history[historyIndex]);
    }

    /** @param {Event} event */
    function record(event) {
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
      const fieldIndex = fields.indexOf(event.target);
      const snapshot = capture(event.target);
      const current = history[historyIndex];
      if (!current || current.values.every((value, index) => value === snapshot.values[index])) return;
      if (history[0].values.every((value, index) => value === snapshot.values[index])) {
        history = [history[0]];
        historyIndex = 0;
        lastInputType = "";
        lastInputField = -1;
        updateHistoryButtons();
        return;
      }
      if (current.activeIndex < 0) {
        current.activeIndex = fieldIndex;
        current.selectionStart = snapshot.selectionStart;
        current.selectionEnd = snapshot.selectionEnd;
      }
      if (historyIndex < history.length - 1) history.splice(historyIndex + 1);
      const inputType = event instanceof InputEvent ? event.inputType : "";
      const coalesces = inputType === "insertText" || inputType === "deleteContentBackward" || inputType === "deleteContentForward";
      if (coalesces && inputType === lastInputType && fieldIndex === lastInputField && historyIndex > 0) {
        history[historyIndex] = snapshot;
      } else {
        history.push(snapshot);
        historyIndex += 1;
        if (history.length > 100) {
          history.splice(1, 1);
          historyIndex -= 1;
        }
      }
      lastInputType = coalesces ? inputType : "";
      lastInputField = coalesces ? fieldIndex : -1;
      updateHistoryButtons();
    }

    function reset() {
      activeTextarea = null;
      activeControl = null;
      formatButtons.forEach(button => { button.disabled = true; });
      history = [capture(null)];
      historyIndex = 0;
      lastInputType = "";
      lastInputField = -1;
      updateHistoryButtons();
      updateFormatButtons();
      renderHighlight();
      closeHelp();
    }

    function deactivate() {
      activeTextarea = null;
      activeControl = null;
      formatButtons.forEach(button => { button.disabled = true; });
      updateFormatButtons();
    }

    editorForm.addEventListener("focusin", event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        activeControl = event.target;
        activeTextarea = event.target instanceof HTMLTextAreaElement ? event.target : null;
        formatButtons.forEach(button => { button.disabled = activeTextarea === null; });
        lastInputType = "";
        lastInputField = -1;
        updateFormatButtons();
      } else if (!(event.target instanceof Node) || !toolbar.contains(event.target)) {
        deactivate();
      }
    });
    toolbar.addEventListener("pointerdown", event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button instanceof HTMLButtonElement && !button.disabled) event.preventDefault();
    });
    toolbar.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      if (button.dataset.editorHelp === "toggle") {
        help.hidden = !help.hidden;
        helpButton.setAttribute("aria-expanded", String(!help.hidden));
      } else if (button.dataset.editorHelp === "close") closeHelp();
      else if (activeTextarea) {
        rememberSelection(activeTextarea);
        applyMarkdown(activeTextarea, button.dataset.markdownAction || "");
      }
      button.closest("details")?.removeAttribute("open");
      updateFormatButtons();
    });
    editorForm.addEventListener("pointerdown", event => {
      const button = event.target instanceof Element ? event.target.closest("button[data-editor-history]") : null;
      if (button instanceof HTMLButtonElement && !button.disabled) event.preventDefault();
    });
    editorForm.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("button[data-editor-history]") : null;
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      if (button.dataset.editorHistory === "undo") undo();
      else redo();
      updateFormatButtons();
    });
    editorForm.addEventListener("click", event => {
      if (!(event.target instanceof Element) || !event.target.closest(".markdown-help-menu")) closeHelp();
    });
    editorForm.addEventListener("beforeinput", event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) rememberSelection(event.target);
    });
    editorForm.addEventListener("input", record);
    editorForm.addEventListener("input", () => {
      renderHighlight();
      updateFormatButtons();
    });
    markdownTextarea.addEventListener("scroll", syncHighlightScroll);
    markdownTextarea.addEventListener("select", updateFormatButtons);
    markdownTextarea.addEventListener("click", updateFormatButtons);
    markdownTextarea.addEventListener("keyup", updateFormatButtons);
    fields.forEach(control => control.addEventListener("mousedown", event => {
      if (!(event instanceof MouseEvent) || event.button !== 0 || event.detail !== 2) return;
      const wordCharacter = (/** @type {string | undefined} */ character) => character !== undefined && /[\p{L}\p{N}_]/u.test(character);
      let position = control.selectionStart || 0;
      if (!wordCharacter(control.value[position]) && position > 0 && wordCharacter(control.value[position - 1])) position -= 1;
      if (!wordCharacter(control.value[position])) return;
      let start = position;
      let end = position + 1;
      while (start > 0 && wordCharacter(control.value[start - 1])) start -= 1;
      while (end < control.value.length && wordCharacter(control.value[end])) end += 1;
      event.preventDefault();
      control.focus();
      control.setSelectionRange(start, end);
      updateFormatButtons();
    }));
    editorForm.addEventListener("keydown", event => {
      if (event.key === "Escape" && !help.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeHelp();
        return;
      }
      const key = event.key.toLowerCase();
      const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (modifier && !event.shiftKey && key === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (modifier && ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y"))) {
        event.preventDefault();
        redo();
        return;
      }
      if (!(event.target instanceof HTMLTextAreaElement)) return;
      const textarea = event.target;
      const shortcut = modifier && !event.shiftKey;
      const action = modifier && event.shiftKey && key === "x" ? "strikethrough" : shortcut ? { b: "bold", i: "italic", e: "code", k: "url" }[key] : undefined;
      if (action) {
        event.preventDefault();
        rememberSelection(textarea);
        applyMarkdown(textarea, action);
        return;
      }
      rememberSelection(textarea);
      continueList(textarea, event);
    });

    return { reset, deactivate };
  }

  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("taskEditor"));
  const form = /** @type {HTMLFormElement} */ (document.getElementById("taskEditorForm"));
  const taskMarkdownEditing = setupMarkdownEditing(form, /** @type {HTMLElement} */ (document.getElementById("taskMarkdownToolbar")));
  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById("taskEditorTitle"));
  const markdownInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
  const projectLocation = document.getElementById("taskEditorProject");
  const featureLocation = document.getElementById("taskEditorFeature");
  const taskLocation = document.getElementById("taskEditorLocation");
  const dirty = document.getElementById("taskEditorDirty");
  const saveButton = document.getElementById("saveTaskEditor");
  /** @type {((draft: {title: string, lines: string[]}) => void) | null} */
  let saveDraft = null;
  let commitUnchanged = false;
  let initialTitle = "";
  let initialMarkdown = "";

  function updateDirtyState() {
    const changed = titleInput.value !== initialTitle || markdownInput.value !== initialMarkdown;
    dirty.hidden = !changed;
    saveButton.classList.toggle("dirty", changed);
  }

  function close() {
    dialog.close();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    saveDraft = null;
    commitUnchanged = false;
  }

  /** @param {MDTask} task @param {{project: string, feature: string}} location @param {(draft: {title: string, lines: string[]}) => void} onSave @param {boolean} [isNew] */
  function open(task, location, onSave, isNew = false) {
    initialTitle = task.title;
    initialMarkdown = editorMarkdown(task.lines);
    titleInput.value = initialTitle;
    markdownInput.value = initialMarkdown;
    projectLocation.textContent = location.project;
    featureLocation.textContent = location.feature;
    taskLocation.textContent = task.title;
    dirty.hidden = true;
    saveButton.classList.remove("dirty");
    taskMarkdownEditing.reset();
    saveDraft = onSave;
    commitUnchanged = isNew;
    dialog.showModal();
    dialog.focus();
  }

  form.addEventListener("input", updateDirtyState);
  form.addEventListener("keydown", event => {
    if (event.key === "Escape" && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      event.stopPropagation();
      event.target.blur();
      taskMarkdownEditing.deactivate();
      dialog.focus();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.setCustomValidity("A task title is required.");
      titleInput.reportValidity();
      return;
    }
    titleInput.setCustomValidity("");
    const commit = saveDraft;
    const lines = app.markdown.composeTaskLines({ markdown: markdownInput.value, info: "", warn: "" });
    const draft = { title, lines };
    const changed = commitUnchanged || title !== initialTitle || markdownInput.value !== initialMarkdown;
    close();
    if (changed) commit?.(draft);
  });
  titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
  titleInput.addEventListener("keydown", event => {
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      markdownInput.focus();
      markdownInput.setSelectionRange(0, 0);
      markdownInput.scrollTop = 0;
      markdownInput.scrollLeft = 0;
    }
  });
  document.getElementById("cancelTaskEditor").addEventListener("click", close);
  document.getElementById("closeTaskEditor").addEventListener("click", close);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("pointerdown", event => {
    if (event.target === dialog) close();
  });

  const featureDialog = /** @type {HTMLDialogElement} */ (document.getElementById("featureEditor"));
  const featureForm = /** @type {HTMLFormElement} */ (document.getElementById("featureEditorForm"));
  const featureMarkdownEditing = setupMarkdownEditing(featureForm, /** @type {HTMLElement} */ (document.getElementById("featureMarkdownToolbar")));
  const featureTitle = /** @type {HTMLInputElement} */ (document.getElementById("featureEditorTitle"));
  const featureMetadata = /** @type {HTMLTextAreaElement} */ (document.getElementById("featureEditorMetadata"));
  const featureDirty = document.getElementById("featureEditorDirty");
  const featureSave = document.getElementById("saveFeatureEditor");
  let initialFeature = "";
  /** @type {((draft: {title: string, metadata: string, info: string, warn: string}) => void) | null} */
  let saveFeature = null;
  let commitUnchangedFeature = false;

  function featureDraft() {
    return { title: featureTitle.value, metadata: featureMetadata.value, info: "", warn: "" };
  }

  function closeFeature() {
    featureDialog.close();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    saveFeature = null;
    commitUnchangedFeature = false;
  }

  /** @param {MDProject} project @param {MDFeature} feature @param {(draft: {title: string, metadata: string, info: string, warn: string}) => void} onSave @param {boolean} [isNew] */
  function openFeature(project, feature, onSave, isNew = false) {
    featureTitle.value = feature.title;
    featureMetadata.value = editorMarkdown(feature.headerLines);
    initialFeature = JSON.stringify(featureDraft());
    document.getElementById("featureEditorProject").textContent = project.title;
    document.getElementById("featureEditorFeature").textContent = feature.title;
    featureDirty.hidden = true;
    featureSave.classList.remove("dirty");
    featureMarkdownEditing.reset();
    saveFeature = onSave;
    commitUnchangedFeature = isNew;
    featureDialog.showModal();
    featureDialog.focus();
  }

  featureForm.addEventListener("input", () => {
    const changed = JSON.stringify(featureDraft()) !== initialFeature;
    featureDirty.hidden = !changed;
    featureSave.classList.toggle("dirty", changed);
  });
  featureForm.addEventListener("keydown", event => {
    if (event.key === "Escape" && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      event.stopPropagation();
      event.target.blur();
      featureMarkdownEditing.deactivate();
      featureDialog.focus();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      featureForm.requestSubmit();
    }
  });
  featureForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = featureTitle.value.trim();
    if (!title) {
      featureTitle.setCustomValidity("A feature title is required.");
      featureTitle.reportValidity();
      return;
    }
    featureTitle.setCustomValidity("");
    const commit = saveFeature;
    const draft = { ...featureDraft(), title };
    const changed = commitUnchangedFeature || JSON.stringify(draft) !== initialFeature;
    closeFeature();
    if (changed) commit?.(draft);
  });
  featureTitle.addEventListener("input", () => featureTitle.setCustomValidity(""));
  featureTitle.addEventListener("keydown", event => {
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      featureMetadata.focus();
      featureMetadata.setSelectionRange(0, 0);
      featureMetadata.scrollTop = 0;
      featureMetadata.scrollLeft = 0;
    }
  });
  document.getElementById("cancelFeatureEditor").addEventListener("click", closeFeature);
  document.getElementById("closeFeatureEditor").addEventListener("click", closeFeature);
  featureDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeFeature();
  });
  featureDialog.addEventListener("pointerdown", event => {
    if (event.target === featureDialog) closeFeature();
  });

  app.editor = { open, openFeature };
})(window.MDManager);
