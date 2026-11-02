import { useEffect, useInsertionEffect, useRef } from "react";
import { hasPlatformModifier } from "../lib";
import { useAppStore } from "../store";
import { matchesCustomKeybinding } from "./shortcutCommands";
import { hasLayer, MODAL_LAYER_SELECTOR } from "./shortcutLayers";

type GlobalHotkeyActions = {
	onProjects: () => void;
	onWorkspace?: () => void;
	onBottom?: () => void;
	onNewWorkspace?: () => void;
};

type GlobalHotkeyCommand = "projects" | "workspace" | "bottom" | "new-workspace";

type GlobalHotkeyAvailability = {
	projects: boolean;
	workspace: boolean;
	bottom: boolean;
	newWorkspace: boolean;
};

type GlobalHotkeyEvent = Pick<
	KeyboardEvent,
	"altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
> & {
	key?: string;
};

export function globalHotkeyCommand(
	event: GlobalHotkeyEvent,
	available: GlobalHotkeyAvailability,
	modalOpen: boolean,
	platform?: string,
	customKeybindings: Readonly<Record<string, string>> = useAppStore.getState().customKeybindings,
): GlobalHotkeyCommand | null {
	if (modalOpen) return null;
	const entries: readonly [GlobalHotkeyCommand, boolean][] = [
		["new-workspace", available.newWorkspace],
		["projects", available.projects],
		["workspace", available.workspace],
		["bottom", available.bottom],
	];
	for (const [command, isAvailable] of entries) {
		const custom = customKeybindings[command]?.trim();
		if (custom) {
			if (isAvailable && matchesCustomKeybinding(event, custom, platform)) return command;
		}
	}
	if (!hasPlatformModifier(event, platform)) return null;
	if (
		!customKeybindings["new-workspace"]?.trim() &&
		!event.shiftKey &&
		event.code === "KeyN" &&
		available.newWorkspace
	) {
		return "new-workspace";
	}
	if (event.altKey) return null;
	if (
		!customKeybindings.projects?.trim() &&
		!event.shiftKey &&
		event.code === "KeyB" &&
		available.projects
	) {
		return "projects";
	}
	if (
		!customKeybindings.workspace?.trim() &&
		!event.shiftKey &&
		event.code === "KeyJ" &&
		available.workspace
	) {
		return "workspace";
	}
	if (
		!customKeybindings.bottom?.trim() &&
		event.shiftKey &&
		event.code === "KeyJ" &&
		available.bottom
	) {
		return "bottom";
	}
	return null;
}

function hasOpenModal(): boolean {
	return hasLayer(globalThis.document, MODAL_LAYER_SELECTOR);
}

export function useGlobalHotkeys(actions: GlobalHotkeyActions): void {
	const actionsRef = useRef(actions);
	useInsertionEffect(() => {
		actionsRef.current = actions;
	});

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const command = globalHotkeyCommand(
				event,
				{
					projects: true,
					workspace: actionsRef.current.onWorkspace !== undefined,
					bottom: actionsRef.current.onBottom !== undefined,
					newWorkspace: actionsRef.current.onNewWorkspace !== undefined,
				},
				hasOpenModal(),
			);
			if (command) {
				event.preventDefault();
				event.stopPropagation();
				if (!event.repeat) {
					if (command === "projects") actionsRef.current.onProjects();
					else if (command === "workspace") actionsRef.current.onWorkspace?.();
					else if (command === "bottom") actionsRef.current.onBottom?.();
					else actionsRef.current.onNewWorkspace?.();
				}
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, []);
}
