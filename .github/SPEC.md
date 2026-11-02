---
id: module-ci-release
type: module-design
status: active
title: CI & release pipeline
parent: architecture
depends-on: [module-cli, module-desktop, module-shared, module-repo-scripts, module-artifact-tests]
---

## Responsibility

Public PR gates, contribution templates, and reusable native build recipes. Release orchestration, signing/notary credentials, source authorization, tags, checksums, and publication belong to `JetBrains/realthing-signing`. This module owns the public action inputs/outputs and artifact/version contract consumed by that private pipeline.

## Boundary

- **Owns:** public CI/site workflows, contribution templates, native build recipes, version calculation, and the artifact interface consumed by the private release controller.
- **Consumes:** CLI and desktop build commands, `@realthing/artifact-tests` smoke entrypoints, shared version stamping, root conformance/unit/browser commands, git, and native platform tools.
- **Forbidden:** product runtime logic; another public release controller; public signing credentials; publication before required signing and verification; checksums over pre-signing bytes; or a release-only application build path that bypasses normal package commands.

## CI

Workflow Bun setup reads the root `package.json` `packageManager` pin through `bun-version-file`.

PR and merge-queue gates cover dependency/boundary/seam/spec-surface conformance, lint/typecheck, unit tests, and Playwright browser E2E tests. Linux and Windows run native CLI artifact smoke; Linux also runs browser tests against the compiled binary. Desktop coverage builds the Linux target, runs native-window and shared artifact probes under Xvfb with test-only software-rendering flags, and runs desktop-backed browser tests. Windows also builds the desktop app and runs its native smoke.

**Required gate.** The ruleset requires one check, `"CI passed"`: an aggregate job that succeeds only when the change classifier, conformance/lint/typecheck, and unit tests succeeded and every other job either succeeded or was skipped by the classifier.

**Change classifier.** A `changes` job diffs the PR or merge group against its base, counting a rename as both its old and new path. When every changed path lies outside the app — the website and its analytics package, the website workflows, README and PR screenshots, the root README, CONTRIBUTING, CODE_OF_CONDUCT and LICENSE, and GitHub's issue/PR templates, CODEOWNERS and this spec — the classifier skips the browser, binary, Windows, and desktop jobs; any other path, or a failed diff, runs them all. Conformance, lint/typecheck, and unit tests always run.

## Native build contract

The private native matrix checks out an explicit public source commit and invokes `.github/actions/build-binary`. The action accepts `version`, `channel`, and a host-matching `target`, plus optional `posthog-cli-api-key` / `posthog-cli-project-id` for source-map upload. Its stable public outputs are:

- `artifact-name` / `artifact-path` — native CLI;
- `desktop-artifact-name` / `desktop-artifact-path` — first-install desktop artifact;
- `desktop-app-archive-path` — expanded macOS app archive, empty on non-macOS targets;
- `desktop-update-manifest-path` / `desktop-update-archive-path` — updater metadata and full application archive, both non-empty on every desktop target.

## Release identity and trust

The release controller supplies an explicit public `source_sha`. The public recipe stamps only `packages/shared/src/version.ts` with `{ version, channel, commit, posthogProjectKey }`; CLI, desktop configuration, analytics, and `server.welcome.appVersion` consume that same identity.

## CLI installation and automation

Root `install.sh` and `install.ps1` remain CLI-only consumers: validate channel/version identity, resolve the requested release, validate its tag against the selected channel's exact grammar before constructing any artifact URL, download the native CLI plus `SHA256SUMS`, verify it, and stage replacement in the destination directory before an atomic rename.
