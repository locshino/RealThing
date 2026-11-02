---
title: "RealThing 0.2.0: streamlined diff review and workspace plans"
slug: realthing-0-2-0-review-the-turn
date: 2026-10-18
author: rinat-s
excerpt: "Stacked and single-file diff review, hunk triage, workspace plans in the side rail, and a settled shelf for completed workspaces."
draft: false
tags:
  - release
  - code-review
---

[RealThing](https://realthing.ai/?utm_source=blog&utm_medium=organic-social&utm_campaign=release-0-2-0) 0.2.0 is out, introducing streamlined multi-scope diff review, a dedicated workspace plan rail, automatic workspace settling, and two new minimal themes.

## Streamlined diff review

![Keeping hunks one by one in the Changes tab](./images/01-review-hunks.png)

On the branch diff (**All changes**), each hunk gets **Keep** and **Revert** actions. Keeping the last hunk of a file marks it viewed, the progress bar fills up, and **Next unreviewed** (`J`) takes you to the next file you haven't read. If you prefer going file by file, **One file** is a view mode of the same tab, so switching keeps your progress.

## The plan moved to a rail

The workspace TODO plan now lives in a **Plan** side rail next to Files and Changes, with a full center-tab Plan view one click away.

![The TODO List rail with a finished plan](./images/04-todo-rail.png)

## Finished workspaces park themselves

Each project now has a **Settled** shelf. A workspace moves there after 7 idle days (configurable under Settings › Workspaces: 1, 3, 7, 14, or never), and **Settle** / **Keep active** let you control placement manually.

![A workspace parked on the Settled shelf](./images/05-settled-shelf.png)

## New look

Projects, Files, Changes, and Plan live in edge tool rails with a denser layout, redesigned Settings, and two new themes: **Minimal Light** and **Minimal Dark**.

![Minimal Light](./images/06-minimal-light.png)

Happy developing!
