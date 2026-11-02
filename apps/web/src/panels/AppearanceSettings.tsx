import {
	RiArrowRightLine as ArrowRight,
	RiCheckLine as Check,
	RiArrowDownSLine as ChevronDown,
	RiArrowRightSLine as ChevronRight,
	RiComputerLine as Device,
	RiPaletteLine as Palette,
} from "@remixicon/react";
import {
	type AppConfigUpdate,
	type ExplorerFileIconsMode,
	type SystemThemePair,
	THEME_SYSTEM_PROTOCOL_VERSION,
	type ThemeId,
} from "@realthing/contracts";
import type { MessageKey } from "@realthing/locales";
import { type Translator, useT } from "@realthing/locales/react";
import { Button } from "@realthing/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@realthing/ui/dropdown-menu";
import { cn } from "@realthing/ui/utils";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { copyText } from "@/lib";
import { toast, useAppStore } from "@/store";
import {
	deriveSystemThemePair,
	getThemes,
	getUserThemeIssues,
	onSystemAppearanceChange,
	onThemesChange,
	readSystemAppearance,
	resolveTheme,
	resolveThemePreference,
	type ThemeDescriptor,
	type ThemeResolution,
} from "@/themes";
import { errorText, getTransport } from "@/transport";
import { CustomThemesGroup } from "./CustomThemesSettings";
import { LineWidthControl } from "./LineWidthSettings";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { SettingsGroup, SettingsPageContainer } from "./SettingsGroup";
import { SettingsNotice } from "./SettingsNotice";
import { SETTINGS_ROWS_CONTAINER, SettingsRow } from "./SettingsRow";

type Appearance = ThemeDescriptor["appearance"];
type Contrast = ThemeDescriptor["contrast"];
type ThemeModeOption = "system" | Appearance;

const BUNDLED_THEME_LABELS: Readonly<Record<string, MessageKey>> = {
	dark: "settings.appearance.themeName.dark",
	light: "settings.appearance.themeName.light",
	"high-contrast-dark": "settings.appearance.themeName.highContrastDark",
	"high-contrast-light": "settings.appearance.themeName.highContrastLight",
	"minimal-dark": "settings.appearance.themeName.minimalDark",
	"minimal-light": "settings.appearance.themeName.minimalLight",
};

function themeLabel(t: Translator, theme: Pick<ThemeDescriptor, "id" | "label">): string {
	const key = Object.hasOwn(BUNDLED_THEME_LABELS, theme.id)
		? BUNDLED_THEME_LABELS[theme.id]
		: undefined;
	return key ? t(key) : theme.label;
}

function familyKey(id: ThemeId): string {
	return id.replace(/(^|-)(light|dark)$/, "").replace(/^high-contrast-?/, "");
}

function counterpart(
	themes: readonly ThemeDescriptor[],
	from: ThemeDescriptor,
	appearance: Appearance,
	contrast: Contrast,
): ThemeDescriptor | null {
	const candidates = themes.filter(
		(theme) => theme.appearance === appearance && theme.contrast === contrast,
	);
	const family = familyKey(from.id);
	return (
		candidates.find((theme) => familyKey(theme.id) === family) ??
		candidates.find((theme) => familyKey(theme.id) === "") ??
		candidates[0] ??
		null
	);
}

function appearanceTarget(
	themes: readonly ThemeDescriptor[],
	from: ThemeDescriptor,
	appearance: Appearance,
): ThemeDescriptor | null {
	if (from.appearance === appearance) return from;
	return (
		counterpart(themes, from, appearance, from.contrast) ??
		themes.find((theme) => theme.appearance === appearance) ??
		null
	);
}

function ThemeDropdown({
	appearance,
	themes,
	resolution,
	disabled,
	onSelect,
}: {
	appearance: Appearance;
	themes: readonly ThemeDescriptor[];
	resolution: ThemeResolution;
	disabled: boolean;
	onSelect: (id: ThemeId) => void;
}) {
	const t = useT();
	const label =
		appearance === "light"
			? t("settings.appearance.lightThemeTrigger", { theme: themeLabel(t, resolution.theme) })
			: t("settings.appearance.darkThemeTrigger", { theme: themeLabel(t, resolution.theme) });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="l"
					iconRight={ChevronDown}
					disabled={disabled}
					aria-label={label}
					data-testid={`system-theme-${appearance}-trigger`}
				>
					<span className="truncate">{themeLabel(t, resolution.theme)}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
				<DropdownMenuRadioGroup value={resolution.theme.id} onValueChange={onSelect}>
					{themes.map((theme) => (
						<DropdownMenuRadioItem
							key={theme.id}
							value={theme.id}
							data-testid={`system-theme-${appearance}-option-${theme.id}`}
						>
							{theme.id === resolution.theme.id ? (
								<Check className="size-14 text-primary" />
							) : (
								<span className="size-14" />
							)}
							<span>{themeLabel(t, theme)}</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ThemeList({
	themes,
	activeId,
	disabled,
	onSelect,
}: {
	themes: readonly ThemeDescriptor[];
	activeId: ThemeId;
	disabled: boolean;
	onSelect: (id: ThemeId) => void;
}) {
	const t = useT();
	return (
		<div className="flex flex-col gap-4">
			{themes.map(({ id, label, appearance, contrast }) => {
				const active = id === activeId;
				return (
					<button
						key={id}
						type="button"
						disabled={disabled}
						aria-pressed={active}
						data-testid={`theme-option-${id}`}
						data-theme-id={id}
						data-appearance={appearance}
						data-contrast={contrast}
						data-active={active}
						onClick={() => onSelect(id)}
						className={cn(
							"flex items-center gap-8 rounded-sm border px-12 py-8 text-left tr-text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
							"disabled:pointer-events-none disabled:border-control-disabled-border disabled:text-control-disabled-text",
							active
								? "border-primary-muted bg-clip-padding bg-primary-subtle text-text-default"
								: "border-border-default text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
						)}
					>
						<span className="flex-1">{themeLabel(t, { id, label })}</span>
						{active ? <Check className="size-16 shrink-0 text-primary" /> : null}
					</button>
				);
			})}
		</div>
	);
}

function Disclosure({
	label,
	summary,
	expanded,
	testId,
	onToggle,
	children,
}: {
	label: string;
	summary: string;
	expanded: boolean;
	testId: string;
	onToggle: () => void;
	children: ReactNode;
}) {
	const Chevron = expanded ? ChevronDown : ChevronRight;
	return (
		<div className="flex flex-col border-border-muted border-b">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				data-testid={testId}
				className="flex w-full items-center gap-8 py-12 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
			>
				<span className="flex-1 tr-text-ui text-text-default">{label}</span>
				<span className="truncate tr-text-metadata text-text-muted">{summary}</span>
				<Chevron className="size-20 shrink-0 text-text-muted" aria-hidden="true" />
			</button>
			{expanded ? children : null}
		</div>
	);
}

function FontFamilyInput({
	value,
	label,
	placeholder,
	testId,
	disabled,
	onCommit,
}: {
	value: string;
	label: string;
	placeholder: string;
	testId: string;
	disabled: boolean;
	onCommit: (next: string) => void;
}) {
	const t = useT();
	const [draft, setDraft] = useState(value);
	useEffect(() => {
		setDraft(value);
	}, [value]);

	const commit = () => {
		const trimmed = draft.trim();
		if (trimmed === value) return;
		onCommit(trimmed);
	};

	return (
		<div className="flex items-center gap-8">
			<input
				type="text"
				value={draft}
				placeholder={placeholder}
				aria-label={label}
				disabled={disabled}
				data-testid={testId}
				data-settings-draft-input
				onChange={(event) => setDraft(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
					} else if (event.key === "Escape") {
						setDraft(value);
					}
				}}
				className="h-32 w-192 rounded-sm border border-control-border-default bg-control-bg px-8 tr-text-ui text-text-default outline-none focus:border-control-border-active focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
			/>
			{draft.trim() !== value ? (
				<Button variant="outline" size="l" disabled={disabled} onClick={commit}>
					{t("common.done")}
				</Button>
			) : null}
		</div>
	);
}

export function TypographyAndIconsGroup({
	uiFontFamily,
	codeFontFamily,
	explorerFileIcons,
	disabled = false,
	onUpdate,
}: {
	uiFontFamily: string;
	codeFontFamily: string;
	explorerFileIcons: ExplorerFileIconsMode;
	disabled?: boolean;
	onUpdate: (config: AppConfigUpdate) => void;
}) {
	const t = useT();
	return (
		<SettingsGroup title={t("settings.appearance.typographyGroup")}>
			<SettingsRow
				label={t("settings.appearance.uiFontFamily")}
				description={t("settings.appearance.uiFontFamilyDescription")}
				control={
					<FontFamilyInput
						value={uiFontFamily}
						label={t("settings.appearance.uiFontFamily")}
						placeholder={t("settings.appearance.uiFontFamilyPlaceholder")}
						testId="ui-font-family-input"
						disabled={disabled}
						onCommit={(next) => onUpdate({ uiFontFamily: next })}
					/>
				}
			/>
			<SettingsRow
				label={t("settings.appearance.codeFontFamily")}
				description={t("settings.appearance.codeFontFamilyDescription")}
				control={
					<FontFamilyInput
						value={codeFontFamily}
						label={t("settings.appearance.codeFontFamily")}
						placeholder={t("settings.appearance.codeFontFamilyPlaceholder")}
						testId="code-font-family-input"
						disabled={disabled}
						onCommit={(next) => onUpdate({ codeFontFamily: next })}
					/>
				}
			/>
			<SettingsRow
				label={t("settings.appearance.fileIcons")}
				description={t("settings.appearance.fileIconsDescription")}
				control={
					<SegmentedControl<ExplorerFileIconsMode>
						name="explorer-file-icons"
						label={t("settings.appearance.fileIcons")}
						options={[
							{
								id: "filetype",
								label: t("settings.appearance.fileIcons.filetype"),
								testId: "explorer-file-icons-filetype",
							},
							{
								id: "minimal",
								label: t("settings.appearance.fileIcons.minimal"),
								testId: "explorer-file-icons-minimal",
							},
						]}
						value={explorerFileIcons}
						disabled={disabled}
						onSelect={(next) => {
							if (next !== explorerFileIcons) onUpdate({ explorerFileIcons: next });
						}}
						testId="explorer-file-icons-control"
					/>
				}
			/>
		</SettingsGroup>
	);
}

export function AppearanceSettings() {
	const t = useT();
	const protocolVersion = useAppStore((state) => state.protocolVersion);
	const theme = useAppStore((state) => state.theme);
	const themeMode = useAppStore((state) => state.themeMode);
	const systemThemePair = useAppStore((state) => state.systemThemePair);
	const uiFontFamily = useAppStore((state) => state.uiFontFamily);
	const codeFontFamily = useAppStore((state) => state.codeFontFamily);
	const explorerFileIcons = useAppStore((state) => state.explorerFileIcons);
	const [pending, setPending] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const systemAppearance = useSyncExternalStore(
		onSystemAppearanceChange,
		readSystemAppearance,
		readSystemAppearance,
	);
	const themes = useSyncExternalStore(onThemesChange, getThemes, getThemes);
	const userThemeIssues = useSyncExternalStore(
		onThemesChange,
		getUserThemeIssues,
		getUserThemeIssues,
	);
	const userThemes = useAppStore((state) => state.userThemes);
	const appVersion = useAppStore((state) => state.hostAppVersion);

	const systemSupported = (protocolVersion ?? 0) >= THEME_SYSTEM_PROTOCOL_VERSION;
	const activeTheme = resolveTheme(theme);
	const fixedResolution = resolveThemePreference({ theme, themeMode: "fixed" });
	const pair = systemThemePair ?? deriveSystemThemePair(theme);
	const preference = { theme, themeMode: "system" as const, systemThemePair: pair };
	const currentResolution = resolveThemePreference(preference, systemAppearance);
	const lightResolution = resolveThemePreference(preference, "light");
	const darkResolution = resolveThemePreference(preference, "dark");
	const systemMode = systemSupported && themeMode === "system";
	const effectiveMode: ThemeModeOption = systemMode ? "system" : activeTheme.appearance;
	const currentContrast = (systemMode ? currentResolution.theme : activeTheme).contrast;

	const modeTarget = (appearance: Appearance): ThemeDescriptor | null =>
		systemMode
			? (appearance === "light" ? lightResolution : darkResolution).theme
			: appearanceTarget(themes, activeTheme, appearance);

	const contrastTargets = (contrast: Contrast) =>
		systemMode
			? {
					light: counterpart(themes, lightResolution.theme, "light", contrast),
					dark: counterpart(themes, darkResolution.theme, "dark", contrast),
				}
			: { fixed: counterpart(themes, activeTheme, activeTheme.appearance, contrast) };

	const contrastAvailable = (contrast: Contrast) =>
		Object.values(contrastTargets(contrast)).some((target) => target !== null);

	const modeOptions: SegmentedControlOption<ThemeModeOption>[] = [
		...(systemSupported
			? [
					{
						id: "system" as const,
						label: t("settings.appearance.mode.system"),
						testId: "theme-mode-system",
					},
				]
			: []),
		{
			id: "light",
			label: t("settings.appearance.mode.light"),
			testId: "theme-mode-light",
			disabled: !modeTarget("light"),
		},
		{
			id: "dark",
			label: t("settings.appearance.mode.dark"),
			testId: "theme-mode-dark",
			disabled: !modeTarget("dark"),
		},
	];

	const contrastOptions: SegmentedControlOption<Contrast>[] = [
		{
			id: "normal",
			label: t("common.default"),
			testId: "contrast-default",
			disabled: !contrastAvailable("normal"),
		},
		{
			id: "high",
			label: t("settings.appearance.contrast.high"),
			testId: "contrast-high",
			disabled: !contrastAvailable("high"),
		},
	];

	const update = (config: AppConfigUpdate) => {
		if (pending) return;
		setPending(true);
		getTransport()
			.request("settings.update", { config })
			.catch((err: unknown) => toast.error(errorText(err), t("settings.appearance.changeFailed")))
			.finally(() => setPending(false));
	};

	const selectMode = (mode: ThemeModeOption) => {
		if (mode === effectiveMode) return;
		if (mode === "system") {
			update({ themeMode: "system", systemThemePair: pair });
			return;
		}
		const target = modeTarget(mode);
		if (target) update({ theme: target.id, themeMode: "fixed" });
	};

	const selectFixed = (id: ThemeId) => {
		if (id === theme) return;
		update({ theme: id, themeMode: "fixed" });
	};

	const selectSystem = (appearance: Appearance, id: ThemeId) => {
		const next: SystemThemePair = { ...pair, [appearance]: id };
		if (next.light === pair.light && next.dark === pair.dark) return;
		update({ systemThemePair: next });
	};

	const selectContrast = (contrast: Contrast) => {
		if (contrast === currentContrast) return;
		const targets = contrastTargets(contrast);
		if ("fixed" in targets) {
			if (targets.fixed) update({ theme: targets.fixed.id, themeMode: "fixed" });
			return;
		}
		const next: SystemThemePair = {
			light: targets.light?.id ?? pair.light,
			dark: targets.dark?.id ?? pair.dark,
		};
		if (next.light !== pair.light || next.dark !== pair.dark) update({ systemThemePair: next });
	};

	const copyThemesFolder = async (folder: string) => {
		if (await copyText(folder)) toast.success(t("settings.language.folderCopied"));
	};

	const revealThemesFolder = () => {
		getTransport()
			.request("themes.reveal", {})
			.catch((error) => toast.error(errorText(error, t("settings.language.openFolderFailed"))));
	};

	const fallbacks = systemMode
		? [
				{ appearance: "light", resolution: lightResolution },
				{ appearance: "dark", resolution: darkResolution },
			].filter(({ resolution }) => resolution.fallback)
		: fixedResolution.fallback
			? [{ appearance: null, resolution: fixedResolution }]
			: [];

	return (
		<SettingsPageContainer testId="settings-appearance">
			<SettingsGroup title={t("settings.appearance.themeGroup")}>
				<SettingsRow
					label={t("settings.appearance.themeMode")}
					control={
						<SegmentedControl
							name="theme-mode"
							label={t("settings.appearance.themeMode")}
							options={modeOptions}
							value={effectiveMode}
							disabled={pending}
							onSelect={selectMode}
							testId="theme-mode-control"
						/>
					}
				/>
				{fallbacks.length > 0 ? (
					<div className="flex flex-col gap-4 border-border-muted border-b py-12">
						{fallbacks.map(({ appearance, resolution }) => (
							<SettingsNotice
								key={appearance ?? "fixed"}
								variant="warning"
								testId="theme-fallback-warning"
							>
								{appearance === "light"
									? t("settings.appearance.fallback.light", {
											theme: themeLabel(t, resolution.theme),
										})
									: appearance === "dark"
										? t("settings.appearance.fallback.dark", {
												theme: themeLabel(t, resolution.theme),
											})
										: t("settings.appearance.fallback.fixed", {
												theme: themeLabel(t, resolution.theme),
											})}
							</SettingsNotice>
						))}
					</div>
				) : null}
				{systemMode ? (
					<SettingsRow
						label={t("settings.appearance.currentOnDevice")}
						testId="system-theme-current"
						control={
							<span className="flex items-center gap-4 tr-text-ui text-text-default">
								<Device className="size-14 shrink-0 text-text-muted" />
								{systemAppearance === "light"
									? t("settings.appearance.mode.light")
									: t("settings.appearance.mode.dark")}
								<ArrowRight className="size-14 shrink-0 text-text-muted" />
								<Palette className="size-14 shrink-0 text-text-muted" />
								{themeLabel(t, currentResolution.theme)}
							</span>
						}
					/>
				) : null}
				{systemMode ? (
					<Disclosure
						label={t("settings.appearance.themePair")}
						summary={`${themeLabel(t, lightResolution.theme)} / ${themeLabel(t, darkResolution.theme)}`}
						expanded={expanded}
						testId="theme-pair-toggle"
						onToggle={() => setExpanded((value) => !value)}
					>
						<div className={cn(SETTINGS_ROWS_CONTAINER, "pb-12")}>
							<SettingsRow
								label={t("settings.appearance.lightTheme")}
								control={
									<ThemeDropdown
										appearance="light"
										themes={themes.filter((candidate) => candidate.appearance === "light")}
										resolution={lightResolution}
										disabled={pending}
										onSelect={(id) => selectSystem("light", id)}
									/>
								}
							/>
							<SettingsRow
								label={t("settings.appearance.darkTheme")}
								control={
									<ThemeDropdown
										appearance="dark"
										themes={themes.filter((candidate) => candidate.appearance === "dark")}
										resolution={darkResolution}
										disabled={pending}
										onSelect={(id) => selectSystem("dark", id)}
									/>
								}
							/>
						</div>
					</Disclosure>
				) : (
					<Disclosure
						label={t("settings.appearance.theme")}
						summary={themeLabel(t, activeTheme)}
						expanded={expanded}
						testId="theme-toggle"
						onToggle={() => setExpanded((value) => !value)}
					>
						<div className="pb-12">
							<ThemeList
								themes={themes}
								activeId={activeTheme.id}
								disabled={pending}
								onSelect={selectFixed}
							/>
						</div>
					</Disclosure>
				)}
				<SettingsRow
					label={t("settings.appearance.contrastLevel")}
					control={
						<SegmentedControl
							name="contrast-level"
							label={t("settings.appearance.contrastLevel")}
							options={contrastOptions}
							value={currentContrast}
							disabled={pending}
							onSelect={selectContrast}
							testId="contrast-level-control"
						/>
					}
				/>
			</SettingsGroup>
			<CustomThemesGroup
				snapshot={userThemes}
				issues={userThemeIssues}
				appVersion={appVersion}
				onCopyFolder={(folder) => void copyThemesFolder(folder)}
				onRevealFolder={revealThemesFolder}
			/>
			<TypographyAndIconsGroup
				uiFontFamily={uiFontFamily}
				codeFontFamily={codeFontFamily}
				explorerFileIcons={explorerFileIcons}
				disabled={pending}
				onUpdate={update}
			/>
			<SettingsGroup title={t("settings.appearance.editorGroup")}>
				<LineWidthControl kind="file" />
			</SettingsGroup>
		</SettingsPageContainer>
	);
}
