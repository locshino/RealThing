import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
	type AppConfig,
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
	normalizeProjectSettingsOverride,
	normalizeThemePreference,
	PROJECT_SETTINGS_PATH,
	type Project,
	type ProjectSettingsOverride,
	type Workspace,
} from "@realthing/contracts";
import {
	claimBrowserAttributionAttemptIn,
	readAcquisitionIn,
	replaceAcquisitionWithTerminalMarkerIn,
	saveAcquisitionIn,
} from "./attribution";
import type { AcquisitionRecord } from "./attributionProtocol";
import { claimAppInstalledIn, ensureInstallationIn, type InstallationRecord } from "./installation";

export {
	type AcquisitionRecord,
	ATTRIBUTION_LIFETIME_MS,
	ATTRIBUTION_MAX_POLLS,
	ATTRIBUTION_ORIGIN,
	ATTRIBUTION_POLL_INTERVAL_MS,
	type AttributionTouch,
	claimIdPattern,
	hasExactKeys,
	isRecord,
	parseRedeemedAttribution,
	type RedeemedAttribution,
} from "./attributionProtocol";
export type { InstallationRecord } from "./installation";

export function dataDir(): string {
	return resolve(process.env.REALTHING_DATA_DIR ?? join(homedir(), ".realthing"));
}

function storedDirectory(path: string): string {
	if (typeof path !== "string" || !isAbsolute(path)) return path;
	return resolve(path);
}

function readJson<T>(file: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(join(dataDir(), file), "utf8")) as T;
	} catch {
		return fallback;
	}
}

function writeJson(file: string, value: unknown): void {
	mkdirSync(dataDir(), { recursive: true });
	writeFileSync(join(dataDir(), file), `${JSON.stringify(value, null, "\t")}\n`);
}

export function loadProjects(): Project[] {
	return readJson<Project[]>("projects.json", []).map((project) => ({
		...project,
		path: storedDirectory(project.path),
	}));
}

export function saveProjects(projects: Project[]): void {
	writeJson("projects.json", projects);
}

export function loadWorkspaces(): Workspace[] {
	return readJson<Workspace[]>("workspaces.json", []).map((workspace) => ({
		...workspace,
		worktreePath: storedDirectory(workspace.worktreePath),
	}));
}

export function saveWorkspaces(workspaces: Workspace[]): void {
	writeJson("workspaces.json", workspaces);
}

export interface PersistedTerminalTab {
	tabKey: string;
	title: string;
	recorded?: string;
}

export type PersistedTerminalSessions = Record<string, PersistedTerminalTab[]>;

export function loadTerminalSessions(): PersistedTerminalSessions {
	return readJson<PersistedTerminalSessions>("terminals.json", {});
}

export function saveTerminalSessions(sessions: PersistedTerminalSessions): void {
	writeJson("terminals.json", sessions);
}

export function loadConfig(): AppConfig {
	const raw = readJson<unknown>("config.json", {});
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return structuredClone(DEFAULT_CONFIG);
	const value = raw as Record<string, unknown>;
	return {
		...normalizeThemePreference(value),
		notificationsEnabled:
			typeof value.notificationsEnabled === "boolean"
				? value.notificationsEnabled
				: DEFAULT_CONFIG.notificationsEnabled,
		uiFontFamily:
			typeof value.uiFontFamily === "string" ? value.uiFontFamily : DEFAULT_CONFIG.uiFontFamily,
		codeFontFamily:
			typeof value.codeFontFamily === "string"
				? value.codeFontFamily
				: DEFAULT_CONFIG.codeFontFamily,
		explorerFileIcons: isExplorerFileIcons(value.explorerFileIcons)
			? value.explorerFileIcons
			: DEFAULT_CONFIG.explorerFileIcons,
		fileLineWidth: isLineWidth(value.fileLineWidth)
			? value.fileLineWidth
			: DEFAULT_CONFIG.fileLineWidth,
		fileLineWidthBounded:
			typeof value.fileLineWidthBounded === "boolean"
				? value.fileLineWidthBounded
				: DEFAULT_CONFIG.fileLineWidthBounded,
		editorFontSize: isEditorFontSize(value.editorFontSize)
			? value.editorFontSize
			: DEFAULT_CONFIG.editorFontSize,
		editorTabSize: isEditorTabSize(value.editorTabSize)
			? value.editorTabSize
			: DEFAULT_CONFIG.editorTabSize,
		editorInsertSpaces:
			typeof value.editorInsertSpaces === "boolean"
				? value.editorInsertSpaces
				: DEFAULT_CONFIG.editorInsertSpaces,
		editorMinimap:
			typeof value.editorMinimap === "boolean" ? value.editorMinimap : DEFAULT_CONFIG.editorMinimap,
		editorLineNumbers: isEditorLineNumbers(value.editorLineNumbers)
			? value.editorLineNumbers
			: DEFAULT_CONFIG.editorLineNumbers,
		editorRenderWhitespace: isEditorRenderWhitespace(value.editorRenderWhitespace)
			? value.editorRenderWhitespace
			: DEFAULT_CONFIG.editorRenderWhitespace,
		editorCursorStyle: isEditorCursorStyle(value.editorCursorStyle)
			? value.editorCursorStyle
			: DEFAULT_CONFIG.editorCursorStyle,
		editorAutoSaveDelayMs: isEditorAutoSaveDelayMs(value.editorAutoSaveDelayMs)
			? value.editorAutoSaveDelayMs
			: DEFAULT_CONFIG.editorAutoSaveDelayMs,
		filesExclude: isFilesExcludeList(value.filesExclude)
			? [...value.filesExclude]
			: [...DEFAULT_CONFIG.filesExclude],
		filesShowHidden:
			typeof value.filesShowHidden === "boolean"
				? value.filesShowHidden
				: DEFAULT_CONFIG.filesShowHidden,
		explorerCompactFolders:
			typeof value.explorerCompactFolders === "boolean"
				? value.explorerCompactFolders
				: DEFAULT_CONFIG.explorerCompactFolders,
		explorerSortOrder: isExplorerSortOrder(value.explorerSortOrder)
			? value.explorerSortOrder
			: DEFAULT_CONFIG.explorerSortOrder,
		filesAssociations: isStringMap(value.filesAssociations)
			? { ...value.filesAssociations }
			: { ...DEFAULT_CONFIG.filesAssociations },
		terminalReplayKb:
			typeof value.terminalReplayKb === "number" && Number.isFinite(value.terminalReplayKb)
				? value.terminalReplayKb
				: DEFAULT_CONFIG.terminalReplayKb,
		terminalWindowsShell: isTerminalWindowsShell(value.terminalWindowsShell)
			? value.terminalWindowsShell
			: DEFAULT_CONFIG.terminalWindowsShell,
		terminalShellPath:
			typeof value.terminalShellPath === "string"
				? value.terminalShellPath
				: DEFAULT_CONFIG.terminalShellPath,
		terminalShellArgs: isTerminalShellArgs(value.terminalShellArgs)
			? [...value.terminalShellArgs]
			: [...DEFAULT_CONFIG.terminalShellArgs],
		terminalFontSize: isTerminalFontSize(value.terminalFontSize)
			? value.terminalFontSize
			: DEFAULT_CONFIG.terminalFontSize,
		terminalCursorStyle: isTerminalCursorStyle(value.terminalCursorStyle)
			? value.terminalCursorStyle
			: DEFAULT_CONFIG.terminalCursorStyle,
		terminalCursorBlink:
			typeof value.terminalCursorBlink === "boolean"
				? value.terminalCursorBlink
				: DEFAULT_CONFIG.terminalCursorBlink,
		terminalScrollbackLines: isTerminalScrollbackLines(value.terminalScrollbackLines)
			? value.terminalScrollbackLines
			: DEFAULT_CONFIG.terminalScrollbackLines,
		gitCommitVerify:
			typeof value.gitCommitVerify === "boolean"
				? value.gitCommitVerify
				: DEFAULT_CONFIG.gitCommitVerify,
		gitCommitListMax: isGitCommitListMax(value.gitCommitListMax)
			? value.gitCommitListMax
			: DEFAULT_CONFIG.gitCommitListMax,
		externalEditorCustomBin:
			typeof value.externalEditorCustomBin === "string"
				? value.externalEditorCustomBin
				: DEFAULT_CONFIG.externalEditorCustomBin,
		customKeybindings: isStringMap(value.customKeybindings)
			? { ...value.customKeybindings }
			: { ...DEFAULT_CONFIG.customKeybindings },
		customLayoutPresets: Array.isArray(value.customLayoutPresets)
			? value.customLayoutPresets
			: DEFAULT_CONFIG.customLayoutPresets,
		locale: isLocalePreference(value.locale) ? value.locale : DEFAULT_CONFIG.locale,
	};
}

export function loadProjectSettingsOverride(worktreePath: string): ProjectSettingsOverride {
	try {
		const raw = JSON.parse(readFileSync(join(worktreePath, PROJECT_SETTINGS_PATH), "utf8"));
		return normalizeProjectSettingsOverride(raw);
	} catch {
		return {};
	}
}

export function loadWorkspaceConfig(worktreePath?: string): AppConfig {
	const base = loadConfig();
	if (!worktreePath) return base;
	return { ...base, ...loadProjectSettingsOverride(worktreePath) };
}

export function saveConfig(config: AppConfig): void {
	writeJson("config.json", config);
}

export function ensureInstallation(): InstallationRecord {
	return ensureInstallationIn(dataDir());
}

export function claimAppInstalled(): boolean {
	return claimAppInstalledIn(dataDir());
}

export function readAcquisition(now = Date.now()): AcquisitionRecord | undefined {
	return readAcquisitionIn(dataDir(), now);
}

export function claimBrowserAttributionAttempt(): boolean {
	return claimBrowserAttributionAttemptIn(dataDir());
}

export function saveAcquisition(record: AcquisitionRecord): void {
	saveAcquisitionIn(dataDir(), record);
}

export function replaceAcquisitionWithTerminalMarker(): void {
	replaceAcquisitionWithTerminalMarkerIn(dataDir());
}
