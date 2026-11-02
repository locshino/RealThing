# RealThing

A high-performance, workspace-first developer workbench. Built around Git worktrees, fluid Monaco code editing, and multi-scope diff review — with zero AI overhead.

> [!NOTE]
> RealThing is a streamlined fork of [ThinkRail](https://github.com/JetBrains/thinkrail) with all AI agents, background LLM loops, and external model integrations removed. It is designed purely for developers who want a fast, focused workbench with native Git worktree isolation.

[![Latest Release](https://img.shields.io/github/v/release/locshino/RealThing?color=success&label=release)](https://github.com/locshino/RealThing/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/workbench-dark.png">
  <img src=".github/readme-assets/workbench-light.png" alt="RealThing workbench: isolated worktree workspace with Monaco editor and multi-scope diffs" width="900">
</picture>

*An isolated git-worktree workspace with its files, diffs, changes, and integrated terminal.*

---

## ⚡ Highlights

- **Zero AI Overhead**: No background agent loops, no token billing, and no remote API latency. Starts up instantly with minimal memory footprint.
- **Git Worktree Isolation**: Work across multiple branches in parallel using native `git worktree`s. Each task gets its own branch, directory, and terminal without touching your main checkout.
- **Monaco Editor + Shiki**: Fast, full-featured code editing with syntax highlighting across dozens of languages, plus renderers for Markdown, CSV, JSON, Notebooks, PDFs, and media.
- **Multi-Scope Diff Review**: Inspect and selectively revert changes across your entire branch, uncommitted working tree, or individual commits.
- **Integrated PTY Terminals**: Live shell sessions (`bun-pty` + `@xterm/xterm`) keyed to each workspace, surviving reloads.
- **100% Local**: No telemetry accounts required. Configuration and state live entirely on your machine under `~/.realthing`.

---

## 📥 Download & Installation

### Option 1: Download Pre-built Binaries (Recommended)

Single-file standalone executables are compiled and attached to every release. No Node.js or Bun installation required:

👉 **[Download the Latest Release (v0.1.0)](https://github.com/locshino/RealThing/releases/latest)**

| Platform | Download Asset | Description |
| :--- | :--- | :--- |
| **Windows (x64)** | `realthing-windows-x64.exe` | Standalone executable for Windows 10/11 |
| **macOS (Apple Silicon)** | `realthing-darwin-arm64` | Native binary for M1 / M2 / M3 / M4 |
| **macOS (Intel)** | `realthing-darwin-x64` | Native binary for Intel Macs |
| **Linux (x64)** | `realthing-linux-x64` | For Ubuntu, Debian, Fedora, Arch, etc. |
| **Linux (ARM64)** | `realthing-linux-arm64` | For Raspberry Pi, AWS Graviton, etc. |

Run the binary directly from your terminal:
```bash
# Example on Linux / macOS
chmod +x realthing-linux-x64
./realthing-linux-x64 ~/path/to/your/project

# Example on Windows
.\realthing-windows-x64.exe C:\path\to\your\project
```

---

### Option 2: Run from Source (via Bun)

Requirements: [**Bun**](https://bun.sh/) (`>= 1.4.0`) and `git`.

```bash
git clone https://github.com/locshino/realthing.git
cd realthing
bun install

# 1. Build the web UI bundle
bun run build:web

# 2. Launch the CLI workbench in your browser
bun apps/cli/src/index.ts

# 3. (Optional) Compile your own standalone binary
bun run build:binary
./apps/cli/dist/realthing ~/path/to/project
```

---

## 🏛️ Architecture

RealThing follows a strict three-ring boundary:

* **Host (`packages/server` + `packages/shared`)**: Runs on Bun/Node.js to handle OS processes, Git worktree orchestration, file system monitoring, and PTY terminals.
* **The Wire (`packages/contracts`)**: Strictly-typed, schema-validated protocol definitions.
* **UI Client (`apps/web`)**: Fast React 19 + Tailwind v4 + Monaco Editor workbench communicating over local WebSocket.

---

## 📄 License

Distributed under the [**Apache License 2.0**](LICENSE).
Originates from the [ThinkRail](https://github.com/JetBrains/thinkrail) codebase.
