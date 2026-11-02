import { describe, expect, test } from "bun:test";
import { RiPaletteLine } from "@remixicon/react";
import { LOCALES_PROTOCOL_VERSION } from "@realthing/contracts";
import { t } from "@realthing/locales/react";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsSection, useAppStore } from "@/store";
import { TypographyAndIconsGroup } from "./AppearanceSettings";
import { EditorSettings } from "./EditorSettings";
import { FilesSettings } from "./FilesSettings";
import { GitAndEditorsSettings } from "./GitAndEditorsSettings";
import { formatRecordedKeybinding, KeybindingsSettings } from "./KeybindingsSettings";
import {
	filterSettingsNavGroups,
	resolveSettingsSection,
	type SettingsNavGroup,
	settingsNavGroups,
} from "./settingsNav";

const LATEST = LOCALES_PROTOCOL_VERSION;
const GATED = [SettingsSection.Language];

const ids = (protocolVersion: number | null, hasUpdates: boolean) =>
	settingsNavGroups(protocolVersion, hasUpdates).flatMap((g) => g.sections.map((s) => s.id));

describe("settingsNavGroups", () => {
	test("current hosts with injected updates list every section in its group", () => {
		expect(
			settingsNavGroups(LATEST, true).map((g) => [t(g.label), g.sections.map((s) => s.id)]),
		).toEqual([
			[
				"Interface",
				[
					SettingsSection.Appearance,
					SettingsSection.Editor,
					SettingsSection.Files,
					SettingsSection.Language,
					SettingsSection.Layout,
					SettingsSection.Terminal,
					SettingsSection.Keybindings,
					SettingsSection.Git,
				],
			],
			["System", [SettingsSection.Updates]],
		]);
	});

	test("protocol-gated sections are hidden on old or unnegotiated hosts", () => {
		for (const version of [1, null]) {
			const available = ids(version, true);
			for (const gated of GATED) expect(available).not.toContain(gated);
			expect(available).toContain(SettingsSection.Appearance);
		}
	});

	test("each gated section appears exactly at its protocol version", () => {
		const gates = [[SettingsSection.Language, LOCALES_PROTOCOL_VERSION]] as const;
		for (const [id, version] of gates) {
			expect(ids(version - 1, false)).not.toContain(id);
			expect(ids(version, false)).toContain(id);
		}
	});

	test("Updates is listed only with injected content", () => {
		expect(ids(LATEST, false)).not.toContain(SettingsSection.Updates);
		expect(ids(LATEST, true)).toContain(SettingsSection.Updates);
	});

	test("non-nav sections are never listed", () => {
		const available = ids(LATEST, true);
		expect(available).not.toContain(SettingsSection.LineWidth);
	});

	test("groups left without an available section disappear", () => {
		const groups: SettingsNavGroup[] = [
			{
				label: "settings.nav.group.system",
				sections: [
					{
						id: SettingsSection.Language,
						label: "settings.nav.language",
						icon: RiPaletteLine,
						requiresProtocolVersion: LOCALES_PROTOCOL_VERSION,
					},
					{
						id: SettingsSection.Updates,
						label: "settings.nav.updates",
						icon: RiPaletteLine,
						requiresInjectedContent: true,
					},
				],
			},
			{
				label: "settings.nav.group.interface",
				sections: [
					{
						id: SettingsSection.Appearance,
						label: "settings.nav.appearance",
						icon: RiPaletteLine,
					},
				],
			},
		];
		expect(filterSettingsNavGroups(groups, 1, false).map((g) => g.label)).toEqual([
			"settings.nav.group.interface",
		]);
		expect(filterSettingsNavGroups(groups, 1, true).map((g) => g.label)).toEqual([
			"settings.nav.group.system",
			"settings.nav.group.interface",
		]);
		expect(settingsNavGroups(1, false).every((g) => g.sections.length > 0)).toBe(true);
	});
});

describe("resolveSettingsSection", () => {
	test("keeps an available section", () => {
		const groups = settingsNavGroups(LATEST, true);
		for (const id of ids(LATEST, true)) expect(resolveSettingsSection(id, groups)).toBe(id);
	});

	test("unavailable sections fall back to Appearance", () => {
		const old = settingsNavGroups(1, false);
		for (const gated of GATED) {
			expect(resolveSettingsSection(gated, old)).toBe(SettingsSection.Appearance);
		}
		expect(resolveSettingsSection(SettingsSection.Updates, settingsNavGroups(LATEST, false))).toBe(
			SettingsSection.Appearance,
		);
	});

	test("non-nav sections fall back to Appearance", () => {
		const groups = settingsNavGroups(LATEST, true);
		expect(resolveSettingsSection(SettingsSection.LineWidth, groups)).toBe(
			SettingsSection.Appearance,
		);
	});

	test("without Appearance it falls back to the first available section", () => {
		const groups = [
			{
				label: "settings.nav.group.interface" as const,
				sections: settingsNavGroups(LATEST, true)
					.flatMap((g) => g.sections)
					.filter((s) => s.id === SettingsSection.Terminal),
			},
		];
		expect(resolveSettingsSection(SettingsSection.Language, groups)).toBe(SettingsSection.Terminal);
		expect(resolveSettingsSection(SettingsSection.Language, [])).toBe(SettingsSection.Appearance);
	});
});

describe("settings sections markup", () => {
	test("TypographyAndIconsGroup renders typography and explorer icon controls", () => {
		const markup = renderToStaticMarkup(
			<TypographyAndIconsGroup
				uiFontFamily="Inter"
				codeFontFamily="JetBrains Mono"
				explorerFileIcons="minimal"
				onUpdate={() => {}}
			/>,
		);
		expect(markup).toContain('data-testid="ui-font-family-input"');
		expect(markup).toContain('value="Inter"');
		expect(markup).toContain('data-testid="code-font-family-input"');
		expect(markup).toContain('value="JetBrains Mono"');
		expect(markup).toContain('data-testid="explorer-file-icons-minimal" data-active="true"');
	});

	test("EditorSettings renders font size, tab size, whitespace, cursor, minimap, and auto-save controls", () => {
		const initial = useAppStore.getInitialState();
		const prev = {
			editorFontSize: initial.editorFontSize,
			editorTabSize: initial.editorTabSize,
			editorInsertSpaces: initial.editorInsertSpaces,
			editorLineNumbers: initial.editorLineNumbers,
			editorRenderWhitespace: initial.editorRenderWhitespace,
			editorCursorStyle: initial.editorCursorStyle,
			editorMinimap: initial.editorMinimap,
			editorAutoSaveDelayMs: initial.editorAutoSaveDelayMs,
		};
		Object.assign(initial, {
			editorFontSize: 14,
			editorTabSize: 2,
			editorInsertSpaces: true,
			editorLineNumbers: "relative",
			editorRenderWhitespace: "boundary",
			editorCursorStyle: "block",
			editorMinimap: true,
			editorAutoSaveDelayMs: 1200,
		});
		try {
			const markup = renderToStaticMarkup(<EditorSettings />);
			expect(markup).toContain('data-testid="settings-editor"');
			expect(markup).toContain('data-testid="file-line-width-control"');
			expect(markup).toContain('data-testid="editor-font-size-input"');
			expect(markup).toContain('data-testid="editor-tab-size-2" data-active="true"');
			expect(markup).toContain('data-testid="editor-insert-spaces-switch" data-active="true"');
			expect(markup).toContain('data-testid="editor-line-numbers-relative" data-active="true"');
			expect(markup).toContain(
				'data-testid="editor-render-whitespace-boundary" data-active="true"',
			);
			expect(markup).toContain('data-testid="editor-cursor-style-block" data-active="true"');
			expect(markup).toContain('data-testid="editor-minimap-switch" data-active="true"');
			expect(markup).toContain('data-testid="editor-auto-save-delay-input"');
		} finally {
			Object.assign(initial, prev);
		}
	});

	test("FilesSettings renders sort order, compact folders, hidden files, excludes, associations, and project settings button", () => {
		const initial = useAppStore.getInitialState();
		const prev = {
			explorerSortOrder: initial.explorerSortOrder,
			explorerCompactFolders: initial.explorerCompactFolders,
			filesShowHidden: initial.filesShowHidden,
			filesExclude: initial.filesExclude,
			filesAssociations: initial.filesAssociations,
			activeWorkspaceId: initial.activeWorkspaceId,
		};
		Object.assign(initial, {
			explorerSortOrder: "filesFirst",
			explorerCompactFolders: false,
			filesShowHidden: true,
			filesExclude: [".git", "dist"],
			filesAssociations: { ".mdx": "text/markdown" },
			activeWorkspaceId: "ws-1",
		});
		try {
			const markup = renderToStaticMarkup(<FilesSettings />);
			expect(markup).toContain('data-testid="settings-files"');
			expect(markup).toContain('data-testid="explorer-sort-order-filesFirst" data-active="true"');
			expect(markup).toContain('data-testid="explorer-compact-folders-switch" data-active="false"');
			expect(markup).toContain('data-testid="files-show-hidden-switch" data-active="true"');
			expect(markup).toContain('data-testid="files-exclude-item-dist"');
			expect(markup).toContain('data-testid="files-association-item-.mdx"');
			expect(markup).toContain('data-testid="open-project-settings-button"');
		} finally {
			Object.assign(initial, prev);
		}
	});

	test("GitAndEditorsSettings renders git hooks, commit max, and custom editor binary controls", () => {
		const initial = useAppStore.getInitialState();
		const prev = {
			gitCommitVerify: initial.gitCommitVerify,
			gitCommitListMax: initial.gitCommitListMax,
			externalEditorCustomBin: initial.externalEditorCustomBin,
		};
		Object.assign(initial, {
			gitCommitVerify: true,
			gitCommitListMax: 500,
			externalEditorCustomBin: "/usr/local/bin/nvim",
		});
		try {
			const markup = renderToStaticMarkup(<GitAndEditorsSettings />);
			expect(markup).toContain('data-testid="settings-git"');
			expect(markup).toContain('data-testid="git-commit-verify-switch" data-active="true"');
			expect(markup).toContain('data-testid="git-commit-list-max-input"');
			expect(markup).toContain('value="500"');
			expect(markup).toContain('data-testid="external-editor-custom-bin-input"');
			expect(markup).toContain('value="/usr/local/bin/nvim"');
		} finally {
			Object.assign(initial, prev);
		}
	});

	test("KeybindingsSettings renders all customizable shortcuts and formats recorded key combinations", () => {
		const initial = useAppStore.getInitialState();
		const prev = { customKeybindings: initial.customKeybindings };
		Object.assign(initial, {
			customKeybindings: { "new-workspace": "Mod+Shift+N" },
		});
		try {
			const markup = renderToStaticMarkup(<KeybindingsSettings />);
			expect(markup).toContain('data-testid="settings-keybindings"');
			expect(markup).toContain('data-testid="keybinding-value-new-workspace" data-custom="true"');
			expect(markup).toContain(">Mod+Shift+N</kbd>");
			expect(markup).toContain('data-testid="keybinding-value-projects" data-custom="false"');
			expect(markup).toContain(">Mod+B</kbd>");
			expect(markup).toContain('data-testid="keybinding-row-open-settings"');
			expect(markup).toContain('data-testid="keybinding-row-quit"');
		} finally {
			Object.assign(initial, prev);
		}

		expect(
			formatRecordedKeybinding({
				key: "k",
				metaKey: true,
				ctrlKey: false,
				shiftKey: true,
				altKey: false,
			}),
		).toBe("Mod+Shift+K");
		expect(
			formatRecordedKeybinding({
				key: "Control",
				metaKey: false,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
			}),
		).toBeNull();
	});
});
