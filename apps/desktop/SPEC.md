---
id: module-desktop
type: module-design
status: active
title: Desktop launcher/client
parent: architecture
depends-on: [module-server, module-contracts, module-shared]
tags: [desktop, launcher, packaging]
references: [submodule-web-navigation, module-artifact-tests, module-ci-release, submodule-web-shell, module-cli]
---

# `@realthing/desktop` Specification

Electron desktop shell for RealThing. Boots `@realthing/server` **in-process** inside the Electron main process and points a `BrowserWindow` at the loopback URL.

## Architecture Decisions

### 1. In-process `@realthing/server` inside Electron main
Electron 35+ embeds Node 22.x (`>= 22.19`), matching the host runtime requirement. Running `createHostServer({ host: '127.0.0.1', port: 0, webDistDir })` directly inside the main process:
- Avoids spawning or supervising a child Node/Bun daemon, eliminating orphan-process cleanup, IPC port handshakes, and double bundling.
- Keeps the exact same HTTP/SSE Loopback transport (`http://127.0.0.1:<ephemeral-port>`) that `@realthing/web` uses in CLI mode — zero web code changes required.
- Passes `openFolderDialog` to `createHostServer` using Electron's native `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })` bound to the active `BrowserWindow`, avoiding OS shell subprocesses (`osascript`/`zenity`) in desktop builds.

### 2. Single-bundle main process via `esbuild`
Electron's packaged app loads `dist/main.mjs` + `dist/preload.cjs`. Because `@realthing/server` and `@realthing/shared` use workspace TypeScript exports, `scripts/build.ts` bundles `src/main.ts` with `esbuild` (`platform: 'node'`, `format: 'esm'`, `external: ['electron', 'node-pty']`) into `dist/main.mjs`, and copies `apps/web/dist` into `dist/web/`.
- `createRequire(import.meta.url)` banner is injected so CJS dependencies inside the bundle continue to work under ESM.
- `node-pty` is externalized so its native `.node` addon and `spawn-helper` load from `app.asar.unpacked/node_modules/node-pty`.

### 3. Native module ABI (`node-pty`)
Bun installs prebuilds or skips lifecycle scripts by default, and the host Node version may have a different `NODE_MODULE_VERSION` than Electron's embedded Node.
- `node-pty` v1.1.0 ships `prebuilds/<platform>-<arch>/pty.node` using N-API, which is ABI-stable across Node and Electron versions without `electron-rebuild`.
- `electron-builder.yml` marks `**/node_modules/node-pty/**/*` under `asarUnpack` so `dlopen` and `spawn-helper` execute from the real filesystem (`app.asar.unpacked`), and `afterPack` (`scripts/after-pack.cjs`) sets `0755` on `spawn-helper` because macOS/Linux zip extraction can strip executable bits.

### 4. Subprocess environment & `PATH` enrichment
macOS/Linux GUI apps launched from Finder/Dock do not inherit interactive shell `PATH` (`/opt/homebrew/bin`, `~/.local/bin`, `~/.bun/bin`, nvm/fnm/volta shims).
- On startup, `enrichDesktopPath()` spawns the user's login shell (`$SHELL -ilc`) once to merge their interactive `PATH` plus common tool directories into `process.env.PATH` so `git` and integrated terminals work identically to CLI launches.

### 5. Lifecycle & Single-Instance Lock
- `app.requestSingleInstanceLock()` ensures only one RealThing desktop instance runs; a second launch focuses the existing window.
- On `before-quit`, `hostServer.close()` runs before exiting so SSE clients and child processes terminate cleanly.
- External `http(s):` links opened via `window.open` / `target="_blank"` are routed to `shell.openExternal` instead of spawning unintended Electron windows.
- Window bounds (`width`, `height`, `x`, `y`, `isMaximized`) are persisted to `<userData>/window-state.json` and restored on next launch.
- Window chrome uses native macOS `hiddenInset` titlebar (`trafficLightPosition: { x: 16, y: 12 }`) with a custom CSS `-webkit-app-region: drag` strip in the top header bar and `no-drag` on interactive controls; preload exposes `window.realthingDesktop.platform` (`darwin` | `linux` | `win32`) and sets `html[data-desktop-platform]` before first paint so the web UI reserves traffic-light inset only inside the macOS Electron shell.
- Application menu (`Menu.setApplicationMenu`) provides standard App / File / Edit / View / Window / Help menus plus `New Workspace` (`Cmd/Ctrl+N`) and `Settings…` (`Cmd/Ctrl+,`) accelerators bridged via `realthing:menu-action` IPC through `preload.cts` -> `window.realthingDesktop.onMenuAction`, which `Shell` subscribes to on mount.

### 6. Auto-Update (`electron-updater` + GitHub Releases)
See [`src/updates/SPEC.md`](./src/updates/SPEC.md).

## Scripts & Verification

- `bun run --cwd apps/desktop build` — builds `@realthing/web` (if missing) and bundles `dist/main.mjs`, `dist/preload.cjs`, and `dist/web/`.
- `bun run --cwd apps/desktop dev` — builds and launches Electron locally.
- `bun run --cwd apps/desktop package:dir` — builds unpacked platform app bundle under `apps/desktop/release/` via `electron-builder --dir`.
- `bun run --cwd apps/desktop package` — builds distributable installers (`.dmg`/`.zip` on macOS, `.AppImage` on Linux) under `apps/desktop/release/`.
- `bun run test:desktop` — runs `scripts/test-desktop.ts`, launching the packaged Electron binary headlessly with `--smoke-test` in an isolated `HOME`/`REALTHING_HOME` (`REALTHING_ANALYTICS=0`), verifying renderer load, `/rpc` (`server.ping`), `/events` (`server.welcome`), and clean shutdown.
