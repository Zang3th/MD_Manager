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
    lines.forEach((line, index) => {
      if (/^#{1,4}\s*$/.test(line)) formatError("Heading has no title.", index + 1);
      const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (!heading) return;
      const level = heading[1].length;
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
    if (markdown) blocks.push(markdown);
    if (info) blocks.push(`#Info\n${info}`);
    if (warn) blocks.push(`#Warn\n${warn}`);
    const composed = blocks.join("\n\n");
    return composed ? composed.split("\n") : [];
  }

  /** @param {string} markdown @returns {MDProject} */
  function parse(markdown) {
    validate(markdown);
    const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    /** @type {MDProject} */
    const project = { title: "Untitled Project", newline, beforeFeatures: [], features: [], warnings: [] };
    /** @type {MDFeature | null} */
    let feature = null;
    /** @type {MDTask | null} */
    let task = null;
    /** @type {"version" | "date" | "info" | "warn" | null} */
    let featureMetadata = null;
    let pendingBacklog = false;
    let pendingIgnore = false;
    /** @type {{lineNumber: number} | null} */
    let pendingPin = null;
    let pinCount = 0;
    let hasPinnedFeature = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (/^\s*#Ignore\s*$/i.test(line)) {
        pendingIgnore = true;
        continue;
      }
      if (/^\s*#Backlog\s*$/i.test(line)) {
        pendingBacklog = true;
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
        const pinned = level === 2 && Boolean(pendingPin) && !pendingBacklog && !hasPinnedFeature;
        if (pendingPin && level !== 2) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin is only supported directly before a feature heading and was ignored." });
        if (pendingPin && level === 2 && pendingBacklog) project.warnings.push({ lineNumber: pendingPin.lineNumber, message: "#Pin cannot be used on the backlog and was ignored." });
        if (level === 1) {
          project.title = title;
          project.beforeFeatures.push(line);
          pendingIgnore = false;
        } else if (level === 2) {
          feature = { title, headerLines: [], version: "", dates: [], notes: [], tasks: [], isBacklog: pendingBacklog, isPinned: pinned, ignored: pendingIgnore };
          project.features.push(feature);
          if (pinned) hasPinnedFeature = true;
          task = null;
          featureMetadata = null;
          pendingBacklog = false;
          pendingIgnore = false;
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
    project.features = [...project.features.filter(feature => !feature.isBacklog), ...project.features.filter(feature => feature.isBacklog)];
    return project;
  }

  /** @param {string} markdown @returns {MDFeature} */
  function parseFeatureMetadata(markdown) {
    const content = markdown.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    const parsed = parse(`# Metadata\n\n## Feature\n${content ? `${content}\n` : ""}\n### Boundary`);
    const feature = parsed.features[0];
    feature.headerLines = content ? content.split("\n") : [];
    return feature;
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

  /** @param {{metadata: string, info: string, warn: string}} fields @returns {MDFeature} */
  function composeFeatureMetadata(fields) {
    const blocks = [];
    const clean = (/** @type {string} */ value) => value.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
    const embedded = featureEditorFields(clean(fields.metadata).split("\n"));
    const metadata = embedded.metadata;
    const info = clean([embedded.info, fields.info].filter(Boolean).join("\n"));
    const warn = clean([embedded.warn, fields.warn].filter(Boolean).join("\n"));
    if (metadata) blocks.push(metadata);
    if (info) blocks.push(`#Info\n${info}`);
    if (warn) blocks.push(`#Warn\n${warn}`);
    return parseFeatureMetadata(blocks.join("\n\n"));
  }

  /** @param {MDTask} task @returns {string[]} */
  function serializeTaskLines(task) {
    let note = false;
    return task.lines.map(line => {
      if (/^\s*#(?:Info|Warn)\s*$/i.test(line)) {
        note = true;
        return line;
      }
      if (/^####\s+.+?\s*#*\s*$/.test(line)) {
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

  /** @param {MDProject} project @returns {string} */
  function serialize(project) {
    const lines = project.beforeFeatures.slice();
    const titleIndex = lines.findIndex(line => /^#\s+/.test(line));
    if (titleIndex >= 0) lines[titleIndex] = `# ${project.title}`;
    const orderedFeatures = [...project.features.filter(feature => !feature.isBacklog), ...project.features.filter(feature => feature.isBacklog)];
    for (const feature of orderedFeatures) {
      if (feature.isBacklog) lines.push("#Backlog");
      if (feature.isPinned && !feature.isBacklog) lines.push("#Pin");
      if (feature.ignored) lines.push("#Ignore");
      lines.push(`## ${feature.title}`, ...feature.headerLines);
      for (const task of feature.tasks) {
        if (task.ignored) lines.push("#Ignore");
        lines.push(`### ${task.title}`, ...serializeTaskLines(task));
      }
    }
    const cleaned = lines;
    const normalized = [];
    for (let index = 0; index < cleaned.length; index++) {
      const line = cleaned[index];
      const heading = /^#{1,3}\s+/.test(line);
      const label = /^####\s+.+?\s*#*\s*$/.test(line);
      const featureMarker = /^\s*#(?:Backlog|Pin)\s*$/i.test(line);
      if (featureMarker) {
        while (normalized.at(-1)?.trim() === "") normalized.pop();
        if (normalized.length && !/^#(?:Backlog|Pin)$/i.test(normalized.at(-1)?.trim() || "")) normalized.push("");
        normalized.push(line);
        continue;
      }
      if (!heading && !label) {
        normalized.push(line);
        continue;
      }

      while (normalized.at(-1)?.trim() === "") normalized.pop();
      if (normalized.length && !/^#(?:Backlog|Pin|Ignore)$/i.test(normalized.at(-1)?.trim() || "")) normalized.push("");
      normalized.push(line);

      while (cleaned[index + 1]?.trim() === "") index++;
      if (heading && cleaned.slice(index + 1).some(nextLine => nextLine.trim())) normalized.push("");
    }
    if (cleaned.at(-1)?.trim() === "" && normalized.at(-1)?.trim() !== "") normalized.push("");
    return normalized.join(project.newline);
  }

  app.markdown = { parse, parseFeatureMetadata, featureEditorFields, composeFeatureMetadata, taskEditorFields, composeTaskLines, serialize, taskContent };
})(window.MDManager);
