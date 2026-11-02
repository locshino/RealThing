import type { GitDiffScope, ResourceMeta } from "@realthing/contracts";
import {
	DOUBLE_CLICK_SETTLE_MS,
	fileName,
	layoutResourceIdentity,
	projectRelativePath,
	tupleKey,
} from "../lib";
import {
	type CenterNavigationStamp,
	type ChangesTab,
	createChangesTab,
	type EditorTab,
	type FileComparisonTab,
	isCenterNavigationCurrent,
	layoutOpenOptionsForNavigation,
	selectDiffTabTargetRef,
	selectWorkspaceById,
	selectWorkspaceNavTick,
	selectWorkspaceTick,
	type TabIntent,
	useAppStore,
} from "../store";
import { getTransport } from "../transport";
import { changesTabId, diffTabId } from "./changesModel";

function baseName(path: string): string {
	return path.split("/").pop() || path;
}

const MAX_PREFETCHED_FILES = 64;

interface PrefetchedFile {
	workspaceId: string;
	path: string;
	content: string;
	meta: ResourceMeta;
	loadedTick: number;
}

const fileContentCache = new Map<string, PrefetchedFile>();
const filePrefetchInFlight = new Map<
	string,
	{ loadedTick: number; promise: Promise<{ content: string; meta: ResourceMeta }> }
>();
let watchingPrefetchStore = false;

function ensurePrefetchStoreWatcher(): void {
	if (watchingPrefetchStore) return;
	watchingPrefetchStore = true;
	useAppStore.subscribe((state, previous) => {
		if (state.removedWorkspaceIds !== previous.removedWorkspaceIds) {
			for (const [key, entry] of fileContentCache) {
				if (state.removedWorkspaceIds[entry.workspaceId]) fileContentCache.delete(key);
			}
		}
		if (state.fsChangesByWorkspace !== previous.fsChangesByWorkspace) {
			for (const [key, entry] of fileContentCache) {
				const change = state.fsChangesByWorkspace[entry.workspaceId];
				const prevChange = previous.fsChangesByWorkspace[entry.workspaceId];
				if (!change || change === prevChange) continue;
				if (!change.truncated && change.paths.includes(entry.path)) {
					fileContentCache.delete(key);
				} else if (!change.truncated && change.tick === entry.loadedTick + 1) {
					entry.loadedTick = change.tick;
				}
			}
		}
	});
}

function rememberPrefetchedFile(id: string, entry: PrefetchedFile): void {
	ensurePrefetchStoreWatcher();
	if (fileContentCache.has(id)) fileContentCache.delete(id);
	else if (fileContentCache.size >= MAX_PREFETCHED_FILES) {
		const oldest = fileContentCache.keys().next().value;
		if (oldest !== undefined) fileContentCache.delete(oldest);
	}
	fileContentCache.set(id, entry);
}

export function prefetchFileContent(workspaceId: string, reported: string): void {
	const state = useAppStore.getState();
	if (state.removedWorkspaceIds[workspaceId]) return;
	const path = projectRelativePath(reported, selectWorkspaceById(state, workspaceId)?.worktreePath);
	const id = tupleKey("file", workspaceId, path);
	const loadedTick = selectWorkspaceTick(state, workspaceId);
	const cached = fileContentCache.get(id);
	if (cached && cached.loadedTick === loadedTick) return;
	const existing = filePrefetchInFlight.get(id);
	if (existing && existing.loadedTick === loadedTick) return;
	const promise = getTransport()
		.request("fs.readFile", { workspaceId, path })
		.then((result) => {
			if (!useAppStore.getState().removedWorkspaceIds[workspaceId]) {
				rememberPrefetchedFile(id, {
					workspaceId,
					path,
					content: result.content,
					meta: result.meta,
					loadedTick: selectWorkspaceTick(useAppStore.getState(), workspaceId),
				});
			}
			return result;
		})
		.finally(() => {
			if (filePrefetchInFlight.get(id)?.promise === promise) {
				filePrefetchInFlight.delete(id);
			}
		});
	void promise.catch(() => {});
	filePrefetchInFlight.set(id, { loadedTick, promise });
}

const inFlight = new Map<
	string,
	{
		intent: TabIntent;
		claimPreview: boolean;
		navigation: CenterNavigationStamp | null;
		requestedAt: number;
	}
>();

function navTick(workspaceId: string): number {
	return selectWorkspaceNavTick(useAppStore.getState(), workspaceId);
}

async function openReadTab<T>(
	workspaceId: string,
	id: string,
	resourceIdentity: string,
	intent: TabIntent,
	read: () => Promise<T>,
	build: (payload: T, loadedTick: number) => EditorTab,
	requestedNavigation?: CenterNavigationStamp | null,
	claimPreview = false,
	prefetched?: { payload: T; loadedTick: number },
): Promise<void> {
	const navigation =
		requestedNavigation === undefined
			? useAppStore.getState().beginCenterNavigation(workspaceId)
			: requestedNavigation;
	const store = useAppStore.getState();
	if (store.removedWorkspaceIds[workspaceId]) return;
	if (intent === "preview" && !isCenterNavigationCurrent(store, workspaceId, navigation)) return;
	const pending = inFlight.get(id);
	if (pending) {
		if (intent === "preview" || claimPreview) pending.claimPreview = true;
		if (intent === "keep") pending.intent = "keep";
		pending.navigation = navigation;
		pending.requestedAt = navTick(workspaceId);
		return;
	}
	const cached = (store.tabsByWorkspace[workspaceId] ?? []).find(
		(tab) =>
			(tab.kind === "file" || tab.kind === "diff") &&
			layoutResourceIdentity(tab) === resourceIdentity,
	);
	if (cached) {
		const claim =
			intent === "keep" &&
			claimPreview &&
			(!navigation || isCenterNavigationCurrent(store, workspaceId, navigation));
		const options = layoutOpenOptionsForNavigation(store, workspaceId, navigation);
		store.openTab(cached, intent, true, claim ? { ...options, claimPreview: true } : options);
		return;
	}
	if (prefetched) {
		const tab = build(prefetched.payload, prefetched.loadedTick);
		const claim =
			intent === "keep" &&
			claimPreview &&
			(!navigation || isCenterNavigationCurrent(store, workspaceId, navigation));
		const options = layoutOpenOptionsForNavigation(store, workspaceId, navigation);
		store.openTab(tab, intent, true, claim ? { ...options, claimPreview: true } : options);
		return;
	}
	const flight = {
		intent,
		claimPreview: intent === "preview" || claimPreview,
		navigation,
		requestedAt: navTick(workspaceId),
	};
	inFlight.set(id, flight);
	const loadedTick = selectWorkspaceTick(useAppStore.getState(), workspaceId);
	try {
		const payload = await read();
		const currentState = useAppStore.getState();
		const overtaken = flight.navigation
			? !isCenterNavigationCurrent(currentState, workspaceId, flight.navigation)
			: navTick(workspaceId) !== flight.requestedAt;
		if (flight.intent === "preview" && overtaken) return;
		const installedCache = (currentState.tabsByWorkspace[workspaceId] ?? []).find(
			(tab) =>
				(tab.kind === "file" || tab.kind === "diff") &&
				layoutResourceIdentity(tab) === resourceIdentity,
		);
		const tab = installedCache ?? build(payload, loadedTick);
		const options = layoutOpenOptionsForNavigation(currentState, workspaceId, flight.navigation);
		useAppStore
			.getState()
			.openTab(
				tab,
				flight.intent,
				true,
				flight.intent === "keep" && flight.claimPreview && !overtaken
					? { ...options, claimPreview: true }
					: options,
			);
	} catch {
	} finally {
		inFlight.delete(id);
	}
}

export function openFileInTab(
	workspaceId: string,
	reported: string,
	intent: TabIntent,
	requestedNavigation?: CenterNavigationStamp | null,
): Promise<void> {
	const state = useAppStore.getState();
	const path = projectRelativePath(reported, selectWorkspaceById(state, workspaceId)?.worktreePath);
	const id = tupleKey("file", workspaceId, path);
	const currentTick = selectWorkspaceTick(state, workspaceId);
	const cachedContent = fileContentCache.get(id);
	const freshPrefetch = cachedContent
		? {
				payload: { content: cachedContent.content, meta: cachedContent.meta },
				loadedTick: cachedContent.loadedTick,
			}
		: undefined;
	return openReadTab(
		workspaceId,
		id,
		layoutResourceIdentity({ kind: "file", id, name: baseName(path), path }),
		intent,
		() => {
			const pendingPrefetch = filePrefetchInFlight.get(id);
			if (pendingPrefetch) {
				return pendingPrefetch.promise;
			}
			return getTransport()
				.request("fs.readFile", { workspaceId, path })
				.then((result) => {
					if (!useAppStore.getState().removedWorkspaceIds[workspaceId]) {
						rememberPrefetchedFile(id, {
							workspaceId,
							path,
							content: result.content,
							meta: result.meta,
							loadedTick: currentTick,
						});
					}
					return result;
				});
		},
		({ content, meta }, loadedTick) => ({
			kind: "file",
			id,
			workspaceId,
			path,
			name: baseName(path),
			content,
			meta,
			loadedTick,
		}),
		requestedNavigation,
		false,
		freshPrefetch,
	);
}

export function openDiffInTab(
	workspaceId: string,
	scope: GitDiffScope,
	path: string,
	intent: TabIntent,
	requestedNavigation?: CenterNavigationStamp | null,
	options: { claimPreview?: boolean } = {},
): Promise<void> {
	const canonicalPath = projectRelativePath(
		path,
		selectWorkspaceById(useAppStore.getState(), workspaceId)?.worktreePath,
	);
	const id = diffTabId(workspaceId, scope, canonicalPath);
	const target = selectDiffTabTargetRef(useAppStore.getState(), { workspaceId, scope });
	return openReadTab(
		workspaceId,
		id,
		layoutResourceIdentity({
			kind: "diff",
			id,
			name: fileName(canonicalPath),
			path: canonicalPath,
			scope,
		}),
		intent,
		() => getTransport().request("git.diffFile", { workspaceId, path: canonicalPath, scope }),
		({ original, modified, meta, originalOid }, loadedTick) => ({
			kind: "diff",
			id,
			workspaceId,
			path: canonicalPath,
			scope,
			name: fileName(canonicalPath),
			original,
			modified,
			meta,
			originalOid,
			loadedTick,
			loadedTarget: target,
		}),
		requestedNavigation,
		options.claimPreview,
	);
}

export function fileComparisonTab(
	workspaceId: string,
	before: string,
	path: string,
): FileComparisonTab {
	return {
		kind: "diff",
		id: tupleKey("compare", workspaceId, before, path),
		workspaceId,
		name: `${baseName(before)} → ${baseName(path)}`,
		path,
		before,
	};
}

export function openFileComparisonInTab(
	workspaceId: string,
	before: string,
	path: string,
	intent: TabIntent,
): Promise<void> {
	const worktree = selectWorkspaceById(useAppStore.getState(), workspaceId)?.worktreePath;
	const tab = fileComparisonTab(
		workspaceId,
		projectRelativePath(before, worktree),
		projectRelativePath(path, worktree),
	);
	return openReadTab(
		workspaceId,
		tab.id,
		layoutResourceIdentity(tab),
		intent,
		() => Promise.resolve(null),
		(_payload, loadedTick) => ({ ...tab, loadedTick }),
	);
}

export async function openChangesTab(
	workspaceId: string,
	scope: GitDiffScope,
	options: { revealPath?: string | null } = {},
	intent: TabIntent = "preview",
	requestedNavigation?: CenterNavigationStamp | null,
): Promise<void> {
	const navigation =
		requestedNavigation === undefined
			? useAppStore.getState().beginCenterNavigation(workspaceId)
			: requestedNavigation;
	const requestedAt = navTick(workspaceId);
	if (intent === "preview") {
		await new Promise((resolve) => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));
	}
	const state = useAppStore.getState();
	if (state.removedWorkspaceIds[workspaceId]) return;
	const overtaken = navigation
		? !isCenterNavigationCurrent(state, workspaceId, navigation)
		: navTick(workspaceId) !== requestedAt;
	if (intent === "preview" && overtaken) return;
	const id = changesTabId(workspaceId, scope);
	const revealPath = options.revealPath
		? projectRelativePath(options.revealPath, selectWorkspaceById(state, workspaceId)?.worktreePath)
		: null;
	const existing = (state.tabsByWorkspace[workspaceId] ?? []).find(
		(tab): tab is ChangesTab => tab.id === id && tab.kind === "changes",
	);
	const base = existing ?? createChangesTab(workspaceId, id, "", scope);
	const tab: ChangesTab = revealPath
		? { ...base, reveal: { path: revealPath, tick: (base.reveal?.tick ?? 0) + 1 } }
		: base;
	state.openTab(tab, intent, true, layoutOpenOptionsForNavigation(state, workspaceId, navigation));
}
