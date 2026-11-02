# RealThing

[![JetBrains incubator project](https://jb.gg/badges/incubator-plastic.svg)](https://confluence.jetbrains.com/display/ALL/JetBrains+on+GitHub)
[![GitHub stars](https://img.shields.io/github/stars/JetBrains/realthing?style=social)](https://star-history.com/#JetBrains/realthing&Date)
[![Discord](https://img.shields.io/badge/Discord-Join%20the%20chat-5865F2?logo=discord&logoColor=white)](https://realthing.ai/discord)

RealThing is a modern, workspace-first developer IDE built around Git worktrees, rich file editing and
inspection (Monaco + Shiki), multi-scope diff and change review, integrated PTY terminals, and manual
workspace plans and checklists.

**Website:** [realthing.ai](https://realthing.ai/) · **Blog:** [realthing.ai/blog](https://realthing.ai/blog/) ·
**Discord:** [realthing.ai/discord](https://realthing.ai/discord)

⭐ If you find RealThing useful, give it a star — it helps others discover it.

<p align="center">
 <a href="https://www.star-history.com/jetbrains/realthing">
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/badge?repo=JetBrains/realthing&type=rank&theme=dark" /><source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/badge?repo=JetBrains/realthing&type=rank" /><img alt="Star History Rank" src="https://api.star-history.com/badge?repo=JetBrains/realthing&type=rank" /></picture> <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/badge?repo=JetBrains/realthing&type=trending&theme=dark" /><source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/badge?repo=JetBrains/realthing&type=trending" /><img alt="GitHub Trending Repository of the Day" src="https://api.star-history.com/badge?repo=JetBrains/realthing&type=trending" /></picture>
 </a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/workbench-dark.png">
  <img src=".github/readme-assets/workbench-light.png" alt="RealThing workbench: the Projects pane beside the left tool rail listing worktree workspaces, the editor and diff views in the center, and the Changes list on the right with their tools on the edge rail" width="900">
</picture>

*An isolated git-worktree workspace with its files, diffs, changes, and integrated terminal.*

## What you get

- **Isolated workspaces.** Open any git repo as a project and cut workspaces from it as `git worktree`s,
  each with its own branch and working directory. Work across multiple branches in parallel without touching
  your main checkout; merge the good branch, delete the rest. You can also attach existing worktrees or
  explicitly work in the project folder itself. The topbar shows where the active
  branch stands against `origin` and lets you open the worktree in your installed IDE or file manager.
- **A splittable workbench.** Monaco editor tabs with Shiki syntax highlighting, rich resource renderers
  (Markdown, JSON, CSV, notebooks, images, SVGs, PDFs, HTML), a Files tree with live git change marks and
  a Changed view, multi-scope diffs (branch, uncommitted, and per-commit) with file and hunk revert/undo,
  integrated PTY terminals, and manual workspace checklists — all scoped to the active workspace.
- **Manual workspace plans.** Track tasks and checklists directly inside each workspace with structured
  groups and items through the Plan tool and center Plan page.
- **Desktop app or browser.** A native desktop app, or the `realthing` CLI that opens the same app in your
  browser. Both embed the same host; app state lives under `~/.realthing`.
- **Your language.** Settings → Language follows your system language or a language you pick; English,
  Japanese, Simplified Chinese, and Spanish are built in. Add a language RealThing doesn't ship yet by
  dropping a translated `en.json` into `~/.realthing/locales` — it applies as you save.
- **Your themes.** Settings → Appearance ships dark, light, minimal, and high-contrast themes. Make your own
  by copying a bundled `*.theme.json`, changing its id and colors, and saving it to `~/.realthing/themes`.

## Install

RealThing ships in two additive forms: a native desktop installer and the self-contained `realthing` CLI.
Both are published with `SHA256SUMS` on the [releases page](https://github.com/JetBrains/realthing/releases).

### Desktop

Download the `realthing-desktop-*` asset for your platform:

- **macOS 14+ (Apple Silicon or Intel)** — open the DMG for your architecture:
  `realthing-desktop-darwin-arm64.dmg` or `realthing-desktop-darwin-x64.dmg`.
- **Windows x64** — extract the complete setup ZIP, then run its setup executable in place, next to its
  payload.
- **Linux x64 / ARM64** — extract the setup tarball and run `installer`. Desktop builds need glibc 2.38+
  with GTK 3, WebKitGTK 4.1, Ayatana AppIndicator 3, and librsvg 2 — Ubuntu 24.04 or newer:

  ```bash
  sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2
  ```

Packaged stable and nightly desktop builds check for updates in the background and offer them in
**Settings → Updates**: **Download** → **Preparing update** → **Install & Restart**. Nothing is applied until
you choose **Install & Restart**. RealThing then shows the installation's progress and log, closes, and
reopens on the new version. After the restart it tells you whether the update installed. If it didn't, it
explains why and offers to retry. The updater appears only when the package carries a valid HTTPS feed
identity; installations that predate that identity need one manual installation first.

### Command line

The installer downloads the right binary, verifies its SHA-256 checksum, and puts `realthing` on your PATH.

**macOS / Linux** (also Windows under Git Bash):

```bash
curl -fsSL https://raw.githubusercontent.com/JetBrains/realthing/main/install.sh | bash
```

**Windows** — the same command works from cmd and PowerShell:

```powershell
powershell -c "irm https://raw.githubusercontent.com/JetBrains/realthing/main/install.ps1 | iex"
```

Then run `realthing`, optionally with a git repo to open as a project:

```bash
realthing ~/code/my-repo
```

`realthing` needs `git` on your PATH. **Start a new project** creates an empty git repository (under
`~/realthing` by default), so you don't need one ready. `realthing --help` lists the flags;
`realthing --version` prints the build.

<details>
<summary><strong>Nightly builds, pinned versions, updates, and uninstall</strong></summary>

The installer takes `--channel stable|nightly` and `--version`; a pinned version must belong to the
selected channel:

```bash
curl -fsSL https://raw.githubusercontent.com/JetBrains/realthing/main/install.sh | bash -s -- --channel nightly
curl -fsSL https://raw.githubusercontent.com/JetBrains/realthing/main/install.sh | bash -s -- --channel stable --version 0.1.2
curl -fsSL https://raw.githubusercontent.com/JetBrains/realthing/main/install.sh | bash -s -- --channel nightly --version 0.2.0-nightly.10
```

On Windows the options are environment variables (`REALTHING_CHANNEL`, `REALTHING_VERSION`,
`REALTHING_PREFIX`, `REALTHING_NO_MODIFY_PATH`):

```powershell
$env:REALTHING_CHANNEL='nightly'; irm https://raw.githubusercontent.com/JetBrains/realthing/main/install.ps1 | iex   # PowerShell
set "REALTHING_CHANNEL=stable" && set "REALTHING_VERSION=0.1.2" && powershell -c "irm https://raw.githubusercontent.com/JetBrains/realthing/main/install.ps1 | iex"   # cmd
```

Installed stable and nightly CLI hosts periodically offer **Run Update** in **Settings → Updates**. It runs
the host machine's `realthing update` in the background — also when the UI is open in a browser on another
machine — and a successful update asks you to restart the host manually. You can run `realthing update`
directly on any platform: it re-runs the installer for the installed channel and replaces
`<prefix>/bin/realthing[.exe]`; pass `--channel` or `--version` only for an explicit override.

`realthing uninstall` removes the executable, the PATH entry the installer added, and the install metadata,
and asks whether to delete your `~/.realthing` app state (kept by default — `--remove-data` deletes it,
`-y` skips the questions).

Prefer a manual install? Download a binary and `SHA256SUMS` from the releases page and verify the checksum.
For self-update to work, rename it to `realthing` (`realthing.exe` on Windows) and place it at
`<prefix>/bin/realthing[.exe]`; a binary kept under its release filename or elsewhere must be replaced
manually or reinstalled with the script.

</details>

### Platform notes

| Platform | Desktop | CLI |
| --- | --- | --- |
| macOS Apple Silicon / Intel | DMG | signed binary |
| Windows x64 | signed setup executable and app binaries | signed `.exe` |
| Linux x64 / ARM64 | setup tarball, unsigned | unsigned |

JetBrains signs the Windows CLI, the desktop setup executable, and every executable and DLL the desktop app
installs. The macOS CLI is signed but not yet notarized.
Signed and notarized desktop DMGs require the coordinated JetBrains service pipeline; older published DMGs
and locally built packages may still be unsigned and blocked by Gatekeeper. Linux artifacts are unsigned.

## Analytics & privacy

RealThing apps collect basic usage events — launches and workspace creation — tied to
a random installation ID. Usage analytics never include code, files, credentials, or account
identity. Error reports are also always sent, tied to the same installation ID, so we can fix crashes: the
error type and code and where in RealThing's own code it happened. They never include error messages, file
paths, names, URLs, or anything from your projects. Additional product
usage and how you found RealThing are shared only while **Share additional usage
data** is on; the switch lives in **Settings → Privacy**. When launching from
the command line, `realthing --no-analytics` (or `REALTHING_NO_ANALYTICS=1`) turns additional sharing off for
that run. With additional sharing on, a packaged build may open the RealThing blog in your browser once to
link your installation to the website visit that brought you here — only where you accepted marketing cookies on the
website or no consent is required — and that link expires after 30 days.

The RealThing apps and the RealThing website ([realthing.ai](https://realthing.ai)) use PostHog Inc. services for
analytics. The website also uses PostHog Surveys to collect feedback after a desktop download and, only if you
choose to enter one, your email address, which is used to ask for further feedback and to send product updates.
PostHog's privacy policy is at [posthog.com/privacy](https://posthog.com/privacy).

## Under the hood

RealThing is a thin host that manages projects, Git worktrees, files, diffs, terminals, and workspace plans,
and bridges them to a rich web UI. Three rings:

- **Host** — `packages/server` (+ `packages/shared`): a `Bun.serve` HTTP+WS host managing projects,
  worktrees, files, diffs, PTY terminals, and workspace plans, launched by `apps/cli` or `apps/desktop`.
- **The wire** — `packages/contracts`: the typed, versioned protocol between host and UI.
- **UI client** — `apps/web`: React 19 + Zustand + Tailwind v4, shipped independently; it dials a host over
  the wire and depends on the browser-safe presentation packages and contracts only.

[`goal-and-requirements.md`](goal-and-requirements.md) and [`architecture.md`](architecture.md) are the
canonical product and design specs. RealThing is developed spec-first: a `SPEC.md` sits beside every
module, and a change that moves a boundary, contract, or decision updates the spec in the same change.

## Developing RealThing

You need **Bun** 1.4.4 (the pinned package manager and runtime).

```bash
git clone https://github.com/JetBrains/realthing.git
cd realthing
bun install
bun run dev                          # host + web client together; Ctrl+C stops both
```

```bash
bun run --filter @realthing/cli dev  # browser launcher
bun run build:binary                 # standalone CLI artifact
bun run desktop:dev                  # package and open the Electrobun app
bun run desktop:build                # package without opening it
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the checks, the end-to-end suites, desktop packaging, and the
repository layout.

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). This project and community are
governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Community

Join us on [Discord](https://realthing.ai/discord) to ask questions, share what you're building, and
talk to the team. Bugs and feature requests go to [GitHub issues](https://github.com/JetBrains/realthing/issues).

## License

Licensed under the [Apache License 2.0](LICENSE).
