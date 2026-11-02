# RealThing

A modern, workspace-first developer IDE built around Git worktrees, rich file viewing and editing
(Monaco + Shiki), multi-scope diff & change review, integrated PTY terminals, and manual workspace
plans/checklists.

## Read context proportionally

- Use `goal-and-requirements.md` for the product's goal, principles, capabilities, and non-goals.
- Use `architecture.md` for system topology, cross-module decisions, and repo-wide invariants.
- Read the owning `SPEC.md` when work is governed by or may alter a module boundary, contract,
  invariant, documented behavior, or architecture decision.
- Localized work does not require unrelated specs or a full repository map.

## Module structure and boundaries

Clear, fractal module boundaries are a top-priority requirement:

- Every package and meaningful directory-level sub-module has a `SPEC.md` stating its responsibility,
  public surface, allowed dependencies, and forbidden reaches.
- A sub-module exposes an `index.ts` barrel as its only public surface; siblings import through the
  barrel, never internals. Per-file imports remain only where a barrel would defeat code-splitting or a
  library convention, such as `apps/web/src/panels` and `packages/ui`.
- Dependency edges between sibling sub-modules live in the parent module's `SPEC.md`, not each leaf.
- A change that moves or blurs a boundary updates the owning spec first. Cover public surfaces and
  boundary rules with tests where practical, but do not manufacture coverage for a localized change.

## Architecture

- The three rings are host (`packages/server` + `packages/shared`), typed wire (`packages/contracts`),
  and independently shippable UI (`apps/web`). `apps/cli` and `apps/desktop` are thin launchers over
  the same host.

## Repo-wide invariants

- `apps/web` depends on `contracts`, `locales`, `ui`, and `resource-renderers` only, never `server` or
  `shared`.
- User-facing UI text is a key in `packages/locales/en.json` rendered through `@realthing/locales/react`;
  the lint gate rejects hardcoded JSX text and text attributes.
- UI panels are layout-agnostic; the shell arranges them.
- Errors are reported to PostHog Error Tracking unconditionally, but only as a classifier — type, `code`,
  source/scope/request method and RealThing-only stack frames — never `message` text. Give a failure worth
  telling apart a `CodedError` code rather than relying on its message. Host diagnostics that carry an
  error go through `logger(scope)`, not `console.*`. The allow-list lives in
  `packages/server/src/analytics/SPEC.md`.
- The transport host endpoint is a parameter, defaulting to same-origin; `server.welcome` carries the
  protocol version.

### Web UI context

For web UI work, read `apps/web/SPEC.md` and the owning sub-module spec. Styling uses Tailwind v4
utilities mapped to generated semantic CSS-var tokens: never inline style objects, raw hex, internal
palette names, or unknown token utilities. Read `apps/web/src/styles/COLOR.md` for color work and
`apps/web/src/styles/SPACING.md` for spacing work. Use `@remixicon/react` icons (Line by default, Fill
when active) and owned shadcn/Radix primitives from `@realthing/ui/<primitive>`; `cn()` lives in
`@realthing/ui/utils`. These rules also apply to `packages/ui` and `packages/resource-renderers`.

## Specs and comments

Specs are the durable home for intent, decisions, invariants, trade-offs, and post-mortems. Keep them
concise and avoid restating code or another spec. Comments are near-zero: lint/type directives and a
rare one-line hazard note are acceptable; rationale and narrative belong in the owning spec.

## Verification

Local tests use disposable fixtures and have no production access. Run affected tests, fix failures
caused by the requested change, and rerun them without asking for approval at each step.

- Iterate with the smallest relevant unit or focused E2E target.
- For shipped app behavior or integration changes, run the complete browser suite (`bun run e2e`) once
  after the combined implementation and before final handoff or PR — not once per TODO item or commit.
- Documentation/spec-only changes and test-harness-only changes use targeted checks unless they can
  affect the shipped runtime.
- Fast gates: `bun run check:deps`, `bun run check:boundaries`, `bun run lint`, and `bun run typecheck`.
  Unit tests are `bun run test`; `bun run check:spec-surface` validates enrolled spec/barrel public
  surfaces; `bun run check:compiler` fails when a web function newly bails out of the React Compiler (or
  starts compiling) against the committed census baseline.
- Binary and desktop artifact modes have separate gates; use them when changing those artifacts.

All runner modes, isolation guarantees, cancellation behavior, and debugging commands live in
`e2e/SPEC.md`.

## Handoff hygiene

Green gates are necessary but not sufficient:

- Before a local handoff, review the task-scoped working tree and commits. Before opening or updating a
  PR, review the full branch diff against its base plus the working tree.
- For nontrivial implementation, do a subtraction pass: remove avoidable abstractions, state owners,
  dependencies, compatibility layers, and fallbacks. Report material removals and justify layers that
  remain; do not add ceremony for a localized edit.
- Never add `biome-ignore`, `@ts-expect-error`, `@ts-ignore`, `eslint-disable`, or `as any` merely to make
  a gate pass. Treat the error as a design signal. If a suppression is genuinely required, get explicit
  user approval first.
- Audit newly added comments and suppressions in the same diff range being reviewed. Do not let prior,
  unrelated branch history contaminate a task-local handoff.
- Centralize duplicated nontrivial derivations. In the web app, derived store state belongs in
  selectors and writes that always travel together belong in one atomic action.
- When replacing a pattern or state model, search for every old occurrence and migrate it, or name the
  intentional survivors.
- `README.md` is the user-facing front page. For a change that adds, removes, or renames a user-visible
  capability, or alters installation or analytics behavior, review its claims and update the affected
  ones in the same change; refresh a screenshot under `.github/readme-assets/` when the UI it depicts
  changes materially.
- Apply safe cleanup that is inside the approved scope. Ask only for destructive, out-of-scope, or
  product-level decisions.

## Stack

Bun + Turbo monorepo · TypeScript strict · React 19 + Zustand + Tailwind v4. App state lives under
`~/.realthing`.

Dependencies pin exact versions. Cross-cutting dependencies are pinned once in the root
`workspaces.catalog` and referenced through `catalog:`; peer dependencies and local protocols are the
only exemptions. `architecture.md` Decision #10 owns the rationale.
