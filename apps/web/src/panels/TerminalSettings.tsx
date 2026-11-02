import {
	type AppConfigUpdate,
	type HostPlatform,
	isTerminalFontSize,
	isTerminalScrollbackLines,
	isTerminalShellArgs,
	TERMINAL_FONT_SIZE,
	TERMINAL_SCROLLBACK_LINES,
	type TerminalCursorStyle,
	type TerminalWindowsShell,
	WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION,
} from "@realthing/contracts";
import type { MessageKey } from "@realthing/locales";
import { useT } from "@realthing/locales/react";
import { useEffect, useState } from "react";
import { toast, useAppStore } from "@/store";
import { errorText, getTransport } from "@/transport";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsRadioCards, type SettingsRadioChoice } from "./SettingsRadioCards";
import { SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

type ScrollbackOption = "0" | "16" | "64" | "256" | "1024";

const SCROLLBACK_OPTIONS: (SegmentedControlOption<ScrollbackOption> & { label: MessageKey })[] = [
	{ id: "0", label: "common.off", testId: "terminal-replay-0" },
	{ id: "16", label: "settings.terminal.scrollback.kb16", testId: "terminal-replay-16" },
	{ id: "64", label: "settings.terminal.scrollback.kb64", testId: "terminal-replay-64" },
	{ id: "256", label: "settings.terminal.scrollback.kb256", testId: "terminal-replay-256" },
	{ id: "1024", label: "settings.terminal.scrollback.mb1", testId: "terminal-replay-1024" },
];

type ShellChoiceSpec = SettingsRadioChoice<TerminalWindowsShell> & {
	label: MessageKey;
	hint?: MessageKey;
	description: MessageKey;
};

const WINDOWS_SHELL_CHOICES: ShellChoiceSpec[] = [
	{
		id: "auto",
		label: "settings.terminal.shell.auto.label",
		hint: "settings.terminal.shell.auto.hint",
		description: "settings.terminal.shell.auto.description",
		testId: "terminal-shell-auto",
	},
	{
		id: "pwsh",
		label: "settings.terminal.shell.pwsh.label",
		description: "settings.terminal.shell.pwsh.description",
		testId: "terminal-shell-pwsh",
	},
	{
		id: "powershell",
		label: "settings.terminal.shell.powershell.label",
		description: "settings.terminal.shell.powershell.description",
		testId: "terminal-shell-powershell",
	},
	{
		id: "cmd",
		label: "settings.terminal.shell.cmd.label",
		description: "settings.terminal.shell.cmd.description",
		testId: "terminal-shell-cmd",
	},
];

function parseInteger(draft: string): number | null {
	if (!/^\d+$/.test(draft.trim())) return null;
	return Number(draft.trim());
}

export function WindowsShellSettings({
	platform,
	protocolVersion,
	value,
	onSelect,
}: {
	platform: HostPlatform | null;
	protocolVersion: number | null;
	value: TerminalWindowsShell;
	onSelect: (shell: TerminalWindowsShell) => void;
}) {
	const t = useT();
	if (
		platform !== "win32" ||
		protocolVersion === null ||
		protocolVersion < WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION
	) {
		return null;
	}
	return (
		<div className="pt-24">
			<div className="flex flex-col">
				<div className="flex flex-col gap-2 pb-8">
					<h3 className="tr-title-section text-text-default">
						{t("settings.terminal.shell.title")}
					</h3>
					<p className="tr-text-metadata text-text-muted">
						{t("settings.terminal.shell.description")}
					</p>
				</div>
				<SettingsRadioCards
					name="terminal-windows-shell"
					label={t("settings.terminal.shell.title")}
					choices={WINDOWS_SHELL_CHOICES.map((choice) => ({
						...choice,
						label: t(choice.label),
						...(choice.hint ? { hint: t(choice.hint) } : {}),
						description: t(choice.description),
					}))}
					value={value}
					onSelect={onSelect}
				/>
			</div>
		</div>
	);
}

export function TerminalSettings() {
	const t = useT();
	const replayKb = useAppStore((s) => s.terminalReplayKb);
	const windowsShell = useAppStore((s) => s.terminalWindowsShell);
	const terminalFontSize = useAppStore((s) => s.terminalFontSize);
	const terminalCursorStyle = useAppStore((s) => s.terminalCursorStyle);
	const terminalCursorBlink = useAppStore((s) => s.terminalCursorBlink);
	const terminalScrollbackLines = useAppStore((s) => s.terminalScrollbackLines);
	const terminalShellPath = useAppStore((s) => s.terminalShellPath);
	const terminalShellArgs = useAppStore((s) => s.terminalShellArgs);
	const hostPlatform = useAppStore((s) => s.hostPlatform);
	const protocolVersion = useAppStore((s) => s.protocolVersion);

	const [fontSizeDraft, setFontSizeDraft] = useState(String(terminalFontSize));
	const [scrollbackLinesDraft, setScrollbackLinesDraft] = useState(String(terminalScrollbackLines));
	const [shellPathDraft, setShellPathDraft] = useState(terminalShellPath);
	const [shellArgsDraft, setShellArgsDraft] = useState(terminalShellArgs.join(" "));

	useEffect(() => {
		setFontSizeDraft(String(terminalFontSize));
	}, [terminalFontSize]);

	useEffect(() => {
		setScrollbackLinesDraft(String(terminalScrollbackLines));
	}, [terminalScrollbackLines]);

	useEffect(() => {
		setShellPathDraft(terminalShellPath);
	}, [terminalShellPath]);

	useEffect(() => {
		setShellArgsDraft(terminalShellArgs.join(" "));
	}, [terminalShellArgs]);

	const update = (config: AppConfigUpdate) => {
		getTransport()
			.request("settings.update", { config })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.terminal.changeFailed")));
	};

	const select = (kb: number) => {
		if (kb === replayKb) return;
		getTransport()
			.request("settings.update", { config: { terminalReplayKb: kb } })
			.catch(() => toast.error(t("settings.terminal.replayFailed")));
	};

	const selectWindowsShell = (shell: TerminalWindowsShell) => {
		if (shell === windowsShell) return;
		getTransport()
			.request("settings.update", { config: { terminalWindowsShell: shell } })
			.catch(() => toast.error(t("settings.terminal.shellFailed")));
	};

	const parsedFontSize = parseInteger(fontSizeDraft);
	const fontSizeInvalid = parsedFontSize === null || !isTerminalFontSize(parsedFontSize);
	const commitFontSize = () => {
		if (parsedFontSize === null || !isTerminalFontSize(parsedFontSize)) return;
		if (parsedFontSize === terminalFontSize) return;
		update({ terminalFontSize: parsedFontSize });
	};

	const parsedScrollbackLines = parseInteger(scrollbackLinesDraft);
	const scrollbackLinesInvalid =
		parsedScrollbackLines === null || !isTerminalScrollbackLines(parsedScrollbackLines);
	const commitScrollbackLines = () => {
		if (parsedScrollbackLines === null || !isTerminalScrollbackLines(parsedScrollbackLines)) return;
		if (parsedScrollbackLines === terminalScrollbackLines) return;
		update({ terminalScrollbackLines: parsedScrollbackLines });
	};

	const commitShellPath = () => {
		const trimmed = shellPathDraft.trim();
		if (trimmed === terminalShellPath) return;
		update({ terminalShellPath: trimmed });
	};

	const commitShellArgs = () => {
		const trimmed = shellArgsDraft.trim();
		const args = trimmed ? trimmed.split(/\s+/) : [];
		if (!isTerminalShellArgs(args)) return;
		if (
			args.length === terminalShellArgs.length &&
			args.every((arg, index) => arg === terminalShellArgs[index])
		) {
			return;
		}
		update({ terminalShellArgs: args });
	};

	const scrollbackValue =
		SCROLLBACK_OPTIONS.find((option) => Number(option.id) === replayKb)?.id ?? null;

	return (
		<SettingsPageContainer testId="settings-terminal">
			<SettingsGroup title={t("settings.terminal.appearanceGroup")}>
				<SettingsRow
					label={t("settings.terminal.fontSize")}
					description={
						<>
							{t("settings.terminal.fontSizeDescription")}
							{fontSizeInvalid ? (
								<span
									id="terminal-font-size-error"
									data-testid="terminal-font-size-error"
									className="block text-feedback-error tr-text-metadata"
								>
									{t("settings.terminal.invalidRange", {
										min: TERMINAL_FONT_SIZE.min,
										max: TERMINAL_FONT_SIZE.max,
									})}
								</span>
							) : null}
						</>
					}
					control={
						<input
							type="number"
							min={TERMINAL_FONT_SIZE.min}
							max={TERMINAL_FONT_SIZE.max}
							step={1}
							inputMode="numeric"
							value={fontSizeDraft}
							aria-label={t("settings.terminal.fontSize")}
							aria-invalid={fontSizeInvalid}
							aria-describedby={fontSizeInvalid ? "terminal-font-size-error" : undefined}
							data-testid="terminal-font-size-input"
							data-settings-draft-input
							onChange={(event) => setFontSizeDraft(event.currentTarget.value)}
							onBlur={commitFontSize}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitFontSize();
								} else if (event.key === "Escape") {
									setFontSizeDraft(String(terminalFontSize));
								}
							}}
							className="h-32 w-80 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-feedback-error"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.terminal.cursorStyle")}
					control={
						<SegmentedControl<TerminalCursorStyle>
							name="terminal-cursor-style"
							label={t("settings.terminal.cursorStyle")}
							options={[
								{
									id: "block",
									label: t("settings.terminal.cursorStyle.block"),
									testId: "terminal-cursor-style-block",
								},
								{
									id: "underline",
									label: t("settings.terminal.cursorStyle.underline"),
									testId: "terminal-cursor-style-underline",
								},
								{
									id: "bar",
									label: t("settings.terminal.cursorStyle.bar"),
									testId: "terminal-cursor-style-bar",
								},
							]}
							value={terminalCursorStyle}
							onSelect={(next) => {
								if (next !== terminalCursorStyle) update({ terminalCursorStyle: next });
							}}
							testId="terminal-cursor-style-control"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.terminal.cursorBlink")}
					description={t("settings.terminal.cursorBlinkDescription")}
					control={
						<SettingsSwitch
							checked={terminalCursorBlink}
							label={t("settings.terminal.cursorBlink")}
							testId="terminal-cursor-blink-switch"
							onChange={(next) => update({ terminalCursorBlink: next })}
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.terminal.scrollbackGroup")}>
				<SettingsRow
					label={t("settings.terminal.scrollbackLines")}
					description={
						<>
							{t("settings.terminal.scrollbackLinesDescription")}
							{scrollbackLinesInvalid ? (
								<span
									id="terminal-scrollback-lines-error"
									data-testid="terminal-scrollback-lines-error"
									className="block text-feedback-error tr-text-metadata"
								>
									{t("settings.terminal.invalidRange", {
										min: TERMINAL_SCROLLBACK_LINES.min,
										max: TERMINAL_SCROLLBACK_LINES.max,
									})}
								</span>
							) : null}
						</>
					}
					control={
						<input
							type="number"
							min={TERMINAL_SCROLLBACK_LINES.min}
							max={TERMINAL_SCROLLBACK_LINES.max}
							step={500}
							inputMode="numeric"
							value={scrollbackLinesDraft}
							aria-label={t("settings.terminal.scrollbackLines")}
							aria-invalid={scrollbackLinesInvalid}
							aria-describedby={
								scrollbackLinesInvalid ? "terminal-scrollback-lines-error" : undefined
							}
							data-testid="terminal-scrollback-lines-input"
							data-settings-draft-input
							onChange={(event) => setScrollbackLinesDraft(event.currentTarget.value)}
							onBlur={commitScrollbackLines}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitScrollbackLines();
								} else if (event.key === "Escape") {
									setScrollbackLinesDraft(String(terminalScrollbackLines));
								}
							}}
							className="h-32 w-112 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-feedback-error"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.terminal.scrollback.title")}
					description={t("settings.terminal.scrollback.description")}
					control={
						<SegmentedControl
							name="terminal-scrollback"
							label={t("settings.terminal.scrollback.label")}
							options={SCROLLBACK_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
							value={scrollbackValue}
							onSelect={(id) => select(Number(id))}
							testId="terminal-scrollback-control"
						/>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={t("settings.terminal.shellGroup")}>
				<SettingsRow
					label={t("settings.terminal.shellPath")}
					description={t("settings.terminal.shellPathDescription")}
					control={
						<input
							type="text"
							value={shellPathDraft}
							placeholder={t("settings.terminal.shellPathPlaceholder")}
							aria-label={t("settings.terminal.shellPath")}
							data-testid="terminal-shell-path-input"
							data-settings-draft-input
							onChange={(event) => setShellPathDraft(event.currentTarget.value)}
							onBlur={commitShellPath}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitShellPath();
								} else if (event.key === "Escape") {
									setShellPathDraft(terminalShellPath);
								}
							}}
							className="h-32 w-192 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
					}
				/>
				<SettingsRow
					label={t("settings.terminal.shellArgs")}
					description={t("settings.terminal.shellArgsDescription")}
					control={
						<input
							type="text"
							value={shellArgsDraft}
							placeholder={t("settings.terminal.shellArgsPlaceholder")}
							aria-label={t("settings.terminal.shellArgs")}
							data-testid="terminal-shell-args-input"
							data-settings-draft-input
							onChange={(event) => setShellArgsDraft(event.currentTarget.value)}
							onBlur={commitShellArgs}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitShellArgs();
								} else if (event.key === "Escape") {
									setShellArgsDraft(terminalShellArgs.join(" "));
								}
							}}
							className="h-32 w-192 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary"
						/>
					}
				/>
			</SettingsGroup>

			<WindowsShellSettings
				platform={hostPlatform}
				protocolVersion={protocolVersion}
				value={windowsShell}
				onSelect={selectWindowsShell}
			/>
		</SettingsPageContainer>
	);
}
