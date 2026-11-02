# RealThing UI Terminology Reference

A canonical vocabulary for the RealThing web UI (`apps/web`), for use in design and engineering discussions.

**Scope & rules for this document:**

- **Frontend only.** Documents `apps/web` as it is implemented today — the single source of truth.
- **Descriptive, not prescriptive.** Every region lists, where applicable: **canonical name** (the heading), **implementation name** (the React component / file), **`data-testid`** hook (the app's stable identity anchors), **parent**, **children**, **position**, and **responsibility**.

---

# Application Layout

- **App Shell** (`shell/Shell.tsx` → `Shell`, `data-testid="shell"`) — the root frame.
  - **Top Bar** (`shell/locationBar/LocationBar.tsx` → `LocationBar`) — always present.
  - **Body** — one of two states:
    - **Workspace Workbench** (`shell/WorkspaceWorkbench.tsx` + `shell/layout/Workbench.tsx`, `data-testid="workbench"`) — the projection of this window's local frame and active workspace view.
    - **Welcome Layout** — the projects rail beside the Welcome screen when no workspace is active.
  - **Toaster** (`panels/Toaster.tsx` → `Toaster`) — app-wide notification host, mounted once over either state.

---

# Top Bar (`LocationBar`)

The application-wide bar across the very top.

| Canonical name | Implementation | `data-testid` | Responsibility |
|---|---|---|---|
| Logo | `<BrandLogo />` | `brand-logo` | The theme-aware RealThing brand mark |
| Scope Context | `LocationBar` | `scope-context` | Persistent location breadcrumb (`scope-project`, `scope-name`, `scope-branch`, `scope-base`) |
| Connection Status | inline `<span>` | `connection-status` | Connected / Connecting… / Disconnected pill |
| Settings Button | inline `<button>` | `open-settings` | Opens the Settings Dialog via `store.openSettings()` |

---

# Projects Tool (`ProjectTree`)

The singleton Projects tool, initially in the left side. Its Projects Rail view lists projects and, expanded beneath each, their workspaces.

| Canonical name | Implementation | `data-testid` | Responsibility |
|---|---|---|---|
| Add-Project Button / Menu | `panels/AddProjectMenu.tsx` → `AddProjectMenu` | `add-project-menu` | Open project / Recents dropdown |
| Project Row | inline row in `ProjectTree` | `project-item` | A project (git repo); clicking selects it |
| Workspace Row | inline row in `ProjectTree` | `workspace-item` | A workspace (git worktree); two-line: name + branch |
| Workspace Actions Menu | `MoreVertical` Dropdown Menu | `workspace-menu` / `workspace-actions` | Open in (`workspace-open-in`) / Copy path / Reveal / Settle / Remove workspace |

---

# Welcome Screen (`WelcomePanel`)

Shown in the Welcome Layout's right column when no workspace is active. Pairs "Start building" (isolated worktree) with "Work in project folder" (Default workspace).

---

# Center Workbench

The central work area is a recursive tree of one to four tab groups (`CenterGroupView`, `TabStrip`, `WorkbenchTab`). Hosts **File** (`FilePane`), **Diff** (`DiffPane`), **Changes review** (`ChangesReviewPane`), **Plan** (`PlanPane`), and **Terminal** (`TerminalWorkbenchBody`) tabs.

---

# Side Workbench

The left and right sides are independently resizable regions (`SideStack`, `SideGroupView`). Side tools include:
- **Projects** (`tab-projects`, `panels/ProjectTree.tsx`)
- **Files** (`tab-files`, `panels/FilesPanel.tsx` switching between `FileTree.tsx` and `ChangesPanel.tsx`)
- **Plan** (`panels/PlanRailPane.tsx`)

---

# Terminal Placement

A terminal (`panels/TerminalWorkbench.tsx`, `panels/TerminalInstance.tsx`) is a movable resource tab that may occupy a center group or any side group.

---

# Settings Dialog (`SettingsDialog`)

Modal two-pane dialog hosting **Appearance** (`AppearanceSettings`), **Language** (`LanguageSettings`), **Layout** (`LayoutSettings`), and **Terminal** (`TerminalSettings`).
