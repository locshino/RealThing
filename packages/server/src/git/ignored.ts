import { statSync } from "node:fs";
import { join } from "node:path";
import { gitAsync } from "./gitExec";

const MAX_ARGS_CHARS = 24_000;
const TIMEOUT_MS = 10_000;
const MAX_CACHED_WORKTREES = 32;

interface IgnoreCacheEntry {
	stamp: string;
	byPath: Map<string, boolean>;
}

const ignoreCache = new Map<string, IgnoreCacheEntry>();

function fileStamp(path: string): string {
	try {
		const stat = statSync(path);
		return `${stat.mtimeMs}:${stat.size}`;
	} catch {
		return "0";
	}
}

function worktreeIgnoreStamp(worktreePath: string): string {
	return `${fileStamp(join(worktreePath, ".gitignore"))}|${fileStamp(join(worktreePath, ".git", "info", "exclude"))}|${fileStamp(join(worktreePath, ".git"))}`;
}

function getWorktreeCache(worktreePath: string): Map<string, boolean> {
	const stamp = worktreeIgnoreStamp(worktreePath);
	const existing = ignoreCache.get(worktreePath);
	if (existing && existing.stamp === stamp) {
		ignoreCache.delete(worktreePath);
		ignoreCache.set(worktreePath, existing);
		return existing.byPath;
	}
	const byPath = new Map<string, boolean>();
	ignoreCache.delete(worktreePath);
	ignoreCache.set(worktreePath, { stamp, byPath });
	if (ignoreCache.size > MAX_CACHED_WORKTREES) {
		const oldest = ignoreCache.keys().next().value;
		if (oldest !== undefined) ignoreCache.delete(oldest);
	}
	return byPath;
}

function hasIgnoredAncestor(byPath: Map<string, boolean>, path: string): boolean {
	let idx = path.indexOf("/");
	while (idx > 0) {
		if (byPath.get(path.slice(0, idx)) === true) return true;
		idx = path.indexOf("/", idx + 1);
	}
	return false;
}

function argChunks(paths: readonly string[]): string[][] {
	const chunks: string[][] = [];
	let current: string[] = [];
	let length = 0;
	for (const path of paths) {
		if (current.length > 0 && length + path.length + 1 > MAX_ARGS_CHARS) {
			chunks.push(current);
			current = [];
			length = 0;
		}
		current.push(path);
		length += path.length + 1;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

interface PendingBatch {
	paths: Set<string>;
	promise: Promise<Set<string>>;
}

const pendingBatches = new Map<string, PendingBatch>();

function runBatchedCheckIgnore(
	worktreePath: string,
	uncached: readonly string[],
): Promise<Set<string>> {
	let batch = pendingBatches.get(worktreePath);
	if (!batch) {
		const paths = new Set<string>();
		const promise = new Promise<Set<string>>((resolve, reject) => {
			queueMicrotask(() => {
				pendingBatches.delete(worktreePath);
				const allPaths = [...paths];
				void Promise.all(
					argChunks(allPaths).map((chunk) =>
						gitAsync(worktreePath, ["-c", "core.quotePath=false", "check-ignore", "--", ...chunk], {
							timeoutMs: TIMEOUT_MS,
							raw: true,
						}),
					),
				).then((runs) => {
					const newlyIgnored = new Set<string>();
					for (const run of runs) {
						if (!run.ok) continue;
						for (const raw of run.out.split("\n")) {
							const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
							if (line && !line.startsWith('"')) newlyIgnored.add(line);
						}
					}
					resolve(newlyIgnored);
				}, reject);
			});
		});
		batch = { paths, promise };
		pendingBatches.set(worktreePath, batch);
	}
	for (const path of uncached) batch.paths.add(path);
	return batch.promise;
}

export async function ignoredPaths(
	worktreePath: string,
	paths: readonly string[],
): Promise<Set<string>> {
	if (paths.length === 0) return new Set();
	const byPath = getWorktreeCache(worktreePath);
	const ignored = new Set<string>();
	const uncached: string[] = [];

	for (const path of paths) {
		const cached = byPath.get(path);
		if (cached !== undefined) {
			if (cached) ignored.add(path);
		} else if (hasIgnoredAncestor(byPath, path)) {
			byPath.set(path, true);
			ignored.add(path);
		} else {
			uncached.push(path);
		}
	}

	if (uncached.length === 0) return ignored;

	const newlyIgnored = await runBatchedCheckIgnore(worktreePath, uncached);
	for (const path of uncached) {
		const isIgnored = newlyIgnored.has(path);
		byPath.set(path, isIgnored);
		if (isIgnored) ignored.add(path);
	}
	return ignored;
}
