---
id: module-spec-graph
type: module-design
status: active
title: Spec-Graph model
parent: architecture
depends-on: []
tags: [spec-graph]
---

## Responsibility

`@realthing/spec-graph` provides the repository's **spec-graph** read and frontmatter model. It manages the
frontmatter schema the repo's specs use — a file is a spec once its frontmatter carries `id` and `type`.
Frontmatter is handled with the `yaml` library, link/metadata lists inline.

## Boundary

- **Owns:** the spec model (the is-a-spec rule, frontmatter parsing and lossless in-place updates, the
  derived graph, the read index, and structural validation) exposed at `@realthing/spec-graph/core`.
- **Public surface:** `@realthing/spec-graph/core` (`core/index.ts` barrel).
- **Allowed deps:** `yaml` (frontmatter parse/serialize); Node built-ins.
- **Forbidden:** any other `@realthing/*` package — the dependency edge is one-way (consumers → this
  package).

## Sub-modules

`core/` (`submodule-spec-graph-core`) is the spec model and read index.

## Derived read index

The filesystem is the source of truth; the model consumers read is **derived, in-memory, read-only, and
revalidated on demand**. Each read re-runs the **glob** — a name-sorted traversal that ignores
`node_modules`/`.git`/`dist`/`build` and assistant scratch directories — and revalidates every file by
`(mtimeMs, size)`: unchanged files reuse their cached parse, changed/new files are re-parsed, vanished
files are evicted, and the derived graph is rebuilt only when the spec set actually changed.

## Invariants

- The dependency edge is one-way: workspace scripts and packages depend on this package; this package
  depends on nothing in the monorepo.
- The index is a derived read cache over the filesystem (the source of truth) and never serves a stale
  graph.
