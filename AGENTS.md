# AGENTS.md

## Principles

- Implement only what is explicitly requested.
- Prefer the smallest possible solution.
- Use plain HTML, CSS, and JavaScript.
- No production frameworks, build tools, package managers, web server, or CDN.
- Everything must run directly from the local filesystem.
- SortableJS is the only permitted production dependency and must be stored locally under `vendor/`.
- Test-only dependencies and package-manager tooling are permitted only for the test suite.
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

## Tests

- Use `node:test` for DOM-independent unit tests of `domain/` and `io/markdown.js`.
- Use Playwright Test for browser integration, end-to-end, layout, interaction, SortableJS, and persistence tests.
- Keep `domain/` and `io/markdown.js` independent of the DOM, files, browser APIs, SortableJS, and test frameworks.
- Keep production code directly runnable from the local filesystem without installing test dependencies or running a build step.
- Do not modify, weaken, skip, replace, or remove existing tests unless the user explicitly requests changes to the tests.
- Product changes may add new tests, but must preserve all existing test coverage and assertions.
- Test observable behavior instead of implementation details where practical.
- Keep tests deterministic, isolated, descriptive, and independent of execution order.
- Do not use arbitrary delays; wait for observable application states.
- Store generated test artifacts only in ignored test-output directories.
