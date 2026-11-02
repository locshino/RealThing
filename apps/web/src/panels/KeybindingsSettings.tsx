import { RiKeyboardBoxLine, RiRestartLine } from "@remixicon/react";
import type { MessageKey } from "@realthing/locales";
import { useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import { useEffect, useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";

export type KeybindingCommandId =
	| "new-workspace"
	| "projects"
	| "workspace"
	| "bottom"
	| "close-item"
	| "open-settings"
	| "quit";

export interface KeybindingSpec {
	id: KeybindingCommandId;
	labelKey: MessageKey;
	defaultBinding: string;
}

export const KEYBINDING_SPECS: readonly KeybindingSpec[] = [
	{
		id: "new-workspace",
		labelKey: "settings.keybindings.command.newWorkspace",
		defaultBinding: "Mod+N",
	},
	{
		id: "projects",
		labelKey: "settings.keybindings.command.projects",
		defaultBinding: "Mod+B",
	},
	{
		id: "workspace",
		labelKey: "settings.keybindings.command.workspace",
		defaultBinding: "Mod+J",
	},
	{
		id: "bottom",
		labelKey: "settings.keybindings.command.bottom",
		defaultBinding: "Mod+Shift+J",
	},
	{
		id: "close-item",
		labelKey: "settings.keybindings.command.closeItem",
		defaultBinding: "Mod+W",
	},
	{
		id: "open-settings",
		labelKey: "settings.keybindings.command.openSettings",
		defaultBinding: "Mod+,",
	},
	{
		id: "quit",
		labelKey: "settings.keybindings.command.quit",
		defaultBinding: "Mod+Q",
	},
];

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function formatRecordedKeybinding(
	event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): string | null {
	if (MODIFIER_KEYS.has(event.key)) return null;
	const parts: string[] = [];
	if (event.metaKey || event.ctrlKey) parts.push("Mod");
	if (event.shiftKey) parts.push("Shift");
	if (event.altKey) parts.push("Alt");
	const key =
		event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
	parts.push(key);
	return parts.join("+");
}

export function KeybindingsSettings() {
	const t = useT();
	const customKeybindings = useAppStore((s) => s.customKeybindings);
	const [recordingId, setRecordingId] = useState<KeybindingCommandId | null>(null);

	const updateKeybindings = (next: Record<string, string>) => {
		getTransport()
			.request("settings.update", { config: { customKeybindings: next } })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.keybindings.changeFailed")));
	};

	useEffect(() => {
		if (!recordingId) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (MODIFIER_KEYS.has(event.key)) return;
			event.preventDefault();
			event.stopPropagation();
			if (
				event.key === "Escape" &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.shiftKey &&
				!event.altKey
			) {
				setRecordingId(null);
				return;
			}
			const recorded = formatRecordedKeybinding(event);
			if (!recorded) return;
			const current = useAppStore.getState().customKeybindings;
			getTransport()
				.request("settings.update", {
					config: { customKeybindings: { ...current, [recordingId]: recorded } },
				})
				.catch((err: unknown) =>
					toast.error(errorText(err), t("settings.keybindings.changeFailed")),
				);
			setRecordingId(null);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [recordingId, t]);

	const resetBinding = (id: KeybindingCommandId) => {
		const next: Record<string, string> = {};
		for (const [key, value] of Object.entries(customKeybindings)) {
			if (key !== id) next[key] = value;
		}
		updateKeybindings(next);
	};

	const resetAll = () => {
		updateKeybindings({});
	};

	const hasCustomOverrides = Object.keys(customKeybindings).length > 0;

	return (
		<SettingsPageContainer testId="settings-keybindings">
			<SettingsGroup
				title={t("settings.keybindings.groupTitle")}
				description={t("settings.keybindings.description")}
			>
				{KEYBINDING_SPECS.map(({ id, labelKey, defaultBinding }) => {
					const commandLabel = t(labelKey);
					const currentBinding = customKeybindings[id] ?? defaultBinding;
					const isCustom = customKeybindings[id] !== undefined;
					const isRecording = recordingId === id;
					return (
						<SettingsRow
							key={id}
							testId={`keybinding-row-${id}`}
							label={commandLabel}
							control={
								<div className="flex items-center gap-8">
									<kbd
										data-testid={`keybinding-value-${id}`}
										data-custom={isCustom}
										className="inline-flex h-24 items-center rounded-sm border border-border-default bg-control-bg px-8 tr-code-text text-text-default"
									>
										{currentBinding}
									</kbd>
									<Button
										variant={isRecording ? "primary" : "outline"}
										size="m"
										iconLeft={RiKeyboardBoxLine}
										selected={isRecording}
										aria-label={t("settings.keybindings.recordLabel", { command: commandLabel })}
										data-testid={`keybinding-record-${id}`}
										data-settings-draft-input={isRecording ? "" : undefined}
										onClick={() => setRecordingId(isRecording ? null : id)}
									>
										{isRecording
											? t("settings.keybindings.recording")
											: t("settings.keybindings.record")}
									</Button>
									<Button
										variant="ghost"
										size="m"
										iconLeft={RiRestartLine}
										disabled={!isCustom}
										aria-label={t("settings.keybindings.resetLabel", { command: commandLabel })}
										data-testid={`keybinding-reset-${id}`}
										onClick={() => resetBinding(id)}
									>
										{t("settings.keybindings.reset")}
									</Button>
								</div>
							}
						/>
					);
				})}
				<div className="flex justify-end pt-12">
					<Button
						variant="ghost"
						size="l"
						iconLeft={RiRestartLine}
						disabled={!hasCustomOverrides}
						data-testid="keybindings-reset-all"
						onClick={resetAll}
					>
						{t("settings.keybindings.resetAll")}
					</Button>
				</div>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
