---
id: module-shared
type: module-design
status: active
title: Shared server-side utilities
parent: architecture
depends-on: [module-contracts]
references: []
tags: [host]
---

## Responsibility

Cross-cutting runtime utilities used by the host and its launchers. Server-side only — never
bundled into `apps/web`. Exposed through explicit subpath exports.

## Boundary

- **Owns:** host-side runtime helpers that are neither feature- nor transport-specific, and the native
  brand icon set both launchers ship (`assets/` and its generator, `scripts/generate-icons.ts`).
- **Public surface:**
  - `@realthing/shared/shellEnv` → `resolveShellEnv()`, `repairShellEnv()`, `mergePath()`,
    `loginShellImports()`, `parseLoginShellEnv()`, `LOGIN_ENV_MARKER`, `localeRepair()`, `launchEnvKeys()`;
  - `@realthing/shared/freePort` → `findFreePort()`, `isPortFree()`;
  - `@realthing/shared/startupMark` → the static recursive wordmark plus the pure responsive/ANSI renderer
    and interactive-output gate used by every launcher;
  - `@realthing/shared/version` → the baked `{ version, channel, commit }` release identity shared by CLI,
    desktop, and host provenance (with a committed `0.0.0-dev` source default);
  - `@realthing/shared/windowsIdentity` → `windowsFileIdentity()`, `windowsProductName()`, and
    `windowsIconPath`;
  - `@realthing/shared/paths` → the worktree-relative path conventions (`WORKSPACE_INTERNAL_DIR`,
    `WORKSPACE_CONTEXT_DIR`, `WORKSPACE_TODOS_DIR`);
  - `@realthing/shared/codedError` → `CodedError` + `errorCodeOf()`;
  - `@realthing/shared/toolHomes` → `toolHomeEnv(home)` for hermetic test and smoke environments;
  - `@realthing/shared/removeTree` → `removeTree()`, the retrying recursive remove every teardown of a tree
    a child process ran from goes through;
  - `@realthing/shared/spawn` → `spawnSyncCaptured()` + `spawnSyncCapturedBytes()` + `spawnDetached()`, the
    hidden-child-process seam every console child the host or CLI launches goes through.
- **Allowed deps:** Bun/Node runtime (`@types/bun`); `contracts` types; the icon generator's build-only
  `@resvg/resvg-js` and `resedit`.
- **Forbidden:** importing `server` / `web`; being imported by `web` (it carries Bun/Node code that must
  not reach the browser bundle).

## Contents

- **/shellEnv** — `resolveShellEnv()` (one cached async run per process; `repairShellEnv()` is the
  uncached worker that tests drive with an injected probe): make the host's environment safe for the
  shells it spawns when launched from a GUI (Finder/Dock, launchd, systemd). Repairs `PATH`, imports
  login-shell environment variables when `TERM` is unset, repairs `LANG` to a UTF-8 locale when unset,
  and recovers `SSH_AUTH_SOCK` from `launchctl` on macOS.
- **/freePort** — `findFreePort(preferred, host?)` and `isPortFree(port, host?)`: detect occupancy by
  probing with a TCP connect and scan upward from `preferred`.
- **/startupMark** — the launchers' boot signature composed with the product identity, status, and
  resolved endpoint.
- **/version** — the release-stamping seam (`0.0.0-dev` in source runs; overwritten in release CI).
- **/windowsIdentity** — `windowsFileIdentity({ version, channel })` for Windows executable metadata.
- **/assets** — the native icon set (`icon.svg` and generated rasters).
- **/codedError** — `CodedError(code, message)` + `errorCodeOf(err)` carrying a wire `WsErrorCode`.
- **/removeTree** — `removeTree(path, options?)` with linear backoff for Windows handle release.
- **/paths** — `WORKSPACE_INTERNAL_DIR` (`.realthing`), `WORKSPACE_CONTEXT_DIR`, and `WORKSPACE_TODOS_DIR`.
- **/spawn** — `spawnSyncCaptured()`, `spawnSyncCapturedBytes()`, and `spawnDetached()` with
  `windowsHide: true`.
