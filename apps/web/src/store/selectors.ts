import {
	DEFAULT_WORKSPACE_NAME,
	type GitDiffScope,
	PROJECT_CLONE_PROTOCOL_VERSION,
	type Project,
	type Workspace,
} from "@realthing/contracts";
import type { Translator } from "@realthing/locales/react";
import {
	isAbsolutePath,
	type LayoutAttention,
	layoutResourceIdentity,
	normalizePath,
	readLayoutSelection,
} from "../lib";
import type {
	LayoutAuxiliaryRegion,
	LayoutCenterTab,
	LayoutTab,
	WorkspaceLayoutDocument,
} from "../shell/layout";
import type { ChangesTabSection, EditorTab, FilesTreeView, TerminalTab } from "./appStore";

interface ConnectionGenerationState {
	status: string;
	connectionGeneration: number;
}

export function isConnectedGeneration(
	state: ConnectionGenerationState,
	connectionGeneration: number,
): boolean {
	return state.status === "connected" && state.connectionGeneration === connectionGeneration;
}

export function selectSupportsProjectClone(state: { protocolVersion: number | null }): boolean {
	return state.protocolVersion !== null && state.protocolVersion >= PROJECT_CLONE_PROTOCOL_VERSION;
}

/** The Default row stays first; every other row follows, newest created first. */
export function selectProjectWorkspaces(
	workspaces: Record<string, Workspace[]>,
	projectId: string,
): Workspace[] {
	const rows = workspaces[projectId] ?? [];
	const defaults = rows.filter(isDefaultWorkspace);
	const others = rows.filter((w) => !isDefaultWorkspace(w)).toReversed();
	return [...defaults, ...others];
}

interface ActiveWorkspaceState {
	activeWorkspaceId: string | null;
	workspaces: Record<string, Workspace[]>;
}

interface LayoutDocumentState {
	layoutDocumentsByWorkspace: Record<string, WorkspaceLayoutDocument>;
}

interface LayoutAttentionState extends LayoutDocumentState {
	layoutAttentionByWorkspace: Record<string, LayoutAttention>;
}

interface CenterResourceCacheState extends LayoutAttentionState {
	tabsByWorkspace: Record<string, EditorTab[]>;
	terminalsByWorkspace: Record<string, TerminalTab[]>;
}

interface ProjectContextState extends ActiveWorkspaceState {
	selectedProjectId: string | null;
	projects: Project[];
}

export interface LayoutTabPlacement {
	area: "center" | LayoutAuxiliaryRegion;
	groupId: string;
}

export interface LayoutResourcePlacement extends LayoutTabPlacement {
	tabId: string;
	tab: LayoutTab;
}

function findLayoutPlacement(
	document: WorkspaceLayoutDocument,
	matches: (tab: LayoutTab) => boolean,
): LayoutResourcePlacement | null {
	const findCenter = (node: WorkspaceLayoutDocument["center"]): LayoutResourcePlacement | null => {
		if (node.kind === "split") return findCenter(node.children[0]) ?? findCenter(node.children[1]);
		const tab = node.tabs.find(matches);
		return tab ? { area: "center", groupId: node.id, tabId: tab.id, tab } : null;
	};
	const center = findCenter(document.center);
	if (center) return center;
	for (const region of ["left", "right", "bottom"] as const) {
		for (const group of document[region].groups) {
			const tab = group.tabs.find(matches);
			if (tab) return { area: region, groupId: group.id, tabId: tab.id, tab };
		}
	}
	return null;
}

export function selectLayoutTabPlacement(
	state: LayoutDocumentState,
	workspaceId: string,
	tabId: string,
): LayoutTabPlacement | null {
	const document = state.layoutDocumentsByWorkspace[workspaceId];
	if (!document) return null;
	const placement = findLayoutPlacement(document, (tab) => tab.id === tabId);
	return placement ? { area: placement.area, groupId: placement.groupId } : null;
}

export function selectLayoutResourcePlacement(
	state: LayoutDocumentState,
	workspaceId: string,
	resource: LayoutTab,
): LayoutResourcePlacement | null {
	return selectLayoutIdentityPlacement(state, workspaceId, layoutResourceIdentity(resource));
}

export function selectLayoutIdentityPlacement(
	state: LayoutDocumentState,
	workspaceId: string,
	identity: string,
): LayoutResourcePlacement | null {
	const document = state.layoutDocumentsByWorkspace[workspaceId];
	if (!document) return null;
	return findLayoutPlacement(document, (tab) => layoutResourceIdentity(tab) === identity);
}

export function selectLayoutTabPlaced(
	state: LayoutDocumentState,
	workspaceId: string,
	tabId: string,
): boolean {
	return selectLayoutTabPlacement(state, workspaceId, tabId) !== null;
}

export function selectAttentionCenterTab(
	state: LayoutAttentionState,
	workspaceId: string,
): LayoutCenterTab | null {
	const document = state.layoutDocumentsByWorkspace[workspaceId];
	const attention = state.layoutAttentionByWorkspace[workspaceId];
	if (!document || !attention) return null;
	const find = (node: WorkspaceLayoutDocument["center"]): LayoutCenterTab | null => {
		if (node.kind === "split") return find(node.children[0]) ?? find(node.children[1]);
		if (node.id !== attention.lastFocusedCenterGroupId) return null;
		const selectedId = readLayoutSelection(attention, node.id);
		return node.tabs.find((tab) => tab.id === selectedId) ?? node.tabs[0] ?? null;
	};
	return find(document.center);
}

export function selectAttentionCenterResourceCacheKey(
	state: CenterResourceCacheState,
	workspaceId: string,
): string | null {
	const selected = selectAttentionCenterTab(state, workspaceId);
	if (!selected) return null;
	if (selected.kind === "terminal") {
		return (state.terminalsByWorkspace[workspaceId] ?? []).some(
			(terminal) => terminal.tabKey === selected.tabKey,
		)
			? selected.tabKey
			: null;
	}
	const identity = layoutResourceIdentity(selected);
	const cache = (state.tabsByWorkspace[workspaceId] ?? []).find((tab) => {
		switch (tab.kind) {
			case "file":
			case "diff":
			case "changes":
				return tab.kind === selected.kind && layoutResourceIdentity(tab) === identity;
			case "doc":
				return selected.kind === "document" && tab.sourceId === selected.sourceId;
			default:
				return selected.kind === "document" && tab.workspaceId === selected.sourceId;
		}
	});
	return cache?.id ?? null;
}

export function selectAttentionCenterResourceReady(
	state: CenterResourceCacheState,
	workspaceId: string,
): boolean {
	return selectAttentionCenterResourceCacheKey(state, workspaceId) !== null;
}

export function isDefaultWorkspace(workspace: Pick<Workspace, "kind">): boolean {
	return workspace.kind === "default";
}

export function isExternalWorkspace(workspace: Pick<Workspace, "kind">): boolean {
	return workspace.kind === "external";
}

export function isUserOwnedWorkspace(workspace: Pick<Workspace, "kind">): boolean {
	return isDefaultWorkspace(workspace) || isExternalWorkspace(workspace);
}

export function selectActiveWorkspace(state: ActiveWorkspaceState): Workspace | null {
	return state.activeWorkspaceId ? selectWorkspaceById(state, state.activeWorkspaceId) : null;
}

export function selectWorkspaceById(
	state: ActiveWorkspaceState,
	workspaceId: string,
): Workspace | null {
	for (const workspaces of Object.values(state.workspaces)) {
		const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
		if (workspace) return workspace;
	}
	return null;
}

export function selectActiveWorkspaceProjectId(state: ActiveWorkspaceState): string | null {
	return selectActiveWorkspace(state)?.projectId ?? null;
}

export function selectContextProject(state: ProjectContextState): Project | null {
	const projectId = selectActiveWorkspace(state)?.projectId ?? state.selectedProjectId;
	return state.projects.find((project) => project.id === projectId) ?? null;
}

export function selectActiveEditorTab(
	state: {
		tabsByWorkspace: Record<string, EditorTab[]>;
		activeTabByWorkspace: Record<string, string | null>;
	},
	workspaceId: string,
): EditorTab | null {
	const activeId = state.activeTabByWorkspace[workspaceId];
	return (state.tabsByWorkspace[workspaceId] ?? []).find((tab) => tab.id === activeId) ?? null;
}

export const BRANCH_SCOPE: GitDiffScope = { kind: "branch" };

export function selectDiffScope(
	state: { diffScopeByWorkspace: Record<string, GitDiffScope> },
	workspaceId: string,
): GitDiffScope {
	return state.diffScopeByWorkspace[workspaceId] ?? BRANCH_SCOPE;
}

const EMPTY_FILES_TREE_VIEW: FilesTreeView = {
	expanded: [],
	changedCollapsed: [],
	scroll: {},
	seenActivePath: null,
};

export function selectFilesTreeView(
	state: { filesTreeByWorkspace: Record<string, FilesTreeView> },
	workspaceId: string,
): FilesTreeView {
	return state.filesTreeByWorkspace[workspaceId] ?? EMPTY_FILES_TREE_VIEW;
}

export function selectActiveFilePath(
	state: {
		tabsByWorkspace: Record<string, EditorTab[]>;
		activeTabByWorkspace: Record<string, string | null>;
	},
	workspaceId: string,
): string | null {
	const tab = selectActiveEditorTab(state, workspaceId);
	return tab?.kind === "file" || tab?.kind === "diff" ? normalizePath(tab.path) : null;
}

export function selectDiffBaseRef(state: ActiveWorkspaceState, workspaceId: string): string {
	const workspace = selectWorkspaceById(state, workspaceId);
	return workspace ? (workspace.diffBase ?? workspace.baseBranch) : "";
}

export function selectDiffTabTargetRef(
	state: ActiveWorkspaceState,
	tab: { workspaceId: string; scope: GitDiffScope },
): string {
	return tab.scope.kind === "branch" ? selectDiffBaseRef(state, tab.workspaceId) : "";
}

export function selectChangesTabSection(
	state: { tabsByWorkspace: Record<string, EditorTab[]> },
	workspaceId: string,
	tabId: string,
	path: string,
): ChangesTabSection | undefined {
	const tab = state.tabsByWorkspace[workspaceId]?.find((candidate) => candidate.id === tabId);
	return tab?.kind === "changes" ? tab.sections[path] : undefined;
}

export function selectChangesTabRendererIds(
	state: { tabsByWorkspace: Record<string, EditorTab[]> },
	workspaceId: string,
	tabId: string,
): Record<string, string> {
	const tab = state.tabsByWorkspace[workspaceId]?.find((candidate) => candidate.id === tabId);
	const ids: Record<string, string> = {};
	if (tab?.kind !== "changes") return ids;
	for (const [path, section] of Object.entries(tab.sections)) {
		if (section.rendererId) ids[path] = section.rendererId;
	}
	return ids;
}

export function matchesWorktreePath(reported: string, rel: string): boolean {
	const path = normalizePath(reported);
	if (path === rel) return true;
	return isAbsolutePath(path) && path.endsWith(`/${rel}`);
}

export function workspaceName(
	t: Translator,
	workspace: { kind?: Workspace["kind"] | undefined; name: string },
): string {
	return workspace.kind === "default" && workspace.name === DEFAULT_WORKSPACE_NAME
		? t("store.workspace.defaultName")
		: workspace.name;
}

export function selectWorkspaceTick(
	state: { fsChangesByWorkspace: Record<string, { tick: number }> },
	workspaceId: string,
): number {
	return state.fsChangesByWorkspace[workspaceId]?.tick ?? 0;
}

export function fsChangedPaths(change: {
	paths: readonly string[];
	truncated: boolean;
}): readonly string[] | null {
	return change.truncated || change.paths.length === 0 ? null : change.paths;
}

interface FileChangeState {
	connectionGeneration: number;
	fsChangesByWorkspace: Record<string, { paths: readonly string[]; truncated: boolean }>;
}

export function selectFileChangeSince(
	state: FileChangeState,
	previous: FileChangeState,
	workspaceId: string,
): readonly string[] | null | undefined {
	if (state.connectionGeneration !== previous.connectionGeneration) return null;
	const change = state.fsChangesByWorkspace[workspaceId];
	if (!change || change === previous.fsChangesByWorkspace[workspaceId]) return undefined;
	return fsChangedPaths(change);
}

export function selectWorkspaceNavTick(
	state: { navTickByWorkspace: Record<string, number> },
	workspaceId: string,
): number {
	return state.navTickByWorkspace[workspaceId] ?? 0;
}

export interface TerminalState {
	activeWorkspaceId: string | null;
	terminalsByWorkspace: Record<string, TerminalTab[]>;
	activeTerminalByWorkspace: Record<string, string | null>;
}

const NO_TERMINALS: TerminalTab[] = [];

export function selectWorkspaceTerminals(state: TerminalState): TerminalTab[] {
	if (!state.activeWorkspaceId) return NO_TERMINALS;
	return state.terminalsByWorkspace[state.activeWorkspaceId] ?? NO_TERMINALS;
}

export function selectActiveTerminalId(state: TerminalState): string | null {
	if (!state.activeWorkspaceId) return null;
	return state.activeTerminalByWorkspace[state.activeWorkspaceId] ?? null;
}
