---
id: submodule-web-shell-layout-intents
type: submodule-design
status: active
title: shell/layoutIntents — arrangement intent orchestration
parent: submodule-web-shell
tags: [layout, intents, orchestration]
---

# `apps/web/src/shell/layoutIntents` Specification

Intent helpers that coordinate store updates when a user action opens or focuses a workbench resource (such as clicking a file in `FilesPanel`, clicking a modified path in `ChangesPanel`, or opening the workspace `PlanPane`).

## Responsibilities

- Opening a file path creates or focuses a `file` tab in the active workspace's workbench view and loads its content via `fs.read`.
- Opening a changed file from `ChangesPanel` creates or focuses a `diff` tab scoped to the selected `ChangesScope` (`branch`, `all`, `unstaged`, `staged`) and loads its diff via `changes.diff`.
- Toggling the right rail (`files` | `changes` | `plan`) or bottom terminal dock ensures the target container is expanded and focused.
