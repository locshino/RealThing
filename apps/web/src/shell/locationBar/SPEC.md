---
id: submodule-web-shell-location-bar
type: submodule-design
status: active
title: shell/locationBar — captioned location segments in the topbar
parent: submodule-web-shell
depends-on: [submodule-web-panels]
tags: [ui, topbar, public-surface-checked]
---

# `apps/web/src/shell/locationBar` Specification

Top chrome header bar (`LocationBar`) for the RealThing workbench. Displays workspace identity, Git branch and working-tree status, external editor launcher, and layout rail toggles.

## Boundary

- **Public surface (`index.ts`):**
  - `LocationBar`
- **Allowed sibling imports:** `store`, `transport`, `components`, `updates`, `lib`, `i18n`.
- **Forbidden reaches:** Never import `panels` directly; emit layout intents through `store` callbacks passed by `Shell`.

## Behavior

- Reserves left inset on macOS desktop builds (`html[data-desktop-platform="darwin"]`) for native window traffic lights and marks the header background as a `-webkit-app-region: drag` strip while keeping all buttons/menus `app-region: no-drag`.
- Renders active project and workspace breadcrumbs, current Git branch badge (`BranchPicker`), working-tree dirty/ahead/behind counters (`WorkspaceStatusBadge`), `OpenInEditorControl`, update notification chip (`UpdateChip`), and toggle buttons for the left sidebar, right inspector rail, and bottom terminal dock.
