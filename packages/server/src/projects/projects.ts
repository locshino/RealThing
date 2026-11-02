import { randomUUID } from "node:crypto";
import { type Dirent, mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type {
	PathCandidate,
	PathSuggestionsResult,
	Project,
	ProjectPathStatus,
} from "@realthing/contracts";
import { CodedError } from "@realthing/shared/codedError";
import { canonicalPath, git } from "../git";
import { loadProjects, loadWorkspaces, saveProjects } from "../persistence";

type ProjectPublisher = (project: Project) => void;

let publishProject: ProjectPublisher | null = null;

export function setProjectPublisher(fn: ProjectPublisher | null): void {
	publishProject = fn;
}

function emit(project: Project): void {
	publishProject?.(project);
}

export function resolveProjectPath(path: string): string {
	const home =
		(process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) || homedir();
	const underHome =
		path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\"));
	const expanded = path === "~" ? home : underHome ? join(home, path.slice(2)) : path;
	if (!isAbsolute(expanded)) {
		const homeForms = process.platform === "win32" ? "~/ or ~\\" : "~/";
		throw new Error(`Project path must be absolute or start with ${homeForms}: ${path}`);
	}
	return resolve(expanded);
}

function gitToplevel(path: string): string | null {
	const result = git(path, ["rev-parse", "--show-toplevel"]);
	return result.ok && result.out ? resolve(result.out) : null;
}

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "project"
	);
}

function uniqueSlug(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}

function ensureSlugs(projects: Project[]): boolean {
	const taken = new Set(projects.map((p) => p.slug).filter(Boolean));
	let changed = false;
	for (const project of projects) {
		if (!project.slug) {
			project.slug = uniqueSlug(slugify(project.name), taken);
			taken.add(project.slug);
			changed = true;
		}
	}
	return changed;
}

export function getProjects(): Project[] {
	const projects = loadProjects();
	if (ensureSlugs(projects)) saveProjects(projects);
	return projects;
}

export function openProject(
	inputPath: string,
	displayName?: string,
	opts?: { allowNonGit?: boolean | undefined },
): Project {
	const path = resolveProjectPath(inputPath);
	const projects = getProjects();
	let root = gitToplevel(path);
	if (!root) {
		const known = projects.find(
			(p) => p.path === path || canonicalPath(p.path) === canonicalPath(path),
		);
		if (known && opts?.allowNonGit) {
			root = known.path;
		} else if (known) {
			const attachedPaths = new Set(
				loadWorkspaces()
					.filter((ws) => ws.projectId === known.id)
					.map((ws) => canonicalPath(ws.worktreePath)),
			);
			const hasUnattachedGitFolders = discoverGitSubfolders(known.path).some(
				(sub) => !attachedPaths.has(canonicalPath(sub.path)),
			);
			if (known.closed !== true && hasUnattachedGitFolders) {
				throw new CodedError("NOT_GIT", `Not a git repository: ${path}`);
			}
			root = known.path;
		} else if (opts?.allowNonGit) {
			if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
				throw new Error(`Not a folder: ${path}`);
			}
			root = canonicalPath(path);
		} else {
			throw new CodedError("NOT_GIT", `Not a git repository: ${path}`);
		}
	}

	const existing = projects.find((p) => p.path === root);
	if (existing) {
		delete existing.closed;
		existing.lastOpened = Date.now();
		saveProjects(projects);
		emit(existing);
		return existing;
	}

	const wanted = canonicalPath(root);
	if (loadWorkspaces().some((ws) => canonicalPath(ws.worktreePath) === wanted))
		throw new CodedError(
			"ALREADY_OPEN",
			`This folder is already open in RealThing as a workspace: ${root}`,
		);

	const taken = new Set(projects.map((p) => p.slug));
	const label = displayName?.replace(/\s+/g, " ").trim();
	const project: Project = {
		id: randomUUID(),
		name: label && label.length <= PROJECT_NAME_MAX_LENGTH ? label : basename(root),
		path: root,
		slug: uniqueSlug(slugify(basename(root)), taken),
		lastOpened: Date.now(),
	};
	projects.push(project);
	saveProjects(projects);
	emit(project);
	return project;
}

function newestFirst(projects: Project[]): Project[] {
	return projects.sort((a, b) => b.lastOpened - a.lastOpened);
}

export function listProjects(): Project[] {
	return newestFirst(getProjects().filter((project) => project.closed !== true));
}

const goneFolders = new Set<string>();
const folderChecks = new Map<string, Promise<void>>();

function checkFolder(path: string): Promise<void> {
	const pending = folderChecks.get(path);
	if (pending) return pending;
	const check = stat(path)
		.then(
			(stats) => !stats.isDirectory(),
			(error) => {
				const code = (error as { code?: string }).code;
				return code === "ENOENT" || code === "ENOTDIR";
			},
		)
		.then((gone) => {
			if (gone) goneFolders.add(path);
			else goneFolders.delete(path);
			folderChecks.delete(path);
		});
	folderChecks.set(path, check);
	return check;
}

export async function refreshRecentProjectFolders(budgetMs: number): Promise<void> {
	const checks = getProjects()
		.filter((project) => project.closed === true)
		.map((project) => checkFolder(project.path));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const budget = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, budgetMs);
	});
	await Promise.race([Promise.all(checks), budget]);
	clearTimeout(timer);
}

export function listRecentProjects(): Project[] {
	return newestFirst(
		getProjects().filter((project) => project.closed !== true || !goneFolders.has(project.path)),
	);
}

export function closeProject(id: string): Project {
	const projects = getProjects();
	const project = projects.find((candidate) => candidate.id === id);
	if (!project) throw new Error(`Unknown project: ${id}`);
	project.closed = true;
	saveProjects(projects);
	emit(project);
	return project;
}

const PROJECT_NAME_MAX_LENGTH = 100;

export function renameProject(id: string, requestedName: string): Project {
	const name = requestedName.replace(/\s+/g, " ").trim();
	if (!name || name.length > PROJECT_NAME_MAX_LENGTH)
		throw new Error(`Invalid project name: ${requestedName}`);
	const projects = getProjects();
	const project = projects.find((candidate) => candidate.id === id);
	if (!project) throw new Error(`Unknown project: ${id}`);
	if (project.name === name) return project;
	project.name = name;
	saveProjects(projects);
	emit(project);
	return project;
}

const SKIPPED_SCAN_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"out",
	"target",
	"vendor",
	".next",
	".turbo",
]);

export function discoverGitSubfolders(rootPath: string): PathCandidate[] {
	const found: PathCandidate[] = [];
	const seen = new Set<string>();

	const visit = (dir: string, relPrefix: string, depth: number) => {
		if (found.length >= 50 || depth > 2) return;
		let entries: Dirent<string>[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
		for (const entry of entries) {
			if (found.length >= 50) break;
			if (entry.name.startsWith(".") || SKIPPED_SCAN_DIRS.has(entry.name)) continue;
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
			const fullPath = join(dir, entry.name);
			let canonical: string;
			try {
				if (!statSync(fullPath).isDirectory()) continue;
				canonical = canonicalPath(fullPath);
			} catch {
				continue;
			}
			if (seen.has(canonical)) continue;
			seen.add(canonical);
			const relName = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
			const hasDotGit = statSync(join(fullPath, ".git"), { throwIfNoEntry: false }) !== undefined;
			if (hasDotGit) {
				found.push({
					name: relName,
					path: resolve(fullPath),
					kind: "repo",
				});
			} else if (depth < 2) {
				visit(fullPath, relName, depth + 1);
			}
		}
	};

	visit(rootPath, "", 1);
	return found;
}

function inspectResolvedProjectPath(path: string): ProjectPathStatus {
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(path);
	} catch {
		return { kind: "missing" };
	}
	if (!stat.isDirectory()) return { kind: "notDirectory" };
	if (gitToplevel(path)) return { kind: "repo" };
	const home =
		(process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) || homedir();
	if (canonicalPath(path) === canonicalPath(home)) return { kind: "initable" };
	const gitFolders = discoverGitSubfolders(path);
	return gitFolders.length > 0 ? { kind: "initable", gitFolders } : { kind: "initable" };
}

export function inspectProjectPath(inputPath: string): ProjectPathStatus {
	return inspectResolvedProjectPath(resolveProjectPath(inputPath));
}

export function suggestProjectPaths(inputQuery: string): PathSuggestionsResult {
	const trimmed = inputQuery.trim();
	const home =
		(process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME) || homedir();

	let resolvedParent: string;
	let parentDisplay: string;
	let prefix: string;
	let searchEverywhere = false;

	if (!trimmed) {
		resolvedParent = home;
		parentDisplay = "~";
		prefix = "";
	} else if (
		trimmed === "~" ||
		trimmed === "~/" ||
		(process.platform === "win32" && trimmed === "~\\")
	) {
		resolvedParent = home;
		parentDisplay = "~";
		prefix = "";
	} else if (
		trimmed.startsWith("~/") ||
		(process.platform === "win32" && trimmed.startsWith("~\\"))
	) {
		const withoutTilde = trimmed.slice(2);
		const lastSlash = Math.max(withoutTilde.lastIndexOf("/"), withoutTilde.lastIndexOf("\\"));
		if (lastSlash === -1) {
			resolvedParent = home;
			parentDisplay = "~";
			prefix = withoutTilde;
		} else {
			const subParent = withoutTilde.slice(0, lastSlash);
			resolvedParent = join(home, subParent);
			parentDisplay = `~/${subParent}`;
			prefix = withoutTilde.slice(lastSlash + 1);
		}
	} else if (isAbsolute(trimmed)) {
		const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
		if (trimmed.endsWith("/") || trimmed.endsWith("\\")) {
			resolvedParent = resolve(trimmed);
			parentDisplay = resolvedParent;
			prefix = "";
		} else if (lastSlash === -1 || lastSlash === 0) {
			resolvedParent = resolve("/");
			parentDisplay = "/";
			prefix = trimmed.slice(lastSlash + 1);
		} else {
			const parentPart = trimmed.slice(0, lastSlash);
			resolvedParent = resolve(parentPart);
			parentDisplay = resolvedParent;
			prefix = trimmed.slice(lastSlash + 1);
		}
	} else if (trimmed.includes("/") || trimmed.includes("\\")) {
		const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
		const subParent = trimmed.slice(0, lastSlash);
		resolvedParent = join(home, subParent);
		parentDisplay = `~/${subParent}`;
		prefix = trimmed.slice(lastSlash + 1);
	} else {
		resolvedParent = home;
		parentDisplay = "~";
		prefix = trimmed;
		searchEverywhere = true;
	}

	const candidates: PathCandidate[] = [];
	const seenPaths = new Set<string>();

	const scanDir = (dir: string, displayPrefix: string, filterPrefix: string) => {
		let entries: Dirent<string>[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		const filterLower = filterPrefix.toLowerCase();
		const matching = entries.filter((entry) => {
			if (entry.name === ".git") return false;
			if (entry.name.startsWith(".") && !filterPrefix.startsWith(".")) return false;
			if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
			if (filterLower && !entry.name.toLowerCase().includes(filterLower)) return false;
			return true;
		});

		matching.sort((a, b) => {
			const aStarts = filterLower && a.name.toLowerCase().startsWith(filterLower) ? 0 : 1;
			const bStarts = filterLower && b.name.toLowerCase().startsWith(filterLower) ? 0 : 1;
			if (aStarts !== bStarts) return aStarts - bStarts;
			return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
		});

		for (const entry of matching) {
			if (candidates.length >= 50) break;
			const fullPath = join(dir, entry.name);
			if (seenPaths.has(fullPath)) continue;

			if (entry.isSymbolicLink()) {
				try {
					if (!statSync(fullPath).isDirectory()) continue;
				} catch {
					continue;
				}
			}

			seenPaths.add(fullPath);

			let isRepo = false;
			try {
				isRepo = statSync(join(fullPath, ".git")).isDirectory();
			} catch {}

			const candidatePath =
				displayPrefix === "~"
					? `~/${entry.name}`
					: displayPrefix.startsWith("~")
						? `${displayPrefix.replace(/[/\\]+$/, "")}/${entry.name}`
						: fullPath;

			candidates.push({
				name: entry.name,
				path: candidatePath,
				kind: isRepo ? "repo" : "directory",
			});
		}
	};

	scanDir(resolvedParent, parentDisplay, prefix);

	if (searchEverywhere && candidates.length < 50) {
		const commonDirs = [
			"projects",
			"project",
			"src",
			"dev",
			"code",
			"workspace",
			"workspaces",
			"repos",
		];
		for (const sub of commonDirs) {
			if (candidates.length >= 50) break;
			const subDir = join(home, sub);
			try {
				if (statSync(subDir).isDirectory()) {
					scanDir(subDir, `~/${sub}`, prefix);
				}
			} catch {}
		}
	}

	return {
		parent: parentDisplay,
		candidates,
	};
}

export function initProject(inputPath: string): Project {
	const path = resolveProjectPath(inputPath);
	const status = inspectResolvedProjectPath(path);
	if (status.kind === "missing") throw new Error(`No such folder: ${path}`);
	if (status.kind === "notDirectory") throw new Error(`Not a folder: ${path}`);
	if (status.kind === "repo") return openProject(path);
	bootstrapRepository(path);
	return openProject(path);
}

export function createProject(
	parentPath: string,
	requestedName: string,
	displayName?: string,
): Project {
	const name = requestedName.trim();
	if (!name || name === "." || name === ".." || /[/\\\0]/.test(name)) {
		throw new Error(`Invalid project folder name: ${requestedName}`);
	}
	const parent = resolveProjectPath(parentPath);
	mkdirSync(parent, { recursive: true });
	const path = join(parent, name);
	let created = false;
	try {
		if (!statSync(path).isDirectory()) throw new Error(`Not a folder: ${path}`);
		if (readdirSync(path).length > 0)
			throw new Error(`Folder already exists and isn't empty: ${path}`);
	} catch (err) {
		if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw err;
		mkdirSync(path);
		created = true;
	}
	try {
		bootstrapRepository(path);
		return openProject(path, displayName);
	} catch (err) {
		rmSync(join(path, ".git"), { recursive: true, force: true });
		if (created && readdirSync(path).length === 0) rmdirSync(path);
		throw err;
	}
}

function bootstrapRepository(path: string): void {
	const init = git(path, ["init", "-b", "main"]);
	if (!init.ok) throw new Error(`git init failed: ${path}`);
	try {
		const added = git(path, ["add", "-A"]);
		if (!added.ok) throw new Error(`git add failed: ${path}`);

		const identity: string[] = [];
		if (!git(path, ["config", "user.name"]).out) identity.push("-c", "user.name=RealThing");
		if (!git(path, ["config", "user.email"]).out)
			identity.push("-c", "user.email=realthing@localhost");
		const commit = git(path, [...identity, "commit", "--allow-empty", "-m", "Initial commit"]);
		if (!commit.ok) throw new Error(`git commit failed: ${path}`);
	} catch (err) {
		rmSync(join(path, ".git"), { recursive: true, force: true });
		throw err;
	}
}
