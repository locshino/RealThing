import { beforeEach, expect, test } from "bun:test";
import { type AppConfig, DEFAULT_CONFIG, type Project, type Workspace } from "@realthing/contracts";
import type { WorkspaceLayoutDocument } from "../shell/layout/index.js";

const emptyBottomRegion = () => ({ visible: false, height: 0.25, groups: [] });

import {
	captureCenterNavigation,
	type FileTab,
	isCenterNavigationCurrent,
	layoutOpenOptionsForNavigation,
	selectActiveFilePath,
	selectDiffScope,
	selectFilesTreeView,
	selectWorkspaceNavTick,
	shouldAdvanceAcceptedNavigation,
	toast,
	useAppStore,
} from "./index.js";

const initialState = useAppStore.getState();
beforeEach(() => {
	useAppStore.setState(
		{
			...initialState,
			removedWorkspaceIds: Object.create(null),
			layoutIntents: [],
		},
		true,
	);
});

function project(over: Partial<Project> = {}): Project {
	return {
		id: "p1",
		name: "Project one",
		path: "/projects/one",
		slug: "project-one",
		lastOpened: 100,
		...over,
	};
}

function pushedWorkspace(over: Partial<Workspace> = {}): Workspace {
	return {
		id: "w1",
		projectId: "p1",
		name: "add-login-flow",
		branch: "add-login-flow",
		worktreePath: "/tmp/worktrees/p/workspace-1",
		baseBranch: "main",
		renamed: true,
		...over,
	};
}

function fileTab(workspaceId: string, name: string): FileTab {
	return { kind: "file", id: `${workspaceId}:${name}`, workspaceId, name, path: name, content: "" };
}

test("installProjectSnapshot sorts both projections and repairs navigation after an off-screen close", () => {
	const p1 = project();
	const p2 = project({
		id: "p2",
		name: "Project two",
		path: "/projects/two",
		slug: "project-two",
		lastOpened: 200,
		closed: true,
	});
	const workspace = pushedWorkspace({ id: "w2", projectId: "p2" });
	const tabs = {
		w2: [{ kind: "file", id: "w2:a", workspaceId: "w2", name: "a", path: "a", content: "" }],
	} satisfies Record<string, FileTab[]>;
	useAppStore.setState({
		projects: [p2],
		recentProjects: [p2],
		workspaces: { p2: [workspace] },
		selectedProjectId: "p2",
		activeWorkspaceId: "w2",
		tabsByWorkspace: tabs,
	});

	useAppStore.getState().installProjectSnapshot([p1], [p1, p2]);

	const state = useAppStore.getState();
	expect(state.projects.map((candidate) => candidate.id)).toEqual(["p1"]);
	expect(state.recentProjects.map((candidate) => candidate.id)).toEqual(["p2", "p1"]);
	expect(state.selectedProjectId).toBe("p1");
	expect(state.activeWorkspaceId).toBeNull();
	expect(state.workspaces.p2).toEqual([workspace]);
	expect(state.tabsByWorkspace).toBe(tabs);
});

test("projects-rail expansion: gestures reveal, restore stays neutral, the chevron toggles", () => {
	const p1 = project();
	const p2 = project({ id: "p2", name: "Project two", path: "/projects/two", slug: "project-two" });
	useAppStore.setState({ projects: [p1, p2], recentProjects: [p1, p2] });
	const store = useAppStore.getState();

	store.selectProject("p1");
	expect(useAppStore.getState().expandedProjectIds).toEqual({});
	store.selectProject("p1", { reveal: true });
	expect(useAppStore.getState().expandedProjectIds).toEqual({ p1: true });
	const before = useAppStore.getState().expandedProjectIds;
	store.expandProject("p1");
	expect(useAppStore.getState().expandedProjectIds).toBe(before);
	store.toggleProjectExpanded("p1");
	expect(useAppStore.getState().expandedProjectIds).toEqual({});
	store.toggleProjectExpanded("p2");
	expect(useAppStore.getState().expandedProjectIds).toEqual({ p2: true });
	useAppStore.getState().applyProjectUpdated({ ...p2, closed: true });
	expect(useAppStore.getState().expandedProjectIds).toEqual({});
});

test("hydrateExpandedProjects seeds the persisted mirror; the welcome snapshot prunes to the open rail", () => {
	const p1 = project();
	useAppStore.getState().hydrateExpandedProjects(["p1", "stale-closed-project"]);
	expect(useAppStore.getState().expandedProjectIds).toEqual({
		p1: true,
		"stale-closed-project": true,
	});
	useAppStore.getState().installWelcomeSnapshot(1, [p1], [p1]);
	expect(useAppStore.getState().expandedProjectIds).toEqual({ p1: true });
});

test("applyProjectUpdated closes a background project without moving the current workspace", () => {
	const p1 = project();
	const p2 = project({
		id: "p2",
		name: "Project two",
		path: "/projects/two",
		slug: "project-two",
		lastOpened: 50,
	});
	useAppStore.setState({
		projects: [p1, p2],
		recentProjects: [p1, p2],
		workspaces: { p1: [pushedWorkspace()] },
		selectedProjectId: "p1",
		activeWorkspaceId: "w1",
	});

	useAppStore.getState().applyProjectUpdated({ ...p2, closed: true });

	const state = useAppStore.getState();
	expect(state.projects.map((candidate) => candidate.id)).toEqual(["p1"]);
	expect(state.recentProjects.find((candidate) => candidate.id === "p2")?.closed).toBe(true);
	expect(state.selectedProjectId).toBe("p1");
	expect(state.activeWorkspaceId).toBe("w1");
});

test("project and workspace navigation update both scope ids atomically", () => {
	useAppStore.setState({ selectedProjectId: "p1", activeWorkspaceId: "w1" });
	const transitions: [string | null, string | null][] = [];
	const unsubscribe = useAppStore.subscribe((state) => {
		transitions.push([state.selectedProjectId, state.activeWorkspaceId]);
	});

	useAppStore.getState().selectProject("p2");
	expect(transitions).toEqual([["p2", null]]);

	transitions.length = 0;
	useAppStore.getState().activateWorkspace(pushedWorkspace({ id: "w3", projectId: "p3" }));
	expect(transitions).toEqual([["p3", "w3"]]);
	unsubscribe();
});

test("installWelcomeSnapshot lands one complete snapshot and advances its own generation", () => {
	const p1 = project();
	const closed = project({
		id: "p2",
		path: "/projects/two",
		slug: "two",
		lastOpened: 50,
		closed: true,
	});
	let notifications = 0;
	const unsubscribe = useAppStore.subscribe((state) => {
		notifications += 1;
		expect(state).toMatchObject({
			protocolVersion: 44,
			theme: "test-theme",
			welcomeGeneration: 1,
		});
		expect(state.projects.map((candidate) => candidate.id)).toEqual(["p1"]);
		expect(state.recentProjects.map((candidate) => candidate.id)).toEqual(["p1", "p2"]);
	});

	useAppStore.getState().installWelcomeSnapshot(44, [p1, closed], [p1, closed], {
		theme: "test-theme",
		terminalReplayKb: 256,
	});
	unsubscribe();
	expect(notifications).toBe(1);

	useAppStore.getState().installWelcomeSnapshot(44, [p1], [p1]);
	expect(useAppStore.getState().welcomeGeneration).toBe(2);
});

test("updateWorkspace applies a pushed snapshot authoritatively: dropped fields clear", () => {
	useAppStore.setState({
		workspaces: {
			p1: [
				{
					...pushedWorkspace(),
					diffBase: "release",
					diffStats: { added: 3, removed: 1 },
				},
			],
		},
	});
	useAppStore.getState().updateWorkspace(pushedWorkspace());

	const ws = useAppStore.getState().workspaces.p1?.[0];
	expect(ws?.diffBase).toBeUndefined();
	expect(ws?.diffStats).toEqual({ added: 3, removed: 1 });
});

test("applyWorkspaceRemoved restores the most-recent workspace across projects", () => {
	const removed = pushedWorkspace();
	const previous = pushedWorkspace({ id: "w2", projectId: "p2", name: "previous" });
	useAppStore.setState({
		projects: [project(), project({ id: "p2" })],
		workspaces: { p1: [removed], p2: [previous] },
		selectedProjectId: "p1",
		activeWorkspaceId: "w1",
		workspaceSelectionHistory: ["w1", "w2"],
		toasts: [],
	});

	useAppStore.getState().applyWorkspaceRemoved("p1", "w1");

	const state = useAppStore.getState();
	expect(state.activeWorkspaceId).toBe("w2");
	expect(state.selectedProjectId).toBe("p2");
	expect(state.workspaceSelectionHistory).toEqual(["w2"]);
	expect(state.toasts).toHaveLength(1);
});

test("files tree state keeps per-workspace folders and scroll, and drops a removed workspace", () => {
	useAppStore.setState({
		filesTreeByWorkspace: {},
		removedWorkspaceIds: Object.create(null),
		workspaces: { p1: [pushedWorkspace()] },
	});
	const view = () => selectFilesTreeView(useAppStore.getState(), "w1");
	const store = useAppStore.getState();

	store.setFilesTreeExpanded("w1", ["src", "src/auth"], true);
	const expanded = view().expanded;
	store.setFilesTreeExpanded("w1", ["src"], true);
	expect(view().expanded).toBe(expanded);
	store.setFilesTreeExpanded("w1", ["src/auth"], false);
	expect(view().expanded).toEqual(["src"]);
	store.collapseAllFiles("w1");
	expect(view().expanded).toEqual([]);

	store.setChangedTreeCollapsed("w1", ["apps/web"], true);
	store.setFilesTreeScroll("w1", "changedTree", 120, "branch");
	expect(view()).toMatchObject({
		changedCollapsed: ["apps/web"],
		scroll: { changedTree: { top: 120, scope: "branch" } },
	});
	expect(selectFilesTreeView(useAppStore.getState(), "w2").expanded).toEqual([]);

	useAppStore.getState().applyWorkspaceRemoved("p1", "w1");
	expect(useAppStore.getState().filesTreeByWorkspace.w1).toBeUndefined();
	useAppStore.getState().setFilesTreeExpanded("w1", ["src"], true);
	expect(useAppStore.getState().filesTreeByWorkspace.w1).toBeUndefined();
});

test("revealInFiles expands every ancestor folder and records the revealed file", () => {
	useAppStore.setState({ filesTreeByWorkspace: {}, removedWorkspaceIds: Object.create(null) });
	useAppStore.getState().setFilesTreeExpanded("w1", ["docs"], true);
	useAppStore.getState().revealInFiles("w1", "src/auth/login.ts");
	const view = selectFilesTreeView(useAppStore.getState(), "w1");
	expect(view.expanded).toEqual(["docs", "src", "src/auth"]);
	expect(view.seenActivePath).toBe("src/auth/login.ts");
	useAppStore.getState().revealInFiles("w1", "src/auth/login.ts");
	expect(selectFilesTreeView(useAppStore.getState(), "w1")).toBe(view);
});

test("selectActiveFilePath follows the active file tab and ignores other tabs", () => {
	const file: FileTab = {
		kind: "file",
		id: "f",
		workspaceId: "w1",
		name: "a",
		path: "./src/a.ts",
		content: "",
	};
	const tabsByWorkspace = { w1: [file] };
	expect(selectActiveFilePath({ tabsByWorkspace, activeTabByWorkspace: { w1: "f" } }, "w1")).toBe(
		"src/a.ts",
	);
	expect(
		selectActiveFilePath({ tabsByWorkspace, activeTabByWorkspace: { w1: "other" } }, "w1"),
	).toBeNull();
});

test("revealChanges and requestChangesView reveal Files in Changed mode", () => {
	useAppStore.setState({ filesMode: "all", layoutIntents: [] });
	useAppStore.getState().revealChanges("w1");
	expect(useAppStore.getState().filesMode).toBe("changed");
	expect(useAppStore.getState().layoutIntents).toMatchObject([
		{ kind: "reveal-tool", workspaceId: "w1", tool: "files" },
	]);

	useAppStore.setState({ filesMode: "all", layoutIntents: [] });
	useAppStore.getState().requestChangesView("w1", null);
	expect(useAppStore.getState().filesMode).toBe("changed");
});

test("the Changes deep link stamps the nav count at the click, so a later navigation still wins", () => {
	useAppStore.setState({ activeWorkspaceId: "ws1", changesRequest: null, layoutIntents: [] });
	const s = () => useAppStore.getState();

	s().openTab(fileTab("ws1", "a.ts"), "keep");
	s().setActiveTab("ws1:a.ts");
	const beforeClick = selectWorkspaceNavTick(s(), "ws1");

	s().requestChangesView("ws1", "src/b.ts");
	expect(s().changesRequest?.navTick).toBe(beforeClick + 1);

	expect(selectWorkspaceNavTick(s(), "ws1")).toBe(s().changesRequest?.navTick);

	s().setActiveTab("ws1:a.ts");
	expect(selectWorkspaceNavTick(s(), "ws1")).not.toBe(s().changesRequest?.navTick);
});

test("deferred center navigation clocks are isolated by destination group", () => {
	useAppStore.setState({
		activeWorkspaceId: "ws1",
		layoutAttentionByWorkspace: {
			ws1: {
				selectedByGroup: { a: "file-a", b: "file-b" },
				lastFocusedCenterGroupId: "a",
				lastFocusedSideGroupId: {},
				navigationClockByGroup: { a: 4, b: 9 },
			},
		},
	});

	const passive = captureCenterNavigation(useAppStore.getState(), "ws1");
	expect(passive).toEqual({ groupId: "a", clock: 4 });
	const fromA = useAppStore.getState().beginCenterNavigation("ws1");
	expect(fromA).toEqual({ groupId: "a", clock: 5 });
	expect(isCenterNavigationCurrent(useAppStore.getState(), "ws1", fromA)).toBe(true);
	useAppStore.setState({ activeWorkspaceId: "ws2" });
	expect(layoutOpenOptionsForNavigation(useAppStore.getState(), "ws1", fromA)).toEqual({
		targetGroupId: "a",
		activate: false,
		navigation: fromA,
	});
	useAppStore.setState({ activeWorkspaceId: "ws1" });

	useAppStore.getState().beginCenterNavigation("ws1", "b");
	expect(isCenterNavigationCurrent(useAppStore.getState(), "ws1", fromA)).toBe(true);
	const withOtherGroupFocused = useAppStore.getState().layoutAttentionByWorkspace.ws1;
	if (!withOtherGroupFocused) throw new Error("missing attention fixture");
	expect(shouldAdvanceAcceptedNavigation(withOtherGroupFocused, fromA)).toBe(false);

	useAppStore.getState().beginCenterNavigation("ws1", "a");
	expect(isCenterNavigationCurrent(useAppStore.getState(), "ws1", fromA)).toBe(false);
});

test("openSettings deep-links to a section (default appearance); closeSettings hides it", () => {
	const s = useAppStore.getState();
	s.openSettings();
	expect(useAppStore.getState().settingsOpen).toBe(true);
	expect(useAppStore.getState().settingsSection).toBe("appearance");

	s.openSettings("terminal");
	expect(useAppStore.getState().settingsSection).toBe("terminal");

	s.setSettingsSection("appearance");
	expect(useAppStore.getState().settingsSection).toBe("appearance");

	s.closeSettings();
	expect(useAppStore.getState().settingsOpen).toBe(false);
	expect(useAppStore.getState().settingsSection).toBe("appearance");
});

test("the toast helper enqueues by variant and omits an absent title", () => {
	toast.success("saved");
	toast.error("nope", "Failed");
	expect(useAppStore.getState().toasts).toMatchObject([
		{ variant: "success", message: "saved" },
		{ variant: "error", message: "nope", title: "Failed" },
	]);
	expect(useAppStore.getState().toasts[0]).not.toHaveProperty("title");
});

test("applyConfig folds and normalizes the server-synced theme preference", () => {
	const pair = { light: "acme.light", dark: "acme.dark" };
	useAppStore.getState().applyConfig({
		...DEFAULT_CONFIG,
		theme: "acme.fixed",
		themeMode: "system",
		systemThemePair: pair,
	});
	expect(useAppStore.getState()).toMatchObject({
		theme: "acme.fixed",
		themeMode: "system",
		systemThemePair: pair,
	});

	useAppStore.getState().applyConfig({
		...DEFAULT_CONFIG,
		theme: "legacy.fixed",
		themeMode: "future",
		systemThemePair: { light: "only-light" },
	} as unknown as AppConfig);
	expect(useAppStore.getState()).toMatchObject({
		theme: "legacy.fixed",
		themeMode: "fixed",
		systemThemePair: undefined,
	});
});

test("changes tabs: one per scope, preview-eligible, and review progress survives a re-open", () => {
	const s = () => useAppStore.getState();
	useAppStore.setState({ activeWorkspaceId: "ws1" });
	expect(s().changesView).toBe("tree");
	expect(s().changesLayout).toBe("stacked");
	const tab = {
		kind: "changes" as const,
		id: "ws1:changes:branch",
		workspaceId: "ws1",
		name: "Changes",
		scope: { kind: "branch" } as const,
		viewed: [],
		activePath: null,
		collapsed: {},
		reveal: null,
		sections: {},
		kept: {},
	};
	s().openTab(tab, "preview");
	expect(s().previewTabByWorkspace.ws1).toBe(tab.id);
	expect(s().activeTabByWorkspace.ws1).toBe(tab.id);

	s().setChangesTabViewed("ws1", tab.id, "src/a.ts", true);
	expect(s().previewTabByWorkspace.ws1).toBeUndefined();
	expect(s().layoutIntents.at(-1)).toMatchObject({
		kind: "select",
		tabId: tab.id,
		keep: true,
		focus: false,
	});
});

test("diff tabs: openTab dedupes by id + activates; renderer, view state, and contents update in place", () => {
	const s = () => useAppStore.getState();
	useAppStore.setState({ activeWorkspaceId: "ws1" });
	const tab = {
		kind: "diff" as const,
		id: "ws1:diff:branch:src/a.ts",
		workspaceId: "ws1",
		name: "a.ts",
		path: "src/a.ts",
		scope: { kind: "branch" } as const,
		original: "old",
		modified: "new",
		loadedTick: 1,
		loadedTarget: "main",
	};
	s().openTab(tab);
	s().openTab(tab);
	expect(s().tabsByWorkspace.ws1).toHaveLength(1);
	expect(s().activeTabByWorkspace.ws1).toBe(tab.id);

	s().setDiffTabView(tab.id, "inline");
	s().setTabViewState("ws1", tab.id, { scrollTop: 1 });
	s().setTabRenderer("ws1", tab.id, "realthing/code");
	expect(s().tabsByWorkspace.ws1?.[0]).not.toHaveProperty("viewState");
	s().setTabViewState("ws1", tab.id, { scrollTop: 42 });
	const afterView = s().tabsByWorkspace.ws1?.[0];
	expect(afterView?.kind === "diff" && afterView.view).toBe("inline");
	expect(afterView?.kind === "diff" && afterView.rendererId).toBe("realthing/code");
	expect(afterView?.kind === "diff" && afterView.viewState).toEqual({ scrollTop: 42 });
});

test("the diff scope is per workspace, defaults to the branch, and is dropped with the workspace", () => {
	const s = () => useAppStore.getState();
	useAppStore.setState({
		workspaces: {
			p1: [
				{
					id: "ws1",
					projectId: "p1",
					name: "ws1",
					branch: "b",
					worktreePath: "/wt",
					baseBranch: "main",
				},
			],
		},
		activeWorkspaceId: "ws1",
		selectedProjectId: "p1",
	});
	expect(selectDiffScope(s(), "ws1")).toBe(selectDiffScope(s(), "ws2"));
	expect(selectDiffScope(s(), "ws1")).toEqual({ kind: "branch" });

	s().setDiffScope("ws1", { kind: "commit", sha: "abc123" });
	expect(selectDiffScope(s(), "ws1")).toEqual({ kind: "commit", sha: "abc123" });
	expect(selectDiffScope(s(), "ws2")).toEqual({ kind: "branch" });

	s().applyWorkspaceRemoved("p1", "ws1");
	expect(s().diffScopeByWorkspace.ws1).toBeUndefined();
});

test("a preview open replaces the previous preview tab at its index (the strip never reshuffles)", () => {
	const store = useAppStore.getState();
	store.openTab(fileTab("ws1", "a.ts"), "keep");
	store.openTab(fileTab("ws1", "b.ts"), "preview");
	store.openTab(fileTab("ws1", "c.ts"), "keep");

	store.openTab(fileTab("ws1", "d.ts"), "preview");

	const s = useAppStore.getState();
	expect((s.tabsByWorkspace.ws1 ?? []).map((t) => t.name)).toEqual(["a.ts", "d.ts", "c.ts"]);
	expect(s.previewTabByWorkspace.ws1).toBe("ws1:d.ts");
	expect(s.activeTabByWorkspace.ws1).toBe("ws1:d.ts");
});

test("hydrated per-group previews never evict one another from the render cache", () => {
	const document: WorkspaceLayoutDocument = {
		version: 2,
		center: { kind: "group", id: "center-a", tabs: [] },
		left: { visible: false, width: 0.18, groups: [] },
		right: { visible: false, width: 0.28, groups: [] },
		bottom: emptyBottomRegion(),
		toolRestoreTargets: {},
	};
	useAppStore.setState({ layoutDocumentsByWorkspace: { ws1: document } });
	const store = useAppStore.getState();
	store.openTab(fileTab("ws1", "a.ts"), "preview");
	store.openTab(fileTab("ws1", "b.ts"), "preview");

	expect((useAppStore.getState().tabsByWorkspace.ws1 ?? []).map((tab) => tab.name)).toEqual([
		"a.ts",
		"b.ts",
	]);
});

test("terminal creation can capture a center-group destination without creating a second authority", () => {
	useAppStore.setState({
		layoutAttentionByWorkspace: {
			w1: {
				selectedByGroup: {},
				lastFocusedCenterGroupId: "center-a",
				lastFocusedSideGroupId: {},
				navigationClockByGroup: { "center-a": 1, "center-b": 3 },
			},
		},
	});
	useAppStore.getState().addTerminal("w1", undefined, "center-b");
	const state = useAppStore.getState();
	expect(state.terminalsByWorkspace.w1).toHaveLength(1);
	expect(state.layoutIntents).toHaveLength(1);
	expect(state.layoutIntents[0]).toMatchObject({
		kind: "place-terminal",
		workspaceId: "w1",
		targetGroupId: "center-b",
	});
	expect(state.layoutAttentionByWorkspace.w1).toMatchObject({
		lastFocusedCenterGroupId: "center-b",
		navigationClockByGroup: { "center-a": 1, "center-b": 4 },
	});
	expect(state.navTickByWorkspace.w1).toBe(1);
});
