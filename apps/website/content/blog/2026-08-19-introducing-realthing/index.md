---
title: Introducing RealThing
slug: introducing-realthing
date: 2026-08-19
author: maciej-gorywoda
excerpt: RealThing is a workspace-first developer IDE built around Git worktrees, rich file editing, multi-scope diff review, and integrated terminals.
tags:
  - announcement
  - realthing
---

#### A Workspace-First Developer IDE

RealThing is a modern, workspace-first developer IDE built around Git worktrees, designed to complement your command-line and multi-branch workflow. It gives every task an isolated Git worktree alongside rich file editing, multi-scope diff review, integrated terminals, and workspace plans.

## Great, how can I get it?

Download the stable desktop application for your platform:

- [macOS — Apple Silicon (.dmg)](https://github.com/JetBrains/realthing/releases/latest/download/realthing-desktop-darwin-arm64.dmg)
- [Windows — x64 (.zip)](https://github.com/JetBrains/realthing/releases/latest/download/realthing-desktop-windows-x64.zip) — unzip it, then run Setup with its adjacent payload
- [Linux — x64 (.tar.gz)](https://github.com/JetBrains/realthing/releases/latest/download/realthing-desktop-linux-x64.tar.gz)
- [Linux — ARM64 (.tar.gz)](https://github.com/JetBrains/realthing/releases/latest/download/realthing-desktop-linux-arm64.tar.gz)

For either Linux archive, extract it and run `./installer`. Linux desktop builds require Ubuntu 24.04+ or another distribution with glibc 2.38 and the required GTK/WebKitGTK libraries.

Prefer the command line? The CLI/browser host remains available for terminal and remote workflows. Its install,
channel, and update options are documented in the [project install guide](https://github.com/JetBrains/realthing#install).

**macOS/Linux/WSL:**

```bash
curl -fsSL https://raw.githubusercontent.com/JetBrains/realthing/main/install.sh | bash
```

**Windows — PowerShell:**

```powershell
irm https://raw.githubusercontent.com/JetBrains/realthing/main/install.ps1 | iex
```

Launch the desktop app and choose a Git repository. If you installed the CLI, run `realthing`; your browser will open a new tab prompting you to open your first local project. Every working session operates on a separate Git branch that merges with the original repository only after the work is finished and reviewed.

## Key Features

* **Worktrees**: Every workspace in RealThing is a real Git worktree: its own branch, its own working directory. Parallel tasks stay on their own branches while the main branch stays clean.
* **Specification-driven development**: Maintain `SPEC.md` documents alongside your code as a navigable specification graph.
* **Rich Editor & Diff Review**: Inspect and edit files in Monaco and Shiki tabs, review multi-scope diffs hunk by hunk, and run shell commands in integrated terminals.

Happy developing!
