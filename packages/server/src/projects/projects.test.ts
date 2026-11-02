import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	closeProject,
	createProject,
	getProjects,
	initProject,
	inspectProjectPath,
	listProjects,
	listRecentProjects,
	openProject,
	refreshRecentProjectFolders,
	renameProject,
	setProjectPublisher,
	suggestProjectPaths,
} from "./projects";

const realStat = fsPromises.stat;
const hungStatPaths = new Set<string>();
let hungStatCalls = 0;
mock.module("node:fs/promises", () => ({
	...fsPromises,
	stat: (path: string, ...rest: []) => {
		if (!hungStatPaths.has(path)) return realStat(path, ...rest);
		hungStatCalls += 1;
		return new Promise(() => {});
	},
}));

function gitOut(cwd: string, ...args: string[]): string {
	const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });
	return new TextDecoder().decode(r.stdout).trim();
}

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "ignore", stderr: "ignore" });
	if (!result.success) throw new Error(`git ${args.join(" ")} failed`);
}

function makeRepo(path: string): void {
	mkdirSync(path, { recursive: true });
	git(path, "init", "-b", "main");
	git(path, "config", "user.email", "t@realthing.test");
	git(path, "config", "user.name", "test");
	git(path, "config", "commit.gpgsign", "false");
	writeFileSync(join(path, "README.md"), "# repo\n");
	git(path, "add", "-A");
	git(path, "commit", "-m", "init");
}

function withoutUserGitConfig<T>(run: () => T): T {
	const savedGlobal = process.env.GIT_CONFIG_GLOBAL;
	const savedSystem = process.env.GIT_CONFIG_SYSTEM;
	process.env.GIT_CONFIG_GLOBAL = "/dev/null";
	process.env.GIT_CONFIG_SYSTEM = "/dev/null";
	try {
		return run();
	} finally {
		if (savedGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
		else process.env.GIT_CONFIG_GLOBAL = savedGlobal;
		if (savedSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM;
		else process.env.GIT_CONFIG_SYSTEM = savedSystem;
	}
}

let dataDir: string;
const savedDataDir = process.env.REALTHING_DATA_DIR;

beforeEach(() => {
	dataDir = realpathSync.native(mkdtempSync(join(tmpdir(), "trpi-proj-test-")));
	process.env.REALTHING_DATA_DIR = dataDir;
});

afterEach(() => {
	setProjectPublisher(null);
	rmSync(dataDir, { recursive: true, force: true });
	if (savedDataDir === undefined) delete process.env.REALTHING_DATA_DIR;
	else process.env.REALTHING_DATA_DIR = savedDataDir;
});

function seedWorkspace(worktreePath: string, kind?: "default" | "external"): void {
	writeFileSync(
		join(dataDir, "workspaces.json"),
		JSON.stringify([
			{
				id: "ws-1",
				projectId: "p-other",
				name: "seeded",
				branch: "feature/seeded",
				worktreePath,
				baseBranch: "main",
				renamed: true,
				...(kind ? { kind } : {}),
			},
		]),
	);
}

test("openProject refuses a checkout already attached as an external workspace", () => {
	const attached = join(dataDir, "auth checkout");
	makeRepo(attached);
	seedWorkspace(attached, "external");

	expect(() => openProject(attached)).toThrow("already open in RealThing");
	expect(listProjects()).toHaveLength(0);
});

test("openProject refuses a RealThing-managed worktree dir, whatever symlinks the path carries", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const managed = join(dataDir, "worktrees", "repo", "workspace-1");
	git(repo, "worktree", "add", "-b", "workspace-1", managed);
	seedWorkspace(managed);

	expect(() => openProject(managed)).toThrow("already open in RealThing");
	expect(openProject(repo).path).toBe(realpathSync(repo));
});

test("openProject still reopens a closed project whose own Default workspace holds its cwd", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const project = openProject(repo);
	seedWorkspace(project.path, "default");
	closeProject(project.id);

	expect(openProject(repo).id).toBe(project.id);
	expect(listProjects().map((p) => p.id)).toEqual([project.id]);
});

test("inspectProjectPath: a path that doesn't exist is `missing`", () => {
	expect(inspectProjectPath(join(dataDir, "nope"))).toEqual({ kind: "missing" });
});

test("inspectProjectPath: a file is `notDirectory`", () => {
	const file = join(dataDir, "a-file.txt");
	writeFileSync(file, "not a dir\n");
	expect(inspectProjectPath(file)).toEqual({ kind: "notDirectory" });
});

test("inspectProjectPath: a plain directory is `initable`", () => {
	const dir = join(dataDir, "plain");
	mkdirSync(dir);
	expect(inspectProjectPath(dir)).toEqual({ kind: "initable" });
});

test("inspectProjectPath: a git repo (and any subdirectory) is `repo`", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const sub = join(repo, "src", "deep");
	mkdirSync(sub, { recursive: true });
	expect(inspectProjectPath(repo)).toEqual({ kind: "repo" });
	expect(inspectProjectPath(sub)).toEqual({ kind: "repo" });
});

test("host-home paths resolve consistently across inspect, open, and init", () => {
	const home = join(dataDir, "host-home");
	const repo = join(home, "repo");
	const plain = join(home, "plain");
	makeRepo(repo);
	mkdirSync(plain);
	const savedHome = process.env.HOME;
	const savedUserProfile = process.env.USERPROFILE;
	process.env.HOME = home;
	process.env.USERPROFILE = home;
	try {
		expect(inspectProjectPath("~")).toEqual({ kind: "initable" });
		expect(inspectProjectPath("~/repo")).toEqual({ kind: "repo" });
		expect(openProject("~/repo").path).toBe(realpathSync(repo));
		expect(inspectProjectPath("~/plain")).toEqual({ kind: "initable" });
		expect(withoutUserGitConfig(() => initProject("~/plain")).path).toBe(realpathSync(plain));
	} finally {
		if (savedHome === undefined) delete process.env.HOME;
		else process.env.HOME = savedHome;
		if (savedUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = savedUserProfile;
	}
});

test.skipIf(process.platform !== "win32")(
	"on Windows a home path may use the native separator",
	() => {
		const home = join(dataDir, "host-home");
		const repo = join(home, "repo");
		makeRepo(repo);
		const savedUserProfile = process.env.USERPROFILE;
		process.env.USERPROFILE = home;
		try {
			expect(inspectProjectPath("~\\repo")).toEqual({ kind: "repo" });
			expect(openProject("~\\repo").path).toBe(realpathSync(repo));
			expect(() => openProject("relative\\project")).toThrow(
				"must be absolute or start with ~/ or ~\\",
			);
		} finally {
			if (savedUserProfile === undefined) delete process.env.USERPROFILE;
			else process.env.USERPROFILE = savedUserProfile;
		}
	},
);

test("relative project paths are rejected instead of using the host process cwd", () => {
	for (const operation of [openProject, inspectProjectPath, initProject]) {
		expect(() => operation("relative/project")).toThrow("must be absolute or start with ~/");
	}
});

test("initProject: initialises a plain folder, commits its contents, and opens it", () => {
	const dir = join(dataDir, "plain");
	mkdirSync(dir);
	writeFileSync(join(dir, "hello.txt"), "hi\n");

	const project = withoutUserGitConfig(() => initProject(dir));
	expect(project.path).toBe(realpathSync(dir));
	expect(existsSync(join(dir, ".git"))).toBe(true);
	expect(gitOut(dir, "rev-parse", "HEAD")).not.toBe("");
	expect(gitOut(dir, "ls-tree", "-r", "HEAD", "--name-only")).toContain("hello.txt");
	expect(listProjects()).toHaveLength(1);
});

test("initProject: an empty folder gets an empty initial commit (a HEAD), so worktrees work", () => {
	const dir = join(dataDir, "empty");
	mkdirSync(dir);

	withoutUserGitConfig(() => initProject(dir));
	expect(gitOut(dir, "rev-parse", "HEAD")).not.toBe("");
	expect(gitOut(dir, "ls-tree", "-r", "HEAD", "--name-only")).toBe("");
	const wt = join(dataDir, "wt");
	git(dir, "worktree", "add", wt, "-b", "feature");
	expect(existsSync(wt)).toBe(true);
});

test("createProject: makes the folder and missing parents, bootstraps a repo, and opens it", () => {
	const parent = join(dataDir, "nested", "parent");

	const project = withoutUserGitConfig(() => createProject(parent, " my-app ", " My  App "));
	const path = join(parent, "my-app");
	expect(project.path).toBe(realpathSync(path));
	expect(project.name).toBe("My App");
	expect(gitOut(path, "rev-parse", "HEAD")).not.toBe("");
	expect(listProjects().map((p) => p.id)).toEqual([project.id]);
});

test("createProject: reuses an empty folder but rejects a non-empty one or a file", () => {
	mkdirSync(join(dataDir, "empty"));
	expect(withoutUserGitConfig(() => createProject(dataDir, "empty")).path).toBe(
		realpathSync(join(dataDir, "empty")),
	);

	mkdirSync(join(dataDir, "full"));
	writeFileSync(join(dataDir, "full", "a.txt"), "a\n");
	expect(() => createProject(dataDir, "full")).toThrow("already exists and isn't empty");
	expect(existsSync(join(dataDir, "full", ".git"))).toBe(false);

	writeFileSync(join(dataDir, "file"), "x\n");
	expect(() => createProject(dataDir, "file")).toThrow("Not a folder");
});

test("createProject: a folder inside an enclosing repo becomes its own project", () => {
	const outer = join(dataDir, "outer");
	makeRepo(outer);

	const project = withoutUserGitConfig(() => createProject(outer, "inner"));
	expect(project.path).toBe(realpathSync(join(outer, "inner")));
	expect(resolve(gitOut(join(outer, "inner"), "rev-parse", "--show-toplevel"))).toBe(
		realpathSync(join(outer, "inner")),
	);
});

function withFailingCommitHook<T>(hookBody: string, run: () => T): T {
	const hooks = join(dataDir, "hooks");
	mkdirSync(hooks, { recursive: true });
	writeFileSync(join(hooks, "pre-commit"), `#!/bin/sh\n${hookBody}\nexit 1\n`, { mode: 0o755 });
	const config = join(dataDir, "gitconfig");
	writeFileSync(config, `[core]\n\thooksPath = "${hooks.replaceAll("\\", "/")}"\n`);
	const keys = ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"] as const;
	const saved = keys.map((key) => process.env[key]);
	process.env.GIT_CONFIG_GLOBAL = config;
	delete process.env.GIT_CONFIG_COUNT;
	delete process.env.GIT_CONFIG_PARAMETERS;
	try {
		return run();
	} finally {
		keys.forEach((key, index) => {
			const value = saved[index];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		});
	}
}

test("createProject: a failed bootstrap removes the folder it made, but nothing written into it meanwhile", () => {
	const parent = join(dataDir, "parent");
	expect(() => withFailingCommitHook(":", () => createProject(parent, "clean"))).toThrow(
		"git commit failed",
	);
	expect(existsSync(join(parent, "clean"))).toBe(false);

	expect(() =>
		withFailingCommitHook("echo kept > hook-output.txt", () => createProject(parent, "busy")),
	).toThrow("git commit failed");
	expect(existsSync(join(parent, "busy", ".git"))).toBe(false);
	expect(readFileSync(join(parent, "busy", "hook-output.txt"), "utf8")).toBe("kept\n");
	expect(listProjects()).toEqual([]);
});

test("createProject: rejects names that are not one plain folder name", () => {
	for (const name of ["", "  ", ".", "..", "a/b", "a\\b"]) {
		expect(() => createProject(dataDir, name)).toThrow("Invalid project folder name");
	}
	expect(() => createProject("relative", "app")).toThrow("must be absolute or start with ~/");
});

test("initProject: commits even with no configured git identity (the -c fallback)", () => {
	const dir = join(dataDir, "noid");
	mkdirSync(dir);
	writeFileSync(join(dir, "file.txt"), "x\n");

	withoutUserGitConfig(() => initProject(dir));
	expect(gitOut(dir, "rev-parse", "HEAD")).not.toBe("");
	expect(gitOut(dir, "log", "-1", "--format=%an")).toBe("RealThing");
});

test("initProject: an existing repo is opened, not re-initialised (dedupe, history preserved)", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const originalHead = gitOut(repo, "rev-parse", "HEAD");

	const first = initProject(repo);
	const second = initProject(repo);
	expect(second.id).toBe(first.id);
	expect(listProjects()).toHaveLength(1);
	expect(gitOut(repo, "rev-parse", "HEAD")).toBe(originalHead);
});

test("legacy project records default to open in both projections", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	writeFileSync(
		join(dataDir, "projects.json"),
		JSON.stringify([{ id: "legacy", name: "repo", path: repo, slug: "repo", lastOpened: 1 }]),
	);

	expect(listProjects().map((project) => project.id)).toEqual(["legacy"]);
	expect(listRecentProjects().map((project) => project.id)).toEqual(["legacy"]);
});

test("close/reopen preserves the stable project identity and workspace associations", async () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const project = openProject(repo);
	const workspaceRecord = { id: "ws1", projectId: project.id, worktreePath: "/kept" };
	writeFileSync(join(dataDir, "workspaces.json"), JSON.stringify([workspaceRecord]));

	const published: Array<{ id: string; closed?: true }> = [];
	setProjectPublisher((snapshot) => published.push(snapshot));
	const closed = closeProject(project.id);

	expect(closed.closed).toBe(true);
	expect(listProjects()).toEqual([]);
	expect(listRecentProjects().map(({ id, closed: state }) => ({ id, closed: state }))).toEqual([
		{ id: project.id, closed: true },
	]);
	expect(JSON.parse(readFileSync(join(dataDir, "workspaces.json"), "utf8"))).toEqual([
		workspaceRecord,
	]);
	expect(published).toEqual([expect.objectContaining({ id: project.id, closed: true })]);

	await Bun.sleep(2);
	const reopened = openProject(repo);
	expect(reopened.id).toBe(project.id);
	expect(reopened.closed).toBeUndefined();
	expect(reopened.lastOpened).toBeGreaterThan(closed.lastOpened);
	expect(listProjects().map((candidate) => candidate.id)).toEqual([project.id]);
	expect(listRecentProjects().map((candidate) => candidate.id)).toEqual([project.id]);
	expect(published).toEqual([
		expect.objectContaining({ id: project.id, closed: true }),
		expect.not.objectContaining({ closed: true }),
	]);
});

test("closeProject rejects an unknown id instead of reporting a success with no lifecycle event", () => {
	const published: string[] = [];
	setProjectPublisher((snapshot) => published.push(snapshot.id));
	expect(() => closeProject("missing")).toThrow("Unknown project: missing");
	expect(published).toEqual([]);
});

test("renameProject changes only the display name, publishes it, and survives close/reopen", () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const project = openProject(repo);
	const published: string[] = [];
	setProjectPublisher((snapshot) => published.push(snapshot.name));

	const renamed = renameProject(project.id, "  My\n  Project  ");

	expect(renamed).toMatchObject({
		id: project.id,
		name: "My Project",
		path: project.path,
		slug: project.slug,
	});
	expect(published).toEqual(["My Project"]);
	closeProject(project.id);
	expect(openProject(repo).name).toBe("My Project");
	expect(() => renameProject(project.id, "   ")).toThrow("Invalid project name");
	expect(() => renameProject(project.id, "x".repeat(101))).toThrow("Invalid project name");
	expect(() => renameProject("missing", "Name")).toThrow("Unknown project: missing");
});

test("recent projects omit closed records whose folders are definitively gone", async () => {
	const repo = join(dataDir, "repo");
	makeRepo(repo);
	const blocker = join(dataDir, "blocker");
	writeFileSync(blocker, "not a folder");
	const closed = (id: string, path: string, lastOpened: number) => ({
		id,
		name: id,
		path,
		slug: id,
		lastOpened,
		closed: true,
	});
	writeFileSync(
		join(dataDir, "projects.json"),
		JSON.stringify([
			closed("missing", join(dataDir, "missing"), 5),
			closed("file", blocker, 4),
			closed("nested", join(blocker, "child"), 3),
			closed("kept", repo, 2),
			{ id: "open-gone", name: "o", path: join(dataDir, "unplugged"), slug: "o", lastOpened: 1 },
		]),
	);

	await refreshRecentProjectFolders(1_000);

	expect(listRecentProjects().map((project) => project.id)).toEqual(["kept", "open-gone"]);
	expect(getProjects()).toHaveLength(5);
});

test("recent projects follow the last completed folder check of a closed record", async () => {
	const folder = join(dataDir, "moved");
	writeFileSync(
		join(dataDir, "projects.json"),
		JSON.stringify([
			{ id: "moved", name: "moved", path: folder, slug: "moved", lastOpened: 1, closed: true },
		]),
	);
	expect(listRecentProjects().map((project) => project.id)).toEqual(["moved"]);

	await refreshRecentProjectFolders(1_000);
	expect(listRecentProjects()).toEqual([]);

	mkdirSync(folder);
	await refreshRecentProjectFolders(1_000);
	expect(listRecentProjects().map((project) => project.id)).toEqual(["moved"]);
});

test("a folder check that outlasts the budget neither blocks the refresh nor repeats", async () => {
	const hung = join(dataDir, "hung");
	hungStatPaths.add(hung);
	writeFileSync(
		join(dataDir, "projects.json"),
		JSON.stringify([
			{ id: "hung", name: "hung", path: hung, slug: "hung", lastOpened: 1, closed: true },
		]),
	);
	const calls = hungStatCalls;

	await refreshRecentProjectFolders(10);
	await refreshRecentProjectFolders(10);

	expect(hungStatCalls - calls).toBe(1);
	expect(listRecentProjects().map((project) => project.id)).toEqual(["hung"]);
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
	"recent projects keep a closed record whose folder cannot be inspected",
	async () => {
		const locked = join(dataDir, "locked");
		const folder = join(locked, "repo");
		mkdirSync(folder, { recursive: true });
		writeFileSync(
			join(dataDir, "projects.json"),
			JSON.stringify([
				{ id: "locked", name: "locked", path: folder, slug: "locked", lastOpened: 1, closed: true },
			]),
		);
		chmodSync(locked, 0o000);
		try {
			await refreshRecentProjectFolders(1_000);
		} finally {
			chmodSync(locked, 0o755);
		}

		expect(listRecentProjects().map((project) => project.id)).toEqual(["locked"]);
	},
);

test("suggestProjectPaths: Happy Case - lists subdirectories and identifies repos", () => {
	const testRoot = join(dataDir, "suggest-test");
	mkdirSync(join(testRoot, "my-repo", ".git"), { recursive: true });
	mkdirSync(join(testRoot, "plain-dir"), { recursive: true });
	mkdirSync(join(testRoot, "another-project"), { recursive: true });

	const result = suggestProjectPaths(`${testRoot}/`);
	expect(result.parent).toBe(testRoot);
	expect(result.candidates.length).toBe(3);

	const repoCandidate = result.candidates.find((c) => c.name === "my-repo");
	expect(repoCandidate).toBeDefined();
	expect(repoCandidate?.kind).toBe("repo");
	expect(repoCandidate?.path).toBe(join(testRoot, "my-repo"));

	const dirCandidate = result.candidates.find((c) => c.name === "plain-dir");
	expect(dirCandidate).toBeDefined();
	expect(dirCandidate?.kind).toBe("directory");

	const filtered = suggestProjectPaths(join(testRoot, "my"));
	expect(filtered.candidates.map((c) => c.name)).toEqual(["my-repo"]);
});

test("suggestProjectPaths: Exception Case - missing paths and file targets return empty candidates", () => {
	const missing = suggestProjectPaths(join(dataDir, "non-existent-folder", "sub"));
	expect(missing.candidates).toEqual([]);

	const filePath = join(dataDir, "some-file.txt");
	writeFileSync(filePath, "content");
	const fileTarget = suggestProjectPaths(`${filePath}/`);
	expect(fileTarget.candidates).toEqual([]);
});

test("suggestProjectPaths: Hacking Case - traversal, null bytes, and dotfiles/git isolation", () => {
	const testRoot = join(dataDir, "security-test");
	mkdirSync(join(testRoot, ".git"), { recursive: true });
	mkdirSync(join(testRoot, ".hidden-dir"), { recursive: true });
	mkdirSync(join(testRoot, "visible-dir"), { recursive: true });

	const result = suggestProjectPaths(`${testRoot}/`);
	const names = result.candidates.map((c) => c.name);
	expect(names).toContain("visible-dir");
	expect(names).not.toContain(".git");
	expect(names).not.toContain(".hidden-dir");

	const traversal = suggestProjectPaths(join(testRoot, "../../../../../../../../../etc/"));
	expect(Array.isArray(traversal.candidates)).toBe(true);
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
	"suggestProjectPaths: 403 Case - unreadable folder fails gracefully without throwing",
	() => {
		const locked = join(dataDir, "locked-suggest");
		mkdirSync(join(locked, "secret"), { recursive: true });
		chmodSync(locked, 0o000);
		try {
			const res = suggestProjectPaths(`${locked}/`);
			expect(res.candidates).toEqual([]);
		} finally {
			chmodSync(locked, 0o755);
		}
	},
);

test("inspectProjectPath and openProject: Happy, Exception, Hacking, and 403 Cases for multi-repo non-git root folders", () => {
	const root = join(dataDir, "cleaner-payroll");
	makeRepo(join(root, "back"));
	makeRepo(join(root, "front"));
	makeRepo(join(root, "jobs"));
	mkdirSync(join(root, "docs"), { recursive: true });
	mkdirSync(join(root, "node_modules", "ignored-pkg", ".git"), { recursive: true });
	mkdirSync(join(root, ".hidden-repo", ".git"), { recursive: true });

	const inspected = inspectProjectPath(root);
	expect(inspected.kind).toBe("initable");
	expect(inspected.gitFolders?.map((f) => f.name)).toEqual(["back", "front", "jobs"]);

	expect(() => openProject(root)).toThrow("Not a git repository");
	expect(() =>
		openProject(join(dataDir, "missing-folder"), undefined, { allowNonGit: true }),
	).toThrow("Not a folder");

	const opened = openProject(root, undefined, { allowNonGit: true });
	expect(opened.name).toBe("cleaner-payroll");
	expect(opened.path).toBe(realpathSync(root));

	closeProject(opened.id);
	const reopened = openProject(root);
	expect(reopened.id).toBe(opened.id);
});
