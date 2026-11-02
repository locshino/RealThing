import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workspace, WorkspaceWatchReadyResult } from "@realthing/contracts";
import { WS_METHODS } from "@realthing/contracts";
import { resetConfigCache } from "../settings";
import { stopAllWatches } from "../watch";
import { handleRequest, requestMethodDiagnostic, shouldRefreshOpenReview } from "./handlers";

const CTX = { clientKey: "test-client" };

let dataDir: string;
let repo: string;
const savedDataDir = process.env.REALTHING_DATA_DIR;

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "ignore", stderr: "ignore" });
	if (!result.success) throw new Error(`git ${args.join(" ")} failed`);
}

function gitText(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
	if (!result.success) throw new Error(`git ${args.join(" ")} failed`);
	return new TextDecoder().decode(result.stdout).trim();
}

beforeEach(() => {
	dataDir = mkdtempSync(join(tmpdir(), "trpi-handlers-test-"));
	process.env.REALTHING_DATA_DIR = dataDir;
	resetConfigCache();
	repo = join(dataDir, "repo");
	mkdirSync(repo);
	git(repo, "init", "-b", "main");
	git(repo, "config", "user.email", "t@realthing.test");
	git(repo, "config", "user.name", "test");
	git(repo, "config", "commit.gpgsign", "false");
	writeFileSync(join(repo, "README.md"), "# repo\n");
	git(repo, "add", "-A");
	git(repo, "commit", "-m", "init");
	writeFileSync(
		join(dataDir, "projects.json"),
		JSON.stringify([{ id: "p1", name: "repo", path: repo, slug: "repo", lastOpened: 1 }]),
	);
});

afterEach(() => {
	stopAllWatches();
	resetConfigCache();
	rmSync(dataDir, { recursive: true, force: true });
	if (savedDataDir === undefined) delete process.env.REALTHING_DATA_DIR;
	else process.env.REALTHING_DATA_DIR = savedDataDir;
});

test("every contract method has a registered handler", () => {
	const unregistered = Object.values(WS_METHODS).filter((m) => requestMethodDiagnostic(m) !== m);
	expect(unregistered).toEqual([]);
});

test("open-review cache reuse is opt-in so older clients remain fresh", () => {
	expect(shouldRefreshOpenReview(undefined)).toBe(true);
	expect(shouldRefreshOpenReview(false)).toBe(true);
	expect(shouldRefreshOpenReview(true)).toBe(false);
});

test("branch status reports a branch, and workspace.push publishes it", async () => {
	const workspace = (await handleRequest(
		"workspace.create",
		{ projectId: "p1", name: "Ship segment" },
		CTX,
	)) as Workspace;
	writeFileSync(join(workspace.worktreePath, "ship.txt"), "ship\n");
	git(workspace.worktreePath, "add", "-A");
	git(workspace.worktreePath, "commit", "-m", "ship");
	writeFileSync(join(workspace.worktreePath, "dirty.txt"), "dirty\n");

	const local = await handleRequest("workspace.branchStatus", { workspaceId: workspace.id }, CTX);
	expect(local).toEqual({
		hasOrigin: false,
		published: false,
		pushesElsewhere: false,
		aheadOfBase: 1,
		onBase: false,
	});

	const remote = join(dataDir, "origin.git");
	mkdirSync(remote);
	git(remote, "init", "--bare");
	git(repo, "remote", "add", "origin", remote);
	expect(
		await handleRequest(
			"workspace.push",
			{ workspaceId: workspace.id, branch: workspace.branch },
			CTX,
		),
	).toEqual({
		dirtyFiles: 1,
	});
	const published = await handleRequest(
		"workspace.branchStatus",
		{ workspaceId: workspace.id },
		CTX,
	);
	expect(published).toMatchObject({
		hasOrigin: true,
		published: true,
		ahead: 0,
		behind: 0,
		aheadOfBase: 1,
	});
});

test("a skipFetch poll reads branch status without fetching origin; a focus read still fetches", async () => {
	const workspace = (await handleRequest(
		"workspace.create",
		{ projectId: "p1", name: "Poll" },
		CTX,
	)) as Workspace;
	const remote = join(dataDir, "poll.git");
	mkdirSync(remote);
	git(remote, "init", "--bare");
	git(repo, "remote", "add", "origin", remote);
	await handleRequest(
		"workspace.push",
		{ workspaceId: workspace.id, branch: workspace.branch },
		CTX,
	);
	const other = join(dataDir, "poll-other");
	git(dataDir, "clone", "--branch", workspace.branch, remote, other);
	git(other, "config", "user.email", "t@realthing.test");
	git(other, "config", "user.name", "test");
	writeFileSync(join(other, "teammate.txt"), "teammate\n");
	git(other, "add", "-A");
	git(other, "commit", "-m", "teammate");
	git(other, "push", "origin", workspace.branch);

	expect(
		await handleRequest(
			"workspace.branchStatus",
			{ workspaceId: workspace.id, skipFetch: true },
			CTX,
		),
	).toMatchObject({ published: true, behind: 0 });
	expect(
		await handleRequest("workspace.branchStatus", { workspaceId: workspace.id }, CTX),
	).toMatchObject({ published: true, behind: 1 });
});

test("a split origin measures the branch against where it is pushed, not where it is fetched", async () => {
	const workspace = (await handleRequest(
		"workspace.create",
		{ projectId: "p1", name: "Split origin" },
		CTX,
	)) as Workspace;
	writeFileSync(join(workspace.worktreePath, "ship.txt"), "ship\n");
	git(workspace.worktreePath, "add", "-A");
	git(workspace.worktreePath, "commit", "-m", "ship");
	const fetchRepo = join(dataDir, "fetch.git");
	const pushRepo = join(dataDir, "push.git");
	for (const bare of [fetchRepo, pushRepo]) {
		mkdirSync(bare);
		git(bare, "init", "--bare");
	}
	git(repo, "remote", "add", "origin", fetchRepo);
	git(repo, "remote", "set-url", "--push", "origin", pushRepo);
	git(repo, "push", fetchRepo, "main");
	await handleRequest(
		"workspace.push",
		{ workspaceId: workspace.id, branch: workspace.branch },
		CTX,
	);

	const other = join(dataDir, "other");
	git(dataDir, "clone", fetchRepo, other);
	git(other, "config", "user.email", "t@realthing.test");
	git(other, "config", "user.name", "test");
	git(other, "switch", "-c", workspace.branch);
	writeFileSync(join(other, "unrelated.txt"), "unrelated\n");
	git(other, "add", "-A");
	git(other, "commit", "-m", "unrelated on the fetch side");
	git(other, "push", "origin", workspace.branch);
	git(workspace.worktreePath, "fetch", "origin");
	git(other, "push", "origin", "--delete", workspace.branch);

	expect(
		await handleRequest("workspace.branchStatus", { workspaceId: workspace.id }, CTX),
	).toMatchObject({ published: true, pushesElsewhere: true, ahead: 0, behind: 0 });

	const pushed = join(dataDir, "pushed");
	git(dataDir, "clone", "--branch", workspace.branch, pushRepo, pushed);
	git(pushed, "config", "user.email", "t@realthing.test");
	git(pushed, "config", "user.name", "test");
	writeFileSync(join(pushed, "later.txt"), "later\n");
	git(pushed, "add", "-A");
	git(pushed, "commit", "-m", "later on the push side");
	git(pushed, "push", "origin", workspace.branch);

	git(workspace.worktreePath, "fetch", "--prune", "origin");

	expect(
		await handleRequest(
			"workspace.branchStatus",
			{ workspaceId: workspace.id, allowCached: true },
			CTX,
		),
	).toMatchObject({ published: true, ahead: 0, behind: 1 });
});

test("a split origin whose push repository can't be read reports publication as unknown", async () => {
	const workspace = (await handleRequest(
		"workspace.create",
		{ projectId: "p1", name: "Unreachable push" },
		CTX,
	)) as Workspace;
	const fetchRepo = join(dataDir, "fetch-only.git");
	mkdirSync(fetchRepo);
	git(fetchRepo, "init", "--bare");
	git(repo, "remote", "add", "origin", fetchRepo);
	git(workspace.worktreePath, "push", fetchRepo, `HEAD:refs/heads/${workspace.branch}`);
	git(workspace.worktreePath, "fetch", "origin");
	git(repo, "remote", "set-url", "--push", "origin", join(dataDir, "missing.git"));

	const status = await handleRequest("workspace.branchStatus", { workspaceId: workspace.id }, CTX);
	expect(status).toMatchObject({ hasOrigin: true, pushesElsewhere: true, published: null });
	expect(status).not.toHaveProperty("ahead");
});

test("request diagnostics expose only registered method names", async () => {
	expect(requestMethodDiagnostic("workspace.list")).toBe("workspace.list");
	expect(requestMethodDiagnostic("themes.list")).toBe("themes.list");
	expect(requestMethodDiagnostic("secret prompt value")).toBe("unknown method");
	expect(requestMethodDiagnostic("toString")).toBe("unknown method");
	await expect(handleRequest("toString", undefined, CTX)).rejects.toThrow("Unknown method");
});

test("workspace.rename locks the display name without changing Git or the worktree path", async () => {
	const created = (await handleRequest("workspace.create", { projectId: "p1" }, CTX)) as Workspace;

	const renamed = (await handleRequest(
		"workspace.rename",
		{ id: created.id, name: "Manual Workspace Name" },
		CTX,
	)) as Workspace;

	expect(renamed).toMatchObject({
		id: created.id,
		name: "Manual Workspace Name",
		branch: created.branch,
		renamed: true,
		worktreePath: created.worktreePath,
	});
	expect(gitText(created.worktreePath, "symbolic-ref", "--short", "HEAD")).toBe(created.branch);
	const listed = (await handleRequest("workspace.list", { projectId: "p1" }, CTX)) as Workspace[];
	expect(listed.find((workspace) => workspace.id === created.id)).toMatchObject(renamed);
});

test("workspace.watchReady waits for startup once, then reports an already-ready watcher", async () => {
	const rows = (await handleRequest("workspace.list", { projectId: "p1" }, CTX)) as Workspace[];
	const workspace = rows[0];
	if (!workspace) throw new Error("expected a workspace");

	const first = (await handleRequest(
		"workspace.watchReady",
		{ workspaceId: workspace.id },
		CTX,
	)) as WorkspaceWatchReadyResult;
	expect(first).toEqual({ startupNudge: true });
	const second = (await handleRequest(
		"workspace.watchReady",
		{ workspaceId: workspace.id },
		CTX,
	)) as WorkspaceWatchReadyResult;
	expect(second).toEqual({ startupNudge: false });
});

test("workspace mutation handlers reject the Default before any side effect", async () => {
	const rows = (await handleRequest("workspace.list", { projectId: "p1" }, CTX)) as Workspace[];
	const def = rows[0];
	if (def?.kind !== "default")
		throw new Error("expected the ensured Default workspace pinned first");

	await expect(handleRequest("workspace.remove", { id: def.id }, CTX)).rejects.toThrow(
		"The Default workspace cannot be removed",
	);
	await expect(
		handleRequest("workspace.rename", { id: def.id, name: "Not Default" }, CTX),
	).rejects.toThrow("The Default workspace cannot be renamed");

	const after = (await handleRequest("workspace.list", { projectId: "p1" }, CTX)) as Workspace[];
	expect(after.filter((w) => w.kind === "default")).toHaveLength(1);
	expect(after[0]?.id).toBe(def.id);
});
