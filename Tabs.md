# Tabs: Markdown Format

Draft of the Markdown format for tabs. A tab is a section of one project file with its own Workspace
and Archive; the Backlog stays global. Tabs replace splitting long-running projects into several
files. Backward compatibility with the current format is not required.

## Example

```markdown
# MD_Manager

# 2026

#Archived
## Zoom und Suche

#Version
- 0.8.0

### Suche
- [x] ~Fuzzy-Finding mit Echtzeitfilter~

#Pinned
## Filtern und Controls

#Version
- 0.11.0

#Info
- Applies to every view.

### Keyboard-Controls
- [ ] Navigate between features

#Archived
## Swimlanes und Diagramme
...

## Diverse Verbesserungen
...

#Ignored
# Experiments

## Prototype ideas
...

# 2027

## Mobile-Ansicht
...

#Backlog
## Backlog

### Git-Integration

#Info
- Task-level notes stay allowed in the backlog.

#### Features
- [ ] Show the current branch
```

## Structure

| Level | Meaning |
|---|---|
| `#` (first) | Project title |
| `#` (every further) | Tab |
| `##` | Feature |
| `###` | Task |
| `####` | Group inside a task |

## Rules

### Project title

1. The first `#` heading is the project title. It is not a tab.

### Tabs

2. Every further `#` heading starts a tab. The tab ends at the next `#` heading or at the end of the file.
3. Tab titles are unique. A duplicate title is a format error.
4. A tab may be empty.
5. `#Ignored` directly before a tab heading hides the tab and everything in it.
6. Implicit single tab: a file without any tab heading treats all features under the project title
   as one implicit tab. No tab bar is shown.
7. As soon as one tab heading exists, a feature between the project title and the first tab heading
   is a format error.

### Feature markers

8. Markers stand directly above the heading they apply to:

   | Marker | Before | Meaning |
   |---|---|---|
   | `#Archived` | `##` | The feature is archived in its tab. |
   | `#Pinned` | `##` | The feature is the pinned feature of its tab. |
   | `#Ignored` | `#` (tab), `##`, `###` | Kept in the file, hidden in the application. |
   | `#Backlog` | `##` | The feature is the global backlog. |

9. Markers can be combined. Canonical order when saving: `#Archived` or `#Backlog`, then `#Pinned`,
   then `#Ignored`.
10. `#Info`, `#Warn`, `#Version`, and `#Date` are unchanged.

### Archive

11. An archived feature must be 100% complete; otherwise it is a format error.
12. Archiving and unarchiving only add or remove the `#Archived` line. The feature keeps its position.
13. Each tab has its own archive, made up of the archived features of that tab.

### Pin

14. At most one `#Pinned` feature per tab. Further `#Pinned` markers in the same tab produce a warning
    and are ignored; the first one wins.
15. `#Pinned` before an archived feature, before the backlog, or before anything other than a feature
    heading produces a warning and is ignored.

### Backlog

16. The backlog is a regular `##` feature marked with `#Backlog`. It is global and belongs to no tab,
    even though it follows the last tab in the file. `#Ignored` on a tab never hides it.
17. A file contains at most one backlog.
18. The backlog must be the last feature in the file. Anything else is a format error.
19. The backlog has no header content: no `#Info`, `#Warn`, `#Version`, `#Date`, or text between
    `## Backlog` and its first task. Anything there is a format error. Notes inside backlog tasks
    (`###`) stay allowed.
20. `#Backlog` combined with `#Archived` is a format error.

### Order

21. The order in the file is canonical. Saving never reorders features, regardless of whether they are
    archived.
22. The Archive view sorts archived features for display only (version, then date).
23. With "Show archived" enabled, the Workspace shows archived features at their position in the file,
    between the regular features.
24. Moving or pasting a feature among visible features places it directly before its visible right
    neighbor, or directly after its visible left neighbor when there is none. Hidden features in
    between keep their order.

### Removed from the current format

25. The `#Archive` section with its own `#` title is removed.
26. `#Pin` and `#Ignore` are renamed to `#Pinned` and `#Ignored`.
27. Sorting the archive on save is removed.
28. Feature notes on the backlog are removed.
29. Files in the old format fail to open with a format error that names the replacement, for example
    "`#Archive` sections are no longer supported. Mark archived features with `#Archived`."

## Application Behavior

- Workspace and Archive are per tab; the Backlog is global.
- The `+` button stays unchanged and only creates features. New tabs are created in the tab switcher.
- All controls and shortcuts work inside each tab and across tabs, especially copy and paste.

### Tab switcher in the project title

Tab navigation takes no additional header or vertical space, since the layout is optimized for
portrait monitors.

```
▣  MD_Manager / 2026 ⌄   +  ↶ ↷  ✓ Saved            Workspace│Archive
             ┌───────────────────────────────────┐
             │ 1  2025          ▓▓▓▓▓▓▓▓▓▓  100% │
             │    Jan – Dec · 14 archived        │
             │ 2  2026 ●        ▓▓▓▓▓▓░░░░   62% │
             │    Jan – today · 3 active · 9 arch│
             │ 3  2027          ░░░░░░░░░░    0% │
             │    2 open                         │
             │ ───────────────────────────────── │
             │ +  New tab                        │
             └───────────────────────────────────┘
```

- Without tabs, the title stays the plain project title, exactly as today.
- With tabs, the title reads `Project / Tab ⌄`: the project title in the regular title style, the active
  tab in the accent color with a chevron. When space runs short, the project title is truncated with an
  ellipsis first; the tab name stays fully visible.
- Activating the title opens a popover over the content. Each entry shows the shortcut digit, the tab
  name, a progress bar in the statistics status colors (archive, done, active, open), and a line with
  the date span from `#Date` and the feature counts.
- The popover ends with "New tab".
- Keyboard: arrow keys move, Enter selects, Escape closes.
- Tabs are renamed by double-click, reordered by drag, and deleted through a per-entry menu.
- When the clipboard source lies in another tab, its entry and the title show a clipboard marker.
- Holding a dragged feature over the title opens the popover; dropping it on an entry moves the
  feature to that tab.

### Shortcuts

- `1`-`9` select the first nine visible tabs in popover order. Ignored tabs get no digit. Further tabs
  are reachable through the popover only.

### Managing tabs

- "New tab" asks only for the name, which must be unique and not empty. The tab is appended at the end
  and becomes active.
- The first "New tab" in a file with the implicit single tab asks for two names: one for the existing
  features and one for the new tab. Both become tab headings.
- A tab that still contains features can be deleted after a confirmation.
- When only one explicit tab remains, its heading stays and the switcher shows that single tab. The
  file never falls back to the implicit single tab on its own.
- Creating, renaming, reordering, and deleting tabs can be undone.

### Across tabs

- Copied features and tasks survive a tab switch and can be pasted into any tab, including an empty
  one.
- Features also move between tabs through "Move to tab" in the feature menu.
- Undo and redo switch to the tab the change belongs to.
- Search is global across all tabs. Results show their tab, and activating one switches to it.
- Switching tabs keeps the current view: in the Archive view, the archive of the new tab is shown.

### View state

- "Show archived", "Show done", and the feature width apply per file, as today, not per tab.
- Expanded items and scroll positions are kept per tab while the file is open.
- The last active tab is remembered per file.

### Statistics

- Statistics and the archive timeline cover the active tab.
- The backlog is removed from the statistics completely, for every file: no backlog column, no backlog
  segment, and no backlog legend entry.

## Approved

- `data/parsing/Layout.md` may be rewritten in the new format.
