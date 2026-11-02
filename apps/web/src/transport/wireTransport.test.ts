import { expect, test } from "bun:test";
import {
	CHANGE_MUTATIONS_PROTOCOL_VERSION,
	USER_THEMES_PROTOCOL_VERSION,
} from "@realthing/contracts";
import { supportsChangeMutations, supportsUserThemes } from "./wireTransport";

test("user theme files are read only from a host at or beyond their capability version", () => {
	expect(supportsUserThemes(USER_THEMES_PROTOCOL_VERSION)).toBe(true);
	expect(supportsUserThemes(USER_THEMES_PROTOCOL_VERSION - 1)).toBe(false);
	expect(supportsUserThemes(null)).toBe(false);
});

test("change mutations are offered only by a host at or beyond their capability version", () => {
	expect(supportsChangeMutations(CHANGE_MUTATIONS_PROTOCOL_VERSION)).toBe(true);
	expect(supportsChangeMutations(CHANGE_MUTATIONS_PROTOCOL_VERSION + 1)).toBe(true);
	expect(supportsChangeMutations(CHANGE_MUTATIONS_PROTOCOL_VERSION - 1)).toBe(false);
	expect(supportsChangeMutations(null)).toBe(false);
});
