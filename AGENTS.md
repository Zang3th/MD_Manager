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
- Regression tests for requested product behavior are part of that behavior and do not require a separate request. Add or update the smallest deterministic regression coverage needed for every behavior change, following the Tests section.
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
- Map every acceptance criterion to deterministic evidence at the cheapest layer that can prove it, as defined in the Tests section, and use explicit measurements for material performance claims.
- Finish with a review packet containing changed files and reasons, acceptance evidence, regression coverage, every added end-to-end test with the existing tests that were considered and why none could be extended, removed or merged tests with the coverage that replaces them, exact commands and results, manual verification when relevant, and remaining risks or skipped evidence.
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
- Treat `data/parsing/Layout.md` as the parsing golden file and preserve the architecture rules.
- Extend checks and regression coverage with behavior changes; never weaken the harness or remove coverage of intended behavior to make a change pass.
- Keep production-file discovery recursive so new nested files cannot escape architecture checks or script-wiring validation.
- Keep production code directly runnable from the local filesystem without installing test dependencies or running a build step.

## Tests

Tests are maintained code with a runtime cost on every local run, agent iteration, and CI job on three operating systems. Keep the suite proportionate to the product: every test must be able to catch a real defect that no cheaper test catches.

### Choosing the layer

- Use `node:test` for DOM-independent rules in `domain/` and `io/markdown.js`. Business rules, parsing, serialization, ranking, aggregation, and state transitions are tested there, including their edge cases.
- Use Playwright Test only for behavior that needs a real browser: wiring between UI and domain, DOM events, keyboard and focus handling, dialogs, SortableJS, persistence and file-access flows, and layout that depends on measured geometry.
- Use the platform visual baselines for appearance. Colors, borders, radii, shadows, fonts, icon choice, and fixed control sizes are covered by screenshots, not by assertions that restate stylesheet values such as `toHaveCSS` with literal colors, pixel sizes, or border widths. Computed values may be asserted where the value itself is the behavior, for example visibility, `cursor`, or `pointer-events`.
- Express layout contracts relative to the page: alignment between elements, containment, absence of overflow, and absence of shifts between states. Use tolerances that survive platform rasterization, about half to one CSS pixel, unless the test is explicitly about device-pixel snapping.
- A rule covered by a unit test needs at most one end-to-end path that proves its wiring, not a browser test per case.

### Adding coverage

- Give a behavior change the smallest coverage that fails without the change.
- A flow is a sequence of user actions, such as activating a search result. Timing, target, expansion, or animation of that sequence are aspects of the same flow, not new flows.
- Before writing a test, search the existing tests for the flow, selector, action, or message. Add a new aspect of an already exercised flow to the existing test and adjust its name; a new end-to-end test needs a flow that no existing test exercises.
- One test covers one flow, and its name states that flow. Do not combine different flows in one test.
- Keep helpers shared by several spec files in `tests/e2e/fixtures.js` and reuse them instead of copying them into a spec file.
- Parameterize over themes, device pixel ratios, or viewport sizes only where the behavior differs between them.

### Determinism and cost

- Test observable behavior with deterministic, isolated, order-independent tests.
- Wait for observable states, such as locator assertions, `expect.poll`, or finished animations, never for fixed delays. Drive application timers with the Playwright clock.
- Make sure the element an action targets is not covered, for example by a notification, instead of letting Playwright retry until the cover disappears.
- Write no artifacts that no assertion reads, such as debug screenshots, and store generated artifacts only in ignored directories.
- A single end-to-end test that takes longer than about three seconds on a developer machine needs a reason in the work specification.
- While iterating, run only the affected spec files or tests, for example `npx playwright test tests/e2e/search.spec.js -g "Enter reveals"`. Run `npm run verify` before finishing.

### Maintaining the suite

- Remove, merge, or rewrite tests that duplicate other coverage, restate stylesheet values, or no longer describe intended behavior. List each removed or merged test in the review packet together with the test or baseline that keeps the behavior covered.
- Fix a test that fails without a product defect, for example because of platform rendering or timing, at its cause or delete it. Do not widen tolerances or add waits only to silence it.
- When a change intentionally alters appearance, update the visual baselines for all platforms with the visual-baselines workflow.
- Do not commit focused, skipped, fixme, or todo tests. Browser tests fail on unexpected console errors and uncaught page errors.
