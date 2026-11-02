import { mkdirSync } from "node:fs";
import type {
	Workspace,
	WorkspaceFsChangedPayload,
	WsMethodName,
	WsParams,
	WsResult,
} from "@realthing/contracts";
import { forgetWorkspaceChanges, revertChange, undoChange } from "../changes";
import { selectDirectory } from "../dialog";
import { listAvailableEditors, openEditor, revealInFileManager } from "../editors";
import { readDir, readFile, writeFile } from "../fs";
import {
	commitsAheadOf,
	countPushDivergence,
	countPushTargetDivergence,
	deleteRemoteBranchOnOrigin,
	gitDiffFile,
	gitStatus,
	ignoredPaths,
	listBranches,
	listCommits,
	onBaseBranch,
	originUrls,
	type PushTargetStatus,
	prefetchBranch,
	pushBranchToOrigin,
	remoteRefOid,
} from "../git";
import { localesDir, readLocalLocales } from "../locales";
import { logger } from "../log";
import {
	cancelProjectClone,
	closeProject,
	createProject,
	initProject,
	inspectCloneDestination,
	inspectProjectPath,
	listProjects,
	openProject,
	renameProject,
	startProjectClone,
	suggestProjectPaths,
} from "../projects";
import { updateConfig } from "../settings";
import {
	attachTerminal,
	closeTerminalTab,
	closeWorkspaceTerminals,
	listTerminals,
	reserveTerminal,
	resizeTerminal,
	writeTerminal,
} from "../terminal";
import { readUserThemes, themesDir } from "../themes";
import { addTodo, listTodos, removeTodo, updateTodo } from "../todos";
import { ensureWatch, stopWatch } from "../watch";
import {
	createWorkspace,
	forgetWorkspace,
	getWorkspace,
	listExistingWorktrees,
	listWorkspaceRecords,
	listWorkspaces,
	openExistingWorktree,
	reclaimWorktree,
	renameWorkspace,
	setWorkspaceDiffBase,
	workspaceDiffStats,
} from "../workspaces";
import { provisionInitialTerminal } from "./initialTerminal";

const log = logger("host");

type FsNudgePublisher = (payload: WorkspaceFsChangedPayload) => void;
let publishFsNudge: FsNudgePublisher | null = null;

export function setFsNudgePublisher(fn: FsNudgePublisher | null): void {
	publishFsNudge = fn;
}

function nudgeBaseRefWorkspaces(projectId: string, ref: string): void {
	if (!publishFsNudge) return;
	for (const ws of listWorkspaceRecords(projectId)) {
		const effectiveBase = ws.diffBase ?? ws.baseBranch;
		if (effectiveBase === ref || `origin/${effectiveBase}` === ref) {
			publishFsNudge({
				workspaceId: ws.id,
				paths: [],
				truncated: false,
			});
		}
	}
}

const changeLocks = new Map<string, Promise<unknown>>();

function withChangeLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
	const previous = changeLocks.get(workspaceId) ?? Promise.resolve();
	const current = previous.then(fn, fn);
	const tracked = current.then(
		() => undefined,
		() => undefined,
	);
	changeLocks.set(workspaceId, tracked);
	void tracked.finally(() => {
		if (changeLocks.get(workspaceId) === tracked) {
			changeLocks.delete(workspaceId);
		}
	});
	return current;
}

export interface RequestContext {
	clientKey: string;
	protocolVersion?: number;
}

type WsHandler<M extends WsMethodName> = (
	params: WsParams<M>,
	ctx: RequestContext,
) => WsResult<M> | Promise<WsResult<M>>;

type WsHandlers = { [M in WsMethodName]: WsHandler<M> };

async function archiveTeardown(ws: Workspace): Promise<void> {
	try {
		reclaimWorktree(ws);
	} catch {
		log.warn(`workspace archive teardown failed for ${ws.id}`);
	}
}

export function shouldRefreshOpenReview(allowCached: boolean | undefined): boolean {
	return allowCached !== true;
}

const handlers: WsHandlers = {
	"project.open": async (params) => {
		const project = await openProject(params.path, undefined, {
			allowNonGit: params.allowNonGit,
		});
		if (params.gitFolders && params.gitFolders.length > 0) {
			await listWorkspaces(project.id, { includeDiffStats: false });
			for (const folderPath of params.gitFolders) {
				try {
					provisionInitialTerminal(await openExistingWorktree(project.id, folderPath));
				} catch (err) {
					log.warn(`failed to attach git folder for project ${project.id}`, err as Error);
				}
			}
		}
		return project;
	},
	"project.inspect": (params) => inspectProjectPath(params.path),
	"project.suggestPaths": (params) => suggestProjectPaths(params.query),
	"project.init": (params) => initProject(params.path),
	"project.create": (params) => createProject(params.parentPath, params.name, params.displayName),
	"project.cloneDestination": (params) => ({
		path: inspectCloneDestination(params.parentPath, params.name),
	}),
	"project.clone": (params, ctx) => startProjectClone(params, ctx.clientKey),
	"project.cancelClone": (params, ctx) => {
		cancelProjectClone(params.operationId, ctx.clientKey);
		return { ok: true };
	},
	"project.list": () => listProjects(),
	"project.close": (params) => {
		closeProject(params.id);
		return { ok: true } as const;
	},
	"project.rename": (params) => renameProject(params.id, params.name),
	"workspace.create": async (p) => {
		return provisionInitialTerminal(await createWorkspace(p.projectId, p.name, p.baseRef));
	},
	"workspace.listExisting": (params) => listExistingWorktrees(params.projectId),
	"workspace.openExisting": async (p) => {
		return provisionInitialTerminal(await openExistingWorktree(p.projectId, p.path));
	},
	"workspace.rename": (p) => {
		return renameWorkspace(p.id, p.name);
	},
	"workspace.list": async (p) => {
		const rows = (
			await listWorkspaces(p.projectId, { includeDiffStats: p.includeDiffStats ?? true })
		).map((workspace) => ({ ...workspace, ...provisionInitialTerminal(workspace) }));
		return rows;
	},
	"workspace.branchStatus": async (p) => {
		const ws = getWorkspace(p.workspaceId);
		const fresh = shouldRefreshOpenReview(p.allowCached);
		const origin = await originUrls(ws.worktreePath);
		const splitPushUrl = origin.push !== origin.fetch ? origin.push : null;
		const [measured, aheadOfBase] = await Promise.all([
			(splitPushUrl
				? countPushTargetDivergence(ws.worktreePath, ws.branch, splitPushUrl)
				: countPushDivergence(ws.worktreePath, ws.branch, {
						fetch: fresh && p.skipFetch !== true,
					}).then(
						(divergence): PushTargetStatus =>
							divergence ? { published: true, ...divergence } : { published: false },
					)
			).catch(() => undefined),
			commitsAheadOf(ws.worktreePath, ws.baseBranch),
		]);
		return {
			hasOrigin: origin.push !== null,
			pushesElsewhere: splitPushUrl !== null,
			published:
				measured?.published ??
				(splitPushUrl ? null : remoteRefOid(ws.worktreePath, `origin/${ws.branch}`) !== null),
			...(measured?.published && measured.ahead !== undefined && measured.behind !== undefined
				? { ahead: measured.ahead, behind: measured.behind }
				: {}),
			aheadOfBase,
			onBase: onBaseBranch(ws),
		};
	},
	"workspace.push": async (p) => {
		const ws = getWorkspace(p.workspaceId);
		await pushBranchToOrigin(ws.worktreePath, p.branch);
		const status = await gitStatus(ws.id, { kind: "uncommitted" });
		return { dirtyFiles: status.changes.length };
	},
	"workspace.deleteRemoteBranch": async (p) => {
		const ws = getWorkspace(p.workspaceId);
		await deleteRemoteBranchOnOrigin(ws.worktreePath, p.branch);
		return { ok: true } as const;
	},
	"workspace.remove": (params) => {
		const id = params.id;
		const ws = forgetWorkspace(id);
		if (ws) {
			forgetWorkspaceChanges(ws.id);
			stopWatch(ws.id);
			closeWorkspaceTerminals(ws.id);
			void archiveTeardown(ws);
		}
		return { ok: true } as const;
	},
	"workspace.diffStats": (params) => workspaceDiffStats(params.id),
	"workspace.openIn": (p) => {
		openEditor(p.editor, getWorkspace(p.id).worktreePath);
		return { ok: true } as const;
	},
	"workspace.reveal": (params) => {
		revealInFileManager(getWorkspace(params.id).worktreePath);
		return { ok: true } as const;
	},
	"workspace.setDiffBase": (p) => {
		return setWorkspaceDiffBase(p.id, p.ref);
	},
	"workspace.watchReady": (p) => {
		return ensureWatch(p.workspaceId, { prewarm: p.prewarm === true });
	},
	"editor.list": () => listAvailableEditors(),
	"git.listBranches": (params) => listBranches(params.projectId),
	"git.prefetch": async (p) => {
		const { ok, moved } = await prefetchBranch(p.projectId, p.ref);
		if (moved) nudgeBaseRefWorkspaces(p.projectId, p.ref);
		return { ok };
	},
	"git.status": (p) => {
		void ensureWatch(p.workspaceId);
		return gitStatus(p.workspaceId, p.scope);
	},
	"git.diffFile": (p) => {
		void ensureWatch(p.workspaceId);
		return gitDiffFile(p.workspaceId, p.path, p.scope);
	},
	"git.listCommits": (params) => listCommits(params.workspaceId),
	"change.revert": (p) => {
		void ensureWatch(p.workspaceId);
		return withChangeLock(p.workspaceId, async () => ({ receipt: await revertChange(p) }));
	},
	"change.undo": (p) => {
		void ensureWatch(p.workspaceId);
		return withChangeLock(p.workspaceId, async () => ({ receipt: await undoChange(p) }));
	},
	"terminal.reserve": (p) => {
		getWorkspace(p.workspaceId);
		return { tab: reserveTerminal(p.workspaceId, p.tabKey, p.title) };
	},
	"terminal.attach": (p, ctx) => {
		return attachTerminal(p.workspaceId, p.tabKey, ctx.clientKey, p);
	},
	"terminal.list": (params) => ({
		tabs: listTerminals(params.workspaceId),
	}),
	"terminal.write": (p, ctx) => {
		writeTerminal(p.id, p.data, ctx.clientKey);
		return { ok: true } as const;
	},
	"terminal.resize": (p, ctx) => {
		resizeTerminal(p.id, p.cols, p.rows, ctx.clientKey);
		return { ok: true } as const;
	},
	"terminal.close": (p) => {
		return closeTerminalTab(p.workspaceId, p.tabKey, p.force ?? false);
	},
	"dialog.selectDirectory": () => selectDirectory(),
	"fs.readDir": async (p) => {
		void ensureWatch(p.workspaceId);
		const nodes = readDir(p.workspaceId, p.path);
		const ignored = await ignoredPaths(
			getWorkspace(p.workspaceId).worktreePath,
			nodes.map((node) => node.path),
		);
		return ignored.size === 0
			? nodes
			: nodes.map((node) => (ignored.has(node.path) ? { ...node, gitignored: true } : node));
	},
	"fs.readFile": (p) => {
		void ensureWatch(p.workspaceId);
		return readFile(p.workspaceId, p.path);
	},
	"fs.writeFile": (p) => {
		void ensureWatch(p.workspaceId);
		return writeFile(p.workspaceId, p.path, p.content, p.expectedHash);
	},
	"todo.list": (p) => listTodos(p),
	"todo.add": (p) => addTodo(p),
	"todo.update": (p) => updateTodo(p),
	"todo.remove": (p) => removeTodo(p),
	"locales.list": () => readLocalLocales(),
	"locales.reveal": () => {
		const dir = localesDir();
		mkdirSync(dir, { recursive: true });
		revealInFileManager(dir);
		return { ok: true } as const;
	},
	"themes.list": () => readUserThemes(),
	"themes.reveal": () => {
		const dir = themesDir();
		mkdirSync(dir, { recursive: true });
		revealInFileManager(dir);
		return { ok: true } as const;
	},
	"settings.update": (params) => {
		const config = params.config;
		return updateConfig(config);
	},
};

function isWsMethod(method: string): method is WsMethodName {
	return Object.hasOwn(handlers, method);
}

function dispatch<M extends WsMethodName>(method: M, params: WsParams<M>, ctx: RequestContext) {
	return handlers[method](params, ctx);
}

export function requestMethodDiagnostic(method: string): string {
	return isWsMethod(method) ? method : "unknown method";
}

export async function handleRequest(
	method: string,
	params: unknown,
	ctx: RequestContext,
): Promise<unknown> {
	if (!isWsMethod(method)) throw new Error(`Unknown method: ${method}`);
	return dispatch(method, params as WsParams<typeof method>, ctx);
}
