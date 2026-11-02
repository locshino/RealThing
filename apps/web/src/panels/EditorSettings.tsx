import {
	type AppConfigUpdate,
	EDITOR_AUTO_SAVE_DELAY_MS,
	EDITOR_FONT_SIZE,
	type EditorCursorStyle,
	type EditorLineNumbersMode,
	type EditorRenderWhitespace,
	type EditorTabSize,
	isEditorAutoSaveDelayMs,
	isEditorFontSize,
} from "@realthing/contracts";
import { useT } from "@realthing/locales/react";
import { useEffect, useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { LineWidthControl } from "./LineWidthSettings";
import { SegmentedControl } from "./SegmentedControl";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

type TabSizeOption = "2" | "4" | "8";

function parseInteger(draft: string): number | null {
	if (!/^\d+$/.test(draft.trim())) return null;
	return Number(draft.trim());
}

export function EditorSettings() {
	const t = useT();
	const editorFontSize = useAppStore((s) => s.editorFontSize);
	const editorTabSize = useAppStore((s) => s.editorTabSize);
	const editorInsertSpaces = useAppStore((s) => s.editorInsertSpaces);
	const editorLineNumbers = useAppStore((s) => s.editorLineNumbers);
	const editorRenderWhitespace = useAppStore((s) => s.editorRenderWhitespace);
	const editorCursorStyle = useAppStore((s) => s.editorCursorStyle);
	const editorMinimap = useAppStore((s) => s.editorMinimap);
	const editorAutoSaveDelayMs = useAppStore((s) => s.editorAutoSaveDelayMs);

	const [fontSizeDraft, setFontSizeDraft] = useState(String(editorFontSize));
	const [autoSaveDraft, setAutoSaveDraft] = useState(String(editorAutoSaveDelayMs));

	useEffect(() => {
		setFontSizeDraft(String(editorFontSize));
	}, [editorFontSize]);

	useEffect(() => {
		setAutoSaveDraft(String(editorAutoSaveDelayMs));
	}, [editorAutoSaveDelayMs]);

	const update = (config: AppConfigUpdate) => {
		getTransport()
			.request("settings.update", { config })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.editor.changeFailed")));
	};

	const parsedFontSize = parseInteger(fontSizeDraft);
	const fontSizeInvalid = parsedFontSize === null || !isEditorFontSize(parsedFontSize);
	const commitFontSize = () => {
		if (parsedFontSize === null || !isEditorFontSize(parsedFontSize)) return;
		if (parsedFontSize === editorFontSize) return;
		update({ editorFontSize: parsedFontSize });
	};

	const parsedAutoSave = parseInteger(autoSaveDraft);
	const autoSaveInvalid = parsedAutoSave === null || !isEditorAutoSaveDelayMs(parsedAutoSave);
	const commitAutoSave = () => {
		if (parsedAutoSave === null || !isEditorAutoSaveDelayMs(parsedAutoSave)) return;
		if (parsedAutoSave === editorAutoSaveDelayMs) return;
		update({ editorAutoSaveDelayMs: parsedAutoSave });
	};

	return (
		<SettingsPageContainer testId="settings-editor">
			<SettingsGroup title={t("settings.editor.displayGroup")}>
				<LineWidthControl kind="file" />
				<SettingsRow
					label={t("settings.editor.fontSize")}
					description={
						<>
							{t("settings.editor.fontSizeDescription")}
							{fontSizeInvalid ? (
								<span
									id="editor-font-size-error"
									data-testid="editor-font-size-error"
									className="block text-feedback-error tr-text-metadata"
								>
									{t("settings.editor.invalidRange", {
										min: EDITOR_FONT_SIZE.min,
										max: EDITOR_FONT_SIZE.max,
									})}
								</span>
							) : null}
						</>
					}
					control={
						<input
							type="number"
							min={EDITOR_FONT_SIZE.min}
							max={EDITOR_FONT_SIZE.max}
							step={1}
							inputMode="numeric"
							value={fontSizeDraft}
							aria-label={t("settings.editor.fontSize")}
							aria-invalid={fontSizeInvalid}
							aria-describedby={fontSizeInvalid ? "editor-font-size-error" : undefined}
							data-testid="editor-font-size-input"
							data-settings-draft-input
							onChange={(event) => setFontSizeDraft(event.currentTarget.value)}
							onBlur={commitFontSize}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitFontSize();
								} else if (event.key === "Escape") {
									setFontSizeDraft(String(editorFontSize));
								}
							}}
							className="h-32 w-80 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-feedback-error"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.lineNumbers")}
					control={
						<SegmentedControl<EditorLineNumbersMode>
							name="editor-line-numbers"
							label={t("settings.editor.lineNumbers")}
							options={[
								{
									id: "on",
									label: t("settings.editor.lineNumbers.on"),
									testId: "editor-line-numbers-on",
								},
								{
									id: "off",
									label: t("settings.editor.lineNumbers.off"),
									testId: "editor-line-numbers-off",
								},
								{
									id: "relative",
									label: t("settings.editor.lineNumbers.relative"),
									testId: "editor-line-numbers-relative",
								},
							]}
							value={editorLineNumbers}
							onSelect={(next) => {
								if (next !== editorLineNumbers) update({ editorLineNumbers: next });
							}}
							testId="editor-line-numbers-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.renderWhitespace")}
					control={
						<SegmentedControl<EditorRenderWhitespace>
							name="editor-render-whitespace"
							label={t("settings.editor.renderWhitespace")}
							options={[
								{
									id: "none",
									label: t("settings.editor.renderWhitespace.none"),
									testId: "editor-render-whitespace-none",
								},
								{
									id: "boundary",
									label: t("settings.editor.renderWhitespace.boundary"),
									testId: "editor-render-whitespace-boundary",
								},
								{
									id: "selection",
									label: t("settings.editor.renderWhitespace.selection"),
									testId: "editor-render-whitespace-selection",
								},
								{
									id: "all",
									label: t("settings.editor.renderWhitespace.all"),
									testId: "editor-render-whitespace-all",
								},
							]}
							value={editorRenderWhitespace}
							onSelect={(next) => {
								if (next !== editorRenderWhitespace) update({ editorRenderWhitespace: next });
							}}
							testId="editor-render-whitespace-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.cursorStyle")}
					control={
						<SegmentedControl<EditorCursorStyle>
							name="editor-cursor-style"
							label={t("settings.editor.cursorStyle")}
							options={[
								{
									id: "line",
									label: t("settings.editor.cursorStyle.line"),
									testId: "editor-cursor-style-line",
								},
								{
									id: "block",
									label: t("settings.editor.cursorStyle.block"),
									testId: "editor-cursor-style-block",
								},
								{
									id: "underline",
									label: t("settings.editor.cursorStyle.underline"),
									testId: "editor-cursor-style-underline",
								},
							]}
							value={editorCursorStyle}
							onSelect={(next) => {
								if (next !== editorCursorStyle) update({ editorCursorStyle: next });
							}}
							testId="editor-cursor-style-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.minimap")}
					description={t("settings.editor.minimapDescription")}
					control={
						<SettingsSwitch
							checked={editorMinimap}
							label={t("settings.editor.minimap")}
							testId="editor-minimap-switch"
							onChange={(next) => update({ editorMinimap: next })}
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.editor.formattingGroup")}>
				<SettingsRow
					label={t("settings.editor.tabSize")}
					description={t("settings.editor.tabSizeDescription")}
					control={
						<SegmentedControl<TabSizeOption>
							name="editor-tab-size"
							label={t("settings.editor.tabSize")}
							options={[
								{ id: "2", label: t("settings.editor.tabSize.2"), testId: "editor-tab-size-2" },
								{ id: "4", label: t("settings.editor.tabSize.4"), testId: "editor-tab-size-4" },
								{ id: "8", label: t("settings.editor.tabSize.8"), testId: "editor-tab-size-8" },
							]}
							value={String(editorTabSize) as TabSizeOption}
							onSelect={(next) => {
								const numeric = Number(next) as EditorTabSize;
								if (numeric !== editorTabSize) update({ editorTabSize: numeric });
							}}
							testId="editor-tab-size-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.insertSpaces")}
					description={t("settings.editor.insertSpacesDescription")}
					control={
						<SettingsSwitch
							checked={editorInsertSpaces}
							label={t("settings.editor.insertSpaces")}
							testId="editor-insert-spaces-switch"
							onChange={(next) => update({ editorInsertSpaces: next })}
						/>
					}
				/>
				<SettingsRow
					label={t("settings.editor.autoSaveDelay")}
					description={
						<>
							{t("settings.editor.autoSaveDelayDescription")}
							{autoSaveInvalid ? (
								<span
									id="editor-auto-save-delay-error"
									data-testid="editor-auto-save-delay-error"
									className="block text-feedback-error tr-text-metadata"
								>
									{t("settings.editor.invalidRange", {
										min: EDITOR_AUTO_SAVE_DELAY_MS.min,
										max: EDITOR_AUTO_SAVE_DELAY_MS.max,
									})}
								</span>
							) : null}
						</>
					}
					control={
						<input
							type="number"
							min={EDITOR_AUTO_SAVE_DELAY_MS.min}
							max={EDITOR_AUTO_SAVE_DELAY_MS.max}
							step={100}
							inputMode="numeric"
							value={autoSaveDraft}
							aria-label={t("settings.editor.autoSaveDelay")}
							aria-invalid={autoSaveInvalid}
							aria-describedby={autoSaveInvalid ? "editor-auto-save-delay-error" : undefined}
							data-testid="editor-auto-save-delay-input"
							data-settings-draft-input
							onChange={(event) => setAutoSaveDraft(event.currentTarget.value)}
							onBlur={commitAutoSave}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitAutoSave();
								} else if (event.key === "Escape") {
									setAutoSaveDraft(String(editorAutoSaveDelayMs));
								}
							}}
							className="h-32 w-96 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-feedback-error"
						/>
					}
				/>
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
