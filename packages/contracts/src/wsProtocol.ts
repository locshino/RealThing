import type {
	AppConfig,
	AppConfigUpdate,
	BranchList,
	ChangeReceipt,
	DiffStats,
	EditorInfo,
	ExistingWorktreeCandidate,
	FileNode,
	GitCommit,
	GitDiffScope,
	GitStatus,
	LocalLocalesSnapshot,
	PathSuggestionsResult,
	Project,
	ProjectPathStatus,
	ResourceMeta,
	RevertTarget,
	TodoItem,
	TodoPlan,
	TodoStatus,
	UserThemesSnapshot,
	Workspace,
} from "./domain";

export interface TerminalDataPush {
	id: string;
	data: string;
	truncated?: boolean;
}

export interface TerminalExitPush {
	id: string;
	exitCode: number;
}

export interface TerminalDetachedPush {
	workspaceId: string;
	tabKey: string;
}

export const INITIAL_TERMINAL_TAB_KEY = "realthing-initial";

export interface TerminalTabInfo {
	tabKey: string;
	title: string;
}

export interface TerminalTabsPush {
	workspaceId: string;
	tabs: TerminalTabInfo[];
}

export const PROTOCOL_VERSION = 95;
export const PROJECT_CLONE_PROTOCOL_VERSION = 95;
export const LAYOUT_PLAN_PRESET_PROTOCOL_VERSION = 94;
export const USER_THEMES_PROTOCOL_VERSION = 92;
export const LOCALES_PROTOCOL_VERSION = 89;
export const PROJECT_RENAME_PROTOCOL_VERSION = 85;
export const CHANGE_MUTATIONS_PROTOCOL_VERSION = 75;
export const RESOURCE_META_PROTOCOL_VERSION = 75;
export const WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION = 62;
export const THEME_SYSTEM_PROTOCOL_VERSION = 58;
export const WORKSPACE_RENAME_PROTOCOL_VERSION = 55;

export type HostPlatform = "darwin" | "linux" | "win32";

export interface ServerWelcome {
	protocolVersion: number;
	appVersion?: string;
	hostPlatform?: HostPlatform;
	projects: Project[];
	recentProjects: Project[];
	config: AppConfig;
}

export interface WorkspaceRemoved {
	projectId: string;
	id: string;
}

export const WS_METHODS = {
	projectOpen: "project.open",
	projectList: "project.list",
	projectClose: "project.close",
	projectRename: "project.rename",
	projectInspect: "project.inspect",
	projectSuggestPaths: "project.suggestPaths",
	projectInit: "project.init",
	projectCreate: "project.create",
	projectCloneDestination: "project.cloneDestination",
	projectClone: "project.clone",
	projectCancelClone: "project.cancelClone",
	workspaceCreate: "workspace.create",
	workspaceRename: "workspace.rename",
	workspaceListExisting: "workspace.listExisting",
	workspaceOpenExisting: "workspace.openExisting",
	workspaceList: "workspace.list",
	workspaceBranchStatus: "workspace.branchStatus",
	workspacePush: "workspace.push",
	workspaceDeleteRemoteBranch: "workspace.deleteRemoteBranch",
	workspaceRemove: "workspace.remove",
	workspaceDiffStats: "workspace.diffStats",
	workspaceSetDiffBase: "workspace.setDiffBase",
	workspaceWatchReady: "workspace.watchReady",
	workspaceOpenIn: "workspace.openIn",
	workspaceReveal: "workspace.reveal",
	editorList: "editor.list",
	gitListBranches: "git.listBranches",
	gitPrefetch: "git.prefetch",
	fsReadDir: "fs.readDir",
	fsReadFile: "fs.readFile",
	fsWriteFile: "fs.writeFile",
	todoList: "todo.list",
	todoAdd: "todo.add",
	todoUpdate: "todo.update",
	todoRemove: "todo.remove",
	gitStatus: "git.status",
	gitDiffFile: "git.diffFile",
	gitListCommits: "git.listCommits",
	changeRevert: "change.revert",
	changeUndo: "change.undo",
	terminalReserve: "terminal.reserve",
	terminalAttach: "terminal.attach",
	terminalList: "terminal.list",
	terminalWrite: "terminal.write",
	terminalResize: "terminal.resize",
	terminalClose: "terminal.close",
	dialogSelectDirectory: "dialog.selectDirectory",
	localesList: "locales.list",
	localesReveal: "locales.reveal",
	themesList: "themes.list",
	themesReveal: "themes.reveal",
	settingsUpdate: "settings.update",
} as const;

export const WS_CHANNELS = {
	serverWelcome: "server.welcome",
	projectUpdated: "project.updated",
	terminalData: "terminal.data",
	terminalExit: "terminal.exit",
	terminalDetached: "terminal.detached",
	terminalTabs: "terminal.tabs",
	workspaceCreated: "workspace.created",
	workspaceUpdated: "workspace.updated",
	workspaceRemoved: "workspace.removed",
	workspaceFsChanged: "workspace.fsChanged",
	settingsChanged: "settings.changed",
	localesChanged: "locales.changed",
	themesChanged: "themes.changed",
} as const;

type SameUnion<A extends B, B extends C, C = A> = A;
export type WsChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

export interface Ack {
	ok: true;
}

export interface WorkspaceWatchReadyResult {
	startupNudge: boolean;
}

export interface WsMethodMap {
	"project.open": {
		params: { path: string; allowNonGit?: boolean; gitFolders?: string[] };
		result: Project;
	};
	"project.list": { params: Record<string, never>; result: Project[] };
	"project.close": { params: { id: string }; result: Ack };
	"project.rename": { params: { id: string; name: string }; result: Project };
	"project.inspect": { params: { path: string }; result: ProjectPathStatus };
	"project.suggestPaths": { params: { query: string }; result: PathSuggestionsResult };
	"project.init": { params: { path: string }; result: Project };
	"project.create": {
		params: { parentPath: string; name: string; displayName?: string };
		result: Project;
	};
	"project.cloneDestination": {
		params: { parentPath: string; name: string };
		result: { path: string };
	};
	"project.clone": {
		params: { operationId: string; url: string; parentPath: string; name: string; depth?: number };
		result: Project | null;
	};
	"project.cancelClone": { params: { operationId: string }; result: Ack };
	"workspace.create": {
		params: { projectId: string; name?: string; baseRef?: string };
		result: Workspace;
	};
	"workspace.rename": { params: { id: string; name: string }; result: Workspace };
	"workspace.listExisting": {
		params: { projectId: string };
		result: ExistingWorktreeCandidate[];
	};
	"workspace.openExisting": {
		params: { projectId: string; path: string };
		result: Workspace;
	};
	"workspace.list": {
		params: { projectId: string; includeDiffStats?: boolean };
		result: Workspace[];
	};
	"workspace.branchStatus": {
		params: { workspaceId: string; allowCached?: boolean; skipFetch?: boolean };
		result: {
			hasOrigin: boolean;
			pushesElsewhere: boolean;
			published: boolean | null;
			ahead?: number;
			behind?: number;
			aheadOfBase: number;
			onBase: boolean;
		};
	};
	"workspace.push": {
		params: { workspaceId: string; branch: string; confirmBase?: boolean };
		result: { dirtyFiles: number };
	};
	"workspace.deleteRemoteBranch": {
		params: { workspaceId: string; branch: string };
		result: Ack;
	};
	"workspace.remove": { params: { id: string }; result: Ack };
	"workspace.diffStats": { params: { id: string }; result: DiffStats };
	"workspace.setDiffBase": { params: { id: string; ref: string | null }; result: Workspace };
	"workspace.watchReady": {
		params: { workspaceId: string; prewarm?: boolean };
		result: WorkspaceWatchReadyResult;
	};
	"workspace.openIn": { params: { id: string; editor: string }; result: Ack };
	"workspace.reveal": { params: { id: string }; result: Ack };
	"editor.list": { params: Record<string, never>; result: EditorInfo[] };
	"git.listBranches": { params: { projectId: string }; result: BranchList };
	"git.prefetch": { params: { projectId: string; ref: string }; result: { ok: boolean } };
	"fs.readDir": { params: { workspaceId: string; path: string }; result: FileNode[] };
	"fs.readFile": {
		params: { workspaceId: string; path: string };
		result: { content: string; meta: ResourceMeta };
	};
	"fs.writeFile": {
		params: { workspaceId: string; path: string; content: string; expectedHash?: string };
		result: { meta: ResourceMeta };
	};
	"todo.list": {
		params: { workspaceId: string; opened?: "page" | "rail" };
		result: TodoPlan;
	};
	"todo.add": {
		params: {
			workspaceId: string;
			title: string;
			note?: string;
			surface?: "page" | "rail";
		};
		result: TodoItem;
	};
	"todo.update": {
		params: {
			workspaceId: string;
			id: string;
			status?: TodoStatus;
			title?: string;
			note?: string;
		};
		result: TodoItem;
	};
	"todo.remove": { params: { workspaceId: string; id: string }; result: Ack };
	"git.status": { params: { workspaceId: string; scope?: GitDiffScope }; result: GitStatus };
	"git.diffFile": {
		params: { workspaceId: string; path: string; scope?: GitDiffScope };
		result: {
			original: string;
			modified: string;
			originalOid: string | null;
			meta: { original: ResourceMeta; modified: ResourceMeta };
		};
	};
	"git.listCommits": { params: { workspaceId: string }; result: { commits: GitCommit[] } };
	"change.revert": {
		params: {
			workspaceId: string;
			path: string;
			scope: GitDiffScope;
			target: RevertTarget;
			expect: { originalHash: string | null; modifiedHash: string | null };
		};
		result: { receipt: ChangeReceipt };
	};
	"change.undo": {
		params: { workspaceId: string; receiptId: string; expect: { modifiedHash: string | null } };
		result: { receipt: ChangeReceipt };
	};
	"terminal.reserve": {
		params: { workspaceId: string; tabKey: string; title: string };
		result: { tab: TerminalTabInfo };
	};
	"terminal.attach": {
		params: { workspaceId: string; tabKey: string; title?: string; cols?: number; rows?: number };
		result: { id: string; created: boolean; replay?: string };
	};
	"terminal.list": {
		params: { workspaceId: string };
		result: { tabs: TerminalTabInfo[] };
	};
	"terminal.write": { params: { id: string; data: string }; result: Ack };
	"terminal.resize": { params: { id: string; cols: number; rows: number }; result: Ack };
	"terminal.close": {
		params: { workspaceId: string; tabKey: string; force?: boolean };
		result: { closed: boolean; busy: boolean };
	};
	"dialog.selectDirectory": { params: Record<string, never>; result: { path: string | null } };
	"locales.list": { params: Record<string, never>; result: LocalLocalesSnapshot };
	"locales.reveal": { params: Record<string, never>; result: Ack };
	"themes.list": { params: Record<string, never>; result: UserThemesSnapshot };
	"themes.reveal": { params: Record<string, never>; result: Ack };
	"settings.update": { params: { config: AppConfigUpdate }; result: AppConfig };
}

export type WsMethodName = SameUnion<
	keyof WsMethodMap,
	(typeof WS_METHODS)[keyof typeof WS_METHODS]
>;
export type WsParams<M extends WsMethodName> = WsMethodMap[M]["params"];
export type WsResult<M extends WsMethodName> = WsMethodMap[M]["result"];

export interface WsRequest<M extends WsMethodName = WsMethodName> {
	id: string;
	method: M;
	params: WsParams<M>;
}

export interface WsAck {
	ack: string[];
}

export interface WsResume {
	resume: string[];
}

export type WsClientMessage = WsRequest | WsAck | WsResume;

export type WsErrorCode =
	| "UNKNOWN_COMMIT"
	| "PUSH_AUTH_FAILED"
	| "NOT_GIT"
	| "ALREADY_OPEN"
	| "PROJECT_CLONE_INVALID"
	| "PROJECT_CLONE_FAILED"
	| "PROJECT_CLONE_CLEANUP_FAILED"
	| "RESOURCE_UNAVAILABLE"
	| "STALE_VIEW"
	| "SCOPE_IMMUTABLE"
	| "RANGE_INVALID"
	| "RECEIPT_UNKNOWN"
	| "UNSUPPORTED_CHANGE";

export interface WsResponse {
	id: string;
	ok: boolean;
	result?: unknown;
	error?: string;
	errorCode?: WsErrorCode;
}

export interface WsPush {
	channel: WsChannel;
	data: unknown;
}

export type WsServerMessage = WsResponse | WsPush;
