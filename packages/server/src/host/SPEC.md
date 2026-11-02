---
id: submodule-server-host
type: submodule-design
status: active
title: host — the browser↔host wire
parent: module-server
depends-on: [module-contracts]
tags: [host, public-surface-checked]
---

## Responsibility

The wire and composition root: `Bun.serve` HTTP+WS, static SPA serving, the WS method→handler registry,
channel fan-out, and the process-boot wrapper both launchers share.

## Boundary

- **Owns:** `server.ts` (async `createServer` creates
  `Bun.serve` with `/health`, `/ws` upgrade, a
  **`GET /files/<workspaceId>/<relpath>`** route streaming a worktree file's raw bytes from `Bun.file`
  after classifying only its bounded 8 KiB head (via `fs`'s `resolveWorktreeFile` — path-contained; bad
  id/escape/miss → 404; `Cache-Control: no-store`, because the worktree moves under the URL) so the
  markdown viewer's relative `<img>`s resolve, the sibling
  **`GET /blob/<workspaceId>/<oid>/<relpath>`** route serving that path's bytes **at one commit or tree**
  (`git.readBlobStreamAtAsync` behind a 40/64-hex `oid` — a diff range's `resolvedOriginalOid`, so the URL
  names immutable content and answers `Cache-Control: public, max-age=31536000, immutable`; the Git
  primitive requires a blob, so trees/commits/gitlinks are 404 alongside a bad id/oid/escape/absent
  path). Before opening a blob body, the route performs a bounded `git cat-file -s`; objects above
  `BLOB_SIZE_LIMIT` (64 MiB — the size of the largest image, PDF or notebook a diff surface renders
  in one piece, and the bound on what one `change.revert` receipt may pin) are refused with 413. An
  accepted blob is **streamed**: only its 8 KiB sniff head is awaited for the headers and the rest relays
  `git cat-file`'s stdout chunk by chunk, so concurrent image or PDF diffs cost pipe buffers, not blobs,
  of host memory; the body goes out chunked (a streamed body carries no `Content-Length`), a consumer
  that disconnects kills its `git` — through the body's cancel once it streams, and through the
  request's `signal` while the sniff head is still awaited — and the relay's own deadline is five
  minutes, so a slow reader stalls `git` on the pipe rather than racing the 55 s network budget. Both routes exist
  because `fs.readFile` and `git.diffFile` answer `""` for bytes they must not decode, so a byte-only
  resource is fetched over HTTP instead. Both derive `Content-Type` through the shared byte classifier plus
  filename fallback (falling back to `application/octet-stream`) and
  send `X-Content-Type-Options: nosniff`; active same-origin types (`text/html`,
  `application/xhtml+xml`, `image/svg+xml`) additionally receive
  `Content-Security-Policy: sandbox; default-src 'none'`, so direct navigation cannot execute repository
  script, static serving with
  `index.html` fallback, the `server.welcome` push, the **`?client=` page identity** read off the socket URL at
  upgrade (threaded to every handler as `RequestContext`; it addresses terminal output but no longer *owns*
  PTYs — see [[submodule-server-terminal]]) plus the `clientKey → socket` registry and the **replay-namespace
  retention timer** that outlives a reconnect (terminals are deliberately untouched by it); the
  **request replay cache** keyed by `(clientKey, requestId)` (the first frame
  owns one handler promise + its
  serialized response, a reconnect replay awaits/returns that same result, a mismatched duplicate is rejected,
  and reaping the client clears its cache — but **only once nothing is in flight**: an unresolved request
  outlives the socket grace window, since the page holds that frame until its *own* deadline (30 minutes for
  the folder picker) and replays it on reconnect, so `clearClient` declines and the reap re-arms rather than
  let the replay start a second execution of a handler that has not finished). **Nothing in that cache is ever evicted**, because a
  successful `send` says the bytes were queued, not that the page read them, and a socket that dies holding a
  reply is indistinguishable from one that flushed it — so any result dropped on the host's own initiative may
  be the one a replay is about to ask for. A result leaves only on the client's own word, via two frames handled
  here and never routed to a handler: `{ ack: [id] }` names responses it has **read** (the steady state), and
  `{ resume: [id] }` on each reconnect names everything it still considers **unresolved**, freeing all other
  settled results. `resume` is what makes receipts safe to lose — an ack can die in a socket buffer exactly like
  a response can, and nothing would ever re-send it, so each reconnect restates the whole truth instead of
  confirming the confirmations. Cost is bounded instead by **two hard limits, each enforced where its size becomes
  known**: the entry count on the way *in* — a full namespace refuses new ids (`RequestReplayOverflowError` → a
  normal `ok: false`) while still answering every id it holds — and the retained bytes on the way *out* of the
  handler, since a response's size is unknowable at admission (`fs.readFile` returns a whole file) and in-flight
  work weighs nothing, so an admission-time byte check would bound the count and nothing else. A result that
  would breach the byte budget is not retained: the entry stays as proof the work ran, so its replay fails
  (`RequestReplayUnretainedError`) rather than re-executing, and the response the caller was already sent is
  unaffected. Neither limit can cost exactly-once — one refuses work that has not started, the other keeps the
  record of work that finished and drops only its answer;
  the **`watch` wiring** (inject the
  `workspace.fsChanged` publish callback into `watch`; expose
  **`workspace.watchReady`** as the typed preflight that awaits a fresh watcher's conservative startup nudge
  and reports whether the watcher was already known ready (its optional `prewarm` flag is forwarded into `watch`'s bounded prewarm-only tier,
  so pre-selection warm-ups never grow the watcher registry unboundedly); plus the **repo-metadata** callback (`setRepoMetaPublisher`) fanned out to **two**
  convergences for a git-metadata write in a watched worktree:
  `refreshUserOwnedWorkspace` (**re-sync a user-owned workspace's folder-truth branch** — host-mediated,
  since `watch` has no `workspaces` edge, and self-publishing through the workspace-lifecycle tee) **and** a
  pathless `fsChanged` frame (`paths: []`, `truncated: false`) so the
  clients' `HEAD`-relative reads
  (`git.status`, an `uncommitted`-scope diff tab) re-read when a terminal `commit`/`reset` moves a ref;
  the same publish also feeds the **fsNudge seam** (`setFsNudgePublisher` +
  `nudgeBaseRefWorkspaces`), the host mediation the `git.prefetch` handler triggers when the app's own
  background fetch **moved** a remote-tracking ref — a write only the project repo's shared `.git` sees,
  invisible to every worktree watcher — fanning the pathless frame to each workspace of that project whose
  diff base is the moved ref (their branch-scope merge-base may have moved — the re-read is idempotent when
  it hasn't; everyone else stays asleep)
  without touching a worktree file; call
  `ensureWatch(workspaceId)` from the
  workspace-read/write handlers (`fs.*`, `git.status`/`git.diffFile`, `change.*`) — a read or write is the "a client is
  looking" signal; `stopWatch` in `workspace.remove`'s fast path;
  `stopAllWatches()` in `stop()`),
  an optional boot-time `openProject(projectPath)` (best-effort — a launcher convenience), the
  **analytics wiring** (`initializeAnalytics` at boot from launcher provenance, destination, and per-run
  additional-data suppression; startup grants the additional tier only when `analyticsEnabled &&
  analyticsConsentConfirmed`. After boot, the settings publisher still broadcasts every merged config but
  changes the analytics grant only when its successful applied update explicitly carries `analyticsEnabled`,
  so unrelated writes preserve the current grant and the dialog's preference prime can enable it.
  `analyticsConsentConfirmed` controls the web prompt lifecycle. Its unconfirmed on-prime may enable ordinary
  additional capture, but browser attribution starts only from confirmed-on state: directly after the final
  applied dialog update (the UI is ready), or for a saved choice only through the launcher's explicit
  `RunningServer.startAttributionClaim()` readiness signal after normal UI readiness. Revocation cancels the
  claim generation. Basic
  events remain on in human runs. Consent changes clear additional-event correlation so re-enabling cannot
  reconstruct pre-consent work; campaign-only enrichment is inactive while off and restored from its strict
  server record when on without retrying a consumed claim.
  `shutdownAnalytics()` remains a best-effort drain in `stop()` and awaited by graceful shutdown;
  every capture site lives here, including the basic events and additional setup/plan observations in
  [[submodule-server-analytics]].
  Setup observes existing read results; only explicit setup mutations count
  (`dialog.selectDirectory` is one: `directory_pick` with a null path as `cancelled`; `project.open` maps the
  projects module's `NOT_GIT` / `ALREADY_OPEN` coded errors to the closed reasons, everything else `unknown`).
  `stop()` → `persistTerminalSessions()` **before**
  `closeAllTerminals()`, then watcher/socket disposal; `shutdown()` memoizes one asynchronous graceful
  path: awaited `shutdownAnalytics()` first, then `stop()`),
  `crashLog.ts` (`installCrashLog` — the `uncaughtException`/`unhandledRejection` report
  appended to `<dataDir>/logs/crash.log` and echoed to stderr, then — for the first fault only — an awaited,
  ≤ 1 s analytics `reportFatalError` (tagged with the crash kind) before `exit(1)`; later faults in that window are still appended but
  neither re-report nor re-exit.
  Never a recovery, and never installed under `NODE_ENV=test` — a unit-test process reports its own
  faults. It renders the throw via the `log` module's `describeError`, so crash reports and log lines
  agree, but keeps its own sync append — the death path must not depend on the logger's state);
  `boot.ts` (`bootHost` → await `initLogging` — debug level when the launcher passed `verbose` — then
  install the crash report, await the login-shell environment when the launcher passed
  `resolveShellEnv: true` (started before `initLogging`), await `createServer`, and write the `listening on` info line (see
  `submodule-server-log`); `reportDesktopError(error, scope)` is the desktop launcher's handled-error door
  into analytics (source `desktop`). Its
  SIGINT/SIGTERM handlers await that same shutdown before process exit); `handlers.ts` (the WS method→handler
  registry, typed `WsHandlers = { [M in WsMethodName]: WsHandler<M> }`, so a missing, extra, or mistyped
  handler fails typecheck; `handleRequest` narrows the wire's `unknown` params once, at dispatch, and
  params are not shape-validated at runtime. The registry includes `workspace.rename` as the direct manual door into
  `renameWorkspace(id, name)` — the workspaces module changes only the
  display label, persists, and publishes it, so the handler never mutates Git, emits, or patches a client
  separately; `project.rename` likewise delegates to the projects module's `renameProject`, which owns validation and the push. `client.reportError` hands the untrusted browser report to analytics' `reportClientError` (the
  only sanitizer) and always acks. Error tracking also rides two `server.ts` seams: every failed WS request
  is reported with its registered method (CodedErrors included), and `observeLoggedErrors` routes host
  `log.warn/error(msg, err)` calls as `host_logged` — so host diagnostics that carry an error go through
  the logger, never `console.*`);
  - The **workspace-archive teardown** — the composition of `changes` + `watch` + `terminal` + `workspaces` only
    the host may make. `workspace.remove` **rejects a `kind: "default"` workspace loudly, before any
    side-effect** (the record's `worktreePath` is the project folder — the reclaim's `rm -rf` fallback
    must never see it; the UI hides Remove, this guard is for buggy/rogue clients). Otherwise it
    reaps *everything* rooted in the worktree (for a user-owned `kind: "external"` one, everything except
    the checkout itself) but is **non-blocking**:
    it does the fast part synchronously — `forgetWorkspace` (drop the record → gone from `workspace.list`
    immediately) → `forgetWorkspaceChanges` → `stopWatch` → `closeWorkspaceTerminals` (kill its PTYs) —
    **acks**, then runs the slow reclamation in the **background** (`archiveTeardown`, fire-and-forget):
    `reclaimWorktree` (`git worktree remove`; a hard no-op for an external one). So the user never waits
    for the git subprocess. **Ordering holds:** terminals (sync) are down before the dir is deleted, since they hold it as cwd. Best-effort by contract —
    a failed background teardown is warn-logged, never thrown into the void (nothing awaits it).
- **Change mutations are serialized per workspace, on their own chain**: `change.revert`/`change.undo` run under **`withChangeLock(workspaceId)`**
  so two reverts cannot interleave their load→verify→write passes. The `changes` module's compare-and-swap makes concurrent file edits safe, and the fs watcher's `fsChanged` tick re-reads
  the open tabs after a write (so both handlers `ensureWatch`
  first). The named failures travel as `WsResponse.errorCode`
  (`STALE_VIEW`/`SCOPE_IMMUTABLE`/`RANGE_INVALID`/`RECEIPT_UNKNOWN`/`UNSUPPORTED_CHANGE`) through the same `CodedError`
  mapping `UNKNOWN_COMMIT` uses — the dispatch names no codes of its own, so a code added in `contracts`
  and thrown by a feature reaches the client with no host-side allowlist to update.
- **Project lifecycle fan-out:** `createServer` installs the `projects` module's publisher and maps every
  authoritative open/reopen/close snapshot to **`project.updated`**. The WS `open` handler subscribes to
  that channel and hydrates two views in `server.welcome`: `projects` (open records only) and
  `recentProjects` (all known records, with closed records whose folder is definitively
  gone omitted). The `/ws` upgrade first awaits `refreshRecentProjectFolders` for at most
  250 ms, so an unresponsive mount delays a connect by that budget at most and an unfinished check leaves
  its record at its last completed result; `open` itself never yields, so `server.welcome` stays the socket's first frame and
  both views are read from the current registry in the same tick they are sent. The one full-snapshot
  channel is idempotent and avoids separate opened/closed streams replaying out of order. Every client
  converges its rail + Recents from it; only
  the initiating open flow selects Project Home, while a close fallback remains per-client view state.
- **Workspace lifecycle fan-out:** `createServer` installs the `workspaces` module's publisher
  (`setWorkspacePublisher`), mapping each domain event `kind` → its `WS_CHANNELS.workspace*` channel
  (`created`/`updated` → the full record; `removed` → `{ projectId, id }`) and `server.publish`ing it. This
  is the **single** place workspace membership changes reach the wire — create/rename/archive all flow
  through it, so every client (including the initiator) converges by reacting, never by per-client optimism.
  The two new channels are `ws.subscribe`d in the WS `open` handler alongside `workspace.updated`.
- **CLI update lifecycle:** a launcher may supply one optional asynchronous notice producer, fixed interval,
  and parameterless update runner. `createServer` starts checks after listening without awaiting them and never
  overlaps checks. A newer release becomes the retained `available` snapshot in later welcomes. The v70
  `host.update` request acknowledges after starting one detached, server-single-flighted run; running,
  succeeded, and failed are full replacements on `host.updateAvailable` for every client. Success latches until
  host restart and does not shut down or relaunch the unsupervised process; failure permits retry and exposes no
  child output or arbitrary diagnostic. Discovery failures preserve known state, shutdown makes late results
  inert, and the host never learns feed, installer, command, path, channel, or version selection.
- **Interview invitation delivery:** the feedback module's injected publisher maps an eligible claim to addressed `feedback.interview` delivery
  for that request's opaque client key only when its socket-advertised protocol version supports the channel;
  delivery failure or final client reap after the reconnect grace releases the claim, while a transient
  reconnect retains and re-delivers it after `server.welcome`. A host restart has no claim to re-deliver, and
  the welcome clears the frontend's stale popup projection. Popup `feedback.respond` actions are ordinary
  replay-safe requests and never alter the Settings link.

`RunningServer.startAttributionClaim()` is the explicit launcher-readiness signal and rechecks the saved
enabled/confirmed choice before entering analytics attribution.

- **Public surface (barrel):** `createServer`, `CreateServerOptions`, `RunningServer`, `bootHost`,
  `BootHostOptions`, `BootedHost`, `BuildKind`, `reportDesktopError`.
- **Allowed deps:** `contracts` (`PROTOCOL_VERSION`, feature-introduction versions, `WS_CHANNELS`); `shared` (`freePort`, `shellEnv` — for
  `boot.ts`; `codedError`); `persistence` (`dataDir` — where `crashLog.ts` writes); the feature modules it composes (per the parent dependency graph, incl. `fs`'s
  `resolveWorktreeFile`/`resourceMeta` and `git`'s `readBlobStreamAtAsync` for the `/files` + `/blob`
  routes); Bun/Node.
- **Forbidden:** being imported by any feature module; importing `web`/`cli`/`desktop`.

- **Branch status / push / deleteRemoteBranch:**
  `workspace.branchStatus` composes divergence (`countPushDivergence` / `countPushTargetDivergence`) with `git`'s
  `commitsAheadOf` (ahead of the base), `onBaseBranch`, and the push/fetch URLs of origin (`originUrls`); for an
  origin whose push URL differs from its fetch URL the divergence is `countPushTargetDivergence` against the
  push repository, so the counts describe the repository the Push action delivers to — `published` is the divergence answer itself (its remote ref exists), so the two never disagree; when
  the measurement fails it falls back to the tracking ref only for a single-URL origin, and a split origin
  reports `published: null` (unknown) rather than the fetch repository's answer; `workspace.push` and `workspace.deleteRemoteBranch` stamp activity
  and delegate to `git`'s `pushBranchToOrigin` / `deleteRemoteBranchOnOrigin`.

## Get right

- Every registered WS command is debug-traced by **method name only** (`ws <method>` / `ws <method>
  failed`); a name absent from the closed handler registry is traced as fixed `ws unknown method` instead.
  Never trace raw unregistered method names, params, or handler error text, which can reflect credentials
  and user-supplied values; see `submodule-server-log`'s privacy rule.
- WS commands return values directly; only **`project.updated`** (published from
  the `projects` module's injected publisher) + the workspace lifecycle trio
  (`workspace.created`/`updated`/`removed`, published from the `workspaces` module's injected publisher) +
  `workspace.fsChanged`, `terminal.tabs`, `settings.changed`, `locales.changed`, `themes.changed`, and **`host.updateAvailable`** (published for each
  retained CLI-update lifecycle replacement) use broadcast push channels. Every
  **broadcast** push channel a client should hear must be `ws.subscribe`d in the WS
  `open` handler — a publish on an unsubscribed topic reaches nobody, silently. Four channels are deliberately
  **not** subscribed and not broadcast: `feedback.interview`, `terminal.data`, `terminal.exit`, and
  `terminal.detached` are sent with `ws.send` to one addressed client. Adding an addressed channel means
  wiring a publisher, not a subscription.
- **Terminal backpressure never trusts the `drain` event alone.** A backpressured `ws.send` latches the
  client in `terminalBackpressured` and blocks its batchers, and the batcher deliberately retries only on
  `resume()` — so the latch's lift must be guaranteed. Bun's `drain` is the fast path, but a drain lost
  across a system sleep (observed after a macOS hibernate) left the latch set forever: the tab frozen,
  the pty alive, the recorder still current. A 1s reconciler asks the socket itself: with the flag set,
  `getBufferedAmount() === 0` means the drain the OS never delivered (`drainedClientKeys` in
  `terminalSend.ts`), so the host lifts the latch and resumes that client's terminals. A socket with
  buffered bytes stays latched, and a latch whose socket is already gone is left to `close`/`open`.
  Reloading the client always recovered (open clears the flag and resumes), which is why this hid so long.
- The host is the single place features are wired together — features never reach back into it.
- **Login-shell environment import is opt-in at boot** (`resolveShellEnv: true`, passed by the dev,
  CLI and desktop launchers). Any embedder or test that does not pass the flag keeps the environment it was given.
- Separate host processes do not coordinate mutable state or events. They may use the same data directory,
  but each owns independent in-memory terminals, watchers, and connected clients; persistence
  conflicts are accepted rather than serialized by the host.
- `shutdown()` is safe under concurrent signal/native-quit calls: callers receive one promise, lifecycle
  work runs once, and resource disposal remains ordered after analytics draining.
