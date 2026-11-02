---
id: submodule-web-panels
type: submodule-design
status: active
title: panels — feature views
parent: module-web
depends-on: [module-contracts]
tags: [ui]
---

# `apps/web/src/panels` Specification

Layout-agnostic workspace panels, document panes, and settings dialogs. Panels render their domain content and dispatch actions via `useHostStore` and `useTransport`; `src/shell` owns spatial placement, split sizing, and visibility.

## Why no barrel (`index.ts`)

`src/panels` intentionally omits an `index.ts` barrel so Vite can code-split heavy panes (`FilePane` with Monaco/Shiki, `DiffPane`, `TerminalInstance` with `@xterm/xterm`) into lazy chunks. Siblings (`src/shell`) import individual panel files directly.

## Panel inventory

### Project & Workspace management
- **`ProjectTree.tsx`** — Left-sidebar hierarchy of registered projects and their workspaces, with context actions to create, rename, or remove workspaces and projects.
- **`WelcomePanel.tsx`** — Empty-state landing view when no project/workspace is selected, offering quick project creation, folder picker (`dialog.openFolder`), and recent projects.
- **`CreateProjectDialog.tsx`** — Modal dialog to register an existing repository path or initialize a new Git repository.
- **`NewWorkspaceDialog.tsx` & `ExistingWorktreeDialog.tsx`** — Modal dialogs to create a fresh Git worktree workspace (`workspace.create` with optional base branch) or attach an existing worktree directory (`workspace.addExisting`).
- **`DeleteWorkspaceDialog.tsx`** — Confirmation modal for workspace deletion with optional worktree removal and dirty-tree safety warnings.

### Files & Changes explorer (Right rail)
- **`FilesPanel.tsx` & `FileTree.tsx`** — Lazy-loaded directory tree (`fs.list`, `fs.createFile`, `fs.createDir`, `fs.rename`, `fs.delete`, `fs.duplicate`) with fuzzy file search (`fs.search`), hidden/ignored file toggles, and live `fs.changed` refresh.
- **`ChangesPanel.tsx`, `ChangesTree.tsx`, & `ChangesScopeMenu.tsx`** — Multi-scope Git status explorer (`changes.list` across `branch`, `all`, `unstaged`, and `staged` scopes) with per-file stage/unstage/discard actions, commit box (`git.commit`), and branch comparison selector.
- **`BranchPicker.tsx`** — Searchable popover for switching, creating, or comparing Git branches (`git.branches`, `git.checkout`).

### Center Workbench Panes
- **`FilePane.tsx` & `FileViewer.tsx`** — Source and asset viewer/editor backed by `fs.read` / `fs.write` and `@realthing/resource-renderers` (Monaco editor, Shiki syntax viewer, Markdown preview, image/audio/video/PDF/CSV/JSON viewers).
- **`DiffPane.tsx` & `DiffViewer.tsx`** — Unified and side-by-side Git diff viewer (`changes.diff`) with syntax highlighting, hunk navigation, and inline stage/revert controls.
- **`PlanPane.tsx` & `PlanRailPane.tsx`** — Manual workspace plan and checklist editor (`todo.get`, `todo.save`, `todo.addItem`, `todo.toggleItem`, `todo.updateItem`, `todo.removeItem`, `todo.clear`) rendered either as a center workbench tab or a right-rail tab.

### Integrated Terminal
- **`TerminalInstance.tsx`** — `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` terminal view bound to a host PTY session (`terminal.create`, `terminal.write`, `terminal.resize`, `terminal.kill`, `terminal.data`, `terminal.exit`) with theme synchronization and resize observation.

### Settings Dialogs
- **`SettingsDialog.tsx`** — Tabbed modal container hosting:
  - **`AppearanceSettings.tsx`** — Theme selector (built-in dark/light palettes + custom `~/.realthing/themes`), UI/code font families, and explorer file icon style controls.
  - **`EditorSettings.tsx`** — Line width, editor font size, tab size, spaces vs. tabs, line numbers, whitespace rendering, cursor style, minimap, and auto-save delay.
  - **`FilesSettings.tsx`** — Explorer sort order, compact folders, hidden dotfiles, excluded patterns, custom file associations, and `.realthing/settings.json` workspace override shortcut.
  - **`LanguageSettings.tsx`** — UI locale selector (`en`, `vi`, and custom `~/.realthing/locales` packs).
  - **`LayoutSettings.tsx`** — Default rail visibility, panel density, and workbench behavior preferences.
  - **`TerminalSettings.tsx`** — Default shell override, terminal font size, scrollback, and cursor style.
  - **`KeybindingsSettings.tsx`** — Customizable keyboard shortcuts with live chord recording and reset controls.
  - **`GitAndEditorsSettings.tsx`** — Git commit hook verification, commit history limit, and custom external editor binary.

## Boundary Rules

- Allowed sibling imports: `store`, `transport`, `components`, `themes`, `lib`, `i18n`.
- Forbidden reaches: Never import `shell`.
