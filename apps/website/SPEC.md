---
id: module-website
type: module-design
status: active
title: Project website (realthing.ai)
parent: architecture
tags: [website, marketing]
depends-on: [module-website-analytics]
references: [module-ci-release]
---

# `@realthing/website` Specification

Public marketing and documentation website (`apps/website`) for RealThing, built as a static Astro site.

## Responsibilities

- Presents RealThing's workspace-first developer IDE capabilities (Git worktrees, rich file editing, multi-scope diff review, integrated terminal, and workspace plans), download links, changelog/blog posts, and documentation.
- **Sub-modules:**
  - [`src/attribution`](./src/attribution/SPEC.md) — First-touch UTM / referrer attribution capture for download links.
  - [`src/vibecoding`](./src/vibecoding/SPEC.md) — Interactive guide and content pages for modern workspace-first development workflows.

## Boundary Rules

- Standalone Astro package; does not bundle `@realthing/server` or `@realthing/web` runtime code.
