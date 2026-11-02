---
id: module-web-scripts
type: submodule-design
status: active
title: apps/web build-time scripts — the typography, colour and spacing pipelines
parent: module-web
tags: [web, build, codegen]
---

# `apps/web/scripts` Specification

Build-time code generation scripts for `@realthing/web`. Runs via `bun run generate:themes` (automatically invoked before `dev` and `build`).

## Responsibilities

- **`generate-themes.ts`:**
  - Reads built-in theme definitions from `apps/web/themes/*.json` (`dark.json`, `light.json`, `tokyo-night.json`, `catppuccin-mocha.json`, `github-dark.json`, `solarized-light.json`, etc.).
  - Validates every theme against the required semantic color token contract (`bg-*`, `text-*`, `border-*`, `accent-*`, `status-*`, `diff-*`, `syntax-*`, `terminal-*`).
  - Emits `apps/web/src/styles/themes.generated.css` with `:root` / `[data-theme="<id>"]` CSS custom property blocks consumed by Tailwind v4 (`apps/web/src/styles/index.css`) and `apps/web/src/themes/generated.ts` with typed theme metadata and token maps for Monaco, Shiki, and xterm.js.
- **`sync-brand-icons.ts`:**
  - Extracts programming-language and file-type SVG brand icons from `material-icon-theme` into `apps/web/src/components/brandIcons.generated.ts` for `LanguageBrandIcon` and `FileTypeIcon`.

## Boundary Rules

- Scripts execute at build time under Bun/Node (`fs`, `path`); their generated outputs under `src/` must be pure TypeScript/CSS with zero Node imports.
