---
id: submodule-server-todos
type: submodule-design
status: active
title: todos — a workspace's per-worktree TODO plan (read/write)
parent: module-server
depends-on: [module-contracts, submodule-server-git]
tags: [todos]
---

## Responsibility

Serve the manual workspace TODO plan and checklist for a workspace, mapped to the wire DTOs. The list is
**scoped by `workspaceId`** (stored under the workspace's worktree in `.realthing/context/todos/workspace.json`).
Read-modify-write on demand through `TodoStore`, serialized per workspace via `enqueueTodoMutation`.
`listTodos` also **decorates each group with its derived `status`** (`groupStatus`) on the way out so
`apps/web` — which imports `contracts` only — does not carry a second copy of the rule.

## Decorations

- **`listTodos` decoration — unfolding the commit.** The wire DTO's `commit` artifact carries a derived
  **`files`** list — full `GitFileChange[]` rows (path + status + `+/−` line counts), read through
  `git.gitStatus` at the **`commit:{sha}` scope** (the exact rows the Changes panel renders there, one
  derivation) — memoized in-memory **by workspace + sha** (resolvability is repository-local: two clones
  can share a sha while only one still has the object, so one workspace's hit must never satisfy another's
  resolution check) — immutable, so the cache never staleness-checks; only
  successful resolutions are cached, and a transient git failure retries on the next list. An
  **unresolvable sha** yields **no `files`** — that absence is the client's signal to degrade the
  affordance silently.
- **`listTodos` decoration — adopted commits (`TodoPlan.adoptedCommits`).** Every `base..HEAD` commit
  (`git.listCommits`) whose sha is owned by **no** item's `commit` artifact is surfaced as a **wire-only
  `done` `TodoItem`** — `id: "commit:<sha>"`, `origin: "adopted"`, `title` = the commit subject, and a
  single `commit` artifact decorated with the same per-sha `files` list. These items are **never written
  to the store** — they are recomputed on every read. Derived best-effort; a git failure omits the field.

## Boundary

- **Owns / public surface (barrel):** `listTodos({workspaceId}) → Promise<TodoPlan>`,
  `countOpenTodos({workspaceId}) → number` + its pure rule `openTodoCount(plan)` (unfinished =
  any status but `done`, loose + grouped),
  `addTodo(...) → Promise<TodoItem>` (validates a non-empty title; tags `origin: "user"`),
  `updateTodo(...) → Promise<TodoItem>` (throws on unknown id → a `{ ok:false }` WS response),
  `removeTodo(...) → Promise<{ ok: true }>`, plus the `TodoStore` core (`TodoStore`, `groupStatus`, `flatItems`, etc.).
- **Allowed deps:** `workspaces` (worktree-path lookup via `getWorkspace`, which throws on unknown);
  `git` (`gitStatus` — the commit-scope DTO decoration; `listCommits` — the `base..HEAD` enumeration behind
  `adoptedCommits`); `contracts` (DTOs); Node `fs`/`path`.
- **Forbidden:** `host`; sibling features other than `workspaces` + `git`.
