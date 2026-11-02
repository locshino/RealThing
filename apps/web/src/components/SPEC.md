---
id: submodule-web-components
type: submodule-design
status: active
title: components — shared UI primitives
parent: module-web
tags: [ui, resilience]
---

# `apps/web/src/components` Specification

Shared domain-aware UI widgets used across `panels` and `shell`. Pure design-system primitives (buttons, dialogs, dropdowns, tabs, inputs, tooltips) live in `@realthing/ui`; this module holds RealThing-specific composite components.

## Public surface (`index.ts`)

- **`ErrorBoundary`** — React error boundary that catches render exceptions in a panel/pane subtree, logs diagnostics, and offers an in-place reset action without tearing down the rest of the workbench.
- **`FileTypeIcon` & `LanguageBrandIcon`** — Renders file/directory/language icons by filename, extension, or language ID using generated SVG brand assets with Remix Icon fallbacks.
- **`MarkdownContent` & `HighlightedCodeBlock`** — Renders GFM markdown with Shiki-highlighted fenced code blocks, copy buttons, and safe link handling.
- **`OpenInEditorControl`** — Split button + dropdown menu that opens the active workspace or file in the user's preferred external editor (`editor.list` / `editor.open`, persisting `preferredEditorId` via `settings.patch`).
- **`ResizeHandle`** — Accessible pointer-drag separator for resizable sidebars, panes, and docks.
- **`ToastViewport`** — Renders ephemeral error/warning/info toasts from `useHostStore.toasts`.
- **`UpdateChip`** — Compact header pill rendered when a newer RealThing release is available or downloaded.
- **`WorkspaceStatusBadge`** — Displays git dirty/clean state, branch divergence, and worktree status badges.

## Boundary Rules

- Allowed sibling imports: `store`, `transport`, `lib`, `themes`.
- Forbidden reaches: Never import `panels` or `shell`.
