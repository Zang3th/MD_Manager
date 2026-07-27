window.MDManager = window.MDManager || {};

(function (app) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("taskEditor"));
  const form = /** @type {HTMLFormElement} */ (document.getElementById("taskEditorForm"));
  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById("taskEditorTitle"));
  const markdownInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
  const projectLocation = document.getElementById("taskEditorProject");
  const featureLocation = document.getElementById("taskEditorFeature");
  const taskLocation = document.getElementById("taskEditorLocation");
  const dirty = document.getElementById("taskEditorDirty");
  const saveButton = document.getElementById("saveTaskEditor");
  /** @type {((draft: {title: string, lines: string[]}) => void) | null} */
  let saveDraft = null;
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
  }

  /** @param {MDTask} task @param {{project: string, feature: string}} location @param {(draft: {title: string, lines: string[]}) => void} onSave */
  function open(task, location, onSave) {
    initialTitle = task.title;
    initialMarkdown = task.lines.join("\n").replace(/^(?:[ \t]*\n)+/, "");
    titleInput.value = initialTitle;
    markdownInput.value = initialMarkdown;
    projectLocation.textContent = location.project;
    featureLocation.textContent = location.feature;
    taskLocation.textContent = task.title;
    dirty.hidden = true;
    saveButton.classList.remove("dirty");
    saveDraft = onSave;
    dialog.showModal();
    requestAnimationFrame(() => titleInput.focus());
  }

  form.addEventListener("input", updateDirtyState);
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
    const markdown = markdownInput.value.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "");
    const draft = { title, lines: markdown.split("\n") };
    close();
    commit?.(draft);
  });
  titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
  document.getElementById("cancelTaskEditor").addEventListener("click", close);
  document.getElementById("closeTaskEditor").addEventListener("click", close);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) close();
  });

  app.editor = { open };
})(window.MDManager);
