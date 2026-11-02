---
id: goal-and-requirements
type: goal-and-requirements
status: active
title: RealThing — product goal and scope
covers: [product-goal, product-audience, product-principles, product-capabilities, product-non-goals]
tags: [product, scope]
---

## Goal

RealThing is a workspace-first developer IDE built around Git worktrees, rich file viewing and diffing,
integrated PTY terminals, and manual workspace plans. It isolates parallel tasks into separate git
worktrees and brings files, multi-scope diffs, terminals, and checklists into one cohesive workbench.

This document describes the product as it is and why it exists, and changes with it: a capability that
lands is added here, a decision that changes is rewritten here. It holds no versions or roadmap.

## Problem

Working on multiple tasks in a single repository checkout creates friction:

- **Parallel tasks collide** in one working tree — switching branches requires stashing or committing
  unfinished work, and running builds or tests in one checkout disrupts another.
- **Changes are hard to inspect and revert selectively** across branch, uncommitted, and commit scopes
  from a terminal alone.
- **Task checklists drift away from the workspace** when tracked outside the checkout.

## Who it's for

Developers working on git repositories who want isolated worktree workspaces by default, fast file and
diff inspection across multiple scopes, integrated terminals, and lightweight per-workspace task planning
in a native desktop app or browser workbench.

## Value

- **Isolation by default.** A workspace RealThing creates is a git worktree with its own branch and cwd:
  tasks progress in parallel and the main branch stays clean until merged. Working directly in the
  project folder (the Default workspace) is an explicit choice, never the default.
- **A focused workbench.** Editor, multi-scope diffs, file and hunk revert/undo, terminals, and task
  plans in one splittable workbench.
- **Specs beside the code.** RealThing is built spec-first, with `SPEC.md` documents living alongside
  every module.

## Principles

Durable decisions every feature follows; [[architecture]] carries the structure that enforces them.

- **Expose host truth, don't recompute.** The host owns domain state (projects, workspaces, git, files,
  terminals, plans) and serves it over the typed wire; the UI hydrates from reads and streams deltas.
- **The user's own tools and credentials.** Git operations run through the user's `git` and SSH/HTTPS
  configuration; RealThing keeps no accounts or tokens of its own.
- **Spec-first.** RealThing is built spec-first with clear module boundaries and public surfaces.

## Capabilities

What RealThing does, at product level; the linked spec owns the detail.

- **Two launchers, one app** — a native desktop app and the `realthing` CLI that opens the same UI in a
  browser, both embedding the same host; state lives under `~/.realthing` ([[module-desktop]],
  [[module-cli]]).
- **Projects → workspaces** — a git repo is a project; a workspace is a git worktree, plus the built-in
  Default workspace (the project folder itself) and existing worktrees attached in place
  ([[submodule-server-workspaces]]).
- **Workbench** — a splittable layout of files, diffs, documents, plans, and terminals with movable side
  and bottom tool panels, kept local to each window ([[submodule-web-shell-layout]]).
- **Files & multi-scope Changes** — browse the worktree file tree with live git status marks, inspect
  rich resources (Monaco code, Markdown, JSON, CSV, notebooks, images, SVGs, PDFs, HTML), compare diffs
  across branch, uncommitted, and individual commit scopes, and revert/undo whole files or individual
  hunks with compare-and-swap safety ([[module-resource-renderers]], [[submodule-server-changes]],
  [[submodule-server-git]]).
- **Workspace plans** — a workspace-scoped checklist of groups and items edited from the Plan side tool
  or center Plan page ([[submodule-server-todos]], [[submodule-web-panels]]).
- **Terminals** — real PTY terminals (`bun-pty` + `@xterm/xterm`) keyed by workspace and tab, surviving
  browser reloads and reconnections ([[submodule-server-terminal]]).
- **Around the workspace** — view branch ahead/behind status against `origin`, open a worktree in an
  installed editor or IDE, and keep the app itself up to date ([[submodule-server-editors]],
  [[submodule-web-updates]], [[submodule-web-shell-location-bar]]).
- **Interface language** — the UI follows the system language or the user's choice; English and
  a set of translations ship built-in (an untranslated string shows in English), and a user adds or
  overrides a language with a flat JSON file in `~/.realthing/locales`, live on save
  ([[module-locales]], [[submodule-web-i18n]]).
- **Themes** — light, dark, minimal, and high-contrast themes ship built-in, following the system
  appearance or a fixed choice; a user adds a theme by saving a copy of a bundled theme file with new
  colours in `~/.realthing/themes`, live on save ([[submodule-web-themes]]).
- **Brand** — RealThing green accent (bright on dark themes, deepened on light ones so it clears AA on
  both), a Darcula-family dark background, Orbitron for the brand display role, Geist and JetBrains Mono
  for UI and code ([[submodule-web-themes]], [[web-typography]]).

## Non-goals

Only these are excluded by decision. Anything neither listed above nor excluded here is open, not
forbidden.

- **RealThing accounts or a login UI.** Who may reach a host is decided by the network — Tailscale ACLs
  and device identity ([[architecture]]).
