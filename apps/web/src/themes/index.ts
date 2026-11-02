export { initializeThemes } from "./bundled";
export {
	applyTheme,
	applyThemePreference,
	clearUserThemes,
	deriveSystemThemePair,
	getThemes,
	getUserThemeIssues,
	installUserThemes,
	onSystemAppearanceChange,
	onThemesChange,
	readSystemAppearance,
	readThemeHint,
	resolveTheme,
	resolveThemePreference,
	type ThemeDescriptor,
	type ThemePreference,
	type ThemeResolution,
	type UserThemeIssue,
	writeThemeHint,
} from "./runtime";
export type { ThemeManifest } from "./schema";
export {
	resolveRealthingShikiTheme,
	REALTHING_SHIKI_THEME,
	REALTHING_SHIKI_THEME_NAME,
} from "./shiki";
