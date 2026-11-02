---
id: architecture
type: architecture-design
status: active
title: RealThing — top-level architecture
parent: goal-and-requirements
covers: [client-host-split, cli-entrypoint, wire-contract, transport-endpoint, ui-shell-panels, git-worktrees, remote-tailscale, hydrate-then-stream, domain-vs-view-state, frontend-local-workbench-frame, client-local-navigation]
tags: [architecture]
---

## Drivers

RealThing is a workspace-first IDE built around Git worktrees, rich file/diff rendering, PTY terminals,
and manual workspace checklists. Two additive launchers share the same host library: the CLI boots the
host and opens a browser, while Electrobun packages that host with a native system-webview shell. The
desktop profile is local only; a later shared-client profile can dial an existing host. The UI ships
independently of the host and dials it over the network; a phone reaches the selected host over Tailscale.

## Topology — three rings

- **Host** (`packages/server` + `packages/shared`, launched by `apps/cli` or `apps/desktop` in
  local-host mode): owns projects, git worktrees, files, diffs, PTY terminals, workspace plans,
  settings, persistence, and serves the wire endpoint.
- **The wire** (`packages/contracts`): the typed, versioned protocol — the only coupling between client
  and host.
- **UI client** (`apps/web`): a mobile-first React client, transport-driven and endpoint-configurable,
  shippable as static assets independent of the host.

```
apps/cli        browser host launcher: boot server + open browser ── depends on ─▶ packages/server, packages/shared
apps/web        UI client (mobile-first)                           ── depends on ─▶ packages/contracts, packages/locales, packages/ui, packages/resource-renderers
apps/desktop    Electrobun local-host launcher                     ── depends on ─▶ packages/server, packages/contracts, packages/shared, packages/locales
apps/website    public landing + blog + /vibecoding (Cloudflare Pages) ── depends on ─▶ packages/website-analytics
packages/website-analytics  dependency-free browser analytics policy for the public website
packages/server createServer(): Bun.serve(HTTP+WS)                 ── depends on ─▶ packages/contracts, packages/locales, packages/shared, packages/spec-graph
packages/contracts  the wire (types plus tiny pure runtime)
packages/locales    UI string catalogs (bundled en.json) + pure catalog rules; ./react holds the one i18next
                    instance ── depends on ─▶ nothing in the workspace (i18next, react-i18next)
packages/shared     server-side runtime utilities (shellEnv, freePort, spawn, startupMark, version, etc.)
packages/spec-graph spec frontmatter parser, graph builder, and SpecIndex read model
packages/ui         owned shadcn/Radix primitives + cn + onThemeSwap ── may depend on ─▶ packages/contracts, packages/locales
packages/resource-renderers  file/diff renderers + registry behind a host seam ── may depend on ─▶
                    packages/contracts, packages/locales, packages/ui
```

Artifact verification is a separate source-only workspace, [[module-artifact-tests]]. It depends on
CLI build metadata, server test fixtures, and shared teardown; root tools and browser E2E consume it.
No product package imports the test workspace, and it has no application build step or Electrobun SDK
dependency. This keeps test process drivers outside both launchers and the server library.

## Decisions

1. **Client/host split.** The host owns domain state; the UI is a portable client; the wire is the
   only coupling. **Rule: `apps/web` depends on `contracts`, `locales`, `ui`, and `resource-renderers`
   only** — never on `server` or `shared`. All added edges are browser-safe presentation packages; the
   UI remains shippable without the host.
2. **Launchers are thin; the host is a library.** `apps/cli` and `apps/desktop` both embed the shared
   boot path in-process. CLI opens a browser; desktop opens a native system webview on a fresh one-origin
   loopback host. Neither owns server feature logic or spawns the other. The CLI remains a complete
   independent artifact and rollback. A later desktop shared-client profile may omit the local host;
   every profile uses the same wire and web artifact.

   **One feature path across deployments.** An ordinary product feature changes its contract, the owning
   server feature module, the shared web client, and their tests — never each launcher. Launchers and future
   deployments own only composition, lifecycle, endpoint selection, native presentation, and artifact
   packaging. Physical runtime requirements are declared once through the server-owned build-support manifest,
   then transformed by each packager. The same behavior and artifact suites run through every launcher, so
   reuse is enforced by boundaries and conformance rather than parallel implementations.
3. **The wire is versioned.** `contracts` is types plus a small dependency-free runtime: wire constants,
   versions, the config default, and guards. Any other runtime is a named exception in its spec, today
   only the quit-confirmation rule; adding one updates this decision. `server.welcome` carries a
   protocol version so an independently-shipped UI can detect host-version drift.
4. **Transport endpoint is a parameter.** Defaults to same-origin (`location.host`); a remote browser,
   desktop, or mobile client points it at the selected host's Tailscale MagicDNS name. Native resume state
   is keyed by backend profile so ids from one host are never interpreted against another.
5. **UI = panels + shell.** Layout-agnostic, store-driven panels (project→workspace nav, file tree,
   the code renderer, changes/diff, plan checklist, terminal) never know their arrangement. Each desktop
   frontend window owns one locally persisted, resource-free workbench frame: a recursively split center
   plus auxiliary groups in vertical left/right stacks and a horizontally grouped bottom region. The
   frame's topology, singleton-tool placement, visibility, folds, geometry, and alignment remain unchanged
   when that window switches workspace; workspace-scoped resources and attention project into it from
   separate local views. Terminals may occupy center or auxiliary groups, with new workspaces defaulting
   one terminal to bottom. Another window never rearranges this one. Detail:
   [[submodule-web-shell-layout]].
6. **Workspaces are git worktrees.** project (git repo) → workspace (`git worktree` on its own
   branch/cwd, under `~/.realthing/worktrees`) → {files, diffs, plans, terminals}. **Two deliberate
   exceptions, both `kind`-marked on the wire and both *user-owned* — never renamed or reclaimed by
   RealThing:** every project carries exactly one built-in **Default workspace** (`kind: "default"`)
   whose cwd is the project folder itself (git's *main working tree*) — non-removable, non-renamable,
   and entered explicitly from the project's Welcome fork ("Work in project folder"), never
   auto-entered — and an **existing worktree** the user explicitly attaches in place
   (`kind: "external"`), which RealThing may forget but never mutates (see
   [[submodule-server-workspaces]]).
7. **Auth is external.** Tailscale ACLs / device identity are the auth; the app carries an `owner` field,
   not a login UI.
8. **Hydrate-then-stream (every client reconstructs domain state from the host).** A client never relies on
   having *witnessed* events to know domain state — on connect it **reads** current state, then **subscribes**
   to live deltas (`project.list`, `workspace.list`, `terminal.list`, `todo.list`, alongside live channels).
   A reload, second tab, phone, or host restart therefore rebuilds the same projects, workspaces, plans,
   and terminal catalogs. The client is a **stateless projection of domain state**, never a second domain
   source of truth; it separately owns frontend-local navigation and workbench view state.
9. **Domain state, frontend-local frame, and workspace-local views.** *Domain* state — projects,
   workspaces, workspace plans, terminal catalogs/PTYs, and git — is backend-owned, shared, and
   persistent; every client hydrates it from the host. Current workbench state is view state and never
   crosses the wire. Each browser tab or native window owns exactly one resource-free `WorkbenchFrame` for
   center and left/right/bottom topology, singleton-tool placement, visibility, folds, normalized geometry,
   bottom alignment, and restore targets. It separately owns one `WorkspaceViewState` per workspace for open
   file/diff/document/terminal placements, tab order, and previews, plus a per-workspace `LayoutAttention`
   overlay keyed into that frame. The mounted workbench is a projection of those local values, not another
   authority.

   Frame mutations are local to one frontend window and persist through its shell-owned local storage
   adapter. Switching workspace changes only the projected workspace view. Empty groups remain until an
   explicit frame command removes or merges them; such a command atomically rehomes affected resources in
   every locally retained workspace view. Applying a preset does the same. Another browser, device, or window
   neither receives nor adopts those changes. Built-in presets and the default used by an explicit local frame
   reset remain client-owned; only bounded, resource-free custom preset definitions are host-persisted and
   broadcast as settings. No current-layout snapshot, revision, mutation, read/write method, or push channel
   exists on the wire.

   This remains placement only, never resource lifetime. Closing a file placement is local; terminal close
   retains its explicit host-domain PTY semantics. The active client location is likewise local: one
   backend-relative route names main / Project Home / workspace; web stores it in a versioned fragment,
   while native shells persist it per backend profile and window. Incoming ids are validated against
   hydrated host state, and no backend-owned "current screen" or current layout lets one client move
   another. Detail: [[submodule-web-shell-layout]] and [[submodule-web-shell-layout-state]].
10. **Dependencies pin exact versions.** Every dependency in every manifest pins an **exact** version — no
    ranges (`^` `~` `>` `<` `.x` `*`). Exact pins make the lockfile the single source of a dependency's
    version and turn every upgrade into an explicit, reviewable diff. Cross-cutting deps (TypeScript,
    typebox, bun types) are pinned **once** in the root `workspaces.catalog` and referenced via `catalog:`,
    so their version lives in exactly one place **and only there: specs never restate it.**
    **Enforced**, not just documented: `scripts/check-catalog.ts` (`bun run check:deps`, in pre-commit + CI)
    rejects any range, any catalog drift, and a lockfile graph that resolves `react` or `react-dom` outside
    its one catalog pin (the React pin rationale belongs to [[module-web]]). Any root `overrides` entry is
    an exact security pin whose rationale and removal gate live with its owner. Exempt: `peerDependencies`
    and local protocols (`workspace:` / `link:` / `file:`).

    The root `packageManager` field also pins Bun for development, CI, and CLI compilation; Bun types
    live in the catalog. Bun `1.4.4` aligns these paths with the desktop runtime, which the desktop
    config selects through Electrobun's `build.bun.version` (see [[module-desktop]]); a desktop test keeps
    the two pins equal. CI reads the root pin rather than maintaining a second version in workflow YAML.
11. **Terminal = xterm.js on the DOM renderer.** The browser terminal is `@xterm/xterm`, driven from
    `apps/web/src/panels/TerminalInstance.tsx` against a real PTY (`bun-pty`) in
    `packages/server/src/terminal`. **The renderer is deliberately the default DOM one**, not `addon-webgl`:
    xterm's maintainer names the DOM renderer a prerequisite for touch support, and WebGL carries context-leak
    defects under per-worktree terminal churn. Coupling is kept deliberately thin so a swap stays a contained
    rewrite of one file.
12. **A shell belongs to a tab, and the host owns the mapping.** Terminals are keyed by
    `(workspaceId, tabKey)`; `terminal.reserve` may durably establish the catalog tab without a process, while
    one idempotent `terminal.attach` remains the only way its PTY is born. Reservation persists before
    publishing membership and rolls back its in-memory insertion if persistence fails. This separation lets a
    synchronized hidden default placement survive reload and another client without starting a shell. The
    client keeps no tab→shell pointer of its own. Shells are **owner-scoped**, matching `todos`, so
    they survive a reload, a closed browser, and a different browser — attach is exclusive, and taking a tab
    over notifies the displaced client. Lifetime is bounded by reference (no tab → no shell) plus the host
    process, **not** by timers. A host restart revives tabs with fresh shells showing recorded output.
    Detail: [[submodule-server-terminal]].
13. **The public website is one origin and production deployment.** `apps/website` owns `/`, `/blog/`,
    and `/vibecoding/` in one static Astro build deployed with same-project Cloudflare Pages Functions.
    D1-backed [[submodule-website-attribution]] provides short-lived browser claims under that deployment;
    it transfers bounded campaign/referrer touch data, not page identity, and is not a second product host
    or identity owner. React and Tailwind are permitted only inside [[submodule-website-vibecoding]];
    unrelated routes retain their vanilla runtime and hand-written stylesheet.
14. **Desktop packaging preserves the host/runtime boundary.** Electrobun `2.0.5` explicitly selects
    the pinned Bun `1.4.4` runtime and embeds the host in that process; it never wraps or spawns the CLI.
    The native window loads the packaged web build from the host's actual loopback port so UI, wire, files,
    and SPA fallback keep one origin. Native resources that require paths stay unpacked. The shell sets the
    staged `bun-pty` library before server import. The CLI and desktop share host boot and graceful shutdown,
    but launchers enforce no process-wide single-instance or canonical-data-directory ownership policy.
    Detail: [[module-desktop]], [[module-ci-release]].
15. **File and diff renderers are registered, not hard-wired.** A resource (a file or one side-pair of a
    diff) is shown by the renderer the `@realthing/resource-renderers` registry selects by match, rank, and
    capabilities for the current intent and viewport class. `@pierre/diffs` renders source diffs and
    phone-class code surfaces; rich formats render through their own renderers' diffs. Monaco renders files
    on desktop and never loads on a phone. Write-paths are host-derived and compare-and-swap guarded
    (`change.revert`/`change.undo`, [[submodule-server-changes]]); the client never sends bytes to write.
    RealThing hosts no VS Code extensions: language intelligence (TextMate grammars, Shiki) is imported as
    libraries. Active content (HTML, SVG, notebook outputs) renders only inside sandboxed, network-denying
    frames. Detail: [[module-resource-renderers]], [[submodule-web-panels]].
16. **A path's spelling follows its kind.** A directory identity (`Project.path`,
    `Workspace.worktreePath`) is the host's **resolved** spelling (`path.resolve`). Paths that enter in
    another spelling are resolved where they enter: git prints `C:/…` on Windows, `REALTHING_DATA_DIR` may be
    relative, and records written before this rule are healed on load ([[submodule-server-persistence]]). A
    **workspace-relative** path on the wire or in a store (file tree, changes, fs events) is POSIX `/` and
    contained in the worktree; the server converts native `path.relative` output where it enters, and git
    object names (`<ref>:<path>`) use `/`.
17. **UI strings are keyed catalogs; local language files are runtime data, not code.** Every
    user-facing string in `apps/web`, `packages/ui`, and `packages/resource-renderers` is a named flat key
    (`settings.language.title`) in [[module-locales]]'s `en.json`, the single English source of truth,
    rendered through one shared i18next instance (`@realthing/locales/react`). **A lint gate fails on
    hardcoded user-facing text** in those trees, so a new string cannot ship without a key. RealThing ships
    bundled catalogs (English plus translations held to `en.json` by a test); a user adds or overrides a
    language by dropping a flat i18next-JSON file into the **global** data dir
    (`~/.realthing/locales/<tag>.json`) — never a workspace, so a cloned repo cannot rewrite the UI.
    The host validates and watches those files ([[submodule-server-locales]]) and serves them over the
    wire; the web merges them over the bundled catalogs ([[submodule-web-i18n]]). Theme manifests are the
    other runtime-loaded user resource, on the same model (`~/.realthing/themes/*.theme.json`, read by
    [[submodule-server-themes]], validated by [[submodule-web-themes]]): a manifest is colour data only
    and is written as CSS custom-property values, never CSS or code.

## Invariants

- Background console children launched by the host or CLI set **`windowsHide: true`**. Bounded Windows
  children also remain **non-detached**, so ordinary helpers inherit a nonvisual console rather than
  opening their own; the platform policy and native regression belong to [[submodule-server-subprocess]].
  Sync and fire-and-forget cases use `@realthing/shared/spawn`; bespoke bounded runners set the option
  directly. Exempt: spawns that inherit an existing terminal's stdio (the `update`/`uninstall` CLI
  subcommands, the build script) and shell probes that are no-ops on win32 (`shellEnv`).
