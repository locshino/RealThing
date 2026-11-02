---
id: submodule-server-watch
type: submodule-design
status: active
title: watch — worktree change notifier
parent: module-server
depends-on: [module-contracts]
tags: [live-refresh, public-surface-checked]
---

## Responsibility

The filesystem change notifier behind the UI's live refresh: one recursive watcher per watched
workspace worktree (Bun's native `fs.watch(root, { recursive: true })` — no watcher dependency),
coalescing events into a debounced **`workspace.fsChanged`** publish (`WorkspaceFsChangedPayload`:
`{ workspaceId, paths, truncated }`). The frame is an **invalidation nudge, not data** — clients
re-read through the existing read methods (`fs.*` / `git.*`), so the reads stay the single source of
truth and a duplicate/replayed frame is harmless (one extra refetch, never wrong state).

## Boundary

- **Owns:** the watcher registry + its lifecycle: `ensureWatch(workspaceId)` (idempotent and
  **self-healing**; returns the live watcher's shared readiness promise; started lazily by `host` when a
  workspace read or `workspace.watchReady` preflight lands — the read is the "a client is looking" signal;
  readiness reports whether the watcher was already known ready), `stopWatch(workspaceId)` (called
  in `workspace.remove`'s fast path),
  `stopAllWatches()` (called in `server.stop()`); the ignore filter (any path segment `.git` or
  `node_modules`, plus `.DS_Store`); per-workspace coalescing (deduped relative paths, flushed after
  300ms quiet / 1s max-wait, capped at 100 paths → `truncated: true` = a generic wildcard).
  The **startup nudge** — a fresh watcher publishes one synthetic **truncated wildcard** after the platform
  stream's registration window (~750ms), because a write landing inside that window can lose its event
  forever. Its readiness promise resolves only after that publish. Ordinary workspace reads do not await
  readiness and never gain startup latency. Stopping a watcher settles its pending readiness and cancels
  the nudge, so callers cannot hang and torn-down watchers cannot publish.
- **Prewarm tier (globally bounded):** `ensureWatch(workspaceId, { prewarm: true })` — reached via
  `workspace.watchReady`'s optional `prewarm` flag, the web's pre-selection warm-up — starts the same
  watcher but marks its entry **prewarm-only**. Prewarm-only entries live in one global pool capped at
  **8**: creating one beyond the cap evicts the least-recently-prewarmed prewarm-only entry through
  `stopWatch`, so clicking through many projects reuses one bounded pool instead of accumulating watchers
  for one host lifetime. Any **real** call promotes the entry out of the tier for good.
- **Repo-metadata nudge (second seam):** a git-metadata write is *metadata, not content*, so it never
  becomes an `fsChanged` path (the `.git` blackout stands — plumbing storms must not turn into frames). It
  instead arms a separately debounced (300ms), **pathless** `setRepoMetaPublisher(workspaceId)` nudge. This
  is the only signal for a change that leaves the working tree byte-identical: `git switch -c <new-branch>`
  writes nothing outside the git dir, and a `git commit` moves `HEAD` without touching a worktree file.
  Two sources feed the one nudge:
  - `.git`-prefixed events seen by the recursive **root** watcher — covers a **repo root** workspace, whose
    `.git` directory lives inside the watched tree;
  - a second, **non-recursive** watcher on the worktree's git dir **when that dir lies outside the root**:
    for a *linked worktree* (every workspace this app creates) `.git` is a *file* (`gitdir: <path>`)
    pointing at `<repo>/.git/worktrees/<name>`, i.e. **outside the watched root**.

  `host` fans the nudge out to two convergences: `refreshUserOwnedWorkspace` (a user-owned workspace's
  folder-truth branch labels) **and** a pathless `fsChanged` frame (`paths: []`, `truncated: false`) so
  the clients' git-derived reads re-read.
- **Timer-driven delivery is contained:** the coalescer flush, the startup nudge, and the repo-metadata nudge
  run from this module's own timers, so a subscriber throw is warn-logged and swallowed rather than becoming
  a fatal `uncaughtException` that takes down the host.
- **Composition seams:** never imports `host` — `host` injects the publish callbacks at wiring time.
- **Self-healing per read:** every `ensureWatch` re-stats the root and **re-creates the watcher when the
  inode changed**, **reaps zombie watchers** whose workspace record no longer exists, and **retries a
  failed start on the next read**.
- **Watch-started nudge (third seam):** the moment a watcher entry is created (real or prewarm), before any
  event can reach the repo-metadata nudge, `setWatchStartedPublisher(workspaceId)` fires once — the host
  uses it to take the worktree's HEAD baseline.
- **Public surface (barrel):** `ensureWatch`, `stopWatch`, `stopAllWatches`, `setWatchPublisher`,
  `setRepoMetaPublisher`, `setWatchStartedPublisher`.
- **Allowed deps:** `persistence` (workspace lookup), `log`; `contracts` (payload type); Bun/Node.
- **Forbidden:** `host`; sibling features.
