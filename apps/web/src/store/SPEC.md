---
id: submodule-web-store
type: submodule-design
status: active
title: store — Zustand app state
parent: module-web
depends-on: [module-contracts]
tags: [web, store, state]
---

# `apps/web/src/store` Specification

Single Zustand store (`useHostStore`) owning client-side state for `@realthing/web`. Bridges server events (`HostEvent`) and RPC responses into reactive slices consumed by `shell`, `panels`, and `components`.

## State slices

- **Connection & welcome (`connectionState`, `welcome`):** Tracks SSE lifecycle (`connecting`, `connected`, `reconnecting`, `disconnected`) and server protocol/version handshake (`server.welcome`).
- **Projects & Workspaces (`projects`, `recentProjects`, `workspaces`, `activeProjectId`, `activeWorkspaceId`):** Server-mirrored catalog of registered projects and Git worktree workspaces, and URL hash synchronization (`navigation`).
- **Workbench layout (`workbenchFrame`, `workspaceViewsByWorkspace`, `layoutAttentionByWorkspace`):** Sidebar/rail/dock geometry, open workbench tabs (`file`, `diff`, `plan`) per workspace, and active right-rail mode (`files`, `changes`, `plan`).
- **Files & Changes caches (`filesMode`, `changesView`, `filesTreeByWorkspace`, `fileContentsByWorkspace`, `diffsByWorkspace`):** Cached directory trees (`fs.list`), file buffers (`fs.read`), working-tree change lists (`changes.list`), and unified/split diffs (`changes.diff`), invalidated automatically on `fs.changed` and `git.changed` SSE events.
- **Plans / Checklists (`todosByWorkspace`):** Workspace plan items (`todo.get`, `todo.updated` SSE events).
- **Terminals (`terminalsByWorkspace`, `activeTerminalByWorkspace`):** Open PTY descriptors per workspace (`terminal.create`, `terminal.list`, `terminal.exit`).
- **Settings, Themes & Locales (`config`, `userThemes`, `localLocales`):** Persisted user preferences (`settings.get` / `settings.patch`), custom themes (`theme.list`), and locale overrides (`locale.list`).
- **UI feedback (`toasts`, `settingsOpen`):** Ephemeral toast notifications and modal open states.

## Invariants

- Derived state belongs in exported store selectors (`selectors.ts`), never duplicated across components.
- State transitions that always travel together (such as switching workspaces and updating the URL hash) execute in a single atomic store action.
- Allowed sibling imports: `navigation`, `transport`, `themes`, `lib`.
