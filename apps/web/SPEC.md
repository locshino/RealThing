---
id: module-web
type: module-design
status: active
title: Web UI client
parent: architecture
depends-on: [module-contracts, module-locales, module-ui, module-resource-renderers]
tags: [ui]
---

# `@realthing/web` Specification

Standalone React 19 + Zustand + Tailwind v4 SPA (`apps/web`). Connects to `@realthing/server` over the `@realthing/contracts` HTTP/SSE protocol; ships static assets consumable by `@realthing/cli`, `@realthing/desktop`, or any static file server pointed at a remote host.

## Boundary invariants

- **Allowed workspace dependencies:** `@realthing/contracts`, `@realthing/locales`, `@realthing/ui`, `@realthing/resource-renderers`.
- **Forbidden reaches:** Never import `@realthing/server`, `@realthing/shared`, or Node built-ins. Enforced by `bun run check:deps` and `bun run check:boundaries`.
- **Sub-module barrel rule:** Every `src/<module>/` directory has its own `SPEC.md` and `index.ts` barrel. Siblings and `App.tsx` import only through `<module>/index.ts` (except `src/panels/*`, which avoids a barrel so Vite can code-split heavy panes like Monaco/Shiki/xterm).
- **Styling:** Semantic CSS custom properties generated from theme JSONs (`src/styles/themes.generated.css`) mapped to `@theme inline` Tailwind v4 utilities in `src/styles/index.css`. Zero inline `style={{...}}` objects (`styles/COLOR.md`) and explicit spacing rhythm (`styles/SPACING.md`).

## Sub-module topology & dependency DAG

```text
navigation  lib  i18n  themes
     \       |    |      /
      v      v    v     v
         transport
             |
             v
           store
             |
             v
         components
             |
             v
           panels
             |
             v
           shell  <-- updates
             |
             v
          App.tsx
```

| Sub-module | Responsibility | Allowed sibling imports |
| --- | --- | --- |
| [`src/navigation`](./src/navigation/SPEC.md) | Versioned hash URL (`#/v1/...`) parser, formatter, and history subscription | *(none)* |
| [`src/lib`](./src/lib/SPEC.md) | Pure frontend utilities (path formatting, time formatting, error guards, terminal theme conversion) | *(none)* |
| [`src/i18n`](./src/i18n/SPEC.md) | Locale state, catalog merging (built-in + `~/.realthing/locales`), and `@realthing/locales/react` provider | `transport`, `store` |
| [`src/themes`](./src/themes/SPEC.md) | Theme registry (`dark`, `light`, built-in palettes, custom `~/.realthing/themes/*.json`), runtime CSS variable injection, appearance preferences | `lib` |
| [`src/transport`](./src/transport/SPEC.md) | `HostTransport` (`POST /rpc` + `GET /events` SSE), exponential-backoff reconnect, welcome handshake | *(none)* |
| [`src/store`](./src/store/SPEC.md) | Single Zustand store (`useHostStore`) holding server-mirrored projects/workspaces, files/changes caches, terminals, layout state, and UI preferences | `navigation`, `transport`, `themes`, `lib` |
| [`src/components`](./src/components/SPEC.md) | Shared domain-aware UI widgets (`LanguageBrandIcon`, `FileTypeIcon`, `ToastViewport`, `ErrorBoundary`, `ResizeHandle`, `MarkdownContent`, `WorkspaceStatusBadge`, `UpdateChip`, `OpenInEditorControl`) | `store`, `transport`, `lib`, `themes` |
| [`src/panels`](./src/panels/SPEC.md) | Layout-agnostic panels (`ProjectTree`, `WelcomePanel`, `FilesPanel`, `ChangesPanel`, `FilePane`, `DiffPane`, `PlanPane`, `PlanRailPane`, `TerminalInstance`, `SettingsDialog`, and workspace/project dialogs) | `store`, `transport`, `components`, `themes`, `lib`, `i18n` |
| [`src/updates`](./src/updates/SPEC.md) | Desktop/CLI update state reconciliation and install triggers | `store`, `transport` |
| [`src/shell`](./src/shell/SPEC.md) | Top-level 5-zone IDE layout (`Shell`), location bar, left/right rails, center workbench, bottom terminal dock, and reconciliation hooks | `navigation`, `transport`, `store`, `panels`, `components`, `themes`, `updates`, `lib`, `i18n` |
