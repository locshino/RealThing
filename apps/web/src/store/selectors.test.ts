import { describe, expect, test } from "bun:test";
import type { Project, Workspace } from "@realthing/contracts";
import { selectContextProject, selectWorkspaceTerminals } from "./selectors.js";

const project = (id: string): Project => ({
	id,
	name: id,
	path: `/tmp/${id}`,
	slug: id,
	lastOpened: 1,
});

const workspace = (id: string, projectId: string): Workspace => ({
	id,
	projectId,
	name: id,
	branch: id,
	worktreePath: `/tmp/${id}`,
	baseBranch: "main",
});

describe("selectContextProject", () => {
	test("prefers the active workspace's owning project over selectedProjectId", () => {
		const p1 = project("p1");
		const p2 = project("p2");
		const w2 = workspace("w2", "p2");
		const selected = selectContextProject({
			projects: [p1, p2],
			workspaces: { p1: [], p2: [w2] },
			activeWorkspaceId: "w2",
			selectedProjectId: "p1",
		});
		expect(selected).toBe(p2);
	});

	test("falls back to selectedProjectId when no workspace is active", () => {
		const p1 = project("p1");
		const p2 = project("p2");
		const selected = selectContextProject({
			projects: [p1, p2],
			workspaces: {},
			activeWorkspaceId: null,
			selectedProjectId: "p2",
		});
		expect(selected).toBe(p2);
	});
});

describe("selectWorkspaceTerminals", () => {
	test("returns the active workspace's terminals or a stable empty list", () => {
		const terminals = [{ tabKey: "t1", workspaceId: "w1", title: "Terminal" }];
		expect(
			selectWorkspaceTerminals({
				terminalsByWorkspace: { w1: terminals },
				activeWorkspaceId: "w1",
				activeTerminalByWorkspace: {},
			}),
		).toBe(terminals);
		expect(
			selectWorkspaceTerminals({
				terminalsByWorkspace: {},
				activeWorkspaceId: null,
				activeTerminalByWorkspace: {},
			}),
		).toEqual([]);
	});
});
