---
id: submodule-server-git
type: submodule-design
status: active
title: git — runner + worktree status/diff
parent: module-server
depends-on: [module-contracts]
tags: [public-surface-checked]
---

## Responsibility

Git plumbing: the low-level `git` runner (sync + async) plus a worktree's changed files and diffs over a
**diff scope**, that scope's single definition (the range resolver), a project repo's branch list for the
branch pickers, the workspace branch's own commit list, and a background prefetch that warms a remote base
ref off the workspace-create critical path.

## Boundary

- **Owns:** `git(cwd, args)` (spawn git *sync*, capture trimmed stdout/stderr + ok; `opts.raw` keeps
  decoded stdout untrimmed) and its module-internal `gitBytes(cwd, args, opts?)` twin. `gitAsync(cwd, args, opts?)`
  and **`gitAsyncBytes(cwd, args, opts?)`** are the bounded async twins over `subprocess.runBounded`; the
  latter preserves stdout as `Uint8Array`, while stderr remains decoded diagnostics. They keep network-bound
  ops like `fetch` **and request-path historical reads** off the event loop: this module owns only the
  git-shaped 55s budget and stalled/stderr wording, never child-lifetime mechanics.
  **`remoteTrackingRef(ref, remotes)`** → `refs/remotes/<ref>` when the ref begins with one of the
  repository's configured remote names (`remoteNameOf`, fed by `listRemotes`), else `null` — **the one
  place that spelling is built**, so the probe below and `workspaces`' `worktree add` cannot drift apart.
  **`resolveDefaultBranch` keeps its sync spawn budget** — it is called by every Default-workspace
  `folderTruth`, so a spare spawn is shared-event-loop time every workspace listing pays.
  **`remoteRefOid(repoPath, ref)`** → the oid `refs/remotes/<ref>` resolves to, or `null` — **the one way
  to ask whether a remote-tracking ref is present**, shared by `prefetchBranch` (which compares oids to
  report `moved`) and `workspaces`' create fallback.
  **`nonInteractiveGitEnv()`** — the default environment both runners spawn under: `process.env` plus
  `GIT_TERMINAL_PROMPT=0`, and **nothing else** by default.
  **Request-path reads run through `gitAsync`** — `resolveDiffRange`, `gitStatus`, `gitDiffFile`,
  `listCommits`, `listBranches`, and the workspace badge fan-out are async, so a multi-spawn read can
  never freeze the host's single cooperative event loop.
  **`snapshotWorktree(worktreePath)`** → the tree oid of the worktree as git sees it right now (tracked
  edits and untracked files, ignored files excluded), written through a scratch copy of the index under
  `GIT_INDEX_FILE` so the user's real index, `HEAD`, and reflog never move.
  **the scope→range resolver** — `resolveDiffRange(ws, scope?)` → `Promise<DiffRange>` — **the one definition
  of what a `GitDiffScope` means** (`branch`, `uncommitted`, `commit`, `pinned`). Both reads build their argv
  from it through `changedFileArgs(range, mode)`, so the file list and a file's two sides can never disagree
  on the range. A vanished commit throws a **`CodedError("UNKNOWN_COMMIT")`** (`@realthing/shared/codedError`).
  **`isSafeRef(ref)` / `assertSafeRef(ref)`** — the shape check every **user/repo-supplied ref** passes at its
  mutation door (`workspaces`' `createWorkspace` base + `setWorkspaceDiffBase` target).
  **`diffBaseRef(ws)`** — `diffBase ?? baseBranch`, the single collapse of a workspace's two base meanings.
  **`resolveCommitOid(worktreePath, ref)`** — the full commit oid a ref names right now, or `null`.
  `gitStatus(workspaceId, scope?)` — changed files over the range plus untracked, each carrying per-file
  `added`/`removed` line counts for the Changes tree's `+/−` badges;
  `gitDiffFile(workspaceId, path, scope?)` → `{ original, modified, originalOid, meta: { original, modified } }`;
  `gitUncommittedPaths(workspaceId)` → synchronous tracked + untracked path set;
  `listCommits(workspaceId)` → `{ commits: GitCommit[] }`;
  `countPushDivergence`, `originUrls`, `countPushTargetDivergence`, `commitsAheadOf`, `onBaseBranch`,
  `pushOrigin`, `pushBranchToOrigin`, `deleteRemoteBranchOnOrigin`, `listBranches`, `resolveDefaultBranch`,
  `currentBranch`, `tryCurrentBranch`, `canonicalPath`, `prefetchBranch`, `readBlobAt`, `readBlobBytesAt`,
  `readBlobBytesAtAsync`, `readBlobStreamAtAsync`, `readBlobSizeAtAsync`, `readPathModeAtAsync`,
  `gitCommitPaths`, `gitHeadSha`, `headShaAt`, `readCommitSubject`, `listCommitsSince`,
  `resolveListedCommit`, and `ignoredPaths`.
- **Public surface (barrel):** `git`, `gitAsync`, `gitAsyncBytes`, `gitAsyncStream`, `nonInteractiveGitEnv`, `remoteRefOid`, `remoteTrackingRef`, `gitStatus`,
  `gitUncommittedPaths`, `gitDiffFile`,
  `readBlobAt`, `readBlobBytesAt`, `readBlobBytesAtAsync`, `readBlobStreamAtAsync`, `readBlobSizeAtAsync`,
  `readPathModeAtAsync`, `readCommitSubject`, `commitsAheadOf`, `onBaseBranch`, `originUrls`, `countPushTargetDivergence`,
  `PushTargetStatus`, `pushOrigin`, `pushBranchToOrigin`, `deleteRemoteBranchOnOrigin`,
  `gitCommitPaths`, `gitHeadSha`, `headShaAt`, `listCommits`, `listCommitsSince`,
  `resolveDiffRange`, `changedFileArgs`, `diffBaseRef`, `resolveCommitOid`, `DiffRange`, `isSafeRef`,
  `assertSafeRef`, `listBranches`, `resolveDefaultBranch`, `tryCurrentBranch`, `currentBranch`,
  `canonicalPath`, `resolveListedCommit`, `prefetchBranch`, `countPushDivergence`, `listRemotes`, `remoteNameOf`,
  `snapshotWorktree`, `ignoredPaths`.
- **Allowed deps:** `persistence` (workspace + project lookup), `log`; `fs` (`resourceMeta`/`decodeText`);
  `contracts` (`Git*`/`BranchList`/`ResourceMeta` types);
  `subprocess` (`runBounded`);
  `@realthing/shared/codedError`; `@realthing/shared/spawn`.
- **Forbidden:** `host`; sibling features.

## Get right

- **A scope is defined once.** Any new read that has to know what "the diff" is goes through
  `resolveDiffRange` — never its own `git diff <base>` line — and any read of the base ref goes through
  `diffBaseRef`, so `diffBase ?? baseBranch` exists in exactly one place in the codebase.
- **A commit scope validates that the commit *exists*, not that it is still reachable** from the branch.
- **A failed read is an error, never "no changes".** `gitStatus` (and its `--numstat` pass) honours the exit
  code: a diff that could not run throws, so the panel keeps its last good list and says the refresh failed
  instead of rendering an empty change set.
- `gitStatus` reports the **live** current branch for a user-owned (`kind: "default" | "external"`)
  workspace.
- **A network git call is bounded by us.** `gitAsync` races the child against a **55s budget**
  (`opts.timeoutMs` overrides).
- **The env layers over `process.env`, never replaces it.** `boot`'s `resolveShellEnv()` repairs `PATH`/`LANG`
  by *mutating* `process.env`.
