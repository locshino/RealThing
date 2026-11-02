---
id: module-browser-e2e
type: module-design
status: active
title: Browser E2E harness
parent: architecture
depends-on: [module-server, module-web, module-cli, module-desktop, module-shared, module-artifact-tests]
references: [module-ci-release]
tags: [testing, playwright, e2e]
---

# End-to-End Test Suite (`e2e/`) Specification

Playwright browser E2E test suite verifying the integrated `@realthing/server` + `@realthing/web` stack against real Git repositories and temporary worktrees.

## Isolation Contract

Every E2E worker and test fixture runs in a hermetic environment:

- **Ephemeral state directory:** Each test fixture creates a disposable `REALTHING_HOME` / `HOME` directory under `os.tmpdir()` and removes it on teardown. Never touches the developer's real `~/.realthing` or `~/.gitconfig`.
- **Ephemeral loopback port:** Each server instance binds to `127.0.0.1:0` so parallel Playwright workers never collide on ports.
- **Disposable Git repositories:** Fixture helpers initialize real local Git repositories (`git init`, initial commit, branches, and worktrees) inside temp directories with deterministic author/committer identities.
- **Telemetry disabled:** `REALTHING_ANALYTICS=0` is set across all test runs so PostHog receives zero test traffic.

## Runner Modes & Scripts

- `bun run e2e` — Runs the Playwright browser suite (`e2e/*.spec.ts`) across sharded workers against the built web bundle and in-process host server.
- `bun run e2e <path>` — Runs a single spec file during focused iteration (e.g., `bun run e2e e2e/workspaces.spec.ts`).
- `bun run test:binary` — Smoke-tests the single-file Bun executable (`apps/cli/scripts/test-binary.ts`).
- `bun run test:desktop` — Smoke-tests the packaged Electron desktop app (`apps/desktop/scripts/test-desktop.ts`).

## Key Coverage Areas

- **Project & Workspace lifecycle:** Creating projects, creating Git worktree workspaces, attaching existing worktrees, renaming, settling/reactivating, and deleting workspaces.
- **Files & Editor workbench:** Navigating `FilesPanel`, viewing/editing files in `FilePane` (Monaco/Shiki/resource renderers), creating/renaming/deleting/trashing files, and fuzzy file search.
- **Changes & Git diffs:** Inspecting `ChangesPanel` across `branch`, `all`, `unstaged`, and `staged` scopes, viewing unified/split diffs in `DiffPane`, staging/unstaging/discarding changes, switching branches, and committing.
- **Workspace Plans:** Creating, toggling, editing, and persisting workspace checklist items in `PlanPane` / `PlanRailPane`.
- **Integrated Terminal:** Spawning PTY sessions in `TerminalInstance`, executing shell commands, resizing, and reconciling terminals across page reloads.
- **Settings, Themes & Locales:** Switching built-in and custom themes, changing UI locales (`en` / `vi`), and persisting layout geometry.
