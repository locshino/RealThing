---
id: submodule-server-settings
type: submodule-design
status: active
title: settings — server-synced app config
parent: module-server
depends-on: [module-contracts]
---

## Responsibility

The server-synchronized app config: opaque fixed-theme selection, fixed/system mode and optional light/dark
pair, additional-analytics preference and first-run dialog completion marker, terminal replay budget and
Windows shell preference, file visual line width plus pane bound, bounded custom layout-preset catalog,
onboarding dismissal (`onboardingDismissed`), and the UI
language preference (`locale`).
The module reads, normalizes, persists, caches, and broadcasts values that intentionally follow the owner
across frontends.

Current workbench frame, workspace resource placement, current/default preset selection, side/bottom group limits, selection, and focus are explicitly absent. Those are frontend-surface-local view state under [[submodule-web-shell-layout-state]]. Built-in layout presets remain web-owned.

A numeric setting is bounded by its consumer when that domain owns the safety cap—for example `terminal`
clamps `terminalReplayKb`, so a hand-edited config cannot exhaust memory. Settings validates the shared
40–240 line-width contract and custom layout presets because it owns their cross-frontend storage contract.

## Boundary
- **Owns:** cached current `AppConfig`; `getConfig()`; `updateConfig(partial)` (reject a non-object or unknown key → merge → validate known fields → persist → publish the merged `AppConfig` and successful applied `AppConfigUpdate`); line-width and resource-free custom-preset validation/normalization; custom-preset safety caps; `setSettingsPublisher`; and `resetConfigCache` for tests.
- **Public surface (barrel):** `getConfig`, `updateConfig`, `setSettingsPublisher`, `SettingsPublisher`, `resetConfigCache`, plus pure custom-preset normalization used by host startup after persistence load.
- **Allowed deps:** `persistence` (`loadConfig`/`saveConfig`); `contracts` (`AppConfig`, `LayoutPreset`,
  `isTerminalWindowsShell`).
- **Forbidden:** host or another feature sibling; current-layout document/snapshot types; workspace ids/resources; current frame validation; owning WS channels; or importing web preset definitions.

## Get right

- **Converge on broadcast, no client optimism.** `updateConfig` persists before replacing the live cache or publishing; a failed write changes neither runtime reads nor frontends. The publisher receives the full merged config for broadcast and the applied partial update so host consumers can distinguish an explicit field write from an unrelated merge. Every frontend, including the initiator, adopts `settings.changed`. `server.welcome` seeds the same cached value.
- `terminalWindowsShell` defaults to `"auto"`; persisted values fall back through persistence's shared
  `isTerminalWindowsShell` guard, while a wire mutation outside the closed shell union rejects the complete
  update before cache, persistence, or broadcast changes. Settings owns validation and synchronization;
  `terminal` owns executable resolution and spawning.
- `fileLineWidth` defaults to 120 and accepts only finite integers from 40 through 240; its `fileLineWidthBounded` switch defaults to `true`. A malformed stored field falls back without discarding valid siblings; any invalid supplied field rejects the complete mutation before cache, persistence, or broadcast changes.
- `onboardingDismissed` defaults to `false` when absent or malformed on disk; a present non-boolean update is rejected like the other boolean fields. Only the web onboarding wizard reads it.
- `locale` is `"system"` (default) or a canonical BCP-47 tag (`isLocalePreference`: `pt-BR`, not
  `pt-br`). Settings never checks that a language is available — bundled catalogs belong to the web build
  and local files to [[submodule-server-locales]] — so a tag whose file was deleted persists and returns
  with the file. A malformed stored value falls back to `"system"`; a malformed update rejects the whole
  mutation.
- Theme availability/labels/palettes, operating-system appearance, and the effective theme are not server concerns. `theme` remains the opaque fixed choice; `themeMode` defaults to `"fixed"`, and `systemThemePair` remains absent until first use. A persisted pair is retained only when both slots are strings; malformed pairs are dropped, and system mode without a retained pair normalizes to fixed without replacing a valid fixed id. A missing/invalid mode also normalizes to fixed while an independently valid dormant pair may survive. Entering system mode requires a complete valid-shaped existing-or-incoming pair; a pair mutation replaces both slots atomically. Unknown ids remain persisted for each independently shipped frontend to resolve by required appearance.
- A `settings.update` carrying `theme` without explicit `themeMode` is a legacy-compatible fixed-theme action and sets mode to `"fixed"`. Thus an old client connected to a system-configured host can never appear to change only itself: its deliberate theme choice exits system mode through the ordinary persist-before-broadcast path.
- Retired host-layout fields are dropped from an update without error rather than persisted or broadcast, so older clients that still send them keep working. Layout instantiation is a frontend-local preference.
- **Update keys are a closed set; stored keys are not.** `updateConfig` rejects a non-object payload and any key outside `AppConfigUpdate` plus the retired keys, before cache, persistence, or broadcast changes. The accepted set is compile-checked against `AppConfigUpdate`, so a contract change that adds or removes a key fails the build until the set matches. Unknown keys already on disk still load and survive later valid updates, so an older host keeps a newer host's settings. A newer client must gate any new key on the host protocol version, as `THEME_SYSTEM_PROTOCOL_VERSION` gates appearance settings; an older host rejects the whole update rather than persisting an unknown key.
- **An accepted key is value-checked before it reaches the merge.** `terminalReplayKb` must be a finite number (its range stays with `terminal`, which clamps on read), alongside the typed checks the other fields already have. A malformed value rejects the whole update before cache, persistence, or broadcast changes, exactly like an unknown key.
- Custom layout presets are a complete top-level catalog replacement, not a nested per-item patch. Each value is bounded, resource-free, uniquely identified, uses only the current preset schema, and contains no workspace/tab/terminal identity. A malformed persisted member is isolated during config validation; a wire mutation with any malformed member is rejected as a whole. No alternate config key or old preset schema is read or upgraded.
- Deleting or editing a custom preset changes only the shared definition. It cannot mutate any frontend's instantiated frame or local default selection.
- Analytics preference and first-run dialog completion are validated booleans. The dialog may persist the
  default-on preference alone; a preference-only write never infers completion. Confirmation without a
  preference is rejected, and changing a confirmed decision writes both fields. The delivery gate belongs to
  [[submodule-server-analytics]]; the dialog lifecycle belongs to [[submodule-web-panels]].
