export function clampToCodePoints(text: string, maxUnits: number): string {
	if (text.length <= maxUnits) return text;
	const last = text.charCodeAt(maxUnits - 1);
	return text.slice(0, last >= 0xd800 && last <= 0xdbff ? maxUnits - 1 : maxUnits);
}

export interface Project {
	id: string;
	name: string;
	path: string;
	slug: string;
	lastOpened: number;
	closed?: true;
}

export interface PathCandidate {
	name: string;
	path: string;
	kind: "repo" | "directory";
}

export type ProjectPathStatus = {
	kind: "repo" | "initable" | "missing" | "notDirectory";
	gitFolders?: PathCandidate[];
};

export interface PathSuggestionsResult {
	parent: string;
	candidates: PathCandidate[];
}

export interface DiffStats {
	added: number;
	removed: number;
}

export const DEFAULT_WORKSPACE_NAME = "Default";

export interface Workspace {
	id: string;
	projectId: string;
	kind?: "default" | "external";
	name: string;
	branch: string;
	worktreePath: string;
	baseBranch: string;
	diffBase?: string;
	renamed?: boolean;
	initialTerminalPending?: true;
	diffStats?: DiffStats;
}

export type ExistingWorktreeCandidate =
	| { path: string; branch: string; status: "available" }
	| { path: string; status: "detached" };

export interface EditorInfo {
	id: string;
	label: string;
	kind: "gui" | "terminal";
}

export interface WorkspaceFsChangedPayload {
	workspaceId: string;
	paths: string[];
	truncated: boolean;
}

export type FileKind = "file" | "dir";

export interface FileNode {
	path: string;
	name: string;
	kind: FileKind;
	gitignored?: boolean;
	children?: FileNode[];
}

export interface ResourceMeta {
	hash: string | null;
	byteLength: number | null;
	text: boolean;
	mime?: string;
}

export type TodoStatus = "pending" | "in_progress" | "done";
export type TodoOrigin = "user" | "adopted";

export type TodoArtifactKind = "file" | "change" | "commit";

export interface TodoArtifact {
	kind: TodoArtifactKind;
	path?: string;
	label?: string;
	sha?: string;
	files?: GitFileChange[];
}

export interface TodoItem {
	id: string;
	title: string;
	status: TodoStatus;
	origin: TodoOrigin;
	note?: string;
	summary?: string;
	verification?: string;
	commitSubject?: string;
	artifacts?: TodoArtifact[];
	createdAt: string;
	updatedAt: string;
}

export type TodoGroupStatus = "pending" | "active" | "done";

export interface TodoGroupItem {
	id: string;
	title: string;
	todos: TodoItem[];
	status: TodoGroupStatus;
}

export interface TodoPlan {
	todos: TodoItem[];
	groups: TodoGroupItem[];
	summary?: string;
	unattributed?: GitFileChange[];
	adoptedCommits?: TodoItem[];
}

export type GitFileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface GitFileChange {
	path: string;
	status: GitFileStatus;
	added?: number;
	removed?: number;
}

export interface GitStatus {
	branch: string;
	changes: GitFileChange[];
}

export type GitDiffScope =
	| { kind: "branch" }
	| { kind: "uncommitted" }
	| { kind: "commit"; sha: string }
	| { kind: "pinned"; baseRef: string };

export interface GitCommit {
	sha: string;
	shortSha: string;
	subject: string;
	author: string;
	committedAt: string;
}

export interface LineSpan {
	start: number;
	count: number;
}

export type RevertTarget =
	| { kind: "file" }
	| { kind: "range"; original: LineSpan; modified: LineSpan };

export interface ChangeReceipt {
	id: string;
	workspaceId: string;
	path: string;
	kind: "revert" | "undo";
	at: number;
	before: { hash: string | null; byteLength: number | null; mode: number | null };
	after: { hash: string | null; byteLength: number | null; mode: number | null };
	trashed?: string;
}

export interface RemoteBranchGroup {
	remote: string | null;
	branches: { ref: string; branch: string }[];
}

export interface BranchList {
	local: string[];
	remote: string[];
	remoteGroups?: RemoteBranchGroup[];
	defaultBranch: string;
}

export type ThemeId = string;

export const THEME_MODES = ["fixed", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export interface SystemThemePair {
	light: ThemeId;
	dark: ThemeId;
}

export interface ThemePreference {
	theme: ThemeId;
	themeMode: ThemeMode;
	systemThemePair?: SystemThemePair;
}

export function isThemeMode(value: unknown): value is ThemeMode {
	return THEME_MODES.some((mode) => mode === value);
}

export function isSystemThemePair(value: unknown): value is SystemThemePair {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof Reflect.get(value, "light") === "string" &&
		typeof Reflect.get(value, "dark") === "string"
	);
}

export type LayoutToolId = "projects" | "files" | "plan";

export type LayoutBottomAlignment = "center" | "center-left" | "center-right" | "full";

export interface LayoutPresetCenterGroup {
	kind: "group";
	id: string;
}
export interface LayoutPresetCenterSplit {
	kind: "split";
	id: string;
	direction: "horizontal" | "vertical";
	weights: [number, number];
	children: [LayoutPresetCenterNode, LayoutPresetCenterNode];
}
export type LayoutPresetCenterNode = LayoutPresetCenterGroup | LayoutPresetCenterSplit;

export interface LayoutPresetSideGroup {
	id: string;
	weight: number;
	folded: boolean;
	tools: LayoutToolId[];
}
export interface LayoutPresetSideRegion {
	visible: boolean;
	width: number;
	groups: LayoutPresetSideGroup[];
}

export interface LayoutPresetBottomGroup {
	id: string;
	weight: number;
	folded: boolean;
	tools: LayoutToolId[];
}

export interface LayoutPresetBottomRegion {
	visible: boolean;
	height: number;
	alignment: LayoutBottomAlignment;
	groups: LayoutPresetBottomGroup[];
}

export interface LayoutPreset {
	id: string;
	name: string;
	center: LayoutPresetCenterNode;
	left: LayoutPresetSideRegion;
	right: LayoutPresetSideRegion;
	bottom: LayoutPresetBottomRegion;
}

export const LINE_WIDTH_COLUMNS = { min: 40, max: 240, default: 120 } as const;

export function isLineWidth(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= LINE_WIDTH_COLUMNS.min &&
		value <= LINE_WIDTH_COLUMNS.max
	);
}

export const EDITOR_FONT_SIZE = { min: 9, max: 32, default: 11 } as const;
export const EDITOR_TAB_SIZES = [2, 4, 8] as const;
export type EditorTabSize = (typeof EDITOR_TAB_SIZES)[number];
export const EDITOR_LINE_NUMBERS = ["on", "off", "relative"] as const;
export type EditorLineNumbersMode = (typeof EDITOR_LINE_NUMBERS)[number];
export const EDITOR_RENDER_WHITESPACE = ["none", "boundary", "selection", "all"] as const;
export type EditorRenderWhitespace = (typeof EDITOR_RENDER_WHITESPACE)[number];
export const EDITOR_CURSOR_STYLES = ["line", "block", "underline"] as const;
export type EditorCursorStyle = (typeof EDITOR_CURSOR_STYLES)[number];
export const EDITOR_AUTO_SAVE_DELAY_MS = { min: 0, max: 10000, default: 700 } as const;

export const EXPLORER_SORT_ORDERS = ["default", "mixed", "filesFirst", "type"] as const;
export type ExplorerSortOrder = (typeof EXPLORER_SORT_ORDERS)[number];
export const EXPLORER_FILE_ICONS = ["minimal", "filetype"] as const;
export type ExplorerFileIconsMode = (typeof EXPLORER_FILE_ICONS)[number];
export const DEFAULT_FILES_EXCLUDE = [".git", "node_modules", ".DS_Store"] as const;

export const TERMINAL_FONT_SIZE = { min: 9, max: 32, default: 13 } as const;
export const TERMINAL_CURSOR_STYLES = ["block", "underline", "bar"] as const;
export type TerminalCursorStyle = (typeof TERMINAL_CURSOR_STYLES)[number];
export const TERMINAL_SCROLLBACK_LINES = { min: 500, max: 50000, default: 5000 } as const;

export const GIT_COMMIT_LIST_MAX = { min: 50, max: 1000, default: 200 } as const;
export const PROJECT_SETTINGS_PATH = ".realthing/settings.json";

export function isEditorFontSize(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= EDITOR_FONT_SIZE.min &&
		value <= EDITOR_FONT_SIZE.max
	);
}

export function isEditorTabSize(value: unknown): value is EditorTabSize {
	return EDITOR_TAB_SIZES.some((size) => size === value);
}

export function isEditorLineNumbers(value: unknown): value is EditorLineNumbersMode {
	return EDITOR_LINE_NUMBERS.some((mode) => mode === value);
}

export function isEditorRenderWhitespace(value: unknown): value is EditorRenderWhitespace {
	return EDITOR_RENDER_WHITESPACE.some((mode) => mode === value);
}

export function isEditorCursorStyle(value: unknown): value is EditorCursorStyle {
	return EDITOR_CURSOR_STYLES.some((style) => style === value);
}

export function isEditorAutoSaveDelayMs(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= EDITOR_AUTO_SAVE_DELAY_MS.min &&
		value <= EDITOR_AUTO_SAVE_DELAY_MS.max
	);
}

export function isExplorerSortOrder(value: unknown): value is ExplorerSortOrder {
	return EXPLORER_SORT_ORDERS.some((order) => order === value);
}

export function isExplorerFileIcons(value: unknown): value is ExplorerFileIconsMode {
	return EXPLORER_FILE_ICONS.some((mode) => mode === value);
}

export function isFilesExcludeList(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= 128 &&
		value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200)
	);
}

export function isStringMap(value: unknown, maxEntries = 128): value is Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const entries = Object.entries(value);
	if (entries.length > maxEntries) return false;
	return entries.every(
		([k, v]) =>
			typeof k === "string" &&
			k.trim().length > 0 &&
			k.length <= 100 &&
			typeof v === "string" &&
			v.length <= 200,
	);
}

export function isTerminalFontSize(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= TERMINAL_FONT_SIZE.min &&
		value <= TERMINAL_FONT_SIZE.max
	);
}

export function isTerminalCursorStyle(value: unknown): value is TerminalCursorStyle {
	return TERMINAL_CURSOR_STYLES.some((style) => style === value);
}

export function isTerminalScrollbackLines(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= TERMINAL_SCROLLBACK_LINES.min &&
		value <= TERMINAL_SCROLLBACK_LINES.max
	);
}

export function isTerminalShellArgs(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= 32 &&
		value.every((arg) => typeof arg === "string" && arg.length <= 200)
	);
}

export function isGitCommitListMax(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= GIT_COMMIT_LIST_MAX.min &&
		value <= GIT_COMMIT_LIST_MAX.max
	);
}

export interface AppConfig extends ThemePreference {
	notificationsEnabled: boolean;
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
	customLayoutPresets: LayoutPreset[];
	locale: string;
}

export type AppConfigUpdate = Partial<AppConfig>;

export type ProjectSettingsOverride = Partial<
	Pick<
		AppConfig,
		| "fileLineWidth"
		| "fileLineWidthBounded"
		| "editorFontSize"
		| "editorTabSize"
		| "editorInsertSpaces"
		| "editorMinimap"
		| "editorLineNumbers"
		| "editorRenderWhitespace"
		| "editorCursorStyle"
		| "editorAutoSaveDelayMs"
		| "filesExclude"
		| "filesShowHidden"
		| "explorerCompactFolders"
		| "explorerSortOrder"
		| "filesAssociations"
		| "gitCommitVerify"
		| "gitCommitListMax"
	>
>;

export function normalizeProjectSettingsOverride(raw: unknown): ProjectSettingsOverride {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const v = raw as Record<string, unknown>;
	const out: ProjectSettingsOverride = {};
	if (isLineWidth(v.fileLineWidth)) out.fileLineWidth = v.fileLineWidth;
	if (typeof v.fileLineWidthBounded === "boolean")
		out.fileLineWidthBounded = v.fileLineWidthBounded;
	if (isEditorFontSize(v.editorFontSize)) out.editorFontSize = v.editorFontSize;
	if (isEditorTabSize(v.editorTabSize)) out.editorTabSize = v.editorTabSize;
	if (typeof v.editorInsertSpaces === "boolean") out.editorInsertSpaces = v.editorInsertSpaces;
	if (typeof v.editorMinimap === "boolean") out.editorMinimap = v.editorMinimap;
	if (isEditorLineNumbers(v.editorLineNumbers)) out.editorLineNumbers = v.editorLineNumbers;
	if (isEditorRenderWhitespace(v.editorRenderWhitespace))
		out.editorRenderWhitespace = v.editorRenderWhitespace;
	if (isEditorCursorStyle(v.editorCursorStyle)) out.editorCursorStyle = v.editorCursorStyle;
	if (isEditorAutoSaveDelayMs(v.editorAutoSaveDelayMs))
		out.editorAutoSaveDelayMs = v.editorAutoSaveDelayMs;
	if (isFilesExcludeList(v.filesExclude)) out.filesExclude = [...v.filesExclude];
	if (typeof v.filesShowHidden === "boolean") out.filesShowHidden = v.filesShowHidden;
	if (typeof v.explorerCompactFolders === "boolean")
		out.explorerCompactFolders = v.explorerCompactFolders;
	if (isExplorerSortOrder(v.explorerSortOrder)) out.explorerSortOrder = v.explorerSortOrder;
	if (isStringMap(v.filesAssociations)) out.filesAssociations = { ...v.filesAssociations };
	if (typeof v.gitCommitVerify === "boolean") out.gitCommitVerify = v.gitCommitVerify;
	if (isGitCommitListMax(v.gitCommitListMax)) out.gitCommitListMax = v.gitCommitListMax;
	return out;
}

export const TERMINAL_REPLAY_KB = { min: 0, max: 1024, default: 64 } as const;

export const TERMINAL_WINDOWS_SHELLS = ["auto", "pwsh", "powershell", "cmd"] as const;
export type TerminalWindowsShell = (typeof TERMINAL_WINDOWS_SHELLS)[number];

export function isTerminalWindowsShell(value: unknown): value is TerminalWindowsShell {
	return TERMINAL_WINDOWS_SHELLS.some((shell) => shell === value);
}

export const SYSTEM_LOCALE_PREFERENCE = "system";

export function isLocalePreference(value: unknown): value is string {
	if (value === SYSTEM_LOCALE_PREFERENCE) return true;
	if (typeof value !== "string" || value.length === 0 || value.length > 35) return false;
	try {
		return Intl.getCanonicalLocales(value)[0] === value;
	} catch {
		return false;
	}
}

export interface LocalLocaleFileOk {
	fileName: string;
	tag: string;
	ok: true;
	strings: Record<string, string>;
}

export type LocalLocaleFileErrorCode =
	| "invalid-name"
	| "duplicate"
	| "too-large"
	| "too-many"
	| "unreadable"
	| "invalid-json"
	| "not-object";

export interface LocalLocaleFileError {
	fileName: string;
	tag: string | null;
	ok: false;
	error: LocalLocaleFileErrorCode;
	detail?: string;
}

export type LocalLocaleFile = LocalLocaleFileOk | LocalLocaleFileError;

export interface LocalLocalesSnapshot {
	dir: string;
	files: LocalLocaleFile[];
}

export interface UserThemeFileOk {
	fileName: string;
	ok: true;
	manifest: unknown;
}

export type UserThemeFileErrorCode = "too-large" | "too-many" | "unreadable" | "invalid-json";

export interface UserThemeFileError {
	fileName: string;
	ok: false;
	error: UserThemeFileErrorCode;
	detail?: string;
}

export type UserThemeFile = UserThemeFileOk | UserThemeFileError;

export interface UserThemesSnapshot {
	dir: string;
	files: UserThemeFile[];
}

export const DEFAULT_CONFIG: AppConfig = {
	theme: "dark",
	themeMode: "fixed",
	notificationsEnabled: true,
	uiFontFamily: "",
	codeFontFamily: "",
	explorerFileIcons: "filetype",
	fileLineWidth: LINE_WIDTH_COLUMNS.default,
	fileLineWidthBounded: true,
	editorFontSize: EDITOR_FONT_SIZE.default,
	editorTabSize: 4,
	editorInsertSpaces: false,
	editorMinimap: false,
	editorLineNumbers: "on",
	editorRenderWhitespace: "none",
	editorCursorStyle: "line",
	editorAutoSaveDelayMs: EDITOR_AUTO_SAVE_DELAY_MS.default,
	filesExclude: [...DEFAULT_FILES_EXCLUDE],
	filesShowHidden: true,
	explorerCompactFolders: true,
	explorerSortOrder: "default",
	filesAssociations: {},
	terminalReplayKb: TERMINAL_REPLAY_KB.default,
	terminalWindowsShell: "auto",
	terminalShellPath: "",
	terminalShellArgs: [],
	terminalFontSize: TERMINAL_FONT_SIZE.default,
	terminalCursorStyle: "block",
	terminalCursorBlink: true,
	terminalScrollbackLines: TERMINAL_SCROLLBACK_LINES.default,
	gitCommitVerify: false,
	gitCommitListMax: GIT_COMMIT_LIST_MAX.default,
	externalEditorCustomBin: "",
	customKeybindings: {},
	customLayoutPresets: [],
	locale: SYSTEM_LOCALE_PREFERENCE,
};

export function normalizeThemePreference(value: unknown): ThemePreference {
	const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
	const rawTheme = Reflect.get(record, "theme");
	const rawMode = Reflect.get(record, "themeMode");
	const rawPair = Reflect.get(record, "systemThemePair");
	const systemThemePair = isSystemThemePair(rawPair)
		? { light: rawPair.light, dark: rawPair.dark }
		: undefined;
	const themeMode =
		isThemeMode(rawMode) && (rawMode === "fixed" || systemThemePair)
			? rawMode
			: DEFAULT_CONFIG.themeMode;
	return {
		theme: typeof rawTheme === "string" ? rawTheme : DEFAULT_CONFIG.theme,
		themeMode,
		...(systemThemePair ? { systemThemePair } : {}),
	};
}
