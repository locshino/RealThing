import { expect, test } from "bun:test";
import {
	CHANGE_MUTATIONS_PROTOCOL_VERSION,
	LAYOUT_PLAN_PRESET_PROTOCOL_VERSION,
	LOCALES_PROTOCOL_VERSION,
	PROJECT_RENAME_PROTOCOL_VERSION,
	PROTOCOL_VERSION,
	RESOURCE_META_PROTOCOL_VERSION,
	THEME_SYSTEM_PROTOCOL_VERSION,
	USER_THEMES_PROTOCOL_VERSION,
	WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION,
	WS_METHODS,
} from "./wsProtocol";

test("system theme settings advance the protocol", () => {
	expect(THEME_SYSTEM_PROTOCOL_VERSION).toBe(58);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(THEME_SYSTEM_PROTOCOL_VERSION);
});

test("Windows shell settings advance the protocol", () => {
	expect(WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION).toBe(62);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION);
});

test("change mutations, resource meta, project rename, locales, themes, and plan layout preset are pinned", () => {
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(CHANGE_MUTATIONS_PROTOCOL_VERSION);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RESOURCE_META_PROTOCOL_VERSION);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(PROJECT_RENAME_PROTOCOL_VERSION);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(LOCALES_PROTOCOL_VERSION);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(USER_THEMES_PROTOCOL_VERSION);
	expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(LAYOUT_PLAN_PRESET_PROTOCOL_VERSION);
});

test("repository cloning and cancellation are registered", () => {
	expect(WS_METHODS.projectClone).toBe("project.clone");
	expect(WS_METHODS.projectCancelClone).toBe("project.cancelClone");
	expect(WS_METHODS.projectCloneDestination).toBe("project.cloneDestination");
	expect(WS_METHODS.projectSuggestPaths).toBe("project.suggestPaths");
});
