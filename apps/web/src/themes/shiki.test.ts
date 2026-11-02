import { expect, test } from "bun:test";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { cssColorToHex } from "@/lib";
import { SYNTAX_VARIABLES } from "./runtime";
import {
	resolveRealthingShikiTheme,
	REALTHING_MONACO_COLOR_VARIABLES,
	REALTHING_SHIKI_THEME,
	REALTHING_SHIKI_THEME_NAME,
} from "./shiki";

test("the TextMate map references exactly the semantic syntax variables", () => {
	const referenced = new Set<string>();
	for (const entry of REALTHING_SHIKI_THEME.settings ?? []) {
		for (const color of [entry.settings?.foreground, entry.settings?.background]) {
			for (const match of (color ?? "").matchAll(/var\((--[a-z-]+)\)/g)) {
				if (match[1]) referenced.add(match[1]);
			}
		}
	}
	const expected = new Set<string>([...Object.values(SYNTAX_VARIABLES), "--container-content-bg"]);
	expect(referenced).toEqual(expected);
});

test("the Monaco theme resolves every semantic syntax variable to hex", () => {
	const variables = new Set<string>();
	for (const entry of REALTHING_SHIKI_THEME.settings ?? []) {
		for (const color of [entry.settings?.foreground, entry.settings?.background]) {
			for (const match of (color ?? "").matchAll(/var\((--[a-z-]+)\)/g)) {
				if (match[1]) variables.add(match[1]);
			}
		}
	}
	for (const variable of Object.values(REALTHING_MONACO_COLOR_VARIABLES)) variables.add(variable);
	const palette = new Map(
		[...variables].map((variable, index) => [
			variable,
			`#${(index + 1).toString(16).padStart(6, "0")}`,
		]),
	);
	const theme = resolveRealthingShikiTheme({
		name: "resolved",
		type: "dark",
		readVariable: (name) => palette.get(name) ?? "",
		toHex: cssColorToHex,
	});
	const resolved = JSON.stringify(theme);
	for (const variable of Object.values(SYNTAX_VARIABLES)) {
		const color = palette.get(variable);
		if (!color) throw new Error(`Missing test color for ${variable}`);
		expect(resolved).toContain(color);
	}
	expect(resolved).not.toContain("var(--code-");
});

test("a missing Monaco theme variable falls back to Shiki's base palette", async () => {
	const theme = resolveRealthingShikiTheme({
		name: "resolved-with-gap",
		type: "dark",
		readVariable: (name) => (name === "--code-foreground" ? "" : "#123456"),
		toHex: cssColorToHex,
	});
	const highlighter = await createHighlighterCore({
		themes: [theme],
		langs: [],
		engine: createJavaScriptRegexEngine(),
	});
	const resolved = highlighter.getTheme("resolved-with-gap");
	expect(resolved.fg).toMatch(/^#[0-9a-f]{6}$/i);
	expect(resolved.fg).not.toBe("");
	highlighter.dispose();
});

test("highlighted output carries CSS variables only, never a baked palette color", async () => {
	const highlighter = await createHighlighterCore({
		themes: [REALTHING_SHIKI_THEME],
		langs: [import("@shikijs/langs/typescript")],
		engine: createJavaScriptRegexEngine(),
	});
	const html = highlighter.codeToHtml('const message = "hello"', {
		lang: "typescript",
		theme: REALTHING_SHIKI_THEME_NAME,
	});
	expect(html).toContain("var(--code-");
	expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
	expect(html).not.toContain("--shiki-");
	highlighter.dispose();
});
