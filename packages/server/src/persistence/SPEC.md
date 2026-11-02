---
id: submodule-server-persistence
type: submodule-design
status: active
title: persistence — JSON app state
parent: module-server
depends-on: [module-contracts]
---

## Responsibility

Durable host state—projects, workspaces, cross-frontend app config, terminal catalogs, installation identity, and server-only acquisition state—as JSON under the data dir. Current workbench frame and workspace placement are frontend-local and have no host persistence.

## Boundary

- **Owns:** `dataDir()` (`REALTHING_DATA_DIR` for dev/e2e isolation, else `~/.realthing`, always resolved to an absolute path — a relative override would otherwise land managed worktrees in two places: `mkdirSync` resolves it against the host's cwd, `git -C <project>` against the project); project/workspace/config load-save operations and fieldwise validation over `DEFAULT_CONFIG` while preserving unknown top-level fields; server-only `installation.json` (`{ id, appInstalled?: true }`) and campaign-only `attribution.json`. The non-rotating install UUID never crosses the wire.
- **Public surface (barrel):** `dataDir`, project/workspace/config and terminal-catalog load-save operations (`loadConfig`, `saveConfig`, `loadProjectSettingsOverride`, `loadWorkspaceConfig`), `ensureInstallation()` returning only `{ id }`, narrow install/browser claim operations, and strict acquisition read/save. Initial ID creation publishes a complete sibling temp via atomic no-overwrite hard link and rereads a concurrent winner; malformed existing records are preserved. An exclusive install-claim marker elects one packaged host across processes. The complete installation JSON is atomically replaced; caught replacement failures remove the marker and temp for retry, while a crash after claiming may consume the event without emission. Legacy installed records remain claimed.
- **Browser attempt:** `attribution.json` exclusively creates its first `{ browserClaimAttempted: true }` marker with `wx`. Redeem atomically replaces it with strict first/last touch fields (bounded UTM values, referrer class, timestamp, and policy version); failed network or replacement work leaves the attempt terminal. Retention is 30 days after `last_touch`: expired or invalid records become terminal. The persisted schema rejects claim/verifier/challenge/URL, journey/bridge IDs, IP, and user agent. Other state has no cross-process lock.
- **Allowed deps:** `contracts` (`Project`, `Workspace`, `AppConfig`, `ProjectSettingsOverride`, `LayoutPreset`, `DEFAULT_CONFIG`, `PROJECT_SETTINGS_PATH`, config validators/normalizers); Node `fs`/`os`/`path`.
- **Forbidden:** importing feature siblings or `host`; persisting a current frame/view, selection/focus, or frontend-surface identity; reading alternate config keys or old schemas; or reading, rewriting, or deleting old host layout snapshots.

Project and workspace loads return `Project.path` / `Workspace.worktreePath` in the host's resolved spelling
(architecture Decision 22). A record stored in another spelling — git's `C:/…`, an unresolved segment, a
file an older host wrote — heals on read and is persisted by the next save of that file; loads never write,
and a value that is not absolute on this host stays as stored. Saves do not normalize: the producers resolve
at their own doors, so an object a create call returns never differs from what it stored.

Analytics config preserves a saved boolean preference and a valid `analyticsConsentConfirmed` boolean
independently; absent/malformed values default false. A preference-only write never implies completion.
Settings owns initial preference priming and preference-plus-confirmation writes.

Config validation normalizes the closed theme mode plus complete opaque system pair, the closed Windows terminal-shell preference (invalid/absent →
`DEFAULT_CONFIG.terminalWindowsShell`), file line width plus its pane-bound switch over their defaults; it accepts only the current bounded
`customLayoutPresets` catalog as synchronized layout data. Current/default preset ids and group limits are not config fields; retired config shapes are stripped rather than upgraded or
preserved. Historical `layouts/` files remain untouched and inert.
