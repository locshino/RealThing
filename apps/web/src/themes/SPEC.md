---
id: submodule-web-themes
type: submodule-design
status: active
title: themes — bundled manifest catalog and application
parent: module-web
depends-on: [module-contracts]
tags: [ui, themes]
---

# `apps/web/src/themes` Specification

Runtime theme registry, CSS variable injector, and appearance preference manager for `@realthing/web`.

## Responsibilities

- Combines build-time generated theme palettes (`generated.ts` from `apps/web/themes/*.json`) with user-defined themes loaded from `~/.realthing/themes/*.json` (`theme.list`, `theme.changed` SSE event).
- Applies the active theme (`dark`, `light`, `system`, or any named palette ID) to `document.documentElement` via `data-theme` and CSS custom properties, and synchronizes font-family / font-size tokens (`--font-sans`, `--font-mono`, `--editor-font-size`).
- Exports typed color maps for canvas/WebGL consumers that cannot read Tailwind classes directly (`@xterm/xterm` terminal palette and Monaco/Shiki syntax themes).

## Boundary Rules

- Allowed sibling imports: `lib`.
- See `apps/web/src/styles/COLOR.md` and `apps/web/src/styles/SPACING.md` for semantic token and spacing rules.
