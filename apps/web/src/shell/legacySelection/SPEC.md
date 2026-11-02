---
id: submodule-web-shell-legacy-selection
type: submodule-design
status: active
title: shell/legacySelection — temporary selection compatibility adapter
parent: submodule-web-shell
tags: [layout, legacy, adapter]
---

# `apps/web/src/shell/legacySelection` Specification

Selection reconciliation between the browser hash location (`#/v1/...`), persisted last-active workspace state, and the server's live `projects` / `workspaces` catalog.

## Responsibilities

- When the app boots or `workspace.list` refreshes, verifies that the currently selected `projectId` and `workspaceId` still exist.
- If a selected workspace was deleted, falls back to the first available workspace in the same project, or to the project welcome state if none remain, and synchronizes `window.location.hash`.
