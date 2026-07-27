# AGENTS.md

## Principles

- Implement only what is explicitly requested, using the smallest localized solution.
- Preserve existing and unrelated behavior.
- Use plain HTML, CSS, and JavaScript.
- No production frameworks, build tools, package managers, web server, or CDN.
- Everything must run directly from the local filesystem.
- SortableJS is the only permitted production dependency and must be stored locally under `vendor/`.
- Test-only dependencies and package-manager tooling are permitted.
- Do not add unrequested features, abstractions, fallbacks, tests, documentation, configuration, or polish.
- Follow requirements literally; when ambiguous, choose the simplest interpretation.

## Architecture

- Markdown is the canonical persistent data source.
- Keep transient application state as plain JavaScript data.
- `domain/` contains pure business rules and state transitions and must not access the DOM, files, browser APIs, or SortableJS.
- `ui/render.js` renders state and contains no business or persistence logic.
- `ui/interactions.js` handles DOM events and SortableJS callbacks.
- UI interactions must call domain operations instead of directly changing persistent data.
- `io/` handles local file access and Markdown parsing or serialization only and must not access the DOM.
- `io/markdown.js` must also remain independent of files and browser APIs.
- `app.js` wires the layers together.
- Use classic deferred scripts and one global namespace. Do not introduce ES modules unless explicitly requested.

## Layout

- `Layout.md` defines the required layout and structure.
- Never modify `Layout.md` unless explicitly instructed.
- Match `Layout.md` without inventing missing behavior.

## Performance

- Treat responsiveness and low interaction latency as core product requirements.
- Measure performance with representative data in a real browser and optimize demonstrated bottlenecks.
- Avoid layout thrashing: batch DOM reads, calculations, and DOM writes; never alternate reads and writes inside loops.
- Coalesce layout and resize work into one pending animation frame.
- Cache stable derived values with explicit, minimal invalidation conditions; do not recalculate them when dependencies are unchanged.
- Prefer targeted DOM updates over rebuilding the application for localized changes.

## User Experience

- Deliver a modern, consistent, cross-platform experience with immediate and predictable feedback.
- Prevent layout shifts, jumping content, transient incorrect states, and avoidable interaction latency.
- Preserve user context across view changes, including expanded items, enabled view options, and scroll positions where required.
- Use consistent spacing, typography, symbols, colors, borders, hover states, and control dimensions across equivalent components.
- Use short, interruptible, compositor-friendly animations to clarify state changes, and respect `prefers-reduced-motion`.
- Keep hover, active, focus, keyboard, disabled, accessible-name, and ARIA states correct and consistent.

## Development Harness

- The harness consists of strict TypeScript checking for JavaScript with JSDoc, ESLint with zero warnings, the architecture checker, `node:test`, and Playwright Test.
- `npm run verify` runs all checks in that order, fails fast, and is the only Definition of Done for local development, agents, and CI.
- Keep the harness deterministic, isolated, non-interactive, offline during verification, and independent of machine-specific paths or user state.
- Treat `data/Layout.md` as the parsing golden file and preserve all existing tests, assertions, and architecture rules.
- Extend checks and regression coverage with behavior changes; never weaken the harness to make a change pass.

## Tests

- Use `node:test` for DOM-independent unit tests of `domain/` and `io/markdown.js`.
- Use Playwright Test for browser integration, end-to-end, layout, interaction, SortableJS, and persistence tests.
- Keep production code directly runnable from the local filesystem without installing test dependencies or running a build step.
- Do not modify, weaken, skip, replace, or remove existing tests unless the user explicitly requests changes to the tests.
- Product changes may add new tests, but must preserve all existing test coverage and assertions.
- Test observable behavior with deterministic, isolated, order-independent tests.
- Wait for observable states instead of arbitrary delays, and store generated artifacts only in ignored directories.
