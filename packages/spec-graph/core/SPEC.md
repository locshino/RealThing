---
id: submodule-spec-graph-core
type: submodule-design
status: active
title: Spec-graph core model
parent: module-spec-graph
tags: [spec-graph]
---

## Responsibility

The spec model: the is-a-spec rule, frontmatter parse/serialize and in-place edit (via the `yaml`
library, with link/metadata lists inline), the derived graph (parent tree +
`depends-on`/`references`/`implements` DAG + reverse edges), the on-demand in-memory read index, content
grep with metadata filters, bounded graph slices, and structural validation.

## Boundary

- **Owns:** everything above. The filesystem is the source of truth; the model is derived, in-memory, and
  read-only — the revalidation mechanism lives in `module-spec-graph` (*Derived read index*).
- **Public surface:** the `index.ts` **barrel**. Consumers import the model only through it, never a leaf
  file directly. The module's own test (`core/core.test.ts`) may import a leaf directly to reach internal
  helpers.
- **Allowed deps:** `yaml`; Node built-ins.
- **Forbidden:** any `@realthing/*` package.

## Leaves & the dependency graph

Acyclic and one-way: `parse` is the root, `graph` builds on it, and `query`/`validate`/`store` build on
`graph`. The barrel re-exports the leaves and adds no logic.

| leaf | owns | depends on |
| --- | --- | --- |
| `parse.ts` | file → `{ frontmatter, body }`; the is-a-spec rule; frontmatter parse (lossy read dialect) + serialize; the `updateFrontmatterText` lossless in-place edit; the `FIELDS` field registry and the finite-vocabulary tuples | — |
| `graph.ts` | files → nodes + edges (parent tree, DAG + reverse); duplicate-id tracking | `parse` |
| `query.ts` | content grep with metadata filters; bounded graph slices | `parse`, `graph` |
| `validate.ts` | dangling links, duplicate ids, parent cycles | `parse`, `graph` |
| `store.ts` | `SpecIndex`: the on-demand fs glob + per-file parse cache + memoized graph; the indexable-path rule (`resolveSpecPath`) | `parse`, `graph`, `query` |

## Invariants

- Grep pagination skips a zero-based match offset in source order and returns a continuation only
  when another match exists.
- `buildGraph` is pure (same input → same output); the index revalidates each file by `(mtimeMs, size)`,
  memoizes the graph, and never serves a stale one.
- The glob filters each directory's entries down to the traversal candidates **first** — directories that
  are not ignored, plus `.md` files — and only then normalizes and sorts them.
- That order is **total**: candidates compare by their **NFC-normalized** name and tie-break on the raw
  name by code unit.
- On a duplicate `id`, the first file in that order wins the node slot; the duplicate set is recorded for
  `validate`.
- `resolveSpecPath` is the single answer to "could the index ever see this path?" and it answers with the
  **canonical relative path**, so a caller can never report an identity the index will not produce.
- `resolveSpecPath` canonicalizes each component to its **on-disk spelling** before it judges or reports
  it.
- **The write path over-refuses; the read path stays exact.** `resolveSpecPath` matches `IGNORED_DIRS`
  on the `normalize("NFC").toLowerCase()` fold of each component; the glob keeps matching the byte-exact
  `readdir` name.
- `SpecNode.type` stays `string`: the read model indexes whatever is on disk, so it tolerates any `type`.
- Finite vocabularies (`SPEC_TYPES`, `SPEC_STATUSES`, `SLICE_DIRECTIONS`, `LINK_KINDS`, `IDENTITY_FIELDS`)
  and frontmatter field names (the `FIELDS` registry) are single-sourced `as const`.
- Reads coerce frontmatter to a scalar/string-array dialect. The write path (`updateFrontmatterText`) is
  **lossless**: it mutates a live `yaml` Document in place, so untouched fields keep their order and any
  comments / nested values survive.
- The write path rewrites **only the frontmatter block**: the body is spliced back byte-for-byte, a leading
  BOM is put back, and the line ending applied to the rewritten block is read from the frontmatter's own
  first break (LF or CRLF).
- `grepSpecs` splits on `\n`, drops a trailing `\r` and a leading BOM before matching.
