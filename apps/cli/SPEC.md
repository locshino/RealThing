---
id: module-cli
type: module-design
status: active
title: CLI host launcher
parent: architecture
depends-on: [module-server, module-shared]
tags: [host]
references: [module-artifact-tests]
---

# `@realthing/cli` Specification

Thin Node launcher (`realthing`) that starts the host (`@realthing/server`), opens the browser, and manages the process lifecycle. All domain work lives in `@realthing/server`.

## Scope and boundaries

- **Responsibilities:** CLI flag parsing (`--port`, `--no-open`, `--host`, `--version`, `--help`), delegating host creation to `createHostServer`, serving the pre-built `@realthing/web` bundle from `apps/web/dist` (linked into `apps/cli/web-dist` at build time), opening the listening URL via the `open` package, and wiring `SIGINT`/`SIGTERM` to `server.close()`.
- **Allowed dependencies:** `@realthing/server`, `@realthing/shared`, `open`.
- **Forbidden reaches:** Never import `@realthing/web` runtime code; never duplicate server logic.

## Entrypoint and packaging

- `src/index.ts` carries `#!/usr/bin/env node` and resolves `webDistDir` relative to the compiled binary so `npx realthing` and global installs locate the static bundle without environment variables.
- Build produces ESM output under `dist/` (`bin.realthing` -> `./dist/index.js`) with `files: ["dist", "web-dist"]` so published tarballs and compiled binaries are self-contained.

## Binary build (`apps/cli/scripts/build-binary.ts`)

`bun run --cwd apps/cli build:binary` produces a single-file executable `apps/cli/dist/realthing` via `bun build --compile`:

1. Ensure `apps/web/dist` exists (`bun run --cwd apps/web build` runs upstream in the root `build:binary` script).
2. Walk `apps/web/dist` and emit `src/generated/embeddedAssets.ts`, importing every asset with `with { type: "file" }` so Bun embeds the file bytes into its `$bunfs` virtual filesystem and registering a `Map<urlPath, EmbeddedAsset>` through `registerEmbeddedWebAssets` from `@realthing/server`.
3. Compile `src/binary.ts` -> `dist/realthing` with `bun build --compile` (accepting `--target=<bun-target>` and `--outfile=<path>` for cross-compilation in CI).

At runtime `createHostServer` checks `getEmbeddedWebAssets()` first; when populated it serves assets directly from `$bunfs` via `Bun.file(asset.bunfsPath)` without touching the host filesystem, falling back to `webDistDir` in unbundled dev/CLI runs.

### Binary smoke test (`apps/cli/scripts/test-binary.ts`)

`bun run test:binary` spawns the compiled `dist/realthing --port 0 --no-open` in an isolated `HOME`/`REALTHING_HOME` temp dir with `REALTHING_ANALYTICS=0`, waits for the `RealThing running at http://127.0.0.1:<port>` line, and verifies:

- `GET /` returns `200 text/html` containing `<div id="root">`, and every referenced `/assets/*` JS/CSS bundle returns `200` with non-empty body and non-HTML content-type (catches SPA-fallback regressions).
- `POST /rpc` `server.ping` returns `{ pong: true }`.
- `GET /events` streams `event: server.welcome` with a valid protocol version and `sessionId`.
- `POST /rpc` `workspace.list` exercises a temporary git repository and worktree lifecycle.
- `SIGTERM` exits cleanly within 5 s.
