---
id: submodule-web-navigation
type: submodule-design
status: active
title: navigation — client-local routes and restoration
parent: module-web
depends-on: [module-contracts]
tags: [ui, navigation, multi-client]
references: [architecture, module-desktop]
---

# `apps/web/src/navigation` Specification

Versioned hash-router (`#/v1/...`) for `@realthing/web`. Maps browser URL hash state to active project and workspace selection without a heavy router dependency.

## Route grammar

- `#/v1` — Root welcome / project selection state (`{ projectId: null, workspaceId: null }`).
- `#/v1/projects/<projectId>` — Project selected (`{ projectId, workspaceId: null }`).
- `#/v1/projects/<projectId>/workspaces/<workspaceId>` — Workspace selected (`{ projectId, workspaceId }`).

## Public surface (`index.ts`)

- `parseNavigationHash(hash)` — Parses `window.location.hash` into a normalized `NavigationLocation` (`{ projectId, workspaceId }`), migrating legacy or unversioned hashes cleanly.
- `formatNavigationHash(location)` — Formats a `NavigationLocation` into its canonical `#/v1/...` string.
- `readBrowserLocation()` / `writeBrowserLocation(location, options)` — Reads or updates `window.location.hash` (`replaceState` by default, `pushState` when recording user navigation transitions).
- `subscribeBrowserLocation(listener)` — Subscribes to `hashchange` and `popstate` events.

## Boundary Rules

- Pure browser `window.location` / `history` leaf module; zero imports from sibling sub-modules (`store`, `transport`, `panels`, `shell`).
