window.MDManager = window.MDManager || {};

(function (app) {
  function parse(markdown) {
    const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const project = { title: "Untitled Project", newline, beforeReleases: [], releases: [] };
    let release = null;
    let feature = null;
    let card = null;

    for (const line of lines) {
      const heading = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const title = heading[2].trim();
        if (level === 1) {
          project.title = title;
          project.beforeReleases.push(line);
        } else if (level === 2) {
          release = { title, headerLines: [], version: "", dates: [], features: [] };
          project.releases.push(release);
          feature = card = null;
        } else if (level === 3 && release) {
          feature = { title, headerLines: [], cards: [] };
          release.features.push(feature);
          card = null;
        } else if (level === 4 && feature) {
          card = { title, lines: [] };
          feature.cards.push(card);
        } else {
          (card?.lines || feature?.headerLines || release?.headerLines || project.beforeReleases).push(line);
        }
        continue;
      }

      if (card) card.lines.push(line);
      else if (feature) feature.headerLines.push(line);
      else if (release) {
        release.headerLines.push(line);
        const metadata = line.match(/^\s*[-*+]\s+#(.+?):\s+(.+)\s*$/);
        if (metadata) {
          if (metadata[1].toLowerCase() === "version") release.version = metadata[2].trim();
          else {
            const range = metadata[2].match(/^(.+?)(?:\s+-\s+(.+))?$/);
            release.dates.push({ from: range[1].trim(), to: range[2]?.trim() || "" });
          }
        }
      } else project.beforeReleases.push(line);
    }
    return project;
  }

  function serialize(project) {
    const lines = project.beforeReleases.slice();
    const titleIndex = lines.findIndex(line => /^#\s+/.test(line));
    if (titleIndex >= 0) lines[titleIndex] = `# ${project.title}`;
    for (const release of project.releases) {
      lines.push(`## ${release.title}`, ...release.headerLines);
      for (const feature of release.features) {
        lines.push(`### ${feature.title}`, ...feature.headerLines);
        for (const card of feature.cards) lines.push(`#### ${card.title}`, ...card.lines);
      }
    }
    return lines.join(project.newline);
  }

  app.markdown = { parse, serialize };
})(window.MDManager);
