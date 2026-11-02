import { RiAddLine, RiCloseLine, RiFileSettingsLine, RiRestartLine } from "@remixicon/react";
import {
	type AppConfigUpdate,
	DEFAULT_FILES_EXCLUDE,
	type ExplorerSortOrder,
	PROJECT_SETTINGS_PATH,
} from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import { useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { openFileInTab } from "./openTabs";
import { SegmentedControl } from "./SegmentedControl";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

export function FilesSettings() {
	const t = useT();
	const explorerSortOrder = useAppStore((s) => s.explorerSortOrder);
	const explorerCompactFolders = useAppStore((s) => s.explorerCompactFolders);
	const filesShowHidden = useAppStore((s) => s.filesShowHidden);
	const filesExclude = useAppStore((s) => s.filesExclude);
	const filesAssociations = useAppStore((s) => s.filesAssociations);
	const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

	const [excludeDraft, setExcludeDraft] = useState("");
	const [extDraft, setExtDraft] = useState("");
	const [mimeDraft, setMimeDraft] = useState("");

	const update = (config: AppConfigUpdate) => {
		getTransport()
			.request("settings.update", { config })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.files.changeFailed")));
	};

	const addExcludedPattern = () => {
		const pattern = excludeDraft.trim();
		if (!pattern) return;
		if (!filesExclude.includes(pattern)) {
			update({ filesExclude: [...filesExclude, pattern] });
		}
		setExcludeDraft("");
	};

	const removeExcludedPattern = (pattern: string) => {
		update({ filesExclude: filesExclude.filter((entry) => entry !== pattern) });
	};

	const resetExcludedPatterns = () => {
		update({ filesExclude: [...DEFAULT_FILES_EXCLUDE] });
	};

	const addAssociation = () => {
		const rawExt = extDraft.trim();
		const mime = mimeDraft.trim();
		if (!rawExt || !mime) return;
		const ext = rawExt.startsWith(".") ? rawExt : `.${rawExt}`;
		update({ filesAssociations: { ...filesAssociations, [ext]: mime } });
		setExtDraft("");
		setMimeDraft("");
	};

	const removeAssociation = (ext: string) => {
		const next: Record<string, string> = {};
		for (const [key, value] of Object.entries(filesAssociations)) {
			if (key !== ext) next[key] = value;
		}
		update({ filesAssociations: next });
	};

	const associationEntries = Object.entries(filesAssociations);

	return (
		<SettingsPageContainer testId="settings-files">
			<SettingsGroup title={t("settings.files.explorerGroup")}>
				<SettingsRow
					label={t("settings.files.sortOrder")}
					description={t("settings.files.sortOrderDescription")}
					control={
						<SegmentedControl<ExplorerSortOrder>
							name="explorer-sort-order"
							label={t("settings.files.sortOrder")}
							options={[
								{
									id: "default",
									label: t("settings.files.sortOrder.default"),
									testId: "explorer-sort-order-default",
								},
								{
									id: "mixed",
									label: t("settings.files.sortOrder.mixed"),
									testId: "explorer-sort-order-mixed",
								},
								{
									id: "filesFirst",
									label: t("settings.files.sortOrder.filesFirst"),
									testId: "explorer-sort-order-filesFirst",
								},
								{
									id: "type",
									label: t("settings.files.sortOrder.type"),
									testId: "explorer-sort-order-type",
								},
							]}
							value={explorerSortOrder}
							onSelect={(next) => {
								if (next !== explorerSortOrder) update({ explorerSortOrder: next });
							}}
							testId="explorer-sort-order-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.files.compactFolders")}
					description={t("settings.files.compactFoldersDescription")}
					control={
						<SettingsSwitch
							checked={explorerCompactFolders}
							label={t("settings.files.compactFolders")}
							testId="explorer-compact-folders-switch"
							onChange={(next) => update({ explorerCompactFolders: next })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.files.showHidden")}
					description={t("settings.files.showHiddenDescription")}
					control={
						<SettingsSwitch
							checked={filesShowHidden}
							label={t("settings.files.showHidden")}
							testId="files-show-hidden-switch"
							onChange={(next) => update({ filesShowHidden: next })}
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup
				title={t("settings.files.excludeGroup")}
				description={t("settings.files.excludeDescription")}
			>
				<div className="flex flex-col gap-8 border-border-muted border-b py-12">
					{filesExclude.length === 0 ? (
						<span className="tr-text-metadata text-text-muted">
							{t("settings.files.excludeEmpty")}
						</span>
					) : (
						<div className="flex flex-wrap gap-6" data-testid="files-exclude-list">
							{filesExclude.map((pattern) => (
								<span
									key={pattern}
									data-testid={`files-exclude-item-${pattern}`}
									className="inline-flex items-center gap-4 rounded-sm border border-border-default bg-control-bg py-2 pr-4 pl-8 tr-code-text text-text-default"
								>
									<span>{pattern}</span>
									<button
										type="button"
										aria-label={t("settings.files.removeExclude", { pattern })}
										data-testid={`files-exclude-remove-${pattern}`}
										onClick={() => removeExcludedPattern(pattern)}
										className="inline-flex size-20 items-center justify-center rounded-sm text-text-muted outline-none transition-colors hover:bg-control-bg-hovered hover:text-text-default focus-visible:ring-2 focus-visible:ring-primary"
									>
										<RiCloseLine className="size-14" aria-hidden />
									</button>
								</span>
							))}
						</div>
					)}
					<div className="flex flex-wrap items-center gap-8 pt-4">
						<input
							type="text"
							value={excludeDraft}
							placeholder={t("settings.files.excludePlaceholder")}
							aria-label={t("settings.files.excludeInputLabel")}
							data-testid="files-exclude-input"
							data-settings-draft-input
							onChange={(event) => setExcludeDraft(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									addExcludedPattern();
								} else if (event.key === "Escape") {
									setExcludeDraft("");
								}
							}}
							className="h-32 w-160 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
						<Button
							variant="outline"
							size="l"
							iconLeft={RiAddLine}
							disabled={!excludeDraft.trim()}
							data-testid="files-exclude-add"
							onClick={addExcludedPattern}
						>
							{t("settings.files.addExclude")}
						</Button>
						<Button
							variant="ghost"
							size="l"
							iconLeft={RiRestartLine}
							data-testid="files-exclude-reset"
							onClick={resetExcludedPatterns}
						>
							{t("settings.files.resetExclude")}
						</Button>
					</div>
				</div>
			</SettingsGroup>

			<SettingsGroup
				title={t("settings.files.associationsGroup")}
				description={t("settings.files.associationsDescription")}
			>
				<div className="flex flex-col gap-8 border-border-muted border-b py-12">
					{associationEntries.length === 0 ? (
						<span className="tr-text-metadata text-text-muted">
							{t("settings.files.associationsEmpty")}
						</span>
					) : (
						<div className="flex flex-col gap-4" data-testid="files-associations-list">
							{associationEntries.map(([ext, mime]) => (
								<div
									key={ext}
									data-testid={`files-association-item-${ext}`}
									className="flex items-center justify-between gap-8 rounded-sm border border-border-default bg-control-bg px-8 py-4"
								>
									<span className="flex items-center gap-8 tr-code-text text-text-default">
										<span>{ext}</span>
										<span className="text-text-muted">{t("settings.files.associationArrow")}</span>
										<span>{mime}</span>
									</span>
									<button
										type="button"
										aria-label={t("settings.files.removeAssociation", { ext })}
										data-testid={`files-association-remove-${ext}`}
										onClick={() => removeAssociation(ext)}
										className="inline-flex size-20 items-center justify-center rounded-sm text-text-muted outline-none transition-colors hover:bg-control-bg-hovered hover:text-text-default focus-visible:ring-2 focus-visible:ring-primary"
									>
										<RiCloseLine className="size-14" aria-hidden />
									</button>
								</div>
							))}
						</div>
					)}
					<div className="flex flex-wrap items-center gap-8 pt-4">
						<input
							type="text"
							value={extDraft}
							placeholder={t("settings.files.associationExtPlaceholder")}
							aria-label={t("settings.files.associationExtLabel")}
							data-testid="files-association-ext-input"
							data-settings-draft-input
							onChange={(event) => setExtDraft(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									addAssociation();
								} else if (event.key === "Escape") {
									setExtDraft("");
								}
							}}
							className="h-32 w-96 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
						<input
							type="text"
							value={mimeDraft}
							placeholder={t("settings.files.associationMimePlaceholder")}
							aria-label={t("settings.files.associationMimeLabel")}
							data-testid="files-association-mime-input"
							data-settings-draft-input
							onChange={(event) => setMimeDraft(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									addAssociation();
								} else if (event.key === "Escape") {
									setMimeDraft("");
								}
							}}
							className="h-32 w-160 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
						<Button
							variant="outline"
							size="l"
							iconLeft={RiAddLine}
							disabled={!extDraft.trim() || !mimeDraft.trim()}
							data-testid="files-association-add"
							onClick={addAssociation}
						>
							{t("settings.files.addAssociation")}
						</Button>
					</div>
				</div>
			</SettingsGroup>

			<SettingsGroup title={t("settings.files.projectOverrideGroup")}>
				<SettingsRow
					label={t("settings.files.projectOverrideLabel")}
					description={t("settings.files.projectOverrideDescription")}
					control={
						<Button
							variant="outline"
							size="l"
							iconLeft={RiFileSettingsLine}
							disabled={!activeWorkspaceId}
							data-testid="open-project-settings-button"
							onClick={() => {
								if (!activeWorkspaceId) return;
								void openFileInTab(activeWorkspaceId, PROJECT_SETTINGS_PATH, "keep");
								useAppStore.getState().closeSettings();
							}}
						>
							{t("settings.files.openProjectSettings")}
						</Button>
					}
				/>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
