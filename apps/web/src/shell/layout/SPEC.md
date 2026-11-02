---
id: submodule-web-shell-layout
type: submodule-design
status: active
title: shell/layout — frontend-local workbench frame
parent: submodule-web-shell
depends-on: [module-contracts]
tags: [ui, layout, tabs, drag-and-drop]
---

# `apps/web/src/shell/layout` Specification

Spatial containers that render the center workbench tab strip, active pane (`FilePane`, `DiffPane`, `PlanPane`), right inspector rail (`FilesPanel`, `ChangesPanel`, `PlanRailPane`), and bottom multi-tab terminal dock (`TerminalInstance`).

## Responsibilities

- Renders draggable `ResizeHandle` dividers between the left sidebar, center workbench, right rail, and bottom terminal dock, clamping widths/heights to ergonomic minimums and persisting dimensions to `useHostStore`.
- Keeps mounted `TerminalInstance` xterm buffers alive across tab switches within the active workspace so shell output and scrollback are preserved without re-spawning PTYs.
- Supports keyboard shortcuts for toggling the left sidebar (`Cmd/Ctrl+B`), bottom terminal (`Cmd/Ctrl+J` / `` Ctrl+` ``), and closing active workbench tabs (`Cmd/Ctrl+W`).
