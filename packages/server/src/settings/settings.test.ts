import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AppConfig,
	type AppConfigUpdate,
	DEFAULT_CONFIG,
	type LayoutPreset,
} from "@realthing/contracts";
import { loadProjectSettingsOverride, loadWorkspaceConfig } from "../persistence";
import { validateCustomLayoutPresets } from "./layoutPresets";
import { getConfig, resetConfigCache, setSettingsPublisher, updateConfig } from "./settings";

let dataDir: string;
const savedDataDir = process.env.REALTHING_DATA_DIR;

function preset(id = "custom"): LayoutPreset {
	return {
		id,
		name: id,
		center: { kind: "group", id: `${id}-center` },
		left: {
			visible: true,
			width: 0.2,
			groups: [{ id: `${id}-left`, weight: 1, folded: false, tools: [] }],
		},
		right: { visible: false, width: 0.2, groups: [] },
		bottom: {
			visible: true,
			height: 0.3,
			alignment: "center",
			groups: [{ id: `${id}-bottom`, weight: 1, folded: false, tools: [] }],
		},
	};
}

beforeEach(() => {
	dataDir = mkdtempSync(join(tmpdir(), "realthing-settings-test-"));
	process.env.REALTHING_DATA_DIR = dataDir;
	resetConfigCache();
});

afterEach(() => {
	setSettingsPublisher(null);
	resetConfigCache();
	rmSync(dataDir, { recursive: true, force: true });
	if (savedDataDir === undefined) delete process.env.REALTHING_DATA_DIR;
	else process.env.REALTHING_DATA_DIR = savedDataDir;
});

test("getConfig falls back to DEFAULT_CONFIG when no config.json exists", () => {
	expect(getConfig()).toEqual(DEFAULT_CONFIG);
});

test("validates custom layout presets, file line width, and rejects unknown keys", () => {
	const custom = [preset("p1")];
	expect(validateCustomLayoutPresets(custom)).toEqual(custom);
	expect(updateConfig({ customLayoutPresets: custom, fileLineWidth: 100 }).fileLineWidth).toBe(100);
	expect(() => updateConfig({ fileLineWidth: 10 })).toThrow();
	expect(() => updateConfig({ unknownKey: true } as unknown as AppConfig)).toThrow();
});

describe("updateConfig & loadWorkspaceConfig (4-Scenario)", () => {
	test("Happy Case: updates all 24 customization fields and merges per-project overrides", () => {
		const updated = updateConfig({
			uiFontFamily: "Inter",
			codeFontFamily: "JetBrains Mono",
			explorerFileIcons: "minimal",
			editorFontSize: 14,
			editorTabSize: 2,
			editorInsertSpaces: true,
			editorMinimap: true,
			editorLineNumbers: "relative",
			editorRenderWhitespace: "boundary",
			editorCursorStyle: "block",
			editorAutoSaveDelayMs: 1200,
			filesExclude: ["dist", "build"],
			filesShowHidden: false,
			explorerCompactFolders: false,
			explorerSortOrder: "filesFirst",
			filesAssociations: { ".mdx": "text/markdown" },
			terminalShellPath: "/bin/zsh",
			terminalShellArgs: ["-l"],
			terminalFontSize: 15,
			terminalCursorStyle: "bar",
			terminalCursorBlink: false,
			terminalScrollbackLines: 10000,
			gitCommitVerify: true,
			gitCommitListMax: 400,
			externalEditorCustomBin: "my-editor",
			customKeybindings: { "view.toggleTerminal": "ctrl+`" },
		});
		expect(updated).toMatchObject({
			uiFontFamily: "Inter",
			codeFontFamily: "JetBrains Mono",
			explorerFileIcons: "minimal",
			editorFontSize: 14,
			editorTabSize: 2,
			editorInsertSpaces: true,
			editorMinimap: true,
			editorLineNumbers: "relative",
			editorRenderWhitespace: "boundary",
			editorCursorStyle: "block",
			editorAutoSaveDelayMs: 1200,
			filesExclude: ["dist", "build"],
			filesShowHidden: false,
			explorerCompactFolders: false,
			explorerSortOrder: "filesFirst",
			filesAssociations: { ".mdx": "text/markdown" },
			terminalShellPath: "/bin/zsh",
			terminalShellArgs: ["-l"],
			terminalFontSize: 15,
			terminalCursorStyle: "bar",
			terminalCursorBlink: false,
			terminalScrollbackLines: 10000,
			gitCommitVerify: true,
			gitCommitListMax: 400,
			externalEditorCustomBin: "my-editor",
			customKeybindings: { "view.toggleTerminal": "ctrl+`" },
		});

		const wt = join(dataDir, "wt");
		mkdirSync(join(wt, ".realthing"), { recursive: true });
		writeFileSync(
			join(wt, ".realthing", "settings.json"),
			JSON.stringify({ editorTabSize: 8, gitCommitVerify: false }),
		);
		expect(loadProjectSettingsOverride(wt)).toEqual({
			editorTabSize: 8,
			gitCommitVerify: false,
		});
		const wsConfig = loadWorkspaceConfig(wt);
		expect(wsConfig.editorTabSize).toBe(8);
		expect(wsConfig.gitCommitVerify).toBe(false);
		expect(wsConfig.editorFontSize).toBe(14);
	});

	test("Exception Case: rejects invalid data types, out-of-range numbers, and invalid enum values without mutating cached state", () => {
		const initial = getConfig();
		expect(() => updateConfig(null as unknown as AppConfigUpdate)).toThrow(
			"settings update must be an object",
		);
		expect(() => updateConfig([] as unknown as AppConfigUpdate)).toThrow(
			"settings update must be an object",
		);
		expect(() => updateConfig({ editorFontSize: 5 })).toThrow();
		expect(() => updateConfig({ editorTabSize: 3 as unknown as 2 })).toThrow();
		expect(() => updateConfig({ editorInsertSpaces: "yes" as unknown as boolean })).toThrow();
		expect(() => updateConfig({ editorLineNumbers: "none" as unknown as "on" })).toThrow();
		expect(() => updateConfig({ editorRenderWhitespace: "some" as unknown as "none" })).toThrow();
		expect(() => updateConfig({ editorCursorStyle: "bar" as unknown as "line" })).toThrow();
		expect(() => updateConfig({ editorAutoSaveDelayMs: 50000 })).toThrow();
		expect(() => updateConfig({ filesExclude: [""] })).toThrow();
		expect(() => updateConfig({ explorerSortOrder: "alpha" as unknown as "default" })).toThrow();
		expect(() => updateConfig({ explorerFileIcons: "none" as unknown as "minimal" })).toThrow();
		expect(() => updateConfig({ terminalFontSize: 100 })).toThrow();
		expect(() => updateConfig({ terminalCursorStyle: "line" as unknown as "block" })).toThrow();
		expect(() => updateConfig({ terminalScrollbackLines: 10 })).toThrow();
		expect(() => updateConfig({ gitCommitListMax: 5 })).toThrow();
		expect(getConfig()).toEqual(initial);
	});

	test("Hacking Case: blocks null-byte injection, oversized strings/arrays, and malformed project settings JSON", () => {
		expect(() => updateConfig({ terminalShellPath: "/bin/sh\0--evil" })).toThrow();
		expect(() => updateConfig({ externalEditorCustomBin: "code\0--evil" })).toThrow();
		expect(() => updateConfig({ uiFontFamily: "a".repeat(501) })).toThrow();
		expect(() =>
			updateConfig({ terminalShellArgs: Array.from({ length: 33 }, () => "-v") }),
		).toThrow();
		expect(() => updateConfig({ filesAssociations: { "": "text/plain" } })).toThrow();

		const wt = join(dataDir, "wt-broken");
		mkdirSync(join(wt, ".realthing"), { recursive: true });
		writeFileSync(join(wt, ".realthing", "settings.json"), "{ invalid json ");
		expect(loadProjectSettingsOverride(wt)).toEqual({});
	});

	test("403 / Unauthorized Keys Case: rejects unknown update keys and blocks project settings from overriding host execution settings", () => {
		expect(() =>
			updateConfig({ __proto__: { polluted: true }, evilKey: 1 } as unknown as AppConfigUpdate),
		).toThrow("Unknown setting: evilKey");

		const wt = join(dataDir, "wt-unauth");
		mkdirSync(join(wt, ".realthing"), { recursive: true });
		writeFileSync(
			join(wt, ".realthing", "settings.json"),
			JSON.stringify({
				terminalShellPath: "/tmp/evil.sh",
				externalEditorCustomBin: "/tmp/evil-editor",
				editorFontSize: 16,
			}),
		);
		const wsConfig = loadWorkspaceConfig(wt);
		expect(wsConfig.editorFontSize).toBe(16);
		expect(wsConfig.terminalShellPath).toBe("");
		expect(wsConfig.externalEditorCustomBin).toBe("");
	});
});
