---
id: submodule-server-workspaces
type: submodule-design
status: active
title: workspaces — git worktrees
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## Responsibility

A workspace is a `git worktree` on its own branch under the data dir — the anchor for files/git/terminals/
plans. Its **display `name` is decoupled from its git `branch`**: `name` is a human-readable label
(Title Case, spaces) and `branch` is a kebab slug derived from it — they were once held equal, and still
coincide for the auto `workspace-N` placeholder, but a named workspace carries both distinctly.

Two kinds are **user-owned** — RealThing uses their cwd but never renames or reclaims them. Every project
carries **exactly one built-in Default workspace** (`kind: "default"`) whose `worktreePath` is the project
folder itself (git's *main working tree*) — the "just work in my project folder" anchor, ensured lazily,
**non-removable and non-renamable**. Any **existing worktree** the user explicitly attaches is recorded in
place as `kind: "external"` — outside the data dir, never created or mutated here.

## Boundary

- **Owns:** `listExistingWorktrees(projectId)` (**async** — parses `git worktree list --porcelain -z` read
  through `gitAsync`; each listed path is resolved; drop the project folder, prunable registrations, and
  every path already represented in RealThing; branch-backed rows are `available`, detached-HEAD ones
  `detached`),
  `openExistingWorktree(projectId, path)` (**async**; revalidate against the Git registry at the mutation
  door, comparing canonicalized paths; same-project retries are idempotent, cross-project cwd reuse is
  rejected; persist + emit `created` with `kind: "external"`, a directory-basename display name,
  `renamed: true`, and the repo default as its initial diff target — **no Git or checkout mutation**),
  `createWorkspace` (**async**; off `baseRef` when given — branched with `worktree add -b`, never a detached
  remote checkout, and **`--no-track`**; off the repo `HEAD` otherwise; **remote-ref freshness is prefetched
  off this critical path** — the New-Workspace dialog `git.prefetch`es the base in the background, so create
  only `git fetch`es as a fallback when the local remote-tracking ref is missing entirely; `Workspace.baseBranch`
  records **creation provenance** — the ref the worktree was cut from, which never moves afterwards; **branch
  name made unique against refs *and* worktree dirs**; path `dataDir/worktrees/<project-slug>/<branch>`;
  **seeds the ephemeral per-workspace scratch dir** (`WORKSPACE_CONTEXT_DIR`, with a self-ignoring `*`
  `.gitignore` — zero git footprint) in the new worktree; a **user-supplied name is the display name** and
  **sets `renamed: true`** at create),
  `renameWorkspace` (**sync**; sets the sanitized, casing- and script-preserving display `name` and always
  sets `renamed: true`. When `opts.branch` is present, the branch becomes the slug's ASCII kebab form,
  clamped to 60, uniqued against refs + worktree dirs, and moved with `git branch -m`, while the **worktree
  dir never moves**; without `opts.branch` — the manual wire method — only the display label changes),
  `listWorkspaces(projectId, { includeDiffStats? })` (**async**; complete authoritative membership/order
  after Default ensure + user-owned folder-truth reconciliation; diff-stat badges resolve **in parallel
  through `gitAsync`**, off the event loop, and **membership is re-read after the awaits**. `workspaceDiffKey`
  is the diff-defining fields' single public definition),
  `listWorkspaceRecords` (raw registry records without Default ensure, folder-truth reconciliation, or
  per-workspace git diffStats) and its project-free sibling `listAllWorkspaceRecords`,
  `workspaceDiffStats`, **`setWorkspaceDiffBase(id, ref | null)`** — re-point the ref this workspace's diff
  is measured against (`Workspace.diffBase`), `null` clearing it; persists + **broadcasts the updated
  record** so every client converges on the push,
  `getWorkspace` (by-id lookup, throws on unknown),
  and the **archive** primitives: `forgetWorkspace(id)` (drop the persistence record, return the removed
  record or `null`), `reclaimWorktree(ws)` (the slow half — `git worktree remove --force`, keeps the branch;
  refuses both user-owned kinds and any record whose `worktreePath` resolves to the project folder), and
  `removeWorkspace(id)` (the synchronous composition of the two).
- **Default workspace (`kind: "default"`):** exactly one per project. `listWorkspaces` **ensures** it
  — find-or-create by `projectId`+`kind` — and returns it **pinned first**. `refreshUserOwnedWorkspace(workspaceId)`
  re-syncs folder-truth fields without the diff-stat listing, wired to `watch`'s repo-metadata nudge.
  **Non-removable + non-renamable, enforced here:** `forgetWorkspace` and `renameWorkspace` **throw** on
  `kind: "default"`.
- **Initial-terminal provisioning is a durable host handshake.** Every workspace record first persisted by
  `createWorkspace`, `openExistingWorktree`, or Default ensure carries optional literal
  `initialTerminalPending: true`. `host` idempotently reserves the deterministic process-free terminal tab,
  then calls `completeInitialTerminalReservation(id)`, which clears the marker, persists, and publishes the
  updated workspace.
- **`ensureWorkspaceScratchDir(ws)`** — idempotent seed of the gitignored `WORKSPACE_CONTEXT_DIR`
  scratch dir (mkdir + self-ignoring `*` `.gitignore`).
- **Lifecycle events:** every membership mutation emits a `WorkspaceLifecycleEvent` through an **injected
  publisher** (`setWorkspacePublisher`).
- **Public surface (barrel):** `createWorkspace`, `listExistingWorktrees`, `openExistingWorktree`,
  `listWorkspaces`, `listWorkspaceRecords`, `listAllWorkspaceRecords`, `forgetWorkspace`,
  `reclaimWorktree`, `removeWorkspace`,
  `workspaceDiffStats`, `workspaceDiffKey`, `getWorkspace`, `renameWorkspace`, `refreshUserOwnedWorkspace`,
  `completeInitialTerminalReservation`, `ensureWorkspaceScratchDir`, `setWorkspacePublisher`,
  `WorkspaceLifecycleEvent`, `setWorkspaceDiffBase`.
- **Allowed deps:** `projects` (repo lookup), `git` (the runner), `persistence`, `log`; `contracts`;
  `@realthing/shared/paths` (the scratch-dir path convention); Node.
- **Forbidden:** `host`; reaching into another feature's internals (use its barrel).
