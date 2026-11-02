# RealThing

> **ThinkRail with no AI** — A lightweight, high-performance developer workbench built for Git worktrees, fast code editing, and multi-scope diff review.

> [!NOTE]
> **RealThing** is a streamlined, AI-free fork of [ThinkRail](https://github.com/JetBrains/thinkrail). It removes all autonomous AI agents, background LLM loops, and external model integrations to focus purely on **maximum performance**, **native Git worktree isolation**, fluid code editing powered by **Monaco Editor + Shiki**, multi-scope diff inspection, and integrated PTY terminals.

RealThing is a modern, workspace-first developer IDE and workbench built around Git worktrees, high-performance file editing and inspection, multi-scope diff and change review, integrated PTY terminals, and lightweight manual checklists.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/workbench-dark.png">
  <img src=".github/readme-assets/workbench-light.png" alt="RealThing workbench: the Projects pane beside the left tool rail listing worktree workspaces, the editor and diff views in the center, and the Changes list on the right with their tools on the edge rail" width="900">
</picture>

*An isolated git-worktree workspace with its files, diffs, changes, and integrated terminal.*

---

## Why RealThing? (ThinkRail with No AI)

- **Zero AI Overhead**: Completely stripped of autonomous AI agents, LLM token billing, background agent loops, and external network latency. RealThing boots instantly, uses minimal memory, and delivers a distraction-free editing experience.
- **Git Worktree Isolation**: Run parallel tasks across separate branches without colliding checkouts or `git stash` hassles. Every task gets its own clean directory, branch, and PTY terminal.
- **High-Performance Editor & Review**: Rich editing powered by Monaco Editor and Shiki syntax highlighting, alongside comprehensive diff views across branch, uncommitted, and commit-by-commit scopes with safe hunk revert.
- **True PTY Terminals**: Real PTY terminals (`bun-pty` + `@xterm/xterm`) scoped to each worktree workspace, surviving page reloads and reconnections.
- **100% Local & Privacy-First**: All settings, project references, and session states are stored entirely locally on your machine at `~/.realthing`.

---

## Features

- **Isolated Workspaces**: Open any Git repository as a project and cut workspaces as native `git worktree`s. Track branch ahead/behind status relative to `origin` and easily jump to an external IDE or file manager.
- **Splittable Workbench**: A flexible layout containing Monaco Editor tabs, rich resource renderers (Markdown, JSON, CSV, Jupyter Notebooks, SVGs, PDFs, and images), and a live file tree with status indicators.
- **Multi-Scope Changes**: Inspect and compare diffs across your entire branch, uncommitted changes, or specific commits. Revert files or individual hunks with compare-and-swap safety.
- **Workspace Plans**: Keep organized with workspace-scoped task checklists, tracked directly inside your project workbench without relying on external issue trackers.
- **Two Launchers (Desktop & CLI)**: Use the native desktop app or launch the lightweight `realthing` CLI to run the workbench locally in your web browser.
- **Customizable Themes & Locales**: Ships with Dark, Light, Minimal, and High Contrast themes (customizable via `~/.realthing/themes`). Built-in multi-language support (English, Japanese, Simplified Chinese, Spanish, etc. via `~/.realthing/locales`).

---

## Quick Start & Development

RealThing requires the [**Bun**](https://bun.sh/) runtime (`>= 1.4.0`).

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/locshino/realthing.git
cd realthing
bun install
```

### 2. Development Mode

Run the backend host and web client simultaneously:

```bash
bun run dev
```

Or run individual packages:

```bash
bun run dev:server    # Run host server (@realthing/server)
bun run dev:web       # Run Vite dev server for web UI (@realthing/web)
```

### 3. Build & Run Standalone CLI

Build the web frontend bundle and compile the standalone CLI:

```bash
# 1. Build web UI bundle
bun run build:web

# 2. Test run CLI host directly
bun apps/cli/src/index.ts

# 3. Or compile into a single-file executable binary
bun run build:binary
./apps/cli/dist/realthing ~/path/to/your/project
```

### 4. Build Desktop App (Electrobun)

```bash
bun run desktop:dev      # Package and open the desktop application
bun run desktop:build    # Build native desktop package
```

---

## Architecture

RealThing is structured into three clear boundaries (The Three Rings Architecture):

* **Host (`packages/server` + `packages/shared`)**: Runs on Bun/Node.js to handle OS processes, Git worktree orchestration, file system monitoring, PTY terminals, and persistence under `~/.realthing`.
* **The Wire (`packages/contracts`)**: Strictly-typed, schema-validated RPC and bidirectional WebSocket protocol between host and UI.
* **UI Client (`apps/web`)**: Modern React 19 + Tailwind CSS v4 + Monaco Editor web application communicating exclusively over the wire protocol.

---

## License

Distributed under the [**Apache License 2.0**](LICENSE).
Inherited with gratitude from the original [ThinkRail](https://github.com/JetBrains/thinkrail) project.
