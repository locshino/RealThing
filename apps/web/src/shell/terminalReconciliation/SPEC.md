---
id: submodule-web-shell-terminal-reconciliation
type: submodule-design
status: active
title: shell/terminalReconciliation — terminal catalog and local placement convergence
parent: submodule-web-shell
tags: [terminal, layout, reconciliation]
---

# `apps/web/src/shell/terminalReconciliation` Specification

Synchronizes the host server's active PTY sessions (`terminal.list`, `terminal.exit`) with the frontend's per-workspace terminal tab state (`terminalsByWorkspace`).

## Responsibilities

- On initial connection or SSE reconnect, queries `terminal.list` for the active workspace and attaches existing PTY `terminalId`s so running shells survive browser reloads.
- Handles `terminal.exit` events by marking the exited terminal tab or removing closed tabs cleanly.
- Lazily spawns an initial default PTY (`terminal.create`) when the user opens the terminal dock in a workspace that has no active terminals.
