# MD_Manager

<a href="https://github.com/Zang3th/MD_Manager/actions/workflows/verify.yml"><img src="https://img.shields.io/github/actions/workflow/status/Zang3th/MD_Manager/verify.yml?branch=master&amp;label=Build&amp;logo=github" alt="Build status"></a>
<a href="https://github.com/Zang3th/MD_Manager/releases/latest"><img src="https://img.shields.io/github/v/release/Zang3th/MD_Manager?display_name=tag&amp;sort=semver&amp;label=Latest%20release&amp;logo=markdown&amp;color=blue" alt="Latest release"></a>

MD_Manager is an interactive, fully local Markdown project workspace for Git, automation, and AI agents.<br>
Plan visually while keeping your project data open, portable, and human-readable.

![MD_Manager workspace in Gruvbox Dark and Light](res/screenshots/modified/project1-workspace.png)

## Key features

- Visual planning in a focused workspace. Optimized for both landscape and portrait monitors.
- Releases, tasks, todos, backlog, metadata, and progress tracking.
- Drag and drop, copy and paste, and keyboard controls.
- Undo and redo with view-state restoration.
- External-change detection, reload or overwrite resolution, and retryable saves.
- Markdown editing with tags, templates, and inline formatting.
- Archive timeline ordered by date or version, with selectable resolution.
- Fully local and offline, with no cloud services, installation, build step, or web server.

<table>
  <tr>
    <td width="50%"><img src="res/screenshots/source/project2-task-editor-light.png" alt="Task editor in Gruvbox Light"></td>
    <td width="50%"><img src="res/screenshots/source/project2-archive-dark.png" alt="Archive timeline in Gruvbox Dark"></td>
  </tr>
  <tr>
    <td align="center">Editing dialog</td>
    <td align="center">Archive timeline</td>
  </tr>
</table>

<p align="center"><em>Themes: Gruvbox Light / Dark.</em></p>

## Quick Start

### Launching

The application consists of plain HTML, CSS, and JavaScript. It has no build step, package-manager runtime, web server, framework, or CDN dependency.

Just open `MD_Manager.html` in a Chromium-based browser with support for the File System Access API.

### Markdown Example

An example is stored locally in [`data/parsing/Layout.md`](https://github.com/Zang3th/MD_Manager/blob/master/data/parsing/Layout.md) which also serves as the golden file for parsing.

### Data

- Markdown is the canonical project format.
- Parsing creates plain JavaScript state.
- Serialization writes state changes back to the open file.
- File handles for the five most recently opened projects are stored in IndexedDB.
  - Project content remains in its Markdown file.

The document base structure is:

```text
# Project
└── ## Feature
    └── ### Task
        ├── #### Grouping
        └── - [ ] Todo
```

Supported tags:

- `#Version` and `#Date` define release metadata.
- `#Info` and `#Warn` add contextual notes to features and tasks.
- `#Ignore` preserves the following feature or task in Markdown while hiding it from the application.
- `#Archive` start the archive section. Only finished features can be archived.
- `#Backlog` starts the backlog section. Only tasks can be put in the backlog.
- `#Pin` marks a single feature for fast navigation and highlighting.

Supported formatting:

- `**bold**`, `*italic*`, `~strikethrough~`, and `` `inline code` ``.
- Links, paragraphs, and nested unordered lists.

## Technical implementation

MD_Manager uses a layered architecture built around Markdown as the data source. Pure domain operations manage state transitions independently of the DOM, the I/O layer handles parsing and local file access, and the UI layer renders state and delegates persistent changes back to the domain. `app.js` connects these layers and coordinates the application lifecycle, keeping business rules, persistence, and presentation independently testable.

Localized state changes use targeted DOM updates where possible. Repeated layout work is coalesced through animation frames, stable measurements are cached with explicit invalidation, and observers are limited to active interaction lifecycles.

### Project structure

```text
MD_Manager/
├── .codex/                  # Project-local Codex skills
├── .github/                 # Verification and release workflows
├── data/
│   ├── parsing/             # Canonical Markdown parsing fixture
│   └── templates/           # Bundled feature and task templates
├── docs/                    # Project roadmap and active work specification
├── domain/                  # Pure business rules and state transitions
├── io/                      # Markdown and local file access
├── res/
│   ├── fonts/               # Local interface fonts
│   ├── icons/               # Deterministic UI symbols
│   ├── logo/                # Application logo assets
│   └── screenshots/         # Automated captures and composites
├── tests/
│   ├── e2e/                 # Playwright interaction and layout tests
│   └── unit/                # DOM-independent Node.js tests
├── tools/                   # Architecture and statistics checks
├── types/                   # Global JSDoc type declarations
├── ui/                      # Rendering, layout, and interactions
├── vendor/                  # Local libraries and licenses
├── app.js                   # Application wiring and lifecycle
├── MD_Manager.html          # Entry point
└── styles.css               # Styles and theme tokens
```

### Testing and verification

Node.js and npm are required only for development checks:

```bash
npm ci
npm run verify
```

The verification pipeline runs strict TypeScript checking for JavaScript with JSDoc, ESLint with zero warnings, the harness doctor, architecture-boundary checks, unit tests, and Playwright tests in Chromium.

CI executes the complete pipeline on Windows, Linux, and macOS.

### Releases

<table>
  <thead>
    <tr>
      <th rowspan="2">Release</th>
      <th rowspan="2">Date</th>
      <th colspan="3">Lines of code</th>
      <th rowspan="2">Tests</th>
      <th rowspan="2">Main features</th>
    </tr>
    <tr>
      <th>HTML</th>
      <th>CSS</th>
      <th>JS</th>
    </tr>
  </thead>
  <tbody>
    <tr><td><a href="https://github.com/Zang3th/MD_Manager/releases/tag/v0.7.1">v0.7.1</a></td><td>12.08.2026</td><td>557</td><td>474</td><td>4,322</td><td>166</td><td>Feature pinning, archive timeline</td></tr>
    <tr><td><a href="https://github.com/Zang3th/MD_Manager/releases/tag/v0.6.0">v0.6.0</a></td><td>07.08.2026</td><td>538</td><td>385</td><td>3,351</td><td>107</td><td>UI polish, README, release workflow</td></tr>
    <tr><td>v0.5.0</td><td>03.08.2026</td><td>512</td><td>376</td><td>3,321</td><td>96</td><td>Cross-platform improvements</td></tr>
    <tr><td>v0.4.0</td><td>03.08.2026</td><td>279</td><td>392</td><td>3,255</td><td>90</td><td>New undo/redo system and file conflicts</td></tr>
    <tr><td>v0.3.0</td><td>30.07.2026</td><td>271</td><td>373</td><td>2,763</td><td>76</td><td>Markdown features + editing</td></tr>
    <tr><td>v0.2.0</td><td>29.07.2026</td><td>181</td><td>316</td><td>2,169</td><td>64</td><td>Notification system and copy/paste</td></tr>
    <tr><td>v0.1.0</td><td>27.07.2026</td><td>166</td><td>270</td><td>1,566</td><td>50</td><td>Application foundation</td></tr>
  </tbody>
</table>

### Vendor

All production dependencies and fonts are stored locally.

| Component | Version | Functionality | License |
|:---------:|:-------:|:-------------:|:-------:|
| [SortableJS](https://github.com/SortableJS/Sortable) | 1.15.7 | Drag and drop | [MIT](https://github.com/Zang3th/MD_Manager/blob/master/vendor/LICENSE) |
| [Inter](https://github.com/rsms/inter) | 4.1 | Interface typography | [SIL OFL 1.1](https://github.com/Zang3th/MD_Manager/blob/master/res/fonts/InterVariable-LICENSE.txt) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | 2.304 | Monospace font | [SIL OFL 1.1](https://github.com/Zang3th/MD_Manager/blob/master/res/fonts/JetBrainsMono-LICENSE.txt) |

**Thanks to all the creators and contributors of these projects!**

## License

MD_Manager is licensed under the [MIT License](https://github.com/Zang3th/MD_Manager/blob/master/LICENSE).
