---
id: module-repo-scripts
type: module-design
status: active
title: Repository development and conformance scripts
parent: architecture
references: [module-contracts, module-server, module-web, module-cli, module-desktop, module-ci-release]
tags: [tooling, boundaries, build]
depends-on: [module-spec-graph]
---

## Responsibility

Repository-wide development orchestration and conformance gates that do not belong to one product package. These scripts validate architecture, specification, and artifact assumptions; they never implement product behavior.

## Boundary

- **Owns:** the multi-process development launcher; exact-version/catalog validation (`check:deps`); module dependency/import boundary validation (`check:boundaries`); seam validation (`check:seams`); the UI-text gate (`check:i18n`); declared-spec-surface to TypeScript-barrel conformance (`check:spec-surface`); React Compiler bailout baseline check (`check:compiler`); the on-demand CI flake report (`ci:flakes`); and focused root contract tests.
- **Public surface:** the root `package.json` commands consumed by developers, Husky, and CI.
- **Allowed deps:** Bun/Node, the developer's authenticated `gh` CLI (read-only, `ci:flakes` only), the TypeScript compiler API, `@realthing/spec-graph/core` for the canonical spec/frontmatter model, and `mdast-util-from-markdown` for CommonMark block structure.
- **Forbidden:** product runtime logic, a second source of package or feature behavior, editing source as part of a check, or application-internal imports outside focused root contract tests.

## Key Gates

- **`check:boundaries`:** Enforces both manifest edges and static source imports across `apps/*` and `packages/*`. The product rings and launcher edges are exhaustive: `contracts`, `locales`, and `spec-graph` -> none; `shared` -> `contracts`; `server` -> `contracts`, `shared`, `locales`; `ui` -> `contracts`, `locales`; `resource-renderers` -> `contracts`, `locales`, `ui`; `web` -> `contracts`, `locales`, `ui`, `resource-renderers`; `cli` -> `server`, `shared`; `desktop` -> `server`, `shared`, `contracts`, `locales`; `artifact-tests` -> `cli`, `server`, `shared`. Product packages may not import `artifact-tests`.
- **`check:spec-surface`:** Enrolls valid specs tagged `public-surface-checked`. An enrolled spec must retain a bare backticked identifier list under `Public surface` and a discoverable TypeScript barrel (`index.ts` or `src/index.ts`), and the declared and effective export name sets must match in both directions.
- **`check:i18n`:** Enforces that `apps/web/src` and `packages/ui` contain no hardcoded JSX text or text-bearing attributes, that `packages/locales/en.json` keys are sorted and non-empty with no orphaned keys, and that React components do not read the global translator at render time.
- **`ci:flakes`:** (`bun run ci:flakes [--days 14]`) Prints a Markdown report of CI workflow test failures over a window via `gh api`.
