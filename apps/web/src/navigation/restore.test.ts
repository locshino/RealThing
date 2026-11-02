import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Project, Workspace } from "@realthing/contracts";
import { useAppStore } from "../store";
import type { NavigationDriver } from "./driver";
import { startNavigation } from "./restore";

function project(id: string): Project {
	return { id, name: id, path: `/tmp/${id}`, slug: id, lastOpened: 1 };
}

function workspace(id: string, projectId = "p1"): Workspace {
	return {
		id,
		projectId,
		name: id,
		branch: id,
		worktreePath: `/tmp/${projectId}/${id}`,
		baseBranch: "main",
	};
}

function fakeDriver(initial = "") {
	let fragment = initial;
	const handlers = new Set<(fragment: string) => void>();
	const writes: { kind: "replace" | "push"; fragment: string }[] = [];
	const driver: NavigationDriver = {
		read: () => fragment,
		replace: (next) => {
			fragment = next;
			writes.push({ kind: "replace", fragment: next });
		},
		push: (next) => {
			fragment = next;
			writes.push({ kind: "push", fragment: next });
		},
		onIncoming: (handler) => {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
	};
	return {
		driver,
		writes,
		get replaces() {
			return writes.filter((w) => w.kind === "replace").map((w) => w.fragment);
		},
		get pushes() {
			return writes.filter((w) => w.kind === "push").map((w) => w.fragment);
		},
		get fragment() {
			return fragment;
		},
		incoming(next: string) {
			fragment = next;
			for (const handler of handlers) handler(next);
		},
	};
}

function fakeLists() {
	const calls: {
		projectId: string;
		resolve: (rows: Workspace[]) => void;
		reject: (err: Error) => void;
	}[] = [];
	const listWorkspaces = (projectId: string) =>
		new Promise<Workspace[]>((resolve, reject) => {
			calls.push({ projectId, resolve, reject });
		});
	return { calls, listWorkspaces };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function installWelcome(projects: Project[]): void {
	useAppStore.getState().installWelcomeSnapshot(1, projects, projects);
}

let stop: (() => void) | null = null;

beforeEach(() => {
	useAppStore.setState({
		status: "connecting",
		connectionGeneration: 0,
		welcomeGeneration: 0,
		protocolVersion: null,
		projects: [],
		recentProjects: [],
		workspaces: {},
		selectedProjectId: null,
		activeWorkspaceId: null,
		workbenchFrame: null,
		workspaceViewsByWorkspace: {},
		layoutStateReady: false,
		layoutDocumentsByWorkspace: {},
		layoutAttentionByWorkspace: {},
		layoutProjectionEpoch: 0,
		tabsByWorkspace: {},
		activeTabByWorkspace: {},
		previewTabByWorkspace: {},
		navTickByWorkspace: {},
		fsChangesByWorkspace: {},
		toasts: [],
	});
});

afterEach(() => {
	stop?.();
	stop = null;
});

test("no restore runs before the atomic welcome generation", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	await settle();
	useAppStore.getState().setStatus("connected");
	await settle();
	expect(calls).toHaveLength(0);
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");

	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(1);
	expect(calls[0]?.projectId).toBe("p1");
	calls[0]?.resolve([workspace("w1")]);
	await settle();
	const state = useAppStore.getState();
	expect(state.activeWorkspaceId).toBe("w1");
	expect(state.selectedProjectId).toBe("p1");
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");
});

test("duplicate welcome delivery starts at most one active restore read", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(1);
	calls[0]?.resolve([workspace("w1")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w1");
	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(1);
});

test("a malformed initial fragment canonicalizes to #/v1 and restores nothing", async () => {
	const d = fakeDriver("#/v2/projects/p1/bogus");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	expect(d.fragment).toBe("#/v1");
	expect(calls).toHaveLength(0);
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
});

test("a newer incoming fragment cancels the older restore's landing", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	d.incoming("#/v1/projects/p1/workspaces/w2");
	await settle();
	expect(calls).toHaveLength(2);
	calls[0]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	calls[1]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w2");
});

test("fresh user navigation wins over a delayed workspace response", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	useAppStore.getState().setWorkspaces("p1", [workspace("w1"), workspace("w2")]);
	useAppStore.getState().activateWorkspace(workspace("w2"));
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w2");
	await settle();
	calls[0]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	const state = useAppStore.getState();
	expect(state.activeWorkspaceId).toBe("w2");
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w2");
});

test("same-workspace center navigation wins over a delayed route response", async () => {
	const d = fakeDriver("");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	const store = useAppStore.getState();
	store.setWorkspaces("p1", [workspace("w1"), workspace("w2")]);
	store.activateWorkspace(workspace("w1"));

	d.incoming("#/v1/projects/p1/workspaces/w2");
	await settle();
	expect(calls).toHaveLength(1);
	store.noteNavigation("w1");
	store.openTab(
		{
			kind: "file",
			id: "w1:README.md",
			workspaceId: "w1",
			name: "README.md",
			path: "README.md",
			content: "",
		},
		"keep",
	);
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");

	calls[0]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w1");
	expect(useAppStore.getState().activeTabByWorkspace.w1).toBe("w1:README.md");
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");
});

test("a completed welcome lacking the project canonicalizes to Welcome", async () => {
	const d = fakeDriver("#/v1/projects/p-gone/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(0);
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1");
});

test("a successful list lacking the workspace falls back to its Project Home", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w-gone");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	calls[0]?.resolve([workspace("w1")]);
	await settle();
	const state = useAppStore.getState();
	expect(state.selectedProjectId).toBe("p1");
	expect(state.activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1/projects/p1");
});

test("a failed workspace read is not deletion: URL and intent survive, the next welcome retries", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	calls[0]?.reject(new Error("socket died"));
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");
	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(2);
	calls[1]?.resolve([workspace("w1")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w1");
});

test("user navigation pushes one history entry per location; unchanged locations write nothing", async () => {
	const d = fakeDriver("");
	const { listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	expect(d.fragment).toBe("#/v1");
	installWelcome([project("p1")]);
	await settle();

	const store = useAppStore.getState();
	store.selectProject("p1");
	expect(d.pushes).toEqual(["#/v1/projects/p1"]);
	store.setWorkspaces("p1", [workspace("w1")]);
	store.activateWorkspace(workspace("w1"));
	expect(d.pushes).toEqual(["#/v1/projects/p1", "#/v1/projects/p1/workspaces/w1"]);

	const writes = d.writes.length;
	useAppStore.getState().setStatus("connected");
	expect(d.writes.length).toBe(writes);
});

test("an incoming main fragment is applied even when the client is already inside a workspace", async () => {
	const d = fakeDriver("");
	const { listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	const store = useAppStore.getState();
	store.setWorkspaces("p1", [workspace("w1")]);
	store.activateWorkspace(workspace("w1"));
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");

	d.incoming("#/v1");
	await settle();
	expect(useAppStore.getState().selectedProjectId).toBeNull();
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1");
});

test("a missing incoming project falls back to main instead of the previous live location", async () => {
	const d = fakeDriver("");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	const store = useAppStore.getState();
	store.setWorkspaces("p1", [workspace("w1")]);
	store.activateWorkspace(workspace("w1"));

	d.incoming("#/v1/projects/gone/workspaces/w");
	await settle();
	expect(calls).toHaveLength(0);
	expect(useAppStore.getState().selectedProjectId).toBeNull();
	expect(useAppStore.getState().activeWorkspaceId).toBeNull();
	expect(d.fragment).toBe("#/v1");
});

test("an older response cannot unmark a newer generation's in-flight read", async () => {
	const d = fakeDriver("#/v1/projects/p1/workspaces/w1");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	d.incoming("#/v1/projects/p1/workspaces/w2");
	await settle();
	expect(calls).toHaveLength(2);

	calls[0]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	installWelcome([project("p1")]);
	await settle();
	expect(calls).toHaveLength(2);
	calls[1]?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w2");
});

test("teardown detaches the coordinator from driver and store", async () => {
	const d = fakeDriver("");
	const { listWorkspaces } = fakeLists();
	const dispose = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	await settle();
	dispose();
	const writes = d.writes.length;
	useAppStore.getState().selectProject("p1");
	expect(d.writes.length).toBe(writes);
});

test("Back/Forward arrives as an incoming fragment: adopted and applied, never re-pushed", async () => {
	const d = fakeDriver("");
	const { calls, listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	const store = useAppStore.getState();
	store.setWorkspaces("p1", [workspace("w1"), workspace("w2")]);
	store.activateWorkspace(workspace("w1"));
	store.activateWorkspace(workspace("w2"));
	expect(d.pushes).toEqual(["#/v1/projects/p1/workspaces/w1", "#/v1/projects/p1/workspaces/w2"]);

	const pushesBefore = d.pushes.length;
	d.incoming("#/v1/projects/p1/workspaces/w1");
	await settle();
	calls.at(-1)?.resolve([workspace("w1"), workspace("w2")]);
	await settle();
	expect(useAppStore.getState().activeWorkspaceId).toBe("w1");
	expect(d.pushes.length).toBe(pushesBefore);
	expect(d.fragment).toBe("#/v1/projects/p1/workspaces/w1");
});

test("an armed push survives a momentarily underivable location and lands on its write", async () => {
	const d = fakeDriver("");
	const { listWorkspaces } = fakeLists();
	stop = startNavigation({ driver: d.driver, listWorkspaces });
	installWelcome([project("p1")]);
	const store = useAppStore.getState();
	store.activateWorkspace(workspace("w1"));
	expect(d.pushes).toEqual([]);
	store.setWorkspaces("p1", [workspace("w1")]);
	expect(d.pushes).toEqual(["#/v1/projects/p1/workspaces/w1"]);
});
