# AGENTS.md

## Principles

- Implement only what is explicitly requested, using the smallest localized solution.
- Preserve existing and unrelated behavior.
- Use plain HTML, CSS, and JavaScript.
- No production frameworks, build tools, package managers, web server, or CDN.
- Everything must run directly from the local filesystem.
- SortableJS is the only permitted production dependency and must be stored locally under `vendor/`.
- Test-only dependencies and package-manager tooling are permitted.
- Do not add unrequested features, abstractions, fallbacks, documentation, configuration, or polish.
- Regression tests for requested product behavior are part of that behavior and do not require a separate request. Add or update the smallest deterministic regression coverage needed for every behavior change.
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

- `data/parsing/Layout.md` defines the required Markdown layout and structure and is the parsing golden file.
- Never modify `data/parsing/Layout.md` unless explicitly instructed.
- Match `data/parsing/Layout.md` without inventing missing behavior.
- Never modify `docs/Roadmap.md` unless the user explicitly requests changes to it.

## Performance

- Treat compute time, memory, browser layout, painting, and allocation as finite resources even on modern hardware. Do not choose knowingly naive algorithms or data flows merely because the current fixture is small.
- Consider time complexity, allocation volume, retained memory, DOM size, and frequency of work when designing every hot or repeated path.
- Do not parse, serialize, traverse, measure, allocate, or render data again when neither its input nor its relevant environment changed.
- Cache stable derived values when reuse is meaningful. Give every cache explicit, minimal invalidation conditions and keep it bounded or clear it at well-defined lifecycle boundaries.
- Prefer targeted state and DOM updates over rebuilding the application for localized changes. Avoid cloning, querying, or walking entire projects or DOM subtrees for a single-item change when a direct target is available.
- Avoid layout thrashing: group DOM reads, calculations, and writes into separate phases and never alternate reads and writes inside loops.
- Coalesce layout, resize, scroll, and observer-driven work into at most one pending animation frame. Observe the narrowest useful targets and avoid broad mutation work when a direct event or invalidation signal exists.
- Keep interaction handlers short and interruptible. Move expensive non-visual work out of the immediate input path when doing so preserves deterministic behavior.
- Keep transient collections and queues bounded. Disconnect observers, listeners, audio nodes, and other external resources when their lifecycle ends, and do not retain detached DOM or stale project objects unnecessarily.
- Use compositor-friendly animations where possible and avoid animating properties that repeatedly trigger layout or expensive paint without a demonstrated need.
- Measure representative small and large projects in a real browser. Optimize demonstrated bottlenecks, but prevent obvious algorithmic, allocation, and layout problems during design rather than waiting for a benchmark to expose them.

## Work Specification

- For non-trivial behavior, architecture, performance, or harness changes, keep the active specification in `docs/work/current.md`. Trivial localized corrections may use a proportionally shorter specification, but must still identify the intended outcome and regression evidence.
- Keep exactly one active work item. State the outcome, scope boundaries, affected contracts, observable acceptance criteria, planned regression coverage, and relevant performance impact before implementation.
- Red-team the specification before changing code: check unhappy paths, missing contracts, scope creep, oversized steps, test gaps, cross-platform effects, accessibility, persistence, undo/redo, and repeated-work or layout costs.
- Implement the specification in small ordered steps that each leave the project working. Update the specification before expanding scope; never improvise unrecorded product behavior.
- Map every acceptance criterion to deterministic evidence. Use unit tests for DOM-independent rules, Playwright for browser behavior, visual baselines for stable layout contracts, and explicit measurements for material performance claims.
- Finish with a review packet containing changed files and reasons, acceptance evidence, regression coverage, exact commands and results, manual verification when relevant, and remaining risks or skipped evidence.
- After completion, reset `docs/work/current.md` to its defined empty state. `docs/Roadmap.md` remains user-owned and changes only on explicit request.

## User Experience

- Deliver a modern, consistent, cross-platform experience with immediate and predictable feedback.
- Cross-platform means equivalent behavior, structure, dimensions, typography, icons, and control states in the same supported browser and browser version on Windows, Linux, and macOS. It does not imply support for browsers that lack required platform APIs.
- Use repository-local fonts and deterministic SVG or CSS symbols for visually significant UI. Do not rely on platform-dependent emoji, system icons, or unspecified font fallback when their appearance or metrics affect the layout.
- Account for platform differences in native controls, dialogs, focus rendering, scrollbar metrics, font loading, and input methods. Normalize them where they affect application layout or behavior.
- Treat small rasterization and font-antialiasing differences as platform rendering details, but keep computed sizes, spacing, wrapping, hierarchy, accessible names, and interaction behavior consistent.
- Prevent layout shifts, jumping content, transient incorrect states, and avoidable interaction latency.
- Preserve user context across view changes, including expanded items, enabled view options, and scroll positions where required.
- Use consistent spacing, typography, symbols, colors, borders, hover states, and control dimensions across equivalent components.
- Use short, interruptible, compositor-friendly animations to clarify state changes, and respect `prefers-reduced-motion`.
- Keep hover, active, focus, keyboard, disabled, accessible-name, and ARIA states correct and consistent.

## Development Harness

- The harness consists of strict TypeScript checking for production and harness JavaScript with JSDoc, ESLint with zero warnings, the workflow doctor, the architecture checker and its regression tests, `node:test`, and Playwright Test.
- `npm run verify` runs all checks in that order, fails fast, and is the only Definition of Done for local development, agents, and CI.
- Keep the harness deterministic, isolated, non-interactive, offline during verification, and independent of machine-specific paths or user state.
- Treat `data/parsing/Layout.md` as the parsing golden file and preserve all existing tests, assertions, and architecture rules.
- Extend checks and regression coverage with behavior changes; never weaken the harness to make a change pass.
- Keep production-file discovery recursive so new nested files cannot escape architecture checks or script-wiring validation.
- Do not commit focused, skipped, fixme, or todo tests. Browser tests fail on unexpected console errors and uncaught page errors.

## Tests

- Use `node:test` for DOM-independent unit tests of `domain/` and `io/markdown.js`.
- Use Playwright Test for browser integration, end-to-end, layout, interaction, SortableJS, and persistence tests.
- Keep production code directly runnable from the local filesystem without installing test dependencies or running a build step.
- Do not modify, weaken, skip, replace, or remove existing tests unless the user explicitly requests changes to the tests.
- Product changes may add new tests, but must preserve all existing test coverage and assertions.
- Test observable behavior with deterministic, isolated, order-independent tests.
- Wait for observable states instead of arbitrary delays, and store generated artifacts only in ignored directories.
