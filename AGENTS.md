# AGENTS.md

## Principles

- Implement only what is explicitly requested.
- Prefer the smallest possible solution.
- Use plain HTML, CSS, and JavaScript.
- No frameworks, build tools, package managers, web server, or CDN.
- Everything must run directly from the local filesystem.
- SortableJS is the only permitted dependency and must be stored locally under `vendor/`.
- Do not add unrequested features, abstractions, fallbacks, tests, documentation, configuration, or polish.
- Do not refactor unrelated code.
- Follow all requirements literally.

## Architecture

- Markdown is the canonical persistent data source.
- Keep transient application state as plain JavaScript data.
- `domain/` contains pure business rules and state transitions.
- `domain/` must not access the DOM, files, browser APIs, or SortableJS.
- `ui/render.js` renders state and contains no business or persistence logic.
- `ui/interactions.js` handles DOM events and SortableJS callbacks.
- UI interactions must call domain operations instead of directly changing persistent data.
- `io/` handles local file access and Markdown parsing or serialization only.
- `app.js` wires the layers together.
- Use classic deferred scripts and one global namespace. Do not introduce ES modules unless explicitly requested.

## Layout

- `Layout.md` defines the required layout and structure.
- Never modify `Layout.md` unless explicitly instructed.
- Match `Layout.md` without inventing missing behavior.

## Changes

- Keep changes minimal and localized.
- Preserve existing behavior unless explicitly asked to change it.
- Do not introduce speculative improvements.
- When a requirement is ambiguous, choose the simplest interpretation.
