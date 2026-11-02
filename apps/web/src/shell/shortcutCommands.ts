import {
	createQuitConfirmation,
	type NativeCommand,
	type NativeQuitHint,
	type QuitConfirmationDependencies,
} from "@realthing/contracts";
import type { MessageKey } from "@realthing/locales";
import { platformFamily } from "../lib";
import { useAppStore } from "../store";

export type ShortcutPlatform = Exclude<ReturnType<typeof platformFamily>, "other"> | "browser";

export type ShortcutCommandId = NativeCommand | "quit";

export interface ShortcutDefinition {
	readonly id: string;
	readonly defaultMac: string;
	readonly defaultOther: string;
	readonly labelKey: MessageKey;
}

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
	{
		id: "projects",
		defaultMac: "Mod+B",
		defaultOther: "Mod+B",
		labelKey: "workbench.tool.projects",
	},
	{
		id: "workspace",
		defaultMac: "Mod+J",
		defaultOther: "Mod+J",
		labelKey: "shell.location.workspace.caption",
	},
	{
		id: "bottom",
		defaultMac: "Mod+Shift+J",
		defaultOther: "Mod+Shift+J",
		labelKey: "workbench.rail.terminal",
	},
	{
		id: "new-workspace",
		defaultMac: "Mod+N",
		defaultOther: "Mod+N",
		labelKey: "shell.location.workspace.new",
	},
	{
		id: "open-settings",
		defaultMac: "Mod+,",
		defaultOther: "Mod+,",
		labelKey: "shell.topbar.settings",
	},
	{
		id: "close-item",
		defaultMac: "Mod+W",
		defaultOther: "Mod+W",
		labelKey: "common.close",
	},
	{
		id: "quit",
		defaultMac: "Mod+Q",
		defaultOther: "Mod+Q",
		labelKey: "shell.quitHint.release",
	},
];

interface ShortcutChord {
	code: string;
	inTerminal: boolean;
}

interface ShortcutCommand {
	id: ShortcutCommandId;
	chords: Partial<Record<ShortcutPlatform, readonly ShortcutChord[]>>;
}

const CLOSE_ITEM_CHORDS: readonly ShortcutChord[] = [
	{ code: "KeyW", inTerminal: false },
	{ code: "F4", inTerminal: true },
];

const OPEN_SETTINGS_CHORDS: readonly ShortcutChord[] = [{ code: "Comma", inTerminal: true }];

const PUNCTUATION: Readonly<Record<string, string>> = { Comma: "," };

const CODE_BY_SYMBOL: Readonly<Record<string, string>> = {
	",": "Comma",
	".": "Period",
	"/": "Slash",
	";": "Semicolon",
	"'": "Quote",
	"[": "BracketLeft",
	"]": "BracketRight",
	"\\": "Backslash",
	"-": "Minus",
	"=": "Equal",
	"`": "Backquote",
};

export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
	{ id: "close-item", chords: { windows: CLOSE_ITEM_CHORDS, linux: CLOSE_ITEM_CHORDS } },
	{ id: "quit", chords: { linux: [{ code: "KeyQ", inTerminal: true }] } },
	{ id: "open-settings", chords: { windows: OPEN_SETTINGS_CHORDS, linux: OPEN_SETTINGS_CHORDS } },
];

export function hasWebShortcuts(
	platform: ShortcutPlatform,
	customKeybindings: Readonly<Record<string, string>> = useAppStore.getState().customKeybindings,
) {
	return SHORTCUT_COMMANDS.some(
		(command) =>
			Boolean(customKeybindings[command.id]?.trim()) || (command.chords[platform]?.length ?? 0) > 0,
	);
}

export function shortcutPlatform(hasNativeBridge: boolean, platform?: string): ShortcutPlatform {
	if (!hasNativeBridge) return "browser";
	const family = platformFamily(platform);
	return family === "other" ? "browser" : family;
}

export type KeybindingEvent = Pick<
	KeyboardEvent,
	"code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
> & {
	key?: string;
};

type ChordEvent = Pick<
	KeyboardEvent,
	"code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

export function matchesCustomKeybinding(
	event: KeybindingEvent,
	chord: string,
	platform?: string,
): boolean {
	const trimmed = chord.trim();
	if (!trimmed) return false;
	const parts = trimmed
		.split("+")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (parts.length === 0) return false;
	const isMac = platform === "apple" || platformFamily(platform) === "apple";
	let wantCtrl = false;
	let wantMeta = false;
	let wantAlt = false;
	let wantShift = false;
	let keyToken: string | null = null;
	for (const part of parts) {
		const lower = part.toLowerCase();
		if (lower === "mod" || lower === "cmdorctrl") {
			if (isMac) wantMeta = true;
			else wantCtrl = true;
		} else if (lower === "ctrl" || lower === "control") {
			wantCtrl = true;
		} else if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "super") {
			wantMeta = true;
		} else if (lower === "alt" || lower === "opt" || lower === "option") {
			wantAlt = true;
		} else if (lower === "shift") {
			wantShift = true;
		} else {
			keyToken = part;
		}
	}
	if (!keyToken) return false;
	if (
		Boolean(event.ctrlKey) !== wantCtrl ||
		Boolean(event.metaKey) !== wantMeta ||
		Boolean(event.altKey) !== wantAlt ||
		Boolean(event.shiftKey) !== wantShift
	) {
		return false;
	}
	if (/^[a-z]$/i.test(keyToken)) {
		const upper = keyToken.toUpperCase();
		if (typeof event.key === "string" && /^[a-z]$/i.test(event.key)) {
			return event.key.toUpperCase() === upper;
		}
		return event.code === `Key${upper}`;
	}
	if (/^[0-9]$/.test(keyToken)) {
		return event.code === `Digit${keyToken}` || event.key === keyToken;
	}
	const symbolCode = CODE_BY_SYMBOL[keyToken];
	if (symbolCode) {
		if (typeof event.key === "string" && /^[!-~]$/.test(event.key)) {
			return event.key === keyToken;
		}
		return event.code === symbolCode;
	}
	if (keyToken.toLowerCase() === "space") {
		return event.code === "Space" || event.key === " ";
	}
	return (
		event.code.toLowerCase() === keyToken.toLowerCase() ||
		(typeof event.key === "string" && event.key.toLowerCase() === keyToken.toLowerCase())
	);
}

function chordMatches(chord: ShortcutChord, event: ChordEvent) {
	const letter = /^Key([A-Z])$/.exec(chord.code)?.[1];
	if (letter && /^[a-z]$/i.test(event.key)) {
		return !event.shiftKey && event.key.toUpperCase() === letter;
	}
	const character = PUNCTUATION[chord.code];
	if (character && /^[!-~]$/.test(event.key)) return event.key === character;
	return !event.shiftKey && chord.code === event.code;
}

export function matchShortcut(
	event: ChordEvent,
	platform: ShortcutPlatform,
	inTerminal: () => boolean,
	customKeybindings: Readonly<Record<string, string>> = useAppStore.getState().customKeybindings,
): ShortcutCommandId | null {
	const defaultModifiers = event.ctrlKey && !event.metaKey && !event.altKey;
	for (const command of SHORTCUT_COMMANDS) {
		const custom = customKeybindings[command.id]?.trim();
		if (custom) {
			if (
				matchesCustomKeybinding(event, custom, platform) &&
				(command.id !== "close-item" || !inTerminal())
			) {
				return command.id;
			}
			continue;
		}
		if (!defaultModifiers) continue;
		const chord = command.chords[platform]?.find((candidate) => chordMatches(candidate, event));
		if (chord && (chord.inTerminal || !inTerminal())) return command.id;
	}
	return null;
}

type ShortcutKeyEvent = ChordEvent &
	Pick<KeyboardEvent, "repeat" | "target" | "preventDefault" | "stopPropagation">;

export interface WebShortcutsOptions extends Pick<QuitConfirmationDependencies, "now" | "every"> {
	platform: ShortcutPlatform;
	closeItem(): void;
	openSettings(): void;
	quit(): void;
	onQuitHint(hint: NativeQuitHint): void;
	isInTerminal(target: EventTarget | null): boolean;
}

export function createWebShortcuts(options: WebShortcutsOptions) {
	let quitHeldCode: string | null = null;
	const quitConfirmation = createQuitConfirmation({
		readHeld: () => quitHeldCode !== null,
		canShowHint: () => true,
		quit: options.quit,
		onHint: options.onQuitHint,
		now: options.now,
		every: options.every,
	});
	const handlers: Record<ShortcutCommandId, () => void> = {
		"close-item": options.closeItem,
		"open-settings": options.openSettings,
		quit: () => quitConfirmation.press(true),
	};

	function keydown(event: ShortcutKeyEvent) {
		const id = matchShortcut(event, options.platform, () => options.isInTerminal(event.target));
		if (!id) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.repeat) return;
		if (id === "quit") quitHeldCode = event.code;
		handlers[id]();
	}

	function keyup(event: Pick<KeyboardEvent, "code" | "key">) {
		if (quitHeldCode === null || (event.code !== quitHeldCode && event.key !== "Control")) return;
		quitHeldCode = null;
		quitConfirmation.sync();
	}

	function cancel() {
		quitHeldCode = null;
		quitConfirmation.cancel();
	}

	function resetQuit() {
		quitHeldCode = null;
		quitConfirmation.reset();
	}

	return { keydown, keyup, cancel, resetQuit, run: (id: NativeCommand) => handlers[id]() };
}
