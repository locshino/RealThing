import { useT } from "@realthing/locales/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@realthing/ui/dialog";
import { cn } from "@realthing/ui/utils";
import type { ReactNode } from "react";
import { SettingsSection, useAppStore } from "@/store";
import { AppearanceSettings } from "./AppearanceSettings";
import { EditorSettings } from "./EditorSettings";
import { FilesSettings } from "./FilesSettings";
import { GitAndEditorsSettings } from "./GitAndEditorsSettings";
import { KeybindingsSettings } from "./KeybindingsSettings";
import { LanguageSettings } from "./LanguageSettings";
import { resolveSettingsSection, visibleSettingsNavGroups } from "./settingsNav";
import { TerminalSettings } from "./TerminalSettings";

export function SettingsDialog({
	layoutSettings,
	updateSettings,
}: {
	layoutSettings: ReactNode;
	updateSettings?: ReactNode;
}) {
	const t = useT();
	const open = useAppStore((s) => s.settingsOpen);
	const section = useAppStore((s) => s.settingsSection);
	const protocolVersion = useAppStore((s) => s.protocolVersion);
	const filteredGroups = visibleSettingsNavGroups(protocolVersion, updateSettings !== undefined);
	const selectedSection = resolveSettingsSection(section, filteredGroups);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) useAppStore.getState().closeSettings();
			}}
		>
			<DialogContent
				data-testid="settings-dialog"
				onEscapeKeyDown={(event) => {
					if (
						document.activeElement instanceof HTMLElement &&
						document.activeElement.hasAttribute("data-settings-draft-input")
					) {
						event.preventDefault();
					}
				}}
				className="flex h-[80vh] max-h-[85vh] w-full max-w-[52rem] flex-col gap-0 overflow-hidden p-0"
			>
				<DialogHeader className="border-border-default border-b px-16 py-12">
					<DialogTitle>{t("settings.dialog.title")}</DialogTitle>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<nav
						aria-label={t("settings.dialog.sectionsLabel")}
						className="flex shrink-0 gap-4 overflow-x-auto border-border-default border-b p-8 md:w-192 md:flex-col md:gap-12 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:bg-container-elevated-bg md:p-12"
					>
						{filteredGroups.map((group) => (
							<div key={group.label} className="flex shrink-0 md:flex-col">
								<span className="hidden h-28 py-4 tr-text-label-pill text-text-subtle uppercase md:block">
									{t(group.label)}
								</span>
								<div className="flex gap-4 md:flex-col md:gap-2">
									{group.sections.map(({ id, label, icon: Icon }) => {
										const active = selectedSection === id;
										return (
											<button
												key={id}
												type="button"
												data-testid={`settings-nav-${id}`}
												data-active={active}
												onClick={() => useAppStore.getState().setSettingsSection(id)}
												className={cn(
													"flex shrink-0 items-center gap-4 rounded-sm px-4 py-4 text-left tr-text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary md:h-28 md:w-full md:px-8 md:py-0",
													active
														? "bg-primary-subtle text-primary"
														: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
												)}
											>
												<Icon className="size-14 shrink-0" />
												{t(label)}
											</button>
										);
									})}
								</div>
							</div>
						))}
					</nav>

					<div className="min-h-0 flex-1 overflow-y-auto p-16">
						{selectedSection === SettingsSection.Appearance ? (
							<AppearanceSettings />
						) : selectedSection === SettingsSection.Editor ? (
							<EditorSettings />
						) : selectedSection === SettingsSection.Files ? (
							<FilesSettings />
						) : selectedSection === SettingsSection.Language ? (
							<LanguageSettings />
						) : selectedSection === SettingsSection.Layout ? (
							layoutSettings
						) : selectedSection === SettingsSection.Terminal ? (
							<TerminalSettings />
						) : selectedSection === SettingsSection.Keybindings ? (
							<KeybindingsSettings />
						) : selectedSection === SettingsSection.Git ? (
							<GitAndEditorsSettings />
						) : selectedSection === SettingsSection.Updates && updateSettings !== undefined ? (
							updateSettings
						) : (
							<AppearanceSettings />
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
