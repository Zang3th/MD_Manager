window.MDManager = window.MDManager || {};

(function (app) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("taskEditor"));
  const form = /** @type {HTMLFormElement} */ (document.getElementById("taskEditorForm"));
  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById("taskEditorTitle"));
  const markdownInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorMarkdown"));
  const infoInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorInfo"));
  const warnInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("taskEditorWarn"));
  const projectLocation = document.getElementById("taskEditorProject");
  const featureLocation = document.getElementById("taskEditorFeature");
  const taskLocation = document.getElementById("taskEditorLocation");
  const dirty = document.getElementById("taskEditorDirty");
  const saveButton = document.getElementById("saveTaskEditor");
  /** @type {((draft: {title: string, lines: string[]}) => void) | null} */
  let saveDraft = null;
  let initialTitle = "";
  let initialMarkdown = "";
  let initialInfo = "";
  let initialWarn = "";

  function updateDirtyState() {
    const changed = titleInput.value !== initialTitle || markdownInput.value !== initialMarkdown || infoInput.value !== initialInfo || warnInput.value !== initialWarn;
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
    const fields = app.markdown.taskEditorFields(task.lines);
    initialMarkdown = fields.markdown;
    initialInfo = fields.info;
    initialWarn = fields.warn;
    titleInput.value = initialTitle;
    markdownInput.value = initialMarkdown;
    infoInput.value = initialInfo;
    warnInput.value = initialWarn;
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
    const lines = app.markdown.composeTaskLines({ markdown: markdownInput.value, info: infoInput.value, warn: warnInput.value });
    const draft = { title, lines };
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

  const featureDialog = /** @type {HTMLDialogElement} */ (document.getElementById("featureEditor"));
  const featureForm = /** @type {HTMLFormElement} */ (document.getElementById("featureEditorForm"));
  const featureTitle = /** @type {HTMLInputElement} */ (document.getElementById("featureEditorTitle"));
  const featureMetadata = /** @type {HTMLTextAreaElement} */ (document.getElementById("featureEditorMetadata"));
  const featureInfo = /** @type {HTMLTextAreaElement} */ (document.getElementById("featureEditorInfo"));
  const featureWarn = /** @type {HTMLTextAreaElement} */ (document.getElementById("featureEditorWarn"));
  const featureDirty = document.getElementById("featureEditorDirty");
  const featureSave = document.getElementById("saveFeatureEditor");
  let initialFeature = "";
  /** @type {((draft: {title: string, metadata: string, info: string, warn: string}) => void) | null} */
  let saveFeature = null;

  function featureDraft() {
    return { title: featureTitle.value, metadata: featureMetadata.value, info: featureInfo.value, warn: featureWarn.value };
  }

  function closeFeature() {
    featureDialog.close();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
    saveFeature = null;
  }

  /** @param {MDProject} project @param {MDFeature} feature @param {(draft: {title: string, metadata: string, info: string, warn: string}) => void} onSave */
  function openFeature(project, feature, onSave) {
    const fields = app.markdown.featureEditorFields(feature.headerLines);
    featureTitle.value = feature.title;
    featureMetadata.value = fields.metadata;
    featureInfo.value = fields.info;
    featureWarn.value = fields.warn;
    initialFeature = JSON.stringify(featureDraft());
    document.getElementById("featureEditorProject").textContent = project.title;
    document.getElementById("featureEditorFeature").textContent = feature.title;
    featureDirty.hidden = true;
    featureSave.classList.remove("dirty");
    saveFeature = onSave;
    featureDialog.showModal();
    requestAnimationFrame(() => featureTitle.focus());
  }

  featureForm.addEventListener("input", () => {
    const changed = JSON.stringify(featureDraft()) !== initialFeature;
    featureDirty.hidden = !changed;
    featureSave.classList.toggle("dirty", changed);
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
    closeFeature();
    commit?.(draft);
  });
  featureTitle.addEventListener("input", () => featureTitle.setCustomValidity(""));
  document.getElementById("cancelFeatureEditor").addEventListener("click", closeFeature);
  document.getElementById("closeFeatureEditor").addEventListener("click", closeFeature);
  featureDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeFeature();
  });
  featureDialog.addEventListener("click", event => {
    if (event.target === featureDialog) closeFeature();
  });

  app.editor = { open, openFeature };
})(window.MDManager);
