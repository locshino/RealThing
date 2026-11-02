import { randomUUID } from "node:crypto";
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	DEFAULT_FILES_EXCLUDE,
	type ExplorerSortOrder,
	type FileNode,
	type ResourceMeta,
} from "@realthing/contracts";
import { CodedError } from "@realthing/shared/codedError";
import { loadWorkspaceConfig, loadWorkspaces } from "../persistence";
import { decodeText, resourceMeta } from "./content";

function isContained(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function posixRelative(root: string, abs: string): string {
	return relative(root, abs).split(sep).join("/");
}

export function workspaceRelativePath(root: string, path: string): string | null {
	const base = resolve(root);
	const abs = resolve(base, path);
	return isContained(base, abs) ? posixRelative(base, abs) : null;
}

function isGitMetadataPath(root: string, candidate: string): boolean {
	return relative(root, candidate).split(sep).includes(".git");
}

function assertExistingAncestorContained(root: string, abs: string): void {
	const realRoot = realpathSync(root);
	let cursor = abs;
	while (true) {
		let real: string;
		try {
			real = realpathSync(cursor);
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			const parent = dirname(cursor);
			if (parent === cursor) throw error;
			cursor = parent;
			continue;
		}
		if (!isContained(realRoot, real)) throw new Error("Path escapes the worktree");
		if (isGitMetadataPath(realRoot, real)) throw new Error("The .git directory is not readable");
		return;
	}
}

function resolveInWorktree(
	workspaceId: string,
	path: string,
	followLeaf: boolean,
): { root: string; abs: string } {
	const ws = loadWorkspaces().find((workspace) => workspace.id === workspaceId);
	if (!ws) throw new Error(`Unknown workspace: ${workspaceId}`);

	const root = ws.worktreePath;
	const resolvedRoot = resolve(root);
	const abs = resolve(root, path);
	if (!isContained(resolvedRoot, abs)) throw new Error("Path escapes the worktree");
	if (!followLeaf && relative(resolvedRoot, abs) === "") {
		throw new Error("Invalid file path");
	}
	if (isGitMetadataPath(resolvedRoot, abs)) throw new Error("The .git directory is not readable");
	assertExistingAncestorContained(root, followLeaf ? abs : dirname(abs));
	return { root, abs };
}

function compareFileNodes(a: FileNode, b: FileNode, sortOrder: ExplorerSortOrder): number {
	if (sortOrder === "mixed") {
		return a.name.localeCompare(b.name);
	}
	if (sortOrder === "filesFirst") {
		if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
		return a.name.localeCompare(b.name);
	}
	if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
	if (sortOrder === "type" && a.kind === "file") {
		const extCmp = extname(a.name).toLowerCase().localeCompare(extname(b.name).toLowerCase());
		if (extCmp !== 0) return extCmp;
	}
	return a.name.localeCompare(b.name);
}

export function readDir(workspaceId: string, path: string): FileNode[] {
	const { root, abs } = resolveInWorktree(workspaceId, path, true);
	const config = loadWorkspaceConfig(root);
	const excluded = new Set(config.filesExclude ?? DEFAULT_FILES_EXCLUDE);
	excluded.add(".git");

	return readdirSync(abs, { withFileTypes: true })
		.filter((entry) => {
			if (excluded.has(entry.name)) return false;
			if (!config.filesShowHidden && entry.name.startsWith(".") && entry.name !== ".realthing") {
				return false;
			}
			return true;
		})
		.map(
			(entry): FileNode => ({
				path: posixRelative(root, join(abs, entry.name)),
				name: entry.name,
				kind: entry.isDirectory() ? "dir" : "file",
			}),
		)
		.sort((a, b) => compareFileNodes(a, b, config.explorerSortOrder));
}

export function readFile(
	workspaceId: string,
	path: string,
): { content: string; meta: ResourceMeta } {
	const { abs } = resolveInWorktree(workspaceId, path, true);
	const bytes = readFileSync(abs);
	const meta = resourceMeta(bytes, path);
	return { content: meta.text ? decodeText(bytes) : "", meta };
}

export function writeFile(
	workspaceId: string,
	path: string,
	content: string,
	expectedHash?: string,
): { meta: ResourceMeta } {
	if (typeof path !== "string" || path.trim() === "") {
		throw new Error("Invalid file path");
	}
	if (typeof content !== "string") {
		throw new Error("Invalid file content");
	}
	const { abs } = resolveInWorktree(workspaceId, path, false);

	let existingMode: number | null = null;
	let existingBytes: Buffer | null = null;
	try {
		const stat = lstatSync(abs);
		if (stat.isSymbolicLink()) {
			throw new CodedError("UNSUPPORTED_CHANGE", "Refusing to write through a symlink");
		}
		if (stat.isDirectory()) {
			throw new Error("Cannot overwrite a directory");
		}
		existingMode = stat.mode & 0o777;
		if (expectedHash !== undefined) {
			existingBytes = readFileSync(abs);
		}
	} catch (error) {
		const code =
			typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
		if (code !== "ENOENT") throw error;
	}

	if (expectedHash !== undefined) {
		const currentMeta = resourceMeta(existingBytes, path);
		if (currentMeta.hash !== expectedHash) {
			throw new CodedError("STALE_VIEW", "File was modified on disk");
		}
	}

	const bytes = Buffer.from(content, "utf8");
	const dir = dirname(abs);
	mkdirSync(dir, { recursive: true });
	const tempPath = join(dir, `.realthing-write-${randomUUID()}`);
	try {
		writeFileSync(tempPath, bytes);
		if (existingMode !== null) {
			chmodSync(tempPath, existingMode);
		}
		renameSync(tempPath, abs);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}

	return { meta: resourceMeta(bytes, path) };
}

export function resolveWorktreeFile(
	workspaceId: string,
	path: string,
	options: { followLeaf?: boolean } = {},
): string {
	return resolveInWorktree(workspaceId, path, options.followLeaf !== false).abs;
}
