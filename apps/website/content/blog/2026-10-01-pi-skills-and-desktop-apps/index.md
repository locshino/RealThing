---
title: Desktop and CLI workflows in RealThing
slug: realthing-desktop-and-cli-workflows
date: 2026-10-01
author: maciej-gorywoda
excerpt: RealThing ships both as a native desktop app and as a lightweight CLI launcher backed by the same local server.
tags:
  - realthing
  - desktop
---

## Native Desktop and CLI Workflows

RealThing is built around a clean separation between its local server (`@realthing/server`) and its web workbench (`@realthing/web`). Because both launchers share the same core runtime and `~/.realthing` state directory, you can switch seamlessly between the native desktop app and the `realthing` CLI without losing workspaces, plans, or layout preferences.

## Desktop apps

The desktop application runs identically to the CLI `realthing` launcher that opens in your browser. Whether you prefer a dedicated desktop window or launching from your terminal, you can grab the installation package for macOS, Windows, or Linux (Ubuntu) from [**our main webpage**](https://jb.gg/osk2n7).

Happy developing!
