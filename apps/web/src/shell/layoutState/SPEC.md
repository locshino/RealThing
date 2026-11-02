---
id: submodule-web-shell-layout-state
type: submodule-design
status: active
title: shell/layoutState — frontend-local layout ownership
parent: submodule-web-shell
depends-on: [module-contracts]
tags: [layout, local-state, persistence]
---

# `apps/web/src/shell/layoutState` Specification

Pure state model and reducers for per-workspace workbench tabs, rail selection, and panel sizing.

## Responsibilities

- Defines the `WorkspaceView` structure (open workbench tabs for `file`, `diff`, and `plan`, active tab ID, right-rail mode, and terminal dock visibility) indexed by `workspaceId`.
- Provides deterministic tab deduplication (e.g., opening the same file path focuses the existing tab rather than duplicating it; closing the active tab selects the nearest neighbor).
- Serializes layout geometry (`leftSidebarWidth`, `rightRailWidth`, `terminalDockHeight`) to `localStorage` with safe clamping against viewport bounds.
