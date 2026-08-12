---
name: capture-screenshots
description: Capture deterministic, pixel-perfect 2540x1440 PNG screenshots of MD_Manager from every Markdown fixture in res/screenshots/data and generate diagonal dark/light composites. Use when Codex is asked to create, refresh, update, or regenerate the project's start-page, expanded Workspace, task-editor, or Archive screenshot set.
---

# Capture Screenshots

Run the bundled deterministic Playwright workflow from the MD_Manager repository root:

```powershell
node .codex/skills/capture-screenshots/scripts/capture-screenshots.js
```

Do not reproduce the browser sequence manually.

## Workflow contract

The script must:

1. Require `res/screenshots/data` to exist and contain at least one regular `.md` file directly within it. Report the missing or empty directory and exit nonzero before launching Chromium otherwise.
2. Process inputs in stable filename order without modifying them.
3. Capture `start-dark.png` and `start-light.png` once per run.
4. For every input, open it through MD_Manager, expand every Workspace task and feature note, scroll the Workspace to its end, and capture `{stem}-workspace-dark.png` and `{stem}-workspace-light.png`.
5. Open the last Workspace task in document order and capture `{stem}-task-editor-dark.png` and `{stem}-task-editor-light.png`. Fail clearly if the project has no Workspace task.
6. Open Archive, expand every archived feature, scroll its content to the end, and capture `{stem}-archive-dark.png` and `{stem}-archive-light.png`. Capture the empty Archive state when the input has no archived features.
7. Write every original dark/light PNG to `res/screenshots/source`, at exactly 2540x1440 pixels.
8. For each dark/light pair, create a same-size composite in `res/screenshots/modified`. Keep Dark in the upper triangle, clip Light to the lower triangle along the diagonal from bottom-left to top-right, and draw a full-length 8 px `#504945` Gruvbox-gray line on that diagonal.
9. Name each composite after its pair without the theme suffix: `start.png` and `{stem}-{surface}.png`.
10. Fail on application startup errors, invalid Markdown, missing local fonts, unexpected browser errors, incomplete state transitions, composition errors, or incorrect PNG dimensions.

The output stem is a lowercase filesystem-safe form of the Markdown filename. Colliding stems receive deterministic numeric suffixes.

## Completion report

Report the number of Markdown files processed, source screenshots captured, composites generated, and the screenshot root directory. If the script fails, report its exact error and do not claim a complete screenshot set.

