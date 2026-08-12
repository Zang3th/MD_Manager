window.MDManager = window.MDManager || {};

(function (app) {
  /** @param {string} message @param {number} [lineNumber] */
  function formatError(message, lineNumber = 1) {
    const error = /** @type {Error & {lineNumber: number}} */ (new Error(message));
    error.name = "MarkdownFormatError";
    error.lineNumber = lineNumber;
    throw error;
  }

  /** @param {string} markdown */
  function validate(markdown) {
    if (!markdown.trim()) formatError("File contains no Markdown content.");
    let invalidCharacterIndex = -1;
    for (let index = 0; index < markdown.length; index += 1) {
      const code = markdown.charCodeAt(index);
      if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 || code === 0xFFFD) {
        invalidCharacterIndex = index;
        break;
      }
    }
    if (invalidCharacterIndex >= 0) {
      const before = markdown.slice(0, invalidCharacterIndex).replace(/\r\n?/g, "\n");
      const line = before.split("\n").length;
      const column = before.length - before.lastIndexOf("\n");
      formatError(`Unreadable character at column ${column}.`, line);
    }

    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let projectHeading = 0;
    let hasFeature = false;
    let archiveTitlePending = false;
    lines.forEach((line, index) => {
      if (/^#{1,4}\s*$/.test(line)) formatError("Heading has no title.", index + 1);
      if (/^\s*#Archive\s*$/i.test(line)) {
        archiveTitlePending = true;
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (!heading) {
        if (line.trim()) archiveTitlePending = false;
        return;
      }
      const level = heading[1].length;
      if (level === 1 && archiveTitlePending) {
        archiveTitlePending = false;
        return;
      }
      archiveTitlePending = false;
      if (level === 1) {
        projectHeading += 1;
        if (projectHeading > 1) formatError("Second project title found.", index + 1);
      } else if (level === 2) {
        if (!projectHeading) formatError("Feature heading appears before project title.", index + 1);
        hasFeature = true;
      } else if (!hasFeature) {
        formatError("Task heading appears before feature heading.", index + 1);
      }
    });
    if (!projectHeading) formatError("File has no project title. Level-one Markdown heading required.");
  }

  /** @param {MDTask} task @returns {MDTaskContent} */
  function taskContent(task) {
    /** @type {MDGroupSection} */
    const initialSection = { lineIndex: -1, descriptions: [], todos: [] };
    /** @type {MDGroupBlock} */
    const initialGroup = { type: "group", title: "", lineIndex: -1, descriptions: [], todos: [], sections: [initialSection] };
    /** @type {MDTaskContent} */
    const result = { blocks: [initialGroup], todos: [] };
    /** @type {MDGroupBlock | null} */
    let group = initialGroup;
    /** @type {MDGroupSection | null} */
    let section = initialSection;
    /** @type {MDNoteBlock | null} */
    let note = null;
    task.lines.forEach((line, lineIndex) => {
      const noteMarker = line.match(/^\s*#(Info|Warn)\s*$/i);
      if (noteMarker) {
        const noteType = noteMarker[1].toLowerCase();
        note = /** @type {MDNoteBlock | undefined} */ (result.blocks.find(block => block.type === "note" && block.noteType === noteType)) || null;
        if (!note) {
          note = { type: "note", noteType, lineIndex, items: [] };
          result.blocks.push(note);
        }
        group = null;
        section = null;
        return;
      }
      const separator = line.match(/^####\s+(.+?)\s*#*\s*$/);
      if (separator) {
        note = null;
        section = { lineIndex, descriptions: [], todos: [] };
        group = { type: "group", title: separator[1], lineIndex, descriptions: [], todos: [], sections: [section] };
        result.blocks.push(group);
        return;
      }
      if (!line.trim() && note) {
        note = null;
        group = initialGroup;
        section = initialSection;
        return;
      }
      const listItem = line.match(/^(\s*)[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (listItem) {
        if (note) note.items.push({ text: listItem[3], indent: listItem[1].replace(/\t/g, "    ").length });
        else {
          const checked = listItem[2]?.toLowerCase() === "x" || /^~.*~$/.test(listItem[3]);
          /** @type {MDTodo} */
          const todo = { type: "todo", lineIndex, checked, text: listItem[3].replace(/^~(.*)~$/, "$1") };
          section?.todos.push(todo);
          group?.todos.push(todo);
          result.todos.push(todo);
        }
      } else if (line.trim() && note) note.items.push({ text: line.trim(), paragraph: true });
      else if (line.trim() && group?.title) {
        if (section?.todos.length) {
          section = { lineIndex, descriptions: [], todos: [] };
          group.sections.push(section);
        }
        /** @type {MDParagraphBlock} */
        const description = { type: "paragraph", text: line.trim() };
        section?.descriptions.push(description);
        group.descriptions.push(description);
        if (section) section.lineIndex = lineIndex;
      }
      else if (line.trim()) result.blocks.push({ type: "paragraph", text: line.trim() });
    });
    return result;
  }

  /** @param {string[]} lines @returns {{markdown: string, info: string, warn: string}} */
  function taskEditorFields(lines) {
    /** @type {{markdown: string[], info: string[], warn: string[]}} */
    const sections = { markdown: [], info: [], warn: [] };
    /** @type {"markdown" | "info" | "warn"} */
    let section = "markdown";
    for (const line of lines) {
      if (/^\s*#Info\s*$/i.test(line)) { section = "info"; continue; }
      if (/^\s*#Warn\s*$/i.test(line)) { section = "warn"; continue; }
      if (/^####\s+.+?\s*#*\s*$/.test(line)) section = "markdown";
      if (!line.trim() && section !== "markdown") { section = "markdown"; continue; }
      sections[section].push(line);
    }
    const clean = (/** @type {string[]} */ values) => values.join("\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    return { markdown: clean(sections.markdown), info: clean(sections.info), warn: clean(sections.warn) };
  }

  /** @param {{markdown: string, info: string, warn: string}} fields @returns {string[]} */
  function composeTaskLines(fields) {
    const clean = (/** @type {string} */ value) => value.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    const blocks = [];
    const embedded = taskEditorFields(clean(fields.markdown).split("\n"));
    const markdown = embedded.markdown;
    const info = clean([embedded.info, fields.info].filter(Boolean).join("\n"));
    const warn = clean([embedded.warn, fields.warn].filter(Boolean).join("\n"));
    if (info) blocks.push(`#Info\n${info}`);
    if (warn) blocks.push(`#Warn\n${warn}`);
    if (markdown) blocks.push(markdown);
    const composed = blocks.join("\n\n");
    return composed ? composed.split("\n") : [];
  }

  /** @param {string} markdown @returns {MDProject} */
  function parse(markdown) {
    validate(markdown);
    const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    /** @type {MDProject} */
    const project = { title: "Untitled Project", newline, beforeFeatures: [], features: [], warnings: [], hasArchive: false, archiveTitle: "Archive" };
    /** @type {MDFeature | null} */
    let feature = null;
    /** @type {MDTask | null} */
    let task = null;
    /** @type {"version" | "date" | "info" | "warn" | null} */
    let featureMetadata = null;
    let pendingBacklog = false;
    let inArchive = false;
    let archiveTitlePending = false;
    let pendingIgnore = false;
    /** @type {{lineNumber: number} | null} */
    let pendingPin = null;
    let pinCount = 0;
    let hasPinnedFeature = false;
    /** @type {Map<MDFeature, number>} */
    const archivedFeatureLines = new Map();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (/^\s*#Ignore\s*$/i.test(line)) {
        pendingIgnore = true;
        continue;
      }
      if (/^\s*#Backlog\s*$/i.test(line)) {
        if (inArchive) formatError("#Backlog cannot appear after the #Archive section has begun.", lineIndex + 1);
        pendingBacklog = true;
        continue;
      }
      if (/^\s*#Archive\s*$/i.test(line)) {
        if (inArchive) formatError("File contains multiple #Archive sections.", lineIndex + 1);
        if (pendingPin) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin is only supported directly before a feature heading and was ignored." });
        project.hasArchive = true;
        inArchive = true;
        archiveTitlePending = true;
        feature = null;
        task = null;
        featureMetadata = null;
        pendingBacklog = false;
        pendingIgnore = false;
        pendingPin = null;
        continue;
      }
      if (/^\s*#Pin\s*$/i.test(line)) {
        pinCount++;
        if (pinCount === 2) project.warnings.push({ lineNumber: lineIndex + 1, message: "File contains multiple #Pin tags. Only the first pinned feature is used." });
        if (!pendingPin) pendingPin = { lineNumber: lineIndex + 1 };
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const title = heading[2].trim();
        if (level === 1 && inArchive && archiveTitlePending) {
          project.archiveTitle = title;
          archiveTitlePending = false;
          continue;
        }
        archiveTitlePending = false;
        const pinned = level === 2 && Boolean(pendingPin) && !pendingBacklog && !inArchive && !hasPinnedFeature;
        if (pendingPin && level !== 2) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin is only supported directly before a feature heading and was ignored." });
        if (pendingPin && level === 2 && pendingBacklog) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin cannot be used on the backlog and was ignored." });
        if (pendingPin && level === 2 && inArchive) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin cannot be used on an archived feature and was ignored." });
        if (level === 1) {
          project.title = title;
          project.beforeFeatures.push(line);
          pendingIgnore = false;
        } else if (level === 2) {
          feature = { title, headerLines: [], version: "", dates: [], notes: [], tasks: [], isBacklog: pendingBacklog, isArchived: inArchive, isPinned: pinned, ignored: pendingIgnore };
          project.features.push(feature);
          if (inArchive) archivedFeatureLines.set(feature, lineIndex + 1);
          if (pinned) hasPinnedFeature = true;
          task = null;
          featureMetadata = null;
          pendingBacklog = false;
          pendingIgnore = false;
        } else if (level === 3 && inArchive && !feature) {
          formatError("Individual tasks are not allowed directly in the #Archive section. Archive complete features instead.", lineIndex + 1);
        } else if (level === 3 && feature) {
          task = { title, lines: [], ignored: pendingIgnore };
          feature.tasks.push(task);
          featureMetadata = null;
          pendingIgnore = false;
        }
        pendingPin = null;
        continue;
      }

      if (pendingBacklog && line.trim()) pendingBacklog = false;
      if (pendingPin && line.trim()) {
        project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin is only supported directly before a feature heading and was ignored." });
        pendingPin = null;
      }

      if (inArchive && !feature && line.trim()) {
        archiveTitlePending = false;
        formatError("Only complete feature cards are allowed in the #Archive section.", lineIndex + 1);
      }
      if (task) task.lines.push(line);
      else if (feature) {
        feature.headerLines.push(line);
        const metadataMarker = line.match(/^\s*#(Version|Date|Info|Warn)\s*$/i);
        if (metadataMarker) {
          featureMetadata = /** @type {"version" | "date" | "info" | "warn"} */ (metadataMarker[1].toLowerCase());
          if (featureMetadata === "info" || featureMetadata === "warn") {
            if (!feature.notes.some(note => note.type === featureMetadata)) feature.notes.push({ type: featureMetadata, items: [] });
          }
          continue;
        }
        const metadataValue = line.match(/^(\s*)[-*+]\s+(.+?)\s*$/);
        if (metadataValue && featureMetadata === "version") {
          if (!feature.version) feature.version = metadataValue[2];
          featureMetadata = null;
        } else if (metadataValue && featureMetadata === "date") {
          const range = metadataValue[2].match(/^(.+?)(?:\s+-\s+(.+))?$/);
          if (!range) continue;
          feature.dates.push({ from: range[1].trim(), to: range[2]?.trim() || "" });
        } else if (metadataValue && (featureMetadata === "info" || featureMetadata === "warn")) {
          feature.notes.find(note => note.type === featureMetadata)?.items.push({ text: metadataValue[2], indent: metadataValue[1].replace(/\t/g, "    ").length });
        } else if (line.trim() && (featureMetadata === "info" || featureMetadata === "warn")) {
          feature.notes.find(note => note.type === featureMetadata)?.items.push({ text: line.trim(), paragraph: true });
        } else if (line.trim()) {
          featureMetadata = null;
        }
      } else project.beforeFeatures.push(line);
    }
    if (pendingPin) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin is only supported directly before a feature heading and was ignored." });
    for (const item of project.features) {
      item.headerLines = composeFeatureLines(featureEditorFields(item.headerLines));
      for (const itemTask of item.tasks) itemTask.lines = composeTaskLines(taskEditorFields(itemTask.lines));
    }
    for (const archivedFeature of project.features.filter(item => item.isArchived)) {
      const todos = archivedFeature.tasks.filter(item => !item.ignored).flatMap(item => taskContent(item).todos);
      if (!todos.length || todos.some(todo => !todo.checked)) {
        formatError(`Archived feature "${archivedFeature.title}" is not 100% complete.`, archivedFeatureLines.get(archivedFeature));
      }
    }
    project.features = [
      ...project.features.filter(feature => !feature.isBacklog && !feature.isArchived),
      ...project.features.filter(feature => feature.isBacklog),
      ...project.features.filter(feature => feature.isArchived)
    ];
    return project;
  }

  /** @param {string} markdown @returns {MDFeature} */
  function parseFeatureMetadata(markdown) {
    const content = markdown.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    const parsed = parse(`# Metadata\n\n## Feature\n${content ? `${content}\n` : ""}\n### Boundary`);
    return parsed.features[0];
  }

  /** @param {string[]} lines @returns {{metadata: string, info: string, warn: string}} */
  function featureEditorFields(lines) {
    /** @type {{metadata: string[], info: string[], warn: string[]}} */
    const sections = { metadata: [], info: [], warn: [] };
    /** @type {"metadata" | "info" | "warn"} */
    let section = "metadata";
    for (const line of lines) {
      if (/^\s*#Info\s*$/i.test(line)) { section = "info"; continue; }
      if (/^\s*#Warn\s*$/i.test(line)) { section = "warn"; continue; }
      if (/^\s*#(?:Version|Date)\s*$/i.test(line)) section = "metadata";
      sections[section].push(line);
    }
    const clean = (/** @type {string[]} */ values) => values.join("\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    return { metadata: clean(sections.metadata), info: clean(sections.info), warn: clean(sections.warn) };
  }

  /** @param {{metadata: string, info: string, warn: string}} fields @returns {string[]} */
  function composeFeatureLines(fields) {
    const blocks = [];
    const clean = (/** @type {string} */ value) => value.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    const embedded = featureEditorFields(clean(fields.metadata).split("\n"));
    const metadata = embedded.metadata;
    const info = clean([embedded.info, fields.info].filter(Boolean).join("\n"));
    const warn = clean([embedded.warn, fields.warn].filter(Boolean).join("\n"));
    if (metadata) blocks.push(metadata);
    if (info) blocks.push(`#Info\n${info}`);
    if (warn) blocks.push(`#Warn\n${warn}`);
    const composed = blocks.join("\n\n");
    return composed ? composed.split("\n") : [];
  }

  /** @param {{metadata: string, info: string, warn: string}} fields @returns {MDFeature} */
  function composeFeatureMetadata(fields) {
    return parseFeatureMetadata(composeFeatureLines(fields).join("\n"));
  }

  /** @param {MDTask} task @param {string[]} [lines] @returns {string[]} */
  function serializeTaskLines(task, lines = task.lines) {
    let note = false;
    return lines.map(line => {
      if (/^\s*#(?:Info|Warn)\s*$/i.test(line)) {
        note = true;
        return line;
      }
      if (/^####\s+.+?\s*#*\s*$/.test(line)) {
        note = false;
        return line;
      }
      if (!line.trim() && note) {
        note = false;
        return line;
      }
      if (note) return line;

      const todo = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
      if (!todo) return line;
      const checked = todo[1]?.toLowerCase() === "x" || /^~.*~$/.test(todo[2]);
      const text = checked && !/^~.*~$/.test(todo[2]) ? `~${todo[2]}~` : todo[2];
      return `- [${checked ? "x" : " "}] ${text}`;
    });
  }

  /** @param {MDFeature} feature */
  function archiveSortKey(feature) {
    const version = feature.version?.trim().match(/^v?(\d+(?:\.\d+)*)(?:[-+].*)?$/i);
    if (version) return { kind: 0, parts: version[1].split(".").map(Number), value: 0 };
    const date = feature.dates?.map(range => archiveDateValue(range.from)).find(value => value !== null);
    if (date !== undefined) return { kind: 1, parts: [], value: date };
    return { kind: 2, parts: [], value: 0 };
  }

  /** @param {string} value @returns {number | null} */
  function archiveDateValue(value) {
    const source = value.trim();
    const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const european = source.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!iso && !european) return null;
    const year = Number(iso?.[1] || european?.[3]);
    const month = Number(iso?.[2] || european?.[2]);
    const day = Number(iso?.[3] || european?.[1]);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
  }

  /** @param {MDFeature} left @param {MDFeature} right */
  function compareArchivedFeatures(left, right) {
    const a = archiveSortKey(left);
    const b = archiveSortKey(right);
    if (a.kind !== b.kind) return a.kind - b.kind;
    if (a.kind === 0) {
      const length = Math.max(a.parts.length, b.parts.length);
      for (let index = 0; index < length; index++) {
        const difference = (a.parts[index] || 0) - (b.parts[index] || 0);
        if (difference) return difference;
      }
      return 0;
    }
    return a.value - b.value;
  }

  /** @param {MDProject} project @returns {string} */
  function serialize(project) {
    const lines = project.beforeFeatures.slice();
    const titleIndex = lines.findIndex(line => /^#\s+/.test(line));
    if (titleIndex >= 0) lines[titleIndex] = `# ${project.title}`;
    const regularFeatures = project.features.filter(feature => !feature.isBacklog && !feature.isArchived);
    const backlogFeatures = project.features.filter(feature => feature.isBacklog);
    const archivedFeatures = project.features.filter(feature => feature.isArchived).sort(compareArchivedFeatures);
    const orderedFeatures = [...regularFeatures, ...backlogFeatures];
    for (const feature of orderedFeatures) {
      if (feature.isBacklog) lines.push("#Backlog");
      if (feature.isPinned && !feature.isBacklog) lines.push("#Pin");
      if (feature.ignored) lines.push("#Ignore");
      lines.push(`## ${feature.title}`, ...composeFeatureLines(featureEditorFields(feature.headerLines)));
      for (const task of feature.tasks) {
        if (task.ignored) lines.push("#Ignore");
        lines.push(`### ${task.title}`, ...serializeTaskLines(task, composeTaskLines(taskEditorFields(task.lines))));
      }
    }
    if (project.hasArchive || archivedFeatures.length) {
      lines.push("#Archive");
      lines.push(`# ${project.archiveTitle || "Archive"}`);
      for (const feature of archivedFeatures) {
        if (feature.ignored) lines.push("#Ignore");
        lines.push(`## ${feature.title}`, ...composeFeatureLines(featureEditorFields(feature.headerLines)));
        for (const task of feature.tasks) {
          if (task.ignored) lines.push("#Ignore");
          lines.push(`### ${task.title}`, ...serializeTaskLines(task, composeTaskLines(taskEditorFields(task.lines))));
        }
      }
    }
    const cleaned = lines;
    const normalized = [];
    for (let index = 0; index < cleaned.length; index++) {
      const line = cleaned[index];
      const heading = /^#{1,3}\s+/.test(line);
      const label = /^####\s+.+?\s*#*\s*$/.test(line);
      const featureMarker = /^\s*#(?:Backlog|Archive|Pin)\s*$/i.test(line);
      if (featureMarker) {
        while (normalized.at(-1)?.trim() === "") normalized.pop();
        if (normalized.length && !/^#(?:Backlog|Archive|Pin)$/i.test(normalized.at(-1)?.trim() || "")) normalized.push("");
        normalized.push(line);
        continue;
      }
      if (!heading && !label) {
        normalized.push(line);
        continue;
      }

      while (normalized.at(-1)?.trim() === "") normalized.pop();
      if (normalized.length && !/^#(?:Backlog|Archive|Pin|Ignore)$/i.test(normalized.at(-1)?.trim() || "")) normalized.push("");
      normalized.push(line);

      while (cleaned[index + 1]?.trim() === "") index++;
      if (heading && cleaned.slice(index + 1).some(nextLine => nextLine.trim())) normalized.push("");
    }
    if (cleaned.at(-1)?.trim() === "" && normalized.at(-1)?.trim() !== "") normalized.push("");
    return normalized.join(project.newline);
  }

  app.markdown = { parse, parseFeatureMetadata, featureEditorFields, composeFeatureMetadata, taskEditorFields, composeTaskLines, serialize, taskContent };
})(window.MDManager);
