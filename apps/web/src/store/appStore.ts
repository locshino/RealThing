import type {
	AppConfig,
	EditorCursorStyle,
	EditorLineNumbersMode,
	EditorRenderWhitespace,
	EditorTabSize,
	ExplorerFileIconsMode,
	ExplorerSortOrder,
	GitDiffScope,
	HostPlatform,
	LayoutPreset,
	LocalLocalesSnapshot,
	Project,
	ResourceMeta,
	SystemThemePair,
	TerminalCursorStyle,
	TerminalTabInfo,
	TerminalWindowsShell,
	ThemeId,
	ThemeMode,
	UserThemesSnapshot,
	Workspace,
	WorkspaceFsChangedPayload,
} from "@realthing/contracts";
import {
	DEFAULT_CONFIG,
	isEditorAutoSaveDelayMs,
	isEditorCursorStyle,
	isEditorFontSize,
	isEditorLineNumbers,
	isEditorRenderWhitespace,
	isEditorTabSize,
	isExplorerFileIcons,
	isExplorerSortOrder,
	isFilesExcludeList,
	isGitCommitListMax,
	isLineWidth,
	isLocalePreference,
	isStringMap,
	isTerminalCursorStyle,
	isTerminalFontSize,
	isTerminalScrollbackLines,
	isTerminalShellArgs,
	isTerminalWindowsShell,
	normalizeThemePreference,
} from "@realthing/contracts";
import { t } from "@realthing/locales/react";
import { create } from "zustand";
import {
	ancestorPaths,
	defaultTerminalIndex,
	defaultTerminalTitle,
	isPreviewCompatibleTabKind,
	type LayoutAttention,
	layoutResourceIdentity,
	randomId,
	readLayoutNavigationClock,
	tupleKey,
} from "../lib";
import type {
	LayoutAuxiliaryRegion,
	LayoutToolId,
	WorkbenchFrame,
	WorkspaceLayoutDocument,
	WorkspaceViewState,
} from "../shell/layout";
import type { ConnectionStatus } from "../transport";
import {
	selectActiveWorkspaceProjectId,
	selectFilesTreeView,
	selectLayoutResourcePlacement,
	selectWorkspaceById,
	selectWorkspaceNavTick,
} from "./selectors";

export interface FileTab {
	kind: "file";
	id: string;
	workspaceId: string;
	name: string;
	path: string;
	content: string;
	meta?: ResourceMeta;
	rendererId?: string;
	viewState?: unknown;
	loadedTick?: number;
}

export interface DocTab {
	kind: "doc";
	id: string;
	workspaceId: string;
	name: string;
	content: string;
	docPath: string;
	sourceId: string;
}

export type DiffTabView = "split" | "inline";

interface DiffTabBase {
	kind: "diff";
	id: string;
	workspaceId: string;
	name: string;
	path: string;
	rendererId?: string;
	viewState?: unknown;
	view?: DiffTabView;
	loadedTick?: number;
}

export interface GitDiffTab extends DiffTabBase {
	before?: undefined;
	scope: GitDiffScope;
	loadedTarget: string;
	original: string;
	modified: string;
	meta?: { original: ResourceMeta; modified: ResourceMeta };
	originalOid?: string | null;
	ignoreWhitespace?: boolean;
}

export interface FileComparisonTab extends DiffTabBase {
	before: string;
}

export type DiffTab = GitDiffTab | FileComparisonTab;

export function isFileComparison<T extends { kind: string; before?: string | undefined }>(
	tab: T,
): tab is T & { kind: "diff"; before: string } {
	return tab.kind === "diff" && tab.before !== undefined;
}

export type ChangesLayout = "stacked" | "single";
type FilesMode = "all" | "changed";
export type FilesScrollView = "all" | "changedList" | "changedTree";

export interface FilesTreeView {
	expanded: readonly string[];
	changedCollapsed: readonly string[];
	scroll: Partial<Record<FilesScrollView, { top: number; scope: string }>>;
	seenActivePath: string | null;
}

export interface ChangesTabReveal {
	path: string;
	tick: number;
}

export interface ChangesTabSection {
	rendererId?: string;
	viewState?: unknown;
}

export interface ChangesTab {
	kind: "changes";
	id: string;
	workspaceId: string;
	name: string;
	scope: GitDiffScope;
	view?: DiffTabView;
	ignoreWhitespace?: boolean;
	viewed: string[];
	activePath: string | null;
	collapsed: Record<string, boolean>;
	reveal: ChangesTabReveal | null;
	sections: Record<string, ChangesTabSection>;
	kept: Record<string, string[]>;
}

export interface PlanTab {
	kind: "plan";
	id: string;
	workspaceId: string;
	name: string;
}

export type EditorTab = FileTab | DocTab | DiffTab | ChangesTab | PlanTab;

export function createChangesTab(
	workspaceId: string,
	id: string,
	name: string,
	scope: GitDiffScope,
): ChangesTab {
	return {
		kind: "changes",
		id,
		workspaceId,
		name,
		scope,
		viewed: [],
		activePath: null,
		collapsed: {},
		reveal: null,
		sections: {},
		kept: {},
	};
}

function editorResourceIdentity(tab: EditorTab): string {
	if (tab.kind === "doc") {
		return tupleKey("layout-resource", "document", "todo-plan", tab.sourceId);
	}
	if (tab.kind === "plan") {
		return tupleKey("layout-resource", "document", "todo-plan", tab.workspaceId);
	}
	return layoutResourceIdentity(tab);
}

function availableEditorTabId(tabs: readonly EditorTab[], tab: EditorTab): string {
	const identity = editorResourceIdentity(tab);
	const existing = tabs.find((candidate) => editorResourceIdentity(candidate) === identity);
	if (existing) return existing.id;
	if (!tabs.some((candidate) => candidate.id === tab.id)) return tab.id;
	let fallback = randomId("editor-cache");
	while (tabs.some((candidate) => candidate.id === fallback)) fallback = randomId("editor-cache");
	return fallback;
}

export type TabIntent = "preview" | "keep";

export interface LocalLayoutPreferences {
	defaultPresetId: string;
	maxSideGroups: number;
	maxBottomGroups: number;
}

export const DEFAULT_LOCAL_LAYOUT_PREFERENCES: LocalLayoutPreferences = {
	defaultPresetId: "balanced",
	maxSideGroups: 6,
	maxBottomGroups: 3,
};

export interface LocalLayoutStatePayload {
	frame: WorkbenchFrame;
	viewsByWorkspace: Record<string, WorkspaceViewState>;
	documentsByWorkspace: Record<string, WorkspaceLayoutDocument>;
	attentionByWorkspace: Record<string, LayoutAttention>;
	preferences: LocalLayoutPreferences;
}

export interface CenterNavigationStamp {
	groupId: string;
	clock: number;
}

export interface LayoutOpenOptions {
	targetGroupId?: string;
	activate?: boolean;
	navigation?: CenterNavigationStamp | null;
	countNavigation?: boolean;
	claimPreview?: boolean;
}

export type LayoutIntent =
	| {
			id: string;
			kind: "open";
			workspaceId: string;
			tab: EditorTab;
			intent: TabIntent;
			targetGroupId?: string;
			activate?: boolean;
			claimPreview?: boolean;
			navigation?: CenterNavigationStamp | null;
			countNavigation?: boolean;
	  }
	| { id: string; kind: "close"; workspaceId: string; tabId: string }
	| {
			id: string;
			kind: "select";
			workspaceId: string;
			tabId: string;
			resource?: EditorTab;
			keep?: boolean;
			focus?: boolean;
			navigation?: CenterNavigationStamp | null;
			countNavigation?: boolean;
	  }
	| { id: string; kind: "reveal-tool"; workspaceId: string; tool: LayoutToolId }
	| {
			id: string;
			kind: "place-terminal";
			workspaceId: string;
			tabKey: string;
			title: string;
			targetGroupId?: string;
			targetArea?: "center" | LayoutAuxiliaryRegion;
			newPaneBelow?: true;
			reveal?: false;
			navigation?: CenterNavigationStamp | null;
			countNavigation?: boolean;
	  }
	| { id: string; kind: "close-terminal"; workspaceId: string; tabKey: string }
	| { id: string; kind: "select-terminal"; workspaceId: string; tabKey: string }
	| { id: string; kind: "toggle-side"; workspaceId: string; side: "left" | "right" }
	| { id: string; kind: "toggle-bottom"; workspaceId: string };

export type LayoutIntentInput = LayoutIntent extends infer Intent
	? Intent extends { id: string }
		? Omit<Intent, "id">
		: never
	: never;

export const SettingsSection = {
	Appearance: "appearance",
	Editor: "editor",
	Files: "files",
	Language: "language",
	LineWidth: "line-width",
	Layout: "layout",
	Keybindings: "keybindings",
	Updates: "updates",
	Terminal: "terminal",
	Git: "git",
} as const;
export type SettingsSection = (typeof SettingsSection)[keyof typeof SettingsSection];

export interface Toast {
	id: string;
	variant: "error" | "success" | "info" | "warning";
	message: string;
	title?: string;
	durationMs?: number;
	action?: { label: string; onClick: () => void };
}

const MAX_TOASTS = 5;

export interface TerminalTab {
	tabKey: string;
	workspaceId: string;
	title: string;
	initialCommand?: string;
	reservationPending?: true;
}

interface AppState {
	status: ConnectionStatus;
	connectionGeneration: number;
	welcomeGeneration: number;
	protocolVersion: number | null;
	hostPlatform: HostPlatform | null;
	hostAppVersion: string | null;
	projects: Project[];
	recentProjects: Project[];
	workspaces: Record<string, Workspace[]>;
	removedWorkspaceIds: Record<string, true>;
	expandedProjectIds: Record<string, true>;
	selectedProjectId: string | null;
	activeWorkspaceId: string | null;
	workspaceSelectionHistory: string[];
	workbenchFrame: WorkbenchFrame | null;
	workspaceViewsByWorkspace: Record<string, WorkspaceViewState>;
	layoutStateReady: boolean;
	localLayoutPreferences: LocalLayoutPreferences;
	layoutDocumentsByWorkspace: Record<string, WorkspaceLayoutDocument>;
	layoutAttentionByWorkspace: Record<string, LayoutAttention>;
	layoutProjectionEpoch: number;
	layoutIntents: LayoutIntent[];
	tabsByWorkspace: Record<string, EditorTab[]>;
	activeTabByWorkspace: Record<string, string | null>;
	previewTabByWorkspace: Record<string, string>;
	navTickByWorkspace: Record<string, number>;
	worktreeCreationsByProject: Record<string, number>;
	terminalsByWorkspace: Record<string, TerminalTab[]>;
	activeTerminalByWorkspace: Record<string, string | null>;
	changesRequest: {
		workspaceId: string;
		path: string | null;
		navTick: number;
		navigation: CenterNavigationStamp | null;
	} | null;
	fsChangesByWorkspace: Record<string, { tick: number; paths: string[]; truncated: boolean }>;
	settingsOpen: boolean;
	settingsSection: SettingsSection;
	theme: ThemeId;
	themeMode: ThemeMode;
	systemThemePair: SystemThemePair | undefined;
	uiFontFamily: string;
	codeFontFamily: string;
	explorerFileIcons: ExplorerFileIconsMode;
	fileLineWidth: number;
	fileLineWidthBounded: boolean;
	editorFontSize: number;
	editorTabSize: EditorTabSize;
	editorInsertSpaces: boolean;
	editorMinimap: boolean;
	editorLineNumbers: EditorLineNumbersMode;
	editorRenderWhitespace: EditorRenderWhitespace;
	editorCursorStyle: EditorCursorStyle;
	editorAutoSaveDelayMs: number;
	filesExclude: string[];
	filesShowHidden: boolean;
	explorerCompactFolders: boolean;
	explorerSortOrder: ExplorerSortOrder;
	filesAssociations: Record<string, string>;
	terminalReplayKb: number;
	terminalWindowsShell: TerminalWindowsShell;
	terminalShellPath: string;
	terminalShellArgs: string[];
	terminalFontSize: number;
	terminalCursorStyle: TerminalCursorStyle;
	terminalCursorBlink: boolean;
	terminalScrollbackLines: number;
	gitCommitVerify: boolean;
	gitCommitListMax: number;
	externalEditorCustomBin: string;
	customKeybindings: Record<string, string>;
	locale: string;
	localLocales: LocalLocalesSnapshot | null;
	installLocalLocales: (snapshot: LocalLocalesSnapshot | null) => void;
	userThemes: UserThemesSnapshot | null;
	installUserThemes: (snapshot: UserThemesSnapshot | null) => void;
	customLayoutPresets: LayoutPreset[];
	toasts: Toast[];
	setStatus: (status: ConnectionStatus) => void;
	installWelcomeSnapshot: (
		protocolVersion: number,
		projects: Project[],
		recentProjects: Project[],
		config?: AppConfig,
		hostPlatform?: HostPlatform,
		hostAppVersion?: string,
	) => void;
	installProjectSnapshot: (projects: Project[], recentProjects: Project[]) => void;
	applyProjectUpdated: (project: Project) => void;
	setWorkspaces: (projectId: string, workspaces: Workspace[]) => void;
	addWorkspace: (workspace: Workspace) => void;
	updateWorkspace: (workspace: Workspace) => void;
	removeWorkspace: (projectId: string, workspaceId: string) => void;
	applyWorkspaceRemoved: (projectId: string, workspaceId: string) => void;
	selectProject: (projectId: string, opts?: { reveal?: boolean }) => void;
	toggleProjectExpanded: (projectId: string) => void;
	expandProject: (projectId: string) => void;
	hydrateExpandedProjects: (projectIds: readonly string[]) => void;
	selectMain: () => void;
	activateWorkspace: (workspace: Pick<Workspace, "id" | "projectId">) => void;
	activateWorkspaceFromRoute: (workspace: Pick<Workspace, "id" | "projectId">) => void;
	hydrateLocalLayoutState: (payload: LocalLayoutStatePayload) => void;
	applyLocalLayoutState: (payload: LocalLayoutStatePayload, invalidateProjection?: boolean) => void;
	setLocalLayoutPreferences: (preferences: LocalLayoutPreferences) => void;
	setLayoutAttention: (workspaceId: string, attention: LayoutAttention) => void;
	syncLegacySelection: (
		workspaceId: string,
		selection: { kind: "editor"; tabId: string } | { kind: "terminal"; tabKey: string } | null,
	) => void;
	enqueueLayoutIntent: (intent: LayoutIntentInput) => string;
	consumeLayoutIntent: (id: string) => void;
	openTab: (
		tab: EditorTab,
		intent: TabIntent,
		syncLayout?: boolean,
		options?: LayoutOpenOptions,
	) => void;
	openDoc: (tab: DocTab | PlanTab) => void;
	closeTab: (
		id: string,
		syncLayout?: boolean,
		countNavigation?: boolean,
		workspaceId?: string,
	) => void;
	setActiveTab: (id: string, intent?: TabIntent, syncLayout?: boolean) => void;
	beginCenterNavigation: (
		workspaceId: string,
		preferredGroupId?: string,
	) => CenterNavigationStamp | null;
	noteNavigation: (workspaceId: string) => void;
	setTabRenderer: (workspaceId: string, id: string, rendererId: string) => void;
	setTabViewState: (workspaceId: string, id: string, viewState: unknown) => void;
	setDiffTabView: (id: string, view: DiffTabView) => void;
	setDiffTabIgnoreWhitespace: (id: string, ignoreWhitespace: boolean) => void;
	setChangesTabView: (workspaceId: string, id: string, view: DiffTabView) => void;
	setChangesTabIgnoreWhitespace: (
		workspaceId: string,
		id: string,
		ignoreWhitespace: boolean,
	) => void;
	setChangesTabViewed: (
		workspaceId: string,
		id: string,
		paths: string | readonly string[],
		viewed: boolean,
	) => void;
	setChangesTabActivePath: (workspaceId: string, id: string, path: string | null) => void;
	setChangesTabCollapsed: (
		workspaceId: string,
		id: string,
		overrides: Record<string, boolean | null>,
	) => void;
	requestChangesTabReveal: (workspaceId: string, id: string, path: string) => void;
	consumeChangesTabReveal: (
		workspaceId: string,
		id: string,
		target: { path: string } | null,
	) => void;
	setChangesTabSectionRenderer: (
		workspaceId: string,
		id: string,
		path: string,
		rendererId: string,
	) => void;
	setChangesTabSectionViewState: (
		workspaceId: string,
		id: string,
		path: string,
		viewState: unknown,
	) => void;
	setChangesTabHunkKept: (
		workspaceId: string,
		id: string,
		path: string,
		key: string,
		kept: boolean,
		hunkKeys: readonly string[],
	) => void;
	changesView: "list" | "tree";
	setChangesView: (view: "list" | "tree") => void;
	filesMode: FilesMode;
	setFilesMode: (mode: FilesMode) => void;
	filesTreeByWorkspace: Record<string, FilesTreeView>;
	hydrateFilesTree: (views: Record<string, FilesTreeView>) => void;
	setFilesTreeExpanded: (workspaceId: string, paths: readonly string[], expanded: boolean) => void;
	collapseAllFiles: (workspaceId: string) => void;
	revealInFiles: (workspaceId: string, path: string) => void;
	setChangedTreeCollapsed: (
		workspaceId: string,
		paths: readonly string[],
		collapsed: boolean,
	) => void;
	setFilesTreeScroll: (
		workspaceId: string,
		view: FilesScrollView,
		top: number,
		scope: string,
	) => void;
	changesLayout: ChangesLayout;
	setChangesLayout: (layout: ChangesLayout) => void;
	diffScopeByWorkspace: Record<string, GitDiffScope>;
	setDiffScope: (workspaceId: string, scope: GitDiffScope) => void;
	noteFsChanged: (payload: WorkspaceFsChangedPayload) => void;
	updateFileTabContent: (
		workspaceId: string,
		id: string,
		content: string,
		meta: ResourceMeta | undefined,
		tick: number,
	) => void;
	updateDiffTabContent: (
		workspaceId: string,
		id: string,
		original: string,
		modified: string,
		meta: { original: ResourceMeta; modified: ResourceMeta } | undefined,
		originalOid: string | null | undefined,
		tick: number,
		loadedTarget: string,
	) => void;
	clearWorkspaceTabs: (workspaceId: string) => void;
	addTerminal: (
		workspaceId: string,
		initialCommand?: string,
		targetGroupId?: string,
		targetArea?: "center" | LayoutAuxiliaryRegion,
		reveal?: boolean,
		requestedTabKey?: string,
		newPaneBelow?: boolean,
	) => void;
	setWorkspaceTerminals: (workspaceId: string, tabs: TerminalTabInfo[]) => void;
	confirmTerminalReservation: (workspaceId: string, tabKey: string) => void;
	rejectTerminalReservation: (workspaceId: string, tabKey: string) => void;
	consumeTerminalInitialCommand: (workspaceId: string, tabKey: string) => void;
	closeTerminalTab: (workspaceId: string, tabKey: string, syncLayout?: boolean) => void;
	setActiveTerminalTab: (workspaceId: string, tabKey: string, syncLayout?: boolean) => void;
	beginWorktreeCreation: (projectId: string) => void;
	endWorktreeCreation: (projectId: string) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	setSettingsSection: (section: SettingsSection) => void;
	applyConfig: (config: AppConfig) => void;
	requestToolView: (workspaceId: string, tool: LayoutToolId) => void;
	requestChangesView: (workspaceId: string, path: string | null, scope?: GitDiffScope) => void;
	revealChanges: (workspaceId: string) => void;
	clearChangesRequest: () => void;
	pushToast: (toast: Omit<Toast, "id">) => string;
	dismissToast: (id: string) => void;
}

function sortProjects(projects: Project[]): Project[] {
	return [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
}

function configPatch(config: AppConfig) {
	const themePreference = normalizeThemePreference(config);
	return {
		...themePreference,
		systemThemePair: themePreference.systemThemePair,
		uiFontFamily:
			typeof config.uiFontFamily === "string" ? config.uiFontFamily : DEFAULT_CONFIG.uiFontFamily,
		codeFontFamily:
			typeof config.codeFontFamily === "string"
				? config.codeFontFamily
				: DEFAULT_CONFIG.codeFontFamily,
		explorerFileIcons: isExplorerFileIcons(config.explorerFileIcons)
			? config.explorerFileIcons
			: DEFAULT_CONFIG.explorerFileIcons,
		fileLineWidth: isLineWidth(config.fileLineWidth)
			? config.fileLineWidth
			: DEFAULT_CONFIG.fileLineWidth,
		fileLineWidthBounded:
			typeof config.fileLineWidthBounded === "boolean"
				? config.fileLineWidthBounded
				: DEFAULT_CONFIG.fileLineWidthBounded,
		editorFontSize: isEditorFontSize(config.editorFontSize)
			? config.editorFontSize
			: DEFAULT_CONFIG.editorFontSize,
		editorTabSize: isEditorTabSize(config.editorTabSize)
			? config.editorTabSize
			: DEFAULT_CONFIG.editorTabSize,
		editorInsertSpaces:
			typeof config.editorInsertSpaces === "boolean"
				? config.editorInsertSpaces
				: DEFAULT_CONFIG.editorInsertSpaces,
		editorMinimap:
			typeof config.editorMinimap === "boolean"
				? config.editorMinimap
				: DEFAULT_CONFIG.editorMinimap,
		editorLineNumbers: isEditorLineNumbers(config.editorLineNumbers)
			? config.editorLineNumbers
			: DEFAULT_CONFIG.editorLineNumbers,
		editorRenderWhitespace: isEditorRenderWhitespace(config.editorRenderWhitespace)
			? config.editorRenderWhitespace
			: DEFAULT_CONFIG.editorRenderWhitespace,
		editorCursorStyle: isEditorCursorStyle(config.editorCursorStyle)
			? config.editorCursorStyle
			: DEFAULT_CONFIG.editorCursorStyle,
		editorAutoSaveDelayMs: isEditorAutoSaveDelayMs(config.editorAutoSaveDelayMs)
			? config.editorAutoSaveDelayMs
			: DEFAULT_CONFIG.editorAutoSaveDelayMs,
		filesExclude: isFilesExcludeList(config.filesExclude)
			? [...config.filesExclude]
			: [...DEFAULT_CONFIG.filesExclude],
		filesShowHidden:
			typeof config.filesShowHidden === "boolean"
				? config.filesShowHidden
				: DEFAULT_CONFIG.filesShowHidden,
		explorerCompactFolders:
			typeof config.explorerCompactFolders === "boolean"
				? config.explorerCompactFolders
				: DEFAULT_CONFIG.explorerCompactFolders,
		explorerSortOrder: isExplorerSortOrder(config.explorerSortOrder)
			? config.explorerSortOrder
			: DEFAULT_CONFIG.explorerSortOrder,
		filesAssociations: isStringMap(config.filesAssociations)
			? { ...config.filesAssociations }
			: { ...DEFAULT_CONFIG.filesAssociations },
		terminalReplayKb: config.terminalReplayKb,
		terminalWindowsShell: isTerminalWindowsShell(config.terminalWindowsShell)
			? config.terminalWindowsShell
			: DEFAULT_CONFIG.terminalWindowsShell,
		terminalShellPath:
			typeof config.terminalShellPath === "string"
				? config.terminalShellPath
				: DEFAULT_CONFIG.terminalShellPath,
		terminalShellArgs: isTerminalShellArgs(config.terminalShellArgs)
			? [...config.terminalShellArgs]
			: [...DEFAULT_CONFIG.terminalShellArgs],
		terminalFontSize: isTerminalFontSize(config.terminalFontSize)
			? config.terminalFontSize
			: DEFAULT_CONFIG.terminalFontSize,
		terminalCursorStyle: isTerminalCursorStyle(config.terminalCursorStyle)
			? config.terminalCursorStyle
			: DEFAULT_CONFIG.terminalCursorStyle,
		terminalCursorBlink:
			typeof config.terminalCursorBlink === "boolean"
				? config.terminalCursorBlink
				: DEFAULT_CONFIG.terminalCursorBlink,
		terminalScrollbackLines: isTerminalScrollbackLines(config.terminalScrollbackLines)
			? config.terminalScrollbackLines
			: DEFAULT_CONFIG.terminalScrollbackLines,
		gitCommitVerify:
			typeof config.gitCommitVerify === "boolean"
				? config.gitCommitVerify
				: DEFAULT_CONFIG.gitCommitVerify,
		gitCommitListMax: isGitCommitListMax(config.gitCommitListMax)
			? config.gitCommitListMax
			: DEFAULT_CONFIG.gitCommitListMax,
		externalEditorCustomBin:
			typeof config.externalEditorCustomBin === "string"
				? config.externalEditorCustomBin
				: DEFAULT_CONFIG.externalEditorCustomBin,
		customKeybindings: isStringMap(config.customKeybindings)
			? { ...config.customKeybindings }
			: { ...DEFAULT_CONFIG.customKeybindings },
		customLayoutPresets: config.customLayoutPresets ?? DEFAULT_CONFIG.customLayoutPresets,
		locale: isLocalePreference(config.locale) ? config.locale : DEFAULT_CONFIG.locale,
	};
}

function upsertProject(projects: Project[], project: Project): Project[] {
	return projects.some((candidate) => candidate.id === project.id)
		? projects.map((candidate) => (candidate.id === project.id ? project : candidate))
		: [...projects, project];
}

function withExpandedProject(
	record: Record<string, true>,
	projectId: string,
): Record<string, true> {
	return record[projectId] ? record : { ...record, [projectId]: true };
}

function withWorkspaceSelected(history: string[], workspaceId: string): string[] {
	return history[0] === workspaceId
		? history
		: [workspaceId, ...history.filter((id) => id !== workspaceId)];
}

function workspaceActivationPatch(
	state: Pick<AppState, "removedWorkspaceIds" | "workspaceSelectionHistory" | "workspaces">,
	workspace: Pick<Workspace, "id" | "projectId">,
):
	| Pick<AppState, "selectedProjectId" | "activeWorkspaceId" | "workspaceSelectionHistory">
	| Record<string, never> {
	if (state.removedWorkspaceIds[workspace.id]) return {};
	return {
		selectedProjectId: workspace.projectId,
		activeWorkspaceId: workspace.id,
		workspaceSelectionHistory: withWorkspaceSelected(state.workspaceSelectionHistory, workspace.id),
	};
}

function recentWorkspaceFallback(
	state: Pick<
		AppState,
		| "projects"
		| "workspaces"
		| "activeWorkspaceId"
		| "removedWorkspaceIds"
		| "workspaceSelectionHistory"
	>,
	excludedWorkspaceId: string,
): Workspace | null {
	const openProjectIds = new Set(state.projects.map((project) => project.id));
	for (const workspaceId of state.workspaceSelectionHistory) {
		if (workspaceId === excludedWorkspaceId || state.removedWorkspaceIds[workspaceId]) continue;
		const workspace = selectWorkspaceById(state, workspaceId);
		if (workspace && openProjectIds.has(workspace.projectId)) return workspace;
	}
	return null;
}

function pruneExpandedProjects(
	state: Pick<AppState, "expandedProjectIds">,
	projects: Project[],
): Pick<AppState, "expandedProjectIds"> | Record<string, never> {
	const open = new Set(projects.map((project) => project.id));
	const kept = Object.keys(state.expandedProjectIds).filter((id) => open.has(id));
	if (kept.length === Object.keys(state.expandedProjectIds).length) return {};
	return {
		expandedProjectIds: Object.fromEntries(kept.map((id) => [id, true as const])),
	};
}

function reconcileProjectNavigation(
	state: Pick<AppState, "selectedProjectId" | "activeWorkspaceId" | "workspaces">,
	projects: Project[],
): Pick<AppState, "selectedProjectId" | "activeWorkspaceId"> | Record<string, never> {
	const currentProjectId = selectActiveWorkspaceProjectId(state) ?? state.selectedProjectId;
	if (!currentProjectId || projects.some((project) => project.id === currentProjectId)) return {};
	return {
		selectedProjectId: projects[0]?.id ?? null,
		activeWorkspaceId: null,
	};
}

function withPathMembership(
	list: readonly string[],
	paths: readonly string[],
	member: boolean,
): readonly string[] {
	const current = new Set(list);
	const changed = paths.filter((path) => current.has(path) !== member);
	if (changed.length === 0) return list;
	if (member) return [...list, ...changed];
	const removed = new Set(changed);
	return list.filter((path) => !removed.has(path));
}

function revealChangedFilesPatch(
	state: Pick<AppState, "layoutIntents">,
	workspaceId: string,
): Pick<AppState, "layoutIntents" | "filesMode"> {
	return {
		layoutIntents: appendLayoutIntent(state.layoutIntents, {
			kind: "reveal-tool",
			workspaceId,
			tool: "files",
		}),
		filesMode: "changed",
	};
}

function patchFilesTreeView(
	state: Pick<AppState, "filesTreeByWorkspace" | "removedWorkspaceIds">,
	workspaceId: string,
	update: (view: FilesTreeView) => FilesTreeView,
): Pick<AppState, "filesTreeByWorkspace"> | Record<string, never> {
	if (state.removedWorkspaceIds[workspaceId]) return {};
	const view = selectFilesTreeView(state, workspaceId);
	const next = update(view);
	if (next === view) return {};
	return { filesTreeByWorkspace: { ...state.filesTreeByWorkspace, [workspaceId]: next } };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const { [key]: _dropped, ...rest } = record;
	return rest;
}

function appendLayoutIntent(intents: LayoutIntent[], input: LayoutIntentInput): LayoutIntent[] {
	return [...intents, { ...input, id: randomId("layout-intent") } as LayoutIntent];
}

function layoutOpenIntentFields(options: LayoutOpenOptions) {
	return {
		...(options.targetGroupId ? { targetGroupId: options.targetGroupId } : {}),
		...(options.activate === false ? { activate: false } : {}),
		...(Object.hasOwn(options, "navigation") ? { navigation: options.navigation } : {}),
		...(options.countNavigation !== undefined ? { countNavigation: options.countNavigation } : {}),
		...(options.claimPreview ? { claimPreview: true } : {}),
	};
}

function patchResourceTab(
	state: Pick<AppState, "tabsByWorkspace">,
	workspaceId: string,
	id: string,
	patch: (tab: FileTab | DiffTab) => FileTab | DiffTab,
): Partial<AppState> {
	const tabs = state.tabsByWorkspace[workspaceId] ?? [];
	if (!tabs.some((tab) => tab.id === id && (tab.kind === "file" || tab.kind === "diff"))) {
		return {};
	}
	return {
		tabsByWorkspace: {
			...state.tabsByWorkspace,
			[workspaceId]: tabs.map((tab) =>
				tab.id === id && (tab.kind === "file" || tab.kind === "diff") ? patch(tab) : tab,
			),
		},
	};
}

function patchDiffTab(
	state: Pick<AppState, "activeWorkspaceId" | "tabsByWorkspace">,
	id: string,
	patch: (tab: DiffTab) => DiffTab,
): Partial<AppState> {
	const wsId = state.activeWorkspaceId;
	if (!wsId) return {};
	const tabs = state.tabsByWorkspace[wsId] ?? [];
	if (!tabs.some((t) => t.id === id && t.kind === "diff")) return {};
	return {
		tabsByWorkspace: {
			...state.tabsByWorkspace,
			[wsId]: tabs.map((t) => (t.id === id && t.kind === "diff" ? patch(t) : t)),
		},
	};
}

function patchChangesTab(
	state: Pick<AppState, "tabsByWorkspace">,
	workspaceId: string,
	id: string,
	patch: (tab: ChangesTab) => ChangesTab,
): Partial<AppState> {
	const tabs = state.tabsByWorkspace[workspaceId] ?? [];
	const index = tabs.findIndex((tab) => tab.id === id && tab.kind === "changes");
	const current = tabs[index];
	if (current?.kind !== "changes") return {};
	const next = patch(current);
	if (next === current) return {};
	return { tabsByWorkspace: { ...state.tabsByWorkspace, [workspaceId]: tabs.with(index, next) } };
}

function recordChangesTabProgress(
	state: Pick<
		AppState,
		"tabsByWorkspace" | "previewTabByWorkspace" | "layoutIntents" | "layoutDocumentsByWorkspace"
	>,
	workspaceId: string,
	id: string,
	patch: (tab: ChangesTab) => ChangesTab,
): Partial<AppState> {
	const patched = patchChangesTab(state, workspaceId, id, patch);
	const tab = patched.tabsByWorkspace?.[workspaceId]?.find((candidate) => candidate.id === id);
	if (tab?.kind !== "changes") return patched;
	const placement = selectLayoutResourcePlacement(state, workspaceId, tab);
	return {
		...patched,
		previewTabByWorkspace:
			state.previewTabByWorkspace[workspaceId] === id
				? omitKey(state.previewTabByWorkspace, workspaceId)
				: state.previewTabByWorkspace,
		layoutIntents: appendLayoutIntent(state.layoutIntents, {
			kind: "select",
			workspaceId,
			tabId: placement?.tabId ?? id,
			keep: true,
			focus: false,
			countNavigation: false,
		}),
	};
}

function bumpNav(s: AppState, workspaceId: string): Record<string, number> {
	return { ...s.navTickByWorkspace, [workspaceId]: selectWorkspaceNavTick(s, workspaceId) + 1 };
}

function advanceCenterNavigation(
	s: AppState,
	workspaceId: string,
	preferredGroupId?: string,
): {
	stamp: CenterNavigationStamp | null;
	patch: Pick<AppState, "navTickByWorkspace" | "layoutAttentionByWorkspace">;
} {
	const attention = s.layoutAttentionByWorkspace[workspaceId];
	if (!attention) {
		return {
			stamp: null,
			patch: {
				navTickByWorkspace: bumpNav(s, workspaceId),
				layoutAttentionByWorkspace: s.layoutAttentionByWorkspace,
			},
		};
	}
	const fallbackGroupId =
		readLayoutNavigationClock(attention, attention.lastFocusedCenterGroupId) !== undefined
			? attention.lastFocusedCenterGroupId
			: (Object.keys(attention.navigationClockByGroup).find(
					(candidate) => readLayoutNavigationClock(attention, candidate) !== undefined,
				) ?? attention.lastFocusedCenterGroupId);
	const groupId =
		preferredGroupId && readLayoutNavigationClock(attention, preferredGroupId) !== undefined
			? preferredGroupId
			: fallbackGroupId;
	const clock = (readLayoutNavigationClock(attention, groupId) ?? 0) + 1;
	return {
		stamp: { groupId, clock },
		patch: {
			navTickByWorkspace: bumpNav(s, workspaceId),
			layoutAttentionByWorkspace: {
				...s.layoutAttentionByWorkspace,
				[workspaceId]: {
					...attention,
					lastFocusedCenterGroupId: groupId,
					navigationClockByGroup: Object.assign(
						Object.create(null),
						attention.navigationClockByGroup,
						{ [groupId]: clock },
					) as Record<string, number>,
				},
			},
		},
	};
}

export function captureCenterNavigation(
	state: { layoutAttentionByWorkspace: Record<string, LayoutAttention> },
	workspaceId: string,
): CenterNavigationStamp | null {
	const attention = state.layoutAttentionByWorkspace[workspaceId];
	if (!attention) return null;
	const groupId = attention.lastFocusedCenterGroupId;
	return {
		groupId,
		clock: readLayoutNavigationClock(attention, groupId) ?? 0,
	};
}

export function layoutOpenOptionsForNavigation(
	state: {
		layoutAttentionByWorkspace: Record<string, LayoutAttention>;
		activeWorkspaceId?: string | null;
	},
	workspaceId: string,
	stamp: CenterNavigationStamp | null,
): LayoutOpenOptions {
	if (!stamp) {
		return state.activeWorkspaceId !== undefined && state.activeWorkspaceId !== workspaceId
			? { activate: false, navigation: stamp }
			: { navigation: stamp };
	}
	const attention = state.layoutAttentionByWorkspace[workspaceId];
	const clock = attention ? readLayoutNavigationClock(attention, stamp.groupId) : undefined;
	const destinationSurvived = clock !== undefined;
	const workspaceStillActive =
		state.activeWorkspaceId === undefined || state.activeWorkspaceId === workspaceId;
	const activate =
		workspaceStillActive &&
		(!destinationSurvived ||
			(clock === stamp.clock && attention?.lastFocusedCenterGroupId === stamp.groupId));
	return {
		targetGroupId: stamp.groupId,
		...(activate ? {} : { activate: false }),
		navigation: stamp,
	};
}

export function shouldAdvanceAcceptedNavigation(
	attention: LayoutAttention,
	navigation: CenterNavigationStamp | null | undefined,
): boolean {
	if (navigation === undefined || navigation === null) return true;
	return readLayoutNavigationClock(attention, navigation.groupId) === undefined;
}

export function isCenterNavigationCurrent(
	state: { layoutAttentionByWorkspace: Record<string, LayoutAttention> },
	workspaceId: string,
	stamp: CenterNavigationStamp | null,
): boolean {
	if (!stamp) return true;
	const attention = state.layoutAttentionByWorkspace[workspaceId];
	const clock = attention ? readLayoutNavigationClock(attention, stamp.groupId) : undefined;
	return clock === undefined || clock === stamp.clock;
}

function nextTerminalTitle(list: TerminalTab[]): string {
	const used = list.flatMap((tab) => defaultTerminalIndex(tab.title) ?? []);
	return defaultTerminalTitle(Math.max(0, ...used) + 1);
}

export const useAppStore = create<AppState>((set, get) => ({
	status: "connecting",
	connectionGeneration: 0,
	welcomeGeneration: 0,
	protocolVersion: null,
	hostPlatform: null,
	hostAppVersion: null,
	projects: [],
	recentProjects: [],
	workspaces: {},
	removedWorkspaceIds: Object.create(null) as Record<string, true>,
	expandedProjectIds: Object.create(null) as Record<string, true>,
	selectedProjectId: null,
	activeWorkspaceId: null,
	workspaceSelectionHistory: [],
	workbenchFrame: null,
	workspaceViewsByWorkspace: {},
	layoutStateReady: false,
	localLayoutPreferences: { ...DEFAULT_LOCAL_LAYOUT_PREFERENCES },
	layoutDocumentsByWorkspace: {},
	layoutAttentionByWorkspace: {},
	layoutProjectionEpoch: 0,
	layoutIntents: [],
	tabsByWorkspace: {},
	activeTabByWorkspace: {},
	previewTabByWorkspace: {},
	navTickByWorkspace: {},
	worktreeCreationsByProject: {},
	terminalsByWorkspace: {},
	activeTerminalByWorkspace: {},
	changesRequest: null,
	changesView: "tree",
	filesMode: "all",
	filesTreeByWorkspace: {},
	changesLayout: "stacked",
	diffScopeByWorkspace: {},
	fsChangesByWorkspace: {},
	settingsOpen: false,
	settingsSection: SettingsSection.Appearance,
	theme: DEFAULT_CONFIG.theme,
	themeMode: DEFAULT_CONFIG.themeMode,
	systemThemePair: DEFAULT_CONFIG.systemThemePair,
	uiFontFamily: DEFAULT_CONFIG.uiFontFamily,
	codeFontFamily: DEFAULT_CONFIG.codeFontFamily,
	explorerFileIcons: DEFAULT_CONFIG.explorerFileIcons,
	fileLineWidth: DEFAULT_CONFIG.fileLineWidth,
	fileLineWidthBounded: DEFAULT_CONFIG.fileLineWidthBounded,
	editorFontSize: DEFAULT_CONFIG.editorFontSize,
	editorTabSize: DEFAULT_CONFIG.editorTabSize,
	editorInsertSpaces: DEFAULT_CONFIG.editorInsertSpaces,
	editorMinimap: DEFAULT_CONFIG.editorMinimap,
	editorLineNumbers: DEFAULT_CONFIG.editorLineNumbers,
	editorRenderWhitespace: DEFAULT_CONFIG.editorRenderWhitespace,
	editorCursorStyle: DEFAULT_CONFIG.editorCursorStyle,
	editorAutoSaveDelayMs: DEFAULT_CONFIG.editorAutoSaveDelayMs,
	filesExclude: [...DEFAULT_CONFIG.filesExclude],
	filesShowHidden: DEFAULT_CONFIG.filesShowHidden,
	explorerCompactFolders: DEFAULT_CONFIG.explorerCompactFolders,
	explorerSortOrder: DEFAULT_CONFIG.explorerSortOrder,
	filesAssociations: { ...DEFAULT_CONFIG.filesAssociations },
	terminalReplayKb: DEFAULT_CONFIG.terminalReplayKb,
	terminalWindowsShell: DEFAULT_CONFIG.terminalWindowsShell,
	terminalShellPath: DEFAULT_CONFIG.terminalShellPath,
	terminalShellArgs: [...DEFAULT_CONFIG.terminalShellArgs],
	terminalFontSize: DEFAULT_CONFIG.terminalFontSize,
	terminalCursorStyle: DEFAULT_CONFIG.terminalCursorStyle,
	terminalCursorBlink: DEFAULT_CONFIG.terminalCursorBlink,
	terminalScrollbackLines: DEFAULT_CONFIG.terminalScrollbackLines,
	gitCommitVerify: DEFAULT_CONFIG.gitCommitVerify,
	gitCommitListMax: DEFAULT_CONFIG.gitCommitListMax,
	externalEditorCustomBin: DEFAULT_CONFIG.externalEditorCustomBin,
	customKeybindings: { ...DEFAULT_CONFIG.customKeybindings },
	customLayoutPresets: DEFAULT_CONFIG.customLayoutPresets,
	locale: DEFAULT_CONFIG.locale,
	localLocales: null,
	installLocalLocales: (snapshot) => set({ localLocales: snapshot }),
	userThemes: null,
	installUserThemes: (snapshot) => set({ userThemes: snapshot }),
	toasts: [],
	setStatus: (status) =>
		set((state) => ({
			status,
			protocolVersion: null,
			connectionGeneration:
				status === "connected" ? state.connectionGeneration + 1 : state.connectionGeneration,
		})),
	installWelcomeSnapshot: (
		protocolVersion,
		projects,
		recentProjects,
		config,
		hostPlatform,
		hostAppVersion,
	) =>
		set((state) => {
			const openProjects = sortProjects(projects.filter((project) => project.closed !== true));
			return {
				protocolVersion,
				projects: openProjects,
				recentProjects: sortProjects(recentProjects),
				hostPlatform: hostPlatform ?? null,
				hostAppVersion: hostAppVersion ?? null,
				...(config ? configPatch(config) : {}),
				...reconcileProjectNavigation(state, openProjects),
				...pruneExpandedProjects(state, openProjects),
				welcomeGeneration: state.welcomeGeneration + 1,
			};
		}),
	installProjectSnapshot: (projects, recentProjects) =>
		set((state) => {
			const openProjects = sortProjects(projects.filter((project) => project.closed !== true));
			return {
				projects: openProjects,
				recentProjects: sortProjects(recentProjects),
				...reconcileProjectNavigation(state, openProjects),
				...pruneExpandedProjects(state, openProjects),
			};
		}),
	applyProjectUpdated: (project) =>
		set((state) => {
			const projects =
				project.closed === true
					? state.projects.filter((candidate) => candidate.id !== project.id)
					: sortProjects(upsertProject(state.projects, project));
			return {
				projects,
				recentProjects: sortProjects(upsertProject(state.recentProjects, project)),
				...reconcileProjectNavigation(state, projects),
				...pruneExpandedProjects(state, projects),
			};
		}),
	setWorkspaces: (projectId, workspaces) =>
		set((s) => ({
			workspaces: {
				...s.workspaces,
				[projectId]: workspaces.filter((workspace) => !s.removedWorkspaceIds[workspace.id]),
			},
		})),
	addWorkspace: (workspace) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspace.id]) return {};
			const list = s.workspaces[workspace.projectId];
			if (!list) return {};
			return {
				workspaces: {
					...s.workspaces,
					[workspace.projectId]: list.some((w) => w.id === workspace.id)
						? list.map((w) => (w.id === workspace.id ? { ...w, ...workspace } : w))
						: [...list, workspace],
				},
			};
		}),
	updateWorkspace: (workspace) =>
		set((s) => {
			const list = s.workspaces[workspace.projectId];
			const previous = list?.find((w) => w.id === workspace.id);
			if (!list || !previous) return {};
			return {
				workspaces: {
					...s.workspaces,
					[workspace.projectId]: list.map((w) =>
						w.id === workspace.id
							? { ...workspace, ...(w.diffStats ? { diffStats: w.diffStats } : {}) }
							: w,
					),
				},
			};
		}),
	removeWorkspace: (projectId, workspaceId) =>
		set((s) => {
			const list = s.workspaces[projectId];
			if (!list) return {};
			return {
				workspaces: { ...s.workspaces, [projectId]: list.filter((w) => w.id !== workspaceId) },
			};
		}),
	applyWorkspaceRemoved: (projectId, workspaceId) => {
		const s = get();
		const wasActive = s.activeWorkspaceId === workspaceId;
		const fallbackWorkspace = wasActive ? recentWorkspaceFallback(s, workspaceId) : null;
		const name = s.workspaces[projectId]?.find((w) => w.id === workspaceId)?.name;
		set((state) => ({
			removedWorkspaceIds: Object.assign(Object.create(null), state.removedWorkspaceIds, {
				[workspaceId]: true,
			}) as Record<string, true>,
			workspaceSelectionHistory: state.workspaceSelectionHistory.filter((id) => id !== workspaceId),
			fsChangesByWorkspace: omitKey(state.fsChangesByWorkspace, workspaceId),
			diffScopeByWorkspace: omitKey(state.diffScopeByWorkspace, workspaceId),
			filesTreeByWorkspace: omitKey(state.filesTreeByWorkspace, workspaceId),
			changesRequest:
				state.changesRequest?.workspaceId === workspaceId ? null : state.changesRequest,
		}));
		s.removeWorkspace(projectId, workspaceId);
		s.clearWorkspaceTabs(workspaceId);
		if (wasActive) {
			if (fallbackWorkspace) set((state) => workspaceActivationPatch(state, fallbackWorkspace));
			else s.selectProject(projectId);
			toast.info(t("store.workspace.removed", { name: name ?? "?" }));
		}
	},
	selectProject: (selectedProjectId, opts) =>
		set((state) => ({
			selectedProjectId,
			activeWorkspaceId: null,
			...(opts?.reveal
				? { expandedProjectIds: withExpandedProject(state.expandedProjectIds, selectedProjectId) }
				: {}),
		})),
	toggleProjectExpanded: (projectId) =>
		set((state) => ({
			expandedProjectIds: state.expandedProjectIds[projectId]
				? omitKey(state.expandedProjectIds, projectId)
				: withExpandedProject(state.expandedProjectIds, projectId),
		})),
	expandProject: (projectId) =>
		set((state) => {
			const expandedProjectIds = withExpandedProject(state.expandedProjectIds, projectId);
			return expandedProjectIds === state.expandedProjectIds ? {} : { expandedProjectIds };
		}),
	hydrateExpandedProjects: (projectIds) =>
		set(() => ({
			expandedProjectIds: Object.fromEntries(projectIds.map((id) => [id, true as const])),
		})),
	selectMain: () =>
		set({
			selectedProjectId: null,
			activeWorkspaceId: null,
		}),
	activateWorkspace: (workspace) => {
		if (get().removedWorkspaceIds[workspace.id]) return;
		set((state) => workspaceActivationPatch(state, workspace));
	},
	activateWorkspaceFromRoute: (workspace) =>
		set((state) => {
			if (state.removedWorkspaceIds[workspace.id]) return {};
			const advanced = advanceCenterNavigation(state, workspace.id);
			return {
				...advanced.patch,
				...workspaceActivationPatch(state, workspace),
			};
		}),
	hydrateLocalLayoutState: (payload) => {
		set((state) =>
			state.layoutStateReady
				? {}
				: {
						workbenchFrame: payload.frame,
						workspaceViewsByWorkspace: payload.viewsByWorkspace,
						layoutDocumentsByWorkspace: payload.documentsByWorkspace,
						layoutAttentionByWorkspace: payload.attentionByWorkspace,
						localLayoutPreferences: payload.preferences,
						layoutStateReady: true,
					},
		);
	},
	applyLocalLayoutState: (payload, invalidateProjection = false) => {
		set((state) => ({
			workbenchFrame: payload.frame,
			workspaceViewsByWorkspace: payload.viewsByWorkspace,
			layoutDocumentsByWorkspace: payload.documentsByWorkspace,
			layoutAttentionByWorkspace: payload.attentionByWorkspace,
			localLayoutPreferences: payload.preferences,
			layoutProjectionEpoch: state.layoutProjectionEpoch + (invalidateProjection ? 1 : 0),
		}));
	},
	setLocalLayoutPreferences: (preferences) => set({ localLayoutPreferences: preferences }),
	setLayoutAttention: (workspaceId, attention) => {
		set((state) =>
			state.removedWorkspaceIds[workspaceId]
				? {}
				: {
						layoutAttentionByWorkspace: {
							...state.layoutAttentionByWorkspace,
							[workspaceId]: attention,
						},
					},
		);
	},
	syncLegacySelection: (workspaceId, selection) =>
		set((state) => {
			if (state.removedWorkspaceIds[workspaceId]) return {};
			if (selection?.kind === "terminal") {
				if (
					!state.terminalsByWorkspace[workspaceId]?.some(
						(terminal) => terminal.tabKey === selection.tabKey,
					)
				) {
					return {};
				}
				if (
					state.activeTerminalByWorkspace[workspaceId] === selection.tabKey &&
					state.activeTabByWorkspace[workspaceId] === null
				) {
					return {};
				}
				return {
					activeTerminalByWorkspace: {
						...state.activeTerminalByWorkspace,
						[workspaceId]: selection.tabKey,
					},
					activeTabByWorkspace: { ...state.activeTabByWorkspace, [workspaceId]: null },
				};
			}
			if (selection?.kind === "editor") {
				if (!state.tabsByWorkspace[workspaceId]?.some((tab) => tab.id === selection.tabId)) {
					return {};
				}
				if (
					state.activeTabByWorkspace[workspaceId] === selection.tabId &&
					state.activeTerminalByWorkspace[workspaceId] === null
				) {
					return {};
				}
				return {
					activeTabByWorkspace: {
						...state.activeTabByWorkspace,
						[workspaceId]: selection.tabId,
					},
					activeTerminalByWorkspace: {
						...state.activeTerminalByWorkspace,
						[workspaceId]: null,
					},
				};
			}
			if (
				state.activeTabByWorkspace[workspaceId] === null &&
				state.activeTerminalByWorkspace[workspaceId] === null
			) {
				return {};
			}
			return {
				activeTabByWorkspace: { ...state.activeTabByWorkspace, [workspaceId]: null },
				activeTerminalByWorkspace: {
					...state.activeTerminalByWorkspace,
					[workspaceId]: null,
				},
			};
		}),
	enqueueLayoutIntent: (intent) => {
		const id = randomId("layout-intent");
		set((state) =>
			state.removedWorkspaceIds[intent.workspaceId]
				? {}
				: { layoutIntents: [...state.layoutIntents, { ...intent, id } as LayoutIntent] },
		);
		return id;
	},
	consumeLayoutIntent: (id) =>
		set((state) => ({ layoutIntents: state.layoutIntents.filter((intent) => intent.id !== id) })),
	openTab: (tab, intent, syncLayout = true, options = {}) =>
		set((s) => {
			const wsId = tab.workspaceId;
			if (s.removedWorkspaceIds[wsId]) return {};
			const tabs = s.tabsByWorkspace[wsId] ?? [];
			const resolvedId = availableEditorTabId(tabs, tab);
			const resolvedTab = resolvedId === tab.id ? tab : { ...tab, id: resolvedId };
			const previewCompatible = isPreviewCompatibleTabKind(resolvedTab.kind);
			const effectiveIntent = previewCompatible ? intent : "keep";
			const claimPreview = previewCompatible && options.claimPreview === true;
			const preview = s.previewTabByWorkspace[wsId];
			const activeTabByWorkspace =
				options.activate === false
					? s.activeTabByWorkspace
					: { ...s.activeTabByWorkspace, [wsId]: resolvedTab.id };
			const openIntent: LayoutIntentInput = {
				kind: "open",
				workspaceId: wsId,
				tab: resolvedTab,
				intent: effectiveIntent,
				...layoutOpenIntentFields(claimPreview ? options : { ...options, claimPreview: false }),
			};
			const existingIndex = tabs.findIndex((candidate) => candidate.id === resolvedTab.id);
			if (existingIndex >= 0) {
				const existing = tabs[existingIndex];
				return {
					...(syncLayout
						? {
								layoutIntents: appendLayoutIntent(s.layoutIntents, openIntent),
							}
						: {}),
					tabsByWorkspace:
						existing === resolvedTab
							? s.tabsByWorkspace
							: { ...s.tabsByWorkspace, [wsId]: tabs.with(existingIndex, resolvedTab) },
					activeTabByWorkspace,
					previewTabByWorkspace:
						effectiveIntent === "keep" &&
						(preview === resolvedTab.id || (claimPreview && preview !== undefined))
							? omitKey(s.previewTabByWorkspace, wsId)
							: s.previewTabByWorkspace,
				};
			}
			const at =
				!s.layoutDocumentsByWorkspace[wsId] &&
				(effectiveIntent === "preview" || claimPreview) &&
				preview
					? tabs.findIndex((t) => t.id === preview)
					: -1;
			return {
				...(syncLayout
					? {
							layoutIntents: appendLayoutIntent(s.layoutIntents, openIntent),
						}
					: {}),
				tabsByWorkspace: {
					...s.tabsByWorkspace,
					[wsId]: at === -1 ? [...tabs, resolvedTab] : tabs.with(at, resolvedTab),
				},
				activeTabByWorkspace,
				previewTabByWorkspace:
					effectiveIntent === "preview"
						? { ...s.previewTabByWorkspace, [wsId]: resolvedTab.id }
						: claimPreview && preview
							? omitKey(s.previewTabByWorkspace, wsId)
							: s.previewTabByWorkspace,
			};
		}),
	openDoc: (tab) =>
		set((s) => {
			if (s.removedWorkspaceIds[tab.workspaceId]) return {};
			const tabs = s.tabsByWorkspace[tab.workspaceId] ?? [];
			const existing = tabs.find(
				(candidate) => editorResourceIdentity(candidate) === editorResourceIdentity(tab),
			);
			const id = availableEditorTabId(tabs, tab);
			const resolvedTab = id === tab.id ? tab : { ...tab, id };
			const navigation = advanceCenterNavigation(s, tab.workspaceId);
			return {
				...navigation.patch,
				layoutIntents: appendLayoutIntent(s.layoutIntents, {
					kind: "open",
					workspaceId: tab.workspaceId,
					tab: resolvedTab,
					intent: "keep",
					...(navigation.stamp ? { targetGroupId: navigation.stamp.groupId } : {}),
					navigation: navigation.stamp,
				}),
				tabsByWorkspace: {
					...s.tabsByWorkspace,
					[tab.workspaceId]: existing
						? tabs.map((candidate) => (candidate === existing ? resolvedTab : candidate))
						: [...tabs, resolvedTab],
				},
				activeTabByWorkspace: { ...s.activeTabByWorkspace, [tab.workspaceId]: resolvedTab.id },
			};
		}),
	closeTab: (id, syncLayout = true, countNavigation = true, workspaceId) =>
		set((s) => {
			const wsId = workspaceId ?? s.activeWorkspaceId;
			if (!wsId || s.removedWorkspaceIds[wsId]) return {};
			const tabs = (s.tabsByWorkspace[wsId] ?? []).filter((t) => t.id !== id);
			const wasActive = s.activeTabByWorkspace[wsId] === id;
			return {
				...(syncLayout
					? {
							layoutIntents: appendLayoutIntent(s.layoutIntents, {
								kind: "close",
								workspaceId: wsId,
								tabId: id,
							}),
						}
					: {}),
				tabsByWorkspace: { ...s.tabsByWorkspace, [wsId]: tabs },
				activeTabByWorkspace: {
					...s.activeTabByWorkspace,
					[wsId]: wasActive ? (tabs.at(-1)?.id ?? null) : (s.activeTabByWorkspace[wsId] ?? null),
				},
				navTickByWorkspace: wasActive && countNavigation ? bumpNav(s, wsId) : s.navTickByWorkspace,
				...(s.previewTabByWorkspace[wsId] === id
					? { previewTabByWorkspace: omitKey(s.previewTabByWorkspace, wsId) }
					: {}),
			};
		}),
	setActiveTab: (id, intent, syncLayout = true) =>
		set((s) => {
			const wsId = s.activeWorkspaceId;
			if (!wsId) return {};
			return {
				...(syncLayout
					? {
							layoutIntents: appendLayoutIntent(s.layoutIntents, {
								kind: "select",
								workspaceId: wsId,
								tabId: id,
								...(intent === "keep" ? { keep: true } : {}),
							}),
						}
					: {}),
				activeTabByWorkspace: { ...s.activeTabByWorkspace, [wsId]: id },
				navTickByWorkspace: bumpNav(s, wsId),
				...(intent === "keep" && s.previewTabByWorkspace[wsId] === id
					? { previewTabByWorkspace: omitKey(s.previewTabByWorkspace, wsId) }
					: {}),
			};
		}),
	beginCenterNavigation: (workspaceId, preferredGroupId) => {
		let stamp: CenterNavigationStamp | null = null;
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const advanced = advanceCenterNavigation(s, workspaceId, preferredGroupId);
			stamp = advanced.stamp;
			return advanced.patch;
		});
		return stamp;
	},
	noteNavigation: (workspaceId) =>
		set((s) =>
			s.removedWorkspaceIds[workspaceId] ? {} : { navTickByWorkspace: bumpNav(s, workspaceId) },
		),
	setTabRenderer: (workspaceId, id, rendererId) =>
		set((s) =>
			patchResourceTab(s, workspaceId, id, (tab) => {
				const next = { ...tab, rendererId };
				delete next.viewState;
				return next;
			}),
		),
	setTabViewState: (workspaceId, id, viewState) =>
		set((s) =>
			patchResourceTab(s, workspaceId, id, (tab) => {
				const next = { ...tab, viewState };
				if (viewState === undefined) delete next.viewState;
				return next;
			}),
		),
	setDiffTabView: (id, view) => set((s) => patchDiffTab(s, id, (tab) => ({ ...tab, view }))),
	setDiffTabIgnoreWhitespace: (id, ignoreWhitespace) =>
		set((s) =>
			patchDiffTab(s, id, (tab) => (isFileComparison(tab) ? tab : { ...tab, ignoreWhitespace })),
		),
	setChangesTabView: (workspaceId, id, view) =>
		set((s) => patchChangesTab(s, workspaceId, id, (tab) => ({ ...tab, view }))),
	setChangesTabIgnoreWhitespace: (workspaceId, id, ignoreWhitespace) =>
		set((s) => patchChangesTab(s, workspaceId, id, (tab) => ({ ...tab, ignoreWhitespace }))),
	setChangesTabViewed: (workspaceId, id, paths, viewed) =>
		set((s) =>
			recordChangesTabProgress(s, workspaceId, id, (tab) => {
				const next = new Set(tab.viewed);
				for (const path of typeof paths === "string" ? [paths] : paths) {
					if (viewed) next.add(path);
					else next.delete(path);
				}
				return next.size === tab.viewed.length ? tab : { ...tab, viewed: [...next] };
			}),
		),
	setChangesTabActivePath: (workspaceId, id, path) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) =>
				tab.activePath === path ? tab : { ...tab, activePath: path },
			),
		),
	setChangesTabCollapsed: (workspaceId, id, overrides) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) => {
				const collapsed = { ...tab.collapsed };
				for (const [path, value] of Object.entries(overrides)) {
					if (value === null) delete collapsed[path];
					else collapsed[path] = value;
				}
				return { ...tab, collapsed };
			}),
		),
	requestChangesTabReveal: (workspaceId, id, path) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) => ({
				...tab,
				reveal: { path, tick: (tab.reveal?.tick ?? 0) + 1 },
			})),
		),
	consumeChangesTabReveal: (workspaceId, id, target) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) => {
				if (!target) return tab.reveal ? { ...tab, reveal: null } : tab;
				return {
					...tab,
					reveal: null,
					activePath: target.path,
					collapsed:
						tab.collapsed[target.path] === false
							? tab.collapsed
							: { ...tab.collapsed, [target.path]: false },
				};
			}),
		),
	setChangesTabSectionRenderer: (workspaceId, id, path, rendererId) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) => ({
				...tab,
				sections: {
					...tab.sections,
					[path]: { ...tab.sections[path], rendererId, viewState: undefined },
				},
			})),
		),
	setChangesTabSectionViewState: (workspaceId, id, path, viewState) =>
		set((s) =>
			patchChangesTab(s, workspaceId, id, (tab) =>
				JSON.stringify(tab.sections[path]?.viewState) === JSON.stringify(viewState)
					? tab
					: {
							...tab,
							sections: { ...tab.sections, [path]: { ...tab.sections[path], viewState } },
						},
			),
		),
	setChangesTabHunkKept: (workspaceId, id, path, key, kept, hunkKeys) =>
		set((s) =>
			recordChangesTabProgress(s, workspaceId, id, (tab) => {
				const next = new Set(tab.kept[path] ?? []);
				if (next.has(key) === kept) return tab;
				if (kept) next.add(key);
				else next.delete(key);
				const completed = kept && hunkKeys.length > 0 && hunkKeys.every((hunk) => next.has(hunk));
				return {
					...tab,
					kept: { ...tab.kept, [path]: [...next] },
					viewed: completed && !tab.viewed.includes(path) ? [...tab.viewed, path] : tab.viewed,
				};
			}),
		),
	setChangesView: (view) => set({ changesView: view }),
	setFilesMode: (filesMode) => set({ filesMode }),
	hydrateFilesTree: (filesTreeByWorkspace) => set({ filesTreeByWorkspace }),
	setFilesTreeExpanded: (workspaceId, paths, expanded) =>
		set((s) =>
			patchFilesTreeView(s, workspaceId, (view) => {
				const next = withPathMembership(view.expanded, paths, expanded);
				return next === view.expanded ? view : { ...view, expanded: next };
			}),
		),
	revealInFiles: (workspaceId, path) =>
		set((s) =>
			patchFilesTreeView(s, workspaceId, (view) => {
				const expanded = withPathMembership(view.expanded, ancestorPaths(path), true);
				return expanded === view.expanded && view.seenActivePath === path
					? view
					: { ...view, expanded, seenActivePath: path };
			}),
		),
	collapseAllFiles: (workspaceId) =>
		set((s) =>
			patchFilesTreeView(s, workspaceId, (view) =>
				view.expanded.length === 0 ? view : { ...view, expanded: [] },
			),
		),
	setChangedTreeCollapsed: (workspaceId, paths, collapsed) =>
		set((s) =>
			patchFilesTreeView(s, workspaceId, (view) => {
				const next = withPathMembership(view.changedCollapsed, paths, collapsed);
				return next === view.changedCollapsed ? view : { ...view, changedCollapsed: next };
			}),
		),
	setFilesTreeScroll: (workspaceId, scrollView, top, scope) =>
		set((s) =>
			patchFilesTreeView(s, workspaceId, (view) => {
				const current = view.scroll[scrollView];
				if (current?.top === top && current.scope === scope) return view;
				return { ...view, scroll: { ...view.scroll, [scrollView]: { top, scope } } };
			}),
		),
	setChangesLayout: (changesLayout) => set({ changesLayout }),
	setDiffScope: (workspaceId, scope) =>
		set((s) =>
			s.removedWorkspaceIds[workspaceId]
				? {}
				: { diffScopeByWorkspace: { ...s.diffScopeByWorkspace, [workspaceId]: scope } },
		),
	noteFsChanged: (payload) =>
		set((s) => {
			if (s.removedWorkspaceIds[payload.workspaceId]) return {};
			const prev = s.fsChangesByWorkspace[payload.workspaceId];
			const tick = (prev?.tick ?? 0) + 1;
			return {
				fsChangesByWorkspace: {
					...s.fsChangesByWorkspace,
					[payload.workspaceId]: { tick, paths: payload.paths, truncated: payload.truncated },
				},
			};
		}),
	updateFileTabContent: (workspaceId, id, content, meta, tick) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const tabs = s.tabsByWorkspace[workspaceId] ?? [];
			if (!tabs.some((tab) => tab.id === id && tab.kind === "file")) return {};
			return {
				tabsByWorkspace: {
					...s.tabsByWorkspace,
					[workspaceId]: tabs.map((tab) =>
						tab.id === id && tab.kind === "file"
							? {
									...tab,
									content,
									...(meta === undefined ? {} : { meta }),
									loadedTick: tick,
								}
							: tab,
					),
				},
			};
		}),
	updateDiffTabContent: (
		workspaceId,
		id,
		original,
		modified,
		meta,
		originalOid,
		tick,
		loadedTarget,
	) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const tabs = s.tabsByWorkspace[workspaceId] ?? [];
			if (!tabs.some((tab) => tab.id === id && tab.kind === "diff")) return {};
			return {
				tabsByWorkspace: {
					...s.tabsByWorkspace,
					[workspaceId]: tabs.map((tab) =>
						tab.id === id && tab.kind === "diff"
							? {
									...tab,
									original,
									modified,
									...(meta === undefined ? {} : { meta }),
									...(originalOid === undefined ? {} : { originalOid }),
									loadedTick: tick,
									loadedTarget,
								}
							: tab,
					),
				},
			};
		}),
	clearWorkspaceTabs: (workspaceId) =>
		set((s) => ({
			workspaceViewsByWorkspace: omitKey(s.workspaceViewsByWorkspace, workspaceId),
			layoutDocumentsByWorkspace: omitKey(s.layoutDocumentsByWorkspace, workspaceId),
			layoutAttentionByWorkspace: omitKey(s.layoutAttentionByWorkspace, workspaceId),
			layoutIntents: s.layoutIntents.filter((intent) => intent.workspaceId !== workspaceId),
			tabsByWorkspace: omitKey(s.tabsByWorkspace, workspaceId),
			activeTabByWorkspace: omitKey(s.activeTabByWorkspace, workspaceId),
			previewTabByWorkspace: omitKey(s.previewTabByWorkspace, workspaceId),
			navTickByWorkspace: omitKey(s.navTickByWorkspace, workspaceId),
			terminalsByWorkspace: omitKey(s.terminalsByWorkspace, workspaceId),
			activeTerminalByWorkspace: omitKey(s.activeTerminalByWorkspace, workspaceId),
		})),
	addTerminal: (
		workspaceId,
		initialCommand,
		targetGroupId,
		targetArea = "center",
		reveal = true,
		requestedTabKey,
		newPaneBelow = false,
	) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const list = s.terminalsByWorkspace[workspaceId] ?? [];
			const tabKey = requestedTabKey ?? randomId("terminal");
			if (list.some((tab) => tab.tabKey === tabKey)) return {};
			const navigation =
				targetGroupId && targetArea === "center"
					? advanceCenterNavigation(s, workspaceId, targetGroupId)
					: null;
			const tab: TerminalTab = {
				tabKey,
				workspaceId,
				title: nextTerminalTitle(list),
				reservationPending: true,
				...(initialCommand ? { initialCommand } : {}),
			};
			return {
				...(navigation?.patch ?? {}),
				layoutIntents: appendLayoutIntent(s.layoutIntents, {
					kind: "place-terminal",
					workspaceId,
					tabKey,
					title: tab.title,
					...(targetGroupId
						? {
								targetGroupId,
								...(targetArea !== "center" ? { targetArea } : {}),
								...(targetArea !== "center" && newPaneBelow ? { newPaneBelow: true as const } : {}),
								...(targetArea === "center" ? { navigation: navigation?.stamp ?? null } : {}),
							}
						: {}),
					...(reveal ? {} : { reveal: false as const }),
				}),
				terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: [...list, tab] },
				activeTerminalByWorkspace: { ...s.activeTerminalByWorkspace, [workspaceId]: tabKey },
			};
		}),
	setWorkspaceTerminals: (workspaceId, tabs) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const local = s.terminalsByWorkspace[workspaceId] ?? [];
			const known = new Set(tabs.map((tab) => tab.tabKey));
			const pending = local.filter((tab) => !known.has(tab.tabKey) && tab.reservationPending);
			const merged: TerminalTab[] = [
				...tabs.map((tab) => {
					const existing = local.find((candidate) => candidate.tabKey === tab.tabKey);
					return {
						tabKey: tab.tabKey,
						workspaceId,
						title: tab.title,
						...(existing?.initialCommand ? { initialCommand: existing.initialCommand } : {}),
					};
				}),
				...pending,
			];
			const active = s.activeTerminalByWorkspace[workspaceId] ?? null;
			const activeSurvives = merged.some((tab) => tab.tabKey === active);
			return {
				terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: merged },
				activeTerminalByWorkspace: {
					...s.activeTerminalByWorkspace,
					[workspaceId]: activeSurvives ? active : (merged.at(-1)?.tabKey ?? null),
				},
			};
		}),
	confirmTerminalReservation: (workspaceId, tabKey) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const list = s.terminalsByWorkspace[workspaceId] ?? [];
			if (!list.some((tab) => tab.tabKey === tabKey && tab.reservationPending)) return s;
			return {
				terminalsByWorkspace: {
					...s.terminalsByWorkspace,
					[workspaceId]: list.map(({ reservationPending, ...rest }) =>
						rest.tabKey === tabKey
							? rest
							: { ...rest, ...(reservationPending ? { reservationPending } : {}) },
					),
				},
			};
		}),
	rejectTerminalReservation: (workspaceId, tabKey) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const list = s.terminalsByWorkspace[workspaceId] ?? [];
			if (!list.some((tab) => tab.tabKey === tabKey && tab.reservationPending)) return s;
			const terminals = list.filter((tab) => tab.tabKey !== tabKey);
			const active = s.activeTerminalByWorkspace[workspaceId] ?? null;
			return {
				terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: terminals },
				activeTerminalByWorkspace: {
					...s.activeTerminalByWorkspace,
					[workspaceId]: active === tabKey ? (terminals.at(-1)?.tabKey ?? null) : active,
				},
				layoutIntents: s.layoutIntents.filter(
					(intent) =>
						intent.kind !== "place-terminal" ||
						intent.workspaceId !== workspaceId ||
						intent.tabKey !== tabKey,
				),
			};
		}),
	consumeTerminalInitialCommand: (workspaceId, tabKey) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const list = s.terminalsByWorkspace[workspaceId] ?? [];
			if (!list.some((t) => t.tabKey === tabKey && t.initialCommand)) return s;
			return {
				terminalsByWorkspace: {
					...s.terminalsByWorkspace,
					[workspaceId]: list.map(({ initialCommand, ...rest }) =>
						rest.tabKey === tabKey
							? rest
							: { ...rest, ...(initialCommand ? { initialCommand } : {}) },
					),
				},
			};
		}),
	closeTerminalTab: (workspaceId, tabKey, syncLayout = true) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const list = (s.terminalsByWorkspace[workspaceId] ?? []).filter((t) => t.tabKey !== tabKey);
			const wasActive = s.activeTerminalByWorkspace[workspaceId] === tabKey;
			return {
				...(syncLayout
					? {
							layoutIntents: appendLayoutIntent(s.layoutIntents, {
								kind: "close-terminal",
								workspaceId,
								tabKey,
							}),
						}
					: {}),
				terminalsByWorkspace: { ...s.terminalsByWorkspace, [workspaceId]: list },
				activeTerminalByWorkspace: {
					...s.activeTerminalByWorkspace,
					[workspaceId]: wasActive
						? (list.at(-1)?.tabKey ?? null)
						: (s.activeTerminalByWorkspace[workspaceId] ?? null),
				},
			};
		}),
	setActiveTerminalTab: (workspaceId, tabKey, syncLayout = true) =>
		set((s) =>
			s.removedWorkspaceIds[workspaceId]
				? {}
				: {
						...(syncLayout
							? {
									layoutIntents: appendLayoutIntent(s.layoutIntents, {
										kind: "select-terminal",
										workspaceId,
										tabKey,
									}),
								}
							: {}),
						activeTerminalByWorkspace: { ...s.activeTerminalByWorkspace, [workspaceId]: tabKey },
					},
		),
	beginWorktreeCreation: (projectId) =>
		set((s) => ({
			worktreeCreationsByProject: {
				...s.worktreeCreationsByProject,
				[projectId]: (s.worktreeCreationsByProject[projectId] ?? 0) + 1,
			},
		})),
	endWorktreeCreation: (projectId) =>
		set((s) => {
			const remaining = (s.worktreeCreationsByProject[projectId] ?? 0) - 1;
			return {
				worktreeCreationsByProject:
					remaining > 0
						? { ...s.worktreeCreationsByProject, [projectId]: remaining }
						: omitKey(s.worktreeCreationsByProject, projectId),
			};
		}),
	openSettings: (section = SettingsSection.Appearance) =>
		set({ settingsOpen: true, settingsSection: section }),
	closeSettings: () => set({ settingsOpen: false }),
	setSettingsSection: (section) => set({ settingsSection: section }),
	applyConfig: (config) => set(configPatch(config)),
	requestToolView: (workspaceId, tool) =>
		set((state) =>
			state.removedWorkspaceIds[workspaceId]
				? {}
				: {
						layoutIntents: appendLayoutIntent(state.layoutIntents, {
							kind: "reveal-tool",
							workspaceId,
							tool,
						}),
					},
		),
	requestChangesView: (workspaceId, path, scope) =>
		set((s) => {
			if (s.removedWorkspaceIds[workspaceId]) return {};
			const advanced = advanceCenterNavigation(s, workspaceId);
			return {
				...revealChangedFilesPatch(s, workspaceId),
				changesRequest: {
					workspaceId,
					path,
					navTick: selectWorkspaceNavTick(s, workspaceId) + 1,
					navigation: advanced.stamp,
				},
				...(scope
					? { diffScopeByWorkspace: { ...s.diffScopeByWorkspace, [workspaceId]: scope } }
					: {}),
				...advanced.patch,
			};
		}),
	revealChanges: (workspaceId) =>
		set((s) => (s.removedWorkspaceIds[workspaceId] ? {} : revealChangedFilesPatch(s, workspaceId))),
	clearChangesRequest: () => set({ changesRequest: null }),
	pushToast: (toast) => {
		const twin = get().toasts.find(
			(t) =>
				!t.action &&
				!toast.action &&
				t.variant === toast.variant &&
				t.title === toast.title &&
				t.message === toast.message &&
				t.durationMs === toast.durationMs,
		);
		if (twin) return twin.id;
		const id = crypto.randomUUID();
		set((s) => {
			const next = [...s.toasts, { ...toast, id }];
			let actionlessToDrop = Math.max(0, next.length - MAX_TOASTS);
			return {
				toasts: next.filter((candidate) => {
					if (candidate.action || actionlessToDrop === 0) return true;
					actionlessToDrop -= 1;
					return false;
				}),
			};
		});
		return id;
	},
	dismissToast: (id) =>
		set((s) =>
			s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : {},
		),
}));

export const toast = {
	error: (message: string, title?: string) =>
		useAppStore.getState().pushToast({ variant: "error", message, ...(title ? { title } : {}) }),
	success: (message: string, title?: string) =>
		useAppStore.getState().pushToast({ variant: "success", message, ...(title ? { title } : {}) }),
	info: (message: string, title?: string) =>
		useAppStore.getState().pushToast({ variant: "info", message, ...(title ? { title } : {}) }),
	warning: (message: string, title?: string) =>
		useAppStore.getState().pushToast({ variant: "warning", message, ...(title ? { title } : {}) }),
};
