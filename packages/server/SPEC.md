---
id: module-server
type: module-design
status: active
title: Engine host (server library)
parent: architecture
depends-on: [module-contracts, module-shared]
tags: [host]
references: [module-artifact-tests]
---

## Responsibility

The engine host as an embeddable library. Serves the browser↔host wire (`Bun.serve` HTTP+WS, static SPA)
and manages projects, Git worktrees, file reads/writes, diff & change operations, workspace plans, and
`bun-pty` terminals. Launched in-process by `apps/cli` and the Electrobun `apps/desktop`; it has no
standalone entrypoint of its own (a `dev.ts` boots it for development / e2e).

## Boundary

- **Owns:** the HTTP+WS server, static serving, the WS dispatch registry, server-side feature services
  (project/workspace/git/fs/changes/todos/watch/terminal), and `~/.realthing` persistence.
- **Public surface:** `createServer(options) → Promise<RunningServer>`
  (`{ port, startAttributionClaim, stop, shutdown }`) — saved-choice attribution waits for the launcher's
  explicit UI-readiness call; `stop()` is synchronous resource disposal for low-level tests while `shutdown()` is the idempotent,
  bounded production lifecycle (drain analytics and dispose sockets/PTYS/watchers)
  every launcher must await — and
  `bootHost(options) → BootedHost` (the process-boot wrapper: installs crash logging, resolves the
  login-shell environment only when the launcher opts in with `resolveShellEnv: true`, awaits `createServer`, and installs SIGINT/SIGTERM graceful-shutdown handlers), both re-exported from
  `host/`; plus `dataDir` from `persistence/`. Build-only
  **`@realthing/server/build-support`** is the single manifest of per-platform `bun-pty` libraries and
  OS-trash helpers consumed by both launcher packagers. Artifact
  fixture/assertion runners live in [[module-artifact-tests]], not in this library.
- **Allowed deps:** `contracts` (types + WS constants), `shared` (`shellEnv`, `spawn`, `codedError`, `paths`, `releaseIdentity`), `bun-pty`,
  `pino` + its pretty/rolling destinations (host diagnostics), Bun/Node.
- **Deployment obligation:** product behavior lives in the owning server feature module and is composed by
  `host`; launchers only supply boot options and packaged resources. When a demonstrated second environment
  needs a different implementation, the owning feature defines one narrow injected port rather than a
  host-wide platform adapter.
- **Forbidden:** importing `web`/`cli`/`desktop`; being bundled into the browser; branching product behavior
  on launcher identity.

## Internal modules

Each lives in `src/<name>/` as a bounded sub-module: a `SPEC.md` (its own boundary) + an `index.ts`
**barrel** that is its only public surface. Siblings import a module **through its barrel, never its
internals**. The edges between them are owned here (see the dependency graph), not in the leaf specs.

| module | owns | spec |
| --- | --- | --- |
| `host` | `Bun.serve` HTTP+WS, static SPA, the WS dispatch registry, channel publish | [host/SPEC.md](src/host/SPEC.md) |
| `persistence` | JSON domain/config state under the data dir | [persistence/SPEC.md](src/persistence/SPEC.md) |
| `log` | explicit leveled diagnostics → pretty stderr + structured JSONL under `<dataDir>/logs` (pino-roll daily/10 MB rotation, 14 rotated + active); arbitrary console output stays terminal-only | [log/SPEC.md](src/log/SPEC.md) |
| `settings` | server-synced app config, including the shared custom-layout-preset catalog (never current/default layout) | [settings/SPEC.md](src/settings/SPEC.md) |
| `locales` | the user's local language files in `<dataDir>/locales/`: validate, watch, `locales.list`/`changed` | [locales/SPEC.md](src/locales/SPEC.md) |
| `themes` | the user's theme files in `<dataDir>/themes/`: read, watch, `themes.list`/`changed` (the client validates) | [themes/SPEC.md](src/themes/SPEC.md) |
| `projects` | stable known-repo registry: open/recent views + lossless close/reopen (validate, dedupe, slug) | [projects/SPEC.md](src/projects/SPEC.md) |
| `workspaces` | workspaces = `git worktree`s on their own branch | [workspaces/SPEC.md](src/workspaces/SPEC.md) |
| `git` | the `git(cwd, args)` runner + worktree status/diff vs base + branch/commit/push ops | [git/SPEC.md](src/git/SPEC.md) |
| `subprocess` | `runBounded(argv, …)`: one child, one budget, killed by process group on expiry | [subprocess/SPEC.md](src/subprocess/SPEC.md) |
| `fs` | read/write dirs/files inside a worktree (path-contained) + the one byte classification (text/mime/sha-256) | [fs/SPEC.md](src/fs/SPEC.md) |
| `changes` | host-owned revert of a hunk or a file's whole change in the worktree, with undo receipts | [changes/SPEC.md](src/changes/SPEC.md) |
| `trash` | move a path to the OS trash through the bundled helpers (never `unlink`) | [trash/SPEC.md](src/trash/SPEC.md) |
| `todos` | a workspace's per-worktree TODO plan read/write (`todo.*`) | [todos/SPEC.md](src/todos/SPEC.md) |
| `watch` | per-worktree fs watcher → debounced `workspace.fsChanged` invalidation push | [watch/SPEC.md](src/watch/SPEC.md) |
| `terminal` | workspace-scoped `bun-pty` terminals | [terminal/SPEC.md](src/terminal/SPEC.md) |
| `analytics` | always-on basic events + sanitized error reports, and preference-controlled optional insights → PostHog sink (privacy contract in its spec) | [analytics/SPEC.md](src/analytics/SPEC.md) |
| `feedback` | host-scoped usage count + addressed product-interview invitation lifecycle | [feedback/SPEC.md](src/feedback/SPEC.md) |
| `dialog` | the host's native folder picker | [dialog/SPEC.md](src/dialog/SPEC.md) |
| `editors` | detect installed editors/IDEs, launch one at a worktree, reveal a worktree in the file manager | [editors/SPEC.md](src/editors/SPEC.md) |

`src/index.ts` re-exports `host` and `persistence`'s `dataDir`; explicit package
subpaths expose build support without widening the runtime barrel. `src/dev.ts` boots
the host from env via `bootHost` for dev/e2e.

## Internal dependency graph

`host` is the **only composition root** — it wires each feature's handlers into the WS registry.

- `host` → `projects`, `workspaces`, `git`, `fs`, `todos`, `changes`, `watch`, `terminal`, `dialog`, `editors`, `settings`, `locales`, `themes`, `analytics`, `feedback`, `log`, `persistence` (`dataDir`, for the crash report)
- `workspaces` → `projects`, `git`, `persistence`
- `projects` → `git` (shared runner), `persistence`
- `git` → `subprocess` (every child that talks to a network or another CLI), `fs` (`resourceMeta`/`decodeText` — a diff side's content classification is the same one `fs.readFile` reports)
- `changes` → `git` (the scope→range resolver + the original side's blob at its resolved oid), `fs` (path containment + byte identity), `persistence` (workspace lookup), `trash` (a revert that removes a file)
- `git`, `fs`, `watch`, `terminal`, `settings`, `locales`, `themes`, `analytics`, `feedback` → `persistence` (`locales` also → `@realthing/locales` root, external-style: catalog validation and file naming; `analytics` also → `posthog-node`, external—the delivery SDK)
- `log` → `persistence` (`dataDir`) — and **any feature module (+ `host`) may → `log`**: it is the one
  cross-cutting edge, like `persistence`, exempt from the never-each-other rule (today: `host`,
  `workspaces`, `watch`, `git`, `todos`, `analytics`). `persistence` never imports
  `log` (would cycle); `initLogging` is called only from `host`'s `bootHost`
- `todos` → `workspaces` (worktree path lookup), `git` (`gitStatus`, `listCommits` for commit artifact files and adopted commits)
- `persistence`, `dialog`, `subprocess`, `trash` → (leaves)

Rules: features never import `host`, and never each other except the edges above. The graph is acyclic.
Features that push on their own never import `host` either: they expose a **publisher-injection seam** (`setTerminalPublisher`,
`setTerminalTabsPublisher`, `projects`' `setProjectPublisher` for the full-snapshot
`project.updated` lifecycle, `workspaces`' `setWorkspacePublisher` for the
`workspace.created`/`updated`/`removed` lifecycle trio, `settings`' `setSettingsPublisher` for
`settings.changed` (full merged config plus the successful applied update for host-side explicit-field effects),
and `feedback`'s addressed invitation publisher) that
`host` installs at `createServer`—so channel/analytics wiring lives only in `host`. Current layout has no
host module, persistence, method, or publisher.

`settings` validates the bounded resource-free custom-layout-preset catalog it owns. Current/default preset,
group limits, frame, workspace resource placement, selection, and geometry never reach the host. The
workspace-create and boot-recovery paths compose `workspaces` with `terminal`: reserve the deterministic
process-free default terminal, then clear the workspace's pending marker only after durable catalog success. No sibling imports
another for that handshake.

Analytics is host-mediated the same way: **every capture call site lives in `host`**. Host translates
existing boot, setup, and plan observations into the closed event vocabulary and
syncs the additional-data delivery gate from applied updates that explicitly contain `analyticsEnabled`;
unrelated settings broadcasts preserve the current preference. Correlation stays host-local and clears when
sharing is disabled. `analytics` has no `settings` edge and no feature module knows analytics exists.

## Get right

- **No general cross-process state coordination** — `bootHost` permits multiple hosts to use the same data
  directory. Installation identity, its one-time event claim, and browser-attribution attempts use narrow
  exclusive filesystem operations; other shared persistence has no general lock, transaction, or
  convergence guarantee, so concurrent writes may be last-writer-wins.
- **One graceful shutdown per host** — launchers await `RunningServer.shutdown()`; repeated calls share one
  promise, while abrupt death relies on operating-system process cleanup.
- **WS commands return values directly**; only server notifications use push channels.
- Binds beyond localhost via `host` option (the Tailscale seam).

## Later

Persistence behind a data layer, `owner` threading.
