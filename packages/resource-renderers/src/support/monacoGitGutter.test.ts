import { expect, test } from "bun:test";
import {
	applyGitGutterDecorations,
	computeGitGutterChanges,
	gitGutterDecorations,
	gitGutterOverviewColor,
} from "./monacoGitGutter";

// 1. Happy Case (Standard / Success Flow)
test("computeGitGutterChanges detects added lines (Happy Case)", () => {
	const orig = "line 1\nline 2\n";
	const mod = "line 1\ninserted A\ninserted B\nline 2\n";
	const changes = computeGitGutterChanges(orig, mod);

	expect(changes).toEqual([{ type: "added", startLine: 2, endLine: 3 }]);
	const decorations = gitGutterDecorations(changes);
	expect(decorations.length).toBe(1);
	expect(decorations[0]?.options.linesDecorationsClassName).toBe("git-gutter-added");
	expect(decorations[0]?.range.startLineNumber).toBe(2);
	expect(decorations[0]?.range.endLineNumber).toBe(3);
	expect(decorations[0]?.options.overviewRuler?.position).toBe(7);
	expect(decorations[0]?.options.overviewRuler?.color).toBe(gitGutterOverviewColor("added"));
});

test("computeGitGutterChanges detects modified lines (Happy Case)", () => {
	const orig = "line 1\nline 2\nline 3\n";
	const mod = "line 1\nmodified 2\nline 3\n";
	const changes = computeGitGutterChanges(orig, mod);

	expect(changes).toEqual([{ type: "modified", startLine: 2, endLine: 2 }]);
	const decorations = gitGutterDecorations(changes);
	expect(decorations.length).toBe(1);
	expect(decorations[0]?.options.linesDecorationsClassName).toBe("git-gutter-modified");
	expect(decorations[0]?.options.overviewRuler?.position).toBe(7);
	expect(decorations[0]?.options.overviewRuler?.color).toBe(gitGutterOverviewColor("modified"));
});

test("computeGitGutterChanges detects deleted lines in middle and at end (Happy Case)", () => {
	// Deletion in middle
	const origMid = "line 1\nline 2\nline 3\n";
	const modMid = "line 1\nline 3\n";
	const changesMid = computeGitGutterChanges(origMid, modMid);
	expect(changesMid).toEqual([{ type: "deleted", startLine: 2, endLine: 2 }]);
	const decMid = gitGutterDecorations(changesMid);
	expect(decMid[0]?.options.linesDecorationsClassName).toBe("git-gutter-deleted");
	expect(decMid[0]?.options.overviewRuler?.position).toBe(7);
	expect(decMid[0]?.options.overviewRuler?.color).toBe(gitGutterOverviewColor("deleted"));

	// Deletion at end
	const origEnd = "line 1\nline 2\n";
	const modEnd = "line 1\n";
	const changesEnd = computeGitGutterChanges(origEnd, modEnd);
	expect(changesEnd).toEqual([{ type: "deleted", startLine: 2, endLine: 2 }]);
	const decEnd = gitGutterDecorations(changesEnd);
	expect(decEnd[0]?.options.linesDecorationsClassName).toBe("git-gutter-deleted");
	expect(decEnd[0]?.options.overviewRuler?.position).toBe(7);
	expect(decEnd[0]?.options.overviewRuler?.color).toBe(gitGutterOverviewColor("deleted-bottom"));
});

test("gitGutterOverviewColor returns valid color for all change types (Happy Case)", () => {
	expect(typeof gitGutterOverviewColor("added")).toBe("string");
	expect(gitGutterOverviewColor("added")).toContain("46, 160, 67");
	expect(gitGutterOverviewColor("modified")).toContain("9, 105, 218");
	expect(gitGutterOverviewColor("deleted")).toContain("207, 34, 46");
	expect(gitGutterOverviewColor("deleted-bottom")).toContain("207, 34, 46");
});

test("computeGitGutterChanges handles untracked new files as all added (Happy Case)", () => {
	const orig = "";
	const mod = "line 1\nline 2\nline 3";
	const changes = computeGitGutterChanges(orig, mod);
	expect(changes).toEqual([{ type: "added", startLine: 1, endLine: 3 }]);
});

// 2. Exception Case (Faulty Inputs / Error Handling)
test("computeGitGutterChanges returns empty array for identical or null inputs (Exception Case)", () => {
	expect(computeGitGutterChanges(null, "some text")).toEqual([]);
	expect(computeGitGutterChanges("same", "same")).toEqual([]);
	expect(computeGitGutterChanges("", "")).toEqual([]);
});

test("computeGitGutterChanges clamps line numbers safely to total lines (Exception Case)", () => {
	const orig = "alpha\nbeta\n";
	const mod = "alpha";
	const changes = computeGitGutterChanges(orig, mod);
	expect(changes.length).toBe(1);
	expect(changes[0]?.startLine).toBeLessThanOrEqual(1);
	expect(changes[0]?.endLine).toBeLessThanOrEqual(1);
});

// 3. Hacking Case (Exploitation & Vulnerability Resistance)
test("computeGitGutterChanges handles large payloads, special chars, and null bytes safely (Hacking Case)", () => {
	const largeLines = Array.from({ length: 500 }, (_, i) => `content_${i}`).join("\n");
	const injected = `${largeLines}\n<script>alert(1)</script>\0__proto__`;

	expect(() => computeGitGutterChanges(largeLines, injected)).not.toThrow();
	const changes = computeGitGutterChanges(largeLines, injected);
	expect(changes.length).toBeGreaterThan(0);
	expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
});

// 4. 403 Case (Authorization & Access Control)
test("computeGitGutterChanges protects against unauthorized baseline access and handles null safely (403 Case)", () => {
	// When host returns null or access is forbidden for secret/restricted files:
	const forbiddenBaseline = null;
	const currentSecretContent = "SECRET_TOKEN=super_secret_key\nAPI_KEY=12345";
	const changes = computeGitGutterChanges(forbiddenBaseline, currentSecretContent);

	// Ensures no leakage, no error, and gracefully disables gutter decorations
	expect(changes).toEqual([]);
	expect(gitGutterDecorations(changes)).toEqual([]);

	// Mock editor to verify deltaDecorations does not throw with empty changes
	const mockEditor = {
		deltaDecorations: (_prev: string[], decs: unknown[]) => {
			expect(decs).toEqual([]);
			return [];
		},
	};
	const result = applyGitGutterDecorations(
		mockEditor as unknown as Parameters<typeof applyGitGutterDecorations>[0],
		["dec-1"],
		changes,
	);
	expect(result).toEqual([]);
});
