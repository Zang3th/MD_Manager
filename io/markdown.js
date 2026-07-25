window.MDManager = window.MDManager || {};

(function (app) {
  function parse(markdown) {
    const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const project = { title: "Untitled Project", newline, beforeFeatures: [], features: [] };
    let feature = null;
    let task = null;
    let featureMetadata = null;

    for (const line of lines) {
      const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const title = heading[2].trim();
        if (level === 1) {
          project.title = title;
          project.beforeFeatures.push(line);
        } else if (level === 2) {
          feature = { title, headerLines: [], version: "", dates: [], notes: [], tasks: [] };
          project.features.push(feature);
          task = null;
          featureMetadata = null;
        } else if (level === 3 && feature) {
          task = { title, lines: [] };
          feature.tasks.push(task);
          featureMetadata = null;
        }
        continue;
      }

      if (task) task.lines.push(line);
      else if (feature) {
        feature.headerLines.push(line);
        const metadataMarker = line.match(/^\s*#(Version|Date|Info|Warn)\s*$/i);
        if (metadataMarker) {
          featureMetadata = metadataMarker[1].toLowerCase();
          if (featureMetadata === "info" || featureMetadata === "warn") {
            feature.notes.push({ type: featureMetadata, items: [] });
          }
          continue;
        }
        const metadataValue = line.match(/^(\s*)[-*+]\s+(.+?)\s*$/);
        if (metadataValue && featureMetadata === "version") {
          if (!feature.version) feature.version = metadataValue[2];
          featureMetadata = null;
        } else if (metadataValue && featureMetadata === "date") {
          const range = metadataValue[2].match(/^(.+?)(?:\s+-\s+(.+))?$/);
          feature.dates.push({ from: range[1].trim(), to: range[2]?.trim() || "" });
        } else if (metadataValue && (featureMetadata === "info" || featureMetadata === "warn")) {
          feature.notes.at(-1).items.push({ text: metadataValue[2], indent: metadataValue[1].replace(/\t/g, "    ").length });
        } else if (line.trim() && (featureMetadata === "info" || featureMetadata === "warn")) {
          feature.notes.at(-1).items.push({ text: line.trim(), paragraph: true });
        } else if (line.trim()) {
          featureMetadata = null;
        }
      } else project.beforeFeatures.push(line);
    }
    return project;
  }

  function serializeTaskLines(task) {
    let note = false;
    return task.lines.map(line => {
      if (/^\s*#(?:Info|Warn)\s*$/i.test(line)) {
        note = true;
        return line;
      }
      if (/^\s*\*\*.+\*\*\s*$/.test(line)) {
        note = false;
        return line;
      }
      if (note) return line;

      const todo = line.match(/^(\s*[-*+]\s+)(?:\[([ xX])\]\s+)?(.*)$/);
      if (!todo) return line;
      const checked = todo[2]?.toLowerCase() === "x" || /^~.*~$/.test(todo[3]);
      const text = checked && !/^~.*~$/.test(todo[3]) ? `~${todo[3]}~` : todo[3];
      return `${todo[1]}[${checked ? "x" : " "}] ${text}`;
    });
  }

  function serialize(project) {
    const lines = project.beforeFeatures.slice();
    const titleIndex = lines.findIndex(line => /^#\s+/.test(line));
    if (titleIndex >= 0) lines[titleIndex] = `# ${project.title}`;
    for (const feature of project.features) {
      lines.push(`## ${feature.title}`, ...feature.headerLines);
      for (const task of feature.tasks) lines.push(`### ${task.title}`, ...serializeTaskLines(task));
    }
    const cleaned = lines;
    const normalized = [];
    for (let index = 0; index < cleaned.length; index++) {
      const line = cleaned[index];
      const heading = /^#{1,3}\s+/.test(line);
      const label = /^\s*\*\*.+\*\*\s*$/.test(line);
      if (!heading && !label) {
        normalized.push(line);
        continue;
      }

      while (normalized.at(-1)?.trim() === "") normalized.pop();
      if (normalized.length) normalized.push("");
      normalized.push(line);

      while (cleaned[index + 1]?.trim() === "") index++;
      if (heading && cleaned.slice(index + 1).some(nextLine => nextLine.trim())) normalized.push("");
    }
    return normalized.join(project.newline);
  }

  app.markdown = { parse, serialize };
})(window.MDManager);
