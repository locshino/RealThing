---
id: submodule-web-lib
type: submodule-design
status: active
title: lib — UI helpers
parent: module-web
tags: [web, utilities]
---

# `apps/web/src/lib` Specification

Pure, side-effect-free frontend helper functions shared across `@realthing/web` sub-modules.

## Public surface (`index.ts`)

- **Error & RPC guards (`error.ts`):** `errorMessage`, `isRpcCode` — extracts human-readable error strings and checks typed `RpcErrorObject.code` classifiers.
- **Path & workspace formatting (`format.ts`, `path.ts`):** `basename`, `dirname`, `normalizePath`, `relativeTime`, `formatBytes`, `workspaceDisplayName` — pure string and timestamp formatters for paths, worktree labels, and file sizes.
- **Monaco & Shiki helpers (`monaco.ts`, `shiki.ts`):** Language detection from file paths, shared Shiki highlighter singleton, and Monaco model/theme sync helpers.
- **Platform shortcuts (`shortcut.ts`):** Platform-aware keyboard shortcut formatting (`Cmd` vs `Ctrl`) and key-event matching.

## Boundary Rules

- Allowed workspace dependencies: `@realthing/contracts`, `@realthing/ui`.
- Forbidden reaches: Zero imports from sibling web sub-modules (`store`, `transport`, `panels`, `shell`).
