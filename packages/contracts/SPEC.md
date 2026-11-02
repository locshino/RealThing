---
id: module-contracts
type: module-design
status: active
title: Wire contracts
parent: architecture
depends-on: []
references: []
tags: [wire]
---

## Responsibility

The browser↔host wire spine: the single source of truth for the protocol. Types plus a small
dependency-free runtime: the WS method/channel constants, protocol/feature versions, the config
default, narrow cross-ring guards, and the quit-confirmation rule both clients drive.

## Boundary

- **Owns:** the wire — entity types, the WS method & channel registries, and the protocol version.
  Including **`WsErrorCode`** — the closed set of failures the *host names* (`WsResponse.errorCode`, today
  `UNKNOWN_COMMIT`, `PUSH_AUTH_FAILED`, `NOT_GIT`, `ALREADY_OPEN`, `RESOURCE_UNAVAILABLE`, `STALE_VIEW`,
  `SCOPE_IMMUTABLE`, `RANGE_INVALID`, `RECEIPT_UNKNOWN`, and `UNSUPPORTED_CHANGE`), so a client can react to
  one specific failure instead of pattern-matching an error message.
- **Public surface (`index.ts`):** `export type *` of `domain` + `nativeClient`
  (`NativeUpdateState`, `NativeUpdateBridge`, `NativeWindowState`, `NativeWindowControlsBridge`,
  `NativeQuitHint`, `NativeCommand`, `NativeShortcutsBridge`, `NativeNotificationInput`,
  `NativeNotificationBridge`, `NativeMenuBridge`, `NativeMenuLabels`);
  `QUIT_CONFIRMATION`, `createQuitConfirmation`, `QuitConfirmationDependencies` from `quitConfirmation`;
  the value re-exports `clampToCodePoints`, `DEFAULT_CONFIG`, `DEFAULT_FILES_EXCLUDE`,
  `DEFAULT_WORKSPACE_NAME`, `EDITOR_AUTO_SAVE_DELAY_MS`, `EDITOR_CURSOR_STYLES`, `EDITOR_FONT_SIZE`,
  `EDITOR_LINE_NUMBERS`, `EDITOR_RENDER_WHITESPACE`, `EDITOR_TAB_SIZES`, `EXPLORER_FILE_ICONS`,
  `EXPLORER_SORT_ORDERS`, `GIT_COMMIT_LIST_MAX`, `isEditorAutoSaveDelayMs`, `isEditorCursorStyle`,
  `isEditorFontSize`, `isEditorLineNumbers`, `isEditorRenderWhitespace`, `isEditorTabSize`,
  `isExplorerFileIcons`, `isExplorerSortOrder`, `isFilesExcludeList`, `isGitCommitListMax`,
  `isLineWidth`, `isLocalePreference`, `isStringMap`, `isSystemThemePair`, `isTerminalCursorStyle`,
  `isTerminalFontSize`, `isTerminalScrollbackLines`, `isTerminalShellArgs`, `isTerminalWindowsShell`,
  `isThemeMode`, `LINE_WIDTH_COLUMNS`, `normalizeProjectSettingsOverride`, `normalizeThemePreference`,
  `PROJECT_SETTINGS_PATH`, `SYSTEM_LOCALE_PREFERENCE`, `TERMINAL_CURSOR_STYLES`, `TERMINAL_FONT_SIZE`,
  `TERMINAL_REPLAY_KB`, `TERMINAL_SCROLLBACK_LINES`, `TERMINAL_WINDOWS_SHELLS`, `THEME_MODES` from
  `domain`; and `export *` of
  `wsProtocol` (`WS_METHODS`, `WS_CHANNELS`, `INITIAL_TERMINAL_TAB_KEY`, `PROTOCOL_VERSION`,
  feature-introduction versions, and the typed request/response/push maps).
- **Allowed deps:** none at runtime.
- **Deployment obligation:** wire contracts describe host behavior and compatibility, never the launcher
  or deployment that supplies it. A feature's wire shape is shared by browser, desktop, and future clients.
  Separate type-only native client capabilities describe an optional shell-local bridge, not host WS
  methods.
- **Forbidden:** importing `server` / `shared` / `web`.

## Contents

- **domain.ts** — app entities:
  - `Project` (git repo + unique `slug` + optional `closed: true`), `ProjectPathStatus` (`repo` /
    `initable` / `missing` / `notDirectory`), and `PathCandidate` / `PathSuggestionsResult`;
  - `Workspace` (git worktree; optional `kind: "default" | "external"`, `renamed`,
    `initialTerminalPending: true`, `diffStats`,
    `baseBranch`, `diffBase`) and `ExistingWorktreeCandidate`;
  - `FileNode` (file-tree node; worktree-relative `/` path, `gitignored` when git ignores it) and
    `ResourceMeta` (sha-256 `hash`, `byteLength`, `text`, optional `mime`);
  - `LineSpan`, `RevertTarget` (`file` or `range` as line spans on both sides), and `ChangeReceipt`
    (the answer to `change.*` calls and its undo token);
  - `GitStatus`, `GitFileChange`, `GitFileStatus`, `GitDiffScope` (`branch`, `uncommitted`, `commit`,
    `pinned`), `GitCommit`, `BranchList`, and `RemoteBranchGroup`;
  - `TodoItem`, `TodoGroupItem`, `TodoPlan`, `TodoArtifact`, `TodoStatus`, `TodoOrigin`,
    `TodoArtifactKind`, `TodoGroupStatus` — the workspace checklist DTOs;
  - `ThemeId`, `ThemeMode`, `SystemThemePair`, `ThemePreference`, `THEME_MODES`, `isThemeMode`,
    `isSystemThemePair`, `normalizeThemePreference`;
  - `LayoutPreset`, `LayoutToolId`, `LayoutBottomAlignment`, and layout node shapes;
  - `LINE_WIDTH_COLUMNS`, `isLineWidth`, `TERMINAL_REPLAY_KB`, `TERMINAL_WINDOWS_SHELLS`,
    `TerminalWindowsShell`, `isTerminalWindowsShell`, plus editor, explorer, terminal, git, and
    per-project settings override constants and validators (`ProjectSettingsOverride`,
    `normalizeProjectSettingsOverride`, `PROJECT_SETTINGS_PATH`);
  - `SYSTEM_LOCALE_PREFERENCE`, `isLocalePreference`, `LocalLocalesSnapshot`, `LocalLocaleFile`,
    `UserThemesSnapshot`, `UserThemeFile`;
  - `AppConfig`, `AppConfigUpdate`, `DEFAULT_CONFIG`, and `InterviewResponse`.
- **nativeClient.ts** — type-only shell-local desktop bridge contracts (`NativeUpdateBridge`,
  `NativeWindowControlsBridge`, `NativeShortcutsBridge`, `NativeNotificationBridge`, `NativeMenuBridge`).
- **quitConfirmation.ts** — `QUIT_CONFIRMATION` and `createQuitConfirmation` for double-press quit
  confirmation shared across browser and desktop shells.
- **wsProtocol.ts** — `WS_METHODS`, `WS_CHANNELS`, `WsMethodMap`, `WsRequest`, `WsResponse`, `WsPush`,
  `WsErrorCode`, `ServerWelcome`, terminal push shapes, and protocol version constants.
