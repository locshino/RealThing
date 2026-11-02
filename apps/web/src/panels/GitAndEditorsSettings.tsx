import {
	type AppConfigUpdate,
	GIT_COMMIT_LIST_MAX,
	isGitCommitListMax,
} from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { useEffect, useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

function parseInteger(draft: string): number | null {
	if (!/^\d+$/.test(draft.trim())) return null;
	return Number(draft.trim());
}

export function GitAndEditorsSettings() {
	const t = useT();
	const gitCommitVerify = useAppStore((s) => s.gitCommitVerify);
	const gitCommitListMax = useAppStore((s) => s.gitCommitListMax);
	const externalEditorCustomBin = useAppStore((s) => s.externalEditorCustomBin);

	const [maxDraft, setMaxDraft] = useState(String(gitCommitListMax));
	const [editorBinDraft, setEditorBinDraft] = useState(externalEditorCustomBin);

	useEffect(() => {
		setMaxDraft(String(gitCommitListMax));
	}, [gitCommitListMax]);

	useEffect(() => {
		setEditorBinDraft(externalEditorCustomBin);
	}, [externalEditorCustomBin]);

	const update = (config: AppConfigUpdate) => {
		getTransport()
			.request("settings.update", { config })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.git.changeFailed")));
	};

	const parsedMax = parseInteger(maxDraft);
	const maxInvalid = parsedMax === null || !isGitCommitListMax(parsedMax);
	const commitMax = () => {
		if (parsedMax === null || !isGitCommitListMax(parsedMax)) return;
		if (parsedMax === gitCommitListMax) return;
		update({ gitCommitListMax: parsedMax });
	};

	const commitEditorBin = () => {
		const trimmed = editorBinDraft.trim();
		if (trimmed === externalEditorCustomBin) return;
		update({ externalEditorCustomBin: trimmed });
	};

	return (
		<SettingsPageContainer testId="settings-git">
			<SettingsGroup title={t("settings.git.groupTitle")}>
				<SettingsRow
					label={t("settings.git.commitVerify")}
					description={t("settings.git.commitVerifyDescription")}
					control={
						<SettingsSwitch
							checked={gitCommitVerify}
							label={t("settings.git.commitVerify")}
							testId="git-commit-verify-switch"
							onChange={(next) => update({ gitCommitVerify: next })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.git.commitListMax")}
					description={
						<>
							{t("settings.git.commitListMaxDescription")}
							{maxInvalid ? (
								<span
									id="git-commit-list-max-error"
									data-testid="git-commit-list-max-error"
									className="block text-feedback-error tr-text-metadata"
								>
									{t("settings.git.invalidRange", {
										min: GIT_COMMIT_LIST_MAX.min,
										max: GIT_COMMIT_LIST_MAX.max,
									})}
								</span>
							) : null}
						</>
					}
					control={
						<input
							type="number"
							min={GIT_COMMIT_LIST_MAX.min}
							max={GIT_COMMIT_LIST_MAX.max}
							step={10}
							inputMode="numeric"
							value={maxDraft}
							aria-label={t("settings.git.commitListMax")}
							aria-invalid={maxInvalid}
							aria-describedby={maxInvalid ? "git-commit-list-max-error" : undefined}
							data-testid="git-commit-list-max-input"
							data-settings-draft-input
							onChange={(event) => setMaxDraft(event.currentTarget.value)}
							onBlur={commitMax}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitMax();
								} else if (event.key === "Escape") {
									setMaxDraft(String(gitCommitListMax));
								}
							}}
							className="h-32 w-96 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-feedback-error"
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.git.editorsGroupTitle")}>
				<SettingsRow
					label={t("settings.git.externalEditorCustomBin")}
					description={t("settings.git.externalEditorDescription")}
					control={
						<input
							type="text"
							value={editorBinDraft}
							placeholder={t("settings.git.externalEditorPlaceholder")}
							aria-label={t("settings.git.externalEditorCustomBin")}
							data-testid="external-editor-custom-bin-input"
							data-settings-draft-input
							onChange={(event) => setEditorBinDraft(event.currentTarget.value)}
							onBlur={commitEditorBin}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitEditorBin();
								} else if (event.key === "Escape") {
									setEditorBinDraft(externalEditorCustomBin);
								}
							}}
							className="h-32 w-192 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
					}
				/>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
