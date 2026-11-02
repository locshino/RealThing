import { expect, test } from "bun:test";
import type { FileNode } from "@realthing/contracts";
import { sortFileNodes } from "./FileTree";

function node(name: string, kind: "dir" | "file", extra: Partial<FileNode> = {}): FileNode {
	return { name, kind, path: name, ...extra };
}

// 1. Happy Case: Standard sorting (directories first A-Z, then files A-Z)
test("sortFileNodes sorts directories before files, each alphabetically (Happy Case)", () => {
	const input: FileNode[] = [
		node("src", "dir"),
		node("package.json", "file"),
		node(".husky", "dir"),
		node(".env", "file"),
		node("eslint", "dir"),
		node("README.md", "file"),
		node(".agents", "dir"),
		node("public", "dir"),
		node("dist", "dir", { gitignored: true }),
		node("node_modules", "dir", { gitignored: true }),
	];

	const sorted = sortFileNodes(input);
	expect(sorted.map((n) => `${n.kind}:${n.name}`)).toEqual([
		"dir:.agents",
		"dir:.husky",
		"dir:dist",
		"dir:eslint",
		"dir:node_modules",
		"dir:public",
		"dir:src",
		"file:.env",
		"file:package.json",
		"file:README.md",
	]);
});

// 2. Exception Case: Empty arrays, single-item arrays, duplicates, and edge cases
test("sortFileNodes handles empty, single-item, and duplicate lists gracefully (Exception Case)", () => {
	expect(sortFileNodes([])).toEqual([]);

	const single = [node("index.ts", "file")];
	expect(sortFileNodes(single)).toEqual(single);

	const duplicates: FileNode[] = [
		node("sample.txt", "file", { path: "a/sample.txt" }),
		node("sample.txt", "file", { path: "b/sample.txt" }),
	];
	const sortedDuplicates = sortFileNodes(duplicates);
	expect(sortedDuplicates.length).toBe(2);
	expect(sortedDuplicates[0]?.name).toBe("sample.txt");
});

// 3. Hacking Case: Path traversal characters, null bytes, XSS payloads, and prototype pollution keys
test("sortFileNodes safely processes path traversal and injection payloads (Hacking Case)", () => {
	const maliciousNodes: FileNode[] = [
		node("__proto__", "dir"),
		node("constructor", "file"),
		node("../../../etc/passwd", "file"),
		node("<script>alert('xss')</script>", "dir"),
		node("file\0nullbyte.txt", "file"),
	];

	expect(() => sortFileNodes(maliciousNodes)).not.toThrow();
	const sorted = sortFileNodes(maliciousNodes);

	// Dirs first, files second
	expect(sorted.filter((n) => n.kind === "dir").length).toBe(2);
	expect(sorted.filter((n) => n.kind === "file").length).toBe(3);

	// Prototype properties are untouched
	expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
});

// 4. 403 / Access Control Case: Restricted, secret, and gitignored nodes maintain consistent structure
test("sortFileNodes consistently sorts restricted, gitignored, and secret entries without elevation (403 Case)", () => {
	const mixedNodes: FileNode[] = [
		node(".env.production.local", "file", { gitignored: true }),
		node(".ssh", "dir", { gitignored: true }),
		node("public_key.pub", "file"),
		node("restricted_vault", "dir"),
	];

	const sorted = sortFileNodes(mixedNodes);

	// Restricted/gitignored directories remain in standard directory order, never elevated or dropped
	expect(sorted.map((n) => `${n.kind}:${n.name}`)).toEqual([
		"dir:.ssh",
		"dir:restricted_vault",
		"file:.env.production.local",
		"file:public_key.pub",
	]);
});

test("sortFileNodes sorts mixed order alphabetically regardless of kind", () => {
	const input: FileNode[] = [
		node("src", "dir"),
		node("alpha.ts", "file"),
		node("beta", "dir"),
		node("zeta.md", "file"),
	];

	const sorted = sortFileNodes(input, "mixed");
	expect(sorted.map((n) => `${n.kind}:${n.name}`)).toEqual([
		"file:alpha.ts",
		"dir:beta",
		"dir:src",
		"file:zeta.md",
	]);
});

test("sortFileNodes sorts filesFirst with files before directories", () => {
	const input: FileNode[] = [
		node("src", "dir"),
		node("zebra.ts", "file"),
		node("alpha", "dir"),
		node("app.ts", "file"),
	];

	const sorted = sortFileNodes(input, "filesFirst");
	expect(sorted.map((n) => `${n.kind}:${n.name}`)).toEqual([
		"file:app.ts",
		"file:zebra.ts",
		"dir:alpha",
		"dir:src",
	]);
});

test("sortFileNodes sorts type with directories first, then by lowercase extension, then by name", () => {
	const input: FileNode[] = [
		node("src", "dir"),
		node("b.ts", "file"),
		node("a.ts", "file"),
		node("styles.css", "file"),
		node("README.MD", "file"),
		node(".env", "file"),
		node("Makefile", "file"),
		node("apps", "dir"),
	];

	const sorted = sortFileNodes(input, "type");
	expect(sorted.map((n) => `${n.kind}:${n.name}`)).toEqual([
		"dir:apps",
		"dir:src",
		"file:.env",
		"file:Makefile",
		"file:styles.css",
		"file:README.MD",
		"file:a.ts",
		"file:b.ts",
	]);
});
