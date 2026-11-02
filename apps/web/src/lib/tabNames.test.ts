import { afterEach, expect, test } from "bun:test";
import { applyLocale, currentTranslator } from "@realthing/locales/react";
import {
	changesTabName,
	defaultTerminalIndex,
	defaultTerminalTitle,
	diffTabName,
	planDocumentName,
	terminalName,
} from "./tabNames";

afterEach(() => applyLocale("en", {}));

const GERMAN = {
	"store.terminal.defaultTitle": "Konsole {{index}}",
	"changes.tab.name": "Änderungen",
	"changes.tab.nameScoped": "Änderungen · {{suffix}}",
	"changes.scope.uncommittedSuffix": "nicht festgeschrieben",
	"workbench.tool.plan": "Aufgabenliste",
};

test("default names translate at render; a custom terminal title shows verbatim", () => {
	applyLocale("de", { de: GERMAN });
	const t = currentTranslator();
	expect(terminalName(t, defaultTerminalTitle(3))).toBe("Konsole 3");
	expect(terminalName(t, "dev server")).toBe("dev server");
	expect(planDocumentName(t)).toBe("Aufgabenliste");
});

test("terminal defaults are a language-neutral pattern that numbering reads back", () => {
	expect(defaultTerminalTitle(2)).toBe("Terminal 2");
	expect(defaultTerminalIndex("Terminal 12")).toBe(12);
	expect(defaultTerminalIndex("Terminal")).toBeNull();
	expect(defaultTerminalIndex("My Terminal 2")).toBeNull();
});

test("Changes and diff tab names tag every non-default scope in the current language", () => {
	const en = currentTranslator();
	expect(changesTabName(en, { kind: "branch" })).toBe("Changes");
	expect(changesTabName(en, { kind: "uncommitted" })).toBe("Changes · uncommitted");
	expect(changesTabName(en, { kind: "commit", sha: "abc1234567" })).toBe("Changes · abc1234");
	expect(diffTabName(en, { kind: "branch" }, "src/a.ts")).toBe("a.ts");
	expect(diffTabName(en, { kind: "uncommitted" }, "src/a.ts")).toBe("a.ts · uncommitted");
	expect(diffTabName(en, { kind: "pinned", baseRef: "abc1234567" }, "src/a.ts")).toBe(
		"a.ts · abc1234",
	);

	applyLocale("de", { de: GERMAN });
	const de = currentTranslator();
	expect(changesTabName(de, { kind: "uncommitted" })).toBe("Änderungen · nicht festgeschrieben");
	expect(diffTabName(de, { kind: "uncommitted" }, "src/a.ts")).toBe("a.ts · nicht festgeschrieben");
});
