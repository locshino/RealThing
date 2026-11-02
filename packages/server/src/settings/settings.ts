import {
	type AppConfig,
	type AppConfigUpdate,
	EDITOR_AUTO_SAVE_DELAY_MS,
	EDITOR_FONT_SIZE,
	GIT_COMMIT_LIST_MAX,
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
	isSystemThemePair,
	isTerminalCursorStyle,
	isTerminalFontSize,
	isTerminalScrollbackLines,
	isTerminalShellArgs,
	isTerminalWindowsShell,
	isThemeMode,
	LINE_WIDTH_COLUMNS,
	TERMINAL_FONT_SIZE,
	TERMINAL_SCROLLBACK_LINES,
} from "@realthing/contracts";
import { loadConfig, saveConfig } from "../persistence";
import { normalizeStoredCustomLayoutPresets, validateCustomLayoutPresets } from "./layoutPresets";

export type SettingsPublisher = (config: AppConfig, appliedUpdate: AppConfigUpdate) => void;
type RuntimeAppConfigUpdate = AppConfigUpdate & {
	layout?: unknown;
};

const ACCEPTED_UPDATE_KEYS = {
	theme: true,
	themeMode: true,
	systemThemePair: true,
	notificationsEnabled: true,
	uiFontFamily: true,
	codeFontFamily: true,
	explorerFileIcons: true,
	fileLineWidth: true,
	fileLineWidthBounded: true,
	editorFontSize: true,
	editorTabSize: true,
	editorInsertSpaces: true,
	editorMinimap: true,
	editorLineNumbers: true,
	editorRenderWhitespace: true,
	editorCursorStyle: true,
	editorAutoSaveDelayMs: true,
	filesExclude: true,
	filesShowHidden: true,
	explorerCompactFolders: true,
	explorerSortOrder: true,
	filesAssociations: true,
	terminalReplayKb: true,
	terminalWindowsShell: true,
	terminalShellPath: true,
	terminalShellArgs: true,
	terminalFontSize: true,
	terminalCursorStyle: true,
	terminalCursorBlink: true,
	terminalScrollbackLines: true,
	gitCommitVerify: true,
	gitCommitListMax: true,
	externalEditorCustomBin: true,
	customKeybindings: true,
	customLayoutPresets: true,
	locale: true,
	layout: true,
} satisfies Record<keyof RuntimeAppConfigUpdate, true>;

function assertUpdateShape(update: unknown): void {
	if (typeof update !== "object" || update === null || Array.isArray(update)) {
		throw new Error("settings update must be an object");
	}
	const unknownKey = Object.keys(update).find((key) => !Object.hasOwn(ACCEPTED_UPDATE_KEYS, key));
	if (unknownKey !== undefined) throw new Error(`Unknown setting: ${unknownKey}`);
}

let publishSettings: SettingsPublisher | null = null;

export function setSettingsPublisher(fn: SettingsPublisher | null): void {
	publishSettings = fn;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
	if (cached) return cached;
	const loaded = loadConfig();
	const customLayoutPresets = normalizeStoredCustomLayoutPresets(loaded.customLayoutPresets);
	cached = { ...loaded, customLayoutPresets };
	if (JSON.stringify(customLayoutPresets) !== JSON.stringify(loaded.customLayoutPresets)) {
		saveConfig(cached);
	}
	return cached;
}

export function updateConfig(partial: AppConfigUpdate): AppConfig {
	assertUpdateShape(partial);
	const runtimeUpdate: RuntimeAppConfigUpdate = { ...partial };
	delete runtimeUpdate.layout;
	if (runtimeUpdate.fileLineWidth !== undefined && !isLineWidth(runtimeUpdate.fileLineWidth)) {
		throw new Error(
			`fileLineWidth must be a whole number from ${LINE_WIDTH_COLUMNS.min} to ${LINE_WIDTH_COLUMNS.max}`,
		);
	}
	for (const [name, value] of [
		["fileLineWidthBounded", runtimeUpdate.fileLineWidthBounded],
		["notificationsEnabled", runtimeUpdate.notificationsEnabled],
		["editorInsertSpaces", runtimeUpdate.editorInsertSpaces],
		["editorMinimap", runtimeUpdate.editorMinimap],
		["filesShowHidden", runtimeUpdate.filesShowHidden],
		["explorerCompactFolders", runtimeUpdate.explorerCompactFolders],
		["terminalCursorBlink", runtimeUpdate.terminalCursorBlink],
		["gitCommitVerify", runtimeUpdate.gitCommitVerify],
	] as const) {
		if (value !== undefined && typeof value !== "boolean") {
			throw new Error(`${name} must be a boolean`);
		}
	}
	for (const [name, value] of [
		["uiFontFamily", runtimeUpdate.uiFontFamily],
		["codeFontFamily", runtimeUpdate.codeFontFamily],
		["terminalShellPath", runtimeUpdate.terminalShellPath],
		["externalEditorCustomBin", runtimeUpdate.externalEditorCustomBin],
	] as const) {
		if (
			value !== undefined &&
			(typeof value !== "string" || value.length > 500 || value.includes("\0"))
		) {
			throw new Error(`${name} must be a valid string`);
		}
	}
	if (
		runtimeUpdate.explorerFileIcons !== undefined &&
		!isExplorerFileIcons(runtimeUpdate.explorerFileIcons)
	) {
		throw new Error("explorerFileIcons must be minimal or filetype");
	}
	if (
		runtimeUpdate.editorFontSize !== undefined &&
		!isEditorFontSize(runtimeUpdate.editorFontSize)
	) {
		throw new Error(
			`editorFontSize must be an integer from ${EDITOR_FONT_SIZE.min} to ${EDITOR_FONT_SIZE.max}`,
		);
	}
	if (runtimeUpdate.editorTabSize !== undefined && !isEditorTabSize(runtimeUpdate.editorTabSize)) {
		throw new Error("editorTabSize must be 2, 4, or 8");
	}
	if (
		runtimeUpdate.editorLineNumbers !== undefined &&
		!isEditorLineNumbers(runtimeUpdate.editorLineNumbers)
	) {
		throw new Error("editorLineNumbers must be on, off, or relative");
	}
	if (
		runtimeUpdate.editorRenderWhitespace !== undefined &&
		!isEditorRenderWhitespace(runtimeUpdate.editorRenderWhitespace)
	) {
		throw new Error("editorRenderWhitespace must be none, boundary, selection, or all");
	}
	if (
		runtimeUpdate.editorCursorStyle !== undefined &&
		!isEditorCursorStyle(runtimeUpdate.editorCursorStyle)
	) {
		throw new Error("editorCursorStyle must be line, block, or underline");
	}
	if (
		runtimeUpdate.editorAutoSaveDelayMs !== undefined &&
		!isEditorAutoSaveDelayMs(runtimeUpdate.editorAutoSaveDelayMs)
	) {
		throw new Error(
			`editorAutoSaveDelayMs must be an integer from ${EDITOR_AUTO_SAVE_DELAY_MS.min} to ${EDITOR_AUTO_SAVE_DELAY_MS.max}`,
		);
	}
	if (runtimeUpdate.filesExclude !== undefined && !isFilesExcludeList(runtimeUpdate.filesExclude)) {
		throw new Error("filesExclude must be a bounded list of non-empty strings");
	}
	if (
		runtimeUpdate.explorerSortOrder !== undefined &&
		!isExplorerSortOrder(runtimeUpdate.explorerSortOrder)
	) {
		throw new Error("explorerSortOrder must be default, mixed, filesFirst, or type");
	}
	if (
		runtimeUpdate.filesAssociations !== undefined &&
		!isStringMap(runtimeUpdate.filesAssociations)
	) {
		throw new Error("filesAssociations must be a string map");
	}
	if (
		runtimeUpdate.terminalShellArgs !== undefined &&
		!isTerminalShellArgs(runtimeUpdate.terminalShellArgs)
	) {
		throw new Error("terminalShellArgs must be a bounded string array");
	}
	if (
		runtimeUpdate.terminalFontSize !== undefined &&
		!isTerminalFontSize(runtimeUpdate.terminalFontSize)
	) {
		throw new Error(
			`terminalFontSize must be an integer from ${TERMINAL_FONT_SIZE.min} to ${TERMINAL_FONT_SIZE.max}`,
		);
	}
	if (
		runtimeUpdate.terminalCursorStyle !== undefined &&
		!isTerminalCursorStyle(runtimeUpdate.terminalCursorStyle)
	) {
		throw new Error("terminalCursorStyle must be block, underline, or bar");
	}
	if (
		runtimeUpdate.terminalScrollbackLines !== undefined &&
		!isTerminalScrollbackLines(runtimeUpdate.terminalScrollbackLines)
	) {
		throw new Error(
			`terminalScrollbackLines must be an integer from ${TERMINAL_SCROLLBACK_LINES.min} to ${TERMINAL_SCROLLBACK_LINES.max}`,
		);
	}
	if (
		runtimeUpdate.gitCommitListMax !== undefined &&
		!isGitCommitListMax(runtimeUpdate.gitCommitListMax)
	) {
		throw new Error(
			`gitCommitListMax must be an integer from ${GIT_COMMIT_LIST_MAX.min} to ${GIT_COMMIT_LIST_MAX.max}`,
		);
	}
	if (
		runtimeUpdate.customKeybindings !== undefined &&
		!isStringMap(runtimeUpdate.customKeybindings)
	) {
		throw new Error("customKeybindings must be a string map");
	}
	const { customLayoutPresets, theme, themeMode, systemThemePair, ...rest } = runtimeUpdate;
	if (theme !== undefined && typeof theme !== "string") {
		throw new Error("theme must be a string");
	}
	if (
		runtimeUpdate.terminalWindowsShell !== undefined &&
		!isTerminalWindowsShell(runtimeUpdate.terminalWindowsShell)
	) {
		throw new Error("terminalWindowsShell must be auto, pwsh, powershell, or cmd");
	}
	if (
		runtimeUpdate.terminalReplayKb !== undefined &&
		(typeof runtimeUpdate.terminalReplayKb !== "number" ||
			!Number.isFinite(runtimeUpdate.terminalReplayKb))
	) {
		throw new Error("terminalReplayKb must be a finite number");
	}
	if (runtimeUpdate.locale !== undefined && !isLocalePreference(runtimeUpdate.locale)) {
		throw new Error('locale must be "system" or a canonical BCP-47 language tag');
	}
	if (themeMode !== undefined && !isThemeMode(themeMode)) {
		throw new Error("themeMode must be fixed or system");
	}
	if (systemThemePair !== undefined && !isSystemThemePair(systemThemePair)) {
		throw new Error("systemThemePair must contain light and dark theme ids");
	}
	const current = getConfig();
	const nextThemeMode = themeMode ?? (theme !== undefined ? "fixed" : current.themeMode);
	const nextSystemThemePair =
		systemThemePair === undefined
			? current.systemThemePair
			: { light: systemThemePair.light, dark: systemThemePair.dark };
	if (nextThemeMode === "system" && !nextSystemThemePair) {
		throw new Error("system theme mode requires a complete pair");
	}
	const next: AppConfig = {
		...current,
		...rest,
		...(theme === undefined ? {} : { theme }),
		themeMode: nextThemeMode,
		...(nextSystemThemePair ? { systemThemePair: nextSystemThemePair } : {}),
		...(customLayoutPresets === undefined
			? {}
			: { customLayoutPresets: validateCustomLayoutPresets(customLayoutPresets) }),
	};
	saveConfig(next);
	cached = next;
	publishSettings?.(next, runtimeUpdate);
	return next;
}

export function resetConfigCache(): void {
	cached = null;
}
