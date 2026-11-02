import type { EditorInfo } from "@realthing/contracts";
import { spawnDetached } from "@realthing/shared/spawn";
import { loadConfig } from "../persistence";

interface EditorCandidate {
	id: string;
	label: string;
	bin: string;
}

const GUI_CANDIDATES: EditorCandidate[] = [
	{ id: "vscode", label: "VS Code", bin: "code" },
	{ id: "cursor", label: "Cursor", bin: "cursor" },
	{ id: "zed", label: "Zed", bin: "zed" },
	{ id: "windsurf", label: "Windsurf", bin: "windsurf" },
	{ id: "sublime", label: "Sublime Text", bin: "subl" },
	{ id: "emacs", label: "Emacs", bin: "emacs" },
];

const JETBRAINS_CANDIDATES: { label: string; bin: string }[] = [
	{ label: "IntelliJ IDEA", bin: "idea" },
	{ label: "WebStorm", bin: "webstorm" },
	{ label: "PyCharm", bin: "pycharm" },
	{ label: "GoLand", bin: "goland" },
	{ label: "Rider", bin: "rider" },
	{ label: "CLion", bin: "clion" },
	{ label: "PhpStorm", bin: "phpstorm" },
	{ label: "RubyMine", bin: "rubymine" },
];

const JETBRAINS_ID = "jetbrains";
const CUSTOM_EDITOR_ID = "custom";

const TERMINAL_CANDIDATES: EditorCandidate[] = [
	{ id: "nvim", label: "Neovim", bin: "nvim" },
	{ id: "hx", label: "Helix", bin: "hx" },
	{ id: "vim", label: "Vim", bin: "vim" },
	{ id: "nano", label: "Nano", bin: "nano" },
];

export type WhichFn = (bin: string) => string | null;

export const defaultWhich: WhichFn = (bin) =>
	Bun.which(bin, { PATH: process.env.PATH ?? "" }) ?? null;

export type SpawnFn = (cmd: string[]) => void;

export const defaultSpawn: SpawnFn = (cmd) => {
	if (!spawnDetached(cmd)) throw new Error("Failed to launch the requested application");
};

export function listAvailableEditors(
	which: WhichFn = defaultWhich,
	customBinOverride?: string,
): EditorInfo[] {
	const editors: EditorInfo[] = [];
	const customBin = (customBinOverride ?? loadConfig().externalEditorCustomBin).trim();
	if (customBin && which(customBin)) {
		editors.push({ id: CUSTOM_EDITOR_ID, label: "Custom Editor", kind: "gui" });
	}
	for (const c of GUI_CANDIDATES) {
		if (which(c.bin)) editors.push({ id: c.id, label: c.label, kind: "gui" });
	}
	const jetbrains = JETBRAINS_CANDIDATES.find((c) => which(c.bin));
	if (jetbrains) editors.push({ id: JETBRAINS_ID, label: jetbrains.label, kind: "gui" });
	for (const c of TERMINAL_CANDIDATES) {
		if (which(c.bin)) {
			editors.push({ id: c.id, label: c.label, kind: "terminal" });
		}
	}
	return editors;
}

function resolveGuiBin(
	editorId: string,
	which: WhichFn,
	customBinOverride?: string,
): string | null {
	if (editorId === CUSTOM_EDITOR_ID) {
		const customBin = (customBinOverride ?? loadConfig().externalEditorCustomBin).trim();
		return customBin ? which(customBin) : null;
	}
	const simple = GUI_CANDIDATES.find((c) => c.id === editorId);
	if (simple) return which(simple.bin);
	if (editorId === JETBRAINS_ID) {
		for (const c of JETBRAINS_CANDIDATES) {
			const bin = which(c.bin);
			if (bin) return bin;
		}
		return null;
	}
	return null;
}

export function openEditor(
	editorId: string,
	worktreePath: string,
	which: WhichFn = defaultWhich,
	spawn: SpawnFn = defaultSpawn,
	customBinOverride?: string,
): void {
	const bin = resolveGuiBin(editorId, which, customBinOverride);
	if (!bin) throw new Error(`"${editorId}" isn't installed on this host`);
	spawn([bin, worktreePath]);
}

export function revealInFileManager(
	worktreePath: string,
	spawn: SpawnFn = defaultSpawn,
	platform: NodeJS.Platform = process.platform,
): void {
	const cmd =
		platform === "darwin"
			? ["open", worktreePath]
			: platform === "win32"
				? ["explorer", worktreePath]
				: ["xdg-open", worktreePath];
	try {
		spawn(cmd);
	} catch {
		throw new Error(`No file manager launcher available on this host (${platform}).`);
	}
}
