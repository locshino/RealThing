---
id: submodule-web-shell
type: submodule-design
status: active
title: shell — responsive frame
parent: module-web
tags: [ui]
references: [module-desktop, module-contracts]
---

# `apps/web/src/shell` Specification

Top-level IDE chrome (`Shell.tsx`) that arranges panels into a five-zone workbench (top location bar, left project/workspace sidebar, center document/diff/plan workbench, right files/changes/plan rail, and bottom multi-tab terminal dock) and runs lifecycle reconciliation hooks.

## Sub-modules

- **[`locationBar/`](./locationBar/SPEC.md)** — Top header bar (`LocationBar`) displaying sidebar toggle, active project/workspace breadcrumb, git branch & status controls, open-in-editor action, right-rail/terminal toggles, and update indicator.
- **[`layout/`](./layout/SPEC.md)** — Workbench tab strip, split pane container, and bottom terminal dock arrangement (`WorkbenchArea`, `TerminalDock`, `RightRail`).
- **[`layoutState/`](./layoutState/SPEC.md)** — Pure state transitions for workbench tabs (`file`, `diff`, `plan`), active tab selection, and per-workspace view persistence.
- **[`layoutIntents/`](./layoutIntents/SPEC.md)** — High-level user intent helpers (opening a file tab, opening a diff tab, revealing a path in the file tree, toggling the terminal dock or plan pane).
- **[`legacySelection/`](./legacySelection/SPEC.md)** — Reconciles initial URL hash / persisted selection against the live `project.list` and `workspace.list` catalog on startup.
- **[`terminalReconciliation/`](./terminalReconciliation/SPEC.md)** — Reconciles live PTY sessions (`terminal.list`) with per-workspace terminal tabs across host reconnects and workspace switches.

## Public surface (`index.ts`)

- `Shell` — Root application shell component mounted by `App.tsx`.

## Boundary Rules

- Allowed sibling imports: `navigation`, `transport`, `store`, `panels`, `components`, `themes`, `updates`, `lib`, `i18n`.
